/**
 * Copy CS2 equipment icons from game files (panorama/images/icons/equipment)
 * or download PNG fallbacks when the game install is unavailable.
 *
 * Usage:
 *   node scripts/extract-cs2-equipment-icons.js
 *   CS2_GAME_PATH="D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive" node scripts/extract-cs2-equipment-icons.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "icons", "equipment");

const ICON_MAP = [
  { key: "pistol.png", game: ["pistol.png", "weapon_pistol.png", "equipment_pistol.png"] },
  { key: "smg.png", game: ["smg.png", "weapon_smg.png", "equipment_smg.png"] },
  { key: "shotgun.png", game: ["shotgun.png", "weapon_shotgun.png", "equipment_shotgun.png"] },
  { key: "machinegun.png", game: ["machinegun.png", "weapon_machinegun.png", "equipment_machinegun.png"] },
  { key: "rifle.png", game: ["rifle.png", "weapon_rifle.png", "equipment_rifle.png"] },
  { key: "knife.png", game: ["knife.png", "weapon_knife.png", "equipment_knife.png"] },
  { key: "gloves.png", game: ["gloves.png", "weapon_gloves.png", "equipment_gloves.png"] },
];

const FALLBACK_URLS = {
  "pistol.png": "https://raw.githubusercontent.com/SteamDatabase/GameTracking-CSGO/master/game/csgo/panorama/images/icons/equipment/pistol_png.png",
  "smg.png": "https://raw.githubusercontent.com/SteamDatabase/GameTracking-CSGO/master/game/csgo/panorama/images/icons/equipment/smg_png.png",
  "shotgun.png": "https://raw.githubusercontent.com/SteamDatabase/GameTracking-CSGO/master/game/csgo/panorama/images/icons/equipment/shotgun_png.png",
  "machinegun.png": "https://raw.githubusercontent.com/SteamDatabase/GameTracking-CSGO/master/game/csgo/panorama/images/icons/equipment/machinegun_png.png",
  "rifle.png": "https://raw.githubusercontent.com/SteamDatabase/GameTracking-CSGO/master/game/csgo/panorama/images/icons/equipment/rifle_png.png",
  "knife.png": "https://raw.githubusercontent.com/SteamDatabase/GameTracking-CSGO/master/game/csgo/panorama/images/icons/equipment/knife_png.png",
  "gloves.png": "https://raw.githubusercontent.com/SteamDatabase/GameTracking-CSGO/master/game/csgo/panorama/images/icons/equipment/gloves_png.png",
};

function candidateGameRoots() {
  const fromEnv = String(process.env.CS2_GAME_PATH || "").trim();
  const defaults = [
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive",
    "D:\\Steam\\steamapps\\common\\Counter-Strike Global Offensive",
    "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike 2",
  ];
  return [fromEnv, ...defaults].filter(Boolean);
}

function findEquipmentDir() {
  for (const root of candidateGameRoots()) {
    const dir = path.join(root, "game", "csgo", "panorama", "images", "icons", "equipment");
    if (fs.existsSync(dir)) return dir;
  }
  return "";
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "csgo-price-tracker/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(dest)));
      file.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const equipmentDir = findEquipmentDir();
  let copied = 0;
  let downloaded = 0;
  let failed = 0;

  for (const entry of ICON_MAP) {
    const dest = path.join(OUT_DIR, entry.key);
    const svgFallback = path.join(OUT_DIR, entry.key.replace(/\.png$/i, ".svg"));
    let source = "";

    if (equipmentDir) {
      for (const candidate of entry.game) {
        const full = path.join(equipmentDir, candidate);
        if (fs.existsSync(full)) {
          source = full;
          break;
        }
      }
    }

    try {
      if (source) {
        fs.copyFileSync(source, dest);
        console.log(`COPY  ${entry.key} <- ${source}`);
        copied += 1;
        continue;
      }

      if (fs.existsSync(svgFallback)) {
        fs.copyFileSync(svgFallback, dest);
        console.log(`SVG   ${entry.key} <- ${path.basename(svgFallback)}`);
        copied += 1;
        continue;
      }

      const url = FALLBACK_URLS[entry.key];
      if (!url) {
        console.error(`MISS  ${entry.key} (no source)`);
        failed += 1;
        continue;
      }

      await downloadFile(url, dest);
      console.log(`DL    ${entry.key}`);
      downloaded += 1;
    } catch (error) {
      console.error(`FAIL  ${entry.key}: ${error.message}`);
      failed += 1;
    }
  }

  console.log(`\nDone: ${copied} copied from game, ${downloaded} downloaded, ${failed} failed.`);
  if (equipmentDir) {
    console.log(`Game equipment dir: ${equipmentDir}`);
  } else {
    console.log("Game equipment dir not found — used GitHub fallbacks.");
  }
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
