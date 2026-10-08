"""오디오북 화면 한 장(1920×1080 PNG)을 그린다. 어르신용: 큰 글씨, 진한 바탕, 두 줄까지."""
import hashlib
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
BOLD, MEDIUM = 6, 2
CAPTION_SIZE = 68
CAPTION_CHARS = 22          # 한 줄 최대 글자 수(68px 기준 여백 포함)
WARM = (245, 214, 150)


def font(size, index=BOLD):
    return ImageFont.truetype(FONT_PATH, size, index=index)


def cover_fit(path):
    if path is None:
        return Image.new("RGB", (W, H), (30, 34, 39))
    im = Image.open(path).convert("RGB")
    scale = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    left, top = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((left, top, left + W, top + H))


NUMERALS = {"한", "두", "세", "네", "십", "백", "천", "만", "수백", "수천", "수십"}


def words_kept_together(text):
    """'3억 원', '십 리'처럼 수와 단위가 줄 사이에서 갈라지지 않게 붙여 둔다(줄바꿈 금지 공백)."""
    words = []
    for w in text.split():
        prev = words[-1] if words else ""
        if prev and len(w) <= 2 and (any(c.isdigit() for c in prev) or prev in NUMERALS):
            words[-1] = f"{prev}\u00a0{w}"
        else:
            words.append(w)
    return words


def wrap(text, limit=CAPTION_CHARS):
    """어절 단위로 줄을 나눈다. 한 어절이 limit 보다 길면 그대로 한 줄로 둔다."""
    lines, cur = [], ""
    for word in words_kept_together(text):
        cand = f"{cur} {word}".strip()
        if len(cand) <= limit or not cur:
            cur = cand
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def _shade_bottom(im, top=600, strength=0.82):
    overlay = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(overlay)
    for y in range(top, H):
        d.line([(0, y), (W, y)], fill=int(255 * strength * ((y - top) / (H - top)) ** 0.7))
    black = Image.new("RGB", (W, H), (0, 0, 0))
    return Image.composite(black, im, overlay)


def _darken(im, amount):
    return Image.blend(im, Image.new("RGB", (W, H), (0, 0, 0)), amount)


def _centered(draw, y, text, fnt, fill):
    text = text.replace("\u00a0", " ")
    w = draw.textlength(text, font=fnt)
    draw.text(((W - w) / 2, y), text, font=fnt, fill=fill, stroke_width=3, stroke_fill=(0, 0, 0))


CAPTION_LAYOUTS = [(68, 22, 3), (60, 26, 4), (54, 29, 4)]   # (글자 크기, 한 줄 글자 수, 최대 줄 수)


def balanced_wrap(text, limit, max_lines):
    """줄 길이를 고르게 나눠 한두 어절만 다음 줄에 남지 않게 한다."""
    need = max(1, -(-len(text) // limit))
    for n in range(need, max_lines + 1):
        for width in range(-(-len(text) // n), limit + 1):
            lines = wrap(text, width)
            if len(lines) <= n and all(len(x) <= limit for x in lines):
                return lines
    return None


def caption_layout(sentence):
    """한 문장 전체가 한 화면에 들어가는 (글자 크기, 줄 목록)."""
    for size, limit, max_lines in CAPTION_LAYOUTS:
        lines = balanced_wrap(sentence, limit, max_lines)
        if lines:
            return size, tuple(lines)
    raise ValueError(f"자막 한 화면에 들어가지 않는 문장({len(sentence)}자): {sentence}")


CAPTION_TOP = 690     # 줄 수와 관계없이 첫 줄은 늘 이 높이에서 시작한다(시선 고정)
SHADE_TOP = 520


def caption_frame(bg_path, layout):
    size, lines = layout
    step = int(size * 1.4)
    im = _shade_bottom(cover_fit(bg_path), top=SHADE_TOP)
    d = ImageDraw.Draw(im)
    fnt = font(size)
    y = CAPTION_TOP
    for ln in lines:
        _centered(d, y, ln, fnt, (255, 255, 255))
        y += step
    return im


def card_frame(bg_path, card):
    """표지: 제목 아래 부제. 회차·부: 작은 회차 표시 → 금색 선 → 큰 제목 → 시대·장소."""
    kind = card["kind"]
    im = _darken(cover_fit(bg_path), 0.45 if kind == "cover" else 0.58)
    d = ImageDraw.Draw(im)
    if kind == "cover":
        rows = [("text", card["title"], font(104), (255, 255, 255), 150),
                ("text", card["label"], font(54, MEDIUM), WARM, 80)]
        y = 720
    else:
        rows = [("text", card["label"], font(56, MEDIUM), WARM, 84),
                ("rule", None, None, WARM, 56),
                ("text", card["title"], font(100), (255, 255, 255), 130)]
        # 시대·장소 줄 자리는 늘 비워 둬서, 그 줄이 나타날 때 제목이 움직이지 않게 한다
        rows += [("gap", None, None, None, 40),
                 ("text", card.get("dateline", ""), font(46, MEDIUM), (225, 225, 225), 60)]
        y = (H - sum(r[4] for r in rows)) // 2
    for what, text, fnt, fill, h in rows:
        if what == "text":
            _centered(d, y, text, fnt, fill)
        elif what == "rule":
            d.rectangle([(W - 140) // 2, y + 18, (W + 140) // 2, y + 21], fill=fill)
        y += h
    return im


def render(out_dir, bg_path, mode, payload):
    """같은 화면은 한 번만 그린다. 파일 경로를 돌려준다."""
    key = hashlib.sha1(f"{bg_path}|{mode}|{payload!r}".encode()).hexdigest()[:12]
    path = Path(out_dir) / f"{key}.png"
    if not path.exists():
        if mode == "caption":
            im = caption_frame(bg_path, payload)
        elif mode == "plain":
            im = _shade_bottom(cover_fit(bg_path))
        else:
            im = card_frame(bg_path, dict(payload))
        im.save(path)
    return path
