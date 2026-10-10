"""Exercise complete, atomic Pages snapshots without rebuilding the reader apps."""
import hashlib
import importlib.util
import io
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
        for name, base in (("novels", "/novels/"), ("audio", "/audiobooks/"), ("videos", "/videos/")):
            dist = self.root / name
            (dist / "bae-byunghee").mkdir(parents=True)
            (dist / "index.html").write_text(f'<link rel="canonical" href="{build.SITE_ORIGIN}/">')
            (dist / "bae-byunghee/ep01.html").write_text("<html>first episode</html>")
            (dist / "bae-byunghee/index.html").write_text("<html>work</html>")
            (dist / "bae-byunghee/prolog.html").write_text("<html>prologue</html>")
            folder = "/audiobooks/watch/" if name == "videos" else base + "read/"
            (dist / "moved-pages.json").write_text(json.dumps({"version": 1, "pages": [{"from": folder + "old.html", "to": base + "bae-byunghee/ep01"}]}))
            (dist / "work-index.json").write_text(json.dumps([{"id": "bae-byunghee", "title": "Example", "legacyRoot": True, "legacyIds": {}, "cover": {"alt": "Cover", "width": 720, "height": 405, "sources": [{"src": "/works/bae-byunghee/images/cover.jpg", "width": 720}]}, "episodes": [{"id": "prolog", "label": "프롤로그", "recorded": True}]}]))
            fonts = dist / "fonts"
            fonts.mkdir()
            data = b"wOF2font"
            digest = hashlib.sha256(data).hexdigest()
            font = f"serif.{digest[:16]}.woff2"
            stylesheet = "reader.0123456789abcdef.css"
            (fonts / font).write_bytes(data)
            (fonts / stylesheet).write_text("@font-face{}")
            (fonts / "manifest.json").write_text(json.dumps({"version": 1, "stylesheet": stylesheet, "faces": [{"family": "ToldLife Serif", "weight": "400 800", "common": True, "file": font, "bytes": len(data), "sha256": digest}]}))
            if name in {"audio", "videos"}:
                (dist / "works/bae-byunghee/record").mkdir(parents=True)
                (dist / "works/bae-byunghee/record/prolog.mp3").write_bytes(b"ID3audio")
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
        self.assertTrue((self.output / "novels/bae-byunghee/ep01.html").exists())
        self.assertEqual((self.output / "audiobooks/works/bae-byunghee/record/prolog.mp3").read_bytes(), b"ID3audio")
        self.assertTrue((self.output / "404.html").exists())
        self.assertTrue((self.output / "fonts/manifest.json").exists())
        self.assertFalse((self.output / "novels/fonts").exists())
        self.assertIn('/fonts/reader.', (self.output / "index.html").read_text())
        self.assertIn('max-age=31536000, immutable', (self.output / "_headers").read_text())
        sitemap = (self.output / "sitemap.xml").read_text()
        self.assertIn("/novels/bae-byunghee/ep01", sitemap)
        self.assertIn("/audiobooks/bae-byunghee/ep01", sitemap)
        self.assertIn("/videos/bae-byunghee/ep01", sitemap)
        redirects = (self.output / "_redirects").read_text()
        self.assertIn("/novels/read/old.html /novels/bae-byunghee/ep01 301", redirects)
        self.assertIn("/videos/ /?tab=videos 301", redirects)
        # The audiobook moved inside the original series, so its root opens that tab.
        self.assertIn("/audiobooks/ /?tab=novels 301", redirects)
        marker = json.loads((self.output / "deployment.json").read_text())
        self.assertEqual([entry["base"] for entry in marker["services"]], ["/novels/", "/audiobooks/", "/videos/"])
        self.assertEqual(len(marker["sourceRevision"]), 40)

    def test_partial_upload_is_rejected_before_replacing_current_snapshot(self):
        self.output.mkdir()
        (self.output / "index.html").write_text("current")
        with self.assertRaisesRegex(ValueError, "every service"):
            build.assemble(self.output, self.services[:1])
        self.assertEqual((self.output / "index.html").read_text(), "current")

    def test_missing_corrupted_or_different_shared_fonts_cannot_replace_snapshot(self):
        self.output.mkdir()
        (self.output / "index.html").write_text("current")
        folder = self.services[1][1] / "fonts"
        marker = folder / "manifest.json"
        original = marker.read_text()
        marker.unlink()
        with self.assertRaisesRegex(ValueError, "font manifest"):
            build.assemble(self.output, self.services)
        marker.write_text(original)
        face = json.loads(original)["faces"][0]
        (folder / face["file"]).write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError, "font asset differs"):
            build.assemble(self.output, self.services)
        (folder / face["file"]).write_bytes(b"wOF2font")
        modified = json.loads(original)
        modified["faces"][0]["weight"] = "700"
        marker.write_text(json.dumps(modified))
        with self.assertRaisesRegex(ValueError, "font bundles differ"):
            build.assemble(self.output, self.services)
        self.assertEqual((self.output / "index.html").read_text(), "current")

    def test_wrong_base_or_missing_audio_cannot_publish_a_snapshot(self):
        (self.services[1][1] / "index.html").write_text('<link rel="canonical" href="https://wrong.invalid/">')
        with self.assertRaisesRegex(ValueError, "canonical"):
            build.assemble(self.output, self.services)
        self.assertFalse(self.output.exists())
        base, dist = self.services[1]
        (dist / "index.html").write_text(f'<link rel="canonical" href="{build.SITE_ORIGIN}/">')
        (dist / "works/bae-byunghee/record/prolog.mp3").unlink()
        with self.assertRaisesRegex(ValueError, "prolog.mp3"):
            build.assemble(self.output, self.services)

    def test_missing_target_and_conflicting_redirect_fail_atomically(self):
        base, dist = self.services[0]
        (dist / "moved-pages.json").write_text(json.dumps({"version": 1, "pages": [{"from": "/old", "to": "/novels/missing"}]}))
        with self.assertRaisesRegex(ValueError, "target is missing"):
            build.assemble(self.output, self.services)
        self.assertFalse(self.output.exists())
        (dist / "moved-pages.json").write_text(json.dumps({"version": 1, "pages": [{"from": "/novels/", "to": "/novels/bae-byunghee/"}]}))
        with self.assertRaisesRegex(ValueError, "Conflicting"):
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


