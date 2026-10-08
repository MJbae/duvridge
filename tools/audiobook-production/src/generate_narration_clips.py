"""낭독 대본(JSON)의 각 줄을 ElevenLabs로 생성하고 받아쓰기(STT)로 검수한다.

usage: python3 -I generate_narration_clips.py narration-scripts/ep01.json [--only 3,5] [--force] [--no-stt]
- 같은 문장·목소리·모델·시드면 다시 만들지 않는다(narration-clips/<회차>/ 캐시).
- 검수 결과는 narration-clips/<회차>/report.json 에 남긴다.
"""
import argparse
import difflib
import hashlib
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_narration_script import speak_numbers  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ELEVEN = Path(os.environ.get("ELEVENLABS_SCRIPT", Path.home() / ".claude-work/skills/showreel/scripts/eleven.py")).expanduser().resolve()
ENV_FILE = Path(os.environ.get("ELEVENLABS_ENV_FILE", ROOT / ".env")).expanduser().resolve()
VOICE = "nw7o9nqXCkQKoAs59z99"   # Rei - Deep, Rich, Drama
MODEL = "eleven_v4"
SEED = 1936
PASS_RATIO = 0.985
MUST_HEAR = ("배병희",)   # 들려야 하는 고유명사. 하나라도 틀리면 실패


def api_env():
    env = dict(os.environ)
    if "ELEVENLABS_API_KEY" not in env and ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if line.strip().startswith("ELEVENLABS_API_KEY="):
                env["ELEVENLABS_API_KEY"] = line.split("=", 1)[1].strip().strip("\"'")
    if "ELEVENLABS_API_KEY" not in env:
        sys.exit("ELEVENLABS_API_KEY 를 설정하거나 ELEVENLABS_ENV_FILE 로 키 파일을 지정하세요")
    return env


def clip_path(eid, idx, say):
    h = hashlib.sha1(f"{VOICE}|{MODEL}|{SEED}|{say}".encode()).hexdigest()[:10]
    return ROOT / "narration-clips" / eid / f"{idx:03d}_{h}.mp3"


def run_eleven(args, env):
    r = subprocess.run([sys.executable, "-I", str(ELEVEN), *args], capture_output=True, text=True, env=env)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[-500:])
    return r.stdout.strip()


def merge_vowels(text):
    """ㅔ/ㅐ, ㅖ/ㅒ 는 소리가 같아 받아쓰기가 섞어 쓴다. 비교할 때만 하나로 맞춘다."""
    out = []
    for ch in text:
        code = ord(ch) - 0xAC00
        if 0 <= code < 11172:
            lead, rest = divmod(code, 588)
            vowel, tail = divmod(rest, 28)
            vowel = {5: 1, 7: 3}.get(vowel, vowel)
            ch = chr(0xAC00 + lead * 588 + vowel * 28 + tail)
        out.append(ch)
    return "".join(out)


# 받아쓰기가 늘 잘못 적는 말. 사용자가 실제 녹음을 듣고 맞다고 확인한 것만 넣는다.
# 2026-10-08 사용자 결정: "배병희" 뒤에 어떤 조사가 붙어도(는·를·가·의·에게…) 받아쓰기 오인식으로 보고 통과시킨다.
# 받아쓰기는 이름 끝소리를 조사에 붙여 적는다(배병희는 → 배병인은, 배병희를 → 베병일을). 그래서 이름을 기호 하나로 바꾸고
# 바로 뒤 조사는 받침 유무 짝(은/는, 을/를, 이/가, 과/와)을 하나로 맞춰 비교한다.
NAME = "\u2605"   # ★
NAME_HEARD = r"[배베]병(?:희|히|이|의|인|일|흰|힐)?"
PARTICLE_PAIRS = {"은": "는", "을": "를", "이": "가", "과": "와"}
HEARD_AS = [(r"6\s*[.·]\s*25", "육이오")]   # 표기 차이: 받아쓰기는 육이오를 숫자로 적는다


def mask_name(text):
    text = re.sub(NAME_HEARD, NAME, text)
    return re.sub(NAME + r"\s*([은을이과])", lambda m: NAME + PARTICLE_PAIRS[m.group(1)], text)


def normalize(text):
    for pattern, fixed in HEARD_AS:
        text = re.sub(pattern, fixed, text)
    text = mask_name(speak_numbers_quiet(text))
    return merge_vowels(re.sub(r"[^가-힣0-9a-zA-Z" + NAME + "]", "", text))


def speak_numbers_quiet(text):
    devnull = open(os.devnull, "w")
    old, sys.stderr = sys.stderr, devnull
    try:
        return speak_numbers(text)
    finally:
        sys.stderr = old
        devnull.close()


