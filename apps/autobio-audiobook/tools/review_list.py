"""받아쓰기 검수에 걸린 줄을 영상 속 시각과 함께 보여 준다.

usage: python3 -I review_list.py [회차ID ...]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def srt_start(eid, text):
    """그 줄의 첫 문장이 영상(0.9배) 자막에 처음 나오는 시각(mm:ss)."""
    srt = ROOT / "out" / "video" / f"{eid}.srt"
    if not srt.exists():
        return "--:--"
    head = text.split(".")[0][:12]
    for block in srt.read_text(encoding="utf-8").split("\n\n"):
        rows = block.split("\n")
        if len(rows) >= 3 and head[:8] in " ".join(rows[2:]):
            h, m, s = rows[1].split(" --> ")[0].split(":")
            return f"{int(h) * 60 + int(m)}:{s[:2]}"
    return "--:--"


def main():
    eids = sys.argv[1:] or sorted(p.name for p in (ROOT / "clips").iterdir())
    count = 0
    for eid in eids:
        report = ROOT / "clips" / eid / "report.json"
        script = ROOT / "scripts" / f"{eid}.json"
        if not report.exists() or not script.exists():
            continue
        lines = json.loads(script.read_text(encoding="utf-8"))
        for k, v in sorted(json.loads(report.read_text()).items(), key=lambda kv: int(kv[0])):
            if v["ok"]:
                continue
            count += 1
            show = lines[int(k)]["show"]
            print(f"{eid} {srt_start(eid, show):>6}  줄 {k:>3}  일치 {v['ratio']:.3f}  {' '.join(v['diffs'])}")
    print(f"총 {count}줄")


if __name__ == "__main__":
    main()
