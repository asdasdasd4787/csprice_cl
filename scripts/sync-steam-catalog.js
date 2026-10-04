#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'assets', 'steam-market-cache');
const CATALOG_PATH = path.join(CACHE_DIR, 'catalog.json');
const MANIFEST_PATH = path.join(CACHE_DIR, 'manifest.json');
const LOG_PATH = path.join(CACHE_DIR, 'sync-steam-catalog.log');

const PAGE_SIZE = 10;
const PARALLEL = 1;
const BATCH_PAUSE_MS = 3500;
const INITIAL_COOLDOWN_MS = 90000;
const RATE_LIMIT_PAUSE_MS = 90000;
const SAVE_EVERY_PAGES = 25;
const MAX_PAGE_RETRIES = 8;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36';

const args = process.argv.slice(2);
const downloadImages = args.includes('--download-images');
const pageLimitArg = args.find((a) => a.startsWith('--page-limit='));
const pageLimit = pageLimitArg ? Math.max(1, parseInt(pageLimitArg.split('=')[1], 10)) : null;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + '\n');
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function stripWear(marketHashName) {
  return String(marketHashName).replace(
    /\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/,
    ''
  );
}

function splitWear(marketHashName) {
  const match = String(marketHashName).match(
    /^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/
  );
  if (match) {
    return { base_name: match[1].trim(), wear: match[2].trim() };
  }
  return { base_name: marketHashName, wear: '' };
}

function slug(value) {
  const cleaned = String(value)
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return cleaned || 'item';
}

function outputPath(marketHashName) {
  const hash = crypto.createHash('sha1').update(marketHashName).digest('hex').slice(0, 10);
  return path.join(CACHE_DIR, `${slug(marketHashName)}--${hash}.png`);
}

function relativePath(absolutePath) {
  return absolutePath.replace(/\\/g, '/').replace(/^.*?assets\//, 'assets/');
}

function marketUrl(marketHashName) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
}

function buildEconomyUrl(iconPath) {
  return `https://community.steamstatic.com/economy/image/${String(iconPath).replace(/^\//, '')}`;
}

function categoryMeta(marketHashName, type) {
  const name = normalize(marketHashName);
  const typeValue = normalize(type);
  const weaponTypeMatch =
    typeValue.includes('rifle') ||
    typeValue.includes('pistol') ||
    typeValue.includes('smg') ||
    typeValue.includes('shotgun') ||
    typeValue.includes('sniper') ||
    typeValue.includes('machinegun') ||
    typeValue.includes('equipment');

  if (
    marketHashName.startsWith('Sticker |') ||
    typeValue.includes('sticker') ||
    name.includes('sticker capsule') ||
    name.includes('autograph capsule')
  ) {
    return { category: 'stickers', label: 'Stickers' };
  }
  if (marketHashName.startsWith('Sealed Graffiti |') || typeValue.includes('graffiti')) {
    return { category: 'graffiti', label: 'Graffiti' };
  }
  if (marketHashName.startsWith('Patch |') || typeValue.includes('patch')) {
    return { category: 'patches', label: 'Patches' };
  }
  if (marketHashName.startsWith('Music Kit |') || typeValue.includes('music kit')) {
    return { category: 'music', label: 'Music Kits' };
  }
  if (typeValue.includes('agent')) {
    return { category: 'agents', label: 'Agents' };
  }
  if (marketHashName.startsWith('★ ') || typeValue.includes('knife')) {
    return { category: 'knives', label: 'Knives' };
  }
  if (typeValue.includes('glove') || name.includes('gloves |')) {
    return { category: 'gloves', label: 'Gloves' };
  }
  if (typeValue.includes('charm') || name.includes(' charm')) {
    return { category: 'charms', label: 'Charms' };
  }
  if (
    typeValue.includes('coin') ||
    typeValue.includes('pin') ||
    typeValue.includes('collectible') ||
    typeValue.includes('stars for operation') ||
    name.includes('star for operation') ||
    name.includes('map coin')
  ) {
    return { category: 'collectibles', label: 'Collectibles' };
  }
  if (
    typeValue.includes('tool') ||
    typeValue.includes('key') ||
    typeValue.includes('pass') ||
    name.includes('name tag') ||
    name.includes('storage unit')
  ) {
    return { category: 'tools', label: 'Tools' };
  }
  if (
    typeValue.includes('container') ||
    name.includes('case') ||
    name.includes('souvenir package') ||
    name.includes('capsule')
  ) {
    return { category: 'cases', label: 'Cases' };
  }
  if (weaponTypeMatch || marketHashName.includes(' | ')) {
    return { category: 'skins', label: 'Weapon Skins' };
  }
  return { category: 'other', label: 'Other Items' };
}

