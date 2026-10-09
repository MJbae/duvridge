"""녹음 클립을 이어 붙여 회차별 MP3·MP4·SRT 를 만든다.

속도를 둘로 나눠 만든다(사용자 결정, 2026-10-08).
- 웹 사이트용: 보통 배속(1.0) → output/<회차>.mp3 · .srt
- 통합 영상용: 0.9배속      → output/video/<회차>.mp4 · .srt

usage: python3 -I assemble_audiobook.py narration-scripts/ep01.json [--audio-tempo 1.0] [--video-tempo 0.9]
"""
import argparse
from functools import lru_cache
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import render_caption_frames  # noqa: E402
from generate_narration_clips import clip_path  # noqa: E402
from resolve_illustration_assets import resolve_illustration_asset  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SITE = Path(os.environ.get("MEMOIR_CONTENT_ROOT", ROOT.parents[1] / "content/books/bae-byunghee")).expanduser().resolve()
SR = 44100
LEAD = 4.0                  # 음성 전 음악만 나오는 시간
GAP = {"cover": 2.0, "part": 1.6, "title": 1.3, "dateline": 1.6, "para": 0.9}
BREAK = 2.2                 # * * * 장면 전환 쉼
TAIL, OUTRO, OUTRO_FADE = 1.5, 12.0, 4.0
MUSIC_UNDER_SPEECH_DB = -8  # 음악만 나올 때 음악 크기(낭독 크기 기준)


def decode(path, af=None):
    cmd = ["ffmpeg", "-v", "error", "-i", str(path)]
    if af:
        cmd += ["-af", af]
    cmd += ["-ac", "2", "-ar", str(SR), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def load_clip(path, tempo):
    trim = "silenceremove=start_periods=1:start_threshold=-45dB"
    af = f"{trim},areverse,{trim},areverse"
    if tempo != 1.0:
        af += f",atempo={tempo}"
    return decode(path, af)


def rms(x):
    return float(np.sqrt(np.mean(x ** 2))) if len(x) else 0.0


@lru_cache(maxsize=None)
def image_path(image_id):
    return resolve_illustration_asset(SITE, image_id)


def split_captions(text):
    """자막은 한 문장 단위. 문장이 화면 하나에 통째로 들어가게 배치한다."""
    return [render_caption_frames.caption_layout(s) for s in re.split(r"(?<=[.!?”])\s+", text) if s]


def build_timeline(lines, eid, tempo):
    """음성 배열과 화면 목록 [(t0, t1, image, mode, payload)] 을 만든다."""
    t = LEAD
    pieces, scenes, card = [], [], None
    for i, ln in enumerate(lines):
        if ln["kind"] == "break":
            scenes.append((t, t + BREAK, ln["image"], "plain", []))
            t += BREAK
            continue
        clip = load_clip(clip_path(eid, i, ln["say"]), tempo)
        dur = len(clip) / SR
        pieces.append((t, clip))
        end = t + dur + GAP[ln["kind"]]
        if ln["kind"] == "para":
            chunks = split_captions(ln["show"])
            weights = [sum(len(x) for x in c[1]) for c in chunks]
            c0 = t
            for c, w in zip(chunks, weights):
                c1 = c0 + dur * w / sum(weights)
                scenes.append((c0, c1, ln["image"], "caption", c))
                c0 = c1
            scenes[-1] = (*scenes[-1][:1], end, *scenes[-1][2:])
        else:
            # 표지·부·회차는 각자 새 화면. 시대·장소는 바로 앞 회차 화면에 덧붙인다.
            if ln["kind"] == "dateline" and card:
                card = {**card, "dateline": ln["show"]}
            else:
                card = {"kind": ln["kind"], "label": ln.get("label", ""), "title": ln["show"]}
            scenes.append((t, end, ln["image"], "card", tuple(sorted(card.items()))))
        t = end
    first = scenes[0]
    scenes.insert(0, (0.0, LEAD, first[2], first[3], first[4]))
    return pieces, scenes, t


def mix(pieces, speech_end, music_path):
    total = speech_end + TAIL + OUTRO
    out = np.zeros((int(total * SR) + 1, 2), np.float32)
    for t0, clip in pieces:
        i = int(t0 * SR)
        out[i:i + len(clip)] += clip
    speech = np.concatenate([c for _, c in pieces])
    music = decode(music_path)
    gain = rms(speech) / max(rms(music), 1e-6) * 10 ** (MUSIC_UNDER_SPEECH_DB / 20)

    def env(n, points):
        ts = np.arange(n) / SR
        return np.interp(ts, [p[0] for p in points], [p[1] for p in points]).astype(np.float32)[:, None]

    intro_len = int((LEAD + 5) * SR)
    intro = music[:intro_len] * gain
    out[:len(intro)] += intro * env(len(intro), [(0, 0), (0.8, 1), (LEAD - 0.5, 1), (LEAD + 5, 0)])
    o0 = int((speech_end + TAIL - 1.0) * SR)
    outro = music[: len(out) - o0] * gain
    out[o0:o0 + len(outro)] += outro * env(len(outro), [(0, 0), (1.5, 1), (OUTRO - OUTRO_FADE, 1), (OUTRO + 1, 0)])
    return out


def fmt_srt(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(scenes, path):
    rows, n = [], 0
    scenes = [(0.0, scenes[1][1], *scenes[1][2:])] + scenes[2:]   # 음악만 나오는 앞부분도 첫 화면 자막으로
    for t0, t1, _, mode, payload in scenes:
        if mode == "caption":
            text = "\n".join(payload[1]).replace("\u00a0", " ")
        elif mode == "card":
            c = dict(payload)
            parts = [c["title"], c["label"]] if c["kind"] == "cover" else [c["label"], c["title"], c.get("dateline", "")]
            text = "\n".join(x for x in parts if x)
        else:
            text = ""
        if text:
            n += 1
            rows.append(f"{n}\n{fmt_srt(t0)} --> {fmt_srt(t1)}\n{text}\n")
    path.write_text("\n".join(rows), encoding="utf-8")


def normalize(audio, work, name):
    """믹스를 -16 LUFS 로 맞춘 WAV 경로를 돌려준다."""
    work.mkdir(parents=True, exist_ok=True)
    wav = work / f"{name}_mix.wav"
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", "-", str(wav)],
                   input=pcm.tobytes(), check=True)
    norm = work / f"{name}_norm.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-af",
                    "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", str(SR), str(norm)], check=True)
    return norm


