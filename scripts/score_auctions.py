#!/usr/bin/env python3
"""Generate explainable auction scores for scraped auction data."""

from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from statistics import median
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
AUCTIONS_PATH = DATA_DIR / "auctions.json"
AREA_PROFILES_PATH = DATA_DIR / "area_profiles.json"

WEIGHTS = {
    "area": 0.35,
    "property": 0.25,
    "risk": 0.20,
    "confidence": 0.10,
    "bonus": 0.10,
}

INVESTOR_WEIGHTS = {
    "valueGap": 0.30,
    "landStrength": 0.25,
    "locationDemand": 0.20,
    "rentalDemand": 0.15,
    "risk": 0.10,
}

MICRO_MARKETS = [
    {
        "name": "Central Kochi / Kaloor",
        "districts": ["Ernakulam"],
        "keywords": ["kaloor", "banerji", "banerjee", "jn stadium", "jawaharlal nehru", "edappally south", "palarivattom", "682032"],
        "landRateLow": 1_800_000,
        "landRateHigh": 2_200_000,
        "locationBase": 92,
        "rentalBase": 86,
    },
    {
        "name": "Elamakkara metro corridor",
        "districts": ["Ernakulam"],
        "keywords": ["elamakkara", "swamypady", "changampuzha"],
        "landRateLow": 1_600_000,
        "landRateHigh": 2_000_000,
        "locationBase": 90,
        "rentalBase": 84,
    },
    {
        "name": "Thrikkakara-Kalamassery growth corridor",
        "districts": ["Ernakulam"],
        "keywords": ["thrikkakara", "kalamassery", "cusat", "edathala", "kangarapady", "kangarappady"],
        "landRateLow": 1_200_000,
        "landRateHigh": 1_500_000,
        "locationBase": 86,
        "rentalBase": 82,
    },
    {
        "name": "Kakkanad / Infopark commuter belt",
        "districts": ["Ernakulam"],
        "keywords": ["kakkanad", "infopark", "seaport", "chittethukara", "vazhakkala"],
        "landRateLow": 1_000_000,
        "landRateHigh": 1_300_000,
        "locationBase": 84,
        "rentalBase": 82,
    },
    {
        "name": "Central Thiruvananthapuram",
        "districts": ["Thiruvananthapuram"],
        "keywords": ["peroorkada", "kowdiar", "pattom", "vazhuthacaud"],
        "landRateLow": 900_000,
        "landRateHigh": 1_400_000,
        "locationBase": 82,
        "rentalBase": 76,
    },
]

DISTRICT_BASE = {
    "Ernakulam": 84,
    "Thiruvananthapuram": 82,
    "Kozhikode": 80,
    "Thrissur": 78,
    "Kottayam": 74,
    "Kannur": 73,
    "Kollam": 72,
    "Palakkad": 70,
    "Alappuzha": 70,
    "Malappuram": 69,
    "Pathanamthitta": 68,
    "Idukki": 64,
    "Wayanad": 62,
    "Kasargod": 62,
}

CITY_BONUS_WORDS = {
    "metro": 4,
    "city": 4,
    "town": 2,
    "junction": 2,
}


def clamp(value: float, low: int = 0, high: int = 100) -> int:
    return max(low, min(high, round(value)))


def stable_noise(*parts: str, span: int = 12) -> int:
    seed = "|".join(parts).lower().encode("utf-8")
    digest = hashlib.sha1(seed).hexdigest()
    return int(digest[:8], 16) % (span + 1)


