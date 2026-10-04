/*
 * Mobile shell: bottom tab bar + "More" sheet.          viewport < 768px only
 *
 * Loaded on EVERY page by scripts/inject_theme.php. That is deliberate and not
 * laziness: the tab bar has to be on every mobile page, and
 * shared-components.build.js - the obvious host - is only on 40 of the 46 root
 * pages, so six pages would have silently had no navigation at all. Injecting it
 * with the theme block also reaches item_page.php and the 28,870 generated item
 * pages.
 *
 * Deliberately plain DOM with no React dependency, for the same reason: it must
 * work on a page that never mounts React.
 *
 * It reuses what already exists rather than duplicating it:
 *   - the link targets mirror NAV_TOOL_LINKS / NAV_CATEGORY_LINKS /
 *     NAV_DRAWER_EXTRA_LINKS in shared-components.jsx;
 *   - "new chat" dispatches cs2:home-reset, the event the navbar logo already
 *     uses for exactly this;
 *   - the theme toggle calls window.CS2React.applyThemeChoice when it is there,
 *     so the site's own theme system stays the single source of truth.
 */
(function () {
  "use strict";

  if (window.__cspriceMobileShell) return;
  window.__cspriceMobileShell = true;

  var MOBILE = "(max-width: 767px)";

  /* ---- icons: exactly the SVG paths the spec specifies ------------------- */
  var ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    chart: '<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    chevronRight: '<path d="M9 6l6 6-6 6"/>',
    chevronLeft: '<path d="M15 6l-6 6 6 6"/>',
    cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
    gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13M12 8S10 3 7.5 4 8 8 12 8zM12 8s2-5 4.5-4S16 8 12 8z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    // Skin Crafter's tab mark: a wrench over a screwdriver. Stroke-only like the
    // rest of this set - the filled tile icon in assets/icons/sections is a
    // different drawing for a different size.
    tools: '<path d="M14.5 6.5a3.5 3.5 0 0 0 4.6 4.6l-7.8 7.8a2 2 0 0 1-2.8-2.8z"/><path d="M4 6l3 3M6.5 3.5 10 7l-1.5 1.5L5 5z"/><path d="m16 15 5 5"/>',
    gun: '<path d="M3 8h15l2 2v2h-6l-1 2h-3l-1.2 5H5.5l1.2-5H4z"/>',
    sticker: '<path d="M4 4h16v10l-6 6H4z"/><path d="M14 20v-6h6"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
    capsule: '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8v8"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
  };

  // The sheet's tiles and category rows use the site's own Font Awesome classes
  // rather than hand-drawn SVGs, so they match what the desktop nav shows. The
  // tab bar keeps its inline SVGs: those five are app-level navigation with no
  // desktop counterpart, and they must render even where Font Awesome is not
  // loaded.
  function glyph(cls) {
    return '<i class="' + cls + '" aria-hidden="true"></i>';
  }

  // A tile's mark. Site artwork is drawn as a CSS mask rather than an <img> so
  // it takes var(--accent) like the Font Awesome glyphs beside it - an <img>
  // would render its own white and stand out, and a filter chain cannot hit an
  // arbitrary token colour. Mask works for the PNG too, since it reads alpha.
  /* Icon files are served max-age=1209600 (14 days) and the tile URLs carry no
     cache tag, so replacing an icon in place left returning visitors on the old
     artwork for a fortnight - which is exactly what happened to the Cache mark
     on 2026-10-03. Rather than hand-versioning each path, reuse the version
     this very script was loaded under: inject_theme.php already stamps it as
     `react/mobile-shell.js?v=SHELL_VERSION`, and any icon change ships with a
     shell bump anyway, so the two can never drift. */
  var ICON_VER = (function () {
    try {
      var src = (document.currentScript && document.currentScript.src) || "";
      if (!src) {
        var tags = document.querySelectorAll('script[src*="mobile-shell.js"]');
        src = tags.length ? tags[tags.length - 1].src : "";
      }
      var m = /[?&]v=([^&]+)/.exec(src);
      return m ? m[1] : "";
    } catch (e) {
      return "";
    }
  })();

  function iconUrl(path) {
    return ICON_VER ? path + "?v=" + ICON_VER : path;
  }

  function tileIcon(tile) {
    var size = tile.size === "lg" ? " is-lg" : "";
    // `art` is full-colour artwork drawn as an <img>, not a mask: the Cache
    // collection star has to keep its red/gold and its CAChE lettering, and a
    // mask would flatten all of that to one flat colour. `img` stays a mask so
    // those marks take the same white as the glyphs beside them.
    if (tile.art) {
      return '<img class="mshell-art' + size + '" src="' + iconUrl(tile.art) + '" alt="" aria-hidden="true">';
    }
    if (tile.img) {
      return '<span class="mshell-ico' + size + '" aria-hidden="true" style="--mshell-ico-src:url(&quot;'
        + iconUrl(tile.img) + '&quot;)"></span>';
    }
    return glyph(tile.icon);
  }

  // 42 of the 47 root pages load Font Awesome, but five do not - and one of them
  // is watchlist.html, which the Saved tab links to, so the sheet would open
  // there with nine blank tiles. Rather than add a CDN stylesheet to every page
  // (the site is already slow on mobile), pull it in once, on the first sheet
  // open, and only where it is actually missing.
  function ensureIconFont() {
    try {
      if (document.querySelector('link[href*="font-awesome"]')) return;
      if (document.getElementById("mshell-fa")) return;
      var link = document.createElement("link");
      link.id = "mshell-fa";
      link.rel = "stylesheet";
      link.crossOrigin = "anonymous";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css";
      document.head.appendChild(link);
    } catch (e) { /* the sheet still works, just without glyphs */ }
  }

  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  }

  /* ---- which game, which page ------------------------------------------- */
  // TF2 pages must not send a visitor to CS2 pages; shared-components.jsx makes
  // the same split for the same reason.
  function game() {
    try {
      return document.documentElement.getAttribute("data-game") === "tf2" ? "tf2" : "cs2";
    } catch (e) {
      return "cs2";
    }
  }

  // Clean URLs are real folders (/deals/), so the page name is the last path
  // segment, with the root and a bare folder both meaning index.
  function pageName() {
    var path;
    try {
      path = String(window.location.pathname || "/");
    } catch (e) {
      return "index.html";
    }
    var last = path.replace(/\/+$/, "").split("/").pop() || "";
    if (!last) return game() === "tf2" ? "tf2.html" : "index.html";
    if (/\.(html|php)$/i.test(last)) return last;
    return last + ".html";
  }

  function homeHref() {
    return game() === "tf2" ? "tf2.html" : "index.html";
  }

  // Order is deliberate: AI sits in the middle of the five (owner, 2026-10-02),
  // which is the thumb's resting position on a phone and the tab this site is
  // built around. Saved was swapped out for Skin Crafter at the same time.
  // Skin Crafter is cs2Only for the same reason Saved was: tf2price.eu has no
  // skin-crafter.html, so on TF2 the row falls back to four tabs.
  var ALL_TABS = [
    { id: "market", icon: "chart", label: "Market", href: function () { return game() === "tf2" ? "tf2-market.html" : "roi.html"; } },
    // Search replaces Deals on the bar (owner, 2026-10-03). Deals is still one
    // tap away as the first tile in the More sheet. tf2price.eu has no
    // catalog-items.html, so TF2 keeps the Deals tab instead of losing the slot.
    { id: "search", icon: "search", label: "Search", href: function () { return "catalog-items.html"; }, cs2Only: true },
    { id: "ai", icon: "chat", label: "AI", href: homeHref },
    // Deals took the Crafter slot (owner, 2026-10-03). Skin Crafter is still in
    // the More sheet; Deals works on both sites, so it needs no game guard.
    { id: "deals", icon: "tag", label: "Deals", href: function () { return game() === "tf2" ? "tf2-deals.html" : "deals.html"; } },
    { id: "more", icon: "grid", label: "More", href: null }
  ];

  // TF2 lives on its own site (tf2price.eu) built from the same source, so this
  // shell runs there too - and that site has no watchlist.html, no login.html and
  // none of the CS2 catalogue. Anything CS2-only is dropped rather than left to
  // 404: measured on the live TF2 site, the unfiltered version gave a dead Saved
  // tab, 5 dead tiles of 9, and all 17 dead category rows.
  function tabs() {
    var tf2 = game() === "tf2";
    return ALL_TABS.filter(function (t) { return !(tf2 && t.cs2Only) && !(!tf2 && t.tf2Only); });
  }

  /* Publish the current page on <html> so CSS can target one page without a
     stylesheet per page. The shell already computes pageName() for the tab
     bar, so this costs one attribute and keeps page-specific mobile rules in
     mobile-shell.css, which loads everywhere, rather than in a sheet that only
     index.html pulls in. */
  // Re-points aria-current at whichever tab the current page belongs to.
  function refreshActiveTab() {
    if (!refs.bar) return;
    var current = activeTabId();
    var nodes = refs.bar.querySelectorAll(".mshell-tab");
    var list = tabs();
    for (var i = 0; i < nodes.length && i < list.length; i += 1) {
      if (list[i].id === current) nodes[i].setAttribute("aria-current", "page");
      else nodes[i].removeAttribute("aria-current");
    }
    // The search panel borrows the highlight while it is open; do not fight it.
    if (refs.searchOpen && refs.searchTab) refs.searchTab.setAttribute("aria-current", "page");
  }

  function markPage() {
    try {
      document.documentElement.setAttribute("data-page", pageName());
    } catch (e) { /* nothing to scope by; the rules simply will not match */ }
  }

  /* The Search tab lands on the catalogue with an empty field, so put the caret
     in it (owner, 2026-10-03). Only on phones, only on that page, and never
     when the visitor arrived with a query already in the URL - stealing focus
     from someone who is reading results is worse than one extra tap.
     preventScroll keeps the page from jumping to the field on open. */
  function autofocusSearch() {
    if (pageName() !== "catalog-items.html") return;
    try {
      if (!window.matchMedia(MOBILE).matches) return;
    } catch (e) { return; }
    try {
      if (new URLSearchParams(window.location.search).get("q")) return;
    } catch (e) { /* unparsable query: treat as empty */ }
    var tries = 0;
    var timer = window.setInterval(function () {
      var field = document.querySelector(".collections-search-wrap input");
      tries += 1;
      if (field) {
        window.clearInterval(timer);
        try { field.focus({ preventScroll: true }); } catch (e) { field.focus(); }
      } else if (tries > 40) {
        window.clearInterval(timer);
      }
    }, 100);
  }

  function activeTabId() {
    // The AI home is the one page that can be reached by a path the URL check
    // cannot read: at a sub-path root like /csgo_price_tracker/ the last segment
    // is the folder name, not "index". The page marks itself with body.page-home,
    // so ask the page rather than infer it from the URL.
    try {
      if (document.body && document.body.classList.contains("page-home")) return "ai";
    } catch (e) { /* fall through to the path check */ }

    var page = pageName();
    if (page === "index.html" || page === "tf2.html") return "ai";
    if (page === "roi.html" || page === "tf2-market.html" || page === "carepackage.html") return "market";
    if (page === "deals.html" || page === "tf2-deals.html" || page === "tf2-drops.html") return "deals";
    if (page === "catalog-items.html") return "search";

    // Everything else is reached through the More sheet - the catalogue pages,
    // the weapon categories, the account pages - so More is the honest answer
    // rather than leaving the bar with nothing lit. Before this, any page
    // outside the four above showed no current-page marker at all (owner,
    // 2026-10-03). Note "saved" used to be returned for watchlist.html; that
    // tab no longer exists, so the mapping was dead and watchlist lit nothing.
    return "more";
  }

  /* ---- the sheet's contents, mirroring the sidebar groups ---------------- */
  // stickers.html is the CAPSULES entry - it lists the capsules stickers come
  // out of - and the sticker CATALOGUE is catalog-items.html?section=stickers.
  // shared-components.jsx calls this out explicitly; they are easy to swap.
  // `img` is the site's own artwork and wins over `icon` (Font Awesome). Four of
  // these are the exact files the desktop nav uses, which is what the owner
  // asked for - ak47.svg is what PC shows for rifles/skins, sticker-navi.png is
  // its stickers mark, collection.svg its collections star. The other four are
  // drawn to match because the desktop has no icon for them: it renders Cases,
  // Capsules, Care Package and Market Explorer as plain text links.
  //
  // These carry a LEADING SLASH while the hrefs above do not, and the asymmetry
  // is load-bearing. An href is resolved by the document, which has
  // <base href="/">, so "deals.html" works from any depth. A url() inside a CSS
  // custom property is NOT: it is resolved against the stylesheet that USES it,
  // i.e. styles/css/mobile-shell.css - so "assets/..." became
  // /styles/css/assets/... and 404'd, and because the mask span still paints its
  // own background every tile came out a solid accent square. Root-absolute is
  // immune to both the stylesheet's location and the page's depth.
  var CS2_TILES = [
    { icon: "fa-solid fa-tags", label: "Deals", href: function () { return game() === "tf2" ? "tf2-deals.html" : "deals.html"; } },
    { img: "/assets/icons/sections/skin-crafter-tools.svg", label: "Skin Crafter", href: function () { return "skin-crafter.html"; } },
    { img: "/assets/icons/sections/carepackage-drop.svg", label: "Care Package", href: function () { return game() === "tf2" ? "tf2-drops.html" : "carepackage.html"; } },
    { icon: "fa-solid fa-chart-column", label: "Market Explorer", href: function () { return game() === "tf2" ? "tf2-market.html" : "roi.html"; } },
    { img: "/assets/icons/equipment/ak47.svg", label: "Skins", size: "lg", href: function () { return "skins.html"; } },
    { img: "/assets/icons/sections/sticker-navi.png", label: "Stickers", href: function () { return "catalog-items.html?section=stickers"; } },
    { img: "/assets/icons/sections/case-silhouette.png", label: "Cases", href: function () { return "cases.html"; } },
    { img: "/assets/icons/sections/capsule-silhouette.png", label: "Capsules", href: function () { return "stickers.html"; } },
    { art: "/assets/icons/sections/collection-cache.png", label: "Collections", size: "lg", href: function () { return "collections.html"; } }
  ];

  // The TF2 equivalents. Every href here is a page that exists on tf2price.eu:
  // the three tools, a panel for the categories, and the five biggest categories
  // as direct links. Categories are tf2-market.html?cat=<slug>, which is how the
  // desktop nav reaches them too.
  var TF2_TILES = [
    { icon: "fa-solid fa-tags", label: "Deals", href: function () { return "tf2-deals.html"; } },
    { icon: "fa-solid fa-gift", label: "Drop Package", href: function () { return "tf2-drops.html"; } },
    { icon: "fa-solid fa-chart-line", label: "Market Explorer", href: function () { return "tf2-market.html"; } },
    { icon: "fa-solid fa-layer-group", label: "Categories", panel: "cats" },
    { icon: "fa-solid fa-shirt", label: "Cosmetic", href: function () { return "tf2-market.html?cat=cosmetic"; } },
    { icon: "fa-solid fa-khanda", label: "Melee", href: function () { return "tf2-market.html?cat=melee"; } },
    { icon: "fa-solid fa-gun", label: "Primary", href: function () { return "tf2-market.html?cat=primary"; } },
    { icon: "fa-solid fa-crosshairs", label: "Secondary", href: function () { return "tf2-market.html?cat=secondary"; } },
    { icon: "fa-solid fa-box-open", label: "Crates", href: function () { return "tf2-market.html?cat=crate"; } }
  ];

  function tiles() {
    return game() === "tf2" ? TF2_TILES : CS2_TILES;
  }

  // The second level. The spec fixes the nine tiles above, which leaves the
  // sidebar's Other and extra groups with nowhere to live - and the spec also
  // requires every sidebar link to stay reachable from the sheet. So they are
  // grouped here under their own headings rather than being dropped.
  var CS2_GROUPS = [
    {
      heading: null,
      links: [
        { label: "Knives", href: "knives.html", icon: "fa-solid fa-khanda" },
        { label: "Gloves", href: "gloves.html", icon: "fa-solid fa-mitten" },
        { label: "Rifles", href: "rifles.html", icon: "fa-solid fa-bolt" },
        { label: "Pistols", href: "pistols.html", icon: "fa-solid fa-gun" },
        { label: "SMGs", href: "smgs.html", icon: "fa-solid fa-burst" },
        { label: "Heavy", href: "heavy.html", icon: "fa-solid fa-fire" },
        { label: "All skins", href: "catalog-items.html?section=weapons", icon: "fa-solid fa-list" }
      ]
    },
    {
      heading: "Other",
      links: [
        { label: "Agents", href: "agents.html", icon: "fa-solid fa-user-secret" },
        { label: "Charms", href: "charms.html", icon: "fa-solid fa-link" },
        { label: "Patches", href: "patches.html", icon: "fa-solid fa-certificate" },
        { label: "Graffiti", href: "graffiti.html", icon: "fa-solid fa-spray-can" },
        { label: "Pins", href: "pins.html", icon: "fa-solid fa-thumbtack" },
        { label: "Music Kits", href: "music.html", icon: "fa-solid fa-music" }
      ]
    },
    {
      heading: "Tools",
      links: [
        { label: "Armory", href: "armory.html", icon: "fa-solid fa-shield-halved" },
        { label: "Database", href: "stats-db.html", icon: "fa-solid fa-database" },
        { label: "Market Data", href: "data.html", icon: "fa-solid fa-chart-column" },
        { label: "3D Viewer", href: "viewer3d.html", icon: "fa-solid fa-cubes" }
      ]
    }
  ];

  // The full TF2 category list, same slugs the desktop nav uses.
  var TF2_GROUPS = [
    {
      heading: null,
      links: [
        { label: "Cosmetic", href: "tf2-market.html?cat=cosmetic", icon: "fa-solid fa-shirt" },
        { label: "Melee", href: "tf2-market.html?cat=melee", icon: "fa-solid fa-khanda" },
        { label: "Primary", href: "tf2-market.html?cat=primary", icon: "fa-solid fa-gun" },
        { label: "Secondary", href: "tf2-market.html?cat=secondary", icon: "fa-solid fa-crosshairs" },
        { label: "Tool", href: "tf2-market.html?cat=tool", icon: "fa-solid fa-screwdriver-wrench" }
      ]
    },
    {
      heading: "More",
      links: [
        { label: "Crates", href: "tf2-market.html?cat=crate", icon: "fa-solid fa-box-open" },
        { label: "War Paint", href: "tf2-market.html?cat=war_paint", icon: "fa-solid fa-brush" },
        { label: "Taunts", href: "tf2-market.html?cat=taunt", icon: "fa-solid fa-masks-theater" },
        { label: "Packages", href: "tf2-market.html?cat=package", icon: "fa-solid fa-boxes-stacked" },
        { label: "Craft Items", href: "tf2-market.html?cat=craft_item", icon: "fa-solid fa-hammer" },
        { label: "Gifts", href: "tf2-market.html?cat=gift", icon: "fa-solid fa-gift" },
        { label: "Strange Parts", href: "tf2-market.html?cat=strange_part", icon: "fa-solid fa-puzzle-piece" },
        { label: "Party Favors", href: "tf2-market.html?cat=party_favor", icon: "fa-solid fa-star" },
        { label: "Usable Items", href: "tf2-market.html?cat=usable_item", icon: "fa-solid fa-wand-magic" },
        { label: "Supply Crates", href: "tf2-market.html?cat=supply_crate", icon: "fa-solid fa-box" }
      ]
    }
  ];

  function groups() {
    return game() === "tf2" ? TF2_GROUPS : CS2_GROUPS;
  }

  function panelTitle() {
    return game() === "tf2" ? "Categories" : "Skins";
  }

  /* ---- theme ------------------------------------------------------------ */
  function resolvedTheme() {
    try {
      return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    } catch (e) {
      return "light";
    }
  }

  function setTheme(next) {
    // The site's own theme kit owns this; only fall back if it is absent.
    try {
      if (window.CS2React && typeof window.CS2React.applyThemeChoice === "function") {
        window.CS2React.applyThemeChoice(next, { animate: true });
        return;
      }
    } catch (e) { /* fall through */ }
    try {
      window.localStorage.setItem("csprice-theme", next);
    } catch (e) { /* private mode */ }
    try {
      document.documentElement.setAttribute("data-theme", next);
      document.documentElement.style.colorScheme = next;
    } catch (e) { /* nothing else to try */ }
  }

  /* ---- building --------------------------------------------------------- */
  var refs = {
    bar: null, sheet: null, scrim: null, moreTab: null, open: false, level: "root", lastFocus: null,
    searchTab: null, search: null, searchScrim: null, searchInput: null, searchList: null,
    searchOpen: false, searchTimer: null, searchAbort: null, searchSeq: 0, searchPicks: null
  };

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function buildBar() {
    var nav = el("nav", "mshell-tabbar");
    nav.setAttribute("aria-label", "Main");
    var active = activeTabId();

    tabs().forEach(function (tab) {
      var node;
      if (tab.id === "more") {
        node = el("button", "mshell-tab");
        node.type = "button";
        node.setAttribute("aria-expanded", "false");
        node.setAttribute("aria-haspopup", "dialog");
        node.addEventListener("click", function () { toggleSheet(); });
        // More can be the current tab too, for every page that lives in the
        // sheet rather than on the bar. This used to sit only in the <a> branch
        // below, so the button could never be marked current no matter what
        // activeTabId returned - the catch-all was unreachable until this line.
        if (tab.id === active) node.setAttribute("aria-current", "page");
        refs.moreTab = node;
      } else {
        node = el("a", "mshell-tab");
        node.href = tab.href();
        if (tab.id === active) node.setAttribute("aria-current", "page");
        if (tab.id === "search") {
          // Search opens over whatever you are reading instead of taking you to
          // a page of its own (owner, 2026-10-03). Kept as a real <a> so the
          // link still works if this script never runs, and so long-press and
          // "open in new tab" still offer the full page.
          //
          // The handler itself is on WINDOW, in the capture phase, in
          // watchSearchTab() - a listener on this element cannot win. The
          // soft-navigation handler in shared-components claims link clicks
          // before any element-level listener runs, so preventDefault here was
          // too late and the tab both opened the panel and navigated away.
          refs.searchTab = node;
        }
        if (tab.id === "ai" && active === "ai") {
          // Already on the AI home: start a new chat instead of a no-op reload.
          // cs2:home-reset is the event the navbar logo already dispatches.
          node.addEventListener("click", function (event) {
            event.preventDefault();
            closeSheet();
            try {
              window.dispatchEvent(new CustomEvent("cs2:home-reset"));
            } catch (e) {
              window.location.href = tab.href();
            }
          });
        }
      }
      node.innerHTML = svg(tab.icon) + '<span class="mshell-tab-label">' + tab.label + "</span>";
      nav.appendChild(node);
    });

    return nav;
  }

  function tileNode(tile) {
    var node;
    if (tile.panel) {
      node = el("button", "mshell-sheet-tile");
      node.type = "button";
      node.addEventListener("click", function () { showLevel(tile.panel); });
    } else {
      node = el("a", "mshell-sheet-tile");
      node.href = tile.href();
    }
    node.innerHTML = tileIcon(tile) + "<span>" + tile.label + "</span>";
    return node;
  }

  function rootLevel() {
    var frag = document.createDocumentFragment();

    /* No visible "Explore CSPRICE" heading (owner, 2026-10-03) - the tiles say
       what the sheet is. The accessible name is still set on the dialog itself
       in showLevel(), so screen readers keep the label the heading used to
       carry; dropping the <h2> only removes the duplicate on screen. */

    var grid = el("div", "mshell-tiles");
    tiles().forEach(function (tile) { grid.appendChild(tileNode(tile)); });
    frag.appendChild(grid);

    var list = el("div", "mshell-list");

    var project = el("button", "mshell-row");
    project.type = "button";
    project.innerHTML = svg("folder") + '<span class="mshell-row-label">New project</span>' + svg("chevronRight");
    project.addEventListener("click", function () {
      closeSheet();
      if (activeTabId() === "ai") {
        try {
          window.dispatchEvent(new CustomEvent("csprice:new-project"));
          return;
        } catch (e) { /* fall through to navigation */ }
      }
      // Same wait as the sheet's links, so this row animates out like they do
      // instead of leaving the moment it is tapped.
      var target = homeHref() + "?project=new";
      if (sheetExitMs()) window.setTimeout(function () { window.location.href = target; }, sheetExitMs());
      else window.location.href = target;
    });
    list.appendChild(project);

    // Accounts live on csprice only; tf2price has no login.html, so the row is
    // left out there rather than pointing at a 404.
    // "Profile", not "Settings" (owner, 2026-10-03). login.html has always been
    // the account page - signed out it offers Steam/Google/Discord, signed in it
    // is the profile dashboard with the avatar and inventory - so "Settings"
    // promised a preferences screen that does not exist. The one real setting in
    // the sheet, dark mode, is the row right below this one.
    if (game() !== "tf2") {
      var profile = el("a", "mshell-row");
      // The profile panel, not login.html (owner, 2026-10-03). login.html opens
      // on the inventory dashboard - total value, item grid, Export to Excel -
      // which is not what "Profile" promises. ?panel=profile is the screen with
      // the avatar, the username field and the account rows.
      profile.href = "index.html?panel=profile";
      profile.innerHTML = svg("person") + '<span class="mshell-row-label">Profile</span>' + svg("chevronRight");
      list.appendChild(profile);
    }

    var darkRow = el("div", "mshell-row");
    darkRow.innerHTML = svg("moon") + '<span class="mshell-row-label">Dark mode</span>';
    var toggle = el("button", "mshell-switch");
    toggle.type = "button";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-label", "Dark mode");
    toggle.setAttribute("aria-checked", resolvedTheme() === "dark" ? "true" : "false");
    toggle.addEventListener("click", function () {
      var next = resolvedTheme() === "dark" ? "light" : "dark";
      setTheme(next);
      toggle.setAttribute("aria-checked", next === "dark" ? "true" : "false");
    });
    darkRow.appendChild(toggle);
    list.appendChild(darkRow);

    frag.appendChild(list);
    return frag;
  }

  function skinsLevel() {
    var frag = document.createDocumentFragment();

    var head = el("div", "mshell-sheet-head");
    var back = el("button", "mshell-sheet-back", svg("chevronLeft"));
    back.type = "button";
    back.setAttribute("aria-label", "Back");
    back.addEventListener("click", function () { showLevel("root"); });
    head.appendChild(back);
    head.appendChild(el("h2", "mshell-sheet-title", panelTitle()));
    frag.appendChild(head);

    groups().forEach(function (group) {
      if (group.heading) {
        frag.appendChild(el("p", "u-label mshell-group-label", group.heading));
      }
      var list = el("div", "mshell-list");
      group.links.forEach(function (link) {
        var row = el("a", "mshell-row");
        row.href = link.href;
        row.innerHTML = glyph(link.icon) + '<span class="mshell-row-label">' + link.label
          + "</span>" + svg("chevronRight");
        list.appendChild(row);
      });
      frag.appendChild(list);
    });

    return frag;
  }

  function showLevel(level) {
    refs.level = level;
    if (!refs.sheet) return;
    refs.sheet.innerHTML = "";
    refs.sheet.appendChild(el("span", "mshell-handle"));
    refs.sheet.appendChild(level === "root" ? rootLevel() : skinsLevel());
    refs.sheet.setAttribute("aria-label", level === "root" ? "Explore" : panelTitle());
    focusFirst();
  }

  function buildSheet() {
    var scrim = el("div", "mshell-scrim");
    scrim.addEventListener("click", function () { closeSheet(); });

    var sheet = el("div", "mshell-sheet");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.hidden = true;
    scrim.hidden = true;

    // Tapping anything in the sheet used to leave it standing wide open while
    // the next page came in, so it never animated out. Close it on the way,
    // which slides it back down into the tab bar as the new page arrives.
    //
    // Deliberately only closeSheet() - no preventDefault, no deferred
    // location.href. shared-components installs a document-level soft-navigation
    // handler that claims same-origin link clicks and swaps the page WITHOUT a
    // reload, so the document (and this sheet) survives the navigation and has
    // to close itself. Taking the click away from that handler would force a
    // full page load instead, which is slower and loses the soft transition.
    //
    // CAPTURE phase for the same reason: the soft-nav handler sits on document
    // and calls preventDefault, and the first version of this listener used the
    // bubble phase and a defaultPrevented early-out, so it never ran at all.
    sheet.addEventListener("click", function (event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!link || !sheet.contains(link)) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;
      // In-page anchors and non-navigating schemes leave the sheet where it is.
      var raw = link.getAttribute("href") || "";
      if (!raw || raw.charAt(0) === "#" || /^(mailto:|tel:|javascript:)/i.test(raw)) return;
      closeSheet();
    }, true);

    // Swipe down to dismiss.
    var startY = null;
    sheet.addEventListener("touchstart", function (event) {
      startY = event.touches && event.touches.length ? event.touches[0].clientY : null;
    }, { passive: true });
    sheet.addEventListener("touchmove", function (event) {
      if (startY == null || !event.touches || !event.touches.length) return;
      var dy = event.touches[0].clientY - startY;
      // Only when the sheet is already scrolled to the top, so a downward swipe
      // in a scrolled list scrolls rather than closing.
      if (dy > 60 && sheet.scrollTop <= 0) {
        startY = null;
        closeSheet();
      }
    }, { passive: true });

    refs.scrim = scrim;
    refs.sheet = sheet;
    return [scrim, sheet];
  }

  /* ---- open / close, focus trap ---------------------------------------- */
  function focusable() {
    if (!refs.sheet) return [];
    return Array.prototype.filter.call(
      refs.sheet.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function (node) { return node.offsetParent !== null; }
    );
  }

  function focusFirst() {
    var list = focusable();
    if (list.length) list[0].focus();
  }

  function onKeydown(event) {
    if (!refs.open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeSheet();
      return;
    }
    if (event.key !== "Tab") return;
    var list = focusable();
    if (!list.length) return;
    var first = list[0];
    var last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openSheet() {
    if (refs.open || !refs.sheet) return;
    refs.open = true;
    refs.lastFocus = document.activeElement;
    ensureIconFont();
    refs.scrim.hidden = false;
    refs.sheet.hidden = false;
    showLevel("root");
    // Reading a layout property flushes the off-screen starting position, so the
    // transition still runs when the class goes on in the same tick.
    //
    // Deliberately NOT requestAnimationFrame: it is throttled to nothing while
    // the tab is hidden or backgrounded, which left the sheet reporting itself
    // open while still translated off-screen - open but invisible, with focus
    // trapped inside it.
    void refs.sheet.offsetHeight;
    refs.scrim.classList.add("is-open");
    refs.sheet.classList.add("is-open");
    if (refs.moreTab) {
      refs.moreTab.setAttribute("aria-expanded", "true");
      refs.moreTab.classList.add("is-active");
    }
    document.addEventListener("keydown", onKeydown, true);
  }

  // How long to let the slide-down run before leaving the page. Must stay under
  // the 250ms transition in mobile-shell.css so the navigation starts as the
  // sheet lands rather than after a visible pause. Under prefers-reduced-motion
  // that stylesheet sets transition:none, so there is nothing to wait for and a
  // delay would just be a stall.
  function sheetExitMs() {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
    } catch (e) { /* no matchMedia: animate */ }
    return 240;
  }

  function closeSheet() {
    if (!refs.open || !refs.sheet) return;
    refs.open = false;
    refs.scrim.classList.remove("is-open");
    refs.sheet.classList.remove("is-open");
    if (refs.moreTab) {
      refs.moreTab.setAttribute("aria-expanded", "false");
      refs.moreTab.classList.remove("is-active");
    }
    document.removeEventListener("keydown", onKeydown, true);
    var sheet = refs.sheet;
    var scrim = refs.scrim;
    window.setTimeout(function () {
      if (refs.open) return;          // reopened during the transition
      sheet.hidden = true;
      scrim.hidden = true;
    }, 260);
    try {
      if (refs.lastFocus && refs.lastFocus.focus) refs.lastFocus.focus();
    } catch (e) { /* element gone */ }
  }

  function toggleSheet() {
    if (refs.open) closeSheet();
    else openSheet();
  }

  /* ---- keyboard visibility --------------------------------------------- */
  // The bar would otherwise sit halfway up the screen above the on-screen
  // keyboard. visualViewport shrinking by a meaningful amount is the only
  // reliable signal; a small change is browser chrome, not a keyboard.
  function watchKeyboard() {
    var vv = window.visualViewport;
    if (!vv) return;
    var base = vv.height;
    function onResize() {
      var shrunk = base - vv.height;
      document.body.classList.toggle("mshell-keyboard", shrunk > 140);
      if (shrunk <= 0) base = vv.height;
    }
    vv.addEventListener("resize", onResize);
  }

  /* ---- mount / unmount at the breakpoint ------------------------------- */
  // The bar's height is the offset for the scrim, the sheet and the AI composer.
  // mobile-shell.css carries a 71px estimate as the pre-JS fallback, but the real
  // height depends on the label's rendered line box - it measures 75px, which left
  // the scrim overlapping the bar by 4px. So measure it and publish the truth.
  function publishBarHeight() {
    if (!refs.bar) return;
    var h = Math.round(refs.bar.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty("--mshell-tabbar-h", h + "px");
  }

  /* ---- search overlay ---------------------------------------------------- *
     Search is a panel over the current page rather than a destination. It talks
     to the same search_items.php the full screen uses: ?q= for a typed search,
     ?random=N for the suggestions shown before anything is typed. Recents share
     catalog-items-page.jsx's localStorage key, so the two stay in step.        */

  var SEARCH_RECENT_KEY = "csprice-recent-searches";
  var SEARCH_RECENT_MAX = 8;
  var SEARCH_DEBOUNCE_MS = 220;

  function searchReadRecents() {
    try {
      var list = JSON.parse(window.localStorage.getItem(SEARCH_RECENT_KEY) || "[]");
      if (!Array.isArray(list)) return [];
      return list.filter(function (v) { return typeof v === "string" && v.trim(); }).slice(0, SEARCH_RECENT_MAX);
    } catch (e) { return []; }
  }

  function searchRemember(query) {
    var q = String(query || "").trim();
    if (!q) return;
    try {
      var next = [q].concat(searchReadRecents().filter(function (v) {
        return v.toLowerCase() !== q.toLowerCase();
      }));
      window.localStorage.setItem(SEARCH_RECENT_KEY, JSON.stringify(next.slice(0, SEARCH_RECENT_MAX)));
    } catch (e) { /* private mode: recents just do not persist */ }
  }

  // The site's own last-resort item URL. Deliberately not the pretty /skins/x/
  // path: resolving that needs assets/data/item-url-index.json, 1.3 MB that the
  // shell would then be loading on every page for a panel most visits never
  // open. item_page.php redirects to the pretty URL itself.
  function searchItemHref(item) {
    var name = String(item.market_hash_name || "").trim();
    if (!name) return "#";
    var params = new URLSearchParams({
      lookup_name: name,
      display_name: String(item.display_name || name)
    });
    return "item_page.php?" + params.toString();
  }

  function searchSubtitle(item) {
    var bits = [];
    if (item.type_note) bits.push(String(item.type_note));
    else if (item.category) bits.push(String(item.category));
    if (item.selected_wear) bits.push(String(item.selected_wear));
    return bits.join(", ");
  }

  function searchPrice(item) {
    var value = Number(item.seed_sell_price);
    if (!Number.isFinite(value) || value <= 0) return "";
    try {
      return value.toLocaleString(undefined, { style: "currency", currency: "EUR" });
    } catch (e) {
      return "€" + value.toFixed(2);
    }
  }

  function searchRowNode(item) {
    var row = el("a", "mshell-sresult");
    row.href = searchItemHref(item);
    var img = el("span", "mshell-sresult-media");
    if (item.image) {
      var pic = document.createElement("img");
      pic.src = String(item.image);
      pic.alt = "";
      pic.loading = "lazy";
      img.appendChild(pic);
    }
    var body = el("span", "mshell-sresult-body");
    body.appendChild(el("span", "mshell-sresult-name", String(item.display_name || item.market_hash_name || "")));
    var sub = searchSubtitle(item);
    if (sub) body.appendChild(el("span", "mshell-sresult-sub", sub));
    row.appendChild(img);
    row.appendChild(body);
    var price = searchPrice(item);
    if (price) row.appendChild(el("span", "mshell-sresult-price", price));
    return row;
  }

  function searchSetList(label, items, emptyNote) {
    if (!refs.searchList) return;
    refs.searchList.innerHTML = "";
    // A heading over nothing reads as broken, and an empty list is the normal
    // state while the first request is in flight - or when the device gate
    // refuses search_items.php outright. Only label a list that has rows.
    if (!items.length) {
      if (emptyNote) refs.searchList.appendChild(el("p", "mshell-snote", emptyNote));
      return;
    }
    if (label) refs.searchList.appendChild(el("p", "u-label mshell-slabel", label));
    var list = el("div", "mshell-slist");
    items.forEach(function (item) { list.appendChild(searchRowNode(item)); });
    refs.searchList.appendChild(list);
  }

  function searchShowIdle() {
    var recents = searchReadRecents();
    if (recents.length) {
      if (!refs.searchList) return;
      refs.searchList.innerHTML = "";
      refs.searchList.appendChild(el("p", "u-label mshell-slabel", "Recent"));
      var list = el("div", "mshell-slist");
      recents.forEach(function (term) {
        var row = el("button", "mshell-srecent");
        row.type = "button";
        row.innerHTML = svg("search") + "<span>" + term.replace(/[<>&]/g, "") + "</span>";
        row.addEventListener("click", function () {
          refs.searchInput.value = term;
          runSearch(term);
        });
        list.appendChild(row);
      });
      refs.searchList.appendChild(list);
      return;
    }
    if (refs.searchPicks) {
      searchSetList("Suggestions", refs.searchPicks);
      return;
    }
    searchSetList("Suggestions", []);
    searchFetch("search_items.php?random=5", function (items) {
      refs.searchPicks = items;
      if (refs.searchOpen && !refs.searchInput.value.trim()) searchSetList("Suggestions", items);
    });
  }

  function searchFetch(url, done) {
    var seq = (refs.searchSeq += 1);
    try {
      if (refs.searchAbort) refs.searchAbort.abort();
      refs.searchAbort = typeof AbortController === "function" ? new AbortController() : null;
    } catch (e) { refs.searchAbort = null; }
    var opts = { credentials: "same-origin", headers: { Accept: "application/json" } };
    if (refs.searchAbort) opts.signal = refs.searchAbort.signal;
    window.fetch(url, opts)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (payload) {
        // A slower earlier request must not overwrite a newer one's results.
        if (seq !== refs.searchSeq) return;
        var items = payload && Array.isArray(payload.items) ? payload.items : [];
        done(items);
      })
      .catch(function () { /* aborted or offline: leave what is on screen */ });
  }

  function runSearch(query) {
    var q = String(query || "").trim();
    if (!q) { searchShowIdle(); return; }
    searchFetch("search_items.php?limit=20&q=" + encodeURIComponent(q), function (items) {
      searchSetList("Results", items, "Nothing matched “" + q + "”.");
    });
  }

  function buildSearch() {
    var scrim = el("div", "mshell-scrim mshell-sscrim");
    scrim.hidden = true;
    scrim.addEventListener("click", function () { closeSearch(); });

    var panel = el("div", "mshell-search");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Search");
    panel.hidden = true;

    var head = el("div", "mshell-sbar");
    var field = el("div", "mshell-sfield", svg("search"));
    var input = document.createElement("input");
    input.type = "search";
    input.className = "mshell-sinput";
    input.placeholder = "Search skins, cases, stickers";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Search");
    field.appendChild(input);
    var cancel = el("button", "mshell-scancel", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", function () { closeSearch(); });
    head.appendChild(field);
    head.appendChild(cancel);

    var list = el("div", "mshell-sbody");

    input.addEventListener("input", function () {
      var value = input.value;
      window.clearTimeout(refs.searchTimer);
      refs.searchTimer = window.setTimeout(function () { runSearch(value); }, SEARCH_DEBOUNCE_MS);
    });
    input.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      window.clearTimeout(refs.searchTimer);
      searchRemember(input.value);
      runSearch(input.value);
    });

    // A result is a link, so the panel has to get out of the way itself - the
    // document-level soft navigation keeps this page, and the panel with it.
    panel.addEventListener("click", function (event) {
      var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!link || !panel.contains(link)) return;
      searchRemember(input.value);
      closeSearch();
    }, true);

    panel.appendChild(head);
    panel.appendChild(list);

    refs.searchScrim = scrim;
    refs.search = panel;
    refs.searchInput = input;
    refs.searchList = list;
    return [scrim, panel];
  }

  // Window, capture phase: the first listener on the path, before the
  // document-level soft navigation can take the click. stopPropagation keeps it
  // from running at all, so nothing else tries to follow the href.
  function watchSearchTab() {
    window.addEventListener("click", function (event) {
      if (!refs.searchTab) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var hit = event.target && event.target.closest ? event.target.closest(".mshell-tab") : null;
      if (!hit || hit !== refs.searchTab) return;
      event.preventDefault();
      event.stopPropagation();
      closeSheet();
      if (refs.searchOpen) closeSearch();
      else openSearch();
    }, true);
  }

  function onSearchKeydown(event) {
    if (!refs.searchOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
    }
  }

  function openSearch() {
    if (refs.searchOpen || !refs.search) return;
    refs.searchOpen = true;
    refs.searchScrim.hidden = false;
    refs.search.hidden = false;
    refs.searchInput.value = "";
    searchShowIdle();
    void refs.search.offsetHeight;
    refs.searchScrim.classList.add("is-open");
    refs.search.classList.add("is-open");
    // The panel covers the page header, so the page's own ghost and avatar sat
    // right behind the field and the Cancel button. mobile-shell.css hides the
    // nav while this class is set - visibility, not display, so the page does
    // not reflow underneath the scrim and jump back on close.
    try { document.body.classList.add("mshell-search-open"); } catch (e) { /* ignore */ }
    if (refs.searchTab) refs.searchTab.setAttribute("aria-current", "page");
    document.addEventListener("keydown", onSearchKeydown, true);
    try { refs.searchInput.focus({ preventScroll: true }); } catch (e) { refs.searchInput.focus(); }
  }

  function closeSearch() {
    if (!refs.searchOpen || !refs.search) return;
    refs.searchOpen = false;
    window.clearTimeout(refs.searchTimer);
    refs.searchScrim.classList.remove("is-open");
    refs.search.classList.remove("is-open");
    try { document.body.classList.remove("mshell-search-open"); } catch (e) { /* ignore */ }
    // Only drop the highlight if Search is not this page's own tab anyway.
    if (refs.searchTab && activeTabId() !== "search") refs.searchTab.removeAttribute("aria-current");
    document.removeEventListener("keydown", onSearchKeydown, true);
    var panel = refs.search;
    var scrim = refs.searchScrim;
    window.setTimeout(function () {
      if (refs.searchOpen) return;
      panel.hidden = true;
      scrim.hidden = true;
    }, 260);
  }

  function mount() {
    if (refs.bar) return;
    var bar = buildBar();
    var pair = buildSheet();
    var search = buildSearch();
    document.body.appendChild(pair[0]);
    document.body.appendChild(pair[1]);
    document.body.appendChild(search[0]);
    document.body.appendChild(search[1]);
    document.body.appendChild(bar);
    refs.bar = bar;
    publishBarHeight();
    window.addEventListener("resize", publishBarHeight);
  }

  function unmount() {
    closeSheet();
    closeSearch();
    window.removeEventListener("resize", publishBarHeight);
    // Hand the variable back to the stylesheet's fallback rather than leaving a
    // phone-sized offset behind on a desktop layout.
    try {
      document.documentElement.style.removeProperty("--mshell-tabbar-h");
    } catch (e) { /* nothing to undo */ }
    [refs.bar, refs.sheet, refs.scrim, refs.search, refs.searchScrim].forEach(function (node) {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
    refs.bar = null;
    refs.sheet = null;
    refs.scrim = null;
    refs.moreTab = null;
    refs.search = null;
    refs.searchScrim = null;
    refs.searchInput = null;
    refs.searchList = null;
    refs.searchTab = null;
    // Re-fetched on the next mount: a stale pick list would be the only thing
    // surviving a breakpoint round trip.
    refs.searchPicks = null;
  }

  function sync(matches) {
    if (matches) mount();
    else unmount();
  }

  function start() {
    var mq;
    try {
      mq = window.matchMedia(MOBILE);
    } catch (e) {
      return;
    }
    markPage();
    autofocusSearch();
    // Registered once, before the bar exists: it only ever fires for the tab
    // node refs.searchTab points at, which mount()/unmount() keep current.
    watchSearchTab();

    /* Back/forward can restore a page from the bfcache with its DOM intact,
       which means the bar keeps whichever tab was current when the page was
       frozen - so stepping back from Search to Market left "Search" lit on the
       Market page. Nothing re-runs on a restore except pageshow, so that is
       where the highlight has to be refreshed. */
    window.addEventListener("pageshow", function (event) {
      // markPage unconditionally: data-page has been observed holding the
      // previous page's value after an ordinary navigation, so re-asserting it
      // here costs one attribute write and closes that gap wherever it comes
      // from. The tab highlight below still only needs the bfcache case.
      markPage();
      if (!event.persisted) return;
      refreshActiveTab();
    });

    /* A soft navigation swaps the page without a reload, so the bar built at
       mount keeps whichever tab was current then - walk from Deals to Market
       and "Deals" stayed lit on the Market page. pageshow does not fire for
       these, only for a real load or a bfcache restore, so the soft-nav event
       and popstate have to do the same job.

       Deferred by a tick: the event can arrive before the URL and the new DOM
       have settled, and activeTabId() reads both. */
    function onSoftNav() {
      // Both panels belong to the page you were on. A soft navigation keeps the
      // document, so neither closes by itself: leave the search open, tap a tab
      // or a link outside it, and it stays up over the page you just arrived
      // at. Closed first, before the deferred refresh, so the highlight is not
      // computed while the panel still claims it.
      closeSheet();
      closeSearch();
      window.setTimeout(function () {
        markPage();
        refreshActiveTab();
      }, 0);
    }
    window.addEventListener("cs2:soft-nav", onSoftNav);
    window.addEventListener("popstate", onSoftNav);
    sync(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", function (event) { sync(event.matches); });
    else if (mq.addListener) mq.addListener(function (event) { sync(event.matches); });

    // A resize fallback, because the change event is not dependable everywhere:
    // crossing the breakpoint under viewport emulation left the bar mounted at
    // 1200px. The CSS hides it there either way - so this was cosmetic rather
    // than broken - but relying on one signal for teardown is how it stops being
    // cosmetic later. Debounced, and a no-op when the state already matches.
    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () { sync(mq.matches); }, 150);
    });

    watchKeyboard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
