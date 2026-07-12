#!/usr/bin/env python3
import json
import os
import sys
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "public" / "data"
IST = timezone(timedelta(hours=5, minutes=30))
REPLACE_STATUS_ROWS = os.environ.get("SUPABASE_REPLACE_STATUS_ROWS", "1") == "1"


def read_env_file():
    for env_path in (ROOT / ".env", ROOT / ".env.local"):
        if not env_path.exists():
            continue

        for line in env_path.read_text().splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def parse_auction_time(value):
    if not value:
        return None

    for fmt in ("%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%d-%m-%Y"):
        try:
            parsed = datetime.strptime(value, fmt)
            return parsed.replace(tzinfo=IST).isoformat()
        except ValueError:
            continue

    return None


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def refresh_source():
    if os.environ.get("GITHUB_ACTIONS") == "true":
        return "github_actions"
    return os.environ.get("REFRESH_SOURCE", "local")


def supabase_request(path, payload, method="POST"):
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        raise SystemExit(
            "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script."
        )

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{path}",
        data=body,
        method=method,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase write failed ({error.code}): {details}") from error


def supabase_delete(path):
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not service_key:
        raise SystemExit(
            "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script."
        )

    request = urllib.request.Request(
        f"{supabase_url}/rest/v1/{path}",
        method="DELETE",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Prefer": "return=minimal",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase delete failed ({error.code}): {details}") from error


def create_refresh_run():
    run_id = str(uuid4())
    try:
        supabase_request(
            "refresh_runs",
            [
                {
                    "id": run_id,
                    "source": refresh_source(),
                    "status": "running",
                    "started_at": utc_now(),
                    "metadata": {
                        "github_run_id": os.environ.get("GITHUB_RUN_ID"),
                        "github_sha": os.environ.get("GITHUB_SHA"),
                        "github_ref": os.environ.get("GITHUB_REF"),
                    },
                }
            ],
        )
    except RuntimeError as error:
        print(f"Refresh run tracking skipped: {error}", file=sys.stderr)
        return None
    return run_id


def update_refresh_run(run_id, status, auction_count=0, catalog_pushed=False, error_message=None):
    if not run_id:
        return

    payload = {
        "status": status,
        "finished_at": utc_now() if status in ("success", "failed") else None,
        "auction_count": auction_count,
        "catalog_pushed": catalog_pushed,
        "error_message": error_message,
    }
    supabase_request(f"refresh_runs?id=eq.{run_id}", payload, method="PATCH")


def auction_row(auction):
    score = auction.get("score") or {}
    return {
        "auction_id": str(auction.get("auctionId") or ""),
        "status": auction.get("status") or "unknown",
        "bank_property_id": auction.get("bankPropertyId") or None,
        "title": auction.get("title") or "Untitled auction",
        "reserve_price": auction.get("reservePrice"),
        "state": auction.get("state") or None,
        "district": auction.get("district") or None,
        "city": auction.get("city") or None,
        "start_at": parse_auction_time(auction.get("startDate")),
        "end_at": parse_auction_time(auction.get("endDate")),
        "possession_status": auction.get("possessionStatus") or None,
        "score": score.get("overall") if isinstance(score, dict) else None,
        "payload": auction,
    }


def chunks(items, size):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def main():
    read_env_file()
    run_id = create_refresh_run()
    pushed_count = 0
    catalog_pushed = False
    auctions = json.loads((DATA_DIR / "auctions.json").read_text())
    catalog = json.loads((DATA_DIR / "catalog.json").read_text())

    try:
        rows = [auction_row(auction) for auction in auctions if auction.get("auctionId")]
        statuses = sorted({row["status"] for row in rows if row.get("status")})
        if REPLACE_STATUS_ROWS and statuses:
            encoded_statuses = urllib.parse.quote(",".join(statuses), safe=",")
            supabase_delete(f"auctions?status=in.({encoded_statuses})")
            print(f"Cleared existing Supabase auction rows for statuses: {', '.join(statuses)}")
        for batch in chunks(rows, 500):
            supabase_request("auctions?on_conflict=auction_id,status", batch)
            pushed_count += len(batch)

        supabase_request(
            "catalog_snapshots?on_conflict=kind",
            [{"kind": "kerala_catalog", "payload": catalog, "created_at": utc_now()}],
        )
        catalog_pushed = True
        update_refresh_run(run_id, "success", pushed_count, catalog_pushed)
        refresh_suffix = f" Refresh run: {run_id}" if run_id else " Refresh run: not recorded"
        print(f"Pushed {pushed_count} auctions and 1 catalog snapshot to Supabase.{refresh_suffix}")
    except Exception as error:
        update_refresh_run(run_id, "failed", pushed_count, catalog_pushed, str(error))
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
