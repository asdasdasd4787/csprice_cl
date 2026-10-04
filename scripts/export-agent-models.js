const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const AGENTS_SOURCE = path.join(ROOT, ".tmp_agents.json");
const OUTPUT_ROOT = path.join(ROOT, "assets", "models");
const MANIFEST_DIR = path.join(OUTPUT_ROOT, "agents");
const MANIFEST_PATH = path.join(MANIFEST_DIR, "manifest.json");
const CLI_CANDIDATES = [
  path.join(ROOT, "tmp-s2v-cli", "Source2Viewer-CLI.exe"),
  "C:\\Users\\dogeg\\Desktop\\csgo_price_tracker\\tmp-s2v-cli\\Source2Viewer-CLI.exe"
];
const VPK_CANDIDATES = [
  "D:\\SteamLibrary\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\pak01_dir.vpk",
  "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\csgo\\pak01_dir.vpk"
];

function firstExisting(paths) {
  return paths.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (_error) {
      return false;
    }
  }) || "";
}

function toWebPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function modelPlayerToCompiledPath(modelPlayer) {
  return String(modelPlayer || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\.vmdl$/i, ".vmdl_c");
}

function compiledPathToGlbRelative(compiledPath) {
  return String(compiledPath || "").replace(/\.vmdl_c$/i, ".glb");
}

function exportAgentModel(cliPath, vpkPath, compiledPath) {
  const args = [
    "-i",
    vpkPath,
    "-o",
    OUTPUT_ROOT,
    "-d",
    "--gltf_export_format",
    "glb",
    "--gltf_export_materials",
    "--gltf_export_animations",
    "-f",
    compiledPath
  ];

  const result = spawnSync(cliPath, args, {
    cwd: ROOT,
    stdio: "inherit",
    windowsHide: true
  });

  if (result.status !== 0) {
    throw new Error(`Source2Viewer export failed for ${compiledPath} (exit ${result.status})`);
  }
}

function main() {
  if (!fs.existsSync(AGENTS_SOURCE)) {
    throw new Error(`Missing agent source catalog: ${AGENTS_SOURCE}`);
  }

  const cliPath = firstExisting(CLI_CANDIDATES);
  const vpkPath = firstExisting(VPK_CANDIDATES);

  if (!cliPath) {
    throw new Error("Source2Viewer CLI was not found in the expected locations.");
  }
  if (!vpkPath) {
    throw new Error("Counter-Strike VPK was not found in the expected Steam library locations.");
  }

  const agents = JSON.parse(fs.readFileSync(AGENTS_SOURCE, "utf8"));
  const uniqueCompiledPaths = new Map();
  const manifestItems = [];

  for (const agent of Array.isArray(agents) ? agents : []) {
    const marketName = String(agent?.market_hash_name || agent?.name || "").trim();
    const modelPlayer = String(agent?.model_player || "").trim();
    if (!marketName || !modelPlayer) {
      continue;
    }

    const compiledPath = modelPlayerToCompiledPath(modelPlayer);
    const glbRelative = compiledPathToGlbRelative(compiledPath);
    const glbFile = path.join(OUTPUT_ROOT, ...glbRelative.split("/"));

    uniqueCompiledPaths.set(compiledPath, glbFile);
    manifestItems.push({
      market_name: marketName,
      display_name: String(agent?.name || marketName),
      model_player: modelPlayer,
      model_url: toWebPath(glbFile),
      default_animation: "tools_preview",
      preview_time: 0.55,
      team: String(agent?.team?.name || ""),
      collection: String(agent?.collections?.[0]?.name || ""),
      updated_at: new Date().toISOString()
    });
  }

  for (const [compiledPath, glbFile] of uniqueCompiledPaths.entries()) {
    if (fs.existsSync(glbFile)) {
      continue;
    }

    fs.mkdirSync(path.dirname(glbFile), { recursive: true });
    exportAgentModel(cliPath, vpkPath, compiledPath);
  }

  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  manifestItems.sort((left, right) => left.market_name.localeCompare(right.market_name));
  fs.writeFileSync(
    MANIFEST_PATH,
    JSON.stringify({ items: manifestItems }, null, 2) + "\n",
    "utf8"
  );

  console.log(`Exported/verified ${uniqueCompiledPaths.size} unique agent models.`);
  console.log(`Wrote manifest with ${manifestItems.length} agent entries to ${MANIFEST_PATH}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
