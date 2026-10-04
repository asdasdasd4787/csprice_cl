const { InspectLink, Sticker, generate } = require("@vlydev/cs2-masked-inspect");

// Steam / Chromium truncate very long steam:// URLs; keep attachments even if we drop offsets.
const MAX_INSPECT_URL_LENGTH = 1800;

function roundInspectNumber(value, digits = 4) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
}

function hasMeaningfulInspectOffsets(inspect) {
  if (!inspect || typeof inspect !== "object") return false;
  if (inspect.nearDefault) return false;
  const offsetX = Number(inspect.offsetX);
  const offsetY = Number(inspect.offsetY);
  const offsetZ = Number(inspect.offsetZ);
  const rotation = Number(inspect.rotation);
  const scale = Number(inspect.scale);
  const hasOffset = [offsetX, offsetY, offsetZ].some(
    (value) => Number.isFinite(value) && Math.abs(value) > 0.002
  );
  const hasRotation = Number.isFinite(rotation) && Math.abs(rotation) > 0.5;
  const hasScale = Number.isFinite(scale) && Math.abs(scale - 1) > 0.02;
  return hasOffset || hasRotation || hasScale;
}

function hasCustomStickerInspect(sticker) {
  if (!sticker) return false;
  const inspect = sticker.inspect || sticker.placement?.inspect || null;
  return hasMeaningfulInspectOffsets(inspect);
}

function normalizeStickerWear(wear) {
  const parsed = Number(wear);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(0, Math.min(1, parsed));
}

function applyStickerInspectOffsets(custom, inspect) {
  if (!inspect || typeof inspect !== "object") return;
  const offsetX = roundInspectNumber(inspect.offsetX);
  const offsetY = roundInspectNumber(inspect.offsetY);
  // Keep skipping offsetZ: wrong depth still buries stickers in the mesh.
  if (Number.isFinite(offsetX) && Math.abs(offsetX) > 0.002) custom.offsetX = offsetX;
  if (Number.isFinite(offsetY) && Math.abs(offsetY) > 0.002) custom.offsetY = offsetY;
}

function applyKeychainInspectOffsets(payload, entry) {
  const inspect = entry?.inspect || entry?.placement?.inspect || null;
  const sources = [entry, inspect];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const offsetX = roundInspectNumber(source.offsetX);
    const offsetY = roundInspectNumber(source.offsetY);
    const offsetZ = roundInspectNumber(source.offsetZ);
    if (Number.isFinite(offsetX) && payload.offsetX == null) payload.offsetX = offsetX;
    if (Number.isFinite(offsetY) && payload.offsetY == null) payload.offsetY = offsetY;
    if (Number.isFinite(offsetZ) && payload.offsetZ == null) payload.offsetZ = offsetZ;
  }
}

function buildCraftSticker(sticker, slotIndex, { includeOffsets = true } = {}) {
  const slot = Number.isInteger(sticker?.slot) ? sticker.slot : slotIndex;
  const stickerId = Number(sticker?.stickerId) || 0;
  const inspect = sticker?.inspect || sticker?.placement?.inspect || null;
  const rotation = roundInspectNumber(inspect?.rotation ?? sticker?.rotation);
  const hasRotation = Number.isFinite(rotation) && Math.abs(rotation) > 0.5;
  const base = {
    slot,
    stickerId,
    // Omit wear=0 so CS2 treats the sticker as fresh (library examples leave wear null).
    wear: normalizeStickerWear(sticker?.wear),
  };

  if (!stickerId || !includeOffsets || (!hasCustomStickerInspect(sticker) && !hasRotation)) {
    return new Sticker(base);
  }

  const custom = {
    ...base,
    wear: normalizeStickerWear(inspect?.wear) ?? base.wear,
  };
  const scale = roundInspectNumber(inspect?.scale);

  if (Number.isFinite(scale) && Math.abs(scale - 1) > 0.02) custom.scale = scale;
  if (hasRotation) custom.rotation = rotation;
  // Slot-relative X/Y (Y is flipped in the crafter→CS2 mapper). Still omit Z.
  if (inspect) applyStickerInspectOffsets(custom, inspect);

  return new Sticker(custom);
}

