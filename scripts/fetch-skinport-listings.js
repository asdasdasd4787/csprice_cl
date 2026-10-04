/**
 * Skinport catalog UI listing counts (CatalogHeader "X items" / item-menus listings).
 * Not /v1/items quantity — that field is a much smaller per-hash offer count.
 *
 * Usage:
 *   node scripts/fetch-skinport-listings.js Pistol "Desert Eagle" Conspiracy
 *   node scripts/fetch-skinport-listings.js Container "" "Glove Case"
 *   node scripts/fetch-skinport-listings.js --enrich-index=assets/skinport-cache/items_index.json
 * Prints { listings, source, families } or { stamped, groups } for --enrich-index
 */
const args = process.argv.slice(2);
const enrichArg = args.find((a) => a.startsWith("--enrich-index="));
const enrichPath = enrichArg ? enrichArg.slice("--enrich-index=".length) : "";
const sleepArg = args.find((a) => a.startsWith("--sleep-ms="));
const enrichSleepMs = sleepArg ? Math.max(0, parseInt(sleepArg.slice("--sleep-ms=".length), 10) || 0) : 2500;
const category = enrichPath ? "" : args.filter((a) => !a.startsWith("--"))[0] || "";
const type = enrichPath ? "" : args.filter((a) => !a.startsWith("--"))[1] || "";
const family = enrichPath ? "" : args.filter((a) => !a.startsWith("--"))[2] || "";

const headers = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Referer: "https://skinport.com/market",
  Origin: "https://skinport.com",
};

function cookieFrom(res) {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const fallback = res.headers.get("set-cookie");
  const parts = raw.length ? raw : fallback ? [fallback] : [];
  return parts.map((c) => String(c).split(";")[0]).filter(Boolean).join("; ");
}

const categoryMap = {
  pistol: "Pistol",
  rifle: "Rifle",
  smg: "SMG",
  heavy: "Heavy",
  knife: "Knife",
  gloves: "Gloves",
  agent: "Agent",
  charm: "Charm",
  sticker: "Sticker",
  container: "Container",
  key: "Key",
  patch: "Patch",
  graffiti: "Graffiti",
  collectible: "Collectible",
  pass: "Pass",
  "music-kit": "Music Kit",
  music: "Music Kit",
  tool: "Tool",
};

