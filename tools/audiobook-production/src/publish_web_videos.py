"""Make the web copies of the produced videos and record them for the video app.

A video of 25 MB or more is re-encoded to fit Cloudflare Pages' 25 MiB file limit; the rest are
copied as they are. Each copy is named after its content hash, so a new production never overwrites a
published file. The video's subtitles go to the book's video/timings and the file to video/media.json.

usage: python3 -I src/publish_web_videos.py [episode IDs ...]   (all produced videos when omitted)
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOOK = Path(os.environ.get("MEMOIR_CONTENT_ROOT", ROOT / "../../content/books/bae-byunghee")).resolve()
LIMIT = 25_000_000
ENCODE = ["-map", "0:v:0", "-map", "0:a:0", "-c:v", "libx264", "-preset", "slow", "-tune", "stillimage",
          "-crf", "26", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level:v", "4.0",
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"]


def digest(path):
    hash = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            hash.update(chunk)
    return hash.hexdigest()


def duration(path):
    probe = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]
    return round(float(subprocess.run(probe, capture_output=True, text=True, check=True).stdout), 3)


def web_copy(source, folder):
    """The copy to publish: the produced file itself when it fits, re-encoded when it does not."""
    part = folder / f"{source.stem}.part.mp4"
    if source.stat().st_size >= LIMIT:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(source), *ENCODE, str(part)], check=True)
    else:
        shutil.copyfile(source, part)
    if part.stat().st_size >= LIMIT:
        part.unlink()
        raise SystemExit(f"{source.name}: still 25 MB or more after re-encoding")
    sha256 = digest(part)
    target = folder / f"{source.stem}.{sha256[:10]}.mp4"
    part.replace(target)
    return {"file": target.name, "bytes": target.stat().st_size, "sha256": sha256, "duration": duration(target)}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("episodes", nargs="*")
    parser.add_argument("--videos", type=Path, default=ROOT / "output/video", help="The produced MP4 and SRT files.")
    parser.add_argument("--out", type=Path, default=ROOT / "output/video-web", help="Where the web copies go.")
    args = parser.parse_args()
    episodes = args.episodes or sorted(path.stem for path in args.videos.glob("*.mp4"))
    manifest_path = BOOK / "video/media.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    args.out.mkdir(parents=True, exist_ok=True)
    (BOOK / "video/timings").mkdir(parents=True, exist_ok=True)
    videos = dict(manifest["videos"])
    for episode in episodes:
        source, subtitles = args.videos / f"{episode}.mp4", args.videos / f"{episode}.srt"
        if not source.is_file() or not subtitles.is_file():
            raise SystemExit(f"{episode}: {source.name} and {subtitles.name} are both required")
        videos[episode] = web_copy(source, args.out)
        shutil.copyfile(subtitles, BOOK / "video/timings" / subtitles.name)
        print(f"{episode}: {videos[episode]['file']} ({videos[episode]['bytes'] / 1e6:.1f} MB)")
    manifest_path.write_text(json.dumps({**manifest, "videos": videos}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