def full_scenes(scenes, total):
    """길이 0 화면을 빼고, 마지막 화면을 음악 끝까지 늘린다."""
    scenes = [s for s in scenes if s[1] > s[0]]
    return scenes[:-1] + [(scenes[-1][0], total, *scenes[-1][2:])]


def encode_audio(eid, audio, scenes, total, out):
    norm = normalize(audio, ROOT / "work" / eid, "audio")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(norm), "-c:a", "libmp3lame", "-b:a", "160k",
                    str(out / f"{eid}.mp3")], check=True)
    write_srt(full_scenes(scenes, total), out / f"{eid}.srt")


def encode_video(eid, audio, scenes, total, out):
    work = ROOT / "work" / eid
    (work / "frames").mkdir(parents=True, exist_ok=True)
    norm = normalize(audio, work, "video")
    scenes = full_scenes(scenes, total)
    rows = []
    for t0, t1, image, mode, payload in scenes:
        png = render_caption_frames.render(work / "frames", image_path(image), mode, payload)
        rows.append(f"file '{png}'\nduration {t1 - t0:.3f}")
    rows.append(f"file '{png}'")
    concat = work / "caption-frames.txt"
    concat.write_text("\n".join(rows))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-i", str(norm),
                    "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-tune", "stillimage", "-crf", "20",
                    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart",
                    str(out / f"{eid}.mp4")], check=True)
    write_srt(scenes, out / f"{eid}.srt")


def render(eid, lines, tempo, music):
    """한 가지 속도로 타임라인과 믹스를 만든다. (믹스, 화면 목록, 전체 길이)"""
    pieces, scenes, speech_end = build_timeline(lines, eid, tempo)
    audio = mix(pieces, speech_end, music)
    return audio, scenes, len(audio) / SR


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("--audio-tempo", type=float, default=1.0, help="웹 사이트용 MP3 속도")
    ap.add_argument("--video-tempo", type=float, default=0.9, help="통합 영상용 MP4 속도")
    a = ap.parse_args()
    eid = Path(a.script).stem
    lines = json.loads(Path(a.script).read_text(encoding="utf-8"))
    music = SITE / "public/music" / f"{eid}.mp3"
    out, video_out = ROOT / "output", ROOT / "output" / "video"
    video_out.mkdir(parents=True, exist_ok=True)

    audio, scenes, total = render(eid, lines, a.audio_tempo, music)
    encode_audio(eid, audio, scenes, total, out)
    print(f"[{eid}] {a.audio_tempo:g}배 {total / 60:.1f}분 → output/{eid}.mp3 · .srt (웹)")

    audio, scenes, total = render(eid, lines, a.video_tempo, music)
    encode_video(eid, audio, scenes, total, video_out)
    print(f"[{eid}] {a.video_tempo:g}배 {total / 60:.1f}분 → output/video/{eid}.mp4 · .srt (영상)")


if __name__ == "__main__":
    main()
