const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "tmp_itemsandcollections.json");
const MANIFEST_PATH = path.join(ROOT, "assets", "models", "skins", "manifest.json");
const POWERSHELL = "powershell";
const BUILDER_SCRIPT = path.join(ROOT, "scripts", "build_textured_model_from_cs2items.ps1");

const WEAPON_SLUGS = [
  "desert-eagle",
  "dual-berettas",
  "five-seven",
  "glock-18",
  "m4a1-s",
  "mp5-sd",
  "pp-bizon",
  "r8-revolver",
  "sawed-off",
  "scar-20",
  "sg-553",
  "ssg-08",
  "tec-9",
  "ump-45",
  "usp-s",
  "xm1014",
  "ak-47",
  "aug",
  "awp",
  "cz75-auto",
  "famas",
  "g3sg1",
  "galil-ar",
  "m249",
  "m4a4",
  "mac-10",
  "mag-7",
  "mp7",
  "mp9",
  "negev",
  "nova",
  "p2000",
  "p250",
  "p90",
  "zeus-x27"
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
  "zeus-x27": "taser"
};

const IMAGE_PREFIXES_BY_SLUG = {
  "cz75-auto": ["cz75a"],
  "glock-18": ["glock", "glock18"],
  "m4a4": ["m4a1", "m4a4"],
  "p2000": ["hkp2000", "p2000"]
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readManifestNames() {
  if (!fs.existsSync(MANIFEST_PATH)) return new Set();
  const payload = readJson(MANIFEST_PATH);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return new Set(items.map((item) => String(item?.market_name || "").trim()).filter(Boolean));
}

function parseArgs(argv) {
  const options = {
    limit: 0,
    name: "",
    onlyMissing: true,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--limit") {
      options.limit = Number.parseInt(argv[index + 1] || "0", 10) || 0;
      index += 1;
    } else if (arg === "--name") {
      options.name = String(argv[index + 1] || "").trim();
      index += 1;
    } else if (arg === "--all") {
      options.onlyMissing = false;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
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
  for (const prefix of Array.isArray(prefixes) ? prefixes : []) {
    const marker = `weapon_${prefix}_`;
    const markerIndex = value.indexOf(marker);
    if (markerIndex === -1) continue;
    const suffix = value.slice(markerIndex + marker.length);
    return suffix.replace(/_light_png\.png$/i, "").trim();
  }
  return "";
}

function collectCatalogEntries() {
  const raw = readJson(CATALOG_PATH);
  const records = [];

  for (const [marketName, item] of Object.entries(raw || {})) {
    const collectionData = Array.isArray(item?.CollectionData) ? item.CollectionData[0] : null;
    const itemUrl = String(collectionData?.ItemUrl || "").trim();
    const itemImage = String(collectionData?.ItemImage || "").trim();
    const weaponSlug = resolveWeaponSlug(itemUrl);
    if (!weaponSlug || !itemImage || !String(marketName || "").includes("|")) {
      continue;
    }

    const weaponFolder = resolveWeaponFolder(weaponSlug);
    const finishToken = resolveFinishToken(itemImage, resolveImagePrefixes(weaponSlug, weaponFolder));
    if (!finishToken) {
      continue;
    }

    records.push({
      marketName: String(marketName).trim(),
      itemUrl,
      itemImage,
      weaponSlug,
      weaponFolder,
      finishToken
    });
  }

  records.sort((left, right) => left.marketName.localeCompare(right.marketName));
  return records;
}

function spawnBuilder(entry) {
  const result = spawnSync(
    POWERSHELL,
    [
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      BUILDER_SCRIPT,
      "-MarketName",
      entry.marketName,
      "-WeaponSlug",
      entry.weaponSlug,
      "-FinishToken",
      entry.finishToken
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true
    }
  );

  if (result.status !== 0) {
    throw new Error(`Skin build failed for ${entry.marketName} (${entry.finishToken})`);
  }
}

function main() {
  if (!fs.existsSync(CATALOG_PATH)) {
    throw new Error(`Catalog not found: ${CATALOG_PATH}`);
  }
  if (!fs.existsSync(BUILDER_SCRIPT)) {
    throw new Error(`Builder script not found: ${BUILDER_SCRIPT}`);
  }

  const options = parseArgs(process.argv.slice(2));
  const manifestNames = readManifestNames();
  let entries = collectCatalogEntries();

  if (options.onlyMissing) {
    entries = entries.filter((entry) => !manifestNames.has(entry.marketName));
  }
  if (options.name) {
    const needle = options.name.toLowerCase();
    entries = entries.filter((entry) => entry.marketName.toLowerCase().includes(needle));
  }
  if (options.limit > 0) {
    entries = entries.slice(0, options.limit);
  }

  if (!entries.length) {
    console.log("No matching catalog entries to build.");
    return;
  }

  console.log(`Queued ${entries.length} skin model build(s).`);
  entries.forEach((entry, index) => {
    console.log(`${String(index + 1).padStart(3, "0")} ${entry.marketName} -> ${entry.finishToken}`);
  });

  if (options.dryRun) {
    return;
  }

  for (const entry of entries) {
    spawnBuilder(entry);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
