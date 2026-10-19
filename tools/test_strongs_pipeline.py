"""Run with: python -m unittest discover -s tools -p 'test_*.py'."""
import json
from pathlib import Path
import tempfile
import unittest

from count_strongs import kjv_book, normalize_id, read_json, tr_ids
from merge_strongs_frequencies import merge


class TRTests(unittest.TestCase):
    def test_repeated_words_are_occurrences(self):
        self.assertEqual(tr_ids("λογος G3056 N-NSM λογος G3056 N-NSM")[0], ["G3056", "G3056"])

    def test_parsing_codes_are_excluded(self):
        result = tr_ids("λεγων G3004 G5723 V-PAP-NSM")
        self.assertEqual(result[:2], (["G3004"], 1))

    def test_repeated_analyses_do_not_double_count_word(self):
        result = tr_ids("γη G1093 N-NSF G1093 N-VSF")
        self.assertEqual(result[0], ["G1093"])
        self.assertEqual(len(result[4]), 1)

    def test_different_assignments_are_reported_and_first_selected(self):
        result = tr_ids("αυτη G846 P-NSF G3778 D-NSF")
        self.assertEqual(result[0], ["G846"])
        self.assertEqual(result[4][0]["annotations"], ["G846", "G3778"])

    def test_phrase_has_one_lexical_assignment(self):
        self.assertEqual(tr_ids("ινα τι G2444 ADV-I")[0], ["G2444"])

    def test_variant_and_subscription_excluded(self):
        result = tr_ids("συχεμ G4966 N-PRI VAR2: σιχεμ G4966 N-PRI } [προς G4314 PREP ρωμης] G4516 N-GSF")
        self.assertEqual(result[0], ["G4966"])
        self.assertEqual(result[2:4], (1, True))

    def test_unknown_markup_and_missing_annotation_fail(self):
        for text in ["λογος", "λογος G3056", "λογος G5723 V-PAP-NSM", "VAR3: λογος G3056 N-NSM"]:
            with self.subTest(text=text), self.assertRaises(ValueError):
                tr_ids(text)


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "Mat.json"

    def write(self, text):
        self.path.write_text(text, encoding="utf-8")

    def test_identical_cumulative_records_count_once(self):
        verse = {"Mat|1|1": {"en": "Word[G3056][G3056]"}}
        self.write(json.dumps({"Matthew": {"Mat|1": verse, "Mat|2": verse}}))
        with self.assertRaises(ValueError):
            kjv_book(self.path, "Mat")
        chapters, report = kjv_book(self.path, "Mat", True)
        self.assertEqual(len(chapters["Mat|1"]), 1)
        self.assertEqual(report["identicalDuplicateVerseRecordsExcluded"], 1)

    def test_conflicting_duplicate_fails(self):
        self.write(json.dumps({"Mat": {"Mat|1": {"Mat|1|1": {"en": "a"}}, "Mat|2": {"Mat|1|1": {"en": "b"}}}}))
        with self.assertRaises(ValueError):
            kjv_book(self.path, "Mat", True)

    def test_malformed_foreign_fields_and_appended_book(self):
        self.write('{"Mat":{"Mat|1":{"Mat|1|1":{"en":"Word[G3056]","bg":"bad "quotes""}}}}'
                   '{"Mar":{"Mar|1":{"Mar|1|1":{"en":"Other[G1]"}}}}')
        with self.assertRaises(ValueError):
            kjv_book(self.path, "Mat")
        chapters, report = kjv_book(self.path, "Mat", True)
        self.assertEqual(chapters["Mat|1"]["Mat|1|1"]["en"], "Word[G3056]")
        self.assertEqual(report["excludedForeignBookVerses"], {"Mar": 1})

    def test_missing_english_in_recovery_fails(self):
        self.write('{"Mat|1|1":{"en":"yes"},"Mat|1|2":{"bg":"bad "quotes""}}')
        with self.assertRaises(ValueError):
            kjv_book(self.path, "Mat", True)

    def test_duplicate_json_keys_fail(self):
        self.write('{"a":1,"a":2}')
        with self.assertRaises(ValueError):
            read_json(self.path)


class MergeTests(unittest.TestCase):
    def dataset(self):
        return {"schemaVersion": 1, "corpora": {"tr_nt": {
            "counts": {"G1": 4, "G2": 3}, "occurrences": 7, "uniqueStrongsIds": 2,
            "exampleRefs": {"G1": ["Matthew 1:1"]},
            "name": "Test", "unit": "annotations", "policy": "first",
        }}}

    def test_exact_join_preserves_rows_and_fields_without_inflation(self):
        terms = [{"id": "G1", "language": "greek", "lemma": "alpha", "frequencies": {"lxx": 9}},
                 {"id": "G1", "language": "greek", "lemma": "alternate"},
                 {"id": "G1a", "language": "greek"}]
        result, report = merge(terms, self.dataset(), "tr_nt")
        self.assertEqual([t["frequency"] for t in result], [4, 4, 0])
        self.assertEqual(result[0]["frequencies"], {"lxx": 9, "tr_nt": 4, "gnt": 4})
        self.assertEqual(result[0]["lemma"], "alpha")
        self.assertEqual(report["matchedOccurrences"], 4)
        self.assertEqual(report["unmatchedFrequencyIds"], {"G2": 3})
        self.assertNotIn("frequency", terms[0])

    def test_wrong_language_fails(self):
        with self.assertRaises(ValueError):
            merge([{"id": "H1", "language": "hebrew"}], self.dataset(), "tr_nt")

    def test_corrupt_counts_fail(self):
        for value in [-1, True, "4"]:
            data = self.dataset()
            data["corpora"]["tr_nt"]["counts"]["G1"] = value
            with self.subTest(value=value), self.assertRaises(ValueError):
                merge([{"id": "G1", "language": "greek"}], data, "tr_nt")

    def test_normalization(self):
        self.assertEqual(normalize_id("G0001"), "G1")
        self.assertEqual(normalize_id("H0012"), "H12")


if __name__ == "__main__":
    unittest.main()