const CATEGORY_OVERRIDE = {
  skins: { category: 'skins', label: 'Weapon Skins' },
  cases: { category: 'cases', label: 'Cases' },
  stickers: { category: 'stickers', label: 'Stickers' },
  knives: { category: 'knives', label: 'Knives' },
  gloves: { category: 'gloves', label: 'Gloves' },
  agents: { category: 'agents', label: 'Agents' },
  patches: { category: 'patches', label: 'Patches' },
  music: { category: 'music', label: 'Music Kits' },
  graffiti: { category: 'graffiti', label: 'Graffiti' },
  collectibles: { category: 'collectibles', label: 'Collectibles' },
  charms: { category: 'charms', label: 'Charms' },
  tools: { category: 'tools', label: 'Tools' },
};

function buildManifestIndexes(manifest) {
  const byName = {};
  const byResolved = {};
  const byBase = {};

  for (const entry of manifest) {
    if (!entry || typeof entry !== 'object') continue;
    const marketHashName = String(entry.market_hash_name || '').trim();
    const resolvedName = String(entry.resolved_market_hash_name || '').trim();
    const category = String(entry.category || '').trim();

    const assign = (map, key) => {
      if (!key) return;
      const existing = map[key];
      if (
        !existing ||
        (category !== 'inventory' && String(existing.category || '') === 'inventory')
      ) {
        map[key] = entry;
      }
    };

    assign(byName, marketHashName);
    assign(byResolved, resolvedName);
    assign(byBase, stripWear(marketHashName));
    assign(byBase, stripWear(resolvedName));
  }

  return { byName, byResolved, byBase };
}

function pickManifestMatch(index, marketHashName, baseName, wear) {
  const exact = index.byName[marketHashName];
  const resolved = index.byResolved[marketHashName];
  const base = wear !== '' ? index.byBase[baseName] : null;

  for (const candidate of [exact, resolved, base]) {
    if (!candidate) continue;
    const category = String(candidate.category || '').trim();
    if (category !== '' && category !== 'inventory') return candidate;
  }
  return exact || null;
}

function internalHref(marketHashName, image, type, category, nameColor) {
  if (category !== 'skins') return '';
  const split = splitWear(marketHashName);
  if (!split.base_name.includes(' | ')) return '';

  const params = new URLSearchParams({
    lookup_name: split.base_name,
    display_name: split.base_name,
    image,
    market_url: marketUrl(marketHashName),
    type,
    color: nameColor,
  });
  if (split.wear) params.set('selected_wear', split.wear);
  return `item_page.html?${params.toString()}`;
}

function searchUrl(start) {
  return (
    `https://steamcommunity.com/market/search/render/?appid=730&norender=1&search_descriptions=0` +
    `&sort_column=name&sort_dir=asc&count=${PAGE_SIZE}&start=${start}`
  );
}

