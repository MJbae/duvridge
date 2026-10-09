"""Check the HTML a crawler receives without evaluating any JavaScript."""

from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import urlparse
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
PAGES = {"en": "/", "ko": "/ko/", "ja": "/ja/", "zhHans": "/zh-Hans/", "zhHant": "/zh-Hant/"}
HTML_LANG = {"zhHans": "zh-Hans", "zhHant": "zh-Hant"}
# Headings and short display lines, with the elements that show them.
DISPLAY_COPY = ("hero_title", "hero_sub", "why_lead", "proof_lead", "proof_bridge", "studio_tagline", "cta_title")
DISPLAY_SELECTORS = (".hero h1", ".hero-sub", ".statement", ".lead", ".proof-bridge", ".studio-tagline", ".close h2")


def css_rules(css):
    return re.findall(r"([^{}]+)\{([^{}]*)\}", css)


class Snapshot(HTMLParser):
    def __init__(self, source, body_only=False):
        super().__init__(convert_charrefs=True)
        self.elements = []
        self.parts = []
        self.in_body = not body_only
        self.ignored = 0
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))
        if tag == "body":
            self.in_body = True
        if tag in ("script", "style"):
            self.ignored += 1

    def handle_endtag(self, tag):
        if tag == "body":
            self.in_body = False
        if tag in ("script", "style"):
            self.ignored -= 1

    def handle_data(self, data):
        if self.in_body and not self.ignored:
            self.parts.append(data)

    @property
    def text(self):
        return re.sub(r"\s+", " ", "".join(self.parts)).strip()


def page_file(path):
    return ROOT / path.lstrip("/") / "index.html"


def class_names(attrs):
    return (attrs.get("class") or "").split()


def section_elements(snapshot, section_id):
    """Start tags from a section's opening tag up to the next section or footer; the page's sections are not nested."""
    elements = []
    inside = False
    for tag, attrs in snapshot.elements:
        if tag in ("section", "footer"):
            if inside:
                break
            inside = attrs.get("id") == section_id
        if inside:
            elements.append((tag, attrs))
    return elements


def strip_motion_blocks(css):
    """Drop `prefers-reduced-motion: no-preference` blocks, leaving the styles every visitor receives."""
    marker = "@media (prefers-reduced-motion: no-preference){"
    kept, position = [], 0
    while (start := css.find(marker, position)) != -1:
        kept.append(css[position:start])
        depth, index = 1, start + len(marker)
        while depth:
            depth += {"{": 1, "}": -1}.get(css[index], 0)
            index += 1
        position = index
    kept.append(css[position:])
    return "".join(kept)


