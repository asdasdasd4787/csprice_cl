const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const crates = JSON.parse(fs.readFileSync(path.join(ROOT, ".tmp_crates.json"), "utf8"));

function rarityCss(rarity) {
  const normalized = String(rarity || "").replace(/[ -]/g, "_");
  const map = {
    Covert: "covert",
    Extraordinary: "covert",
    Classified: "classified",
    Exotic: "classified",
    Restricted: "restricted",
    Remarkable: "restricted",
    Mil_Spec: "milspec",
    High_Grade: "milspec",
    HighGrade: "milspec",
    Industrial: "industrial",
    Consumer: "consumer",
    Base_Grade: "consumer",
    BaseGrade: "consumer",
    Contraband: "covert",
  };
  return map[normalized] || "milspec";
}

function rarityBadge(rarity) {
  const normalized = String(rarity || "").replace(/[ -]/g, "_");
  const map = {
    Covert: "Covert",
    Extraordinary: "Extraordinary",
    Classified: "Classified",
    Exotic: "Exotic",
    Restricted: "Restricted",
    Remarkable: "Remarkable",
    Mil_Spec: "Mil-Spec",
    High_Grade: "High Grade",
    HighGrade: "High Grade",
    Industrial: "Industrial Grade",
    Consumer: "Consumer Grade",
    Base_Grade: "Base Grade",
    BaseGrade: "Base Grade",
    Contraband: "Contraband",
  };
  return map[normalized] || String(rarity || "").replace(/_/g, " ");
}

function toMarketName(raw, crateType) {
  const name = String(raw || "").trim();
  if (!name) return "";
  if (/^(Sticker|Patch|Charm|Agent|Pin|Music Kit|Sealed Graffiti|Graffiti)\s*\|/i.test(name)) {
    return name;
  }
  if (/patch capsule/i.test(crateType)) return `Patch | ${name}`;
  if (/music/i.test(crateType)) {
    return name.startsWith("Music Kit") ? name : `Music Kit | ${name}`;
  }
  if (/graffiti/i.test(crateType)) {
    return /^(Sealed Graffiti|Graffiti)\b/i.test(name) ? name : `Sealed Graffiti | ${name}`;
  }
  return `Sticker | ${name}`;
}

function parseWeaponSkin(name) {
  const parts = String(name || "").split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { weapon: parts[0], skin: parts.slice(1).join(" | ") };
  }
  return { weapon: name, skin: name };
}

function isCapsuleCrate(crate) {
  const type = String(crate.type || "");
  const name = String(crate.market_hash_name || crate.name || "");
  if (/^(Sticker Capsule|Autograph Capsule|Patch Capsule)$/i.test(type)) return true;
  if (/\bcapsule\b/i.test(name)) return true;
  if (/\(Holo-Foil\)|\(Holo\/Foil\)/i.test(name)) return true;
  return false;
}

function buildItems(crate) {
  const type = String(crate.type || "");
  return (crate.contains || [])
    .map((entry) => {
      const market = toMarketName(entry.market_hash_name || entry.name, type);
      if (!market) return null;
      const rarityName = entry.rarity?.name || entry.rarity || "High Grade";
      const parsed = parseWeaponSkin(market);
      return {
        weapon: parsed.weapon,
        skin: parsed.skin,
        rarity: rarityCss(rarityName),
        badge: rarityBadge(rarityName),
        img: entry.image || entry.icon || "",
        float: "",
        noWear: true,
        flatName: market,
        market_hash_name: market,
      };
    })
    .filter(Boolean);
}

function pushAlias(map, key, items) {
  const normalized = String(key || "").trim();
  if (!normalized || items.length < 2) return;
  if (!map[normalized]) map[normalized] = items;
  const slash = normalized.replace(/Holo-Foil/gi, "Holo/Foil");
  const hyphen = normalized.replace(/Holo\/Foil/gi, "Holo-Foil");
  if (slash !== normalized && !map[slash]) map[slash] = items;
  if (hyphen !== normalized && !map[hyphen]) map[hyphen] = items;
}

const lookup = {};
let crateCount = 0;

for (const crate of crates) {
  if (!isCapsuleCrate(crate)) continue;
  const items = buildItems(crate);
  if (items.length < 2) continue;
  const name = String(crate.market_hash_name || crate.name || "").trim();
  pushAlias(lookup, name, items);
  crateCount += 1;
}

const outPath = path.join(ROOT, "assets", "data", "capsule-contents-lookup.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(lookup));
console.log(
  JSON.stringify(
    {
      crates: crateCount,
      keys: Object.keys(lookup).length,
      bytes: fs.statSync(outPath).size,
    },
    null,
    2
  )
);
