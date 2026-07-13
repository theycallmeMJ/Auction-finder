#!/usr/bin/env python3
"""Fill BAANKNET map coordinates and nearby-place evidence without a full scrape."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
AUCTIONS_PATH = DATA_DIR / "auctions.json"

COORDINATE_LIMIT = int(os.environ.get("BAANKNET_MAP_COORDINATE_LIMIT", os.environ.get("BAANKNET_ENRICH_LIMIT", "1000")))
NEARBY_LIMIT = int(os.environ.get("BAANKNET_NEARBY_LIMIT", "120"))
RUN_SCORE_ENGINE = os.environ.get("BAANKNET_SCORE", "1") == "1"


def load_script_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if not spec or not spec.loader:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def needs_coordinates(auction: dict[str, Any]) -> bool:
    return bool(auction.get("propertyDetailUrl")) and not (auction.get("latitude") and auction.get("longitude"))


def needs_nearby(auction: dict[str, Any]) -> bool:
    nearby = auction.get("nearbyPlaces")
    failed = isinstance(nearby, dict) and nearby.get("status") == "failed"
    return bool(auction.get("latitude") and auction.get("longitude")) and (not nearby or failed)


def main() -> None:
    if not AUCTIONS_PATH.exists():
        raise SystemExit(f"Missing {AUCTIONS_PATH}. Run the normal scraper first.")

    auctions = json.loads(AUCTIONS_PATH.read_text(encoding="utf-8"))
    before_missing_coordinates = sum(1 for auction in auctions if needs_coordinates(auction))
    before_missing_nearby = sum(1 for auction in auctions if needs_nearby(auction))

    print(
        "Map-only enrichment starting. "
        f"{before_missing_coordinates} rows missing coordinates; "
        f"{before_missing_nearby} mapped rows missing nearby evidence.",
        flush=True,
    )

    scraper = load_script_module("scrape_baanknet", ROOT / "scripts" / "scrape_baanknet.py")
    scraper.NEARBY_LIMIT = NEARBY_LIMIT
    session = scraper.start_session()
    scraper.enrich_property_locations(session, auctions, COORDINATE_LIMIT)

    after_missing_coordinates = sum(1 for auction in auctions if needs_coordinates(auction))
    after_missing_nearby = sum(1 for auction in auctions if needs_nearby(auction))

    AUCTIONS_PATH.write_text(json.dumps(auctions, indent=2, ensure_ascii=False), encoding="utf-8")

    if RUN_SCORE_ENGINE:
        score_module = load_script_module("score_auctions", ROOT / "scripts" / "score_auctions.py")
        score_module.main()

    print(
        "Map-only enrichment finished. "
        f"Coordinates filled this run: {max(before_missing_coordinates - after_missing_coordinates, 0)}. "
        f"Nearby rows filled this run: {max(before_missing_nearby - after_missing_nearby, 0)}. "
        f"Still missing coordinates: {after_missing_coordinates}. "
        f"Still missing nearby evidence: {after_missing_nearby}.",
        flush=True,
    )


if __name__ == "__main__":
    main()
