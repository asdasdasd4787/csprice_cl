/**
 * Download glove family showcase images from CSGODatabase glove pages.
 * Usage: node scripts/download-csgodatabase-gloves.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "weapons", "gloves");

const GLOVES = [
  { slug: "bloodhound-gloves", name: "Bloodhound Gloves", url: "https://www.csgodatabase.com/images/gloves/bloodhound-gloves.png" },
  { slug: "broken-fang-gloves", name: "Broken Fang Gloves", url: "https://www.csgodatabase.com/images/gloves/broken-fang-gloves.png" },
  { slug: "driver-gloves", name: "Driver Gloves", url: "https://www.csgodatabase.com/images/gloves/driver-gloves.png" },
  { slug: "hand-wraps", name: "Hand Wraps", url: "https://www.csgodatabase.com/images/gloves/hand-wraps.png" },
  { slug: "hydra-gloves", name: "Hydra Gloves", url: "https://www.csgodatabase.com/images/gloves/hydra-gloves.png" },
  { slug: "moto-gloves", name: "Moto Gloves", url: "https://www.csgodatabase.com/images/gloves/moto-gloves.png" },
  { slug: "specialist-gloves", name: "Specialist Gloves", url: "https://www.csgodatabase.com/images/gloves/specialist-gloves.png" },
  { slug: "sport-gloves", name: "Sport Gloves", url: "https://www.csgodatabase.com/images/gloves/sport-gloves.png" },
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "csgo-price-tracker/1.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
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
  let ok = 0;
  let failed = 0;

  for (const glove of GLOVES) {
    const dest = path.join(OUT_DIR, `${glove.slug}.png`);
    try {
      await downloadFile(glove.url, dest);
      console.log(`OK    ${glove.slug}.png`);
      ok += 1;
    } catch (error) {
      console.error(`FAIL  ${glove.name}: ${error.message}`);
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
