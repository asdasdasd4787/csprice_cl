const crypto = require("crypto");

const fs = require("fs");

const path = require("path");

const { spawnSync } = require("child_process");



const ROOT = path.resolve(__dirname, "..");

const ASSETS_BASE = "https://assets.cs.money";



const GENERIC_AK47_MASK_MD5 = "a037f778dae4bbb1788d6883f2a1e56a";



const WEAPON_ASSET_FOLDER = {

  "ak-47": "weapon_ak47",

  "m4a4": "weapon_m4a1",

  "m4a1-s": "weapon_m4a1_silencer",

  "awp": "weapon_awp",

  "usp-s": "weapon_usp_silencer",

  "glock-18": "weapon_glock18",

  "desert-eagle": "weapon_deagle",

  "p250": "weapon_p250",

  "famas": "weapon_famas",

  "galil-ar": "weapon_galilar",

  "aug": "weapon_aug",

  "sg-553": "weapon_sg556",

  "ssg-08": "weapon_ssg08",

  "scar-20": "weapon_scar20",

  "g3sg1": "weapon_g3sg1",

  "mac-10": "weapon_mac10",

  "mp9": "weapon_mp9",

  "mp7": "weapon_mp7",

  "mp5-sd": "weapon_mp5sd",

  "ump-45": "weapon_ump45",

  "p90": "weapon_p90",

  "pp-bizon": "weapon_bizon",

  "nova": "weapon_nova",

  "xm1014": "weapon_xm1014",

  "mag-7": "weapon_mag7",

  "sawed-off": "weapon_sawedoff",

  "m249": "weapon_m249",

  "negev": "weapon_negev",

  "cz75-auto": "weapon_cz75a",

  "tec-9": "weapon_tec9",

  "five-seven": "weapon_fiveseven",

  "dual-berettas": "weapon_elite",

  "p2000": "weapon_hkp2000",

  "r8-revolver": "weapon_revolver",

};



const MESH_FOLDER = {

  "ak-47": "weapon_ak47",

  "m4a4": "weapon_m4a1",

  "m4a1-s": "weapon_m4a1_silencer",

  "awp": "weapon_awp",

  "usp-s": "weapon_usp_silencer",

  "glock-18": "weapon_glock18",

  "desert-eagle": "weapon_deagle",

  "p250": "weapon_p250",

  "famas": "weapon_famas",

  "galil-ar": "weapon_galilar",

  "aug": "weapon_aug",

  "sg-553": "weapon_sg556",

  "ssg-08": "weapon_ssg08",

  "scar-20": "weapon_scar20",

  "g3sg1": "weapon_g3sg1",

  "mac-10": "weapon_mac10",

  "mp9": "weapon_mp9",

  "mp7": "weapon_mp7",

  "mp5-sd": "weapon_mp5sd",

  "ump-45": "weapon_ump45",

  "p90": "weapon_p90",

  "pp-bizon": "weapon_bizon",

  "nova": "weapon_nova",

  "xm1014": "weapon_xm1014",

  "mag-7": "weapon_mag7",

  "sawed-off": "weapon_sawedoff",

  "m249": "weapon_m249",

  "negev": "weapon_negev",

  "cz75-auto": "weapon_cz75a",

  "tec-9": "weapon_tec9",

  "five-seven": "weapon_fiveseven",

  "dual-berettas": "weapon_elite",

  "p2000": "weapon_hkp2000",

  "r8-revolver": "weapon_revolver",

};



function parseArgs(argv) {

  const options = {

    weaponSlug: "ak-47",

    paintIndex: "",

    finishToken: "",

    marketName: "",

    sourceUrl: "",

  };



  for (let index = 0; index < argv.length; index += 1) {

    const arg = argv[index];

    if (arg === "--weapon-slug") {

      options.weaponSlug = String(argv[index + 1] || "").trim();

      index += 1;

    } else if (arg === "--paint-index") {

      options.paintIndex = String(argv[index + 1] || "").trim();

      index += 1;

    } else if (arg === "--finish-token") {

      options.finishToken = String(argv[index + 1] || "").trim();

      index += 1;

    } else if (arg === "--market-name") {

      options.marketName = String(argv[index + 1] || "").trim();

      index += 1;

    } else if (arg === "--source-url") {

      options.sourceUrl = String(argv[index + 1] || "").trim();

      index += 1;

    }

  }



  if (!options.paintIndex || !options.finishToken) {

    throw new Error("Provide --paint-index and --finish-token.");

  }



  return options;

}



