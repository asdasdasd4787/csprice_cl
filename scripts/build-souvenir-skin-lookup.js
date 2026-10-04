#!/usr/bin/env node
/**
 * Build souvenir-eligible skin base names from ByMykel skins_not_grouped.json.
 * Output: assets/data/souvenir-skin-lookup.json
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const OUT_PATH = path.join(ROOT, "assets", "data", "souvenir-skin-lookup.json");
const SOURCE_URL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json";

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        download(response.headers.location).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/^Souvenir\s+/iu, "")
    .replace(/^StatTrak™\s+/iu, "")
    .replace(/^★\s*/u, "")
    .replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/iu, "")
    .trim()
    .toLowerCase();
}

async function main() {
  const raw = await download(SOURCE_URL);
  const skins = JSON.parse(raw);
  const bases = new Set();

  skins.forEach((entry) => {
    if (!entry?.souvenir) return;
    const name = String(entry.name || entry.market_hash_name || "").trim();
    if (!name || !name.includes("|")) return;
    const base = normalizeKey(name);
    if (base) bases.add(base);
  });

  const payload = {
    version: 1,
    generated_at: new Date().toISOString(),
    count: bases.size,
    bases: Array.from(bases).sort(),
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload));
  console.log("wrote", OUT_PATH, "bases:", payload.count);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
