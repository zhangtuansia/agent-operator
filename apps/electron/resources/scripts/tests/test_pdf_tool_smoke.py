"""Smoke tests for DAZI PDF processing scripts.

Run with:
    cd /Users/wyatt/Downloads/DAZI/agent-operator
    python3 -m pytest apps/electron/resources/scripts/tests/test_pdf_tool_smoke.py -v

These tests verify the PDF skill scripts under SKILLs/pdf/scripts/.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

try:
    from ._tool_test_harness import (
        SKILLS_DIR,
        PDF_SCRIPTS,
        build_env,
        has_dependency,
        run_script,
    )
except ImportError:
    from _tool_test_harness import (
        SKILLS_DIR,
        PDF_SCRIPTS,
        build_env,
        has_dependency,
        run_script,
    )


# Skip entire module if pypdf is not installed
SKIP_REASON = None
if not has_dependency("pypdf"):
    SKIP_REASON = "pypdf not installed"


@unittest.skipIf(SKIP_REASON, SKIP_REASON or "")
class PdfToolSmokeTests(unittest.TestCase):
    """Smoke tests for PDF processing scripts in DAZI."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.env = build_env()
        cls.tmpdir_obj = tempfile.TemporaryDirectory(prefix="dazi-pdf-smoke-")
        cls.tmpdir = Path(cls.tmpdir_obj.name)

        # Create a small test PDF using pypdf directly
        cls.input_pdf = cls.tmpdir / "input.pdf"
        cls._create_test_pdf(cls.input_pdf)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmpdir_obj.cleanup()

    @staticmethod
    def _create_test_pdf(path: Path, pages: int = 3) -> None:
        """Create a minimal test PDF with the given number of pages."""
        from pypdf import PdfWriter

        writer = PdfWriter()
        for i in range(pages):
            writer.add_blank_page(width=612, height=792)
        with open(path, "wb") as f:
            writer.write(f)

    def test_check_fillable_fields_on_non_form_pdf(self) -> None:
        """check_fillable_fields.py should report no fillable fields on a blank PDF."""
        script = PDF_SCRIPTS / "check_fillable_fields.py"
        if not script.exists():
            self.skipTest(f"Script not found: {script}")

        result = run_script(script, str(self.input_pdf), env=self.env)
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn("does not have fillable form fields", result.stdout)

    def test_convert_pdf_to_images(self) -> None:
        """convert_pdf_to_images.py should produce one PNG per page."""
        script = PDF_SCRIPTS / "convert_pdf_to_images.py"
        if not script.exists():
            self.skipTest(f"Script not found: {script}")
        if not has_dependency("pdf2image"):
            self.skipTest("pdf2image not installed")

        output_dir = self.tmpdir / "images"
        output_dir.mkdir(exist_ok=True)

        result = run_script(
            script,
            str(self.input_pdf),
            str(output_dir),
            env=self.env,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)

        pngs = list(output_dir.glob("*.png"))
        self.assertGreaterEqual(len(pngs), 1, "Expected at least one PNG output")

    def test_check_bounding_boxes_valid_json(self) -> None:
        """check_bounding_boxes.py should accept well-formed fields.json without errors."""
        script = PDF_SCRIPTS / "check_bounding_boxes.py"
        if not script.exists():
            self.skipTest(f"Script not found: {script}")

        # Create a minimal valid fields.json (non-overlapping boxes)
        fields = {
            "form_fields": [
                {
                    "field_name": "Name",
                    "page_number": 1,
                    "label_bounding_box": [50, 700, 150, 720],
                    "entry_bounding_box": [160, 700, 400, 720],
                },
                {
                    "field_name": "Email",
                    "page_number": 1,
                    "label_bounding_box": [50, 660, 150, 680],
                    "entry_bounding_box": [160, 660, 400, 680],
                },
            ]
        }
        fields_path = self.tmpdir / "fields.json"
        fields_path.write_text(json.dumps(fields))

        result = run_script(script, str(fields_path), env=self.env)
        self.assertEqual(result.returncode, 0, msg=result.stderr)

    def test_check_bounding_boxes_overlapping_detects_error(self) -> None:
        """check_bounding_boxes.py should detect overlapping bounding boxes."""
        script = PDF_SCRIPTS / "check_bounding_boxes.py"
        if not script.exists():
            self.skipTest(f"Script not found: {script}")

        # Create fields.json with intentionally overlapping boxes
        fields = {
            "form_fields": [
                {
                    "field_name": "Name",
                    "page_number": 1,
                    "label_bounding_box": [50, 700, 200, 720],
                    "entry_bounding_box": [100, 700, 400, 720],  # overlaps label
                },
            ]
        }
        fields_path = self.tmpdir / "fields_overlap.json"
        fields_path.write_text(json.dumps(fields))

        result = run_script(script, str(fields_path), env=self.env)
        # Should report overlap (non-zero exit or error message)
        overlap_detected = result.returncode != 0 or "overlap" in result.stdout.lower() or "intersect" in result.stdout.lower()
        self.assertTrue(overlap_detected, "Expected overlap detection in output")

    def test_pypdf_basic_operations(self) -> None:
        """Verify core pypdf operations that DAZI skills depend on."""
        from pypdf import PdfReader, PdfWriter

        reader = PdfReader(str(self.input_pdf))
        self.assertEqual(len(reader.pages), 3)

        # Split: extract single page
        writer = PdfWriter()
        writer.add_page(reader.pages[0])
        single_page = self.tmpdir / "single.pdf"
        with open(single_page, "wb") as f:
            writer.write(f)

        reader2 = PdfReader(str(single_page))
        self.assertEqual(len(reader2.pages), 1)

        # Merge: combine two copies
        merger = PdfWriter()
        for p in reader.pages:
            merger.add_page(p)
        for p in reader.pages:
            merger.add_page(p)
        merged = self.tmpdir / "merged.pdf"
        with open(merged, "wb") as f:
            merger.write(f)

        reader3 = PdfReader(str(merged))
        self.assertEqual(len(reader3.pages), 6)


if __name__ == "__main__":
    unittest.main()
