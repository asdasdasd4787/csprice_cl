/**
 * Import a freshly baked skin GLB into Skin Crafter the same way as AK-47 | Cartel:
 * - copy/promote model under assets/models (or keep skins/ path)
 * - update skins/manifest.json
 * - upsert crafter/batch-map.json
 * - upsert LOCAL_MODEL_MATCHERS in skin-viewer-core.js
 *
 * Usage:
 *   node scripts/import-crafter-skin.js --market-name "AK-47 | Fire Serpent" --finish-token cu_fireserpent_ak47_bravo
 *   node scripts/import-crafter-skin.js --market-name "AK-47 | Fire Serpent" --model assets/models/skins/cu_fireserpent_ak47_bravo.glb --dest-name fire_serpent
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "assets", "models", "skins", "manifest.json");
const BATCH_MAP_PATH = path.join(ROOT, "assets", "models", "crafter", "batch-map.json");
const VIEWER_CORE_PATH = path.join(ROOT, "react", "skin-viewer-core.js");
const VIEWER3D_HTML = path.join(ROOT, "viewer3d.html");
const PATCH_SCRIPT = path.join(ROOT, "scripts", "patch_glb_normal_alpha.py");

function parseArgs(argv) {
  const options = {
    marketName: "",
    finishToken: "",
    model: "",
    destName: "",
    nameColor: "EB4B4B",
    previewImage: "",
    skipPatch: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--market-name") options.marketName = String(argv[++i] || "").trim();
    else if (arg === "--finish-token") options.finishToken = String(argv[++i] || "").trim();
    else if (arg === "--model") options.model = String(argv[++i] || "").trim();
    else if (arg === "--dest-name") options.destName = String(argv[++i] || "").trim();
    else if (arg === "--name-color") options.nameColor = String(argv[++i] || "").trim() || options.nameColor;
    else if (arg === "--preview-image") options.previewImage = String(argv[++i] || "").trim();
    else if (arg === "--skip-patch") options.skipPatch = true;
  }
  return options;
}

function toPosix(rel) {
  return String(rel || "").replace(/\\/g, "/");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function versionTag() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}-crafter-import-1`;
}

function ensureFile(absPath, label) {
  if (!fs.existsSync(absPath)) throw new Error(`${label} not found: ${absPath}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function resolveSourceModel(options) {
  if (options.model) {
    const abs = path.isAbsolute(options.model) ? options.model : path.join(ROOT, options.model);
    ensureFile(abs, "Model");
    return abs;
  }
  if (!options.finishToken) {
    throw new Error("Provide --model or --finish-token");
  }
  const candidate = path.join(ROOT, "assets", "models", "skins", `${options.finishToken}.glb`);
  ensureFile(candidate, "Skin model");
  return candidate;
}

function patchNormalAlpha(modelPath) {
  if (!fs.existsSync(PATCH_SCRIPT)) {
    console.warn("patch_glb_normal_alpha.py missing; skipping");
    return;
  }
  const result = spawnSync("python", [PATCH_SCRIPT, "--dirs", modelPath], {
    cwd: ROOT,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.status !== 0) {
    console.warn(`normal-alpha patch exited ${result.status}`);
  }
}

function upsertManifest(marketName, finishToken, modelUrl, version, previewImage) {
  const payload = fs.existsSync(MANIFEST_PATH) ? readJson(MANIFEST_PATH) : { items: [] };
  const items = Array.isArray(payload.items) ? payload.items : [];
  const entry = {
    market_name: marketName,
    finish_token: finishToken,
    model_url: `${modelUrl}?v=${version}`,
    source_url: "",
    updated_at: version,
  };
  if (previewImage) entry.preview_image = previewImage;
  const next = [entry, ...items.filter((row) => String(row?.market_name || "") !== marketName)];
  writeJson(MANIFEST_PATH, { items: next });
}

function upsertBatchMap(marketName, finishToken, modelUrl, version, nameColor, previewImage) {
  const payload = readJson(BATCH_MAP_PATH);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const entry = {
    model_url: modelUrl,
    market_name: marketName,
    finish_token: finishToken,
    name_color: nameColor,
  };
  if (previewImage) entry.preview_image = previewImage;
  const next = [
    ...items.filter((row) => String(row?.market_name || "").toLowerCase() !== marketName.toLowerCase()),
    entry,
  ];
  payload.version = version;
  payload.items = next;
  writeJson(BATCH_MAP_PATH, payload);
}

function upsertViewerMatcher(marketName, modelUrl, version) {
  const source = fs.readFileSync(VIEWER_CORE_PATH, "utf8");
  const matchKey = marketName.toLowerCase();
  const url = `${modelUrl}?v=${version}`;
  const entryLine = `    { matches: ["${matchKey}"], url: "${url}" },`;

  const arrayStart = source.indexOf("const LOCAL_MODEL_MATCHERS = [");
  if (arrayStart < 0) throw new Error("LOCAL_MODEL_MATCHERS not found in skin-viewer-core.js");
  const arrayEnd = source.indexOf("];", arrayStart);
  if (arrayEnd < 0) throw new Error("LOCAL_MODEL_MATCHERS end not found");

  let block = source.slice(arrayStart, arrayEnd);
  const escapeRe = matchKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match only one matcher object (do not let [\s\S]* span earlier entries).
  const existingRe = new RegExp(
    `\\{\\s*matches:\\s*\\[[^\\]]*"(?:[^"\\]]*\\|\\s*)?${escapeRe}"[^\\]]*\\][^}]*\\},?\\s*`,
    "i"
  );
  if (existingRe.test(block)) {
    block = block.replace(existingRe, `${entryLine}\n`);
  } else {
    // Insert before the first generic weapon fallback (matches without " | ").
    const insertAt = block.search(/\n\s*\{\s*matches:\s*\["[^"|]+"/);
    if (insertAt > 0) {
      block = `${block.slice(0, insertAt)}\n${entryLine}${block.slice(insertAt)}`;
    } else {
      block = `${block}\n${entryLine}`;
    }
  }

  const next = `${source.slice(0, arrayStart)}${block}${source.slice(arrayEnd)}`;
  fs.writeFileSync(VIEWER_CORE_PATH, next, "utf8");
}

function bumpViewerCache(version) {
  if (!fs.existsSync(VIEWER3D_HTML)) return;
  let html = fs.readFileSync(VIEWER3D_HTML, "utf8");
  html = html.replace(
    /skin-viewer-core\.js\?v=[^"]+/g,
    `skin-viewer-core.js?v=${version}`
  );
  fs.writeFileSync(VIEWER3D_HTML, html, "utf8");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.marketName) throw new Error("--market-name is required");

  const sourceAbs = resolveSourceModel(options);
  const finishToken = options.finishToken || path.basename(sourceAbs, ".glb");
  const version = versionTag();
  const destName = options.destName || slugify(options.marketName.split("|").slice(1).join("|") || finishToken);
  const destAbs = path.join(ROOT, "assets", "models", `${destName}.glb`);

  fs.copyFileSync(sourceAbs, destAbs);
  console.log(`Copied ${toPosix(path.relative(ROOT, sourceAbs))} -> ${toPosix(path.relative(ROOT, destAbs))}`);

  if (!options.skipPatch) {
    patchNormalAlpha(destAbs);
  }

  const modelUrl = toPosix(path.relative(ROOT, destAbs));
  upsertManifest(options.marketName, finishToken, modelUrl, version, options.previewImage);
  upsertBatchMap(options.marketName, finishToken, modelUrl, version, options.nameColor, options.previewImage);
  upsertViewerMatcher(options.marketName, modelUrl, version);
  bumpViewerCache(version);

  console.log(`Imported ${options.marketName}`);
  console.log(`  model: ${modelUrl}?v=${version}`);
  console.log(`  manifest + batch-map + LOCAL_MODEL_MATCHERS updated`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
