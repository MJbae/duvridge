"""원고(배병희_자서전.md)에서 회차별 낭독 대본(JSON)을 만든다.

usage: python3 -I script_build.py <원고.md> <삽화.json> <회차ID>... --out <dir>
각 줄: {"kind": title|dateline|para|break, "show": 화면 표기, "say": 발음 표기, "image": 삽화 ID}
"""
import argparse
import json
import re
import sys
from pathlib import Path

DIGITS = "영일이삼사오육칠팔구"
SMALL = [(1000, "천"), (100, "백"), (10, "십")]
BIG = [(10**8, "억"), (10**4, "만")]
BOOK_TITLE = "내 논을 파는 한이 있어도"
BOOK_SUBTITLE = "배병희 자전소설"
UNITS = r"(년대|년|월|부|화|억|만|천|원|남|녀|평|가구|세|대|호|번지|리|킬로|미터|퍼센트|%|마력|정보|도|일|볼트|톤|인|조|여)"
MONTHS = {6: "유월", 10: "시월"}
NATIVE = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열"]
NATIVE_UNITS = r"(개)"          # 고유어 수로 읽는 단위: 5개 → 다섯 개
FIXED = {"6·25": "육이오"}


def sino_under_10000(n):
    out = ""
    for value, name in SMALL:
        q, n = divmod(n, value)
        if q:
            out += ("" if q == 1 else DIGITS[q]) + name
    return out + (DIGITS[n] if n else "")


def sino(n):
    if n == 0:
        return "영"
    out = ""
    for value, name in BIG:
        q, n = divmod(n, value)
        if q:
            out += ("" if q == 1 and name == "만" else sino_under_10000(q)) + name
    return out + sino_under_10000(n)


def speak_numbers(text):
    """숫자+단위를 한자어 수사로 읽는다. 바뀐 곳은 stderr 로 알린다."""
    def fraction(m):
        said = f"{sino(int(m.group(1)))}분의 {sino(int(m.group(2)))}"
        print(f"  [발음] {m.group(0)} → {said}", file=sys.stderr)
        return said

    for written, said in FIXED.items():
        if written in text:
            print(f"  [발음] {written} → {said}", file=sys.stderr)
            text = text.replace(written, said)

    def native(m):
        said = f"{NATIVE[int(m.group(1))]} {m.group(2)}"
        print(f"  [발음] {m.group(0)} → {said}", file=sys.stderr)
        return said

    text = re.sub(r"(?<!\d)([1-9]|10)\s*" + NATIVE_UNITS, native, text)

    # '5분의 1만' 의 '만'은 단위가 아니라 '오직'이다. 분수를 먼저 읽어 둔다
    text = re.sub(r"(\d+)분의\s*(\d+)", fraction, text)

    def repl(m):
        num = int(m.group(1).replace(",", ""))
        unit = m.group(2)
        lead = "" if num == 1 and unit in ("천", "만", "억") else sino(num)   # 1만 → 만, 1천 → 천
        said = lead + ("퍼센트" if unit == "%" else unit)
        if unit == "월" and num in MONTHS:
            said = MONTHS[num]
        print(f"  [발음] {m.group(0)} → {said}", file=sys.stderr)
        return said
    return re.sub(r"(\d[\d,]*)\s*" + UNITS, repl, text)


HANJA = r"[\u4e00-\u9fff]"


def drop_hanja(text):
    """'자염(煮鹽)' → '자염'. 풀이가 붙어 있으면 풀이만 읽는다: '일진월보(日進月步, 날마다…)' → '일진월보, 날마다…,'"""
    def repl(m):
        inner = m.group(1)
        if not re.search(HANJA, inner):
            return m.group(0)
        rest = re.sub(HANJA + r"+\s*,?\s*", "", inner).strip()
        said = f", {rest}," if rest else ""
        print(f"  [발음] {m.group(0)} → {said or '(생략)'}", file=sys.stderr)
        return said
    return re.sub(r"\(([^)]*)\)", repl, text)


def speak(text):
    text = drop_hanja(text)
    for written, said in FIXED.items():   # '6·25'는 가운뎃점을 쉼표로 바꾸기 전에 읽어 둔다
        text = text.replace(written, said)
    text = re.sub(r"\s*·\s*", ", ", text)
    return speak_numbers(text)


def parse_episodes(md):
    """{id: {"title", "part", "lines"}} 순서 보존."""
    episodes, part, current = {}, None, None
    for line in md.splitlines():
        if m := re.match(r"^# (.+)$", line):
            part, current = m.group(1).strip(), None
            continue
        if m := re.match(r"^## (.+?)\s*\{#([\w-]+)\}\s*$", line):
            current = m.group(2)
            episodes[current] = {"title": m.group(1).strip(), "part": part, "lines": []}
            part = None  # 부 제목은 그 부의 첫 회차에서만 읽는다
            continue
        if current:
            episodes[current]["lines"].append(line)
    return episodes


def episode_label(eid, title):
    """(회차 표시, 제목, 낭독) — 회차와 제목을 화면·소리 모두에서 끊어 준다."""
    if m := re.match(r"ep(\d+)$", eid):
        n = int(m.group(1))
        return f"{n}화", title, f"제{sino(n)}화. {speak(title)}."
    label, _, name = title.partition(". ")
    return label, name, f"{label}. {speak(name)}."


def build(eid, ep, images):
    starts = {im["episodeId"]: im["id"] for im in images if im["position"].get("start")}
    before = {im["position"]["beforeParagraph"].strip(): im["id"]
              for im in images if im["episodeId"] == eid and "beforeParagraph" in im["position"]}
    image = starts.get(eid)
    out = []
    if eid == "prolog":
        out.append({"kind": "cover", "label": BOOK_SUBTITLE, "show": BOOK_TITLE,
                    "say": f"{BOOK_TITLE}. {BOOK_SUBTITLE}.", "image": "cover"})
    # 부(1부·2부…)는 화면·낭독 모두 생략하고 회차로 바로 시작한다
    label, title, say = episode_label(eid, ep["title"])
    out.append({"kind": "title", "label": label, "show": title, "say": say, "image": image})
    paragraphs = re.split(r"\n\s*\n", "\n".join(ep["lines"]).strip())
    for p in paragraphs:
        p = " ".join(p.split())
        if not p:
            continue
        if p in ("* * *", "***"):
            out.append({"kind": "break", "show": "", "say": "", "image": image})
            continue
        if m := re.fullmatch(r"\*(.+)\*", p):
            out.append({"kind": "dateline", "show": m.group(1), "say": speak(m.group(1)) + ".", "image": image})
            continue
        image = before.get(p, image)
        out.append({"kind": "para", "show": p, "say": speak(p), "image": image})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manuscript")
    ap.add_argument("illustrations")
    ap.add_argument("episodes", nargs="+")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    eps = parse_episodes(Path(a.manuscript).read_text(encoding="utf-8"))
    images = json.loads(Path(a.illustrations).read_text(encoding="utf-8"))["images"]
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for eid in a.episodes:
        if eid not in eps:
            sys.exit(f"회차 없음: {eid}")
        print(f"[{eid}] {eps[eid]['title']}", file=sys.stderr)
        lines = build(eid, eps[eid], images)
        (out / f"{eid}.json").write_text(json.dumps(lines, ensure_ascii=False, indent=1), encoding="utf-8")
        chars = sum(len(x["say"]) for x in lines)
        print(f"  줄 {len(lines)}개, 낭독 {chars}자", file=sys.stderr)


if __name__ == "__main__":
    main()
