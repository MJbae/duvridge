#!/usr/bin/env python3
"""Generate complete, crawlable language pages with no third-party dependencies."""

import argparse
import html
import json
from pathlib import Path
import re
import shutil
import sys
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
# Matches the production home links on the existing guidebook pages.
SITE_URL = "https://www.duvridge.com"
PLACEHOLDER = re.compile(r"\{\{(\w+)\}\}")
OG_LOCALES = {"en": "en_US", "ko": "ko_KR", "ja": "ja_JP", "zhHans": "zh_CN", "zhHant": "zh_TW"}
LANGUAGES = {
    "en": {
        "path": "/", "html_lang": "en", "html_class": "", "label": "EN",
        "name": "English", "language_label": "Language", "home_label": "duvridge — home",
        "page_title": "duvridge — A life, written to last.",
        "page_description": "duvridge turns one person's life into literature that endures — true lives, written as original novels and audiobooks.",
        "font": None,
    },
    "ko": {
        "path": "/ko/", "html_lang": "ko", "html_class": "lang-ko", "label": "한국어",
        "name": "한국어", "language_label": "언어", "home_label": "duvridge — 홈으로",
        "page_title": "duvridge — 오래도록 남을, 한 사람의 삶.",
        "page_description": "duvridge는 한 사람의 인생을 오래도록 남을 문학으로 빚어냅니다. 실화 인생 드라마 인생원작은 살아낸 삶을 원작 소설과 오디오북으로 씁니다.",
        "font": "family=Noto+Serif+KR:wght@500;600;700",
    },
    "ja": {
        "path": "/ja/", "html_lang": "ja", "html_class": "lang-ja", "label": "日本語",
        "name": "日本語", "language_label": "言語", "home_label": "duvridge — ホーム",
        "page_title": "duvridge — 永く遺る、一人の人生。",
        "page_description": "duvridge は一人の人生を、遺すに値する文学へ。実在の人生を、原作小説とオーディオブックとして綴ります。",
        "font": "family=Shippori+Mincho:wght@500;600;700&family=Noto+Sans+JP:wght@400;500;700",
    },
    "zhHans": {
        "path": "/zh-Hans/", "html_lang": "zh-Hans", "html_class": "lang-zhHans", "label": "简",
        "name": "简体中文", "language_label": "语言", "home_label": "duvridge — 首页",
        "page_title": "duvridge — 让一个人的一生，化作不朽。",
        "page_description": "duvridge 将一个人的一生谱写成值得珍藏的文学——把真实的人生，写成原作小说与有声书。",
        "font": "family=Noto+Serif+SC:wght@500;600;700&family=Noto+Sans+SC:wght@400;500;700",
    },
    "zhHant": {
        "path": "/zh-Hant/", "html_lang": "zh-Hant", "html_class": "lang-zhHant", "label": "繁",
        "name": "繁體中文", "language_label": "語言", "home_label": "duvridge — 首頁",
        "page_title": "duvridge — 讓一個人的一生，化作不朽。",
        "page_description": "duvridge 將一個人的人生譜寫成值得珍藏的文學——把真實的人生，寫成原作小說與有聲書。",
        "font": "family=Noto+Serif+TC:wght@500;600;700&family=Noto+Sans+TC:wght@400;500;700",
    },
}


