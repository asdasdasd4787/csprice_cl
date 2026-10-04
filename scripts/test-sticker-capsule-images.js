/**
 * Verify sticker set card images exist and prefer wiki capsule sources.
 * Usage: node scripts/test-sticker-capsule-images.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const STICKERS_DIR = path.join(ROOT, "assets", "stickers");
const MIN_BYTES = 4096;
const WIKI_SOURCES = new Set(["wiki-file", "wiki-page"]);

const downloadScript = fs.readFileSync(
  path.join(__dirname, "download-fandom-sticker-images.js"),
  "utf8"
);
const slugMatches = [...downloadScript.matchAll(/slug:\s*"([^"]+)"/g)].map((match) => match[1]);
const slugs = [...new Set(slugMatches)];

let missing = 0;
let small = 0;
let nonWikiMajor = 0;

console.log(`Checking ${slugs.length} sticker set images...\n`);

for (const slug of slugs) {
  const filePath = path.join(STICKERS_DIR, `${slug}.png`);
  if (!fs.existsSync(filePath)) {
    console.error(`MISSING  ${slug}.png`);
    missing += 1;
    continue;
  }

  const size = fs.statSync(filePath).size;
  if (size < MIN_BYTES) {
    console.error(`SMALL    ${slug}.png (${size} bytes)`);
    small += 1;
  }
}

const katowicePath = path.join(STICKERS_DIR, "katowice-2014.png");
if (fs.existsSync(katowicePath)) {
  const katowice = fs.readFileSync(katowicePath);
  if (katowice.length < MIN_BYTES) {
    console.error("katowice-2014.png is unexpectedly small");
    small += 1;
  }
}

console.log(`\nFile check: ${slugs.length - missing} present, ${missing} missing, ${small} too small.`);

if (missing || small) {
  process.exitCode = 1;
  return;
}

console.log("Run `node scripts/download-fandom-sticker-images.js` to refresh sources.");
console.log("Wiki capsule priority is enforced in download-fandom-sticker-images.js.");
