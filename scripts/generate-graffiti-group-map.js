const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT = path.join(__dirname, "..", "react", "graffiti-group-map.js");

const COLLECTION_GROUPS = [
  "CS:GO Graffiti #3 Collection",
  "CS:GO Graffiti #2 Collection",
  "Trolling Graffiti Collection",
];

const CRATE_GROUPS = [
  "CS:GO Graffiti Box",
  "Community Graffiti Box 1",
  "Perfect World Graffiti Box",
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "CS2PriceTracker/1.0" } }, (response) => {
        if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          fetchJson(response.headers.location).then(resolve).catch(reject);
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
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function uniqueDesigns(entries) {
  return [...new Set(
    (Array.isArray(entries) ? entries : [])
      .map((entry) => String(entry?.name || "").trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
}

async function main() {
  const [collectionsPayload, cratesPayload] = await Promise.all([
    fetchJson("https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collections.json"),
    fetchJson("https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json"),
  ]);

  const collections = Object.values(collectionsPayload || {});
  const crates = Object.values(cratesPayload || {});
  const map = {
    Graffiti: "__ALL__",
  };

  COLLECTION_GROUPS.forEach((label) => {
    const collection = collections.find((entry) => entry.name === label);
    map[label] = uniqueDesigns(collection?.contains);
  });

  CRATE_GROUPS.forEach((label) => {
    const crate = crates.find((entry) => entry.name === label);
    map[label] = uniqueDesigns(crate?.contains);
  });

  const output = `(() => {
  const GRAFFITI_GROUP_MAP = ${JSON.stringify(map, null, 2)};
  Object.assign(window.CS2ReactData || (window.CS2ReactData = {}), { GRAFFITI_GROUP_MAP });
})();
`;

  fs.writeFileSync(OUT, output);
  console.log(
    Object.fromEntries(
      Object.entries(map).map(([key, value]) => [key, value === "__ALL__" ? "ALL" : value.length])
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
