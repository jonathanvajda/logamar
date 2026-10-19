"""Validate the shipped installation metadata and icons without dependencies."""
import json
from pathlib import Path
import struct
import unittest

DOCS = Path(__file__).resolve().parents[1] / "docs"


class PWAAssetsTests(unittest.TestCase):
    def test_manifest_is_relative_and_has_installable_icons(self):
        manifest = json.loads((DOCS / "manifest.webmanifest").read_bytes())
        self.assertEqual(manifest["start_url"], "./")
        self.assertEqual(manifest["scope"], "./")
        self.assertEqual(manifest["display"], "standalone")
        self.assertTrue(any(icon.get("purpose") == "maskable" for icon in manifest["icons"]))
        for icon in manifest["icons"]:
            with self.subTest(icon=icon["src"]):
                data = (DOCS / icon["src"]).read_bytes()
                self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
                width, height = struct.unpack(">II", data[16:24])
                self.assertEqual(f"{width}x{height}", icon["sizes"])

    def test_apple_and_favicon_sizes(self):
        apple = (DOCS / "icons/apple-touch-icon.png").read_bytes()
        self.assertEqual(struct.unpack(">II", apple[16:24]), (180, 180))
        ico = (DOCS / "favicon.ico").read_bytes()
        self.assertEqual(struct.unpack("<HHH", ico[:6]), (0, 1, 1))
        self.assertEqual(tuple(ico[6:8]), (32, 32))


if __name__ == "__main__":
    unittest.main()
