const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const crates = JSON.parse(fs.readFileSync(path.join(ROOT, ".tmp_crates.json"), "utf8"));
const stickers = JSON.parse(fs.readFileSync(path.join(ROOT, ".tmp_stickers.json"), "utf8"));
const catalog = require(path.join(ROOT, "assets", "steam-market-cache", "roi_catalog.json")).items.filter(
  (item) => item.category === "stickers"
);
const catalogNames = new Set(catalog.map((item) => item.market_hash_name));

const COMMUNITY_SERIES_RANGES = {
  3: [258, 272],
  4: [273, 285],
  5: [370, 379],
};

const STICKER_GROUP_SOURCES = {
  "Community Capsule 1": { crates: ["Community Sticker Capsule 1"] },
  "Community Series 2": { crates: ["Sticker Capsule 2"] },
  "Community Series 3": { communitySeries: 3 },
  "Community Series 4": { communitySeries: 4 },
  "Community Series 5": { communitySeries: 5 },
  "Community 2018": { crates: ["Community Capsule 2018"] },
  "Community 2021": { crates: ["2021 Community Sticker Capsule"] },
  "CS20 Capsule": { crates: ["CS20 Sticker Capsule"] },
  "10 Year Birthday": { crates: ["10 Year Birthday Sticker Capsule"] },
  "Shattered Web": { crates: ["Shattered Web Sticker Collection"] },
  "Broken Fang": { crates: ["Broken Fang Sticker Collection"] },
  "Operation Riptide": { crates: ["Operation Riptide Sticker Collection"] },
  "Recoil Collection": { crates: ["Recoil Sticker Collection"] },
  "Poorly Drawn": { crates: ["Poorly Drawn Capsule"] },
  "Chicken Capsule": { crates: ["Chicken Capsule"] },
  "Half-Life: Alyx": { crates: ["Half-Life: Alyx Sticker Capsule"] },
  "Halo Capsule": { crates: ["Halo Capsule"] },
  "Warhammer 40K": { crates: ["Warhammer 40,000 Sticker Capsule"] },
  "Pinups Capsule": { crates: ["Pinups Capsule"] },
  "Enfu Capsule": { crates: ["Enfu Sticker Capsule"] },
  "Sugarface Capsule": { crates: ["Sugarface Capsule"] },
  "Team Roles Capsule": { crates: ["Team Roles Capsule"] },
  "Bestiary Capsule": { crates: ["Bestiary Capsule"] },
  "Elemental Craft": { inventoryFolder: "elemental_craft" },
  "Character Craft": { inventoryFolder: "sticker_craft" },
};

function resolveStickerName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  if (catalogNames.has(trimmed)) return trimmed;
  const prefixed = trimmed.startsWith("Sticker | ") ? trimmed : `Sticker | ${trimmed}`;
  if (catalogNames.has(prefixed)) return prefixed;
  return null;
}

function fromCrate(label) {
  const crate = crates.find((entry) => entry.market_hash_name === label || entry.name === label);
  return (crate?.contains || [])
    .map((item) => resolveStickerName(item.market_hash_name || item.name))
    .filter(Boolean);
}

function fromCommunitySeries(seriesNumber) {
  const range = COMMUNITY_SERIES_RANGES[seriesNumber];
  if (!range) return [];

  const [minIndex, maxIndex] = range;
  return stickers
    .filter((item) => String(item.original?.image_inventory || "").includes("econ/stickers/community02/"))
    .filter((item) => {
      const index = Number(item.def_index);
      return Number.isFinite(index) && index >= minIndex && index <= maxIndex;
    })
    .map((item) => resolveStickerName(item.market_hash_name))
    .filter(Boolean);
}

function fromInventoryFolder(folder) {
  return stickers
    .filter((item) => String(item.original?.image_inventory || "").includes(folder))
    .map((item) => resolveStickerName(item.market_hash_name))
    .filter(Boolean);
}

function buildRoster(source) {
  const names = [];

  if (Array.isArray(source?.crates)) {
    source.crates.forEach((crateName) => {
      names.push(...fromCrate(crateName));
    });
  }

  if (source?.communitySeries) {
    names.push(...fromCommunitySeries(source.communitySeries));
  }

  if (source?.inventoryFolder) {
    names.push(...fromInventoryFolder(source.inventoryFolder));
  }

  return [...new Set(names)];
}

const map = Object.fromEntries(
  Object.entries(STICKER_GROUP_SOURCES).map(([groupName, source]) => [groupName, buildRoster(source)])
);

const output = `(() => {
  const STICKER_GROUP_MAP = ${JSON.stringify(map, null, 2)};
  Object.assign(window.CS2ReactData || (window.CS2ReactData = {}), { STICKER_GROUP_MAP });
})();
`;

fs.writeFileSync(path.join(ROOT, "react", "sticker-group-map.js"), output);
console.log(Object.fromEntries(Object.entries(map).map(([key, value]) => [key, value.length])));
