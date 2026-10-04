const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "tmp_itemsandcollections.json");
const MANIFEST_PATH = path.join(ROOT, "assets", "models", "skins", "manifest.json");
const BUILDER_SCRIPT = path.join(ROOT, "scripts", "build_textured_model_from_cs2items.ps1");

const WEAPON_SLUGS = [
  "desert-eagle", "dual-berettas", "five-seven", "glock-18", "m4a1-s", "mp5-sd",
  "pp-bizon", "r8-revolver", "sawed-off", "scar-20", "sg-553", "ssg-08", "tec-9",
  "ump-45", "usp-s", "xm1014", "ak-47", "aug", "awp", "cz75-auto", "famas", "g3sg1",
  "galil-ar", "m249", "m4a4", "mac-10", "mag-7", "mp7", "mp9", "negev", "nova",
  "p2000", "p250", "p90", "zeus-x27",
].sort((a, b) => b.length - a.length);

const WEAPON_FOLDER_BY_SLUG = {
  "ak-47": "ak47",
  "cz75-auto": "cz75a",
  "desert-eagle": "deagle",
  "dual-berettas": "elite",
  "five-seven": "fiveseven",
  "galil-ar": "galilar",
  "glock-18": "glock18",
  "m4a1-s": "m4a1_silencer",
  "mac-10": "mac10",
  "mag-7": "mag7",
  "mp5-sd": "mp5sd",
  "p2000": "hkp2000",
  "pp-bizon": "bizon",
  "r8-revolver": "revolver",
  "sawed-off": "sawedoff",
  "scar-20": "scar20",
  "sg-553": "sg556",
  "ssg-08": "ssg08",
  "tec-9": "tec9",
  "ump-45": "ump45",
  "usp-s": "usp_silencer",
  "xm1014": "xm1014",
  "zeus-x27": "taser",
  "m4a4": "m4a1",
};

const IMAGE_PREFIXES_BY_SLUG = {
  "cz75-auto": ["cz75a"],
  "glock-18": ["glock", "glock18"],
  "m4a4": ["m4a1", "m4a4"],
  "p2000": ["hkp2000", "p2000"],
};

const CURATED_MARKET_NAMES = [
  "AK-47 | Redline",
  "AK-47 | Legion of Anubis",
  "AK-47 | Bloodsport",
  "AK-47 | Ice Coaled",
  "AWP | Asiimov",
  "AWP | Printstream",
  "AWP | Redline",
  "AWP | Hyper Beast",
  "M4A1-S | Vaporwave",
  "M4A1-S | Hyper Beast",
  "M4A1-S | Decimator",
  "M4A4 | Asiimov",
  "Desert Eagle | Printstream",
  "MP7 | Bloodsport",
  "P250 | Asiimov",
  "FAMAS | Mecha Industries",
  "USP-S | Cortex",
  "Glock-18 | Water Elemental",
  "AWP | Chromatic Aberration",
  "M4A4 | Desolate Space",
];

function parseArgs(argv) {
  const options = { dryRun: false, onlyMissing: true, limit: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--all") options.onlyMissing = false;
    else if (arg === "--limit") {
      options.limit = Number.parseInt(argv[index + 1] || "0", 10) || 0;
      index += 1;
    }
  }
  return options;
}

function readManifestNames() {
  if (!fs.existsSync(MANIFEST_PATH)) return new Set();
  const payload = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return new Set(items.map((item) => String(item?.market_name || "").trim()).filter(Boolean));
}

function resolveWeaponSlug(itemUrl) {
  const value = String(itemUrl || "").trim().toLowerCase();
  return WEAPON_SLUGS.find((slug) => value.startsWith(`${slug}-`) || value === slug) || "";
}

function resolveWeaponFolder(slug) {
  return WEAPON_FOLDER_BY_SLUG[slug] || slug.replace(/-/g, "");
}

function resolveImagePrefixes(slug, weaponFolder) {
  const explicit = Array.isArray(IMAGE_PREFIXES_BY_SLUG[slug]) ? IMAGE_PREFIXES_BY_SLUG[slug] : [];
  return Array.from(new Set([...explicit, weaponFolder].filter(Boolean)));
}

function resolveFinishToken(itemImage, prefixes) {
  const value = String(itemImage || "").trim();
  if (!value) return "";
  for (const prefix of prefixes) {
    const marker = `weapon_${prefix}_`;
    const markerIndex = value.indexOf(marker);
    if (markerIndex === -1) continue;
    return value.slice(markerIndex + marker.length).replace(/_light_png\.png$/i, "").trim();
  }
  return "";
}

function collectCuratedEntries() {
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const wanted = new Set(CURATED_MARKET_NAMES);
  const entries = [];

  for (const marketName of CURATED_MARKET_NAMES) {
    const item = raw[marketName];
    if (!item) continue;
    const collectionData = Array.isArray(item?.CollectionData) ? item.CollectionData[0] : null;
    const itemUrl = String(collectionData?.ItemUrl || "").trim();
    const itemImage = String(collectionData?.ItemImage || "").trim();
    const weaponSlug = resolveWeaponSlug(itemUrl);
    if (!weaponSlug || !itemImage) continue;
    const weaponFolder = resolveWeaponFolder(weaponSlug);
    const finishToken = resolveFinishToken(itemImage, resolveImagePrefixes(weaponSlug, weaponFolder));
    if (!finishToken) continue;
    entries.push({
      marketName,
      weaponSlug,
      finishToken,
      itemUrl: itemUrl ? `https://cs2items.pro/${itemUrl}` : "",
    });
  }

  return entries.filter((entry) => wanted.has(entry.marketName));
}

function spawnBuilder(entry) {
  const args = [
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    BUILDER_SCRIPT,
    "-MarketName",
    entry.marketName,
    "-WeaponSlug",
    entry.weaponSlug,
    "-FinishToken",
    entry.finishToken,
  ];

  const result = spawnSync("powershell", args, {
    cwd: ROOT,
    stdio: "inherit",
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(`Skin build failed for ${entry.marketName}`);
  }
}

function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(`Catalog not found: ${CATALOG_PATH}`);
  }

  const options = parseArgs(process.argv.slice(2));
  const manifestNames = readManifestNames();
  let entries = collectCuratedEntries();

  if (options.onlyMissing) {
    entries = entries.filter((entry) => !manifestNames.has(entry.marketName));
  }
  if (options.limit > 0) {
    entries = entries.slice(0, options.limit);
  }

  if (!entries.length) {
    console.log("No curated crafter skins queued.");
    return;
  }

  console.log(`Queued ${entries.length} curated Skin Crafter build(s).`);
  entries.forEach((entry, index) => {
    console.log(`${String(index + 1).padStart(2, "0")} ${entry.marketName} -> ${entry.finishToken}`);
  });

  if (options.dryRun) return;

  for (const entry of entries) {
    console.log(`\n=== Building ${entry.marketName} ===`);
    spawnBuilder(entry);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