function md5File(filePath) {

  const hash = crypto.createHash("md5");

  hash.update(fs.readFileSync(filePath));

  return hash.digest("hex");

}



function findFirstFile(rootDir, fileName) {

  if (!fs.existsSync(rootDir)) {

    return "";

  }



  const stack = [rootDir];

  while (stack.length > 0) {

    const current = stack.pop();

    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {

      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {

        stack.push(fullPath);

      } else if (entry.name.toLowerCase() === fileName.toLowerCase()) {

        return fullPath;

      }

    }

  }



  return "";

}



function parseVmatParams(vmatPath) {

  const defaults = {

    patternScale: "14",

    patternOffsetY: "0.97",

    color0: "0.294118 0.282353 0.329412 1",

    color1: "0.470588 0.470588 0.470588 1",

    color2: "0.188235 0.188235 0.188235 1",

    color3: "0.231373 0.227451 0.262745 1",

  };



  if (!vmatPath || !fs.existsSync(vmatPath)) {

    return defaults;

  }



  const content = fs.readFileSync(vmatPath, "utf8");

  const readValue = (key, fallback) => {

    const match = content.match(new RegExp(`"${key}"\\s*"([^"]+)"`));

    return match ? match[1].trim() : fallback;

  };



  const readColor = (key, fallback) => {

    const raw = readValue(key, "");

    if (!raw) {

      return fallback;

    }

    const cleaned = raw.replace(/^\[|\]$/g, "").trim();

    return cleaned || fallback;

  };



  return {

    patternScale: readValue("g_flPatternTexCoordScale", defaults.patternScale),

    patternOffsetY: (() => {

      const raw = readValue("g_vPatternTexCoordOffset", "");

      const match = raw.match(/\[([^\]]+)\]/);

      if (!match) {

        return defaults.patternOffsetY;

      }

      const parts = match[1].trim().split(/\s+/);

      return parts[1] || defaults.patternOffsetY;

    })(),

    color0: readColor("g_vColor0", defaults.color0),

    color1: readColor("g_vColor1", defaults.color1),

    color2: readColor("g_vColor2", defaults.color2),

    color3: readColor("g_vColor3", defaults.color3),

  };

}



function resolveWeaponModelFolder(weaponSlug) {
  const map = {
    "ak-47": "ak47",
    "m4a1-s": "m4a1_silencer",
    "m4a4": "m4a4",
    "awp": "awp",
    "usp-s": "usp_silencer",
    "glock-18": "glock18",
    "desert-eagle": "deagle",
    "p250": "p250",
    "famas": "famas",
    "galil-ar": "galilar",
    "aug": "aug",
    "sg-553": "sg556",
    "ssg-08": "ssg08",
    "scar-20": "scar20",
    "g3sg1": "g3sg1",
    "mac-10": "mac10",
    "mp9": "mp9",
    "mp7": "mp7",
    "mp5-sd": "mp5sd",
    "ump-45": "ump45",
    "p90": "p90",
    "pp-bizon": "bizon",
    "nova": "nova",
    "xm1014": "xm1014",
    "mag-7": "mag7",
    "sawed-off": "sawedoff",
    "m249": "m249",
    "negev": "negev",
    "cz75-auto": "cz75a",
    "tec-9": "tec9",
    "five-seven": "fiveseven",
    "dual-berettas": "elite",
    "p2000": "hkp2000",
    "r8-revolver": "revolver",
  };
  return map[weaponSlug] || weaponSlug.replace(/-/g, "");
}

function resolveWeaponDefaultColor(weaponSlug) {
  const weaponFolder = resolveWeaponModelFolder(weaponSlug);
  const weaponDir = path.join(ROOT, "assets", "models", "base", "weapons", "models", weaponFolder);
  if (!fs.existsSync(weaponDir)) {
    return "";
  }
  const matches = fs
    .readdirSync(weaponDir)
    .filter((name) => /default_color/i.test(name) && /\.png$/i.test(name))
    .sort();
  if (matches.length === 0) {
    return "";
  }
  return path.join(weaponDir, matches[0]);
}

