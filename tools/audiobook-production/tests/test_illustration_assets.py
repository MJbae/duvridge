"""Offline scenes use the approved public artwork, even when old master names differ."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "src/resolve_illustration_assets.py"
spec = importlib.util.spec_from_file_location("resolve_illustration_assets", SOURCE)
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)


class IllustrationAssetTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        (self.root / "content/illustration-sources").mkdir(parents=True)
        (self.root / "site/public/images/episodes").mkdir(parents=True)
        (self.root / "content/illustration-sources/ep09-01.png").write_bytes(b"old binder master")
        self.public = self.root / "site/public/images/episodes/ep09-01-1280.jpg"
        self.public.write_bytes(b"approved moving truck")
        self.manifest = {"version": 2, "images": [{"id": "ep09-01", "sources": [
            {"src": "/images/episodes/ep09-01-360.jpg", "width": 360},
            {"src": "/images/episodes/ep09-01-1280.jpg", "width": 1280},
        ]}]}
        self.save_manifest()

    def save_manifest(self):
        (self.root / "content/episode-illustrations.json").write_text(json.dumps(self.manifest))

    def test_same_id_old_binder_master_cannot_replace_the_approved_truck(self):
        self.assertEqual(assets.resolve_illustration_asset(self.root, "ep09-01"), self.public)

    def test_before_the_first_marker_no_active_artwork_is_required(self):
        self.assertIsNone(assets.resolve_illustration_asset(self.root, None))

    def test_missing_artwork_fails_instead_of_using_an_unrelated_master(self):
        self.public.unlink()
        with self.assertRaisesRegex(ValueError, "공개 삽화 파일"):
            assets.resolve_illustration_asset(self.root, "ep09-01")

    def test_unsafe_or_unknown_manifest_asset_is_rejected(self):
        with self.assertRaises(ValueError):
            assets.resolve_illustration_asset(self.root, "missing")
        for src in ["/images/episodes/../../../../outside.jpg", "https://example.invalid/image.jpg"]:
            with self.subTest(src=src):
                self.manifest["images"][0]["sources"] = [{"src": src, "width": 1280}]
                self.save_manifest()
                with self.assertRaises(ValueError):
                    assets.resolve_illustration_asset(self.root, "ep09-01")


if __name__ == "__main__":
    unittest.main()
