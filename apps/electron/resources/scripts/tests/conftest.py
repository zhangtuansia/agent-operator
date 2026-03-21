"""pytest configuration for DAZI document processing smoke tests.

Ensures the tests package is importable and provides shared fixtures.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure the tests directory is importable as a package
tests_dir = Path(__file__).resolve().parent
if str(tests_dir.parent) not in sys.path:
    sys.path.insert(0, str(tests_dir.parent))
