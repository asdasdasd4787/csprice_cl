/**
 * Queue textured GLB builds from roi_catalog.json using the PowerShell skin pipeline.
 *
 * Usage:
 *   node scripts/build-textured-models-from-roi-catalog.js --dry-run
 *   node scripts/build-textured-models-from-roi-catalog.js --limit 5
 *   node scripts/build-textured-models-from-roi-catalog.js --category knives
 *
 * Environment (optional):
 *   CS2_VPK_PATH, BLENDER_PATH, S2V_CLI_PATH
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "assets", "steam-market-cache", "roi_catalog.json");
const MANIFEST_PATH = path.join(ROOT, "assets", "models", "skins", "manifest.json");
const BUILDER_SCRIPT = path.join(ROOT, "scripts", "build_textured_model_from_cs2items.ps1");

const WEAPON_SLUGS = [
  "desert-eagle", "dual-berettas", "five-seven", "glock-18", "m4a1-s", "mp5-sd",
  "pp-bizon", "r8-revolver", "sawed-off", "scar-20", "sg-553", "ssg-08", "tec-9",
  "ump-45", "usp-s", "xm1014", "ak-47", "aug", "awp", "cz75-auto", "famas", "g3sg1",
  "galil-ar", "m249", "m4a4", "mac-10", "mag-7", "mp7", "mp9", "negev", "nova",
  "p2000", "p250", "p90", "zeus-x27", "bayonet", "bowie-knife", "butterfly-knife",
  "falchion-knife", "flip-knife", "gut-knife", "huntsman-knife", "karambit",
  "m9-bayonet", "navaja-knife", "nomad-knife", "skeleton-knife", "stiletto-knife",
  "kukri-knife", "paracord-knife", "shadow-daggers", "classic-knife", "talon-knife", "ursus-knife",
].sort((a, b) => b.length - a.length);

const SLUG_ALIASES = {
  "zeus x27": "zeus-x27",
  "sg 553": "sg-553",
  "ssg 08": "ssg-08",
  "r8 revolver": "r8-revolver",
  "galil ar": "galil-ar",
  "dual berettas": "dual-berettas",
  "five-seven": "five-seven",
  "m4a1-s": "m4a1-s",
  "mp5-sd": "mp5-sd",
  "pp-bizon": "pp-bizon",
  "sawed-off": "sawed-off",
  "scar-20": "scar-20",
  "bowie knife": "bowie-knife",
  "butterfly knife": "butterfly-knife",
  "falchion knife": "falchion-knife",
  "flip knife": "flip-knife",
  "gut knife": "gut-knife",
  "huntsman knife": "huntsman-knife",
  "m9 bayonet": "m9-bayonet",
  "navaja knife": "navaja-knife",
  "nomad knife": "nomad-knife",
  "skeleton knife": "skeleton-knife",
  "stiletto knife": "stiletto-knife",
  "kukri knife": "kukri-knife",
  "paracord knife": "paracord-knife",
  "shadow daggers": "shadow-daggers",
  "classic knife": "classic-knife",
  "talon knife": "talon-knife",
  "ursus knife": "ursus-knife",
};

function parseArgs(argv) {
  const options = { limit: 0, category: "", onlyMissing: true, dryRun: false, name: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit") options.limit = Number.parseInt(argv[++i] || "0", 10) || 0;
    else if (arg === "--category") options.category = String(argv[++i] || "").trim().toLowerCase();
    else if (arg === "--name") options.name = String(argv[++i] || "").trim().toLowerCase();
    else if (arg === "--all") options.onlyMissing = false;
    else if (arg === "--dry-run") options.dryRun = true;
  }
  return options;
}

function stripWear(name) {
  return String(name || "").replace(/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "").trim();
}

function normalizeBase(name) {
  return stripWear(name).replace(/^★\s*/u, "").replace(/^StatTrak™\s*/i, "").replace(/^Souvenir\s*/i, "").trim();
}

function resolveWeaponSlug(baseName) {
  const weapon = String(baseName.split("|")[0] || "").trim().toLowerCase();
  if (SLUG_ALIASES[weapon]) return SLUG_ALIASES[weapon];
  const slug = weapon.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return WEAPON_SLUGS.find((entry) => slug === entry || slug.startsWith(`${entry}-`) || entry.startsWith(slug)) || slug;
}

function resolveFinishToken(baseName) {
  const parts = String(baseName || "").split("|");
  if (parts.length < 2) return "";
  return parts.slice(1).join("|").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function readManifestNames() {
  if (!fs.existsSync(MANIFEST_PATH)) return new Set();
  const payload = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return new Set(items.map((entry) => String(entry?.market_name || "").trim()).filter(Boolean));
}

function collectEntries() {
  const payload = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const map = new Map();

  items.forEach((item) => {
    const category = String(item?.category || "").toLowerCase();
    if (!["skins", "knives"].includes(category)) return;
    const base = normalizeBase(item.market_hash_name || item.display_name || "");
    if (!base.includes("|")) return;
    const weaponSlug = resolveWeaponSlug(base);
    const finishToken = resolveFinishToken(base);
    if (!weaponSlug || !finishToken) return;
    map.set(base, {
      marketName: base,
      weaponSlug,
      finishToken,
      category,
      image: String(item.steam_image_url || item.image || ""),
    });
  });

  return [...map.values()].sort((a, b) => a.marketName.localeCompare(b.marketName));
}

function spawnBuilder(entry) {
  const result = spawnSync(
    "powershell",
    ["-ExecutionPolicy", "Bypass", "-File", BUILDER_SCRIPT, "-MarketName", entry.marketName, "-WeaponSlug", entry.weaponSlug, "-FinishToken", entry.finishToken],
    { cwd: ROOT, stdio: "inherit", windowsHide: true, env: process.env }
  );
  if (result.status !== 0) {
    throw new Error(`Build failed for ${entry.marketName}`);
  }
}

function main() {
  if (!fs.existsSync(CATALOG_PATH)) throw new Error(`Missing catalog: ${CATALOG_PATH}`);
  if (!fs.existsSync(BUILDER_SCRIPT)) throw new Error(`Missing builder: ${BUILDER_SCRIPT}`);

  const options = parseArgs(process.argv.slice(2));
  const manifestNames = readManifestNames();
  let entries = collectEntries();

  if (options.category) entries = entries.filter((entry) => entry.category === options.category);
  if (options.onlyMissing) entries = entries.filter((entry) => !manifestNames.has(entry.marketName));
  if (options.name) entries = entries.filter((entry) => entry.marketName.toLowerCase().includes(options.name));
  if (options.limit > 0) entries = entries.slice(0, options.limit);

  if (!entries.length) {
    console.log("No catalog skins queued for textured model builds.");
    return;
  }

  console.log(`Queued ${entries.length} textured model build(s) from roi_catalog.json`);
  entries.forEach((entry, index) => {
    console.log(`${String(index + 1).padStart(4, " ")}  ${entry.marketName}`);
  });

  if (options.dryRun) return;

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
