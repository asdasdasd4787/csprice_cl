const fs = require("fs");
const path = require("path");

const urls = [
  "https://3d.cs.money/en/AK-47%20%7C%20Baroque%20Purple",
  "https://3d.cs.money/en/ak-47%20%7C%20baroque%20purple",
  "https://3d.cs.money/en/?marketHashName=AK-47%20%7C%20Baroque%20Purple",
  "https://3d.cs.money/en/item/ak-47-baroque-purple",
  "https://3d.cs.money/en/item/745-baroque-purple",
];

function extractPageParams(html) {
  const match = html.match(/<script id="__page-params" type="application\/json">([\s\S]*?)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

(async () => {
  for (const url of urls) {
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
    const html = await response.text();
    const params = extractPageParams(html);
    const item = params?.sidebarController?.itemConfiguration?.item;
    console.log(`\n${response.url} (${html.length})`);
    if (!item) {
      console.log("  no item");
      continue;
    }
    console.log("  name:", item.name);
    console.log("  paint_index:", item.paint_index);
    console.log("  pattern:", item.pattern?.id, item.pattern?.name);
    console.log("  style:", item.style?.name);
    console.log("  materials:", JSON.stringify(item.materials));
    console.log("  model:", JSON.stringify(item.model));
  }
})();
