#!/usr/bin/env node
/**
 * Build a compact lookup table for craft inspect links from ByMykel CSGO-API dumps.
 *
 * Downloads (or reuses) stickers.json + skins_not_grouped.json, then writes:
 *   assets/data/craft-econ-lookup.json
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const OUT_PATH = path.join(ROOT, "assets", "data", "craft-econ-lookup.json");
const TMP_STICKERS = path.join(ROOT, ".tmp_stickers_bymykel.json");
const TMP_SKINS = path.join(ROOT, ".tmp_skins_bymykel.json");
const TMP_CRATES = path.join(ROOT, ".tmp_crates.json");
const TMP_AGENTS = path.join(ROOT, ".tmp_agents_bymykel.json");
const CS2_STEAM_CONTEXT = "76561202255233023";

const RARITY_MAP = {
  rarity_default: 0,
  rarity_common: 1,
  rarity_uncommon: 2,
  rarity_rare: 3,
  rarity_mythical: 4,
  rarity_legendary: 5,
  rarity_ancient: 6,
  rarity_contraband: 7,
  rarity_common_weapon: 1,
  rarity_uncommon_weapon: 2,
  rarity_rare_weapon: 3,
  rarity_rare_character: 3,
  rarity_mythical_weapon: 4,
  rarity_mythical_character: 4,
  rarity_legendary_weapon: 5,
  rarity_legendary_character: 5,
  rarity_legendary_gloves: 5,
  rarity_ancient_weapon: 6,
  rarity_ancient_character: 6,
  rarity_ancient_gloves: 6,
  rarity_immortal_weapon: 7,
  rarity_contraband_weapon: 7,
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlink(dest, () => undefined);
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => undefined);
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => file.close(() => resolve(dest)));
    }).on("error", (error) => {
      file.close();
      fs.unlink(dest, () => undefined);
      reject(error);
    });
  });
}

async function ensureSource(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    return dest;
  }
  console.log("downloading", url);
  await download(url, dest);
  return dest;
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function rarityValue(entry) {
  const id = String(entry?.rarity?.id || "").trim();
  return RARITY_MAP[id] ?? 4;
}

function buildContainerInspectUrl(defIndex, options = {}) {
  const { InspectLink, ItemPreviewData } = require("@vlydev/cs2-masked-inspect");
  const rarity = Number(options.rarity);
  const quality = Number(options.quality);
  const hex = InspectLink.serialize(new ItemPreviewData({
    defIndex: Number(defIndex),
    // Unique (4) + base rarity helps CS2 treat the preview as a real container
    // so associated contents orbit around the case/capsule in inspect.
    rarity: Number.isFinite(rarity) && rarity > 0 ? rarity : 1,
    quality: Number.isFinite(quality) && quality > 0 ? quality : 4,
  }));
  return `steam://rungame/730/${CS2_STEAM_CONTEXT}/+csgo_econ_action_preview%20${hex}`;
}

/** Standalone sticker/patch preview: econ type defIndex + sticker kit id in stickers[0]. */
function buildDirectItemInspectUrl(defIndex, stickerId, options = {}) {
  const { InspectLink, ItemPreviewData, Sticker } = require("@vlydev/cs2-masked-inspect");
  const rarity = Number(options.rarity);
  const quality = Number(options.quality);
  const hex = InspectLink.serialize(new ItemPreviewData({
    defIndex: Number(defIndex),
    quality: Number.isFinite(quality) && quality > 0 ? quality : 4,
    rarity: Number.isFinite(rarity) && rarity >= 0 ? rarity : 4,
    stickers: [new Sticker({ slot: 0, stickerId: Number(stickerId) })],
  }));
  return `steam://rungame/730/${CS2_STEAM_CONTEXT}/+csgo_econ_action_preview%20${hex}`;
}

function crateNameAliases(entry) {
  const names = [
    entry?.market_hash_name,
    entry?.name,
  ].filter(Boolean).map((name) => String(name).trim());
  const aliases = new Set(names);
  names.forEach((name) => {
    aliases.add(name.replace(/^PGL\s+/i, ""));
    aliases.add(name.replace(/^ELEAGUE\s+/i, ""));
    aliases.add(name.replace(/^MLG\s+/i, ""));
    if (!/^PGL\s+/i.test(name) && /antwerp/i.test(name)) {
      aliases.add(`PGL ${name}`);
    }
  });
  return Array.from(aliases).filter(Boolean);
}

