/**
 * Download CS2 weapon silhouette SVGs from counter-strike-icons (Valve game assets).
 * https://github.com/Juknum/counter-strike-icons
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_DIR = path.join(__dirname, "..", "assets", "icons", "equipment");
const BASE =
  "https://raw.githubusercontent.com/Juknum/counter-strike-icons/main/cs2/panorama/images/icons/equipment";

const ICONS = [
  "ak47", "ammobox", "ammobox_threepack", "armor", "armor_helmet", "assaultsuit",
  "assaultsuit_helmet_only", "aug", "awp", "bayonet", "bizon", "c4", "clothing_hands",
  "customplayer", "cz75a", "deagle", "decoy", "defuser", "disconnect", "dronegun",
  "elite", "famas", "firebomb", "fiveseven", "flair0", "flashbang", "flashbang_assist",
  "g3sg1", "galilar", "glock", "grenadepack", "grenadepack2", "healthshot",
  "heavy_armor", "hegrenade", "helmet", "hkp2000", "incgrenade", "inferno", "kevlar",
  "knife", "knife_bowie", "knife_butterfly", "knife_canis", "knife_cord", "knife_css",
  "knife_falchion", "knife_flip", "knife_gut", "knife_gypsy_jackknife", "knife_karambit",
  "knife_kukri", "knife_m9_bayonet", "knife_outdoor", "knife_push", "knife_skeleton",
  "knife_stiletto", "knife_survival_bowie", "knife_t", "knife_tactical", "knife_twinblade",
  "knife_ursus", "knife_widowmaker", "knifegg", "m249", "m4a1", "m4a1_silencer",
  "m4a1_silencer_off", "mac10", "mag7", "melee", "molotov", "movelinear", "mp5sd",
  "mp7", "mp9", "negev", "nova", "p2000", "p250", "p90", "planted_c4",
  "prop_exploding_barrel", "revolver", "sawedoff", "scar20", "sg556", "smokegrenade",
  "spray0", "ssg08", "stomp_damage", "taser", "tec9", "trigger_hurt", "ump45",
  "usp_silencer", "usp_silencer_off", "world", "worldent", "xm1014",
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "CS2PriceTracker/1.0" } }, (response) => {
        if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          download(response.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          fs.writeFileSync(dest, Buffer.concat(chunks));
          resolve(dest);
        });
      })
      .on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let saved = 0;
  let failed = 0;

  for (const name of ICONS) {
    const dest = path.join(OUT_DIR, `${name}.svg`);
    try {
      await download(`${BASE}/${name}.svg`, dest);
      saved++;
    } catch (error) {
      failed++;
      console.error(`skip ${name}: ${error.message}`);
    }
  }

  const attribution = `# CS2 equipment weapon icons

Source: https://github.com/Juknum/counter-strike-icons (Valve game assets, extracted from CS2).
Used in the site navbar weapon preview and category links.
`;

  fs.writeFileSync(path.join(__dirname, "..", "assets", "icons", "EQUIPMENT_ATTRIBUTION.txt"), attribution);
  console.log(`done: saved=${saved} failed=${failed} -> ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
