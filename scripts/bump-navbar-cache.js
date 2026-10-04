const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const NAV_VERSION = "20260622-navbar-unify-1";
const INDEX_VERSION = "20260622-landing-1";
const DATA_VERSION = "20260622-navbar-unify-1";

for (const file of fs.readdirSync(ROOT)) {
  if (!file.endsWith(".html") || file.startsWith("tmp_")) continue;
  const fullPath = path.join(ROOT, file);
  let text = fs.readFileSync(fullPath, "utf8");
  const next = text
    .replace(/shared-components\.build\.js\?v=[^"']+/g, `shared-components.build.js?v=${NAV_VERSION}`)
    .replace(/shared-data\.js\?v=[^"']+/g, `shared-data.js?v=${DATA_VERSION}`)
    .replace(/index\.css\?v=20260620[^"']+/g, `index.css?v=${INDEX_VERSION}`);
  if (next !== text) {
    fs.writeFileSync(fullPath, next, "utf8");
    console.log("updated", file);
  }
}

console.log("done");
