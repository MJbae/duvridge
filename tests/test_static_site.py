"""Check the HTML a crawler receives without evaluating any JavaScript."""

from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys
import unittest
from urllib.parse import urlparse
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
PAGES = {"en": "/", "ko": "/ko/", "ja": "/ja/", "zhHans": "/zh-Hans/", "zhHant": "/zh-Hant/"}
HTML_LANG = {"zhHans": "zh-Hans", "zhHant": "zh-Hant"}


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


class StaticSiteTests(unittest.TestCase):
    def test_every_language_has_complete_copy_in_initial_html(self):
        translations = json.loads((ROOT / "site/translations.json").read_text(encoding="utf-8"))
        for language, path in PAGES.items():
            source = page_file(path).read_text(encoding="utf-8")
            snapshot = Snapshot(source, body_only=True)
            with self.subTest(language=language):
                self.assertNotIn("{{", source)
                self.assertNotIn("data-i18n", source)
                self.assertIn("ToldLife", snapshot.text)
                self.assertIn("ReLife", snapshot.text)
                self.assertIn("contact@duvridge.com", snapshot.text)
                self.assertEqual(sum(tag == "h1" for tag, _ in snapshot.elements), 1)
                for key, copy in translations[language].items():
                    with self.subTest(copy=key):
                        self.assertIn(Snapshot(copy).text, snapshot.text)

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
        result = subprocess.run([sys.executable, str(ROOT / "scripts/build-site.py"), "--check"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
