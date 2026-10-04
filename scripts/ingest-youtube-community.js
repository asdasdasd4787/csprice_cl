#!/usr/bin/env node
/**
 * Register a YouTube clip for Mark's community knowledge layer.
 *
 * Usage:
 *   node scripts/ingest-youtube-community.js "https://www.youtube.com/watch?v=VIDEO_ID"
 *   node scripts/ingest-youtube-community.js --list
 *
 * Writes/updates assets/ai/community-sources.json and appends a stub line to
 * assets/ai/community-knowledge.md when --note is provided.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SOURCES_PATH = path.join(ROOT, "assets", "ai", "community-sources.json");
const KNOWLEDGE_PATH = path.join(ROOT, "assets", "ai", "community-knowledge.md");

function parseArgs(argv) {
  const args = { url: "", note: "", topics: [], list: false };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--list") {
      args.list = true;
    } else if (token === "--note" && argv[i + 1]) {
      args.note = argv[++i];
    } else if (token === "--topics" && argv[i + 1]) {
      args.topics = argv[++i].split(",").map((entry) => entry.trim()).filter(Boolean);
    } else if (!token.startsWith("-") && !args.url) {
      args.url = token;
    }
  }
  return args;
}

function extractVideoId(url) {
  const value = String(url || "").trim();
  const watchMatch = value.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (watchMatch) return watchMatch[1];
  const shortMatch = value.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (shortMatch) return shortMatch[1];
  return "";
}

function loadSources() {
  if (!fs.existsSync(SOURCES_PATH)) {
    return { version: 1, updated_at: new Date().toISOString(), sources: [] };
  }
  const parsed = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
  return {
    version: Number(parsed.version) || 1,
    updated_at: parsed.updated_at || new Date().toISOString(),
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
  };
}

function saveSources(bundle) {
  bundle.updated_at = new Date().toISOString();
  fs.writeFileSync(SOURCES_PATH, JSON.stringify(bundle, null, 2) + "\n", "utf8");
}

async function fetchOEmbed(url) {
  const endpoint = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(url);
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json", "User-Agent": "CSPriceCommunityBot/1.0" },
  });
  if (!response.ok) {
    throw new Error(`oEmbed failed (${response.status})`);
  }
  return response.json();
}

async function main() {
  const args = parseArgs(process.argv);
  const bundle = loadSources();

  if (args.list) {
    bundle.sources.forEach((source) => {
      console.log(`- ${source.title || source.id}: ${source.url}`);
    });
    return;
  }

  const videoId = extractVideoId(args.url);
  if (!videoId) {
    console.error("Provide a valid YouTube watch URL.");
    process.exit(1);
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const meta = await fetchOEmbed(canonicalUrl);
  const id = `yt-${videoId.toLowerCase()}`;
  const entry = {
    id,
    type: "youtube",
    url: canonicalUrl,
    title: String(meta.title || "").trim(),
    channel: String(meta.author_name || "").trim(),
    channel_url: String(meta.author_url || "").trim(),
    thumbnail_url: String(meta.thumbnail_url || "").trim(),
    topics: args.topics.length ? args.topics : ["community"],
    summary: args.note
      || `Community YouTube clip: ${String(meta.title || videoId).trim()} (${String(meta.author_name || "unknown channel").trim()}).`,
  };

  const index = bundle.sources.findIndex((source) => source.id === id || source.url === canonicalUrl);
  if (index >= 0) {
    bundle.sources[index] = { ...bundle.sources[index], ...entry };
    console.log("Updated", id);
  } else {
    bundle.sources.push(entry);
    console.log("Added", id);
  }

  saveSources(bundle);

  if (args.note) {
    const block = `\n## Source: ${entry.title}\n- Video: ${canonicalUrl}\n- Channel: ${entry.channel}\n- Note: ${args.note}\n`;
    fs.appendFileSync(KNOWLEDGE_PATH, block, "utf8");
    console.log("Appended note to community-knowledge.md");
  }

  console.log("Done. Mark loads this via aiChatReferenceKnowledge().");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