class StaticSiteTests(unittest.TestCase):
    def test_every_language_has_complete_copy_in_initial_html(self):
        translations = json.loads((ROOT / "site/translations.json").read_text(encoding="utf-8"))
        for language, path in PAGES.items():
            source = page_file(path).read_text(encoding="utf-8")
            snapshot = Snapshot(source, body_only=True)
            with self.subTest(language=language):
                self.assertNotIn("{{", source)
                self.assertNotIn("data-i18n", source)
                self.assertIn("인생원작", snapshot.text)
                self.assertIn("contact@duvridge.com", snapshot.text)
                self.assertEqual(sum(tag == "h1" for tag, _ in snapshot.elements), 1)
                for key, copy in translations[language].items():
                    with self.subTest(copy=key):
                        self.assertIn(Snapshot(copy).text, snapshot.text)

    def test_company_presents_a_single_product(self):
        for language, path in PAGES.items():
            source = page_file(path).read_text(encoding="utf-8")
            snapshot = Snapshot(source)
            ids = {attrs["id"] for _, attrs in snapshot.elements if "id" in attrs}
            links = [attrs["href"] for tag, attrs in snapshot.elements if tag == "a"]
            with self.subTest(language=language):
                # Retired product names must not survive in copy, metadata or structured data.
                self.assertNotIn("ReLife", source)
                self.assertNotIn("ToldLife", source)
                self.assertIn("services", ids)
                self.assertNotIn("trust", ids)
                self.assertIn("https://toldlife.duvridge.com/novels/bae-byunghee/", links)
                self.assertIn("https://toldlife.duvridge.com/audiobooks/bae-byunghee/", links)
                self.assertIn("https://toldlife.duvridge.com/videos/bae-byunghee/", links)
                self.assertTrue(any(link.startswith("mailto:contact@duvridge.com?subject=") for link in links))

    def test_product_comes_right_after_the_hero(self):
        for path in PAGES.values():
            snapshot = Snapshot(page_file(path).read_text(encoding="utf-8"))
            sections = [attrs.get("id") for tag, attrs in snapshot.elements if tag == "section"]
            with self.subTest(path=path):
                self.assertEqual(sections[:2], ["hero", "services"])

    def test_finished_work_opens_in_every_format(self):
        for path in PAGES.values():
            product = section_elements(Snapshot(page_file(path).read_text(encoding="utf-8")), "services")
            with self.subTest(path=path):
                formats = [attrs["href"] for tag, attrs in product if tag == "a" and "format" in class_names(attrs)]
                self.assertEqual(formats, [f"https://toldlife.duvridge.com/{kind}/bae-byunghee/" for kind in ("novels", "audiobooks", "videos")])
                # One status line says the work is finished; the formats no longer repeat their episode counts.
                self.assertEqual(sum("work-status" in class_names(attrs) for _, attrs in product), 1)
                self.assertFalse(any("format-meta" in class_names(attrs) for _, attrs in product))

    def test_product_is_shown_as_a_book_with_its_cover(self):
        for path in PAGES.values():
            source = page_file(path).read_text(encoding="utf-8")
            product = section_elements(Snapshot(source), "services")
            with self.subTest(path=path):
                marks = [attrs for tag, attrs in product if "product-mark" in class_names(attrs)]
                books = [attrs for tag, attrs in product if tag == "a" and "book" in class_names(attrs)]
                covers = [attrs for tag, attrs in product if tag == "img" and "book-art" in class_names(attrs)]
                self.assertEqual([mark.get("lang") for mark in marks], ["ko"])
                self.assertEqual([(book["href"], book.get("lang")) for book in books], [("https://toldlife.duvridge.com/novels/bae-byunghee/", "ko")])
                self.assertEqual(len(covers), 1)
                self.assertTrue(covers[0]["src"].startswith("https://toldlife.duvridge.com/novels/works/bae-byunghee/images/"))
                # Decorative: the cover's own Korean title text names the work.
                self.assertEqual(covers[0].get("alt"), "")
                self.assertEqual(covers[0].get("loading"), "lazy")
                self.assertTrue(covers[0].get("width") and covers[0].get("height"))
                # The Korean brand name keeps Korean pronunciation on every locale page.
                self.assertTrue('<p class="studio-label"><span lang="ko">인생원작</span>' in source, "studio label must mark 인생원작 as Korean")

    def test_hero_draws_one_life_ending_in_a_full_stop(self):
        for path in PAGES.values():
            hero = section_elements(Snapshot(page_file(path).read_text(encoding="utf-8")), "hero")
            with self.subTest(path=path):
                lines = [attrs for tag, attrs in hero if tag == "path" and "lc-path" in class_names(attrs)]
                stops = [attrs for tag, attrs in hero if tag == "circle" and "lc-stop" in class_names(attrs)]
                self.assertEqual(len(lines), 1)
                self.assertEqual(len(stops), 1)
                self.assertTrue(lines[0]["d"].endswith(f'{stops[0]["cx"]},{stops[0]["cy"]}'))
                self.assertFalse(any("eyebrow" in class_names(attrs) for _, attrs in hero))

    def test_hero_content_stays_visible_without_motion(self):
        css = strip_motion_blocks((ROOT / "assets/site.css").read_text(encoding="utf-8"))
        for selector, declarations in css_rules(css):
            if ".lc-" in selector or ".hero" in selector:
                with self.subTest(selector=selector.strip()):
                    self.assertIsNone(re.search(r"opacity:\s*0(?![.\d])", declarations))

    def test_section_eyebrows_are_centered(self):
        css = (ROOT / "assets/site.css").read_text(encoding="utf-8")
        rule = re.search(r"(?m)^\s*\.eyebrow\{([^}]*)\}", css)
        self.assertIsNotNone(rule)
        # A paragraph's 60ch measure would otherwise pin short eyebrows to the left of centered sections.
        self.assertIn("max-width:none", rule.group(1).replace(" ", ""))

    def test_east_asian_prose_measures_count_full_width_glyphs(self):
        css = (ROOT / "assets/site.css").read_text(encoding="utf-8")
        covered = set()
        for selector, declarations in css_rules(css):
            width = re.search(r"max-width:\s*[\d.]+([a-z]+)", declarations)
            if not width or ".prose" not in selector or ".lang-" not in selector:
                continue
            with self.subTest(selector=selector.strip()):
                # ch is a Latin zero, about half a Hangul or Han glyph: 30ch left these paragraphs an 18-character column.
                self.assertEqual(width.group(1), "em")
            covered.update(
                (language, section) for language in ("ko", "ja", "zhHans", "zhHant") for section in (".why", ".proof")
                if f".lang-{language}" in selector and f"{section} .prose" in selector
            )
        self.assertEqual(len(covered), 8, covered)

    def test_japanese_and_chinese_display_lines_break_between_phrases(self):
        translations = json.loads((ROOT / "site/translations.json").read_text(encoding="utf-8"))
        css = (ROOT / "assets/site.css").read_text(encoding="utf-8")
        keep_whole = [selector for selector, declarations in css_rules(css) if "word-break:keep-all" in declarations.replace(" ", "")]
        for language in ("ja", "zhHans", "zhHant"):
            with self.subTest(language=language):
                # These scripts may wrap between any two characters, which split words such as 人生 and 一生.
                # Display copy marks its phrase boundaries with <wbr>, and only those may end a line.
                self.assertTrue(any(f".lang-{language}" in selector and all(display in selector for display in DISPLAY_SELECTORS) for selector in keep_whole))
                for key in DISPLAY_COPY:
                    self.assertIn("<wbr>", translations[language][key], key)

    def test_navigation_and_resources_work_without_scripts(self):
        for path in PAGES.values():
            snapshot = Snapshot(page_file(path).read_text(encoding="utf-8"))
            ids = {attrs["id"] for _, attrs in snapshot.elements if "id" in attrs}
            language_links = [attrs for tag, attrs in snapshot.elements if tag == "a" and "lang-btn" in attrs.get("class", "").split()]
            with self.subTest(path=path):
                self.assertEqual({link["href"] for link in language_links}, set(PAGES.values()))
                self.assertEqual([link["href"] for link in language_links if link.get("aria-current") == "page"], [path])
                for tag, attrs in snapshot.elements:
                    if tag == "a":
                        href = attrs["href"]
                        if href.startswith("#"):
                            self.assertIn(href[1:], ids)
                        elif href.startswith("/"):
                            self.assertTrue(page_file(href).is_file(), href)
                    resource = attrs.get("src", "") if tag == "script" else attrs.get("href", "") if tag == "link" else ""
                    if resource.startswith("/"):
                        self.assertTrue((ROOT / resource.lstrip("/")).is_file(), resource)

    def test_language_metadata_and_crawler_discovery(self):
        sitemap = ET.fromstring((ROOT / "sitemap.xml").read_text(encoding="utf-8"))
        locations = {element.text for element in sitemap.findall("{*}url/{*}loc")}
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("User-agent: *\nAllow: /", robots)
        self.assertIn("Sitemap: https://www.duvridge.com/sitemap.xml", robots)
        for url in locations:
            self.assertTrue(page_file(urlparse(url).path).is_file(), url)
        for language, path in PAGES.items():
            snapshot = Snapshot(page_file(path).read_text(encoding="utf-8"))
            with self.subTest(language=language):
                root = next(attrs for tag, attrs in snapshot.elements if tag == "html")
                self.assertEqual(root["lang"], HTML_LANG.get(language, language))
                canonical = next(attrs["href"] for tag, attrs in snapshot.elements if tag == "link" and attrs.get("rel") == "canonical")
                self.assertEqual(canonical, "https://www.duvridge.com" + path)
                self.assertIn(canonical, locations)
                alternates = {attrs["hreflang"]: attrs["href"] for tag, attrs in snapshot.elements if tag == "link" and attrs.get("rel") == "alternate"}
                self.assertEqual(set(alternates), {"en", "ko", "ja", "zh-Hans", "zh-Hant", "x-default"})
                self.assertEqual(alternates[root["lang"]], canonical)

    def test_generated_files_are_current(self):
        result = subprocess.run([sys.executable, str(ROOT / "scripts/build-company-site.py"), "--check"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_staging_removes_deleted_assets_and_refuses_unrelated_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "company"
            command = [sys.executable, str(ROOT / "scripts/build-company-site.py"), "--output", str(output)]
            first = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            stale = output / "assets/removed-asset.txt"
            stale.write_text("old deployment asset")
            second = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertFalse(stale.exists())
            unrelated = output / "personal-file.txt"
            unrelated.write_text("do not delete")
            refused = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(refused.returncode, 0)
            self.assertEqual(unrelated.read_text(), "do not delete")


if __name__ == "__main__":
    unittest.main()
