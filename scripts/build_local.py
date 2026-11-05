#!/usr/bin/env python3
"""Build the site locally for a manual Netlify deploy.

Continuous deployment is stopped on the Netlify site, so a build no longer runs
on the server. This script reproduces the parts of that build that matter:

    docs/api/v1/*                     generated catalog
    netlify/functions/archive-sources.json   generated download source map
    site/                             MkDocs output
    site/_redirects, site/_headers    rules from netlify.toml

The last step is required because redirects and headers from netlify.toml are
normally written into the publish directory by Netlify's build. A manual deploy
uploads the publish directory as-is, so the rules must be materialised here.

Usage:
    python scripts/build_local.py
"""

from __future__ import annotations

import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
CONFIG = ROOT / "netlify.toml"


def run(*args: str) -> None:
    print("+", " ".join(args), flush=True)
    subprocess.run(args, cwd=ROOT, check=True)


def write_redirects(rules: list[dict]) -> None:
    lines = ["# Generated from netlify.toml by scripts/build_local.py."]
    for rule in rules:
        source = rule["from"]
        target = rule["to"]
        status = str(rule.get("status", 301))
        if rule.get("force"):
            status += "!"
        lines.append(f"{source}\t{target}\t{status}")
        conditions = rule.get("conditions")
        if conditions:
            # Conditions are rarely used; fail loudly instead of silently
            # dropping a rule that could change routing.
            raise SystemExit(f"unsupported redirect conditions on {source}: {conditions}")
    (SITE / "_redirects").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_headers(rules: list[dict]) -> None:
    chunks = ["# Generated from netlify.toml by scripts/build_local.py."]
    for rule in rules:
        values = rule.get("values") or rule.get("headers", {}).get("values") or {}
        lines = [rule["for"]]
        for key, value in values.items():
            lines.append(f"  {key}: {value}")
        chunks.append("\n".join(lines))
    (SITE / "_headers").write_text("\n\n".join(chunks) + "\n", encoding="utf-8")


def main() -> None:
    config = tomllib.loads(CONFIG.read_text(encoding="utf-8"))
    run(sys.executable, "scripts/generate_api.py")
    run(sys.executable, "-m", "mkdocs", "build", "--clean", "--strict")
    write_redirects(config.get("redirects", []))
    write_headers(config.get("headers", []))
    files = sum(1 for _ in SITE.rglob("*") if _.is_file())
    print(f"build ready: {SITE} ({files} files)")


if __name__ == "__main__":
    main()
