#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'assets', 'steam-market-cache');
const ROI_PATH = path.join(CACHE_DIR, 'roi_catalog.json');
const PRICING_PATH = path.join(CACHE_DIR, 'pricing-bridge.json');
const CATALOG_PATH = path.join(CACHE_DIR, 'catalog.json');
const PRICING_URL = 'https://csroi.com/pricing.json';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function stripWear(marketHashName) {
  return String(marketHashName).replace(
    /\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/,
    ''
  );
}

function splitWear(marketHashName) {
  const match = String(marketHashName).match(
    /^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/
  );
  if (match) {
    return { base_name: match[1].trim(), wear: match[2].trim() };
  }
  return { base_name: marketHashName, wear: '' };
}

function seedPrice(quotes) {
  for (const candidate of [
    quotes?.steam?.last_24h,
    quotes?.skinport?.suggested_price,
    quotes?.skinport?.starting_at,
    quotes?.csfloat?.starting_at,
  ]) {
    if (typeof candidate === 'number' && candidate > 0) {
      return Math.round(candidate * 100) / 100;
    }
  }
  return null;
}

function seedListings(quotes) {
  for (const candidate of [
    quotes?.steam?.num_listings,
    quotes?.csfloat?.num_listings,
    quotes?.youpin?.num_listings,
  ]) {
    if (typeof candidate === 'number' && candidate >= 0) {
      return candidate;
    }
  }
  return null;
}

function marketUrl(marketHashName) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
}

async function loadPricing() {
  if (fs.existsSync(PRICING_PATH)) {
    const ageMs = Date.now() - fs.statSync(PRICING_PATH).mtimeMs;
    if (ageMs < 6 * 60 * 60 * 1000) {
      return JSON.parse(fs.readFileSync(PRICING_PATH, 'utf8'));
    }
  }

  const response = await fetch(PRICING_URL, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch pricing.json: HTTP ${response.status}`);
  }
  const payload = await response.json();
  fs.writeFileSync(PRICING_PATH, JSON.stringify(payload));
  return payload;
}

async function main() {
  const roi = JSON.parse(fs.readFileSync(ROI_PATH, 'utf8'));
  const roiItems = Array.isArray(roi.items) ? roi.items : [];
  const pricing = await loadPricing();

  const items = roiItems.map((entry) => {
    const marketHashName = String(entry.market_hash_name || '').trim();
    const split = splitWear(marketHashName);
    const quotes = pricing[marketHashName] || {};
    const image = String(entry.image || entry.steam_image_url || '').trim();
    const localPath = image.startsWith('assets/') ? image : '';
    const steamImageUrl = image.includes('steamstatic.com') ? image : String(entry.steam_image_url || '');

    return {
      market_hash_name: marketHashName,
      market_url: String(entry.market_url || marketUrl(marketHashName)),
      internal_href: String(entry.internal_href || ''),
      image,
      local_path: localPath,
      project_image_path: String(entry.project_image_path || ''),
      steam_image_url: steamImageUrl,
      category: String(entry.category || 'other'),
      category_label: String(entry.category_label || entry.type_note || 'Other Items'),
      type_note: String(entry.type_note || ''),
      name_color: String(entry.name_color || 'B0C3D9'),
      wear: split.wear,
      base_name: split.base_name,
      sell_price: seedPrice(quotes),
      sell_price_text: '',
      sell_listings: seedListings(quotes),
    };
  });

  items.sort((a, b) =>
    a.market_hash_name.localeCompare(b.market_hash_name, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );

  const payload = {
    updated_at: new Date().toISOString(),
    source: 'roi-catalog-bridge',
    total_count: items.length,
    pages_synced: Math.ceil(items.length / 10),
    download_images: false,
    saved_items: items.length,
    items,
  };

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(payload));
  console.log(
    JSON.stringify(
      {
        success: true,
        catalog_path: 'assets/steam-market-cache/catalog.json',
        saved_items: items.length,
        updated_at: payload.updated_at,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