function categoryFromSlug(slug) {
  const key = String(slug || "").toLowerCase().trim();
  if (categoryMap[key]) return categoryMap[key];
  return key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function lookupParts(name, row) {
  let category = "";
  let type = "";
  let family = "";
  const marketPage = String((row && row.market_page) || "");
  const pathMatch = marketPage.match(/skinport\.com\/market\/([^?#]+)/i);
  if (pathMatch) {
    const segments = pathMatch[1].split("/").filter(Boolean);
    if (segments[0] === "730") segments.shift();
    category = categoryFromSlug(segments[0] || "");
    try {
      const url = new URL(marketPage);
      if (url.searchParams.get("cat")) category = categoryFromSlug(url.searchParams.get("cat"));
      if (url.searchParams.get("item")) family = String(url.searchParams.get("item") || "").trim();
    } catch {
      // ignore invalid market_page
    }
  }
  let stripped = String(name || "").replace(/^(?:StatTrak™|StatTrak|Souvenir|★|☆)\s*/u, "").trim();
  if (/^Sticker\s*\|/u.test(stripped)) {
    return {
      category: category || "Sticker",
      type: "",
      family: family || stripped.replace(/^Sticker\s*\|\s*/u, "").trim(),
    };
  }
  if (stripped.includes("|")) {
    const parts = stripped.split("|");
    type = parts[0].trim();
    if (!family) {
      family = parts.slice(1).join("|").replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/u, "").trim();
    }
  } else if (!family) {
    family = stripped;
  }
  if (!category && /\b(Case|Capsule|Package|Parcel|Pack|Box)\b/i.test(family)) {
    category = "Container";
  }
  return { category, type, family };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, reqHeaders, attempts = 3) {
  let last = { status: 0, json: null, message: "" };
  for (let i = 0; i < attempts; i += 1) {
    const res = await fetch(url, { headers: reqHeaders });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    last = {
      status: res.status,
      json,
      message: json && json.message ? String(json.message) : "",
    };
    const rateLimited =
      res.status === 429 ||
      (json && (json.message === "RATE_LIMIT_REACHED" || json.success === false && /rate.?limit/i.test(String(json.message || ""))));
    if (rateLimited) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 20000) : Math.min(15000, 3000 * 2 ** i);
      await sleep(waitMs);
      continue;
    }
    return last;
  }
  return last;
}

async function sessionHeaders() {
  const dataRes = await fetch("https://skinport.com/api/data", { headers });
  const data = await dataRes.json();
  const cookie = cookieFrom(dataRes);
  return {
    ...headers,
    ...(cookie ? { Cookie: cookie } : {}),
    ...(data && data.csrf ? { "x-csrf-token": String(data.csrf) } : {}),
  };
}

async function fetchFamilies(reqHeaders, category, type, attempts = 3) {
  const families = {};
  let page = 1;
  let pages = 1;
  let lastStatus = 0;
  let lastMessage = "";
  const maxPages = 500;
  while (page <= pages && page <= maxPages) {
    const params = new URLSearchParams({ appid: "730", category, page: String(page) });
    if (type) params.set("type", type);
    const fetched = await fetchJsonWithRetry(
      "https://skinport.com/api/item-menus/find?" + params.toString(),
      reqHeaders,
      attempts
    );
    lastStatus = fetched.status;
    lastMessage = fetched.message;
    const json = fetched.json;
    if (!json || json.success === false) {
      break;
    }
    const result = json.result || {};
    const reportedPages = parseInt(result.pages, 10);
    if (Number.isFinite(reportedPages) && reportedPages > 0) {
      pages = Math.max(pages, reportedPages);
    }
    const items = Array.isArray(result.items) ? result.items : [];
    for (const row of items) {
      const name = String((row && (row.family || row.family_localized)) || "").trim();
      const listings = row && Number.isFinite(Number(row.listings)) ? parseInt(row.listings, 10) : 0;
      if (name && listings > 0) families[name] = Math.max(families[name] || 0, listings);
    }
    if (!items.length && page > 1) {
      break;
    }
    page += 1;
    if (page <= pages && page <= maxPages) {
      await sleep(400);
    }
  }
  return { families, status: lastStatus, message: lastMessage, pages };
}

function persistListingCaches(path, raw, items) {
  const fs = require("fs");
  const now = Math.floor(Date.now() / 1000);
  raw.items = items;
  raw.listings_enriched_at = now;
  fs.writeFileSync(path, JSON.stringify(raw));

  const countsPath = path.replace(/items_index\.json$/i, "listing_counts.json");
  const map = {};
  for (const [name, row] of Object.entries(items)) {
    if (!row || typeof row !== "object") continue;
    const listings = Number(row.listings) || 0;
    const source = String(row.listings_source || "");
    if (listings <= 0 || source === "quantity") continue;
    map[name] = {
      listings,
      source: source || "item_menus_listings",
      fetched_at: Number(row.listings_fetched_at) || now,
    };
  }
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(countsPath, "utf8"));
  } catch {
    existing = {};
  }
  const prevMap = existing && existing.map && typeof existing.map === "object" ? existing.map : {};
  fs.writeFileSync(
    countsPath,
    JSON.stringify({
      fetched_at: now,
      map: { ...prevMap, ...map },
    })
  );
  return Object.keys(map).length;
}

