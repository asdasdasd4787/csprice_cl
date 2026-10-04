/**
 * Download default CS2 weapon showcase images from Counter-Strike Fandom wiki.
 * Source: https://counterstrike.fandom.com/wiki/Weapons
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const API = "https://counterstrike.fandom.com/api.php";

const WEAPON_IMAGES = [
  // Pistols
  { folder: "pistols", name: "Zeus x27", url: "https://cdn.csroi.com/weapons/base_weapons/weapon_taser_png.png" },
  { folder: "pistols", name: "CZ75-Auto", file: "CS2_CZ75-Auto_Inventory.png" },
  { folder: "pistols", name: "Desert Eagle", file: "CS2_Desert_Eagle_Inventory.png" },
  { folder: "pistols", name: "Dual Berettas", file: "CS2_Dual_Berettas_Inventory.png" },
  { folder: "pistols", name: "Five-SeveN", file: "CS2_Five-SeveN_Inventory.png" },
  { folder: "pistols", name: "Glock-18", file: "CS2_Glock-18_Inventory.png" },
  { folder: "pistols", name: "P2000", file: "CS2_P2000_Inventory.png" },
  { folder: "pistols", name: "P250", file: "CS2_P250_Inventory.png" },
  { folder: "pistols", name: "R8 Revolver", file: "CS2_R8_Revolver_Inventory.png" },
  { folder: "pistols", name: "Tec-9", file: "CS2_Tec-9_Inventory.png" },
  { folder: "pistols", name: "USP-S", file: "CS2_USP-S_Inventory.png" },
  // SMGs
  { folder: "smgs", name: "MAC-10", file: "CS2_MAC-10_Inventory.png" },
  { folder: "smgs", name: "MP5-SD", file: "CS2_MP5-SD_Inventory.png" },
  { folder: "smgs", name: "MP7", file: "CS2_MP7_Inventory.png" },
  { folder: "smgs", name: "MP9", file: "CS2_MP9_Inventory.png" },
  { folder: "smgs", name: "PP-Bizon", file: "CS2_PP-Bizon_Inventory.png" },
  { folder: "smgs", name: "P90", file: "CS2_P90_Inventory.png" },
  { folder: "smgs", name: "UMP-45", file: "CS2_UMP-45_Inventory.png" },
  // Shotguns
  { folder: "shotguns", name: "MAG-7", file: "CS2_MAG-7_Inventory.png" },
  { folder: "shotguns", name: "Nova", file: "CS2_Nova_Inventory.png" },
  { folder: "shotguns", name: "Sawed-Off", file: "CS2_Sawed-Off_Inventory.png" },
  { folder: "shotguns", name: "XM1014", file: "CS2_XM1014_Inventory.png" },
  // LMGs
  { folder: "lmgs", name: "M249", file: "CS2_M249_Inventory.png" },
  { folder: "lmgs", name: "Negev", file: "CS2_Negev_Inventory.png" },
  // Rifles
  { folder: "rifles", name: "AK-47", file: "CS2_AK-47_Inventory.png" },
  { folder: "rifles", name: "AUG", file: "CS2_AUG_Inventory.png" },
  { folder: "rifles", name: "AWP", file: "CS2_AWP_Inventory.png" },
  { folder: "rifles", name: "FAMAS", file: "CS2_FAMAS_Inventory.png" },
  { folder: "rifles", name: "G3SG1", file: "CS2_G3SG1_Inventory.png" },
  { folder: "rifles", name: "Galil AR", file: "CS2_Galil_AR_Inventory.png" },
  { folder: "rifles", name: "M4A1-S", file: "CS2_M4A1-S_Inventory.png" },
  { folder: "rifles", name: "M4A4", file: "CS2_M4A4_Inventory.png" },
  { folder: "rifles", name: "SCAR-20", file: "CS2_SCAR-20_Inventory.png" },
  { folder: "rifles", name: "SG 553", file: "CS2_SG_553_Inventory.png" },
  { folder: "rifles", name: "SSG 08", file: "CS2_SSG_08_Inventory.png" },
  // Knives
  { folder: "knives", name: "Bayonet", file: "Cs2-knife-bayonet-stock.png" },
  { folder: "knives", name: "Bowie Knife", file: "Cs2-weapon_knife_survival_bowie.png" },
  { folder: "knives", name: "Butterfly Knife", file: "Cs2-knife-butterfly-stock-market.png" },
  { folder: "knives", name: "Classic Knife", file: "Weapon_knife_css_cs2.png" },
  { folder: "knives", name: "Falchion Knife", file: "Cs2-falchion-knife-market.png" },
  { folder: "knives", name: "Flip Knife", file: "Cs2-knife-flip-stock.png" },
  { folder: "knives", name: "Gut Knife", file: "Cs2-knife-gut-stock.png" },
  { folder: "knives", name: "Huntsman Knife", file: "Cs2-knife-huntsman-stock.png" },
  { folder: "knives", name: "Karambit", file: "Cs2-knife-karambit-stock.png" },
  { folder: "knives", name: "Kukri Knife", file: "CS2_weapon_knife_kukri.png" },
  { folder: "knives", name: "M9 Bayonet", file: "Cs2-knife-m9-bayonet-stock.png" },
  { folder: "knives", name: "Navaja Knife", file: "Weapon_knife_gypsy_jackknife_cs2.png" },
  { folder: "knives", name: "Nomad Knife", file: "Weapon_knife_outdoor_cs2.png" },
  { folder: "knives", name: "Paracord Knife", file: "Weapon_knife_cord_cs2.png" },
  { folder: "knives", name: "Shadow Daggers", file: "Cs2-knife-shadow-daggers-stock.png" },
  { folder: "knives", name: "Skeleton Knife", file: "Weapon_knife_skeleton_cs2.png" },
  { folder: "knives", name: "Stiletto Knife", file: "Weapon_knife_stiletto_cs2.png" },
  { folder: "knives", name: "Talon Knife", url: "https://cdn.csroi.com/weapons/base_weapons/weapon_knife_widowmaker_png.png" },
  { folder: "knives", name: "Ursus Knife", url: "https://cdn.csroi.com/weapons/base_weapons/weapon_knife_ursus_png.png" },
  // Gloves — use *_light_large.png renders (not grey inventory silhouettes)
  { folder: "gloves", name: "Bloodhound Gloves", file: "Studded_bloodhound_gloves_bloodhound_guerrilla_light_large.png" },
  { folder: "gloves", name: "Broken Fang Gloves", file: "Jade.png" },
  { folder: "gloves", name: "Driver Gloves", file: "Slick_gloves_slick_red_light_large.png" },
  { folder: "gloves", name: "Hand Wraps", file: "Leather_handwraps_handwrap_leathery_light_large.png" },
  { folder: "gloves", name: "Hydra Gloves", file: "Studded_hydra_gloves_bloodhound_hydra_black_green_light_large.png" },
  { folder: "gloves", name: "Moto Gloves", file: "Motorcycle_gloves_motorcycle_mint_triangle_light_large.png" },
  { folder: "gloves", name: "Specialist Gloves", file: "Specialist_gloves_specialist_emerald_web_light_large.png" },
  { folder: "gloves", name: "Sport Gloves", file: "Sporty_gloves_sporty_light_blue_light_large.png" },
];

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "csgo-price-tracker/1.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchJson(res.headers.location).then(resolve).catch(reject);
          return;
        }
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "csgo-price-tracker/1.0" } }, (res) => {
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
      })
      .on("error", reject);
  });
}

function normalizeFileKey(name) {
  return String(name || "").replace(/ /g, "_").toLowerCase();
}

function wikiFileTitle(file) {
  return `File:${String(file || "").replace(/ /g, "_")}`;
}

async function resolveImageUrls(files) {
  const titles = files.map((file) => wikiFileTitle(file)).join("|");
  const url = `${API}?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=512&titles=${titles}`;
  const payload = await fetchJson(url);
  const pages = payload?.query?.pages || {};
  const byTitle = new Map();

  Object.values(pages).forEach((page) => {
    if (!page?.title || page.missing) return;
    const info = page.imageinfo?.[0];
    if (!info?.url) return;
    const fileName = page.title.replace(/^File:/, "");
    byTitle.set(normalizeFileKey(fileName), info.url);
  });

  return byTitle;
}

async function main() {
  const folderFilter = process.argv.find((arg) => arg.startsWith("--folder="))?.split("=")[1] || "";
  const entries = folderFilter
    ? WEAPON_IMAGES.filter((entry) => entry.folder === folderFilter)
    : WEAPON_IMAGES;

  const chunkSize = 40;
  const urlMap = new Map();

  for (let index = 0; index < entries.length; index += chunkSize) {
    const chunk = entries.slice(index, index + chunkSize);
    const chunkUrls = await resolveImageUrls(chunk.filter((entry) => entry.file).map((entry) => entry.file));
    chunkUrls.forEach((value, key) => urlMap.set(key, value));
  }

  let ok = 0;
  let failed = 0;

  for (const entry of entries) {
    const imageUrl = entry.url || urlMap.get(normalizeFileKey(entry.file));
    const dest = path.join(ROOT, "assets", "weapons", entry.folder, `${slugify(entry.name)}.png`);
    if (!imageUrl) {
      console.error(`MISS  ${entry.name} (${entry.file || entry.url || "unknown"})`);
      failed += 1;
      continue;
    }
    try {
      await downloadFile(imageUrl, dest);
      console.log(`OK    ${entry.folder}/${slugify(entry.name)}.png`);
      ok += 1;
    } catch (error) {
      console.error(`FAIL  ${entry.name}: ${error.message}`);
      failed += 1;
    }
  }

  console.log(`\nDone: ${ok} downloaded, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