function buildCraftKeychain(entry, { includeOffsets = true } = {}) {
  const id = Number(entry?.stickerId || entry?.def_index) || 0;
  if (id <= 0) return null;
  const payload = {
    slot: Number.isInteger(entry?.slot) ? entry.slot : (Number(entry?.slot) || 0),
    stickerId: id,
    // Omit wear=0 — same as stickers; encoded 0 can confuse some clients.
    wear: normalizeStickerWear(entry?.wear),
  };
  const pattern = Number(entry?.pattern);
  if (Number.isFinite(pattern) && pattern > 0) payload.pattern = pattern;
  const highlightReel = Number(entry?.highlightReel ?? entry?.highlight_reel);
  if (Number.isFinite(highlightReel) && highlightReel > 0) payload.highlightReel = highlightReel;
  const paintKit = Number(entry?.paintKit ?? entry?.paint_kit ?? entry?.wrappedSticker ?? entry?.wrapped_sticker);
  if (Number.isFinite(paintKit) && paintKit > 0) payload.paintKit = paintKit;
  if (includeOffsets) applyKeychainInspectOffsets(payload, entry);
  return new Sticker(payload);
}

function encodeCraftAttachments(params, { includeOffsets = true } = {}) {
  const rawStickers = Array.isArray(params?.stickers) ? params.stickers : [];
  const stickers = [];
  // CS2 inspect has 5 sticker slots (0–4). Keep crafter index even when some are empty.
  const slotLimit = Math.min(rawStickers.length, 5);
  for (let slotIndex = 0; slotIndex < slotLimit; slotIndex += 1) {
    const entry = rawStickers[slotIndex];
    if (!entry) continue;
    const slotted = Number.isInteger(entry.slot)
      ? entry
      : { ...entry, slot: slotIndex };
    const built = buildCraftSticker(slotted, slotIndex, { includeOffsets });
    if (built.stickerId > 0) stickers.push(built);
  }

  const keychains = (Array.isArray(params?.keychains) ? params.keychains : [])
    .map((entry) => buildCraftKeychain(entry, { includeOffsets }))
    .filter(Boolean);

  return { stickers, keychains };
}

function attachmentsMatchExpected(url, expectedStickers, expectedKeychains) {
  try {
    const decoded = InspectLink.deserialize(url);
    if ((decoded.stickers || []).length !== expectedStickers.length) return false;
    if ((decoded.keychains || []).length !== expectedKeychains.length) return false;
    const stickerIds = new Set((decoded.stickers || []).map((entry) => Number(entry.stickerId) || 0));
    for (const sticker of expectedStickers) {
      if (!stickerIds.has(Number(sticker.stickerId) || 0)) return false;
    }
    const keychainIds = new Set((decoded.keychains || []).map((entry) => Number(entry.stickerId) || 0));
    for (const keychain of expectedKeychains) {
      if (!keychainIds.has(Number(keychain.stickerId) || 0)) return false;
    }
    return true;
  } catch (_error) {
    return false;
  }
}

function buildCraftInspectUrl(params) {
  const defIndex = Number(params?.defIndex);
  const paintIndex = Number(params?.paintIndex);
  const paintSeed = Number(params?.paintSeed);
  const paintWear = Number(params?.paintWear);
  if (!Number.isFinite(defIndex) || defIndex <= 0) {
    throw new Error("Missing weapon defindex");
  }
  if (!Number.isFinite(paintIndex) || paintIndex <= 0) {
    throw new Error("Missing skin paint index");
  }
  if (!Number.isFinite(paintSeed) || paintSeed < 0) {
    throw new Error("Missing paint seed");
  }
  if (!Number.isFinite(paintWear) || paintWear < 0 || paintWear > 1) {
    throw new Error("Invalid paint wear");
  }

  // Unique (4) matches real inventory inspect links and is what CS2 expects for generated crafts.
  const qualityRaw = Number(params?.quality);
  const quality = Number.isFinite(qualityRaw) && qualityRaw > 0 ? qualityRaw : 4;
  const rarity = Number(params?.rarity) || 0;

  const buildUrl = (includeOffsets) => {
    const { stickers, keychains } = encodeCraftAttachments(params, { includeOffsets });
    return {
      stickers,
      keychains,
      url: generate(defIndex, paintIndex, paintSeed, paintWear, {
        rarity,
        quality,
        stickers,
        keychains,
      }),
    };
  };

  // Prefer custom sticker + charm offsets together; fall back to ID-only if the
  // combined payload is too long or fails a round-trip (both attachment types must remain).
  let result = buildUrl(true);
  const needsFallback = (
    result.url.length > MAX_INSPECT_URL_LENGTH
    || !attachmentsMatchExpected(result.url, result.stickers, result.keychains)
  );
  if (needsFallback && (result.stickers.length > 0 || result.keychains.length > 0)) {
    result = buildUrl(false);
  }

  if (!attachmentsMatchExpected(result.url, result.stickers, result.keychains)) {
    throw new Error("Inspect link dropped stickers or charm; try again.");
  }

  return result.url;
}

module.exports = {
  buildCraftInspectUrl,
  buildCraftSticker,
  buildCraftKeychain,
  hasCustomStickerInspect,
  hasMeaningfulInspectOffsets,
};
