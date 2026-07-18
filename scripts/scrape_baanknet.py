#!/usr/bin/env python3
"""Fetch BAANKNET eproc auction listings into static JSON files.

The public eproc page renders results from an HTML-returning AJAX endpoint.
This script keeps the session cookie/CSRF token, submits filters, parses the
listing cards, and writes static JSON for the frontend.
"""

from __future__ import annotations

import html
import json
import math
import os
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from http.cookiejar import CookieJar
from pathlib import Path
from typing import Any
import importlib.util


BASE_URL = "https://baanknet.com/eauction-psb"
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "public" / "data"

STATUSES = {
    "all": "-1",
    "upcoming": "1",
    "live": "4",
    "closed": "5",
    "cancelled": "2",
}

PROPERTY_TYPES = {
    "1": "Residential",
    "2": "Commercial",
    "3": "Agriculture",
    "4": "Industrial",
    "5": "Other",
}

POSSESSION_TYPES = {
    "1": "Physical",
    "2": "Symbolic",
    "3": "Other",
}

PROPERTY_SUBTYPE_FALLBACKS = [
    {"id": "house", "name": "Individual House", "propertyTypeId": "1"},
    {"id": "flat", "name": "Flat", "propertyTypeId": "1"},
    {"id": "plot", "name": "Plot", "propertyTypeId": "1"},
    {"id": "land-building", "name": "Land and Building", "propertyTypeId": "2"},
    {"id": "godown", "name": "Godown", "propertyTypeId": "2"},
    {"id": "vacant-land", "name": "Vacant Land", "propertyTypeId": "3"},
    {"id": "industrial-building", "name": "Industrial Building", "propertyTypeId": "4"},
    {"id": "other", "name": "Other", "propertyTypeId": "5"},
]

DEFAULT_STATE_ID = os.environ.get("BAANKNET_STATE_ID", "17")
DEFAULT_DISTRICT_ID = os.environ.get("BAANKNET_DISTRICT_ID", "")
SCRAPE_STATUSES = [
    status.strip()
    for status in os.environ.get("BAANKNET_STATUSES", "upcoming,live,cancelled,closed").split(",")
    if status.strip()
]
MAX_CLOSED_PAGES = int(os.environ.get("BAANKNET_MAX_CLOSED_PAGES", "10"))
ENRICH_DETAILS = os.environ.get("BAANKNET_ENRICH_DETAILS", "1") == "1"
ENRICH_LIMIT = int(os.environ.get("BAANKNET_ENRICH_LIMIT", "1000"))
ENRICH_LOCATION = os.environ.get("BAANKNET_ENRICH_LOCATION", "1") == "1"
NEARBY_LIMIT = int(os.environ.get("BAANKNET_NEARBY_LIMIT", "120"))
OVERPASS_URL = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
RUN_SCORE_ENGINE = os.environ.get("BAANKNET_SCORE", "1") == "1"
INCREMENTAL_REFRESH = os.environ.get("BAANKNET_INCREMENTAL", "0") == "1"
DRY_RUN = os.environ.get("BAANKNET_DRY_RUN", "0") == "1"
ALLOW_STALE_ON_BLOCK = os.environ.get("BAANKNET_ALLOW_STALE_ON_BLOCK", "1") == "1"

DETAIL_FIELDS = [
    "propertyAddress",
    "borrowerName",
    "borrowerAddress",
    "customerId",
    "branch",
    "officer",
    "carpetArea",
    "builtUpArea",
    "areaSqft",
    "typeOfAction",
    "dealingOfficer",
    "mobileNo",
    "branchAddress",
    "inspectionDateFrom",
    "inspectionDateTo",
    "emdStartDate",
    "emdEndDate",
    "emd",
    "incrementPrice",
    "incrementDuringExtension",
    "extendWhenBidInLastMinutes",
    "extendByMinutes",
    "latitude",
    "longitude",
    "nearbyPlaces",
]

REUSABLE_ENRICHED_FIELDS = DETAIL_FIELDS + [
    "possessionStatus",
    "pricePerSqft",
    "score",
]

LISTING_SIGNATURE_FIELDS = [
    "auctionId",
    "status",
    "bankPropertyId",
    "reservePrice",
    "startDate",
    "endDate",
]


@dataclass
class Session:
    opener: urllib.request.OpenerDirector
    csrf: str
    form: dict[str, str]


def request_headers(content_type: str | None = None) -> dict[str, str]:
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*",
        "Referer": f"{BASE_URL}/eproc-listing",
        "X-Requested-With": "XMLHttpRequest",
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def fetch_text(opener: urllib.request.OpenerDirector, url: str, data: bytes | None = None, headers: dict[str, str] | None = None) -> str:
    req = urllib.request.Request(url, data=data, headers=headers or request_headers())
    return opener.open(req, timeout=45).read().decode("utf-8", "ignore")


