#!/usr/bin/env node
/**
 * Build the Skin Crafter sticker browser catalog from ROI market cache + craft econ IDs.
 *
 * Writes: assets/data/crafter-sticker-catalog.json
 *
 * Prefer this over slicing roi_catalog live — the crafter used to cap at ~900 by
 * listings volume, which hid most tournament stickers (e.g. Berlin 2019).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ROI_PATH = path.join(ROOT, "assets", "steam-market-cache", "roi_catalog.json");
const ECON_PATH = path.join(ROOT, "assets", "data", "craft-econ-lookup.json");
const BYMYKEL_PATH = path.join(ROOT, ".tmp_stickers_bymykel.json");
const OUT_PATH = path.join(ROOT, "assets", "data", "crafter-sticker-catalog.json");

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isRemoteImageUrl(url) {
  return /^https?:\/\//i.test(String(url || "").trim());
}

/**
 * Prefer Steam CDN / remote icons over local cache files.
 * Some ROI local_path PNGs for stickers were saved as Sticker Slab case art
 * (e.g. Strike A Pose, Lefty) — those must not win over steam_image_url.
 */
function pickStickerImage(item, bymImage = "") {
  const steam = String(item?.steam_image_url || "").trim();
  const image = String(item?.image || "").trim();
  const local = String(item?.local_path || "").trim();
  const bym = String(bymImage || "").trim();
  const remotes = [steam, image, bym].filter(isRemoteImageUrl);
  if (remotes.length) return remotes[0];
  const locals = [image, local, bym].filter(Boolean);
  return locals[0] || "";
}

function imageQualityScore(url) {
  if (!url) return 0;
  if (isRemoteImageUrl(url)) return 4;
  if (String(url).startsWith("assets/")) return 1;
  return 2;
}

