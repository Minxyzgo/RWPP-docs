#!/usr/bin/env python3
"""Validate the extension registry and generate the static JSON API.

The registry lives in ``data/extensions.json``. This script writes the files the
site serves, so the deployed API is a build product and can never drift from the
source data:

    docs/api/v1/index.json               full catalog (RWML reads this)
    docs/api/v1/search.json              compact records for search UIs
    docs/api/v1/extensions/<id>.json     one file per extension
    docs/api/v1/manifest.json            endpoint index, versions and counts
    netlify/functions/archive-sources.json  internal map used by the download function

Usage:
    python scripts/generate_api.py             # validate and write
    python scripts/generate_api.py --check     # validate only, used by CI
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "extensions.json"
API_DIR = ROOT / "docs" / "api" / "v1"
SOURCES_FILE = ROOT / "netlify" / "functions" / "archive-sources.json"

SCHEMA_VERSION = 1
PLATFORMS = {"jvm", "android"}
ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]+$")
VERSION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+-]*$")
DIGEST_PATTERN = re.compile(r"^[0-9a-f]{64}$")
ARCHIVE_PATH = "/api/archives/"
SOURCE_KEYS = ("github",)
TOKEN_TTL_SECONDS = 30 * 24 * 3600

REQUIRED_ENTRY_FIELDS = ("id", "name", "version", "artifacts")


class RegistryError(Exception):
    """A registry document that would produce a broken catalog."""


def text(value: object, field: str, where: str) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise RegistryError(f"{where}: '{field}' must be a string")
    return value.strip()


def text_list(value: object, field: str, where: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise RegistryError(f"{where}: '{field}' must be a list of strings")
    return [item.strip() for item in value if item.strip()]


def absolute_url(value: str, where: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc:
        raise RegistryError(f"{where}: download addresses must be absolute HTTPS URLs: {value}")
    if parsed.username or parsed.password:
        raise RegistryError(f"{where}: download addresses must not contain credentials")
    return value


def normalize_sources(raw: object, where: str) -> dict:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise RegistryError(f"{where}: 'sources' must be an object")
    unknown = sorted(set(raw) - set(SOURCE_KEYS))
    if unknown:
        raise RegistryError(f"{where}: unsupported source(s): {', '.join(unknown)}")
    result = {}
    for name in SOURCE_KEYS:
        value = raw.get(name)
        if value is None:
            continue
        result[name] = absolute_url(text(value, f"sources.{name}", where), where)
    return result


def normalize_artifact(raw: object, entry_id: str, entry_platforms: list[str], where: str) -> dict:
    if not isinstance(raw, dict):
        raise RegistryError(f"{where}: every artifact must be an object")
    artifact_id = text(raw.get("id"), "id", where) or entry_id
    platform = text(raw.get("platform") or raw.get("target"), "platform", where).lower()
    if platform and platform not in PLATFORMS:
        raise RegistryError(f"{where}: unsupported artifact platform '{platform}'")
    if platform and entry_platforms and platform not in entry_platforms:
        raise RegistryError(
            f"{where}: artifact platform '{platform}' is not listed in the entry's platforms"
        )
    url = absolute_url(text(raw.get("url") or raw.get("downloadUrl"), "url", where), where)
    digest = text(raw.get("sha256") or raw.get("digest"), "sha256", where).lower()
    if digest.startswith("sha256:"):
        digest = digest[7:]
    if not DIGEST_PATTERN.match(digest):
        raise RegistryError(f"{where}: 'sha256' must be a 64 character hex digest")
    size = raw.get("size", 0)
    if not isinstance(size, int) or isinstance(size, bool) or size <= 0:
        raise RegistryError(f"{where}: 'size' must be a positive integer")
    artifact = {"id": artifact_id, "platform": platform, "url": url, "sha256": digest, "size": size}
    sources = normalize_sources(raw.get("sources"), where)
    if sources:
        artifact["sources"] = sources
    return artifact


def normalize_entry(raw: object, position: int) -> dict:
    if not isinstance(raw, dict):
        raise RegistryError(f"extensions[{position}] must be an object")
    where = f"extensions[{position}]"
    for field in REQUIRED_ENTRY_FIELDS:
        if not raw.get(field):
            raise RegistryError(f"{where}: '{field}' is required")
    entry_id = text(raw.get("id"), "id", where)
    if not ID_PATTERN.match(entry_id):
        raise RegistryError(f"{where}: '{entry_id}' is not a valid extension id")
    where = f"extension '{entry_id}'"
    version = text(raw.get("version"), "version", where)
    if not VERSION_PATTERN.match(version):
        raise RegistryError(f"{where}: '{version}' is not a valid version")

    platforms = [item.lower() for item in text_list(raw.get("platforms"), "platforms", where)]
    for platform in platforms:
        if platform not in PLATFORMS:
            raise RegistryError(f"{where}: unsupported platform '{platform}'")
    if not platforms:
        platforms = sorted(PLATFORMS)

    artifacts_raw = raw.get("artifacts")
    if not isinstance(artifacts_raw, list) or not artifacts_raw:
        raise RegistryError(f"{where}: 'artifacts' must list at least one archive")
    artifacts = [
        normalize_artifact(item, entry_id, platforms, f"{where} artifact #{index}")
        for index, item in enumerate(artifacts_raw)
    ]
    covered = {artifact["platform"] or "any" for artifact in artifacts}
    for platform in platforms:
        if platform not in covered and "any" not in covered:
            raise RegistryError(f"{where}: no archive is published for the '{platform}' platform")

    downloads = raw.get("downloads", 0)
    if not isinstance(downloads, int) or isinstance(downloads, bool) or downloads < 0:
        raise RegistryError(f"{where}: 'downloads' must be a non-negative integer")

    return {
        "id": entry_id,
        "name": text(raw.get("name"), "name", where) or entry_id,
        "version": version,
        "apiVersion": text(raw.get("apiVersion"), "apiVersion", where),
        "summary": text(raw.get("summary"), "summary", where),
        "description": text(raw.get("description"), "description", where),
        "authors": text_list(raw.get("authors"), "authors", where),
        "tags": text_list(raw.get("tags"), "tags", where),
        "categories": text_list(raw.get("categories"), "categories", where),
        "license": text(raw.get("license"), "license", where),
        "homepage": text(raw.get("homepage"), "homepage", where),
        "icon": text(raw.get("icon"), "icon", where),
        "platforms": platforms,
        "downloads": downloads,
        "updatedAt": text(raw.get("updatedAt"), "updatedAt", where),
        "notes": text(raw.get("notes") or raw.get("changelog"), "notes", where),
        "artifacts": artifacts,
    }


def load_registry() -> dict:
    if not SOURCE.is_file():
        raise RegistryError(f"registry not found: {SOURCE}")
    try:
        document = json.loads(SOURCE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise RegistryError(f"{SOURCE} is not valid JSON: {error}") from error
    if not isinstance(document, dict):
        raise RegistryError("the registry document must be a JSON object")
    raw_entries = document.get("extensions")
    if not isinstance(raw_entries, list):
        raise RegistryError("the registry document needs an 'extensions' array")

    entries: list[dict] = []
    seen: set[str] = set()
    for position, raw in enumerate(raw_entries):
        entry = normalize_entry(raw, position)
        if entry["id"] in seen:
            raise RegistryError(f"duplicate extension id '{entry['id']}'")
        seen.add(entry["id"])
        entries.append(entry)

    return {
        "schemaVersion": SCHEMA_VERSION,
        "name": text(document.get("name"), "name", "registry") or "RWML Extension Registry",
        "updatedAt": text(document.get("updatedAt"), "updatedAt", "registry"),
        "extensions": entries,
    }


def public_entry(entry: dict) -> dict:
    """Entry as served publicly.

    Artifact source addresses are internal to the download function. They must
    never appear in the catalog, per-entry files or search responses.
    """
    result = dict(entry)
    result["artifacts"] = [
        {key: value for key, value in artifact.items() if key != "sources"}
        for artifact in entry["artifacts"]
    ]
    return result


def search_record(entry: dict) -> dict:
    return {
        "id": entry["id"],
        "name": entry["name"],
        "version": entry["version"],
        "summary": entry["summary"],
        "tags": entry["tags"],
        "categories": entry["categories"],
        "platforms": entry["platforms"],
        "updatedAt": entry["updatedAt"],
        "downloads": entry["downloads"],
    }


def sign_archive_urls(registry: dict, now: int) -> dict:
    """Attach a signed, expiring token to every site archive URL.

    The token binds the file name and a build sequence, so archive addresses
    cannot be guessed or reused after the expiry window. The signing key is a
    Netlify secret environment variable and never enters the repository.
    """
    secret = os.environ.get("RWPP_ARCHIVE_SECRET", "")
    if not secret:
        raise RegistryError("RWPP_ARCHIVE_SECRET is required to sign archive URLs")
    try:
        key = bytes.fromhex(secret)
    except ValueError:
        key = secret.encode("utf-8")
    if not key:
        raise RegistryError("RWPP_ARCHIVE_SECRET is empty")

    signed = json.loads(json.dumps(registry))
    for entry in signed["extensions"]:
        for artifact in entry["artifacts"]:
            base_url = artifact["url"].split("?", 1)[0]
            if ARCHIVE_PATH not in urlparse(base_url).path:
                continue
            name = PurePosixPath(urlparse(base_url).path).name
            claims = {"f": name, "s": now, "e": now + TOKEN_TTL_SECONDS}
            payload = base64.urlsafe_b64encode(
                json.dumps(claims, separators=(",", ":")).encode("utf-8")
            ).decode("ascii").rstrip("=")
            signature = base64.urlsafe_b64encode(
                hmac.new(key, payload.encode("ascii"), hashlib.sha256).digest()
            ).decode("ascii").rstrip("=")
            artifact["url"] = f"{base_url}?k={payload}.{signature}"
    return signed


def archive_sources(registry: dict) -> dict:
    """Map every site archive URL to the fallback address used by the download function.

    The primary object store is addressed from function environment variables, so
    its location is not part of the registry or the generated files.
    """
    files: dict[str, dict] = {}
    for entry in registry["extensions"]:
        for artifact in entry["artifacts"]:
            path = urlparse(artifact["url"]).path
            if ARCHIVE_PATH not in path:
                continue
            name = PurePosixPath(path).name
            where = f"archive '{name}'"
            if not name:
                raise RegistryError(f"{where}: the site archive URL has no file name")
            sources = artifact.get("sources") or {}
            if "github" not in sources:
                raise RegistryError(f"{where}: the 'github' source is required for site archives")
            if PurePosixPath(urlparse(sources["github"]).path).name != name:
                raise RegistryError(f"{where}: the 'github' source points to another file")
            if name in files:
                raise RegistryError(f"{where}: declared more than once")
            files[name] = {
                "github": sources["github"],
                "size": artifact["size"],
                "sha256": artifact["sha256"],
            }
    return {"files": files}


def write(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate without writing files")
    arguments = parser.parse_args()

    try:
        registry = load_registry()
        sources_payload = archive_sources(registry)
        published = sign_archive_urls(registry, int(time.time()))
    except RegistryError as error:
        print(f"registry error: {error}", file=sys.stderr)
        return 1

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    sources_payload["generatedAt"] = generated_at
    index_payload = {
        "schemaVersion": registry["schemaVersion"],
        "name": registry["name"],
        "generatedAt": generated_at,
        "registryUpdatedAt": registry["updatedAt"],
        "extensions": [public_entry(entry) for entry in published["extensions"]],
    }
    search_payload = {
        "schemaVersion": registry["schemaVersion"],
        "generatedAt": generated_at,
        "extensions": [search_record(entry) for entry in registry["extensions"]],
    }
    manifest_payload = {
        "schemaVersion": registry["schemaVersion"],
        "generatedAt": generated_at,
        "count": len(registry["extensions"]),
        "endpoints": {
            "catalog": "/api/v1/index.json",
            "search": "/api/v1/search.json",
            "searchFunction": "/api/search?q=",
            "extension": "/api/v1/extensions/{id}.json",
        },
    }

    if arguments.check:
        print(f"registry is valid: {len(registry['extensions'])} extension(s)")
        return 0

    write(API_DIR / "index.json", index_payload)
    write(API_DIR / "search.json", search_payload)
    write(API_DIR / "manifest.json", manifest_payload)
    write(SOURCES_FILE, sources_payload)
    extensions_dir = API_DIR / "extensions"
    extensions_dir.mkdir(parents=True, exist_ok=True)
    keep = set()
    for entry in published["extensions"]:
        target = extensions_dir / f"{entry['id']}.json"
        keep.add(target.name)
        write(target, public_entry(entry))
    for stale in extensions_dir.glob("*.json"):
        if stale.name not in keep:
            stale.unlink()

    print(f"generated {len(registry['extensions'])} extension(s) in {API_DIR.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