async function main() {
  await ensureSource(
    "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/stickers.json",
    TMP_STICKERS
  );
  await ensureSource(
    "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json",
    TMP_SKINS
  );
  await ensureSource(
    "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json",
    TMP_CRATES
  );
  await ensureSource(
    "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/agents.json",
    TMP_AGENTS
  );

  const stickers = JSON.parse(fs.readFileSync(TMP_STICKERS, "utf8"));
  const skins = JSON.parse(fs.readFileSync(TMP_SKINS, "utf8"));
  const crates = JSON.parse(fs.readFileSync(TMP_CRATES, "utf8"));
  const agents = JSON.parse(fs.readFileSync(TMP_AGENTS, "utf8"));

  const stickerLookup = {};
  stickers.forEach((entry) => {
    const stickerId = Number(entry?.def_index);
    if (!Number.isFinite(stickerId) || stickerId <= 0) return;
    const rarity = rarityValue(entry);
    // 1209 = CS2 sticker commodity; kit id lives on stickers[0].stickerId
    let inspectUrl = "";
    try {
      inspectUrl = buildDirectItemInspectUrl(1209, stickerId, { rarity, quality: 4 });
    } catch (_error) {
      inspectUrl = "";
    }
    const payload = {
      sticker_id: stickerId,
      rarity,
      quality: 4,
      inspect_url: inspectUrl,
    };
    const names = [
      entry?.market_hash_name,
      entry?.name,
    ].filter(Boolean);
    names.forEach((name) => {
      const key = normalizeKey(name);
      if (!key) return;
      stickerLookup[key] = payload;
    });
  });

  const skinLookup = {};
  skins.forEach((entry) => {
    const defIndex = Number(entry?.weapon?.weapon_id);
    const paintIndex = Number(entry?.paint_index);
    if (!Number.isFinite(defIndex) || defIndex <= 0 || !Number.isFinite(paintIndex) || paintIndex <= 0) {
      return;
    }
    const names = [
      entry?.market_hash_name,
      entry?.name,
    ].filter(Boolean);
    const payload = {
      def_index: defIndex,
      paint_index: paintIndex,
      rarity: rarityValue(entry),
    };
    names.forEach((name) => {
      const key = normalizeKey(name);
      if (!key) return;
      skinLookup[key] = payload;
    });
  });

  const crateLookup = {};
  crates.forEach((entry) => {
    const defIndex = Number(entry?.def_index);
    if (!Number.isFinite(defIndex) || defIndex <= 0) return;
    const rarity = rarityValue(entry);
    let inspectUrl = "";
    try {
      inspectUrl = buildContainerInspectUrl(defIndex, { rarity, quality: 4 });
    } catch (_error) {
      inspectUrl = "";
    }
    const payload = {
      def_index: defIndex,
      rarity,
      quality: 4,
      inspect_url: inspectUrl,
      type: String(entry?.type || "").trim(),
    };
    crateNameAliases(entry).forEach((name) => {
      const key = normalizeKey(name);
      if (!key) return;
      crateLookup[key] = payload;
    });
  });

  const agentLookup = {};
  agents.forEach((entry) => {
    const defIndex = Number(entry?.def_index);
    if (!Number.isFinite(defIndex) || defIndex <= 0) return;
    const rarity = rarityValue(entry);
    let inspectUrl = "";
    try {
      inspectUrl = buildContainerInspectUrl(defIndex, { rarity, quality: 4 });
    } catch (_error) {
      inspectUrl = "";
    }
    if (!inspectUrl) return;
    const payload = {
      def_index: defIndex,
      inspect_url: inspectUrl,
      rarity,
      quality: 4,
    };
    [entry?.market_hash_name, entry?.name].filter(Boolean).forEach((name) => {
      const key = normalizeKey(name);
      if (!key) return;
      agentLookup[key] = payload;
    });
  });

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    version: 4,
    generated_at: new Date().toISOString(),
    stickers: stickerLookup,
    skins: skinLookup,
    crates: crateLookup,
    agents: agentLookup,
    counts: {
      stickers: Object.keys(stickerLookup).length,
      skins: Object.keys(skinLookup).length,
      crates: Object.keys(crateLookup).length,
      agents: Object.keys(agentLookup).length,
    },
  }));

  console.log("wrote", OUT_PATH, {
    stickers: Object.keys(stickerLookup).length,
    skins: Object.keys(skinLookup).length,
    crates: Object.keys(crateLookup).length,
    agents: Object.keys(agentLookup).length,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
