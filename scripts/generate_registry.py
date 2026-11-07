#!/usr/bin/env python3
"""Build the runtime registry object published to Cloudflare R2.

The Netlify functions read this object at request time. Archive metadata (size,
digest, fallback address) and catalog content can therefore change by replacing
one R2 object, with no new site deploy. The generated files under docs/api/v1
remain in the deploy as a fallback snapshot.

Usage:
    python scripts/generate_registry.py             write build/registry.json
    python scripts/generate_registry.py --check     validate without writing
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "build" / "registry.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_api as api


def build() -> dict:
    registry = api.load_registry()
    sources = api.archive_sources(registry)
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return {
        "schemaVersion": registry["schemaVersion"],
        "name": registry["name"],
        "updatedAt": registry["updatedAt"],
        "generatedAt": generated_at,
        "extensions": registry["extensions"],
        "sources": sources["files"],
    }


def validate(payload: dict) -> None:
    if not isinstance(payload.get("extensions"), list) or not payload["extensions"]:
        raise api.RegistryError("the runtime registry has no extensions")
    if not isinstance(payload.get("sources"), dict) or not payload["sources"]:
        raise api.RegistryError("the runtime registry has no archive sources")
    for entry in payload["extensions"]:
        for artifact in entry["artifacts"]:
            name = artifact["url"].split("?", 1)[0].rsplit("/", 1)[-1]
            if name not in payload["sources"]:
                raise api.RegistryError(f"archive '{name}' has no source record")
            record = payload["sources"][name]
            if record["size"] != artifact["size"] or record["sha256"] != artifact["sha256"]:
                raise api.RegistryError(f"archive '{name}' metadata does not match its catalog entry")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate without writing")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    arguments = parser.parse_args()

    try:
        payload = build()
        validate(payload)
    except api.RegistryError as error:
        print(f"registry error: {error}", file=sys.stderr)
        return 1

    if arguments.check:
        print(f"registry is valid: {len(payload['extensions'])} extension(s), "
              f"{len(payload['sources'])} archive(s)")
        return 0

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"wrote {arguments.output} ({arguments.output.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