function resolveHydroAssets(finishToken) {
  const pipelineDir = path.join(ROOT, "tmp_skin_pipeline", finishToken);
  const vmatDir = path.join(pipelineDir, "vmat");
  const textureDir = path.join(pipelineDir, "textures");

  const patternPath =
    findFirstFile(vmatDir, "veneto.png") ||
    findFirstFile(textureDir, "veneto_tga_ac71c9cb.png") ||
    findFirstFile(textureDir, "veneto.png");

  const grungePath =
    findFirstFile(vmatDir, "gun_grunge.png") ||
    findFirstFile(textureDir, "gun_grunge.png");

  const maskPath =
    findFirstFile(textureDir, "default_paintmask_tga_971c9ff1.png") ||
    findFirstFile(textureDir, "default_paintmask.png") ||
    findFirstFile(vmatDir, "default_paintmask.png");

  const vmatPath =
    findFirstFile(vmatDir, `${finishToken}.vmat`) ||
    findFirstFile(vmatDir, "hy_veneto_purple.vmat");

  return {
    patternPath,
    grungePath,
    maskPath,
    vmatPath,
    pipelineDir,
  };
}



async function downloadFile(url, dest) {

  const response = await fetch(url, { headers: { "User-Agent": "CS2PriceTracker/1.0" } });

  if (!response.ok) {

    throw new Error(`Download failed (${response.status}): ${url}`);

  }

  const buffer = Buffer.from(await response.arrayBuffer());

  fs.mkdirSync(path.dirname(dest), { recursive: true });

  fs.writeFileSync(dest, buffer);

  return dest;

}



function resolveAssetPaths(weaponSlug, paintIndex) {

  const weaponFolder = WEAPON_ASSET_FOLDER[weaponSlug];

  const meshFolder = MESH_FOLDER[weaponSlug];

  if (!weaponFolder || !meshFolder) {

    throw new Error(`Unsupported weapon slug: ${weaponSlug}`);

  }



  return {

    meshUrl: `${ASSETS_BASE}/3d/assets/rifles/${meshFolder}/legacy/mesh.glb`,

    albedoUrl: `${ASSETS_BASE}/3d/assets/${weaponFolder}/materials/${paintIndex}/normal.png`,

    ormUrl: `${ASSETS_BASE}/3d/assets/${weaponFolder}/materials/${paintIndex}/orm.png`,

  };

}



function updateManifest(marketName, finishToken, modelRelativePath, sourceUrl) {

  const manifestPath = path.join(ROOT, "assets", "models", "skins", "manifest.json");

  const safeMarketName = String(marketName || "").replace(/\s+/g, " ").trim();
  if (!safeMarketName || safeMarketName.length > 160 || !safeMarketName.includes("|")) {
    throw new Error(`Refusing to write invalid manifest market_name: ${safeMarketName.slice(0, 80)}`);
  }

  let items = [];

  if (fs.existsSync(manifestPath)) {

    const payload = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    items = Array.isArray(payload?.items) ? payload.items : [];

  }



  const entry = {

    market_name: safeMarketName,

    finish_token: finishToken,

    model_url: modelRelativePath.replace(/\\/g, "/"),

    source_url: sourceUrl,

    updated_at: new Date().toISOString(),

  };



  const nextItems = [entry, ...items.filter((item) => item.market_name !== safeMarketName)];

  fs.writeFileSync(manifestPath, JSON.stringify({ items: nextItems }, null, 2));

}



function runBlender(blenderPath, scriptPath, args) {

  const result = spawnSync(blenderPath, ["--background", "--python", scriptPath, "--", ...args], {

    stdio: "inherit",

  });

  if (result.status !== 0) {

    throw new Error(`Blender failed with exit code ${result.status}`);

  }

}



function isGenericWeaponMask(albedoPath, finishToken) {

  if (finishToken.startsWith("hy_")) {

    return true;

  }

  if (!fs.existsSync(albedoPath)) {

    return false;

  }

  return md5File(albedoPath) === GENERIC_AK47_MASK_MD5;

}