def fetch_json(opener: urllib.request.OpenerDirector, url: str, data: bytes | None = None, headers: dict[str, str] | None = None) -> Any:
    return json.loads(fetch_text(opener, url, data=data, headers=headers))


def start_session() -> Session:
    context = ssl._create_unverified_context()
    jar = CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPSHandler(context=context),
    )
    page = fetch_text(
        opener,
        f"{BASE_URL}/eproc-listing",
        headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html,application/xhtml+xml"},
    )
    csrf_match = re.search(r'<meta name="_csrf" content="([^"]+)"', page)
    if not csrf_match:
        raise RuntimeError("Could not find BAANKNET CSRF token")

    fields: dict[str, str] = {}
    for match in re.finditer(r'<(?:input|select)[^>]+name="([^"]+)"[^>]*>', page):
        tag = match.group(0)
        name = match.group(1)
        value_match = re.search(r'value="([^"]*)"', tag)
        fields[name] = html.unescape(value_match.group(1)) if value_match else ""

    return Session(opener=opener, csrf=csrf_match.group(1), form=fields)


def get_json_map(session: Session, path: str) -> dict[str, str]:
    text = fetch_text(session.opener, f"{BASE_URL}{path}")
    return json.loads(text)


def post_search(session: Session, filters: dict[str, str], page: int, per_page: int = 10) -> str:
    payload = dict(session.form)
    payload.update(
        {
            "currentPage": str(page),
            "perPage": str(per_page),
            "searchType": "1",
            "searchBySubmit": "1",
            "_csrf": session.csrf,
            **filters,
        }
    )
    body = json.dumps(payload).encode("utf-8")
    headers = request_headers("application/json")
    headers["X-CSRF-TOKEN"] = session.csrf
    return fetch_text(session.opener, f"{BASE_URL}/ajax/search-auction", data=body, headers=headers)


def extract_record_count(fragment: str) -> int:
    match = re.search(r'id="recordCount" value="([^"]*)"', fragment)
    return int(match.group(1)) if match and match.group(1).isdigit() else 0


def normalize_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value).replace("\xa0", " ")
    return re.sub(r"\s+", " ", value).strip()


def money_to_rupees(value: str) -> int | None:
    cleaned = value.strip()
    comma_amount = re.search(r"^\s*[\d,]+(?:\.\d+)?\s*$", cleaned)
    if comma_amount:
        return int(round(float(cleaned.replace(",", ""))))

    match = re.search(r"([\d,.]+)\s*(Lakh|Crore)?", cleaned, re.I)
    if not match:
        return None
    amount = float(match.group(1).replace(",", ""))
    unit = (match.group(2) or "").lower()
    if unit == "crore":
        amount *= 10_000_000
    elif unit == "lakh":
        amount *= 100_000
    return int(round(amount))


def infer_property(title: str) -> tuple[str, str]:
    lower = title.lower()
    if "flat" in lower or "apartment" in lower:
        return "Residential", "Flat"
    if "house" in lower or "bhk" in lower or "villa" in lower:
        return "Residential", "Individual House"
    if "plot" in lower:
        return "Residential", "Plot"
    if "vacant" in lower or "land" in lower:
        return "Agriculture", "Vacant Land"
    if "godown" in lower:
        return "Commercial", "Godown"
    if "shop" in lower or "building" in lower or "mill" in lower:
        return "Commercial", "Land and Building"
    return "Other", "Other"


def absolute_url(url: str) -> str:
    if url.startswith("http://") or url.startswith("https://"):
        return url.replace("http://baanknet.com", "https://baanknet.com")
    if url.startswith("/"):
        return f"https://baanknet.com{url}"
    return f"{BASE_URL}/{url}"


def property_detail_id(url: str) -> str | None:
    match = re.search(r"/view-property/(\d+)/", url or "")
    return match.group(1) if match else None


def number_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).strip())
    except ValueError:
        return None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0088
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


