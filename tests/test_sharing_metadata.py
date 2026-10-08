"""Verify the sharing metadata is usable in HTML without running JavaScript."""

from html.parser import HTMLParser
import json
from pathlib import Path
import struct
import unittest
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]


class Head(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.canonical = None
        self.structured = []
        self.capture = False
        self.feed(source)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "meta":
            key = attrs.get("property", attrs.get("name"))
            self.meta.setdefault(key, []).append(attrs.get("content"))
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical = attrs["href"]
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.capture = True

    def handle_endtag(self, tag):
        if tag == "script":
            self.capture = False

    def handle_data(self, text):
        if self.capture:
            self.structured.append(json.loads(text))


class SharingMetadataTests(unittest.TestCase):
    def test_company_and_product_share_cards_are_static_and_complete(self):
        pages = [ROOT / "index.html"] + [ROOT / folder / "index.html" for folder in ("ko", "ja", "zh-Hans", "zh-Hant", "toldlife")]
        for page in pages:
            with self.subTest(page=page.relative_to(ROOT)):
                head = Head(page.read_text(encoding="utf-8"))
                for key in ("og:title", "og:description", "og:url", "og:site_name", "og:locale", "og:image", "og:image:type", "og:image:width", "og:image:height", "og:image:alt", "twitter:card", "twitter:title", "twitter:description", "twitter:image", "twitter:image:alt"):
                    self.assertEqual(len(head.meta.get(key, [])), 1, key)
                    self.assertTrue(head.meta[key][0], key)
                self.assertEqual(head.meta["og:url"][0], head.canonical)
                self.assertEqual(head.meta["og:image"][0], head.meta["twitter:image"][0])
                self.assertEqual(head.meta["og:title"][0], head.meta["twitter:title"][0])
                self.assertEqual(head.meta["twitter:card"][0], "summary_large_image")
                self.assertTrue(head.structured)
                image_path = urlparse(head.meta["og:image"][0]).path
                image = ROOT / ("assets" + image_path if page.parent.name == "toldlife" else image_path.lstrip("/"))
                png = image.read_bytes()
                self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
                self.assertEqual(struct.unpack(">II", png[16:24]), (1200, 630))
                self.assertEqual(head.meta["og:image:width"][0], "1200")
                self.assertEqual(head.meta["og:image:height"][0], "630")


if __name__ == "__main__":
    unittest.main()
