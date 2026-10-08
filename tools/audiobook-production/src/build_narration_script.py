"""원고(배병희_자서전.md)에서 회차별 낭독 대본(JSON)을 만든다.

usage: python3 -I build_narration_script.py <원고.md> <삽화.json> <회차ID>... --out <dir>
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
ILLUSTRATION_MARKER = re.compile(r"^ {0,3}<!--\s*illustration:\s*([a-z0-9][a-z0-9-]*)\s*-->\s*$")
FENCE_LINE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
HEADING_LINE = re.compile(r"^ {0,3}#{1,6}(?:[ \t]+|$)")
RULE_LINE = re.compile(r"^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$")
NON_PROSE = re.compile(r"^\s{0,3}<!--[\s\S]*-->$")


def parse_illustration_markers(body):
    """원고 표시의 문단 위치를 매번 계산한다. 저장된 문장·문단 번호는 쓰지 않는다."""
    lines = body.splitlines(keepends=True)
    markers, block, fence, paragraphs, offset = [], [], None, 0, 0

    def flush():
        nonlocal paragraphs
        text = "".join(block).strip()
        if text and not NON_PROSE.match(text):
            paragraphs += 1
        block.clear()

    for index, line in enumerate(lines):
        delimiter = FENCE_LINE.match(line)
        if delimiter:
            flush()
            token = delimiter.group(1)
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence):
                fence = None
        elif fence is None:
            normalized = line.rstrip("\r\n")
            marker = ILLUSTRATION_MARKER.fullmatch(normalized)
            if marker:
                image_id = marker.group(1)
                if (index and lines[index - 1].strip()) or (index + 1 < len(lines) and lines[index + 1].strip()):
                    raise ValueError(f"삽화 표시는 독립된 줄에 두고 앞뒤를 빈 줄로 구분하세요: {image_id}")
                flush()
                markers.append({"id": image_id, "offset": offset, "paragraphIndex": paragraphs, "start": paragraphs == 0})
            elif re.search(r"<!--\s*illustration:", line, re.I):
                raise ValueError("삽화 표시 형식은 <!-- illustration: ep01-01 -->입니다")
            elif HEADING_LINE.match(normalized) or RULE_LINE.fullmatch(normalized):
                flush()
            elif not line.strip():
                flush()
            else:
                block.append(line)
        # Match the reader's JavaScript string offsets, including astral characters.
        offset += len(line.encode("utf-16-le")) // 2
    flush()
    positions = set()
    for marker in markers:
        if marker["paragraphIndex"] >= paragraphs:
            raise ValueError(f"삽화 표시 뒤에는 본문 문단이 있어야 합니다: {marker['id']}")
        if marker["paragraphIndex"] in positions:
            raise ValueError(f"한 본문 문단 앞에는 삽화 표시를 하나만 두세요: {marker['id']}")
        positions.add(marker["paragraphIndex"])
    return markers


def strip_illustration_markers(markdown):
    """실제 표시만 제거한다. 코드 예제와 모든 본문 문장은 그대로 둔다."""
    output, fence, separator = [], None, False
    for line in markdown.splitlines(keepends=True):
        delimiter = FENCE_LINE.match(line)
        if delimiter:
            token = delimiter.group(1)
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence):
                fence = None
            separator = False
            output.append(line)
        elif fence is None and ILLUSTRATION_MARKER.fullmatch(line.rstrip("\r\n")):
            separator = True
        elif separator and not line.strip():
            separator = False
        else:
            separator = False
            output.append(line)
    return "".join(output)


def narration_blocks(markdown):
    """코드 예제는 낭독하지 않으며 표시 삭제로 새 대본 줄을 만들지 않는다."""
    lines, fence = [], None
    for line in strip_illustration_markers(markdown).splitlines(keepends=True):
        delimiter = FENCE_LINE.match(line)
        if delimiter:
            token = delimiter.group(1)
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence):
                fence = None
            lines.append("\n")
        elif fence is None:
            normalized = line.rstrip("\r\n")
            if HEADING_LINE.match(normalized):
                lines.append("\n")
            elif RULE_LINE.fullmatch(normalized):
                lines.extend(["\n", line, "\n"])
            else:
                lines.append(line)
    return [" ".join(block.split()) for block in re.split(r"\n\s*\n", "".join(lines).strip()) if block.strip()]


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
    episodes, part, current, fence = {}, None, None, None
    for line in md.splitlines():
        delimiter = FENCE_LINE.match(line)
        if delimiter:
            token = delimiter.group(1)
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence):
                fence = None
            if current:
                episodes[current]["lines"].append(line)
            continue
        if fence is not None:
            if current:
                episodes[current]["lines"].append(line)
            continue
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
    content = "\n".join(ep["lines"]).strip()
    dateline = re.match(r"^\*([^*\r\n]+)\*(?:\r?\n|$)", content)
    body = content[dateline.end():].strip() if dateline else content
    markers = parse_illustration_markers(body)
    by_id = {item["id"]: item for item in images}
    if len(by_id) != len(images):
        raise ValueError("삽화 ID가 중복되었습니다")
    expected = {item["id"] for item in images if item["episodeId"] == eid}
    seen = set()
    for marker in markers:
        item = by_id.get(marker["id"])
        if not item or item["episodeId"] != eid:
            raise ValueError(f"등록되지 않았거나 다른 회차의 삽화 표시입니다: {eid} → {marker['id']}")
        if marker["id"] in seen:
            raise ValueError(f"삽화 표시가 중복되었습니다: {marker['id']}")
        if not marker["id"].startswith(f"{eid}-"):
            raise ValueError(f"삽화 ID는 소유 회차의 접두어를 사용하세요: {marker['id']}")
        seen.add(marker["id"])
    if seen != expected:
        raise ValueError(f"모든 등록된 삽화 표시를 원고에 한 번씩 두세요: {eid}")
    if not markers:
        raise ValueError(f"원고에 등록된 삽화 표시를 두세요: {eid}")
    representatives = [item["id"] for item in images if item["episodeId"] == eid and item.get("representative") is True]
    if len(representatives) > 1 or (any("representative" in item for item in images) and len(representatives) != 1):
        raise ValueError(f"회차 대표 삽화는 하나만 지정하세요: {eid}")
    card_image = representatives[0] if representatives else markers[0]["id"]
    before = {marker["paragraphIndex"]: marker["id"] for marker in markers}
    out = []
    if eid == "prolog":
        out.append({"kind": "cover", "label": BOOK_SUBTITLE, "show": BOOK_TITLE,
                    "say": f"{BOOK_TITLE}. {BOOK_SUBTITLE}.", "image": "cover"})
    # 부(1부·2부…)는 화면·낭독 모두 생략하고 회차로 바로 시작한다
    label, title, say = episode_label(eid, ep["title"])
    out.append({"kind": "title", "label": label, "show": title, "say": say, "image": card_image})
    if dateline:
        text = dateline.group(1)
        out.append({"kind": "dateline", "show": text, "say": speak(text) + ".", "image": card_image})
    image = None  # Cover metadata must never select an unrelated early prose scene.
    paragraph_index = 0
    for p in narration_blocks(body):
        if RULE_LINE.fullmatch(p):
            out.append({"kind": "break", "show": "", "say": "", "image": image})
            continue
        if NON_PROSE.match(p):
            continue
        image = before.get(paragraph_index, image)
        out.append({"kind": "para", "show": p, "say": speak(p), "image": image})
        paragraph_index += 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manuscript")
    ap.add_argument("illustrations")
    ap.add_argument("episodes", nargs="+")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    eps = parse_episodes(Path(a.manuscript).read_text(encoding="utf-8"))
    manifest = json.loads(Path(a.illustrations).read_text(encoding="utf-8"))
    if manifest.get("version") != 2 or any("position" in item for item in manifest.get("images", [])):
        sys.exit("삽화 목록은 원고 표시로 위치를 관리하는 version: 2 형식을 사용하세요")
    images = manifest["images"]
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