def rupees(value: str | int | float | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    cleaned = value.strip()
    if not cleaned:
        return None
    if re.match(r"^[\d,]+(?:\.\d+)?$", cleaned):
        return int(round(float(cleaned.replace(",", ""))))
    match = re.search(r"([\d,.]+)\s*(lakh|crore)?", cleaned, re.I)
    if not match:
        return None
    amount = float(match.group(1).replace(",", ""))
    unit = (match.group(2) or "").lower()
    if unit == "lakh":
        amount *= 100_000
    if unit == "crore":
        amount *= 10_000_000
    return int(round(amount))


def parse_area(row: dict[str, Any]) -> float | None:
    candidates = [
        str(row.get("carpetArea") or ""),
        str(row.get("builtUpArea") or ""),
        str(row.get("areaSqft") or ""),
        str(row.get("borrowerAddress") or ""),
        str(row.get("propertyAddress") or ""),
        str(row.get("title") or ""),
    ]
    text = " ".join(candidates).lower()
    sq_ft = re.search(r"([\d,.]+)\s*(?:sq\.?\s*ft|sqft|sq feet|square feet)", text)
    if sq_ft:
        return float(sq_ft.group(1).replace(",", ""))
    sq_m = re.search(r"([\d,.]+)\s*(?:sq\.?\s*m|sq mtr|sqm|square meter|square metre)", text)
    if sq_m:
        return float(sq_m.group(1).replace(",", "")) * 10.7639
    ares = re.search(r"([\d,.]+)\s*ares?", text)
    if ares:
        return float(ares.group(1).replace(",", "")) * 1076.39
    acres = re.search(r"([\d,.]+)\s*acres?", text)
    if acres:
        return float(acres.group(1).replace(",", "")) * 43560
    hectares = re.search(r"([\d,.]+)\s*hectares?", text)
    if hectares:
        return float(hectares.group(1).replace(",", "")) * 107639
    return None


def parse_building_area(row: dict[str, Any]) -> float | None:
    candidates = [
        str(row.get("carpetArea") or ""),
        str(row.get("builtUpArea") or ""),
        str(row.get("areaSqft") or ""),
    ]
    text = " ".join(candidates).lower()
    sq_ft = re.search(r"([\d,.]+)\s*(?:sq\.?\s*ft|sqft|sq feet|square feet)", text)
    if sq_ft:
        return float(sq_ft.group(1).replace(",", ""))
    sq_m = re.search(r"([\d,.]+)\s*(?:sq\.?\s*m|sq mtr|sqm|square meter|square metre)", text)
    if sq_m:
        return float(sq_m.group(1).replace(",", "")) * 10.7639
    unspecified = re.search(r"([\d,.]+)\s*unit\s+not\s+specified", text)
    if unspecified:
        value = float(unspecified.group(1).replace(",", ""))
        return value * 10.7639 if value < 500 else value
    bare_number = re.fullmatch(r"\s*([\d,.]+)\s*", text)
    if bare_number:
        value = float(bare_number.group(1).replace(",", ""))
        return value * 10.7639 if value < 500 else value
    return None


def parse_land_cents(row: dict[str, Any]) -> float | None:
    explicit = row.get("landArea") or row.get("landAreaCents")
    if isinstance(explicit, (int, float)) and explicit > 0:
        return float(explicit)
    if isinstance(explicit, str) and explicit.strip():
        parsed = re.search(r"([\d,.]+)", explicit)
        if parsed:
            value = float(parsed.group(1).replace(",", ""))
            if "are" in explicit.lower():
                return value * 2.47105
            return value

    candidates = [
        str(row.get("propertyAddress") or ""),
        str(row.get("borrowerAddress") or ""),
        str(row.get("title") or ""),
        str(row.get("searchText") or ""),
    ]
    text = " ".join(candidates).lower()

    patterns = [
        (r"(?:land|property|plot|extent|extend|admeasuring|measuring|having)[^.;,\n]{0,60}?([\d,.]+)\s*cents?", 1.0),
        (r"([\d,.]+)\s*cents?[^.;,\n]{0,60}?(?:land|property|plot|extent)", 1.0),
        (r"(?:land|property|plot|extent|extend|admeasuring|measuring|having)[^.;,\n]{0,60}?([\d,.]+)\s*ares?", 2.47105),
        (r"([\d,.]+)\s*ares?[^.;,\n]{0,60}?(?:land|property|plot|extent)", 2.47105),
        (r"(?:land|property|plot|extent|extend|admeasuring|measuring|having)[^.;,\n]{0,60}?([\d,.]+)\s*acres?", 100.0),
    ]
    values: list[float] = []
    for pattern, factor in patterns:
        for match in re.finditer(pattern, text):
            value = float(match.group(1).replace(",", "")) * factor
            if 0.2 <= value <= 200:
                values.append(value)

    if values:
        return min(values)
    return None


def area_key(row: dict[str, Any]) -> str:
    district = row.get("district") or "Unknown"
    city = row.get("city") or row.get("pinCode") or "Unknown"
    return f"{district}::{city}".lower()


def build_area_profiles(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    existing: dict[str, dict[str, Any]] = {}
    if AREA_PROFILES_PATH.exists():
        existing = json.loads(AREA_PROFILES_PATH.read_text())

    profiles = dict(existing)
    for row in rows:
        key = area_key(row)
        if key in profiles:
            continue
        district = row.get("district") or "Unknown"
        city = row.get("city") or row.get("pinCode") or "Unknown"
        base = DISTRICT_BASE.get(district, 58)
        city_text = str(city).lower()
        bonus = sum(score for word, score in CITY_BONUS_WORDS.items() if word in city_text)
        noise = stable_noise(district, city, span=10) - 5
        score = clamp(base + bonus + noise)
        profiles[key] = {
            "areaKey": key,
            "villageOrCity": city,
            "district": district,
            "pinCode": row.get("pinCode") or "",
            "areaScore": score,
            "source": "heuristic-v1",
            "factors": {
                "districtBase": base,
                "localityAdjustment": bonus + noise,
                "population": "pending-osm",
                "civicType": "pending-osm",
                "hospitals": "pending-osm",
                "schools": "pending-osm",
                "railway": "pending-osm",
                "roadConnectivity": "pending-osm",
            },
        }
    return profiles


def nearby_categories(row: dict[str, Any]) -> dict[str, dict[str, Any]]:
    nearby = row.get("nearbyPlaces") or {}
    categories = nearby.get("categories") if isinstance(nearby, dict) else {}
    return categories if isinstance(categories, dict) else {}


def nearest_distance(row: dict[str, Any], category: str) -> float | None:
    data = nearby_categories(row).get(category) or {}
    value = data.get("nearestDistanceKm") if isinstance(data, dict) else None
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def nearby_count(row: dict[str, Any], category: str) -> int:
    data = nearby_categories(row).get(category) or {}
    value = data.get("count") if isinstance(data, dict) else 0
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def nearby_area_adjustment(row: dict[str, Any]) -> tuple[int, list[str]]:
    categories = nearby_categories(row)
    if not categories:
        return 0, ["Nearby schools/hospitals/transport not mapped yet"]

    adjustment = 0
    reasons: list[str] = []
    school = nearest_distance(row, "schools")
    hospital = nearest_distance(row, "hospitals")
    bus_stand = nearest_distance(row, "bus_stands")
    metro = nearest_distance(row, "metro")

    if school is not None:
        if school <= 2:
            adjustment += 5
        elif school <= 5:
            adjustment += 3
        reasons.append(f"Nearest school/college around {school:g} km")
    if hospital is not None:
        if hospital <= 3:
            adjustment += 5
        elif hospital <= 8:
            adjustment += 3
        reasons.append(f"Nearest hospital/clinic around {hospital:g} km")
    if bus_stand is not None:
        if bus_stand <= 2:
            adjustment += 4
        elif bus_stand <= 5:
            adjustment += 2
        reasons.append(f"Nearest bus stand around {bus_stand:g} km")
    if metro is not None:
        if metro <= 3:
            adjustment += 6
        elif metro <= 5:
            adjustment += 4
        reasons.append(f"Nearest metro station around {metro:g} km")

    if nearby_count(row, "schools") >= 5:
        adjustment += 2
        reasons.append("Multiple education options within mapped radius")
    if nearby_count(row, "hospitals") >= 3:
        adjustment += 2
        reasons.append("Multiple medical options within mapped radius")

    return min(adjustment, 15), reasons or ["Nearby places checked; no strong proximity signal found"]


def price_per_sqft(row: dict[str, Any]) -> float | None:
    price = rupees(row.get("reservePrice")) or rupees(row.get("reservePriceText"))
    area = parse_area(row)
    if not price or not area or area <= 0:
        return None
    return price / area


def is_plot(row: dict[str, Any]) -> bool:
    text = " ".join(
        str(row.get(key) or "")
        for key in ["propertySubType", "propertyType", "title"]
    ).lower()
    return "plot" in text and not any(word in text for word in ["house", "villa", "flat", "apartment"])


def market_text(row: dict[str, Any]) -> str:
    return " ".join(
        str(row.get(key) or "")
        for key in ["title", "location", "city", "district", "propertyAddress", "pinCode"]
    ).lower()


def detect_micro_market(row: dict[str, Any]) -> dict[str, Any] | None:
    text = market_text(row)
    district = str(row.get("district") or "")
    for market in MICRO_MARKETS:
        districts = market.get("districts") or []
        if districts and district not in districts:
            continue
        if any(keyword in text for keyword in market["keywords"]):
            return market
    return None


def land_value_range(row: dict[str, Any], land_cents: float | None, built_area: float | None) -> tuple[int | None, int | None, str, list[str]]:
    price = rupees(row.get("reservePrice")) or rupees(row.get("reservePriceText"))
    market = detect_micro_market(row)
    reasons: list[str] = []

    if not market:
        reasons.append("No local land-rate band configured yet")
        return None, None, "Unmapped market", reasons

    market_name = str(market["name"])
    reasons.append(f"{market_name} conservative land-rate band applied")
    land_low = land_high = 0
    if land_cents:
        land_low = int(land_cents * int(market["landRateLow"]))
        land_high = int(land_cents * int(market["landRateHigh"]))
        reasons.append(f"Land extent around {land_cents:.2f} cents")
    else:
        reasons.append("Land extent missing, so investor score is capped")

    building_low = building_high = 0
    subtype = str(row.get("propertySubType") or row.get("propertyType") or "").lower()
    if built_area and ("house" in subtype or "villa" in subtype or "residential" in subtype):
        building_low = int(min(built_area * 1_200, 3_500_000))
        building_high = int(min(built_area * 1_800, 5_000_000))
        reasons.append(f"Conservative building value added for {built_area:.0f} sqft")

    if not land_low and not building_low:
        return None, None, market_name, reasons

    estimated_low = land_low + building_low
    estimated_high = land_high + building_high
    if price and estimated_low < price * 0.7 and land_cents:
        reasons.append("Estimate is intentionally conservative versus reserve price")
    return estimated_low or None, estimated_high or None, market_name, reasons


def score_value_gap(price: int | None, estimated_low: int | None) -> tuple[int, float | None, list[str]]:
    if not price or not estimated_low:
        return 45, None, ["Conservative market value not estimated yet"]
    gap = (estimated_low - price) / price
    if gap >= 0.60:
        score = 96
    elif gap >= 0.35:
        score = 86
    elif gap >= 0.20:
        score = 74
    elif gap >= 0.08:
        score = 64
    elif gap >= 0:
        score = 55
    else:
        score = 38
    return score, gap * 100, [f"Conservative value gap around {gap * 100:.1f}%"]


def investor_score(row: dict[str, Any], area_score_value: int, risk: int) -> dict[str, Any]:
    price = rupees(row.get("reservePrice")) or rupees(row.get("reservePriceText"))
    built_area = parse_building_area(row)
    land_cents = parse_land_cents(row)
    plot_only = is_plot(row)
    estimated_low, estimated_high, market_name, value_reasons = land_value_range(row, land_cents, built_area)
    value_gap, value_gap_percent, gap_reasons = score_value_gap(price, estimated_low)
    market = detect_micro_market(row)

    if land_cents:
        if land_cents >= 6:
            land_strength = 100
        elif land_cents >= 4:
            land_strength = 92
        elif land_cents >= 2.5:
            land_strength = 84
        else:
            land_strength = 66
    else:
        land_strength = 52

    nearby_adjustment, nearby_reasons = nearby_area_adjustment(row)
    location_base = int(market["locationBase"]) if market else area_score_value
    location_demand = clamp(location_base + min(nearby_adjustment, 10))
    rental_base = int(market["rentalBase"]) if market else max(50, area_score_value - 6)
    rental_demand = clamp(rental_base + (4 if nearest_distance(row, "metro") and (nearest_distance(row, "metro") or 99) <= 5 else 0))

    if not land_cents:
        value_gap = min(value_gap, 62)
        land_strength = min(land_strength, 60)
    if not market:
        value_gap = min(value_gap, 45)
        land_strength = min(land_strength, 72)
        location_demand = min(location_demand, 78)
        rental_demand = min(rental_demand, 72)
    if price and price >= 15_000_000 and (value_gap_percent is None or value_gap_percent < 20):
        value_gap = min(value_gap, 48)
        land_strength = min(land_strength, 78)
    if plot_only:
        rental_demand = min(rental_demand, 42)
        risk = min(risk, 58)
        if not market:
            value_gap = min(value_gap, 40)
            land_strength = min(land_strength, 62)
            location_demand = min(location_demand, 68)
        if value_gap_percent is None or value_gap_percent < 60:
            value_gap = min(value_gap, 55)
            land_strength = min(land_strength, 70)
        if not nearby_categories(row):
            location_demand = min(location_demand, 78)

    overall = clamp(
        value_gap * INVESTOR_WEIGHTS["valueGap"]
        + land_strength * INVESTOR_WEIGHTS["landStrength"]
        + location_demand * INVESTOR_WEIGHTS["locationDemand"]
        + rental_demand * INVESTOR_WEIGHTS["rentalDemand"]
        + risk * INVESTOR_WEIGHTS["risk"]
    )
    if plot_only:
        if market and value_gap_percent is not None and value_gap_percent >= 100 and nearby_categories(row):
            overall = min(overall, 82)
        elif market and value_gap_percent is not None and value_gap_percent >= 60:
            overall = min(overall, 72)
        else:
            overall = min(overall, 58)

    reasons = {
        "valueGap": [*value_reasons, *gap_reasons],
        "landStrength": [f"Land extent {'captured' if land_cents else 'missing'}"],
        "locationDemand": [f"{market_name} demand profile", *nearby_reasons[:2]],
        "rentalDemand": [f"{market_name} rental demand profile"],
        "risk": risk_score(row)[2],
    }
    return {
        "overall": overall,
        "valueGap": value_gap,
        "landStrength": land_strength,
        "locationDemand": location_demand,
        "rentalDemand": rental_demand,
        "risk": risk,
        "rankState": None,
        "rankDistrict": None,
        "market": market_name,
        "landCents": round(land_cents, 2) if land_cents else None,
        "estimatedMarketValueLow": estimated_low,
        "estimatedMarketValueHigh": estimated_high,
        "valueGapPercent": round(value_gap_percent, 1) if value_gap_percent is not None else None,
        "confidenceLabel": "High" if land_cents and estimated_low else "Medium" if estimated_low else "Low",
        "explanations": reasons,
        "weights": INVESTOR_WEIGHTS,
    }


def property_score(row: dict[str, Any], medians: dict[str, float]) -> tuple[int, list[str]]:
    price = rupees(row.get("reservePrice")) or rupees(row.get("reservePriceText"))
    area = parse_area(row)
    category = row.get("propertySubType") or row.get("propertyType") or "Other"
    ppsf = price_per_sqft(row)
    reasons: list[str] = []
    score = 58

    if price:
        if price <= 2_500_000:
            score += 10
            reasons.append("Affordable reserve price")
        elif price <= 7_500_000:
            score += 5
            reasons.append("Moderate reserve price")
        elif price >= 20_000_000:
            score -= 6
            reasons.append("High capital requirement")

    if area:
        if 600 <= area <= 2500:
            score += 8
            reasons.append("Usable residential area range")
        elif area > 4000:
            score += 4
            reasons.append("Large property area")
    else:
        score -= 6
        reasons.append("Area not extracted")

    median_ppsf = medians.get(category)
    if ppsf and median_ppsf:
        if ppsf <= median_ppsf * 0.75:
            score += 18
            reasons.append("Low price per sqft within category")
        elif ppsf <= median_ppsf:
            score += 10
            reasons.append("Competitive price per sqft")
        elif ppsf > median_ppsf * 1.5:
            score -= 10
            reasons.append("High price per sqft within category")
    elif not ppsf:
        score -= 4
        reasons.append("Price per sqft unavailable")

    return clamp(score), reasons


def risk_score(row: dict[str, Any]) -> tuple[int, str, list[str]]:
    text = " ".join(str(row.get(key) or "") for key in ["searchText", "propertyAddress", "typeOfAction", "possessionStatus"]).lower()
    score = 62
    reasons: list[str] = []

    possession = str(row.get("possessionStatus") or "").lower()
    if "physical" in possession:
        score += 20
        reasons.append("Physical possession")
    elif "symbolic" in possession:
        score -= 5
        reasons.append("Symbolic possession")
    else:
        score -= 4
        reasons.append("Possession not captured")

    if "court" in text or "case" in text or "litigation" in text:
        score -= 20
        reasons.append("Legal/case wording found")
    if "occupied" in text or "tenant" in text:
        score -= 15
        reasons.append("Occupancy/tenant wording found")
    if row.get("inspectionDateFrom") or row.get("inspectionDateTo"):
        score += 5
        reasons.append("Inspection window available")
    if row.get("auctionDetailUrl"):
        score += 3
        reasons.append("Auction detail page available")

    final = clamp(score)
    label = "Low" if final >= 75 else "Medium" if final >= 55 else "High"
    return final, label, reasons


def confidence_score(row: dict[str, Any], ppsf: float | None) -> tuple[int, str, list[str]]:
    checks = {
        "Detail page": bool(row.get("customerId") or row.get("emd")),
        "Village/city": bool(row.get("city")),
        "Pincode": bool(row.get("pinCode")),
        "Map coordinates": bool(row.get("latitude") and row.get("longitude")),
        "Nearby places": bool(nearby_categories(row)),
        "Area": parse_area(row) is not None,
        "Reserve price": bool(rupees(row.get("reservePrice")) or rupees(row.get("reservePriceText"))),
        "Auction dates": bool(row.get("startDate") and row.get("endDate")),
        "Price per sqft": ppsf is not None,
    }
    passed = sum(1 for value in checks.values() if value)
    score = clamp((passed / len(checks)) * 100)
    label = "High" if score >= 80 else "Medium" if score >= 55 else "Low"
    reasons = [name for name, ok in checks.items() if ok]
    return score, label, reasons


def bonus_score(row: dict[str, Any]) -> tuple[int, list[str]]:
    score = 50
    reasons = ["Neutral bonus until history is available"]
    if row.get("loanAvailable"):
        score += 8
        reasons.append("Loan marked available")
    return clamp(score), reasons


def compute_medians(rows: list[dict[str, Any]]) -> dict[str, float]:
    buckets: dict[str, list[float]] = {}
    for row in rows:
        ppsf = price_per_sqft(row)
        if not ppsf:
            continue
        category = row.get("propertySubType") or row.get("propertyType") or "Other"
        buckets.setdefault(category, []).append(ppsf)
    return {category: median(values) for category, values in buckets.items() if len(values) >= 3}


def score_rows(rows: list[dict[str, Any]], profiles: dict[str, dict[str, Any]]) -> None:
    medians = compute_medians(rows)
    active_rows = [row for row in rows if row.get("status") in {"upcoming", "live"}]

    for row in rows:
        profile = profiles.get(area_key(row), {})
        nearby_adjustment, nearby_reasons = nearby_area_adjustment(row)
        area = clamp(int(profile.get("areaScore") or 50) + nearby_adjustment)
        prop, prop_reasons = property_score(row, medians)
        risk, risk_label, risk_reasons = risk_score(row)
        ppsf = price_per_sqft(row)
        confidence, confidence_label, confidence_reasons = confidence_score(row, ppsf)
        bonus, bonus_reasons = bonus_score(row)
        overall = clamp(
            area * WEIGHTS["area"]
            + prop * WEIGHTS["property"]
            + risk * WEIGHTS["risk"]
            + confidence * WEIGHTS["confidence"]
            + bonus * WEIGHTS["bonus"]
        )
        row["pricePerSqft"] = round(ppsf, 2) if ppsf else None
        row["score"] = {
            "overall": overall,
            "area": area,
            "property": prop,
            "risk": risk,
            "confidence": confidence,
            "bonus": bonus,
            "riskLabel": risk_label,
            "confidenceLabel": confidence_label,
            "rankState": None,
            "rankDistrict": None,
            "areaProfileKey": area_key(row),
            "explanations": {
                "area": [
                    f"Area profile available for {profile.get('villageOrCity', row.get('city') or 'this locality')}",
                    f"{row.get('district') or 'District'} locality baseline applied",
                    *nearby_reasons,
                ],
                "property": prop_reasons,
                "risk": risk_reasons,
                "confidence": confidence_reasons,
                "bonus": bonus_reasons,
            },
        }
        row["investorScore"] = investor_score(row, area, risk)

    ranked_state = sorted(active_rows, key=lambda item: item.get("score", {}).get("overall", 0), reverse=True)
    for index, row in enumerate(ranked_state, start=1):
        row["score"]["rankState"] = index

    investor_ranked_state = sorted(active_rows, key=lambda item: item.get("investorScore", {}).get("overall", 0), reverse=True)
    for index, row in enumerate(investor_ranked_state, start=1):
        row["investorScore"]["rankState"] = index

    by_district: dict[str, list[dict[str, Any]]] = {}
    for row in active_rows:
        by_district.setdefault(row.get("district") or "Unknown", []).append(row)
    for district_rows in by_district.values():
        for index, row in enumerate(sorted(district_rows, key=lambda item: item.get("score", {}).get("overall", 0), reverse=True), start=1):
            row["score"]["rankDistrict"] = index
        for index, row in enumerate(sorted(district_rows, key=lambda item: item.get("investorScore", {}).get("overall", 0), reverse=True), start=1):
            row["investorScore"]["rankDistrict"] = index


def main() -> None:
    rows = json.loads(AUCTIONS_PATH.read_text())
    profiles = build_area_profiles(rows)
    score_rows(rows, profiles)
    AREA_PROFILES_PATH.write_text(json.dumps(profiles, indent=2, ensure_ascii=False))
    AUCTIONS_PATH.write_text(json.dumps(rows, indent=2, ensure_ascii=False))
    scored = sum(1 for row in rows if row.get("score"))
    print(f"Scored {scored} auctions and wrote {len(profiles)} area profiles")


if __name__ == "__main__":
    main()
