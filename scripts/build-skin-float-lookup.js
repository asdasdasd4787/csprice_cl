#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "assets", "steam-market-cache", "skin_float_lookup.json");
const API = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json";

function normalizeKey(name) {
  return String(name || "")
    .replace(/^Souvenir\s+/i, "")
    .replace(/^StatTrak™\s+/i, "")
    .replace(/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "")
    .trim()
    .toLowerCase();
}

function stripWear(name) {
  return String(name || "")
    .replace(/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "")
    .trim();
}

async function main() {
  const response = await fetch(API, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch skins_not_grouped.json: HTTP ${response.status}`);
  }

  const rows = await response.json();
  const bySkinId = new Map();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const skinId = String(row.skin_id || row.id || "").trim();
    const marketHashName = String(row.market_hash_name || row.name || "").trim();
    const minFloat = Number(row.min_float);
    const maxFloat = Number(row.max_float);
    if (!skinId || !marketHashName || !Number.isFinite(minFloat) || !Number.isFinite(maxFloat)) {
      continue;
    }

    const baseName = stripWear(marketHashName);
    const key = normalizeKey(baseName);
    if (!key) continue;

    const existing = bySkinId.get(skinId) || {
      base_name: baseName,
      min_float: minFloat,
      max_float: maxFloat,
      keys: new Set(),
    };
    existing.min_float = Math.min(existing.min_float, minFloat);
    existing.max_float = Math.max(existing.max_float, maxFloat);
    existing.keys.add(key);
    bySkinId.set(skinId, existing);
  }

  const items = {};
  for (const entry of bySkinId.values()) {
    const payload = {
      base_name: entry.base_name,
      min_float: Math.round(entry.min_float * 100000) / 100000,
      max_float: Math.round(entry.max_float * 100000) / 100000,
    };
    for (const key of entry.keys) {
      items[key] = payload;
    }
  }

  const output = {
    updated_at: new Date().toISOString(),
    total_count: Object.keys(items).length,
    items,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output));
  console.log(`Wrote ${output.total_count} skin float entries to ${path.relative(ROOT, OUTPUT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
