#!/usr/bin/env node
/**
 * Usage: node scripts/build-sticker-inspect-url.js <stickerId> [rarity]
 * Prints a steam:// CS2 inspect URL for a standalone sticker (defIndex 1209).
 */
const { InspectLink, ItemPreviewData, Sticker } = require("@vlydev/cs2-masked-inspect");

const CS2_STEAM_CONTEXT = "76561202255233023";
const stickerId = Number(process.argv[2]);
const rarity = Number(process.argv[3]);

if (!Number.isFinite(stickerId) || stickerId <= 0) {
  process.exit(1);
}

const hex = InspectLink.serialize(new ItemPreviewData({
  defIndex: 1209,
  quality: 4,
  rarity: Number.isFinite(rarity) && rarity >= 0 ? rarity : 4,
  stickers: [new Sticker({ slot: 0, stickerId })],
}));

process.stdout.write(
  `steam://rungame/730/${CS2_STEAM_CONTEXT}/+csgo_econ_action_preview%20${hex}`
);