class VideoMediaTests(unittest.TestCase):
    """Videos stay out of Git: the assembly accepts only files that match the book's video list."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.books = self.root / "books"
        (self.books / "first/video").mkdir(parents=True)
        (self.books / "first/book.json").write_text(json.dumps({"id": "first-work"}))
        self.content = b"video bytes"
        digest = hashlib.sha256(self.content).hexdigest()
        self.file = f"ep01.{digest[:10]}.mp4"
        (self.books / "first/video/media.json").write_text(json.dumps({
            "version": 1, "release": {"repository": "owner/repo", "tag": "videos-first"},
            "videos": {"ep01": {"file": self.file, "bytes": len(self.content), "sha256": digest, "duration": 1.0}}}))
        self.staged = self.root / "staged"
        self.folder = self.root / "web"
        self.folder.mkdir()
        self.target = self.staged / "videos/works/first-work/media" / self.file

    def add(self, source):
        return build.add_video_media(self.staged, source, books=self.books)

    def test_without_a_source_the_snapshot_carries_no_video(self):
        self.assertEqual(self.add("none"), 0)
        self.assertFalse(self.staged.exists())

    def test_a_folder_copy_is_placed_under_its_work_and_checked(self):
        (self.folder / "ep01.mp4").write_bytes(self.content)
        self.assertEqual(self.add(str(self.folder)), 1)
        self.assertEqual(self.target.read_bytes(), self.content)

    def test_films_are_placed_beside_the_episode_videos(self):
        film = b"film bytes"
        digest = hashlib.sha256(film).hexdigest()
        name = f"short.{digest[:10]}.mp4"
        manifest = json.loads((self.books / "first/video/media.json").read_text())
        manifest["films"] = {"short": {"file": name, "bytes": len(film), "sha256": digest, "duration": 2.0, "width": 720, "height": 1280}}
        (self.books / "first/video/media.json").write_text(json.dumps(manifest))
        (self.folder / "ep01.mp4").write_bytes(self.content)
        (self.folder / name).write_bytes(film)
        self.assertEqual(self.add(str(self.folder)), 2)
        self.assertEqual((self.staged / "videos/works/first-work/media" / name).read_bytes(), film)

    def test_a_missing_or_changed_video_stops_the_assembly(self):
        with self.assertRaisesRegex(ValueError, "missing"):
            self.add(str(self.folder))
        (self.folder / self.file).write_bytes(b"other video")
        with self.assertRaisesRegex(ValueError, "differs"):
            self.add(str(self.folder))

    def test_release_downloads_are_retried_until_they_match(self):
        requested = []
        bodies = iter([b"cut short", self.content])

        def urlopen(request, timeout):
            requested.append(request.full_url)
            return io.BytesIO(next(bodies))

        with patch.object(build.urllib.request, "urlopen", urlopen), patch.object(build.time, "sleep"):
            self.assertEqual(self.add("release"), 1)
            self.assertEqual(self.target.read_bytes(), self.content)
            bodies = iter([b"cut short"] * 3)
            with self.assertRaisesRegex(ValueError, "differs"):
                self.add("release")
        self.assertEqual(requested, [f"https://github.com/owner/repo/releases/download/videos-first/{self.file}"] * 5)


if __name__ == "__main__":
    unittest.main()
