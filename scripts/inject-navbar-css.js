const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const navbarLink = '<link rel="stylesheet" href="styles/css/navbar.css?v=20260627-unified-1">';
const sharedVer = "20260627-crafter-4";
const updated = [];

for (const file of fs.readdirSync(root)) {
  if (!file.endsWith(".html")) continue;
  if (file.startsWith("tmp_")) continue;

  const fp = path.join(root, file);
  const original = fs.readFileSync(fp, "utf8");
  if (!original.includes("index.css")) continue;

  let html = original;
  if (!html.includes("navbar.css")) {
    html = html.replace(
      /(<link[^>]*href="styles\/css\/index\.css[^"]*"[^>]*>)/i,
      `$1\n${navbarLink}`
    );
  }

  html = html.replace(
    /react\/shared-components\.build\.js\?v=[^"]+/g,
    `react/shared-components.build.js?v=${sharedVer}`
  );

  if (html !== original) {
    fs.writeFileSync(fp, html);
    updated.push(file);
  }
}

console.log(updated.length ? `Updated ${updated.length} files:` : "No files updated");
updated.forEach((file) => console.log(` - ${file}`));
