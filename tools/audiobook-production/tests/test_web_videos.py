"""Web copies of the produced videos fit the Pages file limit and are recorded for the video app."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "src/publish_web_videos.py"
spec = importlib.util.spec_from_file_location("publish_web_videos", SOURCE)
videos = importlib.util.module_from_spec(spec)
spec.loader.exec_module(videos)


def encoder(size):
    """Stands in for ffmpeg: writes a re-encoded file of the given size to the output path."""
    return lambda command, check: Path(command[-1]).write_bytes(b"e" * size)


class WebVideoTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.produced = self.root / "video"
        self.produced.mkdir()
        self.out = self.root / "video-web"
        self.out.mkdir()
        for patcher in (patch.object(videos, "LIMIT", 100), patch.object(videos, "duration", lambda path: 12.5)):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_a_video_under_the_limit_is_published_as_produced(self):
        source = self.produced / "ep01.mp4"
        source.write_bytes(b"small video")
        digest = hashlib.sha256(b"small video").hexdigest()
        with patch.object(videos.subprocess, "run", side_effect=AssertionError("no re-encoding")):
            entry = videos.web_copy(source, self.out)
        self.assertEqual(entry, {"file": f"ep01.{digest[:10]}.mp4", "bytes": 11, "sha256": digest, "duration": 12.5})
        self.assertEqual((self.out / entry["file"]).read_bytes(), b"small video")

    def test_a_large_video_is_re_encoded_and_refused_if_it_still_does_not_fit(self):
        source = self.produced / "ep02.mp4"
        source.write_bytes(b"v" * 100)
        with patch.object(videos.subprocess, "run", encoder(60)):
            entry = videos.web_copy(source, self.out)
        self.assertEqual(entry["bytes"], 60)
        with patch.object(videos.subprocess, "run", encoder(100)), self.assertRaisesRegex(SystemExit, "still 25 MB"):
            videos.web_copy(source, self.out)
        self.assertEqual(sorted(path.name for path in self.out.iterdir()), [entry["file"]])

    def test_the_book_records_the_new_copy_and_keeps_the_others(self):
        book = self.root / "book"
        (book / "video").mkdir(parents=True)
        kept = {"file": "ep02.0000000000.mp4", "bytes": 1, "sha256": "0" * 64, "duration": 1.0}
        release = {"repository": "owner/repo", "tag": "videos-first"}
        (book / "video/media.json").write_text(json.dumps({"version": 1, "release": release, "videos": {"ep01": kept, "ep02": kept}}))
        (self.produced / "ep01.mp4").write_bytes(b"new video")
        (self.produced / "ep01.srt").write_text("1\n00:00:00,000 --> 00:00:01,000\n문장\n", encoding="utf-8")
        argv = ["publish_web_videos.py", "ep01", "--videos", str(self.produced), "--out", str(self.out)]
        with patch.object(videos, "BOOK", book), patch.object(sys, "argv", argv):
            videos.main()
        manifest = json.loads((book / "video/media.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["release"], release)
        self.assertEqual(list(manifest["videos"]), ["ep01", "ep02"])
        self.assertEqual(manifest["videos"]["ep01"]["bytes"], 9)
        self.assertEqual(manifest["videos"]["ep02"], kept)
        self.assertEqual((book / "video/timings/ep01.srt").read_text(encoding="utf-8"), "1\n00:00:00,000 --> 00:00:01,000\n문장\n")


if __name__ == "__main__":
    unittest.main()
