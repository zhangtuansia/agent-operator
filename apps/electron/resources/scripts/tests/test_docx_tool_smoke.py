"""Smoke tests for DAZI DOCX processing scripts.

Run with:
    cd /Users/wyatt/Downloads/DAZI/agent-operator
    python3 -m pytest apps/electron/resources/scripts/tests/test_docx_tool_smoke.py -v

Tests verify the docx skill scripts under SKILLs/docx/ including
the ooxml pack/unpack utilities and the Document class.
"""

from __future__ import annotations

import tempfile
import unittest
import zipfile
from pathlib import Path

try:
    from ._tool_test_harness import (
        SKILLS_DIR,
        DOCX_SCRIPTS,
        build_env,
        has_dependency,
        run_script,
    )
except ImportError:
    from _tool_test_harness import (
        SKILLS_DIR,
        DOCX_SCRIPTS,
        build_env,
        has_dependency,
        run_script,
    )


SKIP_REASON = None
if not has_dependency("defusedxml"):
    SKIP_REASON = "defusedxml not installed"


@unittest.skipIf(SKIP_REASON, SKIP_REASON or "")
class DocxToolSmokeTests(unittest.TestCase):
    """Smoke tests for DOCX processing scripts in DAZI."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.env = build_env()
        cls.tmpdir_obj = tempfile.TemporaryDirectory(prefix="dazi-docx-smoke-")
        cls.tmpdir = Path(cls.tmpdir_obj.name)

        # Create a minimal .docx file (it's just a ZIP of XML files)
        cls.input_docx = cls.tmpdir / "input.docx"
        cls._create_minimal_docx(cls.input_docx)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmpdir_obj.cleanup()

    @staticmethod
    def _create_minimal_docx(path: Path) -> None:
        """Create a minimal valid .docx file with basic content."""
        content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

        rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

        document = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Hello World</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Test Document</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>"""

        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("[Content_Types].xml", content_types)
            zf.writestr("_rels/.rels", rels)
            zf.writestr("word/document.xml", document)

    def test_unpack_docx(self) -> None:
        """unpack.py should extract and pretty-print XML from a .docx file."""
        unpack_script = SKILLS_DIR / "docx" / "ooxml" / "scripts" / "unpack.py"
        if not unpack_script.exists():
            self.skipTest(f"Script not found: {unpack_script}")

        output_dir = self.tmpdir / "unpacked"
        result = run_script(
            unpack_script,
            str(self.input_docx),
            str(output_dir),
            env=self.env,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertTrue(output_dir.exists())

        # Verify document.xml was extracted
        doc_xml = output_dir / "word" / "document.xml"
        self.assertTrue(doc_xml.exists(), "Expected word/document.xml in unpacked output")

        # Verify content is present
        content = doc_xml.read_text(encoding="utf-8")
        self.assertIn("Hello World", content)

    def test_pack_roundtrip(self) -> None:
        """Unpack then re-pack should produce a valid .docx file."""
        unpack_script = SKILLS_DIR / "docx" / "ooxml" / "scripts" / "unpack.py"
        pack_script = SKILLS_DIR / "docx" / "ooxml" / "scripts" / "pack.py"
        if not unpack_script.exists() or not pack_script.exists():
            self.skipTest("unpack.py or pack.py not found")

        # Unpack
        unpack_dir = self.tmpdir / "roundtrip_unpack"
        result1 = run_script(
            unpack_script,
            str(self.input_docx),
            str(unpack_dir),
            env=self.env,
        )
        self.assertEqual(result1.returncode, 0, msg=result1.stderr)

        # Re-pack (with --force to skip validation that may require extra deps)
        repacked = self.tmpdir / "repacked.docx"
        result2 = run_script(
            pack_script,
            str(unpack_dir),
            str(repacked),
            "--force",
            env=self.env,
        )
        self.assertEqual(result2.returncode, 0, msg=result2.stderr)
        self.assertTrue(repacked.exists())

        # Verify the repacked file is a valid ZIP
        self.assertTrue(zipfile.is_zipfile(str(repacked)))

        # Verify it contains the expected structure
        with zipfile.ZipFile(repacked) as zf:
            names = zf.namelist()
            self.assertTrue(
                any("document.xml" in n for n in names),
                f"Expected document.xml in repacked .docx, got: {names}",
            )

    def test_docx_is_valid_zip(self) -> None:
        """Verify that created .docx files are valid ZIP archives."""
        self.assertTrue(zipfile.is_zipfile(str(self.input_docx)))

    def test_document_xml_structure(self) -> None:
        """Verify the document.xml inside a .docx has expected structure."""
        with zipfile.ZipFile(self.input_docx) as zf:
            with zf.open("word/document.xml") as f:
                content = f.read().decode("utf-8")
        self.assertIn("<w:document", content)
        self.assertIn("<w:body", content)
        self.assertIn("Hello World", content)
        self.assertIn("Test Document", content)


if __name__ == "__main__":
    unittest.main()