async function main() {

  const options = parseArgs(process.argv.slice(2));

  if (/^(aq_|am_|gs_)/i.test(options.finishToken || "")) {
    console.error("This finish must be built via VPK pattern textures (CS.MONEY normal.png is not albedo).");
    process.exit(2);
  }

  const workDir = path.join(ROOT, "tmp_skin_pipeline", options.finishToken, "csmoney");

  const meshPath = path.join(workDir, "mesh.glb");

  const albedoPath = path.join(workDir, "albedo.png");

  const ormPath = path.join(workDir, "orm.png");

  const outputModel = path.join(ROOT, "assets", "models", "skins", `${options.finishToken}.glb`);

  const blenderPath = "D:\\SteamLibrary\\steamapps\\common\\Blender\\blender.exe";

  const applyScript = path.join(ROOT, "scripts", "blender_apply_single_skin.py");

  const hydroScript = path.join(ROOT, "scripts", "blender_bake_hydro_skin.py");



  const urls = resolveAssetPaths(options.weaponSlug, options.paintIndex);

  console.log("Downloading mesh:", urls.meshUrl);

  await downloadFile(urls.meshUrl, meshPath);

  console.log("Downloading albedo:", urls.albedoUrl);

  await downloadFile(urls.albedoUrl, albedoPath);



  const useHydroBake = isGenericWeaponMask(albedoPath, options.finishToken);

  if (useHydroBake) {

    console.log("Detected hydro/generic mask texture — baking pattern from VPK assets.");

    const hydroAssets = resolveHydroAssets(options.finishToken);

    if (!hydroAssets.patternPath) {
      throw new Error(
        `Hydro pattern texture not found under ${hydroAssets.pipelineDir}. Run scripts/build_textured_model_from_cs2items.ps1 once to export VPK textures.`
      );
    }

    const baseColorPath = resolveWeaponDefaultColor(options.weaponSlug);
    if (!baseColorPath) {
      throw new Error(`Weapon default color texture not found for ${options.weaponSlug}.`);
    }
    if (!hydroAssets.maskPath) {
      throw new Error(
        `Paint mask texture not found under ${hydroAssets.pipelineDir}. Export materials/default/default_paintmask_tga_971c9ff1.vtex from the CS2 VPK first.`
      );
    }

    const vmatParams = parseVmatParams(hydroAssets.vmatPath);
    const hydroArgs = [
      "--base-model",
      meshPath,
      "--pattern",
      hydroAssets.patternPath,
      "--base-color",
      baseColorPath,
      "--paint-mask",
      hydroAssets.maskPath,
      "--output",
      outputModel,
      "--pattern-scale",
      vmatParams.patternScale,
      "--pattern-offset-y",
      vmatParams.patternOffsetY,
      "--pattern-offset-x",
      options.patternOffsetX || "0.416",
      "--color0",
      vmatParams.color0,
      "--color1",
      vmatParams.color1,
      "--color2",
      vmatParams.color2,
      "--color3",
      vmatParams.color3,
    ];

    if (hydroAssets.grungePath) {

      hydroArgs.push("--grunge", hydroAssets.grungePath);

    }



    console.log("Running Blender hydro bake...");

    runBlender(blenderPath, hydroScript, hydroArgs);

  } else {

    let roughnessPath = "";

    const ormHead = await fetch(urls.ormUrl, { method: "HEAD", headers: { "User-Agent": "CS2PriceTracker/1.0" } });

    if (ormHead.ok) {

      console.log("Downloading ORM:", urls.ormUrl);

      await downloadFile(urls.ormUrl, ormPath);

      roughnessPath = ormPath;

    }



    const blenderArgs = [

      "--base-model",

      meshPath,

      "--albedo",

      albedoPath,

      "--output",

      outputModel,

      "--mesh-preference",

      "legacy",

    ];

    if (roughnessPath) {

      blenderArgs.push("--roughness", roughnessPath);

    }



    console.log("Running Blender bake...");

    runBlender(blenderPath, applyScript, blenderArgs);

  }



  const marketName = options.marketName || options.finishToken;

  const relativeModel = path.relative(ROOT, outputModel);

  updateManifest(marketName, options.finishToken, relativeModel, options.sourceUrl || urls.albedoUrl);

  const patchScript = path.join(ROOT, "scripts", "patch_glb_normal_alpha.py");
  if (fs.existsSync(patchScript) && fs.existsSync(outputModel)) {
    console.log("Patching normal-map alpha for WebGL...");
    const patch = spawnSync("python", [patchScript, "--dirs", outputModel], {
      cwd: ROOT,
      stdio: "inherit",
      windowsHide: true,
    });
    if (patch.status !== 0) {
      console.warn(`normal-alpha patch exited ${patch.status}`);
    }
  }

  console.log("Built:", outputModel);

}



main().catch((error) => {

  console.error(error.message || error);

  process.exit(1);

});


