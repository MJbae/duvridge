"""Opening music must fade gradually without covering the first prose paragraph."""
import importlib.util
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "src/intro_music.py"
spec = importlib.util.spec_from_file_location("intro_music", SOURCE)
music = importlib.util.module_from_spec(spec)
spec.loader.exec_module(music)


def gain_at(points, time):
    if time <= points[0][0]:
        return points[0][1]
    for (start, start_gain), (end, end_gain) in zip(points, points[1:]):
        if time <= end:
            return start_gain + (end_gain - start_gain) * (time - start) / (end - start)
    return points[-1][1]


class IntroMusicTests(unittest.TestCase):
    def test_opening_cards_keep_music_audible_and_fade_over_five_seconds(self):
        scenes = [(0, 4, None, "card", ()), (4, 7.535, None, "card", ()),
                  (7.535, 12.137, None, "card", ()), (12.137, 16.33, None, "caption", ())]
        duration, points = music.intro_music_profile(scenes)
        self.assertEqual(duration, 9.0)
        self.assertGreaterEqual(points[-1][0] - points[-2][0], 5.0)
        self.assertGreater(gain_at(points, 5.0), 0.7)
        self.assertGreater(gain_at(points, 8.0), 0.1)
        self.assertEqual(gain_at(points, 9.0), 0.0)
        self.assertEqual(gain_at(points, 12.137), 0.0)
        gains = [gain_at(points, 3.5 + index / 10) for index in range(56)]
        self.assertTrue(all(before >= after for before, after in zip(gains, gains[1:])))
        self.assertLess(gain_at(points, duration - 1 / 44100), 0.00001)

    def test_short_opening_finishes_half_a_second_before_prose(self):
        duration, points = music.intro_music_profile([(7.0, 9.0, None, "caption", ())])
        self.assertEqual(duration, 6.5)
        self.assertGreater(gain_at(points, 5.0), 0)
        self.assertEqual(gain_at(points, 7.0), 0)

    def test_prologue_keeps_the_existing_fade_before_its_four_second_voice_start(self):
        scenes = [(0, 4, None, "caption", ()), (4, 10, None, "caption", ())]
        duration, points = music.intro_music_profile(scenes)
        self.assertEqual(duration, 4.0)
        self.assertEqual(points, [(0.0, 0.0), (0.8, 1.0), (2.5, 1.0), (3.5, 0.0)])
        self.assertEqual(gain_at(points, 4.0), 0.0)

    def test_music_only_lead_and_scene_breaks_are_not_spoken_prose(self):
        scenes = [(0, 4, None, "caption", ()), (7, 8, None, "plain", ()),
                  (12, 16, None, "caption", ())]
        self.assertEqual(music.intro_music_profile(scenes)[0], 9.0)

    def test_missing_prose_keeps_the_existing_short_opening(self):
        self.assertEqual(music.intro_music_profile([]), music.intro_music_profile([(4, 7, None, "card", ())]))


if __name__ == "__main__":
    unittest.main()
