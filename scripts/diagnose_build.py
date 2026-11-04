#!/usr/bin/env python3
"""Temporary Netlify build diagnostic. Reports the signing environment and the
registry generator result into docs/_diag.json so a deployed site can show it.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

result = subprocess.run(
    [sys.executable, "scripts/generate_api.py"],
    capture_output=True,
    text=True,
)
data = {
    "python": sys.version,
    "secret": bool(os.environ.get("RWPP_ARCHIVE_SECRET")),
    "keys": sorted(key for key in os.environ if key.startswith("RWPP_")),
    "generate_returncode": result.returncode,
    "generate_stdout": result.stdout[-2000:],
    "generate_stderr": result.stderr[-2000:],
}
Path("docs/_diag.json").write_text(
    json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(data, ensure_ascii=False))
