"""Test harness for DAZI document processing smoke tests.

Provides helpers to locate and run the Python scripts in the SKILLs directory.
Unlike Craft (which uses shell wrappers in resources/bin/), DAZI keeps its
document-processing scripts directly inside SKILLs/<tool>/scripts/.

The harness discovers the repo root, resolves script paths, and exposes a
lightweight ``run_script`` helper that executes a script via ``python3``.
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

# Navigate up from:
#   apps/electron/resources/scripts/tests/_tool_test_harness.py
# to the repo root (agent-operator).
REPO_ROOT = Path(__file__).resolve().parents[5]

# DAZI stores document tools as SKILLs
SKILLS_DIR = REPO_ROOT / "apps" / "electron" / "SKILLs"

# Individual skill script directories
PDF_SCRIPTS = SKILLS_DIR / "pdf" / "scripts"
DOCX_SCRIPTS = SKILLS_DIR / "docx" / "scripts"
XLSX_SCRIPTS = SKILLS_DIR / "xlsx"
PPTX_SCRIPTS = SKILLS_DIR / "pptx" / "scripts"


def resolve_python() -> str:
    """Return the python3 executable to use."""
    return sys.executable or "python3"


def build_env() -> dict[str, str]:
    """Build an environment dict suitable for running DAZI skill scripts.

    Sets SKILLS_ROOT so scripts can discover sibling skill directories,
    and ensures python3 is on PATH.
    """
    env = dict(os.environ)
    env["SKILLS_ROOT"] = str(SKILLS_DIR)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return env


def run_script(
    script_path: str | Path,
    *args: str,
    env: dict[str, str] | None = None,
    cwd: str | Path | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run a Python script and return the CompletedProcess.

    Parameters
    ----------
    script_path:
        Absolute or repo-relative path to the ``.py`` file.
    *args:
        CLI arguments forwarded to the script.
    env:
        Environment mapping; defaults to :func:`build_env`.
    cwd:
        Working directory; defaults to ``REPO_ROOT``.
    """
    if env is None:
        env = build_env()
    if cwd is None:
        cwd = REPO_ROOT

    script = Path(script_path)
    if not script.is_absolute():
        script = REPO_ROOT / script

    return subprocess.run(
        [resolve_python(), str(script), *args],
        cwd=str(cwd),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def has_dependency(module_name: str) -> bool:
    """Check whether a Python module is importable."""
    try:
        result = subprocess.run(
            [resolve_python(), "-c", f"import {module_name}"],
            capture_output=True,
            text=True,
            check=False,
        )
        return result.returncode == 0
    except Exception:
        return False
