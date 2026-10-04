const fs = require("fs");
const https = require("https");

const API = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collections.json";
const lookupPath = "assets/steam-market-cache/skin_origin_lookup.json";

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function normalizeKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

(async () => {
  const collections = await fetchJson(API);
  const lookup = JSON.parse(fs.readFileSync(lookupPath, "utf8"));
  const items = lookup.items || lookup;
  let repaired = 0;

  for (const collection of collections) {
    const collectionName = String(collection?.name || "").trim();
    if (!collectionName) continue;

    for (const skin of collection?.contains || []) {
      const skinName = String(skin?.name || "").trim();
      if (!skinName) continue;

      const keys = [normalizeKey(skinName), normalizeKey(`Sticker | ${skinName}`)];
      keys.forEach((key) => {
        if (!key) return;
        const previous = items[key];
        if (previous !== collectionName) {
          items[key] = collectionName;
          repaired += 1;
        }
      });
    }
  }

  const payload = {
    updated_at: new Date().toISOString(),
    total_count: Object.keys(items).length,
    items,
  };

  fs.writeFileSync(lookupPath, JSON.stringify(payload));
  console.log(`repaired ${repaired} collection origin entries (${payload.total_count} total)`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
