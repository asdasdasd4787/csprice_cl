const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_DIR = path.join(__dirname, "..", "assets", "other");

const WIKI_FILES = {
  "pins.png": "Csgo-collectible-pin-guardian.png",
  "pins-series-1.png": "Csgo-collectible-pin-guardian.png",
};

const STEAM_FALLBACKS = {
  "pins-alyx.png":
    "https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJai2l-lQ8ndwMWvJjSU6lp58YTg41vrRCLhl5jf_C5C983_OOo6c6jECmXEluoltLBsTCqywht14m7Wm9qgIi-eaA8nDJdxQOQK5BPqjJS5YAqVR3CV/512fx512f",
  "pins-series-2.png":
    "https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJai2l-lQ8ndwMWvJjSU6lp58YTg41vrRCLhl5jf-jda_fanaapScr7CDzeVlegn5eI-Gnu2wh4itzvVntf9cX6QbAZ1CJcjQeMLuhCwmtbnKaq8sJtUlEYN/512fx512f",
  "pins-series-3.png":
    "https://community.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJai2l-lQ8ndwMWvJjSU6lp58YTg41vrRCLhl5jf-jda_fanaapSc77KV2TAlbkk4OA8Fi3jlBgm4jvQm9esI3iWOlQoW5VxF-Ze5hC-wIWzKaq8sP_rqume/512fx512f",
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
    let url = await resolveWikiImageUrl(wikiFile);
    if (!url && STEAM_FALLBACKS[destFile]) {
      url = STEAM_FALLBACKS[destFile];
    }
    if (!url) {
      throw new Error(`No image source found for ${destFile}`);
    }
    await download(url, dest);
    console.log(`saved ${destFile} from ${url.includes("wikia") ? "wiki" : "steam"} (${fs.statSync(dest).size} bytes)`);
  }

  for (const [destFile, url] of Object.entries(STEAM_FALLBACKS)) {
    if (WIKI_FILES[destFile]) continue;
    const dest = path.join(OUT_DIR, destFile);
    await download(url, dest);
    console.log(`saved ${destFile} from steam (${fs.statSync(dest).size} bytes)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
