#!/usr/bin/env python3
"""Refresh a registry entry from locally built extension archives.

Digests and sizes in ``data/extensions.json`` must describe the files that are
actually published. This script reads those files, takes the versions from the
archives' own ``META-INF/extension.properties``, and rewrites the entry so the
catalog cannot advertise a digest that no longer matches.

Example (desktop and Android archives for the RWPP entry):

    python scripts/update_registry.py --entry io.github.rwpp --tag v2.0.0 \
        --jar jvm=../RWPP/rwpp-api/build/extensions/rwpp-api-1.0.2-jvm.jar \
        --jar jvm=../RWPP/rwpp-client/build/extensions/rwpp-client-2.0.0-jvm.jar \
        --jar android=../RWPP/rwpp-api/build/extensions/rwpp-api-1.0.2-android.jar \
        --jar android=../RWPP/rwpp-client/build/extensions/rwpp-client-2.0.0-android.jar

Run ``python scripts/generate_api.py`` afterwards to publish the change.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from datetime import date
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "extensions.json"
DESCRIPTOR = "META-INF/extension.properties"
PLATFORMS = ("jvm", "android")
TAG_PATTERN = re.compile(r"^v?[A-Za-z0-9][A-Za-z0-9._+-]*$")


class RegistryUpdateError(Exception):
    """Input that cannot produce a trustworthy entry."""


def read_descriptor(archive: Path) -> dict[str, str]:
    try:
        with zipfile.ZipFile(archive) as jar:
            try:
                raw = jar.read(DESCRIPTOR)
            except KeyError as missing:
                raise RegistryUpdateError(f"{archive.name} has no {DESCRIPTOR}") from missing
    except zipfile.BadZipFile as broken:
        raise RegistryUpdateError(f"{archive} is not a readable archive: {broken}") from broken

    properties: dict[str, str] = {}
    for line in raw.decode("utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        properties[key.strip()] = value.strip()
    if not properties.get("id"):
        raise RegistryUpdateError(f"{archive.name} declares no extension id")
    if not properties.get("version"):
        raise RegistryUpdateError(f"{archive.name} declares no version")
    return properties


def digest(archive: Path) -> tuple[str, int]:
    sha = hashlib.sha256()
    size = 0
    with archive.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(chunk)
            size += len(chunk)
    return sha.hexdigest(), size


def parse_jar_arguments(values: list[str]) -> list[tuple[str, Path]]:
    result: list[tuple[str, Path]] = []
    for value in values:
        if "=" not in value:
            raise RegistryUpdateError(f"--jar expects <platform>=<path>, got '{value}'")
        platform, path = value.split("=", 1)
        platform = platform.strip().lower()
        if platform not in PLATFORMS:
            raise RegistryUpdateError(f"unsupported platform '{platform}'")
        archive = Path(path).expanduser()
        if not archive.is_file():
            raise RegistryUpdateError(f"archive not found: {archive}")
        result.append((platform, archive.resolve()))
    if not result:
        raise RegistryUpdateError("at least one --jar is required")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--entry", required=True, help="registry entry id to update")
    parser.add_argument("--tag", required=True, help="release tag, for example v2.0.0")
    parser.add_argument(
        "--base-url",
        default="https://github.com/RWPP-Team/RWPP/releases/download/{tag}",
        help="download prefix; {tag} is replaced with --tag",
    )
    parser.add_argument("--jar", action="append", default=[], metavar="PLATFORM=PATH",
                        help="archive to publish, repeatable")
    parser.add_argument("--dry-run", action="store_true", help="print the entry without writing")
    arguments = parser.parse_args()

    if not TAG_PATTERN.match(arguments.tag):
        print(f"invalid release tag: {arguments.tag}", file=sys.stderr)
        return 1
    base = arguments.base_url.replace("{tag}", arguments.tag).rstrip("/")

    try:
        archives = parse_jar_arguments(arguments.jar)
        document = json.loads(SOURCE.read_text(encoding="utf-8"))
    except (RegistryUpdateError, json.JSONDecodeError, OSError) as error:
        print(f"cannot update the registry: {error}", file=sys.stderr)
        return 1

    entries = document.get("extensions")
    if not isinstance(entries, list):
        print("the registry document has no 'extensions' array", file=sys.stderr)
        return 1
    entry = next((item for item in entries if item.get("id") == arguments.entry), None)
    if entry is None:
        print(f"no registry entry with id '{arguments.entry}'", file=sys.stderr)
        return 1

    artifacts = []
    versions: dict[str, str] = {}
    api_versions: list[str] = []
    platforms = set()
    for platform, archive in archives:
        properties = read_descriptor(archive)
        sha, size = digest(archive)
        artifact_id = properties["id"]
        versions[artifact_id] = properties["version"]
        if properties.get("apiVersion"):
            api_versions.append(properties["apiVersion"])
        platforms.add(platform)
        artifacts.append({
            "id": artifact_id,
            "platform": platform,
            "url": f"{base}/{quote(archive.name)}",
            "sha256": sha,
            "size": size,
        })
        print(f"{platform:7} {artifact_id:24} {properties['version']:10} {size / 1048576:7.1f} MiB  {sha[:12]}…")

    entry_version = versions.get(arguments.entry) or max(versions.values())
    entry["version"] = entry_version
    if api_versions:
        entry["apiVersion"] = api_versions[0]
    entry["platforms"] = sorted(platforms, key=PLATFORMS.index)
    entry["updatedAt"] = date.today().isoformat()
    entry["artifacts"] = artifacts

    if arguments.dry_run:
        print(json.dumps(entry, ensure_ascii=False, indent=2))
        return 0

    SOURCE.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"updated '{arguments.entry}' to {entry_version} with {len(artifacts)} archive(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
