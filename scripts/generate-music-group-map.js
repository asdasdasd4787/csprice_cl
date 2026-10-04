const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const crates = JSON.parse(fs.readFileSync(path.join(ROOT, ".tmp_crates.json"), "utf8"));
const catalog = require(path.join(ROOT, "assets", "steam-market-cache", "roi_catalog.json")).items.filter(
  (item) => item.category === "music"
);
const catalogNames = new Set(catalog.map((item) => item.market_hash_name));

function resolveMusicKitName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  if (catalogNames.has(trimmed)) return trimmed;

  if (trimmed.startsWith("StatTrak")) {
    const regular = trimmed.replace(/^StatTrak™\s+/u, "");
    if (catalogNames.has(regular)) return regular;
  }

  if (!trimmed.startsWith("Music Kit | ") && !trimmed.includes(",")) {
    const prefixed = `Music Kit | ${trimmed}`;
    if (catalogNames.has(prefixed)) return prefixed;
  }

  return null;
}

function rosterFromCrate(crateName) {
  const crate = crates.find(
    (entry) => entry.market_hash_name === crateName || entry.name === crateName
  );
  return [...new Set(
    (crate?.contains || [])
      .map((item) => resolveMusicKitName(item.market_hash_name || item.name))
      .filter(Boolean)
  )];
}

const MUSIC_BOX_NAMES = crates
  .map((entry) => String(entry.market_hash_name || entry.name || "").trim())
  .filter((name) => /music kit box$/i.test(name));

const map = Object.fromEntries(
  MUSIC_BOX_NAMES.map((boxName) => [boxName, rosterFromCrate(boxName)])
);

const output = `(() => {
  const MUSIC_GROUP_MAP = ${JSON.stringify(map, null, 2)};
  Object.assign(window.CS2ReactData || (window.CS2ReactData = {}), { MUSIC_GROUP_MAP });
})();
`;

fs.writeFileSync(path.join(ROOT, "react", "music-group-map.js"), output);
console.log(Object.fromEntries(Object.entries(map).map(([key, value]) => [key, value.length])));
