"""Tests for STEPBible field selection, lexical mappings, and word counts."""
import unittest

from build_hebrew import count_rows, lexical_rows, normalize, pos, study_gloss
from prepare_stepbible import projection


class ProjectionTests(unittest.TestCase):
    def test_long_definitions_never_enter_projection(self):
        source = "notes\neStrong\tdStrong\tuStrong\tHebrew\tTransliteration\tMorph\tGloss\tMeaning\nH0001\tH0001G =\tH0001G\tאב\tav\tH:N-M\tfather\tRESTRICTED_DEFINITION\n"
        result = projection(source.encode("utf-8"), "tbesh").decode("utf-8")
        self.assertNotIn("RESTRICTED_DEFINITION", result)
        self.assertNotIn("Meaning", result)
        self.assertIn("father", result)

    def test_tahot_projection_omits_interlinear_and_variant_detail(self):
        source = "# Gen.1.1\tinterlinear\nGen.1.1#01=L\thebrew\ttranslit\ttranslation\t{H0001}\tHNcmsa\tvariant\tspelling\tinstance\talt\tconjoin\texpanded\n"
        result = projection(source.encode(), "tahot").decode()
        self.assertEqual(result.splitlines()[1:], ["Gen.1.1#01=L\t{H0001}\tHNcmsa"])


class LexiconTests(unittest.TestCase):
    def test_study_gloss_uses_source_head_without_repeated_sense_labels(self):
        self.assertEqual(study_gloss("to take: marry"), "to take")
        self.assertEqual(study_gloss("face: before"), "face")
        self.assertEqual(study_gloss("to say"), "to say")
        self.assertEqual(study_gloss("father of"), "father of")

    def test_extended_ids_and_aliases_are_preserved(self):
        rows = ["H5892a\tH5892A =\tH5892A\tעיר\tir\tH:N-M\texcitement",
                "H5892b\tH5892B =\tH5892B\tעיר\tir\tH:N-F\tcity",
                "H9001\tH9001 =\tH9001\tו\tv\tH:Conj\tand"]
        groups, aliases, excluded = lexical_rows(rows)
        self.assertEqual(set(groups), {"H5892a", "H5892b"})
        self.assertEqual(aliases["H5892B"], "H5892b")
        self.assertEqual(excluded, 1)
        self.assertEqual(normalize("H0001"), "H1")

    def test_long_definition_column_is_rejected(self):
        with self.assertRaises(ValueError):
            lexical_rows(["H0001\tH0001\tH0001\tאב\tav\tH:N-M\tfather\tdefinition"])

    def test_conflicting_alias_is_rejected(self):
        with self.assertRaises(ValueError):
            lexical_rows(["H1\tH1G\tH1\tאב\tav\tH:N-M\tfather",
                          "H2\tH1G\tH2\tאב\tav\tA:N-M\tfather"])

    def test_hebrew_aramaic_and_proper_name_grammar(self):
        self.assertEqual(pos("H:V"), "verb")
        self.assertEqual(pos("A:N-M"), "noun")
        self.assertEqual(pos("N:N--L"), "proper-noun")


class CountTests(unittest.TestCase):
    aliases = {"H1G": "H1", "H1H": "H1", "H2": "H2", "H9001": "H9001"}

    def test_main_qere_root_counts_ignore_affixes_and_lxx_additions(self):
        rows = [("Gen.1.1#01=L", "H9001/{H1G}", "HN"),
                ("Gen.1.1#02=Q(K)", "{H1H}", "HN"),
                ("Gen.1.1#03=X", "{H2}", "HN"),
                ("Gen.1.1#04=L", "{H9001}", "HC")]
        counts, examples, report = count_rows(rows, self.aliases)
        self.assertEqual(dict(counts), {"H1": 2})
        self.assertEqual(examples["H1"], ["Gen 1:1"])
        self.assertEqual(report["excludedLxxAdditionRows"], 1)
        self.assertEqual(report["excludedAffixRoots"], 1)

    def test_multiword_continuation_is_counted_once(self):
        rows = [("Gen.1.1#01=L", "{H1G}+", "HN"),
                ("Gen.1.1#02=L", "{H1G}", "HN"),
                ("Gen.1.1#03=L", "{H1G}", "HN")]
        counts, _, report = count_rows(rows, self.aliases)
        self.assertEqual(counts["H1"], 2)
        self.assertEqual(report["multiwordContinuationsSkipped"], 1)

    def test_unresolved_marker_does_not_drop_next_different_root(self):
        rows = [("Gen.1.1#01=L", "{H1G}+", "HN"), ("Gen.1.1#02=L", "{H2}", "HN")]
        counts, _, report = count_rows(rows, self.aliases)
        self.assertEqual(sum(counts.values()), 2)
        self.assertEqual(len(report["unresolvedContinuationMarkers"]), 1)

    def test_fallback_requires_unambiguous_target(self):
        counts, _, report = count_rows([("Gen.1.1#01=L", "{H1J}", "HN")], self.aliases)
        self.assertEqual(counts["H1"], 1)
        self.assertEqual(report["fallbackMappings"]["H1J"]["target"], "H1")
        _, _, ambiguous = count_rows([("Gen.1.1#01=L", "{H5I}", "HN")], {"H5A": "H5a", "H5B": "H5b"})
        self.assertEqual(ambiguous["unmappedTags"], {"H5I": 1})

    def test_documented_override_resolves_ambiguity(self):
        counts, _, _ = count_rows([("Gen.1.1#01=L", "{H5I}", "HN")],
                                 {"H5A": "H5a", "H5B": "H5b"},
                                 {"H5I": {"target": "H5b", "reason": "Reviewed source context"}})
        self.assertEqual(counts["H5b"], 1)

    def test_duplicate_reference_fails(self):
        with self.assertRaises(ValueError):
            count_rows([("Gen.1.1#01=L", "{H2}", "HN")] * 2, self.aliases)

    def test_empty_qere_is_reported_without_inventing_word(self):
        counts, _, report = count_rows([("Gen.1.1#01=Q(K)", "", "")], self.aliases)
        self.assertFalse(counts)
        self.assertEqual(report["emptyQereRows"], ["Gen.1.1#01=Q(K)"])

    def test_malformed_root_fails(self):
        with self.assertRaises(ValueError):
            count_rows([("Gen.1.1#01=L", "{INVALID}", "HN")], self.aliases)


if __name__ == "__main__":
    unittest.main()
