const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_DIR = path.join(__dirname, "..", "assets", "other");

const WIKI_FILES = {
  "patches.png": "Patches-inventory.png",
  "patch-csgo.png": "Patch-pack-01.png",
  "patch-alyx.png": "Patch_hlalyx_alyx_large.png",
  "patch-metal-skill-group.png": "Patch_silver_large.png",
  "patch-riptide.png": "Patch_op11_abandon_hope_large.png",
  "patch-stockholm-2021.png": "Patch_teamstitch_t.png",
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "CS2PriceTracker/1.0" } }, (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
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

async function resolveWikiImageUrl(fileName) {
  const apiUrl =
    "https://counterstrike.fandom.com/api.php?action=query&titles=" +
    encodeURIComponent(`File:${fileName}`) +
    "&prop=imageinfo&iiprop=url&format=json";
  const payload = await fetchJson(apiUrl);
  const page = Object.values(payload?.query?.pages || {})[0];
  return page?.imageinfo?.[0]?.url || "";
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const [destFile, wikiFile] of Object.entries(WIKI_FILES)) {
    const dest = path.join(OUT_DIR, destFile);
    const url = await resolveWikiImageUrl(wikiFile);
    if (!url) {
      throw new Error(`No wiki image found for ${destFile} (${wikiFile})`);
    }
    await download(url, dest);
    console.log(`saved ${destFile} (${fs.statSync(dest).size} bytes)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