NEARBY_CATEGORIES = {
    "schools": {
        "radius": 5000,
        "filters": [
            'node["amenity"~"school|college|university"]',
            'way["amenity"~"school|college|university"]',
            'relation["amenity"~"school|college|university"]',
        ],
    },
    "hospitals": {
        "radius": 8000,
        "filters": [
            'node["amenity"~"hospital|clinic"]',
            'way["amenity"~"hospital|clinic"]',
            'relation["amenity"~"hospital|clinic"]',
            'node["healthcare"~"hospital|clinic"]',
            'way["healthcare"~"hospital|clinic"]',
            'relation["healthcare"~"hospital|clinic"]',
        ],
    },
    "bus_stands": {
        "radius": 5000,
        "filters": [
            'node["amenity"="bus_station"]',
            'way["amenity"="bus_station"]',
            'relation["amenity"="bus_station"]',
            'node["public_transport"="station"]["bus"="yes"]',
            'way["public_transport"="station"]["bus"="yes"]',
            'relation["public_transport"="station"]["bus"="yes"]',
        ],
    },
    "metro": {
        "radius": 5000,
        "filters": [
            'node["railway"="station"]["station"="subway"]',
            'way["railway"="station"]["station"="subway"]',
            'relation["railway"="station"]["station"="subway"]',
            'node["railway"="station"]["subway"="yes"]',
            'way["railway"="station"]["subway"="yes"]',
            'relation["railway"="station"]["subway"="yes"]',
        ],
    },
}


def should_check_metro(auction: dict[str, Any]) -> bool:
    text = " ".join(
        str(auction.get(key) or "")
        for key in ("district", "city", "location", "propertyAddress")
    ).lower()
    return any(word in text for word in ("ernakulam", "kochi", "kalamassery", "thrikkakara", "edappally", "vyttila", "aluva"))


def overpass_query(lat: float, lon: float, include_metro: bool) -> str:
    parts = []
    for category, config in NEARBY_CATEGORIES.items():
        if category == "metro" and not include_metro:
            continue
        radius = config["radius"]
        parts.extend(f"{filter_expr}(around:{radius},{lat},{lon});" for filter_expr in config["filters"])
    return f"[out:json][timeout:25];({''.join(parts)});out center tags;"


def element_coordinates(element: dict[str, Any]) -> tuple[float, float] | None:
    lat = number_or_none(element.get("lat") or element.get("center", {}).get("lat"))
    lon = number_or_none(element.get("lon") or element.get("center", {}).get("lon"))
    if lat is None or lon is None:
        return None
    return lat, lon


def classify_osm_element(element: dict[str, Any]) -> set[str]:
    tags = element.get("tags") or {}
    amenity = str(tags.get("amenity") or "")
    healthcare = str(tags.get("healthcare") or "")
    railway = str(tags.get("railway") or "")
    station = str(tags.get("station") or "")
    subway = str(tags.get("subway") or "")
    public_transport = str(tags.get("public_transport") or "")
    bus = str(tags.get("bus") or "")
    categories: set[str] = set()
    if amenity in {"school", "college", "university"}:
        categories.add("schools")
    if amenity in {"hospital", "clinic"} or healthcare in {"hospital", "clinic"}:
        categories.add("hospitals")
    if amenity == "bus_station" or (public_transport == "station" and bus == "yes"):
        categories.add("bus_stands")
    if railway == "station" and (station == "subway" or subway == "yes"):
        categories.add("metro")
    return categories


def nearby_summary(lat: float, lon: float, elements: list[dict[str, Any]], include_metro: bool) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "source": "openstreetmap-overpass",
        "radiusKm": 10,
        "coordinates": {"latitude": lat, "longitude": lon},
        "categories": {},
    }
    category_keys = ["schools", "hospitals", "bus_stands"] + (["metro"] if include_metro else [])
    buckets: dict[str, list[dict[str, Any]]] = {key: [] for key in category_keys}

    for element in elements:
        coords = element_coordinates(element)
        if not coords:
            continue
        distance = haversine_km(lat, lon, coords[0], coords[1])
        tags = element.get("tags") or {}
        name = str(tags.get("name") or tags.get("operator") or "Unnamed place")
        for category in classify_osm_element(element):
            if category not in buckets:
                continue
            buckets[category].append(
                {
                    "name": name[:120],
                    "distanceKm": round(distance, 2),
                    "osmType": element.get("type"),
                    "osmId": element.get("id"),
                }
            )

    for category, places in buckets.items():
        ordered = sorted(places, key=lambda item: item["distanceKm"])
        summary["categories"][category] = {
            "count": len(ordered),
            "nearestDistanceKm": ordered[0]["distanceKm"] if ordered else None,
            "nearestName": ordered[0]["name"] if ordered else None,
            "nearest": ordered[:5],
        }
    return summary


