"""Stable illustration controls must never add spoken lines or rely on prose wording."""
import contextlib
import importlib.util
import io
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "src/build_narration_script.py"
spec = importlib.util.spec_from_file_location("build_narration_script", SOURCE)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class NarrationIllustrationTests(unittest.TestCase):
    images = [{"id": "ep01-01", "episodeId": "ep01"}, {"id": "ep01-02", "episodeId": "ep01"}]
    body = "<!-- illustration: ep01-01 -->\n\n첫 장면이다.\n\n<!-- illustration: ep01-02 -->\n\n다음 장면이다."

    def build(self, body, images=None):
        episode = {"title": "시험 회차", "part": None, "lines": ("*1936년, 안면도*\n\n" + body).splitlines()}
        with contextlib.redirect_stderr(io.StringIO()):
            return builder.build("ep01", episode, images if images is not None else self.images)

    def test_markers_switch_images_without_adding_caption_or_narration_lines(self):
        lines = self.build(self.body)
        self.assertEqual([line["kind"] for line in lines], ["title", "dateline", "para", "para"])
        self.assertEqual([line["image"] for line in lines], ["ep01-01", "ep01-01", "ep01-01", "ep01-02"])
        self.assertFalse(any("illustration:" in line["show"] or "illustration:" in line["say"] for line in lines))

    def test_rewording_and_inserting_prose_keeps_the_explicit_image_switch(self):
        changed = self.body.replace("첫 장면이다.", "표현을 전부 바꿨다.\n\n문단도 새로 넣었다.").replace("다음 장면이다.", "다른 문장으로 고쳤다.")
        markers = builder.parse_illustration_markers(changed)
        self.assertEqual([marker["paragraphIndex"] for marker in markers], [0, 2])
        prose = [line for line in self.build(changed) if line["kind"] == "para"]
        self.assertEqual([line["image"] for line in prose], ["ep01-01", "ep01-01", "ep01-02"])

    def test_new_image_between_existing_images_does_not_rename_their_ids(self):
        body = self.body.replace("<!-- illustration: ep01-02 -->", "<!-- illustration: ep01-03 -->\n\n새 삽화의 문단이다.\n\n<!-- illustration: ep01-02 -->")
        images = [*self.images, {"id": "ep01-03", "episodeId": "ep01"}]
        prose = [line for line in self.build(body, images) if line["kind"] == "para"]
        self.assertEqual([line["image"] for line in prose], ["ep01-01", "ep01-03", "ep01-02"])
        self.assertEqual([image["id"] for image in self.images], ["ep01-01", "ep01-02"])

    def test_any_registered_image_can_be_the_opening_image(self):
        body = self.body.replace("ep01-01", "temporary").replace("ep01-02", "ep01-01").replace("temporary", "ep01-02")
        lines = self.build(body)
        self.assertEqual(lines[0]["image"], "ep01-02")
        self.assertEqual([line["image"] for line in lines if line["kind"] == "para"], ["ep01-02", "ep01-01"])

    def test_heading_without_blank_line_preserves_the_following_prose(self):
        for heading in ["### 소제목", "###"]:
            with self.subTest(heading=heading):
                body = self.body.replace("첫 장면이다.", f"{heading}\n첫 장면이다.")
                markers = builder.parse_illustration_markers(body)
                self.assertEqual([marker["paragraphIndex"] for marker in markers], [0, 1])
                prose = [line for line in self.build(body) if line["kind"] == "para"]
                self.assertEqual([line["show"] for line in prose], ["첫 장면이다.", "다음 장면이다."])

    def test_scene_break_without_blank_lines_splits_prose_and_mixed_symbols_are_prose(self):
        body = self.body.replace("첫 장면이다.", "첫 장면이다.\n* * *\n이어지는 문단이다.")
        markers = builder.parse_illustration_markers(body)
        self.assertEqual([marker["paragraphIndex"] for marker in markers], [0, 2])
        self.assertEqual([line["kind"] for line in self.build(body)], ["title", "dateline", "para", "break", "para", "para"])
        mixed = self.body.replace("첫 장면이다.", "*-_")
        self.assertEqual([line["show"] for line in self.build(mixed) if line["kind"] == "para"], ["*-_", "다음 장면이다."])

    def test_episode_looking_fenced_examples_never_create_extra_episodes(self):
        for fence in ["```", "~~~~"]:
            with self.subTest(fence=fence):
                manuscript = f"# 1936. 안면도\n\n## 시험 회차 {{#ep01}}\n\n*1936년, 안면도*\n\n{fence}md\n# 1977. 예제\n## 코드 안 회차 {{#ep99}}\n{fence}\n\n{self.body}"
                episodes = builder.parse_episodes(manuscript)
                self.assertEqual(list(episodes), ["ep01"])
                self.assertIn("## 코드 안 회차 {#ep99}", episodes["ep01"]["lines"])
                with contextlib.redirect_stderr(io.StringIO()):
                    lines = builder.build("ep01", episodes["ep01"], self.images)
                self.assertEqual([line["show"] for line in lines if line["kind"] == "para"], ["첫 장면이다.", "다음 장면이다."])

    def test_two_markers_before_one_prose_paragraph_are_rejected(self):
        body = "<!-- illustration: ep01-01 -->\n\n<!-- illustration: ep01-02 -->\n\n한 문단이다."
        with self.assertRaisesRegex(ValueError, "하나만"):
            self.build(body)

    def test_scene_breaks_comments_headings_and_fenced_examples_do_not_count_as_prose(self):
        body = "<!-- illustration: ep01-01 -->\n\n첫 장면이다.\n\n* * *\n\n<!-- 편집 메모 -->\n\n### 참고\n\n```md\n<!-- illustration: ep99-01 -->\n```\n\n<!-- illustration: ep01-02 -->\n\n다음 장면이다."
        markers = builder.parse_illustration_markers(body)
        self.assertEqual([marker["id"] for marker in markers], ["ep01-01", "ep01-02"])
        self.assertEqual([marker["paragraphIndex"] for marker in markers], [0, 1])
        self.assertIn("<!-- illustration: ep99-01 -->", builder.strip_illustration_markers(body))
        lines = self.build(body)
        self.assertEqual([line["kind"] for line in lines], ["title", "dateline", "para", "break", "para"])
        self.assertFalse(any("illustration:" in line["show"] or "illustration:" in line["say"] for line in lines))

    def test_invalid_anchors_fail_before_any_generation(self):
        invalid = [
            self.body.replace("ep01-02", "ep99-01"),
            self.body.replace("ep01-02", "ep01-01"),
            self.body.replace("<!-- illustration: ep01-02 -->\n\n", ""),
            self.body.replace("ep01-02", "EP01-02"),
            self.body.replace("첫 장면이다.\n\n<!--", "첫 장면이다.\n<!--"),
            self.body.removesuffix("다음 장면이다."),
        ]
        for body in invalid:
            with self.subTest(body=body), self.assertRaises(ValueError):
                self.build(body)


if __name__ == "__main__":
    unittest.main()
