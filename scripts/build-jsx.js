#!/usr/bin/env node
/**
 * Compiles every react/*.jsx page into its matching react/*.build.js.
 *
 * The HTML pages load the precompiled *.build.js (fast, no in-browser Babel).
 * esbuild is used because the existing artifacts were produced with it
 * (note the `/* @__PURE__ *​/ React.createElement(...)` output signature).
 *
 * Usage:
 *   npm run build        # one-shot build of all pages
 *   npm run watch        # rebuild on change
 *   node scripts/build-jsx.js react/deals-page.jsx   # build a single file
 */
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const REACT_DIR = path.join(__dirname, "..", "react");
const watch = process.argv.includes("--watch");
const explicit = process.argv.slice(2).filter((a) => a.endsWith(".jsx"));

// item-page is authored in item-page.tsx (the .jsx is an old, pre-redesign
// stub that does NOT use the tv-* class system styled by item_page.css).
// Building the stale .jsx would clobber the real build — never auto-build it;
// build the .tsx instead.
const SKIP_JSX = new Set(["item-page.jsx"]);
const EXTRA_SOURCES = ["item-page.tsx"]; // .tsx-authored pages -> *.build.js

function jsxFiles() {
  if (explicit.length) return explicit.map((f) => path.resolve(f));
  const jsx = fs
    .readdirSync(REACT_DIR)
    .filter((f) => f.endsWith(".jsx") && !SKIP_JSX.has(f));
  return [...jsx, ...EXTRA_SOURCES].map((f) => path.join(REACT_DIR, f));
}

const buildOptions = {
  loader: { ".jsx": "jsx", ".tsx": "tsx" },
  jsx: "transform",          // classic React.createElement (React is a global)
  format: "iife",            // self-contained, matches existing wrapper
  charset: "utf8",
  logLevel: "info",
};

async function buildOne(file) {
  const out = file.replace(/\.(jsx|tsx)$/, ".build.js");
  await esbuild.build({
    ...buildOptions,
    entryPoints: [file],
    outfile: out,
    bundle: false,
  });
  return out;
}

async function buildCraftInspect() {
  const entry = path.join(REACT_DIR, "craft-inspect.js");
  const out = path.join(REACT_DIR, "craft-inspect.build.js");
  const bufferShim = path.join(REACT_DIR, "craft-inspect-buffer-shim.js");
  await esbuild.build({
    ...buildOptions,
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    format: "iife",
    globalName: "CS2CraftInspect",
    platform: "browser",
    inject: [bufferShim],
    define: {
      global: "globalThis",
    },
  });
  return out;
}

async function run() {
  const files = jsxFiles();
  if (!files.length) {
    console.error("No .jsx files found.");
    process.exit(1);
  }
  for (const f of files) {
    await buildOne(f);
    console.log("built", path.basename(f.replace(/\.jsx$/, ".build.js")));
  }
  await buildCraftInspect();
  console.log("built craft-inspect.build.js");
  if (watch) {
    console.log("watching react/*.jsx for changes…");
    fs.watch(REACT_DIR, { persistent: true }, (_evt, name) => {
      if (name && name.endsWith(".jsx")) {
        buildOne(path.join(REACT_DIR, name))
          .then(() => console.log("rebuilt", name))
          .catch((e) => console.error("build error in", name, e.message));
      }
    });
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
