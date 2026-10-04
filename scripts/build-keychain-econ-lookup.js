const fs = require("fs");
const path = require("path");

const LOOKUP_PATH = path.join(__dirname, "..", "assets", "data", "craft-econ-lookup.json");
const KEYCHAINS_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/keychains.json";
const HIGHLIGHTS_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/highlights.json";
const SLABS_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/sticker_slabs.json";

const SPECIAL_KEYCHAINS = {
  "Charm | Austin 2025 Highlight": { def_index: 36 },
  "Souvenir Charm | Austin 2025 Highlight": { def_index: 36 },
  "Charm | Budapest 2025 Highlight": { def_index: 83 },
  "Souvenir Charm | Budapest 2025 Highlight": { def_index: 83 },
  "Charm | Cologne 2026 Highlight": { def_index: 84 },
  "Souvenir Charm | Cologne 2026 Highlight": { def_index: 84 },
  "Sticker Slab": { def_index: 37 },
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${url}: ${res.status}`);
  return res.json();
}

function asArray(data) {
  return Array.isArray(data) ? data : Object.values(data || {});
}

async function main() {
  const [keychainData, highlightData, slabData] = await Promise.all([
    fetchJson(KEYCHAINS_URL),
    fetchJson(HIGHLIGHTS_URL),
    fetchJson(SLABS_URL),
  ]);

  const keychains = { ...SPECIAL_KEYCHAINS };
  for (const item of asArray(keychainData)) {
    const name = String(item.market_hash_name || item.name || "").trim();
    const defIndex = parseInt(item.def_index, 10);
    if (!name || !defIndex) continue;
    keychains[name] = { def_index: defIndex };
  }

  const highlights = {};
  for (const item of asArray(highlightData)) {
    const name = String(item.market_hash_name || item.name || "").trim();
    const reel = parseInt(item.def_index, 10);
    if (!name || !reel) continue;
    const inv = String(item.original?.image_inventory || "");
    let keychainDef = 36;
    if (inv.includes("bud2025")) keychainDef = 83;
    else if (inv.includes("cologne2026")) keychainDef = 84;
    else if (inv.includes("aus2025")) keychainDef = 36;
    highlights[name] = { def_index: keychainDef, highlight_reel: reel };
  }

  const stickerSlabs = {};
  for (const item of asArray(slabData)) {
    const name = String(item.market_hash_name || item.name || "").trim();
    const paintKit = parseInt(item.def_index, 10);
    if (!name || !paintKit) continue;
    stickerSlabs[name] = { def_index: 37, paint_kit: paintKit };
  }

  const lookup = JSON.parse(fs.readFileSync(LOOKUP_PATH, "utf-8"));
  lookup.keychains = keychains;
  lookup.highlights = highlights;
  lookup.sticker_slabs = stickerSlabs;
  fs.writeFileSync(LOOKUP_PATH, JSON.stringify(lookup));
  console.log(
    `Wrote keychains=${Object.keys(keychains).length} highlights=${Object.keys(highlights).length} sticker_slabs=${Object.keys(stickerSlabs).length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