def fetch_nearby_places(lat: float, lon: float, include_metro: bool) -> dict[str, Any]:
    body = urllib.parse.urlencode({"data": overpass_query(lat, lon, include_metro)}).encode("utf-8")
    req = urllib.request.Request(
        OVERPASS_URL,
        data=body,
        headers={
            "User-Agent": "KeralaAuctionFinder/0.1 (nearby enrichment)",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        data = json.loads(response.read().decode("utf-8", "ignore"))
    return nearby_summary(lat, lon, data.get("elements") or [], include_metro)


def value_between(text: str, label: str, next_labels: list[str]) -> str:
    start = -1
    for match in re.finditer(re.escape(label), text, re.I):
        prefix = text[max(0, match.start() - 12) : match.start()].lower()
        if label.lower().startswith("area ") and ("carpet " in prefix or "built up " in prefix):
            continue
        start = match.start()
        break
    if start == -1:
        return ""
    start += len(label)
    while start < len(text) and text[start] in " :":
        start += 1
    end = len(text)
    for next_label in next_labels:
        for match in re.finditer(re.escape(next_label), text[start:], re.I):
            prefix = text[max(0, start + match.start() - 12) : start + match.start()].lower()
            if next_label.lower().startswith("area ") and ("carpet " in prefix or "built up " in prefix):
                continue
            end = min(end, start + match.start())
            break
    return text[start:end].strip(" :-")


DETAIL_LABELS = [
    "Auction ID",
    "Bank Property ID",
    "Customer ID",
    "Branch",
    "Officer, Designation",
    "Property Type",
    "Property Sub Type",
    "Property Title",
    "Property Address",
    "Borrower name",
    "Registered Address of Borrower",
    "Carpet Area (sq feet)",
    "Carpet Area (sq meter)",
    "Carpet Area (acres)",
    "Carpet Area (hectares)",
    "Carpet Area ()",
    "Built Up Area (sq feet)",
    "Built Up Area (sq meter)",
    "Built Up Area (acres)",
    "Built Up Area (hectares)",
    "Built Up Area ()",
    "Area (sq feet)",
    "Area (sq meter)",
    "Area (acres)",
    "Area (hectares)",
    "Area ()",
    "Is this property available for Loan offer?",
    "% of loan availability for indicative price",
    "Type of Action",
    "Inspection Detail",
    "Dealing Officer Name,Designation",
    "Mobile No.",
    "Branch Address",
    "Key Date",
    "Inspection Date & Time From",
    "Inspection Date & Time To",
    "EMD Start date & time",
    "EMD End date & time",
    "Auction Start Date & Time",
    "Auction End Date & Time",
    "Business Rules",
    "Reserve Price",
    "EMD",
    "Increment Price",
    "Increment Price During Time Extension",
    "Extend Time When Valid Bid Received in Last(In Minutes)",
    "Extend Time By (In Minutes)",
    "Download Document",
]


def parse_auction_notice(fragment: str) -> dict[str, str]:
    text = normalize_text(fragment)
    start = text.find("General Detail")
    if start != -1:
        text = text[start:]

    def val(label: str, after: str = "") -> str:
        scoped_text = text
        if after:
            anchor = scoped_text.lower().find(after.lower())
            if anchor != -1:
                scoped_text = scoped_text[anchor:]
        following = DETAIL_LABELS[DETAIL_LABELS.index(label) + 1 :] if label in DETAIL_LABELS else DETAIL_LABELS
        return value_between(scoped_text, label, following)

    def area_value(labels: list[tuple[str, str]]) -> str:
        for label, unit in labels:
            amount = val(label)
            if amount:
                return f"{amount} {unit}"
        return ""

    return {
        "auctionId": val("Auction ID"),
        "bankPropertyId": val("Bank Property ID"),
        "customerId": val("Customer ID"),
        "branch": val("Branch"),
        "officer": val("Officer, Designation"),
        "propertyType": val("Property Type"),
        "propertySubType": val("Property Sub Type"),
        "title": val("Property Title"),
        "propertyAddress": val("Property Address"),
        "borrowerName": val("Borrower name"),
        "borrowerAddress": val("Registered Address of Borrower"),
        "carpetArea": area_value([
            ("Carpet Area (sq feet)", "sq feet"),
            ("Carpet Area (sq meter)", "sq meter"),
            ("Carpet Area (acres)", "acres"),
            ("Carpet Area (hectares)", "hectares"),
            ("Carpet Area ()", "unit not specified"),
        ]),
        "builtUpArea": area_value([
            ("Built Up Area (sq feet)", "sq feet"),
            ("Built Up Area (sq meter)", "sq meter"),
            ("Built Up Area (acres)", "acres"),
            ("Built Up Area (hectares)", "hectares"),
            ("Built Up Area ()", "unit not specified"),
        ]),
        "areaSqft": area_value([
            ("Area (sq feet)", "sq feet"),
            ("Area (sq meter)", "sq meter"),
            ("Area (acres)", "acres"),
            ("Area (hectares)", "hectares"),
            ("Area ()", "unit not specified"),
        ]),
        "typeOfAction": val("Type of Action"),
        "dealingOfficer": val("Dealing Officer Name,Designation"),
        "mobileNo": val("Mobile No."),
        "branchAddress": val("Branch Address"),
        "inspectionDateFrom": val("Inspection Date & Time From"),
        "inspectionDateTo": val("Inspection Date & Time To"),
        "emdStartDate": val("EMD Start date & time"),
        "emdEndDate": val("EMD End date & time"),
        "startDate": val("Auction Start Date & Time"),
        "endDate": val("Auction End Date & Time"),
        "reservePriceText": val("Reserve Price", "Business Rules"),
        "emd": val("EMD", "Business Rules"),
        "incrementPrice": val("Increment Price", "Business Rules"),
        "incrementDuringExtension": val("Increment Price During Time Extension", "Business Rules"),
        "extendWhenBidInLastMinutes": val("Extend Time When Valid Bid Received in Last(In Minutes)", "Business Rules"),
        "extendByMinutes": val("Extend Time By (In Minutes)", "Business Rules"),
    }


def auction_key(auction: dict[str, Any]) -> tuple[str, str]:
    return (str(auction.get("status") or ""), str(auction.get("auctionId") or ""))


def normalize_signature_date(value: Any) -> str:
    text = str(value or "").strip()
    match = re.match(r"(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})(?::\d{2})?", text)
    if match:
        return f"{match.group(1)} {match.group(2)}"
    return text


def normalize_signature_value(field: str, value: Any) -> Any:
    if field in ("startDate", "endDate"):
        return normalize_signature_date(value)
    if field == "reservePrice":
        return int(value) if isinstance(value, (int, float)) else value
    return str(value or "").strip()


def listing_signature(auction: dict[str, Any]) -> dict[str, Any]:
    return {
        field: normalize_signature_value(field, auction.get(field))
        for field in LISTING_SIGNATURE_FIELDS
    }


def has_detail_data(auction: dict[str, Any]) -> bool:
    return any(str(auction.get(field) or "").strip() for field in DETAIL_FIELDS)


def load_existing_auctions() -> dict[tuple[str, str], dict[str, Any]]:
    path = OUTPUT_DIR / "auctions.json"
    if not path.exists():
        return {}
    try:
        existing = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return {
        auction_key(auction): auction
        for auction in existing
        if auction.get("status") and auction.get("auctionId")
    }


def existing_auctions_list(existing_by_key: dict[tuple[str, str], dict[str, Any]]) -> list[dict[str, Any]]:
    return list(existing_by_key.values())


def run_score_engine() -> None:
    if not RUN_SCORE_ENGINE:
        return
    score_path = Path(__file__).resolve().parent / "score_auctions.py"
    spec = importlib.util.spec_from_file_location("score_auctions", score_path)
    if spec and spec.loader:
        score_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(score_module)
        score_module.main()


def is_baanknet_block(error: BaseException) -> bool:
    return isinstance(error, urllib.error.HTTPError) and error.code in {403, 429}


def write_stale_refresh(existing_by_key: dict[tuple[str, str], dict[str, Any]], reason: BaseException) -> None:
    auctions = existing_auctions_list(existing_by_key)
    if not auctions:
        raise reason
    print(
        f"BAANKNET blocked refresh ({reason}). Reusing {len(auctions)} cached auctions and rerunning scoring.",
        flush=True,
    )
    if DRY_RUN:
        print("Dry run enabled. Skipping stale file writes.", flush=True)
        return
    (OUTPUT_DIR / "auctions.json").write_text(json.dumps(auctions, indent=2, ensure_ascii=False), encoding="utf-8")
    run_score_engine()
    print(f"Wrote stale-but-scored {len(auctions)} auctions to {OUTPUT_DIR / 'auctions.json'}", flush=True)


def merge_existing_details(
    auctions: list[dict[str, Any]],
    existing_by_key: dict[tuple[str, str], dict[str, Any]],
) -> tuple[int, int]:
    reused = 0
    needs_enrichment = 0

    for auction in auctions:
        existing = existing_by_key.get(auction_key(auction))
        if not existing:
            auction["_needsDetailEnrichment"] = True
            needs_enrichment += 1
            continue

        unchanged = listing_signature(auction) == listing_signature(existing)
        if unchanged and has_detail_data(existing):
            for key in REUSABLE_ENRICHED_FIELDS:
                value = existing.get(key)
                if key == "nearbyPlaces" and isinstance(value, dict) and value.get("status") == "failed":
                    continue
                if value not in ("", None, []):
                    auction[key] = value
            auction["_needsDetailEnrichment"] = False
            reused += 1
        else:
            auction["_needsDetailEnrichment"] = True
            needs_enrichment += 1

    return reused, needs_enrichment


def parse_cards(fragment: str, status: str) -> list[dict[str, Any]]:
    blocks = re.findall(r'<div class="eproc-listing-main">.*?(?=<div class="eproc-listing-main">|</div>\s*</div>\s*</div>\s*$)', fragment, re.S)
    if not blocks:
        blocks = [fragment]
    cards: list[dict[str, Any]] = []

    for block in blocks:
        text = normalize_text(block)
        if "Auction ID:" not in text:
            continue

        title_match = re.search(r"^\d+\)\s*(.*?)\s+Auction ID:", text)
        auction_match = re.search(r"Auction ID:\s*(\d+)", text)
        property_match = re.search(r"Bank Property ID:\s*([^\s]+)", text)
        reserve_match = re.search(r"Reserve Price:\s*₹?\s*([0-9.]+\s*(?:Lakh|Crore)?)", text, re.I)
        date_match = re.search(
            r"Start Date\s*:\s*([0-9-]+\s+[0-9:]+)\s+End Date\s*:\s*([0-9-]+\s+[0-9:]+)",
            text,
        )
        location_match = re.search(r"(Kerala,\s*[^,]+,\s*[^ ]+-\d{6})", text)

        location = location_match.group(1) if location_match else ""
        state = "Kerala"
        district = city = pin_code = ""
        if location:
            loc_match = re.match(r"([^,]+),\s*([^,]+),\s*(.*)-(\d{6})", location)
            if loc_match:
                state, district, city, pin_code = [part.strip() for part in loc_match.groups()]

        title = title_match.group(1).strip() if title_match else ""
        bank_text = text
        if reserve_match and date_match:
            bank_text = text[reserve_match.end() : date_match.start()]
        if location:
            bank_text = bank_text.split(location)[0]
        bank = normalize_text(bank_text)

        property_type, property_subtype = infer_property(title)
        auction_detail_match = re.search(r'href="([^"]*view-auction-notice/[^"]+)"', block)
        property_detail_match = re.search(r'href="([^"]*view-property/[^"]+)"', block)

        cards.append(
            {
                "status": status,
                "auctionId": auction_match.group(1) if auction_match else "",
                "bankPropertyId": property_match.group(1) if property_match else "",
                "title": title,
                "propertyType": property_type,
                "propertySubType": property_subtype,
                "propertyAddress": "",
                "borrowerName": "",
                "borrowerAddress": "",
                "customerId": "",
                "branch": "",
                "officer": "",
                "carpetArea": "",
                "builtUpArea": "",
                "areaSqft": "",
                "typeOfAction": "",
                "dealingOfficer": "",
                "mobileNo": "",
                "branchAddress": "",
                "inspectionDateFrom": "",
                "inspectionDateTo": "",
                "emdStartDate": "",
                "emdEndDate": "",
                "emd": "",
                "incrementPrice": "",
                "incrementDuringExtension": "",
                "extendWhenBidInLastMinutes": "",
                "extendByMinutes": "",
                "auctionDetailUrl": absolute_url(auction_detail_match.group(1)) if auction_detail_match else "",
                "propertyDetailUrl": absolute_url(property_detail_match.group(1)) if property_detail_match else "",
                "bank": bank,
                "reservePriceText": reserve_match.group(1) if reserve_match else "",
                "reservePrice": money_to_rupees(reserve_match.group(1)) if reserve_match else None,
                "state": state,
                "district": district,
                "city": city,
                "pinCode": pin_code,
                "startDate": date_match.group(1) if date_match else "",
                "endDate": date_match.group(2) if date_match else "",
                "location": location,
                "latitude": None,
                "longitude": None,
                "nearbyPlaces": None,
                "loanAvailable": "Loan Available" in text,
                "possessionStatus": "Unknown",
                "searchText": text.lower(),
            }
        )

    return cards


def enrich_auction_details(session: Session, auctions: list[dict[str, Any]], limit: int) -> None:
    enriched = 0
    candidates = [
        auction
        for auction in auctions
        if auction.get("auctionDetailUrl") and auction.get("_needsDetailEnrichment", True)
    ]
    total = min(len(candidates), limit)
    if not total:
        print("No auction detail pages need enrichment.", flush=True)
        return
    print(f"Enriching {total} auction detail pages...", flush=True)
    for auction in candidates:
        if enriched >= limit:
            continue
        try:
            detail_html = fetch_text(
                session.opener,
                auction["auctionDetailUrl"],
                headers={"User-Agent": "Mozilla/5.0", "Accept": "text/html,application/xhtml+xml", "Referer": f"{BASE_URL}/eproc-listing"},
            )
            details = parse_auction_notice(detail_html)
            for key, value in details.items():
                if value:
                    auction[key] = value
            if auction.get("reservePriceText"):
                auction["reservePrice"] = money_to_rupees(auction["reservePriceText"]) or auction.get("reservePrice")
            enriched += 1
            if enriched == total or enriched % 50 == 0:
                print(f"Enriched {enriched}/{total} auction detail pages...", flush=True)
            time.sleep(0.15)
        except Exception as exc:
            auction["detailError"] = str(exc)
            enriched += 1
            if enriched == total or enriched % 50 == 0:
                print(f"Processed {enriched}/{total} auction detail pages...", flush=True)


def enrich_property_locations(session: Session, auctions: list[dict[str, Any]], limit: int) -> None:
    coordinate_candidates = [
        auction
        for auction in auctions
        if auction.get("propertyDetailUrl")
        and not (auction.get("latitude") and auction.get("longitude"))
    ]
    coordinate_total = min(len(coordinate_candidates), limit)
    if coordinate_total:
        print(f"Fetching BAANKNET map coordinates for {coordinate_total} property pages...", flush=True)
    fetched_coordinates = 0
    for auction in coordinate_candidates:
        if fetched_coordinates >= limit:
            break
        detail_id = property_detail_id(auction.get("propertyDetailUrl") or "")
        if not detail_id:
            continue
        try:
            data = fetch_json(
                session.opener,
                f"{BASE_URL}/api/view-property-detail/{detail_id}/1",
                headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Origin": "https://baanknet.com",
                    "Referer": auction.get("propertyDetailUrl") or f"{BASE_URL}/eproc-listing",
                    "X-Requested-With": "XMLHttpRequest",
                },
            )
            payload = data.get("respData") if isinstance(data, dict) and isinstance(data.get("respData"), dict) else data
            lat = number_or_none(payload.get("lat") if isinstance(payload, dict) else None)
            lon = number_or_none(payload.get("lng") if isinstance(payload, dict) else None)
            if lat is not None and lon is not None:
                auction["latitude"] = lat
                auction["longitude"] = lon
                auction["mapSource"] = "baanknet-map"
                auction.pop("locationError", None)
            fetched_coordinates += 1
            if fetched_coordinates == coordinate_total or fetched_coordinates % 50 == 0:
                print(f"Checked {fetched_coordinates}/{coordinate_total} property map pages...", flush=True)
            time.sleep(0.12)
        except Exception as exc:
            auction["locationError"] = str(exc)
            fetched_coordinates += 1

    nearby_candidates = [
        auction
        for auction in auctions
        if auction.get("latitude")
        and auction.get("longitude")
        and (
            not auction.get("nearbyPlaces")
            or (isinstance(auction.get("nearbyPlaces"), dict) and auction.get("nearbyPlaces", {}).get("status") == "failed")
        )
    ]
    nearby_total = min(len(nearby_candidates), NEARBY_LIMIT)
    if not nearby_total:
        print("No property coordinates need nearby enrichment.", flush=True)
        return

    print(f"Fetching nearby schools/hospitals/bus stands for {nearby_total} mapped properties...", flush=True)
    enriched_nearby = 0
    for auction in nearby_candidates:
        if enriched_nearby >= NEARBY_LIMIT:
            break
        try:
            lat = float(auction["latitude"])
            lon = float(auction["longitude"])
            auction["nearbyPlaces"] = fetch_nearby_places(lat, lon, should_check_metro(auction))
            auction.pop("nearbyError", None)
            enriched_nearby += 1
            if enriched_nearby == nearby_total or enriched_nearby % 20 == 0:
                print(f"Enriched nearby places for {enriched_nearby}/{nearby_total} mapped properties...", flush=True)
            time.sleep(0.25)
        except Exception as exc:
            auction["nearbyPlaces"] = {
                "source": "openstreetmap-overpass",
                "status": "failed",
                "error": str(exc),
            }
            enriched_nearby += 1


def enrich_possession_statuses(
    session: Session,
    base_filters: dict[str, str],
    auctions: list[dict[str, Any]],
) -> None:
    by_key = {
        (auction.get("status"), auction.get("auctionId")): auction
        for auction in auctions
        if auction.get("status") and auction.get("auctionId")
    }
    statuses = sorted({str(auction.get("status")) for auction in auctions if auction.get("status")})

    for status in statuses:
        if status not in STATUSES:
            continue
        max_pages = MAX_CLOSED_PAGES if status == "closed" else None
        for possession_id, possession_name in POSSESSION_TYPES.items():
            possession_filters = {
                **base_filters,
                "propertyPossessionTypeId": possession_id,
            }
            for matched in search_all_pages(session, possession_filters, status, max_pages=max_pages):
                auction = by_key.get((status, matched.get("auctionId")))
                if auction:
                    auction["possessionStatus"] = possession_name


def search_all_pages(
    session: Session,
    filters: dict[str, str],
    status: str,
    max_pages: int | None = None,
) -> list[dict[str, Any]]:
    page = 1
    results: list[dict[str, Any]] = []
    total = None

    while True:
        fragment = post_search(session, {**filters, "aucXstatus": STATUSES[status]}, page)
        if total is None:
            total = extract_record_count(fragment)
        results.extend(parse_cards(fragment, status))
        if total == 0 or page * 10 >= total or (max_pages is not None and page >= max_pages):
            break
        page += 1
        time.sleep(0.25)

    return results


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    existing_by_key = load_existing_auctions() if INCREMENTAL_REFRESH else {}
    if INCREMENTAL_REFRESH:
        print(f"Incremental refresh enabled. Loaded {len(existing_by_key)} existing auctions.", flush=True)
    try:
        session = start_session()
    except Exception as error:
        if ALLOW_STALE_ON_BLOCK and is_baanknet_block(error):
            write_stale_refresh(existing_by_key, error)
            return
        raise

    states = {DEFAULT_STATE_ID: "Kerala"}
    districts = get_json_map(session, f"/ajax/district-json/{DEFAULT_STATE_ID}")
    cities: list[dict[str, str]] = []
    for district_id in districts:
        if DEFAULT_DISTRICT_ID and district_id != DEFAULT_DISTRICT_ID:
            continue
        try:
            district_cities = get_json_map(session, f"/ajax/city-json/{district_id}")
        except Exception:
            district_cities = {}
        cities.extend(
            {"id": key, "name": value, "districtId": district_id}
            for key, value in district_cities.items()
        )
        time.sleep(0.1)

    base_filters = {
        "stateId": DEFAULT_STATE_ID,
        "districtId": DEFAULT_DISTRICT_ID,
        "cityId": "",
        "propertyTypeId": "",
        "propertySubTypeId": "",
        "propertyTypeOfAction": "",
        "priceFrom": "",
        "priceTo": "",
        "bankId": "",
        "aucDateFrom": "",
        "aucDateTo": "",
        "pinCode": "",
        "isLoanAvailable": "",
        "propertyPossessionTypeId": "",
        "carpetAreaFrom": "",
        "carpetAreaTo": "",
        "uom": "",
        "noOfRooms": "",
    }

    auctions: list[dict[str, Any]] = []
    for status in SCRAPE_STATUSES:
        if status not in STATUSES:
            raise RuntimeError(f"Unknown BAANKNET status: {status}")
        max_pages = MAX_CLOSED_PAGES if status == "closed" else None
        auctions.extend(search_all_pages(session, base_filters, status, max_pages=max_pages))
    print(f"Fetched {len(auctions)} listing rows from BAANKNET.", flush=True)
    if INCREMENTAL_REFRESH:
        reused, needs_enrichment = merge_existing_details(auctions, existing_by_key)
        print(
            f"Incremental merge reused {reused} enriched rows; {needs_enrichment} rows need detail refresh.",
            flush=True,
        )
    if DRY_RUN:
        print("Dry run enabled. Skipping detail enrichment, possession refresh, scoring, and file writes.", flush=True)
        return
    if ENRICH_DETAILS:
        enrich_auction_details(session, auctions, ENRICH_LIMIT)
    if ENRICH_LOCATION:
        enrich_property_locations(session, auctions, ENRICH_LIMIT)
    enrich_possession_statuses(session, base_filters, auctions)
    for auction in auctions:
        auction.pop("_needsDetailEnrichment", None)

    catalog = {
        "states": [{"id": key, "name": value} for key, value in states.items()],
        "districts": [{"id": key, "name": value, "stateId": DEFAULT_STATE_ID} for key, value in districts.items()],
        "cities": cities,
        "propertyTypes": [{"id": key, "name": value} for key, value in PROPERTY_TYPES.items()],
        "propertySubTypes": [],
        "possessionStatuses": [
            {"id": key, "name": value} for key, value in POSSESSION_TYPES.items()
        ] + [
            {"id": "unknown", "name": "Unknown"},
        ],
    }

    for type_id in PROPERTY_TYPES:
        try:
            subtypes = get_json_map(session, f"/ajax/property-sub-type-json/{type_id}")
        except Exception:
            subtypes = {}
        catalog["propertySubTypes"].extend(
            {"id": key, "name": value, "propertyTypeId": type_id} for key, value in subtypes.items()
        )
    if not catalog["propertySubTypes"]:
        catalog["propertySubTypes"] = PROPERTY_SUBTYPE_FALLBACKS

    (OUTPUT_DIR / "catalog.json").write_text(json.dumps(catalog, indent=2, ensure_ascii=False), encoding="utf-8")
    (OUTPUT_DIR / "auctions.json").write_text(json.dumps(auctions, indent=2, ensure_ascii=False), encoding="utf-8")
    run_score_engine()
    print(f"Wrote {len(auctions)} auctions to {OUTPUT_DIR / 'auctions.json'}")


if __name__ == "__main__":
    main()
