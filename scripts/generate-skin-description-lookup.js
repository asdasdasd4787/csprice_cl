const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const OUTPUT = path.join(ROOT, "assets", "steam-market-cache", "skin_description_lookup.json");
const LOCAL_SOURCE = path.join(ROOT, ".tmp_all.json");
const API_URL =
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json";
const AGENTS_URL =
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/agents.json";

const SKIN_START =
  /\.\s+(A |An |This custom |This memento |A custom |A hydrographic |A grayscale |A green |A blue |A red |A multicolored |A pattern |Has been |Featuring |Parts of |The outer |The lines |The colors |Durable|Synthetic|These |Some people )/i;

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "csgo-price-tracker/1.0" } }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          fetchJson(response.headers.location).then(resolve).catch(reject);
          return;
        }

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

function cleanDescription(value) {
  return String(value || "")
    .replace(/<\/?i>/g, "")
    .replace(/\\n\\n/g, "\n\n")
    .replace(/\\n/g, "\n")
    .trim();
}

function extractSkinDescription(description) {
  const text = cleanDescription(description);
  if (!text) return "";

  const paintedAt = text.toLowerCase().indexOf("it has been ");
  if (paintedAt >= 0) {
    return text.slice(paintedAt).trim();
  }

  const match = text.match(SKIN_START);
  if (match && match.index !== undefined) {
    return text.slice(match.index + 2).trim();
  }

  return text;
}

function stripWear(name) {
  return String(name || "")
    .replace(/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "")
    .trim();
}

function lookupKey(name) {
  return stripWear(
    String(name || "")
      .replace(/^Souvenir\s+/i, "")
      .replace(/^StatTrak™\s+/i, "")
      .trim()
  ).toLowerCase();
}

function assignDescription(lookup, marketHashName, description) {
  const text = String(description || "").trim();
  if (!text) return;
  const key = lookupKey(marketHashName);
  if (!key || lookup[key]) return;
  lookup[key] = text;
}

function loadLocalSkins() {
  if (!fs.existsSync(LOCAL_SOURCE)) {
    return null;
  }

  const payload = JSON.parse(fs.readFileSync(LOCAL_SOURCE, "utf8"));
  return Object.values(payload).filter((item) => item?.market_hash_name);
}

async function loadRows() {
  const local = loadLocalSkins();
  if (local?.length) {
    return local;
  }

  return fetchJson(API_URL);
}

async function main() {
  const lookup = {};
  const rows = await loadRows();

  rows.forEach((row) => {
    const marketHashName = String(row.market_hash_name || row.name || "").trim();
    if (!marketHashName) return;
    assignDescription(lookup, marketHashName, extractSkinDescription(row.description || ""));
  });

  try {
    const agents = await fetchJson(AGENTS_URL);
    agents.forEach((row) => {
      const marketHashName = String(row.market_hash_name || row.name || "").trim();
      if (!marketHashName) return;
      assignDescription(lookup, marketHashName, cleanDescription(row.description || ""));
    });
  } catch (error) {
    console.warn("agents.json fetch skipped:", error.message);
  }

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(
      {
        updated_at: new Date().toISOString(),
        total_count: Object.keys(lookup).length,
        items: lookup,
      },
      null,
      0
    )
  );

  console.log(`Wrote ${Object.keys(lookup).length} descriptions to ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
