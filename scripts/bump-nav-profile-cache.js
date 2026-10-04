const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VERSION = "20260625-nav-profile-1";

for (const file of fs.readdirSync(ROOT)) {
  if (!file.endsWith(".html") || file.startsWith("tmp_")) {
    continue;
  }

  const filePath = path.join(ROOT, file);
  const content = fs.readFileSync(filePath, "utf8");
  const next = content
    .replace(/index\.css\?v=[^"']+/g, `index.css?v=${VERSION}`)
    .replace(/shared-components\.build\.js\?v=[^"']+/g, `shared-components.build.js?v=${VERSION}`);

  if (next !== content) {
    fs.writeFileSync(filePath, next);
    console.log(`updated ${file}`);
  }
}
