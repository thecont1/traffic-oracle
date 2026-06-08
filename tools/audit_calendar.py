#!/usr/bin/env python3
"""
Audit the calendar colour system against raw CSV data.

Replicates the trailingPercentiles + band5 logic from the frontend and flags:
  - Days where the trailing 30-day window has < 5 data points
  - Days where p90 - p10 < 2 km/h (colour is basically noise)
  - Routes with large data gaps

Usage:
    python3 tools/audit_calendar.py
    python3 tools/audit_calendar.py --csv path/to/traffic.csv [--routes path/to/routes.csv]
"""

import csv
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

TRAFFIC_CSV_URL = (
    "https://raw.githubusercontent.com/thecont1/"
    "traffic-monitor-lizard/main/data/csv-traffic-bangalore.csv"
)
ROUTES_CSV_URL = (
    "https://raw.githubusercontent.com/thecont1/"
    "traffic-monitor-lizard/main/data/csv-routes-bangalore.csv"
)


# ── Colour logic (mirrors src/lib/theme.ts) ────────────────────────

def band_label(t: float) -> str:
    if t >= 0.80:
        return "BEST  "
    if t >= 0.60:
        return "better"
    if t >= 0.40:
        return "mid   "
    if t >= 0.20:
        return "worse "
    return "WORST "


# ── Percentile logic (mirrors src/lib/trailingPercentiles.ts) ───────

def trailing_percentiles(daily_speeds: dict[str, float], date_key: str) -> dict:
    """Compute trailing 30-day p10/p90 for a given date."""
    dk = datetime.strptime(date_key, "%Y-%m-%d")
    w_start = dk - timedelta(days=30)

    window: list[float] = []
    for k, v in daily_speeds.items():
        if k == date_key:
            continue
        t = datetime.strptime(k, "%Y-%m-%d")
        if w_start <= t < dk and v > 0:
            window.append(v)

    window.sort()
    count = len(window)

    if count < 2:
        return {"p10": 25, "p90": 25, "count": count, "insufficient": True}

    def at(pct: float) -> float:
        idx = (pct / 100) * (count - 1)
        lo = int(idx)
        hi = min(lo + 1, count - 1)
        return window[lo] + (window[hi] - window[lo]) * (idx - lo)

    return {"p10": at(10), "p90": at(90), "count": count, "insufficient": False}


# ── CSV parsing ────────────────────────────────────────────────────

def load_csv(path: str) -> list[dict]:
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def get_col(row: dict, *keys: str) -> str:
    """Case-insensitive column lookup."""
    for k in keys:
        for rk in row:
            if rk.strip().lower() == k.lower():
                return row[rk].strip()
    return ""


def load_route_labels(routes_path: str) -> dict[str, str]:
    """Load route_code → label_short mapping."""
    labels: dict[str, str] = {}
    for row in load_csv(routes_path):
        code = get_col(row, "route_code")
        label = get_col(row, "label_short") or get_col(row, "label_full") or code
        if code:
            labels[code] = label
    return labels


# ── Main audit ─────────────────────────────────────────────────────

def audit(traffic_csv: str, routes_csv: str | None = None) -> None:
    rows = load_csv(traffic_csv)
    print(f"Loaded {len(rows)} rows from {traffic_csv}")

    # Load route labels if available
    route_labels: dict[str, str] = {}
    if routes_csv:
        route_labels = load_route_labels(routes_csv)
        print(f"Loaded {len(route_labels)} route labels")

    # Group by route → date → speeds
    route_dates: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))

    for row in rows:
        route = get_col(row, "route_code", "route")
        date_str = get_col(row, "date", "trip_date")
        duration_str = get_col(row, "duration", "duration_min")
        distance_str = get_col(row, "distance", "distance_km")

        if not route or not date_str or not duration_str or not distance_str:
            continue

        try:
            duration = float(duration_str)
            distance = float(distance_str)
            datetime.strptime(date_str, "%Y-%m-%d")
        except (ValueError, TypeError):
            continue

        if duration <= 0 or distance <= 0:
            continue

        # Speed = distance / (duration_minutes / 60) = distance * 60 / duration
        speed = distance * 60 / duration

        route_dates[route][date_str].append(speed)

    print(f"Found {len(route_dates)} routes\n")

    total_warnings = 0

    for route, dates in sorted(route_dates.items()):
        label = route_labels.get(route, route)

        # Daily avg speeds
        daily: dict[str, float] = {}
        for dk, speeds in sorted(dates.items()):
            daily[dk] = sum(speeds) / len(speeds)

        sorted_keys = sorted(daily.keys())
        if len(sorted_keys) < 2:
            print(f"  [{label}] — only {len(sorted_keys)} date(s), skipping")
            continue

        route_warns: list[str] = []

        # Check for large gaps
        for i in range(1, len(sorted_keys)):
            d0 = datetime.strptime(sorted_keys[i - 1], "%Y-%m-%d")
            d1 = datetime.strptime(sorted_keys[i], "%Y-%m-%d")
            gap = (d1 - d0).days
            if gap > 5:
                route_warns.append(
                    f"  GAP: {sorted_keys[i-1]} → {sorted_keys[i]} ({gap} days)"
                )

        # Audit each date
        for dk in sorted_keys:
            result = trailing_percentiles(daily, dk)

            if result["insufficient"]:
                route_warns.append(
                    f"  INSUFFICIENT: {dk} — n={result['count']} (too few trailing days)"
                )
                total_warnings += 1
                continue

            if result["p90"] - result["p10"] < 2:
                route_warns.append(
                    f"  NARROW: {dk} — p10={result['p10']:.1f}, p90={result['p90']:.1f} "
                    f"(band width {result['p90'] - result['p10']:.1f} km/h < 2)"
                )
                total_warnings += 1

            if result["count"] < 5:
                route_warns.append(
                    f"  LOW_N: {dk} — n={result['count']} (colour may be unreliable)"
                )
                total_warnings += 1

        if route_warns:
            print(f"  [{label}] — {len(daily)} dates, {len(route_warns)} warnings:")
            for w in route_warns:
                print(w)
            print()
        else:
            print(f"  [{label}] — {len(daily)} dates — OK")

    print(f"\n{'='*60}")
    print(f"Total warnings: {total_warnings}")
    if total_warnings == 0:
        print("All clear — no anomalies found.")
    else:
        print(f"Review {total_warnings} warning(s) above.")


if __name__ == "__main__":
    traffic_path = None
    routes_path = None

    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--csv" and i + 1 < len(args):
            traffic_path = args[i + 1]
            i += 2
        elif args[i] == "--routes" and i + 1 < len(args):
            routes_path = args[i + 1]
            i += 2
        else:
            i += 1

    cleanup_traffic = False
    cleanup_routes = False

    if not traffic_path:
        import urllib.request
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            urllib.request.urlretrieve(TRAFFIC_CSV_URL, tmp.name)
            traffic_path = tmp.name
            cleanup_traffic = True
        if not routes_path:
            with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp2:
                urllib.request.urlretrieve(ROUTES_CSV_URL, tmp2.name)
                routes_path = tmp2.name
                cleanup_routes = True

    audit(traffic_path, routes_path)

    if cleanup_traffic:
        Path(traffic_path).unlink(missing_ok=True)
    if cleanup_routes:
        Path(str(routes_path)).unlink(missing_ok=True)
