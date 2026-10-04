/**
 * Fetch Skinport /v1/items (brotli) and print { items: { [market_hash_name]: row } }.
 * Usage: node scripts/fetch-skinport-index.js [basicAuthB64] [tradable] [currency]
 */
const auth = process.argv[2] || "";
const tradable = process.argv[3] || "0";
const currency = process.argv[4] || "EUR";
const headers = {
  Accept: "application/json",
  "Accept-Encoding": "br,gzip,deflate",
};
if (auth) {
  headers.Authorization = "Basic " + auth;
}
const url =
  "https://api.skinport.com/v1/items?app_id=730&currency=" +
  encodeURIComponent(currency) +
  "&tradable=" +
  encodeURIComponent(tradable);

fetch(url, { headers })
  .then(async (res) => {
    if (!res.ok) {
      console.error("HTTP " + res.status);
      process.exit(2);
    }
    const rows = await res.json();
    const items = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row && typeof row === "object" && row.market_hash_name) {
        items[row.market_hash_name] = row;
      }
    }
    process.stdout.write(JSON.stringify({ items }));
  })
  .catch((err) => {
    console.error(String(err && err.message ? err.message : err));
    process.exit(1);
  });
