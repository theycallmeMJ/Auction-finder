#!/usr/bin/env python3
"""Fetch BAANKNET eproc auction listings into static JSON files.

The public eproc page renders results from an HTML-returning AJAX endpoint.
This script keeps the session cookie/CSRF token, submits filters, parses the
listing cards, and writes static JSON for the frontend.
"""

from __future__ import annotations

import html
import json
import os
import re
import ssl
import time
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
RUN_SCORE_ENGINE = os.environ.get("BAANKNET_SCORE", "1") == "1"


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
        state = district = city = pin_code = ""
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
                "loanAvailable": "Loan Available" in text,
                "possessionStatus": "Unknown",
                "searchText": text.lower(),
            }
        )

    return cards


def enrich_auction_details(session: Session, auctions: list[dict[str, Any]], limit: int) -> None:
    enriched = 0
    for auction in auctions:
        if not auction.get("auctionDetailUrl") or enriched >= limit:
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
            time.sleep(0.15)
        except Exception as exc:
            auction["detailError"] = str(exc)


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
    session = start_session()

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
    if ENRICH_DETAILS:
        enrich_auction_details(session, auctions, ENRICH_LIMIT)

    catalog = {
        "states": [{"id": key, "name": value} for key, value in states.items()],
        "districts": [{"id": key, "name": value, "stateId": DEFAULT_STATE_ID} for key, value in districts.items()],
        "cities": cities,
        "propertyTypes": [{"id": key, "name": value} for key, value in PROPERTY_TYPES.items()],
        "propertySubTypes": [],
        "possessionStatuses": [
            {"id": "1", "name": "Physical"},
            {"id": "2", "name": "Symbolic"},
            {"id": "3", "name": "Other"},
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
    if RUN_SCORE_ENGINE:
        score_path = Path(__file__).resolve().parent / "score_auctions.py"
        spec = importlib.util.spec_from_file_location("score_auctions", score_path)
        if spec and spec.loader:
            score_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(score_module)
            score_module.main()
    print(f"Wrote {len(auctions)} auctions to {OUTPUT_DIR / 'auctions.json'}")


if __name__ == "__main__":
    main()
