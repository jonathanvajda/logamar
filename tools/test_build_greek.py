"""Verify the read-only reproducibility check detects drift."""
from contextlib import redirect_stdout, redirect_stderr
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import build_greek


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
