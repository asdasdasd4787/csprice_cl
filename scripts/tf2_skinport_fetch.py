"""Fetch Skinport's TF2 item prices (app 440, EUR) into a JSON file.

Skinport's /v1/items answers only with Brotli compression, which the PHP curl
on this machine cannot decode, so scripts/tf2_import.php (mode "skinport")
calls this helper instead.

    python scripts/tf2_skinport_fetch.py assets/data/tf2/skinport.json
"""
import json
import sys
import time

import requests

out = sys.argv[1]
resp = requests.get(
    "https://api.skinport.com/v1/items",
    # No "tradable" filter: tradable=0 returns the rows without prices.
    params={"app_id": 440, "currency": "EUR"},
    headers={"Accept-Encoding": "br", "Accept": "application/json", "User-Agent": "CSPrice/1.0"},
    timeout=90,
)
if resp.status_code != 200:
    print(f"skinport HTTP {resp.status_code}", file=sys.stderr)
    sys.exit(1)
prices = {}
for row in resp.json():
    name = str(row.get("market_hash_name") or "").strip()
    price = row.get("min_price")
    if not name or price is None:
        continue
    # Skinport's own TF2 category is the path segment of market_page
    # (".../tf2/market/<category>?item=..."), e.g. "cosmetic", "crate".
    page = str(row.get("market_page") or "")
    cat = page.split("/market/", 1)[1].split("?", 1)[0] if "/market/" in page else ""
    prices[name] = {"p": round(float(price), 2), "q": int(row.get("quantity") or 0), "c": cat}
with open(out, "w", encoding="utf-8") as fh:
    json.dump({"updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "prices": prices}, fh, ensure_ascii=False)
print(f"skinport: {len(prices)} TF2 items with a listing")

# Sales history (7 / 30 / 90-day averages and volumes) for every item that
# sold at all in 90 days: the TF2 ticker's trend source until the import's
# own daily snapshots cover a window (see the ticker block in tf2_import.php).
hist_out = out.replace("skinport.json", "skinport-history.json")
resp = requests.get(
    "https://api.skinport.com/v1/sales/history",
    params={"app_id": 440, "currency": "EUR"},
    headers={"Accept-Encoding": "br", "Accept": "application/json", "User-Agent": "CSPrice/1.0"},
    timeout=120,
)
if resp.status_code == 200:
    hist = {}
    for row in resp.json():
        name = str(row.get("market_hash_name") or "").strip()
        d90 = row.get("last_90_days") or {}
        if not name or not d90.get("volume"):
            continue
        entry = {}
        for key, win in (("7", "last_7_days"), ("30", "last_30_days"), ("90", "last_90_days")):
            w = row.get(win) or {}
            if w.get("avg"):
                entry[key] = [round(float(w["avg"]), 2), int(w.get("volume") or 0)]
        if entry:
            hist[name] = entry
    with open(hist_out, "w", encoding="utf-8") as fh:
        json.dump({"updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "history": hist}, fh, ensure_ascii=False)
    print(f"skinport: {len(hist)} TF2 items with 90-day sales history")
else:
    print(f"skinport history HTTP {resp.status_code}", file=sys.stderr)