async function fetchPage(start) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_PAGE_RETRIES; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(
        'curl.exe',
        [
          '-s',
          searchUrl(start),
          '-H',
          `User-Agent: ${USER_AGENT}`,
          '-H',
          'Accept: application/json,text/plain,*/*',
          '-H',
          'Accept-Language: en-US,en;q=0.9',
          '--connect-timeout',
          '15',
          '--max-time',
          '45',
          '-w',
          '\n%{http_code}',
        ],
        { maxBuffer: 16 * 1024 * 1024 }
      );

      const trimmed = stdout.trimEnd();
      const splitAt = trimmed.lastIndexOf('\n');
      const body = splitAt >= 0 ? trimmed.slice(0, splitAt) : trimmed;
      const statusCode = splitAt >= 0 ? trimmed.slice(splitAt + 1) : '200';

      if (statusCode === '429') {
        const waitMs = Math.min(180000, RATE_LIMIT_PAUSE_MS + 10000 * attempt);
        log(`Rate limited at start=${start}, waiting ${waitMs}ms (attempt ${attempt + 1})`);
        await sleep(waitMs);
        continue;
      }

      if (!body || statusCode.startsWith('4') || statusCode.startsWith('5')) {
        throw new Error(`HTTP ${statusCode || 'unknown'}`);
      }

      const payload = JSON.parse(body);
      if (!payload || !Array.isArray(payload.results)) {
        throw new Error('Invalid JSON payload');
      }

      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_PAGE_RETRIES) {
        await sleep(2000 * (attempt + 1));
      }
    }
  }

  throw lastError || new Error(`Failed to fetch start=${start}`);
}

async function downloadImage(marketHashName, imageUrl) {
  if (!imageUrl) return '';
  const filePath = outputPath(marketHashName);
  if (fs.existsSync(filePath)) return relativePath(filePath);

  try {
    const response = await fetch(imageUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return '';
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('png')) return '';
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    return relativePath(filePath);
  } catch {
    return '';
  }
}

function buildImageUrl(result) {
  const asset =
    result.asset_description && typeof result.asset_description === 'object'
      ? result.asset_description
      : {};
  const iconPath = String(asset.icon_url_large || asset.icon_url || '').trim();
  return iconPath ? buildEconomyUrl(iconPath) : '';
}

async function buildEntry(result, manifestIndex, shouldDownloadImages) {
  const asset =
    result.asset_description && typeof result.asset_description === 'object'
      ? result.asset_description
      : {};
  const marketHashName = String(asset.market_hash_name || result.hash_name || '').trim();
  const type = String(asset.type || 'Counter-Strike Item').trim();
  const nameColor = String(asset.name_color || 'B0C3D9').trim().toUpperCase() || 'B0C3D9';
  const steamImageUrl = buildImageUrl(result);
  let meta = categoryMeta(marketHashName, type);
  const split = splitWear(marketHashName);
  const manifestMatch = pickManifestMatch(
    manifestIndex,
    marketHashName,
    split.base_name,
    split.wear
  );

  if (manifestMatch && manifestMatch.category && manifestMatch.category !== 'inventory') {
    meta = CATEGORY_OVERRIDE[manifestMatch.category] || meta;
  }

  let localPath = String(manifestMatch?.local_path || '').trim();
  const projectImagePath = String(manifestMatch?.project_image_path || '').trim();

  if (!localPath && shouldDownloadImages) {
    localPath = await downloadImage(marketHashName, steamImageUrl);
  }

  const preferredImage = localPath || projectImagePath || steamImageUrl;

  return {
    market_hash_name: marketHashName,
    market_url: marketUrl(marketHashName),
    internal_href: internalHref(marketHashName, preferredImage, type, meta.category, nameColor),
    image: preferredImage,
    local_path: localPath,
    project_image_path: projectImagePath,
    steam_image_url: steamImageUrl,
    category: meta.category,
    category_label: meta.label,
    type_note: type,
    name_color: nameColor,
    wear: split.wear,
    base_name: split.base_name,
    sell_price:
      result.sell_price != null ? Math.round(Number(result.sell_price) / 100 * 100) / 100 : null,
    sell_price_text: String(result.sell_price_text || '').trim(),
    sell_listings: result.sell_listings != null ? Number(result.sell_listings) : null,
  };
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadExistingCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    return { items: [], pages_synced: 0, total_count: 0 };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      pages_synced: Number(parsed.pages_synced || 0),
      total_count: Number(parsed.total_count || 0),
    };
  } catch {
    return { items: [], pages_synced: 0, total_count: 0 };
  }
}

