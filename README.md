# CSPRICE

A CS2 (Counter-Strike 2) skin and item price tracker. It aggregates listings
across eleven marketplaces, keeps price history per item and wear, and answers
questions about the market through a built-in assistant.

Live site: https://csprice.eu

---

## What it does

**Price aggregation.** Every item page compares the live price across Steam,
Skinport, CSFloat, White.Market, DMarket, Waxpeer, Market.CSGO, ShadowPay,
Mannco.store, HaloSkins and Buff, showing the cheapest source, each market's
fee and listing depth, and the saving against the Steam reference price.

**Price history.** Per-item daily history with 7D / 1M / 3M / 6M / 1Y / Max
ranges, charted per marketplace, plus listing-count distribution so you can see
where supply actually sits rather than just where the cheapest tag is.

**Deals.** A continuously refreshed list of listings priced below their market
value, filterable by weapon class and price band, sorted by saving against
Steam.

**Market Explorer.** The full catalogue — roughly 29,000 items across skins,
cases, stickers, capsules, charms, agents, patches, pins, graffiti and music
kits — browsable by category with live prices and listing counts.

**Care Package.** A drop simulator: it deals four items from the active weekly
pool weighted by their real drop odds, shows what you would keep, and charts
the dealt items' 30-day trend.

**Skin Crafter.** A 3D viewer for placing stickers and charms on a weapon
before committing real money to the craft.

**Mark, the assistant.** A chat assistant with the catalogue and price history
in context, for questions like "is this worth buying now" or "compare these two
wears".

**Inventory.** Steam sign-in reads your inventory, values it at current prices
and exports to Excel.

The site also runs a Team Fortress 2 edition at https://tf2price.eu, sharing
this codebase with a separate catalogue and its own deployment.

---

## How it is built

Deliberately boring and dependency-light, because it has to serve ~29,000
pre-rendered item pages cheaply:

- **No framework and no bundler pipeline.** React 18 from a CDN, with page
  components compiled by a vendored `esbuild` binary straight to IIFE bundles
  (`react/*.build.js`). There is no webpack, no Vite, no npm install step.
- **PHP endpoints** for anything that touches a marketplace API or the price
  cache (`search_items.php`, `catalog_json.php`, `item_page.php`, …).
- **Static pre-rendering.** `scripts/build_item_urls.php` generates a static
  page per item so every item has a real URL for search engines; a clean-URL
  builder mirrors each root page into a folder copy.
- **Plain CSS** in `styles/css/`, themed through custom properties in
  `theme.css`, with a dark and a light theme.
- **A separate mobile shell** (`react/mobile-shell.js`) that mounts a bottom
  tab bar, a search overlay and a navigation sheet below 768px, so phone
  layouts are purpose-built rather than reflowed desktop.

### Layout

```
react/          page components (.jsx/.tsx sources + compiled .build.js)
styles/css/     stylesheets, one per page area, plus theme tokens
scripts/        PHP build and maintenance scripts (page generation, caches)
assets/         icons, marketplace logos, weapon and sticker artwork
*.php           API endpoints and server-rendered entry points
*.html          page shells that mount the React components
```

---

## Running it locally

Requires PHP 8 and a web server; the project is developed under XAMPP.

```bash
# 1. serve the directory (XAMPP: drop it in htdocs, or:)
php -S localhost:8000

# 2. create your local config, which is gitignored
cp config.php config.local.php
# then fill in the marketplace API keys you have
```

`config.local.php` holds every credential and is never committed. Without it
the site runs, but the marketplace endpoints return no data.

To recompile a page component after editing it:

```bash
./node_modules/@esbuild/win32-x64/esbuild.exe react/deals-page.jsx \
  --jsx=transform --format=iife --charset=utf8 \
  --outfile=react/deals-page.build.js
```

---

## What is not in this repository

Trimmed deliberately, to keep it reviewable:

- **Generated item pages** (~29,000 HTML files) — rebuild with
  `scripts/build_item_urls.php`.
- **3D weapon models** (~18 GB) — regenerate with
  `scripts/export_base_weapon_models.ps1`.
- **Price caches** under `assets/*-cache/` — repopulated by the sync scripts.
- **Deployment configuration and credentials** (`deploy/`,
  `config.local.php`).
- **Scratch and debug artifacts** from development.

---

## Submission notes

This project is a CS2 market data site. It does **not** use Solana or any
blockchain component — if that is a requirement of the track you are
submitting to, this README should not be read as claiming otherwise.
