/**
 * Download high-resolution CS2 sticker set images.
 * Prefers Fandom wiki capsule renders when available, then ByMykel / catalog.
 *
 * Usage: node scripts/download-fandom-sticker-images.js
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const API = "https://counterstrike.fandom.com/api.php";
const CATALOG_PATH = path.join(ROOT, "assets", "steam-market-cache", "roi_catalog.json");
const BYMYKEL_CRATES_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json";
const BYMYKEL_COLLECTIONS_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collections.json";

const STICKER_IMAGES = [
  { slug: "budapest-2025", name: "Budapest 2025", crate: "Budapest 2025 Legends Sticker Capsule" },
  { slug: "austin-2025", name: "Austin 2025", crate: "Austin 2025 Legends Sticker Capsule" },
  { slug: "shanghai-2024", name: "Shanghai 2024", crate: "Shanghai 2024 Legends Sticker Capsule" },
  { slug: "copenhagen-2024", name: "Copenhagen 2024", crate: "Copenhagen 2024 Legends Sticker Capsule" },
  { slug: "paris-2023", name: "Paris 2023", crate: "Paris 2023 Legends Sticker Capsule" },
  { slug: "rio-2022", name: "Rio 2022", wikiPage: "IEM_Rio_2022_Stickers", file: "Crate sticker pack rio2022 challengers large.png", crate: "Rio 2022 Challengers Sticker Capsule" },
  { slug: "antwerp-2022", name: "Antwerp 2022", crate: "Antwerp 2022 Legends Sticker Capsule" },
  { slug: "stockholm-2021", name: "Stockholm 2021", wikiPage: "PGL_Stockholm_2021_Stickers", file: "Crate sticker pack stockh2021 legends large.png", crate: "Stockholm 2021 Legends Sticker Capsule" },

  { slug: "rmr-2020", name: "2020 RMR", wikiPage: "2020_RMR_Stickers", crate: "2020 RMR Challengers" },
  { slug: "berlin-2019", name: "Berlin 2019", wikiPage: "StarLadder_Berlin_2019_Stickers", crate: "Berlin 2019 Legends Sticker Capsule" },
  { slug: "katowice-2019", name: "Katowice 2019", wikiPage: "IEM_Katowice_2019_Stickers", file: "Iem-katowice-2019-challengers-capsule.png", crate: "Katowice 2019 Legends Sticker Capsule" },
  { slug: "london-2018", name: "London 2018", wikiPage: "FACEIT_London_2018_Stickers", file: "Faceit-london-2018-legends-capsule.png", crate: "London 2018 Legends (Holo/Foil)" },
  { slug: "boston-2018", name: "Boston 2018", wikiPage: "ELEAGUE_Boston_2018_Stickers", file: "Eleague-boston-2018-legends-capsule.png", crate: "Boston 2018 Legends (Holo/Foil)" },
  { slug: "krakow-2017", name: "Krakow 2017", wikiPage: "PGL_Krakow_2017_Stickers", file: "Crate sticker pack krakow2017 01.png", crate: "Krakow 2017 Legends Sticker Capsule" },
  { slug: "atlanta-2017", name: "Atlanta 2017", wikiPage: "ELEAGUE_Atlanta_2017_Stickers", file: "Eleague-atlanta-17-legends-capsule.png", crate: "Atlanta 2017 Legends (Holo/Foil)" },
  { slug: "cologne-2016", name: "Cologne 2016", wikiPage: "ESL_One_Cologne_2016_Stickers", file: "Cologne-2016-legends-capsule.png", crate: "Cologne 2016 Legends Sticker Capsule" },
  { slug: "mlg-columbus-2016", name: "MLG Columbus 2016", wikiPage: "MLG_Columbus_2016_Legends_(Holo-Foil)", file: "Csgo-crate sticker pack columbus2016 01.png", crate: "MLG Columbus 2016 Legends (Holo/Foil)" },
  { slug: "cluj-napoca-2015", name: "Cluj-Napoca 2015", wikiPage: "DreamHack_Cluj-Napoca_2015_Legends_(Foil)", file: "Csgo-crate sticker pack cluj2015 01.png", crate: "DreamHack Cluj-Napoca 2015 Legends (Foil)" },
  { slug: "cologne-2015", name: "Cologne 2015", wikiPage: "ESL_One_Cologne_2015_Legends_(Foil)", file: "Csgo-crate sticker pack eslcologne2015 01.png", crate: "ESL One Cologne 2015 Legends (Foil)" },
  { slug: "katowice-2015", name: "Katowice 2015", wikiPage: "ESL_One_Katowice_2015_Stickers", file: "Csgo-kat15-stickers-challengers.png" },
  { slug: "dreamhack-2014", name: "DreamHack 2014", wikiPage: "DreamHack_2014_Stickers", file: "Csgo-dhw2014-legends-capsule.png" },
  { slug: "cologne-2014", name: "Cologne 2014", wikiPage: "ESL_One_Cologne_2014_Stickers", file: "Sticker-cologne-2014-challengers-market.png" },
  { slug: "katowice-2014", name: "Katowice 2014", wikiPage: "EMS_Katowice_2014_Stickers", file: "EMS-Katowice-2014-Challengers.png" },

  { slug: "elemental-craft", name: "Elemental Craft", collection: "Elemental Craft Sticker Pack" },
  { slug: "character-craft", name: "Character Craft", collection: "Character Craft Sticker Pack" },
  { slug: "community-2018", name: "Community 2018", file: "Crate_sticker_pack_comm2018_01_capsule.png", crate: "Community Capsule 2018" },
  { slug: "community-2021", name: "Community 2021", file: "Crate_sticker_pack_community2021_capsule_large.png", crate: "2021 Community Sticker Capsule" },
  { slug: "community-series-5", name: "Community Series 5", fallbackWebp: true },
  { slug: "community-series-4", name: "Community Series 4", fallbackWebp: true },
  { slug: "community-series-3", name: "Community Series 3", fallbackWebp: true },
  { slug: "community-series-2", name: "Community Series 2", crate: "Sticker Capsule 2" },
  { slug: "community-capsule-1", name: "Community Capsule 1", crate: "Community Sticker Capsule 1" },
  { slug: "broken-fang", name: "Broken Fang", crate: "Broken Fang Sticker Collection" },
  { slug: "shattered-web", name: "Shattered Web", crate: "Shattered Web Sticker Collection" },
  { slug: "riptide", name: "Operation Riptide", crate: "Operation Riptide Sticker Collection" },
  { slug: "recoil", name: "Recoil Collection", crate: "Recoil Sticker Collection" },

  { slug: "10-year-birthday", name: "10 Year Birthday", file: "Crate_sticker_pack_csgo10_capsule_large.png", crate: "10 Year Birthday Sticker Capsule" },
  { slug: "cs20", name: "CS20 Capsule", file: "CS20_Sticker_Capsule.png", crate: "CS20 Sticker Capsule" },
  { slug: "poorly-drawn", name: "Poorly Drawn", file: "Poorly-drawn-capsule.png", crate: "Poorly Drawn Capsule" },
  { slug: "chicken", name: "Chicken Capsule", file: "ChickenCapsulePreview.png", crate: "Chicken Capsule" },
  { slug: "half-life-alyx", name: "Half-Life: Alyx", file: "Hla_sticker_capsule.png", crate: "Half-Life: Alyx Sticker Capsule" },
  { slug: "halo", name: "Halo Capsule", crate: "Halo Capsule" },
  { slug: "warhammer-40k", name: "Warhammer 40K", crate: "Warhammer 40,000 Sticker Capsule" },
  { slug: "pinups", name: "Pinups Capsule", file: "Csgo-stickers-pinups_capsule.png", crate: "Pinups Capsule" },
  { slug: "enfu", name: "Enfu Capsule", file: "Csgo-sticker-capsule-enfu.png", crate: "Enfu Sticker Capsule" },
  { slug: "sugarface", name: "Sugarface Capsule", file: "Csgo_crate_sticker_pack_sugarface_capsule.png", crate: "Sugarface Capsule" },
  { slug: "team-roles", name: "Team Roles Capsule", file: "Csgo-stickers-team_roles_capsule.png", crate: "Team Roles Capsule" },
  { slug: "bestiary", name: "Bestiary Capsule", file: "Csgo_crate_sticker_pack_bestiary_capsule.png", crate: "Bestiary Capsule" },
];

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
    const client = url.startsWith("https") ? https : require("http");
    client
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

function pickWikiCapsuleFile(fileTitles) {
  const names = fileTitles
    .map((title) => String(title || "").replace(/^File:/, "").trim())
    .filter(Boolean);

  const scored = names.map((name) => {
    const compact = name.toLowerCase().replace(/[\s_-]+/g, "");
    let score = 0;

    if (/cratestickerpack|stickerpack.*capsule|stickerscapsule/.test(compact)) score += 40;
    if (/capsule\.png$/.test(name.toLowerCase())) score += 36;
    if (/challengerscapsule|legendscapsule|challengers-market|legends-market/.test(compact)) score += 34;
    if (/ems-katowice-2014-(challengers|legends)/.test(name.toLowerCase())) score += 34;
    if (/csgo-kat15-stickers-(challengers|legends)/.test(compact)) score += 34;
    if (/csgo-dhw2014.*capsule/.test(compact)) score += 34;
    if (/challengers-capsule|legends-capsule/.test(compact)) score += 30;
    if (/crate_sticker_pack|sticker_pack.*capsule/.test(name.toLowerCase())) score += 28;
    if (/challengers\.png$|legends\.png$/.test(name.toLowerCase())) score += 24;

    if (/logo|logoblk|majorlogo|bombdefusal|pick.em|autograph/.test(compact)) score -= 40;
    if (/sig |signature|holo|foil|gold|glitter/.test(name.toLowerCase()) && !/capsule|crate sticker pack/.test(name.toLowerCase())) score -= 20;
    if (/sticker-.*-(holo|foil|gold|market)/.test(name.toLowerCase()) && !/challengers-market|legends-market/.test(name.toLowerCase())) score -= 12;

    if (/\.png$/i.test(name)) score += 2;
    if (/large/i.test(name)) score += 2;

    return { name, score };
  });

  const best = scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  return best?.name || "";
}

async function resolveFandomUrls(files) {
  const uniqueFiles = [...new Set(files.filter(Boolean))];
  const byTitle = new Map();
  const chunkSize = 20;

  for (let index = 0; index < uniqueFiles.length; index += chunkSize) {
    const chunk = uniqueFiles.slice(index, index + chunkSize);
    const titles = chunk.map((file) => wikiFileTitle(file)).join("|");
    const url = `${API}?action=query&format=json&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(titles)}`;
    const payload = await fetchJson(url);
    const pages = payload?.query?.pages || {};

    Object.values(pages).forEach((page) => {
      if (!page?.title || page.missing) return;
      const info = page.imageinfo?.[0];
      if (!info?.url) return;
      const fileName = page.title.replace(/^File:/, "");
      byTitle.set(normalizeFileKey(fileName), info.url);
    });
  }

  return byTitle;
}

async function resolveWikiPageImages(wikiPages) {
  const uniquePages = [...new Set(wikiPages.filter(Boolean))];
  const byPage = new Map();

  for (const pageTitle of uniquePages) {
    let continueToken = "";
    const fileTitles = [];

    do {
      const url = `${API}?action=query&format=json&prop=images&imlimit=500&titles=${encodeURIComponent(pageTitle)}${continueToken ? `&imcontinue=${encodeURIComponent(continueToken)}` : ""}`;
      const payload = await fetchJson(url);
      const page = Object.values(payload?.query?.pages || {})[0];
      if (!page || page.missing) break;

      (page.images || []).forEach((image) => {
        if (image?.title) fileTitles.push(image.title);
      });

      continueToken = payload?.continue?.imcontinue || "";
    } while (continueToken);

    byPage.set(pageTitle, fileTitles);
  }

  return byPage;
}

function loadCatalogSteamUrls() {
  const payload = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const byName = new Map();
  (payload.items || []).forEach((item) => {
    const name = String(item.market_hash_name || "").trim();
    const imageUrl = String(item.steam_image_url || "").trim();
    if (name && imageUrl) {
      byName.set(name.toLowerCase(), imageUrl);
    }
  });
  return byName;
}

async function loadByMykelMaps() {
  const [crates, collections] = await Promise.all([
    fetchJson(BYMYKEL_CRATES_URL),
    fetchJson(BYMYKEL_COLLECTIONS_URL),
  ]);

  const crateByName = new Map();
  (Array.isArray(crates) ? crates : []).forEach((entry) => {
    const name = String(entry?.name || "").trim();
    const image = String(entry?.image || "").trim();
    if (name && image) {
      crateByName.set(name.toLowerCase(), image);
    }
  });

  const collectionByName = new Map();
  (Array.isArray(collections) ? collections : []).forEach((entry) => {
    const name = String(entry?.name || "").trim();
    const image = String(entry?.image || "").trim();
    if (name && image) {
      collectionByName.set(name.toLowerCase(), image);
    }
  });

  return { crateByName, collectionByName };
}

function resolveWikiFile(entry, sources) {
  const { fandomUrls, wikiPageImages } = sources;

  if (entry.file) {
    const explicit = fandomUrls.get(normalizeFileKey(entry.file));
    if (explicit) return { url: explicit, source: "wiki-file" };
  }

  if (entry.wikiPage) {
    const pageFiles = wikiPageImages.get(entry.wikiPage) || [];
    const picked = pickWikiCapsuleFile(pageFiles);
    if (picked) {
      const pickedUrl = fandomUrls.get(normalizeFileKey(picked));
      if (pickedUrl) return { url: pickedUrl, source: "wiki-page" };
    }
  }

  return null;
}

function resolveImageUrl(entry, sources) {
  const { catalogUrls, crateByName, collectionByName } = sources;

  if (entry.url) {
    return { url: entry.url, source: "url" };
  }

  const wiki = resolveWikiFile(entry, sources);
  if (wiki?.url) return wiki;

  if (entry.crate) {
    const crateUrl = crateByName.get(entry.crate.toLowerCase());
    if (crateUrl) return { url: crateUrl, source: "bymykel-crate" };
    const catalogUrl = catalogUrls.get(entry.crate.toLowerCase());
    if (catalogUrl) return { url: catalogUrl, source: "catalog-crate" };
  }

  if (entry.collection) {
    const collectionUrl = collectionByName.get(entry.collection.toLowerCase());
    if (collectionUrl) return { url: collectionUrl, source: "bymykel-collection" };
  }

  if (entry.steam) {
    const catalogUrl = catalogUrls.get(entry.steam.toLowerCase());
    if (catalogUrl) return { url: catalogUrl, source: "catalog-steam" };
  }

  return { url: "", source: "" };
}

function copyFallbackWebp(entry, dest) {
  const webpPath = path.join(ROOT, "assets", "stickers", `${entry.slug}.webp`);
  if (!fs.existsSync(webpPath)) {
    return false;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(webpPath, dest);
  return true;
}

async function main() {
  const catalogUrls = loadCatalogSteamUrls();
  const { crateByName, collectionByName } = await loadByMykelMaps();
  const wikiPages = STICKER_IMAGES.map((entry) => entry.wikiPage).filter(Boolean);
  const wikiPageImages = await resolveWikiPageImages(wikiPages);

  const wikiFiles = new Set();
  STICKER_IMAGES.forEach((entry) => {
    if (entry.file) wikiFiles.add(entry.file);
    if (entry.wikiPage) {
      const picked = pickWikiCapsuleFile(wikiPageImages.get(entry.wikiPage) || []);
      if (picked) wikiFiles.add(picked);
    }
  });

  const fandomUrls = await resolveFandomUrls([...wikiFiles]);
  const sources = { fandomUrls, wikiPageImages, catalogUrls, crateByName, collectionByName };

  let ok = 0;
  let failed = 0;

  for (const entry of STICKER_IMAGES) {
    const dest = path.join(ROOT, "assets", "stickers", `${entry.slug}.png`);
    const resolved = resolveImageUrl(entry, sources);
    let imageUrl = resolved.url;
    let usedFallback = false;

    if (!imageUrl && entry.fallbackWebp) {
      if (copyFallbackWebp(entry, dest)) {
        usedFallback = true;
      }
    }

    if (!imageUrl && !usedFallback) {
      console.error(`MISS  ${entry.name}`);
      failed += 1;
      continue;
    }

    try {
      if (!usedFallback) {
        await downloadFile(imageUrl, dest);
      }
      const size = fs.statSync(dest).size;
      const tag = usedFallback ? "webp-fallback" : resolved.source;
      console.log(`OK    ${entry.slug}.png (${Math.round(size / 1024)} KB, ${tag})`);
      ok += 1;
    } catch (error) {
      if (entry.fallbackWebp && copyFallbackWebp(entry, dest)) {
        const size = fs.statSync(dest).size;
        console.log(`OK    ${entry.slug}.png (${Math.round(size / 1024)} KB, webp-fallback)`);
        ok += 1;
        continue;
      }
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
