"""Validate the shipped offline passage index against the vocabulary catalog."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PassageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = json.loads((ROOT / "docs/data/generated/passages.json").read_bytes())
        cls.books = {b["id"]: b for b in cls.index["books"]}
        cls.terms = {t["id"]: t for language in ["greek", "hebrew", "aramaic"] for t in json.loads((ROOT / f"docs/data/generated/{language}.json").read_bytes())}

    def test_complete_books_and_single_chapter_boundaries(self):
        self.assertEqual(len(self.books), 66)
        self.assertEqual(set(self.books["Jde"]["chapters"]), {"1"})
        self.assertEqual(len(self.books["Jde"]["chapters"]["1"]), 25)

    def test_only_unique_canonical_dictionary_terms(self):
        for book in self.books.values():
            for chapter in book["chapters"].values():
                for ids in chapter.values():
                    self.assertEqual(len(ids), len(set(ids)))
                    for identity in ids:
                        self.assertIn(identity, self.terms)
                        self.assertEqual(self.terms[identity].get("lemmaId", identity), identity)

    def test_familiar_passages_and_languages(self):
        self.assertIn("G3056", self.books["Jhn"]["chapters"]["1"]["1"])
        genesis = self.books["Gen"]["chapters"]["1"]["1"]
        self.assertIn("H1254a", genesis)
        self.assertTrue(all(self.terms[i]["language"] == "hebrew" for i in genesis))


if __name__ == "__main__":
    unittest.main()