def check(idx, line, path, env):
    heard = run_eleven(["stt", str(path)], env).splitlines()[-1]
    ratio = difflib.SequenceMatcher(None, normalize(line["say"]), normalize(heard)).ratio()
    diffs = [f"{a!r}→{b!r}" for op, a, b in diff_words(line["say"], heard) if op != "equal"]
    names_ok = all(normalize(heard).count(normalize(n)) >= normalize(line["say"]).count(normalize(n)) for n in MUST_HEAR)
    ok = ratio >= PASS_RATIO and names_ok
    return {"idx": idx, "ratio": round(ratio, 3), "ok": ok, "heard": heard, "diffs": diffs[:8]}


def diff_words(said, heard):
    a, b = said.split(), heard.split()
    sm = difflib.SequenceMatcher(None, [normalize(w) for w in a], [normalize(w) for w in b])
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        yield op, " ".join(a[i1:i2]), " ".join(b[j1:j2])


def generate(idx, line, eid, env, force, seed=SEED):
    path = clip_path(eid, idx, line["say"])
    if path.exists() and not force:
        return path, False
    path.parent.mkdir(parents=True, exist_ok=True)
    for old in path.parent.glob(f"{idx:03d}_*.mp3"):
        if not old.name.endswith(".best.mp3"):
            old.unlink()
    run_eleven(["tts", line["say"], str(path), "--voice", VOICE, "--model", MODEL, "--seed", str(seed)], env)
    return path, True


def retake(idx, line, eid, env, best, retakes):
    """검수에 걸린 줄을 다른 시드로 다시 만들어 가장 잘 맞는 테이크를 남긴다."""
    path = clip_path(eid, idx, line["say"])
    keep = path.with_suffix(".best.mp3")
    path.replace(keep)
    for k in range(1, retakes + 1):
        generate(idx, line, eid, env, True, SEED + k)
        result = check(idx, line, path, env)
        if result["ratio"] > best["ratio"]:
            best = {**result, "seed": SEED + k}
            path.replace(keep)
        if best["ok"]:
            break
    keep.replace(path)
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("script")
    ap.add_argument("--only", help="줄 번호 목록, 예: 3,5")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-stt", action="store_true")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--retakes", type=int, default=0, help="검수 실패 시 다시 만들 횟수(사용자 결정 2026-10-08: 0번, 사람이 듣고 판단)")
    ap.add_argument("--recheck", action="store_true", help="이미 검수한 캐시 녹음도 다시 받아쓰기")
    ap.add_argument("--approve", help="사람이 들어 보고 괜찮다고 한 줄 번호, 예: 2,3")
    a = ap.parse_args()
    eid = Path(a.script).stem
    lines = json.loads(Path(a.script).read_text(encoding="utf-8"))
    only = {int(x) for x in a.only.split(",")} if a.only else None
    env = api_env()
    todo = [(i, ln) for i, ln in enumerate(lines) if ln["say"] and (only is None or i in only)]

    report_path = ROOT / "narration-clips" / eid / "report.json"
    report = json.loads(report_path.read_text()) if report_path.exists() else {}
    if a.approve:
        for k in a.approve.split(","):
            if k in report:
                report[k] = {**report[k], "ok": True, "approved": "사람이 들어 보고 확인"}
                print(f"✓ {int(k):03d} 사람 확인으로 통과 처리")

    def work(item):
        i, ln = item
        path, made = generate(i, ln, eid, env, a.force)
        prev = report.get(str(i))
        if not made and prev and prev.get("file") == path.name and not a.recheck:
            return i, path, made, prev   # 같은 녹음은 다시 받아쓰기하지 않는다(사람 확인 기록 유지)
        result = None if a.no_stt else {**check(i, ln, path, env), "seed": SEED}
        if result and not result["ok"] and made and a.retakes:
            result = retake(i, ln, eid, env, result, a.retakes)
        return i, path, made, result

    with ThreadPoolExecutor(a.workers) as pool:
        for i, path, made, result in pool.map(work, todo):
            mark = "생성" if made else "캐시"
            if result:
                report[str(i)] = {**result, "file": path.name}
                flag = "✓" if result["ok"] else "✗"
                mark += "·사람 확인" if result.get("approved") else ""
                print(f"{flag} {i:03d} {mark} 일치 {result['ratio']:.3f} {' '.join(result['diffs'])}")
            else:
                print(f"· {i:03d} {mark}")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    bad = [k for k, v in report.items() if not v["ok"]]
    print(f"[{eid}] 검수 실패 {len(bad)}줄: {', '.join(bad) if bad else '없음'}")


if __name__ == "__main__":
    main()
