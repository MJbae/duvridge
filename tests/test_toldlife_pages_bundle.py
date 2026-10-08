"""Exercise complete, atomic Pages snapshots without rebuilding the reader apps."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("build_toldlife", ROOT / "scripts/assemble-toldlife-pages.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class ToldLifeAssemblyTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.portal = self.root / "portal"
        self.portal.mkdir()
        (self.portal / "index.html").write_text("<html>portal</html>")
        (self.portal / "404.html").write_text("<html>not found</html>")
        self.brand = self.root / "assets"
        for folder in ("brand", "social"):
            (self.brand / folder).mkdir(parents=True)
            (self.brand / folder / "image.png").write_bytes(b"image")
        self.services = []
        for name, base in (("novels", "/novels/"), ("audio", "/audiobooks/")):
            dist = self.root / name
            (dist / "read").mkdir(parents=True)
            (dist / "index.html").write_text(f'<link rel="canonical" href="{build.SITE_ORIGIN}{base}">')
            (dist / "read/ep01.html").write_text("<html>first episode</html>")
            if name == "audio":
                (dist / "record").mkdir()
                (dist / "record/prolog.mp3").write_bytes(b"ID3audio")
            self.services.append((base, dist))
        self.output = self.root / "output"
        self.patches = [patch.object(build, "PORTAL", self.portal), patch.object(build, "BRAND", self.brand)]
        for mock in self.patches:
            mock.start()
            self.addCleanup(mock.stop)

    def test_complete_snapshot_preserves_both_services_and_removes_deleted_files(self):
        self.output.mkdir()
        (self.output / "obsolete.html").write_text("old")
        build.assemble(self.output, self.services)
        self.assertFalse((self.output / "obsolete.html").exists())
        self.assertTrue((self.output / "novels/read/ep01.html").exists())
        self.assertEqual((self.output / "audiobooks/record/prolog.mp3").read_bytes(), b"ID3audio")
        self.assertTrue((self.output / "404.html").exists())
        sitemap = (self.output / "sitemap.xml").read_text()
        self.assertIn("/novels/read/ep01", sitemap)
        self.assertIn("/audiobooks/read/ep01", sitemap)
        marker = json.loads((self.output / "deployment.json").read_text())
        self.assertEqual([entry["base"] for entry in marker["services"]], ["/novels/", "/audiobooks/"])
        self.assertEqual(len(marker["sourceRevision"]), 40)

    def test_partial_upload_is_rejected_before_replacing_current_snapshot(self):
        self.output.mkdir()
        (self.output / "index.html").write_text("current")
        with self.assertRaisesRegex(ValueError, "every service"):
            build.assemble(self.output, self.services[:1])
        self.assertEqual((self.output / "index.html").read_text(), "current")

    def test_wrong_base_or_missing_audio_cannot_publish_a_snapshot(self):
        (self.services[1][1] / "index.html").write_text('<link rel="canonical" href="https://wrong.invalid/">')
        with self.assertRaisesRegex(ValueError, "canonical"):
            build.assemble(self.output, self.services)
        self.assertFalse(self.output.exists())
        base, dist = self.services[1]
        (dist / "index.html").write_text(f'<link rel="canonical" href="{build.SITE_ORIGIN}{base}">')
        (dist / "record/prolog.mp3").unlink()
        with self.assertRaisesRegex(ValueError, "prolog.mp3"):
            build.assemble(self.output, self.services)

    def test_configuration_and_oversized_assets_are_rejected(self):
        dist = self.services[0][1]
        (dist / ".env.local").write_text("not-public")
        with self.assertRaisesRegex(ValueError, "Source/config"):
            build.assemble(self.output, self.services)
        (dist / ".env.local").unlink()
        with (dist / "large.mp3").open("wb") as file:
            file.truncate(25 * 1024 * 1024 + 1)
        with self.assertRaisesRegex(ValueError, "25 MiB"):
            build.assemble(self.output, self.services)


if __name__ == "__main__":
    unittest.main()