async function enrichIndex(path) {
  const raw = JSON.parse(require("fs").readFileSync(path, "utf8"));
  const items = raw && raw.items && typeof raw.items === "object" ? raw.items : {};
  const groups = new Map();
  for (const [name, row] of Object.entries(items)) {
    const parts = lookupParts(name, row || {});
    if (!parts.category || !parts.family) continue;
    const key = parts.category;
    if (!groups.has(key)) groups.set(key, { category: parts.category, names: [] });
    groups.get(key).names.push({ name, family: parts.family });
  }

  const priority = ["Pistol", "Rifle", "SMG", "Heavy", "Knife", "Gloves", "Container"];
  const missingOnly = args.includes("--missing-only");
  let ordered = [
    ...priority.filter((name) => groups.has(name)).map((name) => groups.get(name)),
    ...[...groups.values()].filter((group) => !priority.includes(group.category)),
  ];
  if (missingOnly) {
    ordered = ordered.filter((group) => {
      const stamped = group.names.filter((entry) => {
        const row = items[entry.name];
        return row && Number(row.listings) > 0 && String(row.listings_source || "") !== "quantity";
      }).length;
      return stamped < group.names.length * 0.5;
    });
  }

  let reqHeaders = await sessionHeaders();
  let stamped = 0;
  let groupCount = 0;
  let rateLimited = 0;
  let pagesFetched = 0;
  let listingCounts = 0;
  for (const group of ordered) {
    groupCount += 1;
    reqHeaders = await sessionHeaders();
    const fetched = await fetchFamilies(reqHeaders, group.category, "", 1);
    const families = fetched.families || {};
    pagesFetched += Number(fetched.pages || 0);
    if (fetched.status === 429 || fetched.message === "RATE_LIMIT_REACHED") {
      rateLimited += 1;
    }
    if (!Object.keys(families).length) {
      console.error("enrich skip " + group.category + " status=" + fetched.status + " " + fetched.message);
      continue;
    }
    const byFamily = {};
    for (const [fam, listings] of Object.entries(families)) {
      byFamily[fam.toLowerCase()] = listings;
    }
    let groupStamped = 0;
    for (const entry of group.names) {
      const listings = byFamily[entry.family.toLowerCase()] || 0;
      if (listings <= 0 || !items[entry.name] || typeof items[entry.name] !== "object") continue;
      items[entry.name].listings = listings;
      items[entry.name].items = listings;
      items[entry.name].listings_source = "item_menus_listings";
      items[entry.name].listings_fetched_at = Math.floor(Date.now() / 1000);
      stamped += 1;
      groupStamped += 1;
    }
    listingCounts = persistListingCaches(path, raw, items);
    console.error("enrich " + group.category + " families=" + Object.keys(families).length + " stamped=" + groupStamped + " pages=" + fetched.pages);
    await sleep(enrichSleepMs);
  }
  process.stdout.write(
    JSON.stringify({
      stamped,
      groups: groupCount,
      rate_limited_groups: rateLimited,
      pages_fetched: pagesFetched,
      listing_counts: listingCounts,
    })
  );
}

async function main() {
  if (enrichPath) {
    await enrichIndex(enrichPath);
    return;
  }
  if (!category) {
    process.stdout.write(JSON.stringify({ listings: 0, source: "", families: {} }));
    return;
  }

  const reqHeaders = await sessionHeaders();
  const fetched = await fetchFamilies(reqHeaders, category, type);
  const families = fetched.families || {};
  if (family) {
    const want = family.toLowerCase();
    for (const [name, listings] of Object.entries(families)) {
      if (name.toLowerCase() === want) {
        process.stdout.write(
          JSON.stringify({
            listings,
            source: "item_menus_listings",
            status: fetched.status,
            families: { [name]: listings },
          })
        );
        return;
      }
    }
  }

  let listings = 0;
  if (family) {
    const want = family.toLowerCase();
    for (const [name, count] of Object.entries(families)) {
      if (name.toLowerCase() === want) {
        listings = count;
        break;
      }
    }
  }
  process.stdout.write(
    JSON.stringify({
      listings,
      source: listings > 0 ? "item_menus_listings" : "",
      status: fetched.status,
      message: fetched.message || "",
      families,
    })
  );
}

main().catch((err) => {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
});
