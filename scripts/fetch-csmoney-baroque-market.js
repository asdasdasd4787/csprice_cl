const fs = require("fs");
const path = require("path");

(async () => {
  const url = "https://3d.cs.money/en/?marketHashName=AK-47%20%7C%20Baroque%20Purple";
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
  const html = await response.text();
  const out = path.join(__dirname, "..", "tmp_skin_pipeline", "csmoney_baroque_market.html");
  fs.writeFileSync(out, html, "utf8");
  console.log("saved", out, html.length);

  const pageMatch = html.match(/<script id="__page-params" type="application\/json">([\s\S]*?)<\/script>/);
  if (pageMatch) {
    const params = JSON.parse(pageMatch[1]);
    const item = params?.sidebarController?.itemConfiguration?.item;
    console.log(JSON.stringify(item, null, 2));
  } else {
    console.log("no page params");
  }

  const materialMatches = [...html.matchAll(/\/3d\/assets\/weapon_[^"'\\s]+/g)].map((m) => m[0]);
  console.log("asset paths:", [...new Set(materialMatches)].slice(0, 20));
})();