function main() {
  if (!fs.existsSync(ROI_PATH)) {
    throw new Error(`Missing ROI catalog: ${ROI_PATH}`);
  }
  if (!fs.existsSync(ECON_PATH)) {
    throw new Error(`Missing craft econ lookup: ${ECON_PATH}`);
  }

  const roi = JSON.parse(fs.readFileSync(ROI_PATH, "utf8"));
  const econ = JSON.parse(fs.readFileSync(ECON_PATH, "utf8"));
  const stickerEcon = econ.stickers && typeof econ.stickers === "object" ? econ.stickers : {};

  const bymykelByName = new Map();
  if (fs.existsSync(BYMYKEL_PATH) && fs.statSync(BYMYKEL_PATH).size > 1000) {
    const raw = JSON.parse(fs.readFileSync(BYMYKEL_PATH, "utf8"));
    if (Array.isArray(raw)) {
      raw.forEach((entry) => {
        const name = String(entry?.market_hash_name || entry?.name || "").trim();
        if (!name.startsWith("Sticker |") || name.startsWith("Sticker Slab |")) return;
        bymykelByName.set(normalizeKey(name), entry);
      });
    }
  }

  const byName = new Map();

  const upsert = (row) => {
    const name = String(row.market_hash_name || "").trim();
    if (!name.startsWith("Sticker |") || name.startsWith("Sticker Slab |")) return;
    const key = normalizeKey(name);
    if (!key) return;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, row);
      return;
    }
    // Prefer remote Steam icons over local cache files, then sticker_id / listings.
    const prevScore =
      imageQualityScore(prev.image) + (prev.sticker_id ? 2 : 0) + (prev.seed_sell_listings > 0 ? 1 : 0);
    const nextScore =
      imageQualityScore(row.image) + (row.sticker_id ? 2 : 0) + (row.seed_sell_listings > 0 ? 1 : 0);
    if (nextScore > prevScore || (nextScore === prevScore && row.seed_sell_listings > prev.seed_sell_listings)) {
      byName.set(key, { ...prev, ...row, market_hash_name: prev.market_hash_name || row.market_hash_name });
    } else {
      const preferImage =
        imageQualityScore(prev.image) >= imageQualityScore(row.image) ? prev.image || row.image : row.image || prev.image;
      byName.set(key, {
        ...row,
        ...prev,
        image: preferImage,
        sticker_id: prev.sticker_id || row.sticker_id,
        seed_sell_price: prev.seed_sell_price ?? row.seed_sell_price,
        seed_sell_listings: Math.max(prev.seed_sell_listings || 0, row.seed_sell_listings || 0),
      });
    }
  };

  const roiItems = Array.isArray(roi.items) ? roi.items : [];
  for (const item of roiItems) {
    if (!item || typeof item !== "object") continue;
    const name = String(item.market_hash_name || "").trim();
    if (!name.startsWith("Sticker |") || name.startsWith("Sticker Slab |")) continue;
    const key = normalizeKey(name);
    const econEntry = stickerEcon[key] || null;
    const stickerId = Number(econEntry?.sticker_id || 0);
    const bym = bymykelByName.get(key);
    const bymImage = String(bym?.image || "").trim();
    const image = pickStickerImage(item, bymImage);
    upsert({
      market_hash_name: name,
      display_name: String(item.display_name || name).trim() || name,
      image,
      category: "stickers",
      type_note: String(item.type_note || bym?.type || "Sticker").trim() || "Sticker",
      seed_sell_price: Number.isFinite(Number(item.seed_sell_price)) ? Number(item.seed_sell_price) : null,
      seed_sell_listings: Number.isFinite(Number(item.seed_sell_listings)) ? Number(item.seed_sell_listings) : 0,
      sticker_id: Number.isFinite(stickerId) && stickerId > 0 ? stickerId : null,
    });
  }

  // Fill any ByMykel stickers missing from ROI (rare; keeps catalog complete).
  for (const [key, entry] of bymykelByName) {
    if (byName.has(key)) continue;
    const name = String(entry.market_hash_name || entry.name || "").trim();
    const image = String(entry.image || "").trim();
    if (!name || !image) continue;
    const econEntry = stickerEcon[key] || null;
    const stickerId = Number(econEntry?.sticker_id || entry.def_index || 0);
    upsert({
      market_hash_name: name,
      display_name: name,
      image,
      category: "stickers",
      type_note: String(entry.type || "Sticker").trim() || "Sticker",
      seed_sell_price: null,
      seed_sell_listings: 0,
      sticker_id: Number.isFinite(stickerId) && stickerId > 0 ? stickerId : null,
    });
  }

  // Upgrade any remaining local-only images when ByMykel has a remote icon.
  for (const [key, row] of byName) {
    if (isRemoteImageUrl(row.image)) continue;
    const bym = bymykelByName.get(key);
    const bymImage = String(bym?.image || "").trim();
    if (isRemoteImageUrl(bymImage)) {
      row.image = bymImage;
      byName.set(key, row);
    }
  }

  const items = Array.from(byName.values()).filter((row) => row.image);
  items.sort((left, right) => {
    const listingDelta = (right.seed_sell_listings || 0) - (left.seed_sell_listings || 0);
    if (listingDelta !== 0) return listingDelta;
    return String(left.market_hash_name).localeCompare(String(right.market_hash_name));
  });

  const withId = items.filter((row) => row.sticker_id).length;
  const berlin = items.filter((row) => /berlin\s*2019/i.test(row.market_hash_name)).length;
  const localOnly = items.filter((row) => !isRemoteImageUrl(row.image)).length;

  const payload = {
    version: 2,
    generated_at: new Date().toISOString(),
    source: {
      roi_catalog: "assets/steam-market-cache/roi_catalog.json",
      craft_econ: "assets/data/craft-econ-lookup.json",
      bymykel: bymykelByName.size > 0 ? ".tmp_stickers_bymykel.json" : null,
    },
    counts: {
      stickers: items.length,
      with_sticker_id: withId,
      berlin_2019: berlin,
      local_only_images: localOnly,
    },
    items,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload));
  console.log("wrote", OUT_PATH, payload.counts);
}

main();
