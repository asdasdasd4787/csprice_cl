#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MAP_PATH = path.join(ROOT, "assets", "models", "crafter", "batch-map.json");
const MANIFEST_PATH = path.join(ROOT, "assets", "models", "skins", "manifest.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function resolveSourceDir(map, argv) {
  const flagIndex = argv.indexOf("--source");
  if (flagIndex >= 0 && argv[flagIndex + 1]) {
    return path.resolve(argv[flagIndex + 1]);
  }
  return path.join(ROOT, map.source_dir || "assets/models/crafter/incoming");
}

function upsertManifestEntry(manifest, entry, modelUrl, version) {
  const items = Array.isArray(manifest.items) ? manifest.items : [];
  const nextEntry = {
    market_name: entry.market_name,
    finish_token: entry.finish_token,
    model_url: modelUrl.replace(/\\/g, "/"),
    preview_image: entry.preview_image || "",
    source_url: "",
    updated_at: version,
  };

  const index = items.findIndex((item) => String(item?.market_name || "") === entry.market_name);
  if (index >= 0) {
    items[index] = { ...items[index], ...nextEntry };
  } else {
    items.push(nextEntry);
  }

  manifest.items = items.sort((left, right) => String(left.market_name).localeCompare(String(right.market_name)));
  return manifest;
}

function removeObsoleteCrafterEntries(manifest) {
  const obsolete = new Set([
    "M4A4 | Royal Paladin",
    "M4A1-S | Fade",
    "P250 | Red Tide",
  ]);
  manifest.items = (Array.isArray(manifest.items) ? manifest.items : []).filter((item) => {
    const name = String(item?.market_name || "");
    const url = String(item?.model_url || "");
    if (!obsolete.has(name)) return true;
    return !url.includes("assets/models/crafter/");
  });
  return manifest;
}

function main() {
  if (!fs.existsSync(MAP_PATH)) {
    throw new Error(`Missing batch map: ${MAP_PATH}`);
  }

  const map = readJson(MAP_PATH);
  const version = String(map.version || "20260704-crafter-batch-2");
  const sourceDir = resolveSourceDir(map, process.argv.slice(2));
  const destDir = path.join(ROOT, map.dest_dir || "assets/models/crafter");
  const manifest = fs.existsSync(MANIFEST_PATH) ? readJson(MANIFEST_PATH) : { items: [] };

  if (!fs.existsSync(sourceDir)) {
    fs.mkdirSync(sourceDir, { recursive: true });
  }
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  let copied = 0;
  let skipped = 0;

  for (const entry of map.items || []) {
    const sourceName = String(entry.file || "").trim();
    const destName = String(entry.dest_file || entry.file || "").trim();
    const explicitModelUrl = String(entry.model_url || "").trim();
    if (!destName && !explicitModelUrl) continue;

    let modelUrl = explicitModelUrl;
    if (!modelUrl) {
      const sourcePath = path.join(sourceDir, sourceName);
      const destPath = path.join(destDir, destName);
      modelUrl = `${String(map.dest_dir || "assets/models/crafter").replace(/\\/g, "/")}/${destName}?v=${version}`;

      if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        copied += 1;
        console.log(`copied ${sourceName} -> ${destPath}`);
      } else if (fs.existsSync(destPath)) {
        console.log(`using existing ${destPath}`);
      } else {
        skipped += 1;
        console.warn(`missing ${sourcePath}`);
      }
    } else if (!modelUrl.includes("?")) {
      modelUrl = `${modelUrl}?v=${version}`;
    }

    upsertManifestEntry(manifest, entry, modelUrl, version);
  }

  writeJson(MANIFEST_PATH, removeObsoleteCrafterEntries(manifest));
  console.log(`\nManifest updated (${manifest.items.length} entries). Copied ${copied}, missing ${skipped}.`);
  if (skipped > 0) {
    console.log(`Drop GLB files into ${sourceDir} and rerun this script.`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
