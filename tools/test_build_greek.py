"""Verify the read-only reproducibility check detects drift."""
from contextlib import redirect_stdout, redirect_stderr
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import build_greek


class StudyFormsTests(unittest.TestCase):
    def test_reviewed_forms_keep_source_counts_and_combine_only_study_frequency(self):
        terms = [{"id": "G1510", "lemma": "eimi", "frequency": 2, "partOfSpeech": "verb"},
                 {"id": "G2076", "lemma": "esti", "frequency": 10, "partOfSpeech": "unknown"},
                 {"id": "G3056", "lemma": "logos", "frequency": 7, "partOfSpeech": "noun"}]
        self.assertEqual(build_greek.add_study_forms(terms, {"groups": {"G1510": ["G2076"]}}), 1)
        self.assertEqual(terms[0]["lemmaFrequency"], 12)
        self.assertEqual(terms[1]["frequency"], 10)
        self.assertEqual(terms[1]["lemmaId"], "G1510")
        self.assertEqual(terms[1]["dictionaryLemma"], "eimi")
        self.assertEqual(terms[1]["partOfSpeech"], "verb")
        self.assertFalse(terms[2]["isInflected"])

    def test_invalid_or_ambiguous_mapping_fails(self):
        terms = [{"id": "G1", "lemma": "one", "frequency": 1, "partOfSpeech": "noun"},
                 {"id": "G2", "lemma": "two", "frequency": 1, "partOfSpeech": "noun"}]
        for mapping in [{"G1": ["G3"]}, {"G1": ["G1"]}, {"G1": ["G2"], "G2": ["G1"]}]:
            with self.subTest(mapping=mapping), self.assertRaises(ValueError):
                build_greek.add_study_forms(terms, {"groups": mapping})


class ReproducibilityCheckTests(unittest.TestCase):
    def test_check_detects_modified_or_missing_file_without_writing(self):
        for existing in [b"changed\n", None]:
            with self.subTest(existing=existing), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                directory = root / "docs/data/generated"
                directory.mkdir(parents=True)
                output = directory / "greek.json"
                if existing is not None:
                    output.write_bytes(existing)
                with patch.object(build_greek, "ROOT", root), \
                     patch.object(build_greek, "build", return_value=({"greek.json": b"expected\n"}, {})), \
                     patch("sys.argv", ["build_greek.py", "--check"]), \
                     redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as failure:
                    build_greek.main()
                self.assertEqual(failure.exception.code, 1)
                self.assertEqual(output.read_bytes() if output.exists() else None, existing)

    def test_check_accepts_identical_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / "docs/data/generated/greek.json"
            output.parent.mkdir(parents=True)
            output.write_bytes(b"expected\n")
            with patch.object(build_greek, "ROOT", root), \
                 patch.object(build_greek, "build", return_value=({"greek.json": b"expected\n"}, {})), \
                 patch("sys.argv", ["build_greek.py", "--check"]), redirect_stdout(io.StringIO()):
                build_greek.main()


if __name__ == "__main__":
    unittest.main()
