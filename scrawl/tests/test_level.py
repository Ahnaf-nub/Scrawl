"""Run with:  python -m unittest discover -s tests"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.level import extract_json, sanitize  # noqa: E402


class ExtractJson(unittest.TestCase):
    def test_plain(self):
        self.assertEqual(extract_json('{"a": 1}'), {"a": 1})

    def test_fenced_with_chatter(self):
        reply = 'Sure! Here you go:\n```json\n{"goal": {"x": 5, "y": 6}}\n```\nEnjoy.'
        self.assertEqual(extract_json(reply)["goal"]["x"], 5)

    def test_garbage(self):
        for bad in ["", "no json here", "{broken"]:
            with self.assertRaises(ValueError):
                extract_json(bad)


class Sanitize(unittest.TestCase):
    def test_empty_level_is_still_playable(self):
        lvl = sanitize({})
        self.assertTrue(lvl["platforms"])
        self.assertIn("x", lvl["player"])
        self.assertIn("x", lvl["goal"])

    def test_clamps_and_inflates(self):
        lvl = sanitize({
            "platforms": [{"x": -50, "y": 140, "w": 500, "h": 0}],
            "coins": [{"x": "12", "y": None}, "nonsense", {"x": 999, "y": 5}],
        })
        p = lvl["platforms"][0]
        for k in ("x", "y", "w", "h"):
            self.assertGreaterEqual(p[k], 0)
        self.assertLessEqual(p["x"] + p["w"], 100.001)
        self.assertLessEqual(p["y"] + p["h"], 100.001)
        self.assertGreaterEqual(p["h"], 2.5)
        self.assertEqual(len(lvl["coins"]), 2)
        self.assertEqual(lvl["coins"][1]["x"], 100)

    def test_caps_object_counts(self):
        lvl = sanitize({"coins": [{"x": 1, "y": 1}] * 500, "enemies": [{"x": 1, "y": 1}] * 500})
        self.assertLessEqual(len(lvl["coins"]), 30)
        self.assertLessEqual(len(lvl["enemies"]), 12)

    def test_keeps_good_data(self):
        raw = {
            "title": "Castle",
            "player": {"x": 8, "y": 70},
            "goal": {"x": 92, "y": 20},
            "platforms": [{"x": 0, "y": 90, "w": 35, "h": 3}],
        }
        lvl = sanitize(raw)
        self.assertEqual(lvl["title"], "Castle")
        self.assertEqual(lvl["player"], {"x": 8.0, "y": 70.0})
        self.assertEqual(lvl["goal"], {"x": 92.0, "y": 20.0})


class GameTypes(unittest.TestCase):
    def test_maze(self):
        lvl = sanitize({"game": "maze", "walls": [{"x": 0, "y": 30, "w": 70, "h": 0}], "keys": [{"x": 5, "y": 5}], "enemies": []})
        self.assertEqual(lvl["game"], "maze")
        self.assertGreaterEqual(lvl["walls"][0]["h"], 1.8)
        self.assertIn("x", lvl["player"])
        self.assertIn("x", lvl["goal"])

    def test_race_needs_a_loop(self):
        lvl = sanitize({"game": "race", "track": [{"x": 1, "y": 1}]})
        self.assertEqual(lvl["game"], "race")
        self.assertGreaterEqual(len(lvl["track"]), 3)

    def test_race_clamps(self):
        pts = [{"x": -5, "y": 200}, {"x": 50, "y": 50}, {"x": 120, "y": 10}]
        for p in sanitize({"track": pts})["track"]:
            self.assertTrue(4 <= p["x"] <= 96 and 6 <= p["y"] <= 94)

    def test_game_inferred_when_missing(self):
        self.assertEqual(sanitize({"walls": []})["game"], "maze")
        self.assertEqual(sanitize({})["game"], "platformer")


if __name__ == "__main__":
    unittest.main()