def render_pages():
    template = (ROOT / "site/template.html").read_text(encoding="utf-8")
    translations = json.loads((ROOT / "site/translations.json").read_text(encoding="utf-8"))
    if set(translations) != set(LANGUAGES):
        raise ValueError("Translations must contain exactly the supported languages.")

    alternate_links = "\n".join(
        f'<link rel="alternate" hreflang="{meta["html_lang"]}" href="{SITE_URL}{meta["path"]}">'
        for meta in LANGUAGES.values()
    ) + f'\n<link rel="alternate" hreflang="x-default" href="{SITE_URL}/">'

    outputs = {}
    for language, meta in LANGUAGES.items():
        context = {key: html.escape(value, quote=True) for key, value in meta.items() if isinstance(value, str)}
        context.update({
            "canonical_url": SITE_URL + meta["path"],
            "og_locale": OG_LOCALES[language],
            "og_alternate_locales": "\n".join(
                f'<meta property="og:locale:alternate" content="{locale}">'
                for key, locale in OG_LOCALES.items() if key != language
            ),
            "social_image": SITE_URL + "/assets/social/duvridge.png",
            "structured_data": json.dumps({
                "@context": "https://schema.org",
                "@graph": [
                    {"@type": "Organization", "@id": SITE_URL + "/#organization", "name": "duvridge", "url": SITE_URL + "/", "logo": SITE_URL + "/assets/brand/symbol.png", "email": "contact@duvridge.com"},
                    {"@type": "WebSite", "name": "duvridge", "url": SITE_URL + meta["path"], "description": meta["page_description"], "inLanguage": meta["html_lang"], "publisher": {"@id": SITE_URL + "/#organization"}},
                ],
            }, ensure_ascii=False).replace("<", "\\u003c"),
            "alternate_links": alternate_links,
            "locale_font": (
                '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
                + html.escape(meta["font"] + "&display=swap", quote=True) + '">'
                if meta["font"] else ""
            ),
            "language_links": "\n".join(
                f'      <a class="lang-btn" href="{other["path"]}" lang="{other["html_lang"]}" '
                f'hreflang="{other["html_lang"]}" aria-label="{other["name"]}"'
                + (' aria-current="page"' if key == language else '')
                + f'>{other["label"]}</a>'
                for key, other in LANGUAGES.items()
            ),
        })
        required_copy = set(PLACEHOLDER.findall(template)) - set(context)
        if set(translations[language]) != required_copy:
            missing = required_copy - set(translations[language])
            extra = set(translations[language]) - required_copy
            raise ValueError(f"{language}: missing copy {sorted(missing)}, unused copy {sorted(extra)}")
        # Copy is maintained locally and may contain intentional <em> or <a> markup.
        context.update(translations[language])
        page = PLACEHOLDER.sub(lambda match: context[match[1]], template)
        if PLACEHOLDER.search(page):
            raise ValueError(f"Unresolved placeholder in {language}")
        outputs[ROOT / meta["path"].lstrip("/") / "index.html"] = page

    paths = [meta["path"] for meta in LANGUAGES.values()] + ["/guidebook/", "/guidebook/privacy/"]
    outputs[ROOT / "sitemap.xml"] = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{SITE_URL}{path}</loc></url>\n" for path in paths)
        + "</urlset>\n"
    )
    outputs[ROOT / "robots.txt"] = f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n"
    return outputs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if checked-in HTML or crawler files are out of date.")
    parser.add_argument("--output", type=Path, help="Stage public company pages and assets in a separate upload directory.")
    args = parser.parse_args()
    destination = args.output.resolve() if args.output else ROOT
    if args.output and (destination == ROOT or destination in ROOT.parents or any(
        destination == ROOT / folder or ROOT / folder in destination.parents
        for folder in ("assets", "guidebook", "site", "scripts", "tests", "toldlife", "ko", "ja", "zh-Hans", "zh-Hant")
    )):
        parser.error("Choose a separate upload folder, for example .deploy/company.")
    outputs = render_pages()
    if args.output and not args.check:
        allowed = {"index.html", "robots.txt", "sitemap.xml", "assets", "guidebook", "ko", "ja", "zh-Hans", "zh-Hant", "deployment.json", ".DS_Store"}
        if destination.exists() and any(item.name not in allowed for item in destination.iterdir()):
            parser.error("Output contains files not owned by the company build; choose an empty folder.")
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="company-", dir=destination.parent) as temporary:
            staged = Path(temporary)
            for source, content in outputs.items():
                target = staged / source.relative_to(ROOT)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
            for folder in ("assets", "guidebook"):
                shutil.copytree(ROOT / folder, staged / folder)
            revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
            (staged / "deployment.json").write_text(json.dumps({"commit": revision, "services": ["company-site"]}) + "\n")
            if destination.exists():
                shutil.rmtree(destination)
            shutil.copytree(staged, destination)
        print(f"Prepared complete company snapshot in {destination}.")
        return 0
    stale = []
    for source, content in outputs.items():
        path = destination / source.relative_to(ROOT)
        if args.check:
            if not path.is_file() or path.read_text(encoding="utf-8") != content:
                stale.append(str(path.relative_to(destination)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
    if stale:
        print("Out of date: " + ", ".join(stale) + ". Run python3 scripts/build-company-site.py.", file=sys.stderr)
        return 1
    print(f"{'Checked' if args.check else 'Generated'} {len(LANGUAGES)} static pages, sitemap.xml and robots.txt.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