function sortItems(items) {
  return [...items].sort((a, b) =>
    a.market_hash_name.localeCompare(b.market_hash_name, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

function saveCatalog(state) {
  const items = sortItems([...state.entriesByName.values()]);
  const payload = {
    updated_at: new Date().toISOString(),
    source: 'steam-market-search',
    total_count: state.totalCount,
    pages_synced: state.pagesDone,
    download_images: downloadImages,
    saved_items: items.length,
    items,
  };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(payload));
  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processPage(payload, state) {
  if (!payload || !Array.isArray(payload.results)) return 0;
  let added = 0;
  for (const result of payload.results) {
    if (!result || typeof result !== 'object') continue;
    const entry = await buildEntry(result, state.manifestIndex, downloadImages);
    if (!entry.market_hash_name) continue;
    state.entriesByName.set(entry.market_hash_name, entry);
    added += 1;
  }
  return added;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (!args.includes('--append-log')) {
    fs.writeFileSync(LOG_PATH, '');
  }

  const manifestIndex = buildManifestIndexes(loadManifest());
  const existing = loadExistingCatalog();
  const entriesByName = new Map();

  for (const item of existing.items) {
    if (item && item.market_hash_name) {
      entriesByName.set(item.market_hash_name, item);
    }
  }

  log(
    `Starting Steam catalog sync (page_size=${PAGE_SIZE}, parallel=${PARALLEL}, download_images=${downloadImages}, resume_items=${entriesByName.size})`
  );

  let firstPage;
  try {
    firstPage = await fetchPage(0);
  } catch (error) {
    log(`First page rate limited, cooling down ${INITIAL_COOLDOWN_MS}ms before retry`);
    await sleep(INITIAL_COOLDOWN_MS);
    firstPage = await fetchPage(0);
  }
  const totalCount = Number(firstPage.total_count || 0);
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 0;
  const pagesToSync = pageLimit != null ? Math.min(totalPages, pageLimit) : totalPages;

  const state = {
    manifestIndex,
    entriesByName,
    totalCount,
    pagesDone: 0,
    pagesToSync,
  };

  log(`Steam reports ${totalCount} items across ${totalPages} pages; syncing ${pagesToSync} pages`);

  const pendingStarts = [];
  for (let page = 0; page < pagesToSync; page += 1) {
    pendingStarts.push(page * PAGE_SIZE);
  }

  const completedStarts = new Set();
  const failedAttempts = new Map();
  let lastSaveAt = 0;

  while (pendingStarts.length > 0) {
    const chunk = pendingStarts.splice(0, PARALLEL);

    for (const start of chunk) {
      try {
        const payload = await fetchPage(start);
        await processPage(payload, state);
        completedStarts.add(start);
        state.pagesDone = completedStarts.size;
      } catch (error) {
        const attempts = (failedAttempts.get(start) || 0) + 1;
        failedAttempts.set(start, attempts);
        log(`WARN page start=${start} failed after retries (${attempts}): ${error.message}`);
        if (attempts >= 12) {
          throw new Error(`Giving up on start=${start} after ${attempts} failures`);
        }
        pendingStarts.push(start);
      }
    }

    if (state.pagesDone - lastSaveAt >= SAVE_EVERY_PAGES || pendingStarts.length === 0) {
      const payload = saveCatalog(state);
      lastSaveAt = state.pagesDone;
      log(
        `Progress: ${state.pagesDone}/${pagesToSync} pages, ${payload.saved_items} unique items saved, ${pendingStarts.length} pages queued`
      );
    }

    if (pendingStarts.length > 0) {
      await sleep(BATCH_PAUSE_MS);
    }
  }

  const finalPayload = saveCatalog(state);
  log(
    `Done: ${finalPayload.saved_items} items saved (${finalPayload.total_count} reported by Steam, ${finalPayload.pages_synced} pages synced)`
  );
  console.log(
    JSON.stringify(
      {
        success: true,
        updated_at: finalPayload.updated_at,
        total_count: finalPayload.total_count,
        pages_synced: finalPayload.pages_synced,
        download_images: downloadImages,
        saved_items: finalPayload.saved_items,
        catalog_path: 'assets/steam-market-cache/catalog.json',
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  log(`ERROR: ${error.stack || error.message}`);
  console.error(error);
  process.exit(1);
});
