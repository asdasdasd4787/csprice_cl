(() => {
  // ── "View as desktop" on a phone ────────────────────────────────────────
  // ?desktop=1 widens the layout viewport to a desktop width, so a phone lays
  // the page out the way a PC does instead of taking the phone breakpoints.
  // The choice is remembered, so the rest of the visit stays desktop; ?desktop=0
  // (or the footer's own toggle, if one is ever added) puts it back.
  //
  // This bundle is on every page, generated item pages included, which is why
  // the switch lives here rather than in each page's <head>. Nothing happens on
  // a real desktop: browsers there ignore the viewport meta entirely.
  const DESKTOP_MODE_KEY = "cs2_force_desktop";
  const DESKTOP_MODE_WIDTH = 1440;

  (function applyDesktopMode() {
    let wanted = null;
    try {
      const flag = new URLSearchParams(window.location.search).get("desktop");
      if (flag === "1" || flag === "true") wanted = true;
      else if (flag === "0" || flag === "false") wanted = false;
    } catch (_error) {}

    try {
      if (wanted === null) {
        wanted = window.localStorage.getItem(DESKTOP_MODE_KEY) === "1";
      } else {
        window.localStorage.setItem(DESKTOP_MODE_KEY, wanted ? "1" : "0");
      }
    } catch (_error) {
      // Private mode / blocked storage: honour the URL for this page only.
      wanted = wanted === true;
    }

    window.CS2DesktopMode = {
      enabled: Boolean(wanted),
      width: DESKTOP_MODE_WIDTH,
    };
    if (!wanted) return;

    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "viewport");
      document.head.appendChild(meta);
    }
    // No initial-scale: the browser then picks the zoom that fits the width,
    // and user-scalable stays on so pinch-zoom still works.
    meta.setAttribute("content", `width=${DESKTOP_MODE_WIDTH}`);
  })();

  // ── Burger draw-in, once per page load ──────────────────────────────────
  // The phone burger's three bars draw themselves on when the page opens. The
  // switch is a class on <html>, not React state: the glyph re-renders for all
  // sorts of reasons (language, session, opening the drawer), and any of those
  // would otherwise cut the animation short or replay it. A plain class the
  // navbar never touches survives every one of them, and dropping it after a
  // couple of seconds means later drawer toggles do not replay the intro.
  (function armNavMenuIntro() {
    try {
      const root = document.documentElement;
      root.classList.add("cs2-nav-intro");
      window.setTimeout(() => root.classList.remove("cs2-nav-intro"), 2500);
    } catch (_error) {}
  })();

  // ── Active game: CS2 or TF2 ─────────────────────────────────────────────
  // The switcher beside the logo picks which catalogue the site is showing.
  //
  // THE PAGE DECIDES, NOT STORAGE. Every page states its own game with
  // `data-game` on <html> (the TF2 pages set data-game="tf2" in their head
  // script); anything without it is a CS2 page. An earlier version read the
  // choice from localStorage instead, and that was wrong: once a visitor had
  // been to a TF2 page, every CS2 page on the site rendered the TFPRICE
  // wordmark over CS2 content until they switched back. A page cannot lie
  // about which catalogue it is showing, so a page attribute cannot drift.
  //
  // Storage is kept only as a record of the last game visited, for code that
  // runs before this bundle does and has nothing else to read. Nothing here
  // renders from it.
  const GAME_KEY = "csprice-game";
  // The icons are 64px squares for an 18px slot, which covers 3x screens. CS2's
  // is an opaque orange/navy tile and gets its corners rounded in CSS; TF2's
  // carries its own transparency.
  const GAME_ICON_TAG = "20260927-game-icons-1";
  // `count` is the item total shown under each game in the switcher. Both are
  // baked in rather than fetched: the CS2 figure is the path count in
  // assets/data/item-url-index.json (1.3 MB — far too heavy to pull for one
  // label) and only moves on a full item rebuild. The TF2 figure moves on
  // every import, so it is refreshed from assets/data/tf2/summary.json, which
  // is 78 bytes and static — but only once the menu is actually opened, so a
  // page that never shows the switcher pays nothing. These are the fallbacks
  // if that fetch fails.
  const GAMES = {
    cs2: {
      id: "cs2",
      label: "CS2",
      fullName: "Counter-Strike 2",
      home: "index.html",
      count: 28867,
      icon: `assets/icons/games/cs2.png?v=${GAME_ICON_TAG}`,
    },
    tf2: {
      id: "tf2",
      label: "TF2",
      fullName: "Team Fortress 2",
      home: "tf2/",
      // distinct_items, not priced_items. priced_items (72,925) counts every
      // priced variant separately — each unusual effect, each war-paint wear —
      // so it read as five times CS2's catalogue when the two numbers are not
      // measuring the same thing. distinct_items folds those together, one
      // count per item, which is what CS2's 28,867 is.
      count: 33036,
      icon: `assets/icons/games/tf2.png?v=${GAME_ICON_TAG}`,
    },
  };

  function getActiveGame() {
    try {
      const declared = String(document.documentElement.getAttribute("data-game") || "").toLowerCase();
      if (GAMES[declared]) return declared;
    } catch (_error) {}
    return "cs2";
  }

  // A request to switch. The caller navigates straight after, and the
  // destination declares its own game, so this does not change what the
  // current page renders — it records the choice and tells listeners.
  function setActiveGame(game) {
    const id = GAMES[game] ? game : "cs2";
    try {
      window.localStorage.setItem(GAME_KEY, id);
    } catch (_error) {
      // Private mode: the switch still navigates, it just will not stick.
    }
    try {
      window.dispatchEvent(new CustomEvent("cs2:game-change", { detail: { game: id } }));
    } catch (_error) {}
    return id;
  }

  // Every page of the other game's catalogue is a different page, so switching
  // cannot be done in place — it lands on that game's home.
  function gameHome(game) {
    // Resolved per host: on csprice.eu the TF2 home is an absolute
    // tf2price.eu URL, on tf2price.eu it stays relative.
    return crossSiteHref((GAMES[game] || GAMES.cs2).home);
  }

  // The game switcher is the one link that carries a sign-in across the two
  // hosts: signed in, and with the other game on the other host, it goes
  // through site_handoff.php, which mints a one-time token and signs the same
  // account in over there. Every other cross-host link stays a plain link
  // (user, 2026-09-30: "the same email account transfers to tf2price but only
  // if he redirects through that button").
  function gameSwitchHref(home, authenticated) {
    const target = crossSiteHref(home);
    if (!authenticated || typeof window === "undefined") return target;
    try {
      const url = new URL(target, document.baseURI || window.location.href);
      if (url.origin === window.location.origin) return target;
      if (!isTf2PriceHost(url.hostname) && !isCsPriceHost(url.hostname)) return target;
      return `site_handoff.php?to=${encodeURIComponent(url.href)}`;
    } catch (_error) {
      return target;
    }
  }

  // Keep the stored value honest about where the visitor actually is. Without
  // this, landing on a TF2 page leaves "tf2" in storage forever, and anything
  // that falls back to storage — the AI chat does, when this bundle has not
  // loaded yet — would keep answering as TF2 on CS2 pages.
  (function recordVisitedGame() {
    try {
      window.localStorage.setItem(GAME_KEY, getActiveGame());
    } catch (_error) {}
  })();

  const { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } = React;
  const data = window.CS2ReactData;

  // The page's game, for every piece of chrome that shows the wordmark. Read
  // at mount: the chrome is not in the static HTML (it mounts from this
  // bundle), so there is no earlier paint to disagree with and no flash of the
  // wrong wordmark. In practice this value never changes within a page — a
  // switch is a navigation — but the subscription keeps all the wordmarks in
  // step if anything ever does change it in place.
  function useActiveGame() {
    const [game, setGame] = useState(getActiveGame);
    useEffect(() => {
      // Re-read the page rather than trust event.detail: the event means "a
      // switch was requested", and the request is answered by navigating. If
      // we took the detail, clicking TF2 on a CS2 page would flash the TFPRICE
      // wordmark over CS2 content for as long as the navigation takes — and
      // leave it there if the navigation never happens.
      const onChange = () => setGame(getActiveGame());
      window.addEventListener("cs2:game-change", onChange);
      return () => window.removeEventListener("cs2:game-change", onChange);
    }, []);
    return game;
  }

  // Re-renders whenever window.I18N.setLanguage() fires, so every component
  // using this hook updates in place without a page reload.
  function useI18n() {
    const [, forceTick] = useState(0);
    useEffect(() => {
      const i18n = window.I18N;
      if (!i18n?.subscribe) return undefined;
      return i18n.subscribe(() => forceTick((n) => n + 1));
    }, []);
    const i18n = window.I18N;
    return {
      t: i18n ? i18n.t : (key) => key,
      tp: i18n ? i18n.tp : (key) => key,
      formatNumber: i18n ? i18n.formatNumber : (n) => String(n),
      language: i18n ? i18n.getLanguage() : "en",
      languages: i18n ? i18n.LANGUAGES : [],
      setLanguage: i18n ? i18n.setLanguage : () => {},
    };
  }

  /* ==========================================================================
     Remembered browsing state (window.CSPrefs)
     --------------------------------------------------------------------------
     The site keeps a few things between visits: which marketplace tab and
     chart range you last looked at, and the items you opened recently.

     This is localStorage, NOT cookies, and the difference matters:
     localStorage never leaves the browser - it is not attached to requests, so
     nothing here reaches the server or any third party. That keeps it
     "strictly necessary / functional" under the ePrivacy rules, which is why
     the site still needs no consent banner. Do not move any of this into
     document.cookie without adding one.

     Everything is wrapped in try/catch: Safari private mode and a blocked
     third-party context both throw on the very first access, and a remembered
     preference is never worth breaking a page over.
     ======================================================================== */
  const PREFS_KEY = "csprice_prefs_v1";
  const RECENT_ITEMS_KEY = "csprice_recent_items_v1";
  const RECENT_ITEMS_MAX = 12;

  const CSPrefs = (() => {
    const listeners = new Set();

    function readJson(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : fallback;
      } catch (_error) {
        return fallback;
      }
    }

    function writeJson(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (_error) {
        // Quota, private mode, storage disabled - the site works without it.
        return false;
      }
    }

    function all() {
      return readJson(PREFS_KEY, {});
    }

    function get(name, fallback = null) {
      const value = all()[name];
      return value === undefined || value === null ? fallback : value;
    }

    function set(name, value) {
      const next = all();
      if (value === undefined || value === null || value === "") {
        delete next[name];
      } else {
        next[name] = value;
      }
      writeJson(PREFS_KEY, next);
      listeners.forEach((fn) => { try { fn(name, value); } catch (_error) { /* noop */ } });
      return value;
    }

    function recentItems() {
      const stored = readJson(RECENT_ITEMS_KEY, []);
      return Array.isArray(stored)
        ? stored.filter((entry) => entry && entry.market_hash_name)
        : [];
    }

    /**
     * Pushes an item to the front of the recently-viewed list.
     *
     * Only the handful of fields the search row draws are kept - name, image,
     * rarity colour, seed price - so the list stays small and there is nothing
     * in it that is not already on the page the user just opened.
     */
    function rememberItem(item) {
      const hash = String(item?.market_hash_name || item?.lookup_name || "").trim();
      if (!hash) return recentItems();
      const entry = {
        market_hash_name: hash,
        display_name: String(item?.display_name || hash).trim(),
        image: String(item?.image || ""),
        name_color: String(item?.name_color || item?.color || "B0C3D9").replace("#", ""),
        type_note: String(item?.type_note || item?.type || ""),
        category: String(item?.category || ""),
        seed_sell_price: Number.isFinite(Number(item?.seed_sell_price))
          ? Number(item.seed_sell_price)
          : null,
        viewed_at: Date.now(),
      };
      const next = [entry].concat(
        recentItems().filter((old) => old.market_hash_name !== hash)
      ).slice(0, RECENT_ITEMS_MAX);
      writeJson(RECENT_ITEMS_KEY, next);
      return next;
    }

    function clearRecentItems() {
      try { window.localStorage.removeItem(RECENT_ITEMS_KEY); } catch (_error) { /* noop */ }
      return [];
    }

    function subscribe(fn) {
      if (typeof fn !== "function") return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    }

    return { all, get, set, recentItems, rememberItem, clearRecentItems, subscribe };
  })();

  window.CSPrefs = CSPrefs;

  // Catalog `type_note` values ("Base Grade Cases", "Covert Knives", …) are
  // generic rarity/category vocabulary, not item names, so they get translated.
  // The key is derived from the English source: "Mil-Spec Grade Pistols" ->
  // tnote_milSpecGradePistols. Unknown notes fall back to the raw English.
  function typeNoteKey(note) {
    const parts = String(note || "")
      .replace(/[^A-Za-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "";
    return "tnote_" + parts
      .map((part, index) => (index === 0
        ? part.toLowerCase()
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
      .join("");
  }

  function translateTypeNote(note, t) {
    const raw = String(note || "").trim();
    if (!raw || typeof t !== "function") return raw;
    const key = typeNoteKey(raw);
    if (!key) return raw;
    const translated = t(key);
    // t() echoes the key back when it is missing from every dictionary.
    return translated === key ? raw : translated;
  }

  // Translation accessor for the plain (non-component) helpers that build the
  // assistant's HTML. Components should use the useI18n() hook instead — this
  // exists because the markdown renderer is a pure function chain.
  function ti(key, vars) {
    try {
      return window.I18N ? window.I18N.t(key, vars) : key;
    } catch (_error) {
      return key;
    }
  }

  // The model is told to keep structural tokens in English so the reply parser
  // keeps working; these maps translate them for display only.
  const CHAT_SECTION_HEADING_KEYS = {
    "item metrics": "aih_itemMetrics",
    "market metrics": "aih_marketMetrics",
    "metrics": "aih_marketMetrics",
    "key factors": "aih_keyFactors",
    "items to buy": "aih_itemsToBuy",
    "why these picks": "aih_whyThesePicks",
    "why this mix": "aih_whyThesePicks",
    "key read": "aih_keyRead",
    "outlook": "aih_outlook",
    "future outlook": "aih_futureOutlook",
    "summary": "aih_summary",
    "notes": "aih_notes",
    "note": "aih_notes",
    "risks": "aih_risks",
    "risk": "aih_risks",
    "analysis": "aih_analysis",
    "price action": "aih_priceAction",
    "liquidity read": "aih_liquidityRead",
    "marketplace supply": "aih_marketplaceSupply",
    "top opportunity": "aih_topOpportunity",
    "hold thesis": "aih_holdThesis",
    "thesis": "aih_holdThesis",
    "what to buy next": "aih_whatToBuyNext",
    "chart pick": "aih_chartPick",
    "collections to watch": "aih_collectionsToWatch",
  };

  function translateChatSectionHeading(label) {
    const raw = String(label || "").trim();
    if (!raw) return raw;
    const key = CHAT_SECTION_HEADING_KEYS[raw.toLowerCase().replace(/[:\s]+$/, "")];
    return key ? ti(key) : raw;
  }

  const CHAT_METRIC_LABEL_KEYS = {
    SCARCITY: "ai_metricScarcity",
    LIQUIDITY: "ai_metricLiquidity",
    VOLATILITY: "ai_metricVolatility",
  };
  const CHAT_METRIC_VALUE_KEYS = {
    EXTREME: "ai_levelExtreme",
    HIGH: "ai_levelHigh",
    MODERATE: "ai_levelModerate",
    MEDIUM: "ai_levelMedium",
    LOW: "ai_levelLow",
  };
  const CHAT_VERDICT_KEYS = {
    BULLISH: "ai_verdictBullish",
    NEUTRAL: "ai_verdictNeutral",
    BEARISH: "ai_verdictBearish",
  };

  function translateChatMetricLabel(label) {
    const key = CHAT_METRIC_LABEL_KEYS[String(label || "").trim().toUpperCase()];
    return key ? ti(key) : String(label || "");
  }

  function translateChatMetricValue(value) {
    const key = CHAT_METRIC_VALUE_KEYS[String(value || "").trim().toUpperCase()];
    return key ? ti(key) : String(value || "");
  }

  // chat.php fills in an English generic "why" (aiChatGenericMetricDetail) when
  // the model omits one. Those exact sentences map back to their translations;
  // anything the model actually wrote is already in the reply language.
  const CHAT_METRIC_DETAIL_KEYS = {
    "listing supply looks extremely thin vs demand.": "ai_scarcityExtreme",
    "listings look scarce relative to demand.": "ai_scarcityHigh",
    "supply looks roughly balanced vs demand.": "ai_scarcityModerate",
    "plenty of listings relative to demand.": "ai_scarcityLow",
    "inferred from listing supply vs demand.": "ai_scarcityFallback",
    "deep enough book for easier entry and exit.": "ai_liquidityHigh",
    "decent depth; larger exits can still take time.": "ai_liquidityMedium",
    "thin books — size can slip the ask on exit.": "ai_liquidityLow",
    "inferred from marketplace listing depth.": "ai_liquidityFallback",
    "recent price swings look sharp.": "ai_volatilityHigh",
    "moderate recent move size.": "ai_volatilityMedium",
    "price action has stayed relatively calm.": "ai_volatilityLow",
    "inferred from recent price move size.": "ai_volatilityFallback",
  };

  function translateChatMetricDetail(detail) {
    const raw = String(detail || "").trim();
    if (!raw) return raw;
    const key = CHAT_METRIC_DETAIL_KEYS[raw.toLowerCase()];
    return key ? ti(key) : raw;
  }

  // Same deal for the generic per-pick "why" chat.php substitutes when the
  // model leaves one out — always English, so map it back to a key.
  const CHAT_WHY_REASON_KEYS = {
    "cheap wrapper with recognizable brand; good for tiny swings": "why_container",
    "cheap entry, watched by collectors, good for filling slots": "why_stickerish",
    "recognizable finish; balanced risk/return profile": "why_generic",
    "timeless set identity with steady demand across weapon lines": "why_collectionWatch",
  };

  function translateChatWhyReason(reason) {
    const raw = String(reason || "").trim();
    if (!raw) return raw;
    const key = CHAT_WHY_REASON_KEYS[raw.toLowerCase().replace(/\s+/g, " ")];
    return key ? ti(key) : raw;
  }

  function translateChatVerdict(verdict) {
    const key = CHAT_VERDICT_KEYS[String(verdict || "").trim().toUpperCase()];
    return key ? ti(key) : String(verdict || "");
  }

  // The site's language picker drives what language Mark replies in — read at
  // send time so switching languages mid-conversation takes effect immediately.
  function chatLanguageCode() {
    try {
      return window.I18N ? window.I18N.getLanguage() : "en";
    } catch (_error) {
      return "en";
    }
  }

  function warmMarketPriceCache() {
    if (window.__MARKET_PRICE_PRELOAD_LOADING__) return;
    if (window.__MARKET_PRICE_PRELOAD__?.loaded) return;
    window.__MARKET_PRICE_PRELOAD_LOADING__ = true;

    fetch("preload_market_prices.php", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.success && payload.prices) {
          window.__MARKET_PRICE_PRELOAD__ = payload.prices;
          window.__MARKET_PRICE_PRELOAD__.loaded = true;
          window.__MARKET_PRICE_PRELOAD__.meta = payload.meta || {};
          window.dispatchEvent(new CustomEvent("cs2:market-prices-preloaded"));
        }
      })
      .catch(() => {})
      .finally(() => {
        window.__MARKET_PRICE_PRELOAD_LOADING__ = false;
      });

    fetch("trigger_market_price_sync.php", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ stale_hours: 24, limit: 250 }),
    }).catch(() => {});
  }

  function getMarketPricePreload(provider, marketHashName) {
    const bucket = window.__MARKET_PRICE_PRELOAD__?.[provider];
    if (!bucket || !marketHashName) return null;
    return bucket[marketHashName] || null;
  }

  function normalizePreloadPriceRecord(row, provider) {
    if (!row || !row.market_hash_name) return null;
    const price = Number(row.current_price);
    if (!Number.isFinite(price) || price <= 0) return null;
    const out = {
      market_hash_name: row.market_hash_name,
      source: row.source || provider,
      current_price: price,
      sell_orders: row.sell_orders != null ? Number(row.sell_orders) : null,
      buy_orders: row.buy_orders != null ? Number(row.buy_orders) : null,
      updated_at: row.updated_at || null,
      from_preload: true,
    };
    if (provider === "steam") {
      const origin = String(row.steam_price_source || "priceoverview").toLowerCase();
      if (origin === "steam_catalog") return null;
      out.steam_price_source = origin;
      out.price_verified = ["priceoverview", "market_listing", "market_listing_wear"].includes(origin);
    }
    return out;
  }

  function classNames(...parts) {
    return parts.filter(Boolean).join(" ");
  }

  function normalize(text) {
    return String(text || "").toLowerCase();
  }

  function matchesQuery(text, query) {
    const value = normalize(query).trim();
    if (!value) return true;
    return normalize(text).includes(value);
  }

  function isCaseNavSectionActive() {
    const params = new URLSearchParams(window.location.search);
    return (params.get("type") || "case").toLowerCase() !== "collection";
  }

  function buildCatalogItemsHref(section, group, extra = {}) {
    const helpers = window.CS2ReactData;
    if (helpers && typeof helpers.buildCatalogItemsHref === "function") {
      return helpers.buildCatalogItemsHref(section, group, extra);
    }
    const params = new URLSearchParams({
      section: String(section || ""),
      group: String(group || ""),
    });
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        params.set(key, String(value));
      }
    });
    return `catalog-items.html?${params.toString()}`;
  }

  // A weapon listing is reachable as catalog-items.html?section=weapons&... and
  // as a generated folder (/smgs/mac-10/, scripts/build_catalog_urls.php), which
  // carries no query string. "Which category is open?" has to read whichever of
  // the two the current page is, or the navbar highlights nothing.
  function activeCatalogRoute() {
    const route = window.__CATALOG_ROUTE__;
    if (route && typeof route === "object") {
      return {
        section: String(route.section || ""),
        group: String(route.group || ""),
        weapon_class: String(route.weapon_class || ""),
      };
    }
    const params = new URLSearchParams(window.location.search);
    return {
      section: params.get("section") || "",
      group: params.get("group") || "",
      weapon_class: params.get("weapon_class") || "",
    };
  }

  function isCatalogSectionActive(page, section) {
    if (page === `${section}.html`) {
      return true;
    }
    if (page !== "catalog-items.html") {
      return false;
    }
    return activeCatalogRoute().section === section;
  }

  /**
   * The bar's "Stickers" entry, which opens the catalogue of every sticker.
   *
   * NOT isCatalogSectionActive(page, "stickers"): that returns true for
   * stickers.html as well, and stickers.html is the Capsules entry - the page
   * listing the capsules each sticker comes out of. Sharing the check lit both
   * links at once on /stickers/. This one matches the catalogue route only.
   */
  function isStickerCatalogActive(page) {
    return page === "catalog-items.html" && activeCatalogRoute().section === "stickers";
  }

  // isOtherNavActive lit up an "Other" nav entry for any of its six sections.
  // That entry is gone - each section is its own link now and lights itself
  // through isCatalogSectionActive - so the check went with it.

  function isWeaponNavActive(page, weaponClass) {
    if (page === `${weaponClass}.html`) {
      return true;
    }
    if (weaponClass === "heavy" && ["heavy.html", "shotguns.html", "lmgs.html"].includes(page)) {
      return true;
    }
    if (weaponClass === "rare" && ["rare.html", "knives.html", "gloves.html"].includes(page)) {
      return true;
    }
    if (page !== "catalog-items.html") {
      return false;
    }
    const route = activeCatalogRoute();
    if (route.section !== "weapons") {
      return false;
    }
    const activeClass = route.weapon_class;
    if (weaponClass === "heavy") {
      return activeClass === "heavy" || activeClass === "shotguns" || activeClass === "lmgs";
    }
    if (weaponClass === "rare") {
      return activeClass === "rare" || activeClass === "knives" || activeClass === "gloves";
    }
    return activeClass === weaponClass;
  }

  const WEAPON_EQUIPMENT_ICONS = {
    "Zeus x27": "taser",
    "CZ75-Auto": "cz75a",
    "Desert Eagle": "deagle",
    "Dual Berettas": "elite",
    "Five-SeveN": "fiveseven",
    "Glock-18": "glock",
    "P2000": "hkp2000",
    "P250": "p250",
    "R8 Revolver": "revolver",
    "Tec-9": "tec9",
    "USP-S": "usp_silencer",
    "MAC-10": "mac10",
    "MP5-SD": "mp5sd",
    "MP7": "mp7",
    "MP9": "mp9",
    "PP-Bizon": "bizon",
    "P90": "p90",
    "UMP-45": "ump45",
    "MAG-7": "mag7",
    "Nova": "nova",
    "Sawed-Off": "sawedoff",
    "XM1014": "xm1014",
    "M249": "m249",
    "Negev": "negev",
    "AK-47": "ak47",
    "AUG": "aug",
    "AWP": "awp",
    "FAMAS": "famas",
    "G3SG1": "g3sg1",
    "Galil AR": "galilar",
    "M4A1-S": "m4a1_silencer",
    "M4A4": "m4a1",
    "SCAR-20": "scar20",
    "SG 553": "sg556",
    "SSG 08": "ssg08",
    "Bayonet": "bayonet",
    "Bowie Knife": "knife_survival_bowie",
    "Butterfly Knife": "knife_butterfly",
    "Classic Knife": "knife_css",
    "Falchion Knife": "knife_falchion",
    "Flip Knife": "knife_flip",
    "Gut Knife": "knife_gut",
    "Huntsman Knife": "knife_tactical",
    "Karambit": "knife_karambit",
    "Kukri Knife": "knife_kukri",
    "M9 Bayonet": "knife_m9_bayonet",
    "Navaja Knife": "knife_gypsy_jackknife",
    "Nomad Knife": "knife_outdoor",
    "Paracord Knife": "knife_cord",
    "Shadow Daggers": "knife_push",
    "Skeleton Knife": "knife_skeleton",
    "Stiletto Knife": "knife_stiletto",
    "Talon Knife": "knife_widowmaker",
    "Ursus Knife": "knife_ursus",
  };

  const WEAPON_CATEGORY_ICONS = {
    pistols: "deagle",
    smgs: "mp5sd",
    heavy: "negev",
    shotguns: "xm1014",
    lmgs: "negev",
    rifles: "ak47",
    knives: "knife_butterfly",
    // Purpose-drawn silhouette; Valve's clothing_hands.svg went to mush once
    // the nav's white filter flattened its line work. See the file's comment.
    gloves: "gloves",
    rare: "knife_butterfly",
  };

  function weaponEquipmentIconUrl(name, fallbackKey) {
    const slug = WEAPON_EQUIPMENT_ICONS[name]
      || (fallbackKey ? WEAPON_CATEGORY_ICONS[fallbackKey] : null)
      || "knife";
    // Gloves: a silhouette cut from a real glove render (sport gloves), white
    // on transparent. The nav's white filter leaves it as is.
    if (slug === "gloves") return "assets/icons/equipment/gloves-silhouette.png?v=20260925-gloves-sil-1";
    return `assets/icons/equipment/${slug}.svg`;
  }

  // ── Which nav entry an item page belongs to ──────────────────────────────
  // An item page used to light "Market Explorer". It now lights the entry the
  // item actually lives under: the weapon class inside Skins, Stickers, Cases
  // or Capsules, or the section inside Other. Read from the route the page
  // generator injected (window.__ITEM_ROUTE__: category, type, name) or, on
  // the old query-string pages, from the query itself; the pretty URL's first
  // segment is the fallback. Returns null when nothing fits (keys, passes),
  // and Market Explorer stays lit for those.
  const NAV_WEAPON_CLASS_BY_NAME = {
    pistols: ["Glock-18", "USP-S", "P2000", "P250", "Five-SeveN", "Tec-9", "CZ75-Auto", "Desert Eagle", "Dual Berettas", "R8 Revolver"],
    smgs: ["MAC-10", "MP9", "MP7", "MP5-SD", "UMP-45", "P90", "PP-Bizon"],
    rifles: ["AK-47", "M4A4", "M4A1-S", "FAMAS", "Galil AR", "AUG", "SG 553", "SSG 08", "AWP", "SCAR-20", "G3SG1"],
    heavy: ["Nova", "XM1014", "Sawed-Off", "MAG-7", "M249", "Negev", "Zeus x27"],
  };

  function navWeaponClassForItem(name, typeNote, category) {
    const cat = String(category || "").toLowerCase();
    if (cat === "knives") return "knives";
    if (cat === "gloves") return "gloves";
    const type = String(typeNote || "");
    if (/\bPistols?\b/i.test(type)) return "pistols";
    if (/\bSMGs?\b/i.test(type)) return "smgs";
    if (/\bRifles?\b/i.test(type)) return "rifles";
    if (/\b(Heavy|Shotguns?|Machineguns?)\b/i.test(type)) return "heavy";
    if (/\bKni(fe|ves)\b/i.test(type)) return "knives";
    if (/\bGloves?\b/i.test(type)) return "gloves";
    const base = String(name || "").replace(/^(★\s*)?(StatTrak™?\s*|Souvenir\s*)?/i, "").split("|")[0].trim();
    if (/^★/.test(String(name || "")) || /\bKnife\b|\bBayonet\b|\bKarambit\b|\bDaggers\b/i.test(base)) {
      return /\bGloves?\b|\bHand Wraps\b/i.test(base) ? "gloves" : "knives";
    }
    for (const [weaponClass, weapons] of Object.entries(NAV_WEAPON_CLASS_BY_NAME)) {
      if (weapons.some((weapon) => base.toLowerCase() === weapon.toLowerCase())) return weaponClass;
    }
    return "";
  }

  function itemPageNavTarget() {
    let route = null;
    try {
      const injected = window.__ITEM_ROUTE__;
      const query = new URLSearchParams(window.location.search);
      route = {
        name: String((injected && injected.market_hash_name) || query.get("market_hash_name") || query.get("lookup_name") || (injected && injected.lookup_name) || ""),
        type: String((injected && injected.type) || query.get("type") || ""),
        category: String((injected && injected.category) || query.get("category") || "").toLowerCase(),
      };
    } catch (_error) {
      route = { name: "", type: "", category: "" };
    }

    let category = route.category;
    if (!category) {
      // Pretty URL: /skins/awp-dragon-lore/ -> "skins".
      const parts = pathSegments(window.location.pathname);
      const segment = parts.length >= 2 && ITEM_URL_SECTIONS.has(parts[0].toLowerCase()) ? parts[0].toLowerCase() : "";
      category = { "music-kits": "music", collectibles: "collectibles", misc: "tools" }[segment] || segment;
    }

    switch (category) {
      case "skins":
      case "knives":
      case "gloves":
        return { section: "skins", weaponClass: navWeaponClassForItem(route.name, route.type, category) };
      case "stickers":
        return { section: "stickers", weaponClass: "" };
      case "cases":
        return { section: /capsule|sticker collection/i.test(route.type) ? "capsules" : "cases", weaponClass: "" };
      case "agents":
      case "charms":
      case "patches":
      case "graffiti":
      case "music":
        return { section: category, weaponClass: "" };
      case "collectibles":
        return { section: "pins", weaponClass: "" };
      default:
        return null;
    }
  }

  function isMarketNavActive(page) {
    if (page === "roi.html") return true;
    return page === "item_page.html" && !itemPageNavTarget();
  }

  /* ==========================================================================
     Design-system icons and the theme switch
     --------------------------------------------------------------------------
     One 24px grid, 1.8px round strokes, currentColor — the set the redesign
     specifies. Themes are resolved before paint by the boot script that
     scripts/inject_theme.php writes into every <head>; everything here only
     changes the choice afterwards and tells the page about it.
     ========================================================================== */
  const CS_ICON_PATHS = {
    menu: <path d="M4 7h16M4 12h16M4 17h10" />,
    ghost: (
      <>
        <path d="M6 20V10a6 6 0 0 1 12 0v10l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z" />
        <circle cx="10" cy="10" r=".9" fill="currentColor" />
        <circle cx="14" cy="10" r=".9" fill="currentColor" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    chart: <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" />,
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </>
    ),
    arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
      </>
    ),
    wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.1-.4-.4-2.1z" />,
    shapes: (
      <>
        <path d="M12 3l4 7H8z" />
        <circle cx="7" cy="17" r="3.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </>
    ),
    folder: <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    chevronDown: <path d="M6 9l6 6 6-6" />,
    chevronRight: <path d="M9 6l6 6-6 6" />,
    // The phone start screen's suggestion rows.
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
      </>
    ),
    trend: <path d="M4 16l5-5 3 3 6-7M14 7h6v6" />,
    star: <path d="M12 3.5l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z" />,
    tag: (
      <>
        <path d="M3 12.5V4a1 1 0 0 1 1-1h8.5a1 1 0 0 1 .7.3l7.5 7.5a1 1 0 0 1 0 1.4l-8.5 8.5a1 1 0 0 1-1.4 0L3.3 13.2a1 1 0 0 1-.3-.7z" />
        <circle cx="7.8" cy="7.8" r="1.3" fill="currentColor" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>
    ),
  };

  function CSIcon({ name, size = 20, className }) {
    const shape = CS_ICON_PATHS[name];
    if (!shape) return null;
    return (
      <svg
        className={classNames("cs-icon", `cs-icon-${name}`, className)}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {shape}
      </svg>
    );
  }

  const THEME_KEY = "csprice-theme";
  const THEME_CHOICES = ["light", "dark", "system"];

  function readThemeChoice() {
    try {
      const stored = String(window.localStorage.getItem(THEME_KEY) || "");
      if (THEME_CHOICES.includes(stored)) return stored;
    } catch (_error) { /* private mode */ }
    return "system";
  }

  function resolveTheme(choice) {
    if (choice === "light" || choice === "dark") return choice;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  /**
   * Writes the choice everywhere it has to land: the element attributes the
   * tokens key off, the browser chrome colour, localStorage, the account (when
   * signed in) and an event for anything that has to repaint itself, like a
   * chart that already rendered with the old colours.
   */
  function applyThemeChoice(choice, { persist = true, animate = true } = {}) {
    const next = THEME_CHOICES.includes(choice) ? choice : "system";
    const root = document.documentElement;
    // A legacy page is pinned to dark until its stylesheet reads the tokens;
    // the choice is still stored, so it applies the moment you leave the page.
    const resolved = root.hasAttribute("data-legacy-dark") ? "dark" : resolveTheme(next);

    if (animate) {
      root.setAttribute("data-theme-animating", "1");
      window.setTimeout(() => root.removeAttribute("data-theme-animating"), 240);
    }
    root.setAttribute("data-theme", resolved);
    root.setAttribute("data-theme-ready", "1");
    root.style.colorScheme = resolved;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#0a0f24" : "#f3f6fc");

    window.__cspriceTheme = { ...(window.__cspriceTheme || {}), choice: next, resolved };

    if (persist) {
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch (_error) { /* private mode: the session still switches */ }
      // Best effort, and only for a signed-in account: a failure here must not
      // stop the theme from changing.
      if (readCachedSteamSession()?.authenticated) {
        fetch("profile_api.php", {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          body: new URLSearchParams({ action: "theme", theme: next }),
        }).catch(() => {});
      }
    }

    window.dispatchEvent(new CustomEvent("csprice:theme-change", { detail: { choice: next, resolved } }));
    return resolved;
  }

  function useThemeChoice() {
    const [choice, setChoice] = useState(() => (window.__cspriceTheme?.choice) || readThemeChoice());
    const [resolved, setResolved] = useState(() => (window.__cspriceTheme?.resolved) || resolveTheme(choice));

    useEffect(() => {
      const onChange = (event) => {
        setChoice(event.detail?.choice || readThemeChoice());
        setResolved(event.detail?.resolved || resolveTheme(readThemeChoice()));
      };
      const onSystem = () => setResolved(resolveTheme("system"));
      window.addEventListener("csprice:theme-change", onChange);
      window.addEventListener("csprice:system-theme-change", onSystem);
      return () => {
        window.removeEventListener("csprice:theme-change", onChange);
        window.removeEventListener("csprice:system-theme-change", onSystem);
      };
    }, []);

    const set = useCallback((next) => {
      applyThemeChoice(next);
    }, []);

    return { choice, resolved, setTheme: set };
  }

  // Light / Dark / System, for the profile menu.
  function ThemeSegmented() {
    const { choice, setTheme } = useThemeChoice();
    const options = [
      { id: "light", icon: "sun", label: "Light" },
      { id: "dark", icon: "moon", label: "Dark" },
      { id: "system", icon: "monitor", label: "System" },
    ];
    return (
      <div className="theme-segmented" role="group" aria-label="Theme">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={classNames(choice === option.id && "is-active")}
            aria-pressed={choice === option.id}
            title={option.label}
            onClick={() => setTheme(option.id)}
          >
            <CSIcon name={option.icon} size={16} />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    );
  }

  // One button that flips between the two explicit themes.
  function ThemeQuickToggle() {
    const { resolved, setTheme } = useThemeChoice();
    const next = resolved === "dark" ? "light" : "dark";
    return (
      <button
        type="button"
        className="theme-quick-toggle"
        title={`Switch to ${next} theme`}
        aria-label={`Switch to ${next} theme`}
        onClick={() => setTheme(next)}
      >
        <CSIcon name={resolved === "dark" ? "sun" : "moon"} size={20} />
      </button>
    );
  }

  // One hand-drawn icon set for the phone bar so the burger, the account and the
  // private-chat button match: 1.7px round strokes on a 24px grid, currentColor.
  // Desktop keeps the Font Awesome glyphs (CSS swaps them at the breakpoint).
  function NavGlyph({ name }) {
    const stroke = {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.7,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };
    // pathLength normalises every line to 1 unit, so one dash animation draws
    // all three regardless of how long each actually is.
    const line = { ...stroke, pathLength: 1 };
    const paths = {
      // Geometry from the phone design: M4 7h16 M4 12h16 M4 17h10. Drawn as
      // three lines rather than one path so each bar keeps its own draw-in.
      menu: (
        <>
          <line x1="4" y1="7" x2="20" y2="7" className="nav-glyph-bar nav-glyph-bar-top" {...line} />
          <line x1="4" y1="12" x2="20" y2="12" className="nav-glyph-bar nav-glyph-bar-mid" {...line} />
          <line x1="4" y1="17" x2="14" y2="17" className="nav-glyph-bar nav-glyph-bar-short" {...line} />
        </>
      ),
      close: (
        <>
          <line x1="5.5" y1="5.5" x2="18.5" y2="18.5" {...stroke} />
          <line x1="18.5" y1="5.5" x2="5.5" y2="18.5" {...stroke} />
        </>
      ),
      search: (
        <>
          <circle cx="11" cy="11" r="6.2" {...stroke} />
          <line x1="15.6" y1="15.6" x2="20" y2="20" {...stroke} />
        </>
      ),
      account: (
        <>
          <circle cx="12" cy="9" r="3.4" {...stroke} />
          <path d="M5.5 19.2c1.2-3.1 3.7-4.7 6.5-4.7s5.3 1.6 6.5 4.7" {...stroke} />
        </>
      ),
      // Private chat: an arcade ghost — domed head, scalloped hem, two eyes.
      // Path and eyes as specified for the phone design.
      incognito: (
        <>
          <path
            d="M6 20V10a6 6 0 0 1 12 0v10l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z"
            {...stroke}
          />
          <circle cx="10" cy="10" r="0.9" fill="currentColor" stroke="none" />
          <circle cx="14" cy="10" r="0.9" fill="currentColor" stroke="none" />
        </>
      ),
      chevron: <path d="M7.5 10.2 12 14.5l4.5-4.3" {...stroke} />,
    };

    return (
      <svg
        className={`nav-glyph nav-glyph-${name}`}
        viewBox="0 0 24 24"
        width="24"
        height="24"
        aria-hidden="true"
        focusable="false"
      >
        {paths[name] || null}
      </svg>
    );
  }

  // Phone header on the Mark AI page: the model name replaces the logo, the way
  // Gemini's app does it. The entries are labels only for now — picking one just
  // remembers it until the real models are wired up.
  const NAV_AI_MODELS = [
    { id: "mark-fast", label: "Mark 1 Fast" },
    { id: "mark-pro", label: "Mark 1 Pro" },
    { id: "mark-max", label: "Mark 1 Max" },
  ];
  const NAV_AI_MODEL_KEY = "cs2_ai_model_v1";

  function NavModelPicker() {
    const [open, setOpen] = useState(false);
    const [modelId, setModelId] = useState(() => {
      try {
        return window.localStorage.getItem(NAV_AI_MODEL_KEY) || NAV_AI_MODELS[0].id;
      } catch (_error) {
        return NAV_AI_MODELS[0].id;
      }
    });
    const rootRef = useRef(null);
    const current = NAV_AI_MODELS.find((model) => model.id === modelId) || NAV_AI_MODELS[0];

    useEffect(() => {
      if (!open) return undefined;
      const onOutside = (event) => {
        if (!rootRef.current?.contains(event.target)) setOpen(false);
      };
      document.addEventListener("pointerdown", onOutside);
      return () => document.removeEventListener("pointerdown", onOutside);
    }, [open]);

    const pick = (model) => {
      setModelId(model.id);
      setOpen(false);
      try {
        window.localStorage.setItem(NAV_AI_MODEL_KEY, model.id);
      } catch (_error) {
        // Ignore storage failures.
      }
      window.dispatchEvent(new CustomEvent("cs2:ai-model-change", { detail: { id: model.id, label: model.label } }));
    };

    return (
      <div className={classNames("nav-model-picker", open && "open")} ref={rootRef}>
        <button
          type="button"
          className="nav-model-trigger"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((value) => !value)}
        >
          <span>{current.label}</span>
          <NavGlyph name="chevron" />
        </button>
        <div className="nav-model-dropdown" role="listbox">
          {NAV_AI_MODELS.map((model) => (
            <button
              type="button"
              key={model.id}
              role="option"
              aria-selected={model.id === current.id}
              className={classNames("nav-model-option", model.id === current.id && "is-active")}
              onClick={() => pick(model)}
            >
              {model.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function SortChipPicker({ value, options, onChange, ariaLabel = "Sort options", prefix = "Sort" }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const selected = options.find((option) => option.value === value) || options[0];

    useEffect(() => {
      if (!open) return undefined;

      const handlePointer = (event) => {
        if (!rootRef.current?.contains(event.target)) {
          setOpen(false);
        }
      };
      const handleKey = (event) => {
        if (event.key === "Escape") setOpen(false);
      };

      document.addEventListener("mousedown", handlePointer);
      document.addEventListener("keydown", handleKey);
      return () => {
        document.removeEventListener("mousedown", handlePointer);
        document.removeEventListener("keydown", handleKey);
      };
    }, [open]);

    if (!selected) return null;

    return (
      <div className={classNames("collections-sort-dropdown", open && "open")} ref={rootRef}>
        <button
          type="button"
          className="collections-sort-trigger"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{prefix}: {selected.label}</span>
          <i className="fa-solid fa-chevron-down" aria-hidden="true" />
        </button>

        {open ? (
          <div className="collections-sort-menu" role="listbox" aria-label={ariaLabel}>
            {options.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={value === option.value}
                className={classNames("collections-sort-option", value === option.value && "active")}
                style={{ animationDelay: `${0.04 + index * 0.035}s` }}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {prefix}: {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function CategoryNavIcon({ category }) {
    const iconSrc = category?.iconImg || (
      category?.key && WEAPON_CATEGORY_ICONS[category.key]
        ? weaponEquipmentIconUrl("", category.key)
        : null
    );

    if (iconSrc) {
      return (
        <img
          className={classNames(
            "nav-category-icon",
            category?.key === "gloves" && "nav-category-icon--gloves"
          )}
          src={iconSrc}
          alt=""
          loading="lazy"
          decoding="async"
        />
      );
    }
    return category?.icon ? <i className={category.icon} /> : null;
  }

  const RARITY_COLORS = {
    EB4B4B: "Covert",
    D32CE6: "Classified",
    "8847FF": "Restricted",
    "4B69FF": "Mil-Spec",
    "5E98D9": "Industrial Grade",
    B0C3D9: "Consumer Grade",
    E4AE39: "Extraordinary",
    CFB97F: "High Grade",
    FAFAFA: "High Grade"
  };

  const RARITY_HEX_BY_SLUG = {
    covert: "#EB4B4B",
    classified: "#D32CE6",
    restricted: "#8847FF",
    milspec: "#4B69FF",
    industrial: "#5E98D9",
    consumer: "#B0C3D9",
    extraordinary: "#E4AE39",
    contraband: "#E4AE39",
  };

  function resolveRarityAccent(item) {
    const rawHex = String(item?.name_color || "").replace(/^#/, "").trim();
    if (/^[0-9A-Fa-f]{6}$/.test(rawHex)) {
      return `#${rawHex.toUpperCase()}`;
    }
    return RARITY_HEX_BY_SLUG[item?.rarity] || RARITY_HEX_BY_SLUG.milspec;
  }

  function buildRarityStyleVars(accent) {
    const hex = String(accent || "#4B69FF").replace(/^#/, "").toUpperCase();
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);

    return {
      "--card-accent": `#${hex}`,
      "--rarity-accent": `#${hex}`,
      "--rarity-glow": `rgba(${red}, ${green}, ${blue}, 0.48)`,
      "--rarity-mid": `rgba(${red}, ${green}, ${blue}, 0.24)`,
      "--rarity-deep": `rgba(${Math.max(0, Math.round(red * 0.24))}, ${Math.max(0, Math.round(green * 0.24))}, ${Math.max(0, Math.round(blue * 0.24))}, 0.34)`,
    };
  }

  function resolveWeaponMediaClass(weaponOrItem) {
    const weapon = String(
      typeof weaponOrItem === "object"
        ? weaponOrItem?.weapon || (weaponOrItem?.display_name || weaponOrItem?.market_hash_name || "").split("|")[0]
        : weaponOrItem || ""
    ).toLowerCase();

    if (!weapon) return "";
    if (/(awp|ssg 08|g3sg1|scar-20)/.test(weapon)) return "type-snipers";
    if (/(ak-47|m4a1|m4a4|aug|sg 553|famas|galil)/.test(weapon)) return "type-rifles";
    if (/(mac-10|mp9|mp7|ump-45|p90|pp-bizon|mp5)/.test(weapon)) return "type-smgs";
    if (/(nova|xm1014|mag-7|sawed-off)/.test(weapon)) {
      return /xm[\s-]?1014/.test(weapon) ? "type-shotguns xm-hide-shell" : "type-shotguns";
    }
    if (/(m249|negev)/.test(weapon)) return "type-heavy";
    if (/(glock|usp|p2000|p250|tec-9|five-seven|cz75|dual berettas|desert eagle|revolver|r8)/.test(weapon)) return "type-pistols";
    if (/(bayonet|knife|karambit|daggers|talon|navaja|stiletto|ursus|bowie|falchion|butterfly|huntsman|shadow|gut|flip|classic|paracord|survival|nomad|skeleton|kukri|★)/.test(weapon)) return "type-knives";
    if (/(gloves|wraps)/.test(weapon)) return "type-gloves";
    return "type-rifles";
  }

  function rarityLabel(hex) {
    const key = String(hex || "").toUpperCase().replace("#", "").slice(0, 6);
    return RARITY_COLORS[key] || "Item";
  }

  function typeLabel(item) {
    const tn = String(item.type_note || "");
    const cat = String(item.category || "");
    if (cat === "knives") return "Knife";
    if (cat === "gloves") return "Gloves";
    if (cat === "agents") return "Agent";
    if (cat === "cases") return "Case";
    if (cat === "stickers") {
      if (tn.toLowerCase().includes("sticker slab") || String(item.market_hash_name || "").startsWith("Sticker Slab |")) {
        return "Sticker Slab";
      }
      if (tn.toLowerCase().includes("autograph")) return "Autograph Sticker";
      if (tn.toLowerCase().includes("tournament")) return "Tournament Sticker";
      return "Sticker";
    }
    if (cat === "music") return "Music Kit";
    if (cat === "patches") return "Patch";
    if (cat === "skins") return "Skin";
    return tn || "Item";
  }

  function buildSearchHref(item) {
    const marketHashName = String(item.market_hash_name || "").trim();
    const displayName = String(item.display_name || marketHashName).trim();
    if (!marketHashName) {
      return "#";
    }

    // Pretty URL when the item has a generated page (/skins/awp-dragon-lore/).
    const pretty = typeof window.CS2ReactData?.itemPrettyHref === "function"
      ? window.CS2ReactData.itemPrettyHref(item)
      : "";
    if (pretty) return pretty;

    return "item_page.php?" + new URLSearchParams({
      lookup_name: marketHashName,
      display_name: displayName,
      market_hash_name: marketHashName,
      image: item.image || "",
      market_url: "https://steamcommunity.com/market/listings/730/" + encodeURIComponent(marketHashName),
      type: item.type_note || "",
      category: item.category || "",
      color: item.name_color || "B0C3D9",
    }).toString();
  }

  function mergeSearchPrices(items, priceRecords) {
    if (!Array.isArray(items) || !Array.isArray(priceRecords) || !priceRecords.length) {
      return items;
    }

    const priceMap = new Map();
    priceRecords.forEach((record) => {
      const name = String(record?.market_hash_name || "").trim();
      if (name) {
        priceMap.set(name, record);
      }
    });

    return items.map((item) => {
      const record = priceMap.get(String(item.market_hash_name || "").trim());
      if (!record) {
        return item;
      }

      const nextPrice = record.current_price ?? item.seed_sell_price;
      const nextListings = record.listings ?? item.seed_sell_listings;

      return {
        ...item,
        seed_sell_price: nextPrice != null ? nextPrice : item.seed_sell_price,
        seed_sell_listings: nextListings != null ? nextListings : item.seed_sell_listings,
      };
    });
  }

  function enrichSearchPrices(items, signal) {
    const names = items
      .filter((item) => item.seed_sell_price == null || item.seed_sell_listings == null)
      .map((item) => String(item.market_hash_name || "").trim())
      .filter(Boolean);

    if (!names.length) {
      return Promise.resolve(items);
    }

    return fetch("get_roi_prices_cached.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "steam",
        range: "30d",
        market_hash_names: names,
        steam_catalog_only: true,
        allow_live_refresh: true,
        steam_listing_fallback: true,
        steam_listing_fallback_limit: Math.min(12, names.length),
      }),
      signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const records = Array.isArray(payload?.items)
          ? payload.items
          : (Array.isArray(payload?.cases) ? payload.cases : []);
        return mergeSearchPrices(items, records);
      })
      .catch(() => items);
  }

  function SearchResultRow({ item, onClose }) {
    const rl = rarityLabel(item.name_color);
    const price = item.seed_sell_price != null
      ? "€" + Number(item.seed_sell_price).toFixed(2)
      : "—";
    const listingCount = item.seed_sell_listings != null ? Number(item.seed_sell_listings) : null;
    const offers = listingCount != null
      ? listingCount.toLocaleString() + (listingCount === 1 ? " listing" : " listings")
      : "";
    const hex = "#" + String(item.name_color || "B0C3D9").replace("#", "");
    // A TF2 result (search_items.php?game=tf2) brings its own clean page link.
    const href = item.href ? String(item.href) : buildSearchHref(item);
    const isExternal = !href.startsWith("item_page") && !href.startsWith("tf2");
    const showRarity = rl !== "Item";

    return (
      <a
        className="srch-row"
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer" : undefined}
        onClick={onClose}
      >
        <div className="srch-row-img">
          {item.image
            ? <img src={item.image} alt={item.display_name || item.market_hash_name} loading="lazy" />
            : <span className="srch-row-placeholder">{item.game === "tf2" ? "TF" : "CS"}</span>}
        </div>

        <div className="srch-row-body">
          <div className="srch-row-name">{item.display_name || item.market_hash_name}</div>
          {showRarity && (
          <div className="srch-row-meta">
            <span className="srch-meta-rarity" style={{ color: hex }}>{rl}</span>
          </div>
          )}
        </div>

        <div className="srch-row-right">
          <div className="srch-row-price">{price}</div>
          {offers && <div className="srch-row-offers">{offers}</div>}
        </div>
      </a>
    );
  }

  function SearchOverlay({ onClose }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [fetching, setFetching] = useState(false);
    // Read once on open: the list only changes when you leave for an item page.
    const [recent, setRecent] = useState(() => CSPrefs.recentItems());
    const { t } = useI18n();
    const deferredQuery = useDeferredValue(query);
    const inputRef = useRef(null);
    const resultsRef = useRef(null);
    const timerRef = useRef(null);
    const abortRef = useRef(null);

    useEffect(() => {
      if (inputRef.current && document.visibilityState !== "hidden") {
        try {
          inputRef.current.focus({ preventScroll: true });
        } catch (_error) {
          try { inputRef.current.focus(); } catch (_inner) { /* ignore */ }
        }
      }
      const onKey = (event) => { if (event.key === "Escape") onClose(); };
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = "";
      };
    }, []);

    useEffect(() => {
      const el = resultsRef.current;
      if (!el || results.length === 0) return undefined;

      const fitRows = () => {
        const row = el.querySelector(".srch-row");
        if (!row) return;

        const styles = window.getComputedStyle(el);
        const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
        const rowH = Math.round(row.getBoundingClientRect().height) || 56;
        if (rowH <= 0) return;

        const overlay = el.closest(".srch-overlay");
        const top = el.getBoundingClientRect().top;
        const overlayBottom = overlay
          ? overlay.getBoundingClientRect().bottom
          : window.innerHeight;
        // Keep panel above overlay padding / rounded clip zone
        const available = Math.max(rowH + padY, Math.min(window.innerHeight, overlayBottom) - top - 28);
        // Show ~5 fewer rows than full viewport so the panel stays compact
        const fitted = Math.max(6, Math.floor((available - padY) / rowH) - 5);
        el.style.maxHeight = `${Math.min(fitted, results.length) * rowH + padY}px`;
        el.style.overflowY = "auto";
      };

      const raf = window.requestAnimationFrame(fitRows);
      window.addEventListener("resize", fitRows);
      return () => {
        window.cancelAnimationFrame(raf);
        window.removeEventListener("resize", fitRows);
      };
    }, [results.length]);

    useEffect(() => {
      window.clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();

      const q = deferredQuery.trim();
      if (q.length < 2) {
        setResults([]);
        setFetching(false);
        return undefined;
      }

      timerRef.current = window.setTimeout(() => {
        const controller = new AbortController();
        abortRef.current = controller;
        setFetching(true);

        // On the TF2 site the search runs over the TF2 index, which already
        // carries prices, so the CS2 price enrichment is skipped.
        const tf2Search = getActiveGame() === "tf2";
        fetch("search_items.php?q=" + encodeURIComponent(q) + "&limit=48" + (tf2Search ? "&game=tf2" : ""), { signal: controller.signal })
          .then((response) => response.json())
          .then((payload) => {
            const items = Array.isArray(payload.items) ? payload.items : [];
            return (tf2Search ? Promise.resolve(items) : enrichSearchPrices(items, controller.signal)).then((enriched) => {
              if (!controller.signal.aborted) {
                setResults(enriched);
              }
            });
          })
          .catch((error) => {
            if (error.name !== "AbortError") setResults([]);
          })
          .finally(() => {
            if (!controller.signal.aborted) setFetching(false);
          });
      }, 120);

      return () => {
        window.clearTimeout(timerRef.current);
        if (abortRef.current) abortRef.current.abort();
      };
    }, [deferredQuery]);

    return (
      <div className="srch-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="srch-box">
          <div className="srch-input-row">
            <i className="fa-solid fa-magnifying-glass srch-icon" />
            <input
              ref={inputRef}
              className="srch-input"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={getActiveGame() === "tf2" ? "Search hats, unusuals, weapons..." : "Search skins, cases, stickers..."}
              autoComplete="off"
              spellCheck={false}
            />
            {fetching && <i className="fa-solid fa-spinner fa-spin srch-spin" />}
            <button className="srch-close" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
          </div>

          {results.length > 0 && (
            <div className="srch-results" ref={resultsRef}>
              {results.map((item) => (
                <SearchResultRow key={item.market_hash_name} item={item} onClose={onClose} />
              ))}
            </div>
          )}

          {/* Nothing typed yet: the items this browser opened recently, so the
              usual "back to the skin I was just looking at" is one click. */}
          {query.trim().length < 2 && recent.length > 0 && (
            <div className="srch-results srch-results-recent">
              <div className="srch-section-head">
                <span>{t("search_recentlyViewed")}</span>
                <button
                  type="button"
                  className="srch-section-clear"
                  onClick={() => setRecent(CSPrefs.clearRecentItems())}
                >
                  {t("search_clearRecent")}
                </button>
              </div>
              {recent.map((item) => (
                <SearchResultRow key={item.market_hash_name} item={item} onClose={onClose} />
              ))}
            </div>
          )}

          {query.trim().length >= 2 && !fetching && results.length === 0 && (
            <div className="srch-empty">No items found for "{query}"</div>
          )}
        </div>
      </div>
    );
  }

  const PRICE_NOTIFICATIONS_KEY = "cs2_price_notifications";
  const STEAM_SESSION_CACHE_KEY = "cs2_steam_session_cache";
  const STEAM_SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
  const SOFT_NAV_HARD_PAGES = new Set([
    "login.html",
    "signup.html",
    "register.html",
  ]);

  function readCachedSteamSession() {
    try {
      const raw = sessionStorage.getItem(STEAM_SESSION_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const cachedAt = Number(parsed.cached_at || 0);
      if (cachedAt > 0 && (Date.now() - cachedAt) > STEAM_SESSION_CACHE_TTL_MS) {
        return null;
      }
      return {
        authenticated: Boolean(parsed.authenticated),
        user: parsed.user || null,
        oauth: {
          google: Boolean(parsed.oauth?.google),
          discord: Boolean(parsed.oauth?.discord),
        },
        cached_at: cachedAt || Date.now(),
      };
    } catch (_error) {
      return null;
    }
  }

  function writeCachedSteamSession(session) {
    try {
      sessionStorage.setItem(STEAM_SESSION_CACHE_KEY, JSON.stringify({
        authenticated: Boolean(session?.authenticated),
        user: session?.user || null,
        oauth: {
          google: Boolean(session?.oauth?.google),
          discord: Boolean(session?.oauth?.discord),
        },
        cached_at: Date.now(),
      }));
    } catch (_error) {}
  }

  function clearCachedSteamSession() {
    try {
      sessionStorage.removeItem(STEAM_SESSION_CACHE_KEY);
    } catch (_error) {}
  }

  function readAuthRedirectFlag() {
    try {
      return String(new URLSearchParams(window.location.search).get("auth") || "").toLowerCase();
    } catch (_error) {
      return "";
    }
  }

  function stripAuthRedirectFlagFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (!params.has("auth")) return;
      params.delete("auth");
      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", nextUrl);
    } catch (_error) {}
  }

  function isAuthRedirectFlag(flag) {
    return ["success", "logout", "error", "failed", "cancelled", "profile_error"].includes(String(flag || "").toLowerCase());
  }

  function readStoredArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_error) {
      return [];
    }
  }

  function writeStoredArray(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_error) {}
  }

  function formatNotificationTime(timestamp) {
    const age = Math.max(0, Date.now() - Number(timestamp || 0));
    const minutes = Math.floor(age / 60000);
    if (minutes < 1) return "now";
    if (minutes < 60) return minutes + "m";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "h";
    return Math.floor(hours / 24) + "d";
  }

  function notificationDirection(item) {
    if (item?.direction === "up" || item?.direction === "down") return item.direction;
    const message = String(item?.message || "").toLowerCase();
    if (message.includes("dropped below") || message.includes("fell below")) return "down";
    if (message.includes("rose above") || message.includes("went above")) return "up";
    return "up";
  }

  function WatchlistBell({ authenticated, onOpenLogin }) {
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    // An unconfirmed email address is a notification in its own right, so the
    // bell carries the same prompt the profile panel shows.
    const [pendingEmail, setPendingEmail] = useState("");
    const [verifyState, setVerifyState] = useState("");
    const menuRef = useRef(null);
    const unreadCount = authenticated ? notifications.filter((item) => !item.read).length : 0;
    const visibleNotifications = authenticated ? notifications.slice(0, 8) : [];

    const persistNotifications = (next) => {
      if (!authenticated) return;
      writeStoredArray(PRICE_NOTIFICATIONS_KEY, next);
      setNotifications(next);
      window.dispatchEvent(new CustomEvent("cs2:price-notifications-updated"));
    };

    const refresh = () => {
      if (!authenticated) {
        setNotifications([]);
        return;
      }
      setNotifications(readStoredArray(PRICE_NOTIFICATIONS_KEY));
    };

    useEffect(() => {
      if (!open) return undefined;
      const onOutside = (e) => {
        if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
      };
      document.addEventListener("mousedown", onOutside);
      return () => document.removeEventListener("mousedown", onOutside);
    }, [open]);

    useEffect(() => {
      refresh();
    }, [authenticated]);

    useEffect(() => {
      if (!authenticated) return undefined;
      const onStorage = (event) => {
        if (!event.key || event.key === PRICE_NOTIFICATIONS_KEY) refresh();
      };
      const onCustom = () => refresh();
      window.addEventListener("storage", onStorage);
      window.addEventListener("cs2:price-notifications-updated", onCustom);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("cs2:price-notifications-updated", onCustom);
      };
    }, [authenticated]);

    // Asked for as soon as the visitor is signed in (and again on open), so the
    // bell can ring for an unconfirmed address before the panel is opened.
    useEffect(() => {
      if (!authenticated) {
        setPendingEmail("");
        return undefined;
      }
      let cancelled = false;
      fetch("profile_api.php", { credentials: "same-origin", headers: { Accept: "application/json" } })
        .then((response) => response.json().catch(() => null))
        .then((payload) => {
          if (cancelled || !payload?.ok) return;
          const profile = payload.profile || {};
          const email = String(profile.email || "");
          setPendingEmail(email && !profile.email_verified_at ? email : "");
        })
        .catch(() => { /* the prompt is optional; stay quiet */ });
      return () => { cancelled = true; };
    }, [open, authenticated]);

    const resendVerification = async () => {
      if (verifyState === "sending") return;
      setVerifyState("sending");
      try {
        const response = await fetch("profile_api.php", {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          body: new URLSearchParams({ action: "resend_verification" }),
        });
        const payload = await response.json().catch(() => null);
        setVerifyState(payload?.ok ? "sent" : "error");
      } catch (_error) {
        setVerifyState("error");
      }
    };

    const markAllRead = () => {
      persistNotifications(notifications.map((item) => ({ ...item, read: true })));
    };

    const markNotificationRead = (id, event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      persistNotifications(notifications.map((item) => (
        item.id === id ? { ...item, read: true } : item
      )));
    };

    const clearAllNotifications = () => {
      persistNotifications([]);
    };

    // An unconfirmed address counts as one unread item and makes the bell ring
    // until the link in the email is used.
    const needsVerify = authenticated && Boolean(pendingEmail);
    const badgeCount = unreadCount + (needsVerify ? 1 : 0);

    return (
      <div ref={menuRef} className={classNames("nav-alert-menu", open && "open")}>
        <button
          type="button"
          className={classNames(
            "nav-alert-trigger",
            (notifications.length > 0 || needsVerify) && "has-notifications",
            needsVerify && "is-ringing"
          )}
          aria-label={needsVerify ? "Open notifications: confirm your email address" : "Open price alert notifications"}
          onClick={() => setOpen((current) => !current)}
        >
          <i className={badgeCount ? "fa-solid fa-bell" : "fa-regular fa-bell"} />
          {badgeCount > 0 && <span className="nav-alert-badge">{badgeCount > 9 ? "9+" : badgeCount}</span>}
        </button>

        {open && (
          <div className="nav-alert-dropdown">
            <div className="nav-alert-head">
              <div className="nav-alert-head-copy">
                <strong>Notifications</strong>
                {authenticated && notifications.length > 0 ? (
                  <span className="nav-alert-count">{notifications.length}</span>
                ) : null}
              </div>
              {authenticated && notifications.length > 0 ? (
                <div className="nav-alert-head-actions">
                  {unreadCount > 0 ? (
                    <button type="button" className="nav-alert-action" onClick={markAllRead}>
                      <i className="fa-solid fa-check-double" aria-hidden="true" />
                      Mark as read
                    </button>
                  ) : null}
                  <button type="button" className="nav-alert-action danger" onClick={clearAllNotifications}>
                    <i className="fa-solid fa-trash-can" aria-hidden="true" />
                    Clear all
                  </button>
                </div>
              ) : null}
            </div>

            {authenticated && pendingEmail ? (
              <div className="nav-alert-verify">
                <span className="nav-alert-verify-icon" aria-hidden="true">
                  <i className="fa-regular fa-envelope" />
                </span>
                <span className="nav-alert-verify-copy">
                  <strong>Confirm your email address</strong>
                  <span>
                    {verifyState === "sent"
                      ? `Sent again to ${pendingEmail}.`
                      : verifyState === "error"
                        ? "That did not send. Try again in a moment."
                        : `We sent a link to ${pendingEmail}. It works for 24 hours.`}
                  </span>
                </span>
                <button
                  type="button"
                  className="nav-alert-verify-btn"
                  onClick={resendVerification}
                  disabled={verifyState === "sending"}
                >
                  {verifyState === "sending" ? "Sending…" : "Resend"}
                </button>
              </div>
            ) : null}

            {authenticated && visibleNotifications.length ? (
              <div className="nav-alert-list">
                {visibleNotifications.map((item) => {
                  const direction = notificationDirection(item);
                  return (
                    <div
                      key={item.id}
                      className={classNames("nav-alert-item", !item.read && "unread", direction)}
                    >
                      <a
                        className="nav-alert-item-link"
                        href={item.href || "watchlist.html"}
                        onClick={() => markNotificationRead(item.id)}
                      >
                        <span className={classNames("nav-alert-icon", direction)}>
                          <i className={direction === "down" ? "fa-solid fa-arrow-trend-down" : "fa-solid fa-arrow-trend-up"} />
                        </span>
                        <span className="nav-alert-copy">
                          <span className="nav-alert-title-row">
                            <strong>{item.title || "Price alert"}</strong>
                            {!item.read ? <span className="nav-alert-unread-dot" aria-hidden="true" /> : null}
                          </span>
                          <span className="nav-alert-message">{item.message || "A tracked price crossed your alert."}</span>
                        </span>
                        <span className="nav-alert-time">{formatNotificationTime(item.createdAt)}</span>
                      </a>
                      {!item.read ? (
                        <button
                          type="button"
                          className="nav-alert-mark-read"
                          title="Mark as read"
                          aria-label="Mark as read"
                          onClick={(event) => markNotificationRead(item.id, event)}
                        >
                          <i className="fa-solid fa-check" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : needsVerify ? null : (
              <div className="nav-alert-empty">
                <span className="nav-alert-empty-icon"><i className="fa-regular fa-bell" /></span>
                <strong>{authenticated ? "No price alerts yet" : "Sign in for alerts"}</strong>
                <span>{authenticated
                  ? "Set alerts on your watchlist to get notified here."
                  : "Log in with Steam to receive price notifications."}</span>
              </div>
            )}

            <div className="nav-alert-footer">
              {authenticated ? (
                <a href="watchlist.html">Open watchlist</a>
              ) : (
                <button
                  type="button"
                  className="nav-alert-login-trigger"
                  onClick={() => {
                    setOpen(false);
                    if (typeof onOpenLogin === "function") {
                      onOpenLogin();
                      return;
                    }
                    window.dispatchEvent(new CustomEvent("cs2:open-login-modal"));
                  }}
                >
                  <i className="fa-brands fa-steam" aria-hidden="true" /> Login with Steam
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function seriesSeed(source) {
    return Array.from(String(source || "spark")).reduce(
      (seed, character, index) => (seed + character.charCodeAt(0) * (index + 7)) % 9973,
      173
    );
  }

  function seededNoise(seed, index) {
    const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function createSparkData(points, up, seedSource) {
    const seed = seriesSeed(seedSource);
    const drift = up ? 0.78 : -0.74;
    let value = 52 + (seed % 11);

    return Array.from({ length: points }, (_, index) => {
      value += drift + (seededNoise(seed, index) - 0.5) * 5.4;
      return Number(value.toFixed(2));
    });
  }

  function buildSparklinePaths(series, width = 160, height = 44) {
    const padX = 2;
    const padTop = 5;
    const padBottom = 7;
    const chartWidth = width - padX * 2;
    const chartHeight = height - padTop - padBottom;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;
    const points = series.map((value, index) => {
      const x = Number((padX + (index / (series.length - 1 || 1)) * chartWidth).toFixed(2));
      const y = Number((padTop + (chartHeight - ((value - min) / range) * chartHeight)).toFixed(2));
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    });
    const linePath = points.join(" ");
    const areaBottom = height - padBottom;
    const areaPath = `${linePath} L ${width - padX} ${areaBottom} L ${padX} ${areaBottom} Z`;
    return { areaPath, linePath };
  }

  function SparklineCanvas({ up, points = 18, seed = "spark" }) {
    const series = createSparkData(points, up, seed);
    const { areaPath, linePath } = buildSparklinePaths(series);
    const stroke = up ? "#22c55e" : "#ef4444";
    const fill = up ? "rgba(34, 197, 94, 0.18)" : "rgba(239, 68, 68, 0.16)";

    return (
      <svg
        className="sparkline"
        viewBox="0 0 160 44"
        overflow="visible"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path className="sparkline-area" d={areaPath} fill={fill} />
        <path
          className="sparkline-line"
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  function FeaturedPreview({ items }) {
    const progressRef = useRef(null);
    const preloadRef = useRef([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const [fadeClass, setFadeClass] = useState("");
    const autoAdvanceMs = 4600;
    const fadeDurationMs = 260;
    const catalog = Array.isArray(items) ? items.filter(Boolean) : [];

    useEffect(() => {
      preloadRef.current = catalog.map((item) => {
        const image = new Image();
        image.decoding = "async";
        image.src = item && item.img ? item.img : "";
        return image;
      });

      return () => {
        preloadRef.current = [];
      };
    }, [catalog]);

    const goToSlide = useCallback((nextIndex) => {
      if (!catalog.length) return;
      const normalized = ((nextIndex % catalog.length) + catalog.length) % catalog.length;
      if (normalized === activeIndex) return;
      setFadeClass("fade-out");
      window.setTimeout(() => {
        setActiveIndex(normalized);
        setFadeClass("fade-in");
      }, fadeDurationMs);
    }, [activeIndex, catalog.length, fadeDurationMs]);

    useEffect(() => {
      const progress = progressRef.current;
      if (!progress || !catalog.length) return undefined;

      progress.style.setProperty("--progress-duration", `${autoAdvanceMs}ms`);
      progress.classList.remove("is-animating");
      void progress.offsetWidth;
      progress.classList.add("is-animating");

      const advanceId = window.setTimeout(() => {
        goToSlide(activeIndex + 1);
      }, autoAdvanceMs);

      return () => {
        window.clearTimeout(advanceId);
      };
    }, [activeIndex, catalog, autoAdvanceMs, goToSlide]);

    useEffect(() => {
      if (!fadeClass) return undefined;
      const id = window.setTimeout(() => setFadeClass(""), fadeDurationMs);
      return () => window.clearTimeout(id);
    }, [fadeClass, fadeDurationMs]);

    const activeItem = catalog[activeIndex] || catalog[0] || { title: "", img: "", rarity: "" };

    return (
      <>
        <div
          className={classNames("featured-preview", activeItem.rarity, fadeClass)}
          id="featuredPreview"
        >
          <img
            id="featuredImage"
            src={activeItem.img}
            alt={activeItem.title}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        </div>

        <div className="featured-progress">
          <span id="progressBar" ref={progressRef} />
        </div>

        <div className="featured-dots" role="tablist" aria-label="Featured items">
          {catalog.map((entry, index) => (
            <button
              key={`${entry.title}-${index}`}
              type="button"
              className={classNames("featured-dot", index === activeIndex && "active")}
              aria-label={`Show ${entry.title}`}
              aria-selected={index === activeIndex}
              onClick={() => goToSlide(index)}
            />
          ))}
        </div>

        <div className="skin-info">
          <div className="skin-title" id="featuredTitle">
            {activeItem.title}
          </div>

          {(activeItem.href || activeItem.title) ? (
            <a className="view-btn" href={activeItem.href || ("item_page.php?" + new URLSearchParams({
              lookup_name: activeItem.title,
              display_name: activeItem.title,
              image: activeItem.img || "",
              type: "",
              color: "B0C3D9",
            }).toString())}>
              View Details <i className="fa-solid fa-arrow-right" />
            </a>
          ) : (
            <div className="view-btn">
              View Details <i className="fa-solid fa-arrow-right" />
            </div>
          )}
        </div>
      </>
    );
  }

  const NEWSLETTER_STAR_PATH = "M12 1.2 L14.15 9.85 L22.8 12 L14.15 14.15 L12 22.8 L9.85 14.15 L1.2 12 L9.85 9.85 Z";

  const NEWSLETTER_BURST_PIECES = [
    { type: "circle", x: -26, y: -16, s: 6, c: "#60a5fa", d: 0, r: 0 },
    { type: "star", x: 20, y: -22, s: 9, c: "#38bdf8", d: 0.02, r: 12 },
    { type: "star-outline", x: -6, y: -24, s: 8, c: "#7dd3fc", d: 0.04, r: -8 },
    { type: "circle", x: 28, y: 4, s: 5, c: "#ffffff", d: 0.03, r: 0 },
    { type: "star", x: -30, y: 6, s: 10, c: "#60a5fa", d: 0.05, r: 20 },
    { type: "circle", x: 14, y: 20, s: 5, c: "#7dd3fc", d: 0.02, r: 0 },
    { type: "star-outline", x: 8, y: -14, s: 7, c: "#ffffff", d: 0.06, r: 16 },
    { type: "star", x: -16, y: 20, s: 8, c: "#38bdf8", d: 0.04, r: -14 },
    { type: "circle", x: 2, y: 26, s: 4, c: "#60a5fa", d: 0.07, r: 0 },
    { type: "star-outline", x: -20, y: -6, s: 7, c: "#7dd3fc", d: 0.01, r: 8 },
    { type: "circle", x: 24, y: -8, s: 4, c: "#38bdf8", d: 0.08, r: 0 },
  ];

  function FooterNewsletterBurst({ burstId }) {
    return (
      <span className="footer-newsletter-burst" aria-hidden="true">
        {NEWSLETTER_BURST_PIECES.map((piece, index) => (
          <span
            key={`${burstId}-${index}`}
            className={classNames("footer-newsletter-burst-piece", `is-${piece.type}`)}
            style={{
              "--x": `${piece.x}px`,
              "--y": `${piece.y}px`,
              "--s": `${piece.s}px`,
              "--c": piece.c,
              "--d": `${piece.d}s`,
              "--r": `${piece.r}deg`,
            }}
          >
            {piece.type === "circle" ? null : (
              <svg viewBox="0 0 24 24" focusable="false">
                <path
                  d={NEWSLETTER_STAR_PATH}
                  fill={piece.type === "star" ? "currentColor" : "none"}
                  stroke={piece.type === "star-outline" ? "currentColor" : "none"}
                  strokeWidth={piece.type === "star-outline" ? 2.1 : 0}
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        ))}
      </span>
    );
  }

  function FooterNewsletter() {
    const { t } = useI18n();
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState("idle");
    const [message, setMessage] = useState("");
    const [burstId, setBurstId] = useState(0);
    const [popping, setPopping] = useState(false);
    const popTimerRef = useRef(null);

    useEffect(() => () => {
      if (popTimerRef.current) window.clearTimeout(popTimerRef.current);
    }, []);

    const handleSubmit = (event) => {
      event.preventDefault();
      const trimmed = String(email || "").trim();
      if (!trimmed || !trimmed.includes("@")) {
        setStatus("error");
        setMessage(t("footer_newsletterInvalidEmail"));
        return;
      }

      setStatus("loading");
      setMessage("");

      fetch("subscribe_newsletter.php", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: trimmed, source: "footer" }),
      })
        .then((response) => response.json().catch(() => null).then((payload) => ({ response, payload })))
        .then(({ response, payload }) => {
          if (!response?.ok || !payload?.success) {
            throw new Error(payload?.error || t("footer_newsletterError"));
          }
          setStatus("success");
          setMessage("");
          setBurstId((id) => id + 1);
          setPopping(true);
          if (popTimerRef.current) window.clearTimeout(popTimerRef.current);
          popTimerRef.current = window.setTimeout(() => setPopping(false), 720);
          if (!payload.already_subscribed) {
            setEmail("");
          }
        })
        .catch((error) => {
          setStatus("error");
          setMessage(error?.message || t("footer_newsletterError"));
        });
    };

    return (
      <div className="footer-newsletter">
        <form className="footer-newsletter-form" onSubmit={handleSubmit}>
          <input
            type="email"
            className="footer-newsletter-input"
            placeholder="your@email.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (status !== "idle") {
                setStatus("idle");
                setMessage("");
              }
            }}
            autoComplete="email"
            spellCheck={false}
            aria-label={t("footer_newsletterAriaLabel")}
            disabled={status === "loading"}
          />
          <span className="footer-newsletter-btn-wrap">
            <button
              type="submit"
              className={classNames("footer-newsletter-btn", popping && "is-pop")}
              disabled={status === "loading"}
            >
              {status === "loading" ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                  <span>…</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-envelope" aria-hidden="true" />
                  <span>{status === "success" ? t("footer_subscribed") : t("footer_subscribe")}</span>
                </>
              )}
            </button>
            {burstId > 0 ? <FooterNewsletterBurst burstId={burstId} /> : null}
          </span>
        </form>
        {status === "error" && message ? (
          <p className="footer-newsletter-msg is-error">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  const FOOTER_COLUMN_TITLE_KEYS = {
    Browse: "footer_colBrowse",
    Features: "footer_colFeatures",
    Guides: "footer_colGuides",
  };

  const FOOTER_LINK_LABEL_KEYS = {
    Rifles: "nav_rifles",
    Pistols: "nav_pistols",
    SMGs: "nav_smgs",
    Heavy: "nav_heavy",
    Rare: "nav_rare",
    Deals: "nav_deals",
    "3D Viewer": "footer_viewer3d",
    Database: "footer_database",
    Watchlist: "common_watchlist",
    "Care Package": "nav_carePackage",
    Collections: "nav_collections",
    Cases: "nav_cases",
    Armory: "footer_armory",
    "Market Data": "footer_marketData",
  };

  function LangFlag({ lang }) {
    if (!lang) return null;
    if (lang.flagCode) {
      return (
        <span className={"lang-flag fi fi-" + lang.flagCode} aria-hidden="true" />
      );
    }
    return <span className="lang-flag" aria-hidden="true">{lang.flag || "🌐"}</span>;
  }

  function LanguageSwitcher() {
    const { t, language, languages, setLanguage } = useI18n();
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
      if (!open) return undefined;
      const onDocClick = (event) => {
        if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
      };
      const onKey = (event) => {
        if (event.key === "Escape") setOpen(false);
      };
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDocClick);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);

    const current = languages.find((l) => l.code === language) || languages[0] || { flag: "🌐", name: language };

    return (
      <div className="lang-switcher" ref={rootRef}>
        {/* The flag and language name say what this is; the globe + "LANGUAGE"
            caption above them was pure repetition. The trigger keeps its
            aria-label so screen readers still get the wording. */}
        <button
          type="button"
          className="lang-switcher-trigger"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t("lang_selectLanguage")}
        >
          <LangFlag lang={current} />
          <span className="lang-name">{current.name}</span>
          <i className={classNames("fa-solid fa-chevron-up lang-switcher-caret", open && "is-open")} aria-hidden="true" />
        </button>

        {open ? (
          <ul className="lang-switcher-menu" role="listbox" aria-label={t("lang_selectLanguage")}>
            {languages.map((lang) => (
              <li key={lang.code} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={lang.code === language}
                  className={classNames("lang-switcher-option", lang.code === language && "is-active")}
                  onClick={() => {
                    setLanguage(lang.code);
                    setOpen(false);
                  }}
                >
                  <LangFlag lang={lang} />
                  <span className="lang-name">{lang.name}</span>
                  {lang.code === language ? <i className="fa-solid fa-check lang-switcher-check" aria-hidden="true" /> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  function Footer() {
    const year = new Date().getFullYear();
    const { t } = useI18n();
    const game = useActiveGame();

    // Hard-load: start the info-page footer enter animation once chrome mounts.
    // Soft-nav replays via replayInfoFooterEnter() from softNavigate.
    useEffect(() => {
      if (isInfoNoChatPage()) {
        replayInfoFooterEnter();
      }
    }, []);

    return (
      <footer className="site-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <a
              href={gameHome(game)}
              className={classNames("footer-logo-link", game === "tf2" && "logo-tf")}
              aria-label={game === "tf2" ? "TF2 Market home" : "CS2 Market home"}
              data-soft-nav={game === "tf2" ? "off" : undefined}
            >
              <GameWordmark game={game} decorative />
            </a>
            <p>{t("footer_tagline")}</p>
            <FooterNewsletter />
          </div>

          {data.footerColumns.map((column) => (
            <div
              className={classNames("footer-col", column.title === "Browse" && "footer-col--browse")}
              key={column.title}
            >
              <h4>{t(FOOTER_COLUMN_TITLE_KEYS[column.title]) || column.title}</h4>
              <nav className="footer-col-links" aria-label={column.title}>
                {column.links.map((link) => (
                  <a href={link.href} key={link.label}>
                    {FOOTER_LINK_LABEL_KEYS[link.label] ? t(FOOTER_LINK_LABEL_KEYS[link.label]) : link.label}
                  </a>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="footer-bottom">
          <span className="footer-copy">
            {t("footer_copyright", { year })}
          </span>
          <nav className="footer-bottom-links" aria-label="Footer">
            <a href="index.html">{t("footer_home")}</a>
            <a href="about.html">{t("footer_about")}</a>
            <a href="contact.html">{t("footer_contact")}</a>
          </nav>
          <DesktopModeToggle />
          <LanguageSwitcher />
        </div>
      </footer>
    );
  }

  /**
   * Footer switch between the phone layout and the PC one.
   *
   * Phones only: on a real desktop there is nothing to switch to. It cannot key
   * off the viewport, because desktop mode reports 1440px on a phone too - the
   * whole point - so it asks the hardware instead (screen width / coarse
   * pointer), which desktop mode does not change.
   *
   * Without this the mode is a trap: ?desktop=1 is remembered, and the only way
   * back would be knowing to type ?desktop=0.
   */
  function DesktopModeToggle() {
    const { t } = useI18n();
    const [isHandheld, setIsHandheld] = useState(false);
    const enabled = Boolean(window.CS2DesktopMode?.enabled);

    useEffect(() => {
      try {
        const narrowScreen = (window.screen?.width || window.innerWidth) <= 900;
        const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
        setIsHandheld(Boolean(narrowScreen || coarse));
      } catch (_error) {
        setIsHandheld(false);
      }
    }, []);

    if (!isHandheld) return null;

    const setMode = (next) => {
      try {
        window.localStorage.setItem("cs2_force_desktop", next ? "1" : "0");
      } catch (_error) {}
      // Drop any ?desktop= already in the URL so it cannot re-apply the old
      // choice on the way back in.
      const url = new URL(window.location.href);
      url.searchParams.delete("desktop");
      window.location.replace(url.toString());
    };

    return (
      <button
        type="button"
        className="footer-view-toggle"
        onClick={() => setMode(!enabled)}
      >
        {enabled ? t("footer_mobileView") : t("footer_desktopView")}
      </button>
    );
  }

  const EMAIL_AUTH_UNAVAILABLE = {
    signin: "Email sign-in isn't available yet. Continue with Steam.",
    signup: "Email accounts aren't available yet. Continue with Steam to create your session.",
    forgot: "Password reset isn't available yet. Continue with Steam to sign in.",
  };

  function sessionUserInitials(user) {
    const name = sessionDisplayName(user);
    if (!name || name === "Google" || name === "Discord" || name === "Steam") return "U";
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  function sessionProviderLabel(user) {
    const provider = String(user?.provider || "steam").toLowerCase();
    if (provider === "google") return "Google";
    if (provider === "discord") return "Discord";
    if (provider === "email") return "email";
    return "Steam";
  }

  function sessionDisplayName(user) {
    const name = String(
      user?.persona_name || user?.display_name || user?.name || user?.email || ""
    ).trim();
    return name || sessionProviderLabel(user);
  }

  function sessionAvatarUrl(user) {
    return String(user?.avatar || user?.picture || user?.avatarfull || "").trim();
  }

  function SessionAvatarImage({ user, className }) {
    const src = sessionAvatarUrl(user);
    if (!src) {
      return <span className={classNames("nav-profile-fallback", className)}>{sessionUserInitials(user)}</span>;
    }
    return (
      <img
        src={src}
        alt=""
        className={className}
        referrerPolicy="no-referrer"
      />
    );
  }

  function sessionIsSteamUser(user) {
    if (!user) return false;
    const provider = String(user.provider || "steam").toLowerCase();
    const steamId = String(user.steamid || "").replace(/\D+/g, "");
    return (provider === "" || provider === "steam") && steamId.length >= 17;
  }

  function authReturnTo() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function LoginModal({ open, onClose, loginHref, googleHref, discordHref, googleEnabled, discordEnabled }) {
    const [mode, setMode] = useState("signin");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [formError, setFormError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const emailRef = useRef(null);
    const closeRef = useRef(null);

    useEffect(() => {
      if (!open) return undefined;
      setMode("signin");
      setEmail("");
      setPassword("");
      setConfirm("");
      setShowPassword(false);
      setShowConfirm(false);
      setFormError("");
    }, [open]);

    useEffect(() => {
      if (!open) return undefined;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const onKey = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      };
      document.addEventListener("keydown", onKey);
      const frame = window.requestAnimationFrame(() => {
        if (emailRef.current) {
          emailRef.current.focus();
        } else if (closeRef.current) {
          closeRef.current.focus();
        }
      });
      return () => {
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = previousOverflow;
        window.cancelAnimationFrame(frame);
      };
    }, [open, mode, onClose]);

    if (!open) return null;

    const title = mode === "signup"
      ? "Create Account"
      : mode === "forgot"
        ? "Reset Password"
        : "Welcome Back";
    const submitLabel = mode === "signup"
      ? "Create Account"
      : mode === "forgot"
        ? "Send Reset Link"
        : "Sign In";

    const switchMode = (next) => {
      setMode(next);
      setFormError("");
      setPassword("");
      setConfirm("");
      setShowPassword(false);
      setShowConfirm(false);
    };

    const handleSubmit = async (event) => {
      event.preventDefault();
      if (submitting) return;

      const trimmed = String(email || "").trim();
      if (!trimmed) {
        setFormError("Enter an email address, or continue with Steam.");
        return;
      }

      // Password reset needs outbound mail, which is not set up yet.
      if (mode === "forgot") {
        setFormError(EMAIL_AUTH_UNAVAILABLE.forgot);
        return;
      }
      if (mode === "signup" && password !== confirm) {
        setFormError("Those passwords do not match.");
        return;
      }

      setFormError("");
      setSubmitting(true);
      try {
        const response = await fetch("auth_email.php", {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          body: new URLSearchParams({ action: mode, email: trimmed, password }),
        });
        const payload = await response.json().catch(() => null);

        if (!payload || !payload.ok) {
          setFormError(payload?.error || "Sign-in failed. Try again.");
          return;
        }

        // The session cookie is set now. A reload is the cheapest way to get
        // every mounted navbar/profile component onto the new session.
        //
        // On signup, land on the profile panel: it carries the "confirm your
        // email" prompt and the resend button. verification_sent === false
        // means the account exists but the mail bounced off the MTA, which the
        // visitor needs to know rather than waiting for a message forever.
        if (mode === "signup") {
          const flag = payload.verification_sent === false ? "&verify=notsent" : "";
          window.location.assign(crossSiteHref(`index.html?panel=profile${flag}`));
          return;
        }
        window.location.reload();
      } catch (_error) {
        setFormError("Could not reach the server. Check your connection.");
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div
        className="cs2-login-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className="cs2-login-modal cs2-login-modal--auth"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cs2-login-title"
        >
          <div className="cs2-login-panel">
          <div className="cs2-login-head">
            <h2 id="cs2-login-title" className="cs2-login-title">{title}</h2>
            <button
              ref={closeRef}
              type="button"
              className="cs2-login-close"
              aria-label="Close login"
              onClick={onClose}
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>

          <form className="cs2-login-form" onSubmit={handleSubmit} noValidate>
            <div className="cs2-login-field">
              <label className="cs2-login-label" htmlFor="cs2-login-email">Email address</label>
              <input
                ref={emailRef}
                id="cs2-login-email"
                className="cs2-login-input"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (formError) setFormError("");
                }}
              />
            </div>

            {mode !== "forgot" ? (
              <div className="cs2-login-field">
                <div className="cs2-login-field-head">
                  <label className="cs2-login-label" htmlFor="cs2-login-password">Password</label>
                  {mode === "signin" ? (
                    <button
                      type="button"
                      className="cs2-login-forgot"
                      onClick={() => switchMode("forgot")}
                    >
                      Forgot password?
                    </button>
                  ) : null}
                </div>
                <div className="cs2-login-input-wrap">
                  <input
                    id="cs2-login-password"
                    className="cs2-login-input"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (formError) setFormError("");
                    }}
                  />
                  <button
                    type="button"
                    className="cs2-login-eye"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    <i className={showPassword ? "fa-regular fa-eye-slash" : "fa-regular fa-eye"} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : null}

            {mode === "signup" ? (
              <div className="cs2-login-field">
                <label className="cs2-login-label" htmlFor="cs2-login-confirm">Confirm password</label>
                <div className="cs2-login-input-wrap">
                  <input
                    id="cs2-login-confirm"
                    className="cs2-login-input"
                    type={showConfirm ? "text" : "password"}
                    name="confirm"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirm}
                    onChange={(event) => {
                      setConfirm(event.target.value);
                      if (formError) setFormError("");
                    }}
                  />
                  <button
                    type="button"
                    className="cs2-login-eye"
                    aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                    onClick={() => setShowConfirm((current) => !current)}
                  >
                    <i className={showConfirm ? "fa-regular fa-eye-slash" : "fa-regular fa-eye"} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : null}

            {mode === "forgot" ? (
              <p className="cs2-login-hint">
                Email reset is not available yet. Use Steam to sign back in.
              </p>
            ) : null}

            {formError ? (
              <div className="cs2-login-error" role="alert">{formError}</div>
            ) : null}

            <button type="submit" className="cs2-login-submit" disabled={submitting}>
              {submitting ? "Working…" : submitLabel}
            </button>
          </form>

          <div className="cs2-login-switch">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("signin")}>Sign In</button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{" "}
                <button type="button" onClick={() => switchMode("signup")}>Sign Up Now</button>
              </>
            )}
          </div>

          <div className="cs2-login-divider" role="separator">
            <span>Or continue via</span>
          </div>

          <div className="cs2-login-socials">
            <a
              href={loginHref}
              className="cs2-login-social is-live"
              aria-label="Continue with Steam"
              title="Continue with Steam"
            >
              <i className="fa-brands fa-steam" aria-hidden="true" />
            </a>
            {googleEnabled && googleHref ? (
              <a
                href={googleHref}
                className="cs2-login-social is-live"
                aria-label="Continue with Google"
                title="Continue with Google"
              >
                <i className="fa-brands fa-google" aria-hidden="true" />
              </a>
            ) : (
              <button
                type="button"
                className="cs2-login-social"
                disabled
                aria-label="Google — not configured"
                title="Google login is not configured"
              >
                <i className="fa-brands fa-google" aria-hidden="true" />
              </button>
            )}
            {discordEnabled && discordHref ? (
              <a
                href={discordHref}
                className="cs2-login-social is-live"
                aria-label="Continue with Discord"
                title="Continue with Discord"
              >
                <i className="fa-brands fa-discord" aria-hidden="true" />
              </a>
            ) : (
              <button
                type="button"
                className="cs2-login-social"
                disabled
                aria-label="Discord — not configured"
                title="Discord login is not configured"
              >
                <i className="fa-brands fa-discord" aria-hidden="true" />
              </button>
            )}
          </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Avatar editor ────────────────────────────────────────────────────────
  // Discord-style "Edit Image" dialog: the picked picture sits under a round
  // window, dragging pans it, the slider zooms, the corner button rotates by
  // a quarter turn, and Apply hands back a square PNG blob of exactly what
  // the circle shows. Everything happens on a canvas, so nothing leaves the
  // browser until the person presses Apply.
  const AVATAR_EDITOR_OUTPUT = 512;
  const AVATAR_EDITOR_MAX_ZOOM = 3;

  function avatarEditorLayout(width, height) {
    const radius = Math.floor(Math.min(width, height) * 0.42);
    return { cx: width / 2, cy: height / 2, radius };
  }

  function avatarEditorScale(image, radius, zoom) {
    // At zoom 1 the picture's short side spans the circle exactly.
    const shortSide = Math.max(1, Math.min(image.naturalWidth, image.naturalHeight));
    return ((radius * 2) / shortSide) * zoom;
  }

  function avatarEditorClampOffset(image, radius, zoom, rotation, offset) {
    const scale = avatarEditorScale(image, radius, zoom);
    const quarter = Math.round(rotation / 90) % 2 !== 0;
    const halfW = ((quarter ? image.naturalHeight : image.naturalWidth) * scale) / 2;
    const halfH = ((quarter ? image.naturalWidth : image.naturalHeight) * scale) / 2;
    const maxX = Math.max(0, halfW - radius);
    const maxY = Math.max(0, halfH - radius);
    return {
      x: Math.min(maxX, Math.max(-maxX, offset.x)),
      y: Math.min(maxY, Math.max(-maxY, offset.y)),
    };
  }

  function avatarEditorDrawImage(ctx, image, centerX, centerY, scale, rotation) {
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    ctx.restore();
  }

  function AvatarEditorModal({ file, onCancel, onApply, title = "Edit Image" }) {
    const canvasRef = useRef(null);
    const stageRef = useRef(null);
    const [image, setImage] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState("");
    const dragRef = useRef(null);

    // Decode the picked file once.
    useEffect(() => {
      if (!file) return undefined;
      let url = "";
      let cancelled = false;
      try {
        url = URL.createObjectURL(file);
      } catch (_error) {
        setError("That image could not be opened.");
        return undefined;
      }
      const next = new Image();
      next.onload = () => {
        if (cancelled) return;
        setImage(next);
        setZoom(1);
        setRotation(0);
        setOffset({ x: 0, y: 0 });
        setError("");
      };
      next.onerror = () => {
        if (!cancelled) setError("That file is not an image the browser can read.");
      };
      next.src = url;
      return () => {
        cancelled = true;
        if (url) URL.revokeObjectURL(url);
      };
    }, [file]);

    // Escape closes, like the sign-in dialog.
    useEffect(() => {
      const onKey = (event) => {
        if (event.key === "Escape") onCancel();
      };
      document.addEventListener("keydown", onKey);
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = previousOverflow;
      };
    }, [onCancel]);

    // Redraw on every change and when the stage changes size.
    useEffect(() => {
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      if (!canvas || !stage) return undefined;

      const draw = () => {
        const width = Math.max(1, Math.round(stage.clientWidth));
        const height = Math.max(1, Math.round(stage.clientHeight));
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          canvas.style.width = `${width}px`;
          canvas.style.height = `${height}px`;
        }
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        const { cx, cy, radius } = avatarEditorLayout(width, height);
        if (image) {
          const clamped = avatarEditorClampOffset(image, radius, zoom, rotation, offset);
          const scale = avatarEditorScale(image, radius, zoom);
          avatarEditorDrawImage(ctx, image, cx + clamped.x, cy + clamped.y, scale, rotation);
        }
        // Dim everything outside the circle, then the white ring.
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(2, 6, 23, 0.68)";
        ctx.fill("evenodd");
        ctx.restore();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
        ctx.stroke();
      };

      draw();
      const observer = typeof ResizeObserver === "function" ? new ResizeObserver(draw) : null;
      if (observer) observer.observe(stage);
      else window.addEventListener("resize", draw);
      return () => {
        if (observer) observer.disconnect();
        else window.removeEventListener("resize", draw);
      };
    }, [image, zoom, rotation, offset]);

    const onPointerDown = (event) => {
      if (!image) return;
      event.preventDefault();
      dragRef.current = { startX: event.clientX, startY: event.clientY, origin: offset };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (_error) {}
    };
    const onPointerMove = (event) => {
      const drag = dragRef.current;
      if (!drag || !image || !stageRef.current) return;
      const { radius } = avatarEditorLayout(stageRef.current.clientWidth, stageRef.current.clientHeight);
      setOffset(avatarEditorClampOffset(image, radius, zoom, rotation, {
        x: drag.origin.x + (event.clientX - drag.startX),
        y: drag.origin.y + (event.clientY - drag.startY),
      }));
    };
    const onPointerUp = () => {
      dragRef.current = null;
    };

    const onWheel = (event) => {
      if (!image) return;
      event.preventDefault();
      const step = event.deltaY < 0 ? 0.1 : -0.1;
      setZoom((current) => Math.min(AVATAR_EDITOR_MAX_ZOOM, Math.max(1, Number((current + step).toFixed(2)))));
    };

    const rotate = () => {
      if (!image) return;
      setRotation((current) => (current + 90) % 360);
      setOffset({ x: 0, y: 0 });
    };

    const reset = () => {
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
    };

    const apply = async () => {
      if (!image || applying || !stageRef.current) return;
      setApplying(true);
      try {
        const { radius } = avatarEditorLayout(stageRef.current.clientWidth, stageRef.current.clientHeight);
        const clamped = avatarEditorClampOffset(image, radius, zoom, rotation, offset);
        const scale = avatarEditorScale(image, radius, zoom);
        const factor = AVATAR_EDITOR_OUTPUT / (radius * 2);
        const out = document.createElement("canvas");
        out.width = AVATAR_EDITOR_OUTPUT;
        out.height = AVATAR_EDITOR_OUTPUT;
        const ctx = out.getContext("2d");
        if (!ctx) throw new Error("no canvas");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        avatarEditorDrawImage(
          ctx,
          image,
          AVATAR_EDITOR_OUTPUT / 2 + clamped.x * factor,
          AVATAR_EDITOR_OUTPUT / 2 + clamped.y * factor,
          scale * factor,
          rotation
        );
        const blob = await new Promise((resolve) => out.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("no blob");
        await onApply(blob);
      } catch (_error) {
        setError("Could not prepare that image. Try another file.");
        setApplying(false);
      }
    };

    return (
      <div
        className="cs2-login-overlay cs2-avatar-editor-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onCancel();
        }}
      >
        <div className="cs2-avatar-editor" role="dialog" aria-modal="true" aria-labelledby="cs2-avatar-editor-title">
          <div className="cs2-avatar-editor-head">
            <h2 id="cs2-avatar-editor-title">{title}</h2>
            <button type="button" className="cs2-avatar-editor-close" aria-label="Close" onClick={onCancel}>
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>

          <div
            ref={stageRef}
            className={classNames("cs2-avatar-editor-stage", image && "is-ready", dragRef.current && "is-dragging")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            <canvas ref={canvasRef} aria-label="Crop preview" />
            {!image && !error ? <span className="cs2-avatar-editor-loading">Loading…</span> : null}
            {error ? <span className="cs2-avatar-editor-error">{error}</span> : null}
          </div>

          <div className="cs2-avatar-editor-controls">
            <i className="fa-regular fa-image cs2-avatar-editor-zoom-icon is-small" aria-hidden="true" />
            <input
              type="range"
              className="cs2-avatar-editor-zoom"
              min="1"
              max={AVATAR_EDITOR_MAX_ZOOM}
              step="0.01"
              value={zoom}
              aria-label="Zoom"
              disabled={!image}
              onChange={(event) => {
                const next = Number(event.target.value) || 1;
                setZoom(next);
                if (image && stageRef.current) {
                  const { radius } = avatarEditorLayout(stageRef.current.clientWidth, stageRef.current.clientHeight);
                  setOffset((current) => avatarEditorClampOffset(image, radius, next, rotation, current));
                }
              }}
            />
            <i className="fa-regular fa-image cs2-avatar-editor-zoom-icon is-large" aria-hidden="true" />
            <button
              type="button"
              className="cs2-avatar-editor-rotate"
              aria-label="Rotate 90 degrees"
              title="Rotate"
              disabled={!image}
              onClick={rotate}
            >
              <i className="fa-solid fa-rotate-right" aria-hidden="true" />
            </button>
          </div>

          <div className="cs2-avatar-editor-foot">
            <button type="button" className="cs2-avatar-editor-reset" onClick={reset} disabled={!image}>Reset</button>
            <div className="cs2-avatar-editor-actions">
              <button type="button" className="cs2-avatar-editor-btn is-quiet" onClick={onCancel}>Cancel</button>
              <button type="button" className="cs2-avatar-editor-btn is-primary" onClick={apply} disabled={!image || applying}>
                {applying ? "Applying…" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function ProfileMenu({ steamUser, onOpenLogin }) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);
    // Signed-out account button on the AI page's phone bar: one drawn glyph
    // instead of the Steam mark.
    const isHomePhoneBar = (
      getCurrentPageName() === "index.html"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(max-width: 900px)").matches
    );

    useEffect(() => {
      if (!open) return undefined;
      const onOutside = (event) => {
        if (menuRef.current && !menuRef.current.contains(event.target)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", onOutside);
      return () => document.removeEventListener("mousedown", onOutside);
    }, [open]);

    if (!steamUser) {
      return (
        <button
          type="button"
          className="login-btn nav-login-btn"
          aria-label="Open login"
          aria-haspopup="dialog"
          onClick={onOpenLogin}
        >
          {/* The AI page's phone header uses a plain account icon; everywhere
              else the Steam mark stays in the markup. Desktop hides it in CSS
              (navbar.css) so the wide bar shows a plain "Login" label, while
              the narrow bars still collapse to the icon. */}
          {isHomePhoneBar ? (
            <span className="nav-login-icon-account"><NavGlyph name="account" /></span>
          ) : (
            <i className="fa-brands fa-steam nav-login-icon-steam" aria-hidden="true" />
          )}
          <span className="nav-login-label">Login</span>
        </button>
      );
    }

    return (
      <div ref={menuRef} className={classNames("nav-profile-menu", open && "open")}>
        <button
          type="button"
          className="nav-profile-trigger"
          aria-label="Open profile menu"
          aria-expanded={open ? "true" : "false"}
          onClick={() => setOpen((current) => !current)}
        >
          {sessionAvatarUrl(steamUser)
            ? <SessionAvatarImage user={steamUser} />
            : <span className="nav-profile-fallback">{sessionUserInitials(steamUser)}</span>}
          <span className="nav-profile-name">{sessionDisplayName(steamUser)}</span>
          <i className="fa-solid fa-chevron-down" aria-hidden="true" />
        </button>
        {open ? (
          <div className="nav-profile-dropdown">
            <div className="nav-profile-dropdown-head">
              <div className="nav-profile-dropdown-avatar">
                {sessionAvatarUrl(steamUser)
                  ? <SessionAvatarImage user={steamUser} />
                  : <span className="nav-profile-fallback">{sessionUserInitials(steamUser)}</span>}
              </div>
              <div className="nav-profile-dropdown-meta">
                <strong>{sessionDisplayName(steamUser)}</strong>
                <span>Connected via {sessionProviderLabel(steamUser)}</span>
              </div>
            </div>
            {sessionIsSteamUser(steamUser) ? (
              <a href="index.html?panel=profile#inventory" onClick={() => setOpen(false)}>
                <i className="fa-solid fa-box-open" />
                Inventory
              </a>
            ) : null}
            <a href="index.html?panel=profile" onClick={() => setOpen(false)}>
              <i className="fa-regular fa-user" />
              Profile
            </a>
            <a href="watchlist.html" onClick={() => setOpen(false)}>
              <i className="fa-regular fa-bell" />
              Watchlist
            </a>
            {/* No Theme row here: the account page's Appearance section owns
                that setting, and the bar keeps its quick light/dark button. */}
            <a href="steam_logout.php" className="nav-profile-logout" onClick={() => setOpen(false)}>
              <i className="fa-solid fa-arrow-right-from-bracket" />
              Log out
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  function useSteamSession() {
    const authFlag = useMemo(() => {
      const flag = readAuthRedirectFlag();
      if (!isAuthRedirectFlag(flag)) return "";
      clearCachedSteamSession();
      return flag;
    }, []);
    const cachedSession = authFlag ? null : readCachedSteamSession();
    const [sessionLoading, setSessionLoading] = useState(() => !cachedSession);
    const [steamSession, setSteamSession] = useState(() => (
      cachedSession || { authenticated: false, user: null, oauth: { google: false, discord: false } }
    ));
    const [sessionTick, setSessionTick] = useState(0);
    const returnTo = encodeURIComponent(authReturnTo());
    const loginHref = "steam_login.php?return_to=" + returnTo;
    const googleHref = "google_login.php?return_to=" + returnTo;
    const discordHref = "discord_login.php?return_to=" + returnTo;

    useEffect(() => {
      if (authFlag) {
        stripAuthRedirectFlagFromUrl();
      }
    }, [authFlag]);

    useEffect(() => {
      const onRefresh = () => {
        clearCachedSteamSession();
        setSessionTick((tick) => tick + 1);
      };
      window.addEventListener("cs2:steam-session-refresh", onRefresh);
      return () => {
        window.removeEventListener("cs2:steam-session-refresh", onRefresh);
      };
    }, []);

    useEffect(() => {
      let alive = true;
      const forceNetwork = Boolean(authFlag) || sessionTick > 0;

      if (!forceNetwork) {
        const freshCache = readCachedSteamSession();
        if (freshCache) {
          setSteamSession(freshCache);
          setSessionLoading(false);
        }
      } else if (authFlag) {
        setSessionLoading(true);
      }

      fetch("get_steam_session.php", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          if (!alive) return;
          const nextSession = {
            authenticated: Boolean(payload?.authenticated),
            user: payload?.user || null,
            oauth: {
              google: Boolean(payload?.oauth?.google),
              discord: Boolean(payload?.oauth?.discord),
            },
          };
          writeCachedSteamSession(nextSession);
          setSteamSession(nextSession);
          setSessionLoading(false);
          window.dispatchEvent(new CustomEvent("cs2:steam-session-updated", {
            detail: nextSession,
          }));
        })
        .catch(() => {
          if (!alive) return;
          if (forceNetwork) {
            const nextSession = { authenticated: false, user: null, oauth: { google: false, discord: false } };
            writeCachedSteamSession(nextSession);
            setSteamSession(nextSession);
          }
          setSessionLoading(false);
        });

      return () => {
        alive = false;
      };
    }, [authFlag, sessionTick]);

    return {
      authenticated: Boolean(steamSession?.authenticated),
      user: steamSession?.user || null,
      loading: sessionLoading,
      loginHref,
      googleHref,
      discordHref,
      googleEnabled: Boolean(steamSession?.oauth?.google),
      discordEnabled: Boolean(steamSession?.oauth?.discord),
    };
  }

  const NAV_CATEGORY_LABEL_KEYS = {
    pistols: "nav_pistols",
    smgs: "nav_smgs",
    heavy: "nav_heavy",
    rifles: "nav_rifles",
    rare: "nav_rare",
  };

  // ── Header contents ──────────────────────────────────────────────────────
  // Row 1 carries the site tools; row 2 is the item-category strip. Both lists
  // are rendered twice: once as the desktop rows, once inside the phone drawer
  // (which is why every entry needs an icon — the desktop rows hide them).
  // The Mark AI page stores its chats here. The drawer on every other page
  // lists them under the three hubs, so both drawers hold the same things.
  const HOME_AI_SESSIONS_KEY = "cs2_home_ai_sessions_v1";

  function readHomeAiChats(limit = 6) {
    try {
      const raw = JSON.parse(window.localStorage.getItem(HOME_AI_SESSIONS_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((entry) => entry && Array.isArray(entry.messages) && entry.messages.length > 0)
        .sort((left, right) => (Number(right.updatedAt) || 0) - (Number(left.updatedAt) || 0))
        .slice(0, limit)
        .map((entry) => ({
          id: String(entry.id || ""),
          title: String(entry.title || "New chat"),
        }))
        .filter((entry) => entry.id);
    } catch (_error) {
      return [];
    }
  }

  const NAV_TOOL_LINKS = [
    { href: "deals.html", labelKey: "nav_deals", icon: "fa-solid fa-tags" },
    { href: "skin-crafter.html", labelKey: "nav_skinCrafter", icon: "fa-solid fa-cube" },
    { href: "carepackage.html", labelKey: "nav_carePackage", icon: "fa-solid fa-gift" },
  ];

  // TF2's own tools. Deals and the drop randomiser are the same idea against
  // TF2 data; there is no Skin Crafter counterpart, so TF2 simply does not
  // carry that entry rather than linking to the CS2 one.
  const NAV_TOOL_LINKS_TF2 = [
    { href: "tf2/deals/", labelKey: "nav_deals", icon: "fa-solid fa-tags" },
    { href: "tf2/mann-up/", labelKey: "nav_dropPackage", icon: "fa-solid fa-gift" },
  ];

  function navToolLinks(game) {
    return game === "tf2" ? NAV_TOOL_LINKS_TF2 : NAV_TOOL_LINKS;
  }

  // Market Explorer is a plain link rather than a NAV_TOOL_LINKS entry, so it
  // needs its own per-game target.
  function navMarketHref(game) {
    return game === "tf2" ? "tf2/market/" : "roi.html";
  }

  // TF2's item categories, in Skinport's order. They replace the CS2 item
  // strip (Stickers / Cases / Capsules / Collections / Skins / Other) while
  // the site is in TF2 mode — those are CS2 pages and led a TF2 visitor
  // straight out of the game they picked.
  //
  // Each one is the Market Explorer filtered by ?cat=. Skinport shows twelve
  // in its bar; we show FIVE and fold the rest into More, because our row also
  // carries Deals, Drop Package and Market Explorer in front of them and the
  // TF2 labels are long ("Secondary Weapon" alone is 145px).
  //
  // Measured at 1600px, where row 1 has 918px of space: eight categories need
  // 1094px, six need 951, five need 894. Five is the number that fits, and it
  // gives TF2 the same behaviour as CS2, whose row needs 795px in the same
  // 918px. Below ~1500px both games scroll the row sideways, as designed.
  // Cut from the end so Skinport's order survives rather than being
  // cherry-picked. Re-measure before adding a sixth.
  const NAV_TF2_CATEGORY_LINKS = [
    { cat: "cosmetic", labelKey: "tf2cat_cosmetic" },
    // Unusuals are a quality rather than one of Skinport's categories, but
    // they are the headline of the TF2 market, so they sit in the bar. The
    // room came from Tool, the smallest category in the catalogue (1,042
    // items against Cosmetic's 15,745). Melee Weapon is here by request on
    // top of that, which puts the row about 20px over its 860px track at
    // 1600px - navbar.css pays for it by trimming the TF2 links' horizontal
    // padding, which is why that file and this list must move together.
    { cat: "unusual", labelKey: "tf2cat_unusual" },
    { cat: "melee", labelKey: "tf2cat_melee" },
    { cat: "primary", labelKey: "tf2cat_primary" },
    { cat: "secondary", labelKey: "tf2cat_secondary" },
  ];

  // Skinport's order still, minus the five in the bar, so Tool heads the menu
  // because that is where it sits in that order, not because it was demoted.
  const NAV_TF2_MORE_LINKS = [
    { cat: "tool", labelKey: "tf2cat_tool" },
    { cat: "crate", labelKey: "tf2cat_crate" },
    { cat: "war_paint", labelKey: "tf2cat_warPaint" },
    { cat: "taunt", labelKey: "tf2cat_taunt" },
    { cat: "package", labelKey: "tf2cat_package" },
    { cat: "craft_item", labelKey: "tf2cat_craftItem" },
    { cat: "gift", labelKey: "tf2cat_gift" },
    { cat: "strange_part", labelKey: "tf2cat_strangePart" },
    { cat: "party_favor", labelKey: "tf2cat_partyFavor" },
    { cat: "usable_item", labelKey: "tf2cat_usableItem" },
    { cat: "supply_crate", labelKey: "tf2cat_supplyCrate" },
  ];

  // Every category is a static folder of its own now (tf2/melee/,
  // tf2/war-paint/, ...), generated alongside the item pages. The ids keep
  // their underscores; the URLs use hyphens.
  function tf2CategorySlug(cat) {
    return String(cat || "").replace(/_/g, "-");
  }

  /** "war-paint" -> "war_paint", but only for a category that exists. */
  function tf2CatFromSlug(slug) {
    const want = String(slug || "").toLowerCase();
    if (!want) return "";
    const all = NAV_TF2_CATEGORY_LINKS.concat(NAV_TF2_MORE_LINKS);
    const hit = all.find((entry) => tf2CategorySlug(entry.cat) === want);
    return hit ? hit.cat : "";
  }

  // The JS twin of tf2UrlSlug() in scripts/tf2_url_helpers.php, which
  // generates the folders. Both sides must produce the same path from the
  // same item, so neither may use locale-aware or ICU transliteration: this
  // fixed table folds the accented Latin letters and everything else
  // non-ASCII is dropped. Keep the two in step.
  const TF2_URL_FOLD = {
    "À": "a", "Á": "a", "Â": "a", "Ã": "a", "Ä": "a", "Å": "a",
    "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a",
    "Ç": "c", "ç": "c",
    "È": "e", "É": "e", "Ê": "e", "Ë": "e",
    "è": "e", "é": "e", "ê": "e", "ë": "e",
    "Ì": "i", "Í": "i", "Î": "i", "Ï": "i",
    "ì": "i", "í": "i", "î": "i", "ï": "i",
    "Ñ": "n", "ñ": "n",
    "Ò": "o", "Ó": "o", "Ô": "o", "Õ": "o", "Ö": "o", "Ø": "o",
    "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o", "ø": "o",
    "Ù": "u", "Ú": "u", "Û": "u", "Ü": "u",
    "ù": "u", "ú": "u", "û": "u", "ü": "u",
    "Ý": "y", "ý": "y", "ÿ": "y",
  };

  function tf2UrlSlug(name, effect) {
    const eff = String(effect || "").trim().replace(/^★\s*/, "");
    const text = (eff ? eff + " " : "") + String(name || "").trim();
    const folded = text.replace(/[^\x00-\x7F]/g, (ch) => TF2_URL_FOLD[ch] || "");
    const slug = folded.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug || "item";
  }

  /**
   * Site-relative link to a generated TF2 item folder, or "" when this item
   * cannot have one. Only priced items get a page, and an item with no
   * category and no effect has no folder to sit in - the PHP side defaults
   * those to cosmetic/, but guessing here would hand out a 404 where the
   * caller can still fall back to the query URL, which always resolves.
   */
  function tf2ItemHref(name, effect, category) {
    if (!String(name || "").trim()) return "";
    const eff = String(effect || "").trim();
    const cat = String(category || "").trim();
    if (!eff && !cat) return "";
    const segment = eff ? "unusual" : tf2CategorySlug(cat.toLowerCase());
    return `tf2/${segment}/${tf2UrlSlug(name, eff)}/`;
  }

  function tf2CategoryHref(entry) {
    return `tf2/${tf2CategorySlug(entry.cat)}/`;
  }

  // Each category is illustrated by the FIRST item the Market Explorer shows
  // for it — Gift is Secret Saxton, Primary Weapon is the Botkiller Rocket
  // Launcher, and so on. Captured from the live page per category rather than
  // picked by hand, so they match what a visitor actually lands on. The files
  // are 64px squares cut from Steam's 128px renders, centred so every icon
  // occupies the same box whatever the item's proportions.
  //
  // They are WHITE SILHOUETTES, not the colour renders: the item's alpha mask
  // filled solid white, so they read as one glyph family with the CS2 weapon
  // icons rather than as fifteen unrelated pictures. That also means the
  // existing light-mode rule — filter: brightness(0) on .nav-menu-glyph inside
  // the panel — flips them to dark on a light panel with no extra CSS.
  //
  // The internal detail is cut as TRANSPARENT GAPS rather than painted black,
  // and that is not a style choice: brightness(0) maps every colour to black
  // but leaves alpha alone, so black lines would disappear into the black
  // silhouette in light mode. Gaps show the panel through and so read in both
  // themes. The outer edge is hard-thresholded rather than anti-aliased,
  // because the soft version smudged at the 20px the menu actually renders.
  //
  // They will drift as the market re-sorts. That is acceptable for a menu
  // glyph; re-capture if a category ever looks wrong. The Market Explorer's
  // default sort is "Most listed"; the other session will flag a change.
  const TF2_CAT_ICON_TAG = "20260927-tf2-cat-icons-3";

  function tf2CategoryIcon(entry) {
    return `assets/icons/tf2-categories/${entry.cat}.png?v=${TF2_CAT_ICON_TAG}`;
  }

  // The category comes from the URL, and there are two shapes of it: the
  // clean folder (/tf2/war-paint/) and the legacy query (?cat=war_paint),
  // which still works and still has to light the same nav entry. The clean
  // pages also publish window.__TF2_ROUTE__ = {cat}; that is read first
  // because it is the page telling us what it is, rather than us parsing it.
  function currentTf2Category() {
    try {
      const route = window.__TF2_ROUTE__;
      if (route && !Array.isArray(route) && typeof route === "object" && route.cat) {
        return String(route.cat).toLowerCase();
      }
    } catch (_error) {}
    try {
      const parts = pathSegments(window.location.pathname);
      if (parts.length === 2 && parts[0].toLowerCase() === "tf2") {
        const cat = tf2CatFromSlug(parts[1]);
        if (cat) return cat;
      }
    } catch (_error) {}
    try {
      return String(new URLSearchParams(window.location.search).get("cat") || "").toLowerCase();
    } catch (_error) {
      return "";
    }
  }

  function isTf2CategoryActive(currentPage, entry) {
    return currentPage === "tf2-market.html" && currentTf2Category() === entry.cat;
  }

  // Kept out of row 1 to keep it short, but the phone drawer is the only nav a
  // phone has, so these still belong in it. Watchlist is not here because the
  // drawer already opens with a Watchlist row of its own.
  const NAV_DRAWER_EXTRA_LINKS = [
    { href: "armory.html", labelKey: "footer_armory", icon: "fa-solid fa-shield-halved" },
    { href: "stats-db.html", labelKey: "footer_database", icon: "fa-solid fa-database" },
    { href: "data.html", labelKey: "footer_marketData", icon: "fa-solid fa-chart-column" },
  ];

  // `weaponClass` / `section` say which of the catalog route checks decides the
  // active state; a plain entry just matches its own page.
  //
  // No "Other" entry. It was a hub whose six cards - agents, charms, patches,
  // graffiti, pins, music kits - are all listed here in their own right, so it
  // only ever led somewhere this strip already goes. other.html still answers
  // for anyone holding the link; nothing points at it.
  const NAV_CATEGORY_LINKS = [
    { href: "knives.html", labelKey: "icat_knives", icon: "fa-solid fa-khanda", weaponClass: "knives" },
    { href: "gloves.html", labelKey: "icat_gloves", icon: "fa-solid fa-mitten", weaponClass: "gloves" },
    { href: "pistols.html", labelKey: "nav_pistols", icon: "fa-solid fa-gun", weaponClass: "pistols" },
    { href: "rifles.html", labelKey: "nav_rifles", icon: "fa-solid fa-bolt", weaponClass: "rifles" },
    { href: "smgs.html", labelKey: "nav_smgs", icon: "fa-solid fa-burst", weaponClass: "smgs" },
    { href: "heavy.html", labelKey: "nav_heavy", icon: "fa-solid fa-fire", weaponClass: "heavy" },
    { href: "agents.html", labelKey: "icat_agents", icon: "fa-solid fa-user-secret", section: "agents" },
    { href: "charms.html", labelKey: "icat_charms", icon: "fa-solid fa-link", section: "charms" },
    { href: "stickers.html", labelKey: "nav_stickers", icon: "fa-solid fa-sticky-note", section: "stickers" },
    { href: "cases.html", labelKey: "nav_cases", icon: "fa-solid fa-box-open", cases: true },
    { href: "collections.html", labelKey: "nav_collections", icon: "fa-solid fa-layer-group", collections: true },
    { href: "patches.html", labelKey: "icat_patches", icon: "fa-solid fa-certificate", section: "patches" },
    { href: "graffiti.html", labelKey: "icat_graffiti", icon: "fa-solid fa-spray-can", section: "graffiti" },
    { href: "pins.html", labelKey: "icat_pins", icon: "fa-solid fa-thumbtack", section: "pins" },
    { href: "music.html", labelKey: "icat_musicKits", icon: "fa-solid fa-music", section: "music" },
  ];

  /**
   * The item groups in row 1, replacing the strip that used to run underneath
   * the bar with fifteen entries side by side.
   *
   * Weapons and Others open a panel; the four in between are single links.
   * Skins and Capsules have no landing page of their own, so they open the
   * listings that hold them: every weapon finish in one catalogue view, and
   * the sticker page whose groups ARE the capsules (Katowice 2014, Cologne
   * 2015 and the rest).
   */
  /**
   * A row-1 entry that opens a panel instead of navigating.
   *
   * Closes on outside click and on Escape, and marks itself active when any of
   * its children is the page you are on, so "Weapons" stays lit while you are
   * on Rifles.
   */
  // The wordmark, used by the navbar, the phone drawer and the footer. Both
  // games ship real artwork; an earlier build set TFPRICE in Inter, which was
  // close but not the logotype — its letterforms are custom.
  //
  // logo_tf.png and logo_tf_light.png are the supplied mark cut out of its
  // black plate and placed on the same 500x200 canvas as logo.png, in the same
  // slot (glyphs at x9, y52..146), so all three drop into the existing
  // `height: 42px` rules at an identical size and baseline with no per-logo
  // sizing. The only difference between the two TF files is the "TF": white
  // for a dark bar, --logo-cs (#0b1230) for a light one. "PRICE" keeps the
  // artwork's own #0029FF in both, which reads on either background.
  //
  // Both are rendered and navbar.css shows one per context, because a
  // stylesheet cannot swap an <img src>. The drawer keeps the white one in
  // both themes: its panel stays dark. navbar.css also suppresses theme.css's
  // ::before/::after "CS"/"PRICE" wherever .logo-tf is on the link, so every
  // caller that can show TF2 must set that class.
  //
  // `decorative` is for links that already carry their own aria-label: the
  // mark then adds nothing to the accessible name.
  // Both wordmarks are 500x200 canvases whose glyphs occupy only y52..146, so
  // a CSS height of 38px renders about 18px of actual letter. That is why the
  // switcher tile is sized to the LETTERS rather than to the image box — see
  // .navbar .nav-game-trigger .nav-game-icon in navbar.css. Cropping the
  // padding out was tried and reverted: it matched the heights but doubled the
  // wordmark's width and pushed row 1 into its sideways scroll below 1600px.
  const TF_MARK_TAG = "20260927-tfprice-mark-1";
  const CS_MARK_TAG = "20260815-csprice-restore-1";
  const CS_MARK_LIGHT_TAG = "20260930-csprice-light-mark-1";

  function GameWordmark({ game, decorative }) {
    if (game !== "tf2") {
      // Same two-image pattern as TF2 below: logo.png has a WHITE "CS" that
      // disappears on a light bar, so logo_light.png carries the identical
      // artwork with that half recoloured to --logo-cs. Light mode used to
      // replace the mark with ::before/::after text, which was a different
      // typeface from the logo; this keeps the real wordmark in both themes.
      return (
        <>
          <img
            className="game-mark game-mark-dark"
            src={`logo.png?v=${CS_MARK_TAG}`}
            alt={decorative ? "" : "CSPRICE"}
          />
          <img
            className="game-mark game-mark-light"
            src={`logo_light.png?v=${CS_MARK_LIGHT_TAG}`}
            alt=""
            aria-hidden="true"
          />
        </>
      );
    }
    return (
      <>
        <img
          className="game-mark game-mark-dark"
          src={`logo_tf.png?v=${TF_MARK_TAG}`}
          alt={decorative ? "" : "TFPRICE"}
        />
        {/* The same mark recoloured for a light bar. Hidden except in light
            mode, and never part of the accessible name — the one above is. */}
        <img
          className="game-mark game-mark-light"
          src={`logo_tf_light.png?v=${TF_MARK_TAG}`}
          alt=""
          aria-hidden="true"
        />
      </>
    );
  }

  // The game switcher, immediately after the logo. Built like NavGroupMenu but
  // deliberately not that component: it is a two-option state picker, not a
  // list of destinations, so it shows the current game as its label and marks
  // the active row.
  function NavGameSwitcher({ game, authenticated = false }) {
    const { t, formatNumber } = useI18n();
    const [open, setOpen] = useState(false);
    // Starts from the baked-in figures and is replaced once the TF2 summary
    // lands. Keyed by game id so a failed fetch simply leaves the fallback.
    const [counts, setCounts] = useState(() => ({ cs2: GAMES.cs2.count, tf2: GAMES.tf2.count }));
    const wrapRef = useRef(null);
    const current = GAMES[game] || GAMES.cs2;

    // Only on first open: the file is tiny and static, but there is no reason
    // to fetch it for the many page views that never touch the switcher.
    const countsLoaded = useRef(false);
    useEffect(() => {
      if (!open || countsLoaded.current) return;
      countsLoaded.current = true;
      let cancelled = false;
      fetch("assets/data/tf2/summary.json", { cache: "no-cache" })
        .then((response) => (response.ok ? response.json() : null))
        .then((json) => {
          // distinct_items is the comparable figure; priced_items is the
          // fallback for a summary written before that field existed.
          const distinct = Number(json?.distinct_items);
          const priced = Number(json?.priced_items);
          const value = Number.isFinite(distinct) && distinct > 0 ? distinct : priced;
          if (!cancelled && Number.isFinite(value) && value > 0) {
            setCounts((prev) => ({ ...prev, tf2: value }));
          }
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }, [open]);

    useEffect(() => {
      if (!open) return undefined;
      const onOutside = (event) => {
        if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
      };
      const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onOutside);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);

    return (
      <div className={classNames("nav-game", open && "open")} ref={wrapRef}>
        <button
          type="button"
          className="nav-game-trigger"
          // .nav-links closes the phone drawer on any click inside it, which
          // shut the drawer the moment this was tapped. The drawer's own round
          // search button stops propagation for the same reason.
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
          aria-expanded={open ? "true" : "false"}
          aria-haspopup="true"
        >
          <img className="nav-game-icon" src={current.icon} alt="" aria-hidden="true" />
          <span className="nav-game-label">{current.label}</span>
          <i className="fa-solid fa-chevron-down" aria-hidden="true" />
        </button>

        {open ? (
          <div className="nav-game-panel" role="menu">
            {Object.values(GAMES).map((entry, index) => (
              <a
                className={classNames("nav-game-item", entry.id === game && "active")}
                href={gameSwitchHref(entry.home, authenticated)}
                key={entry.id}
                role="menuitem"
                aria-current={entry.id === game ? "true" : undefined}
                style={{ "--row-i": index }}
                // A game switch swaps the whole catalogue, so it is a real
                // navigation: soft-nav would keep this bar and its state
                // mounted over a page built for the other game.
                data-soft-nav="off"
                onClick={() => {
                  setOpen(false);
                  setActiveGame(entry.id);
                }}
              >
                <img className="nav-game-tile" src={entry.icon} alt="" aria-hidden="true" />
                <span className="nav-game-text">
                  {/* Game names are proper nouns and stay untranslated, the
                      same rule the item names follow. */}
                  <span className="nav-game-name">{entry.fullName}</span>
                  <span className="nav-game-count">
                    {t("nav_gameItems", { count: formatNumber(counts[entry.id] ?? entry.count) })}
                  </span>
                </span>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  // `isActive` overrides how a row decides it is current. The CS2 entries are
  // matched by page and section; the TF2 categories are all the same page and
  // differ only by ?cat=, so they need their own test.
  function NavGroupMenu({ label, items, currentPage, t, isActive }) {
    const matches = isActive || isNavCategoryActive;
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);
    const active = items.some((entry) => matches(currentPage, entry));

    // Any page change (back/forward included) closes the panel.
    useEffect(() => { setOpen(false); }, [currentPage]);

    useEffect(() => {
      if (!open) return undefined;
      const onOutside = (event) => {
        if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
      };
      const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onOutside);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);

    return (
      <div className={classNames("nav-menu", open && "open")} ref={wrapRef}>
        <button
          type="button"
          className={classNames("nav-primary-link nav-menu-trigger", active && "active")}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open ? "true" : "false"}
          aria-haspopup="true"
        >
          {label}
          <i className="fa-solid fa-chevron-down" aria-hidden="true" />
        </button>

        {open ? (
          <div className="nav-menu-panel" role="menu">
            {items.map((entry, index) => (
              <a
                className={classNames("nav-menu-item", matches(currentPage, entry) && "active")}
                href={entry.href}
                key={entry.href}
                role="menuitem"
                // Drives the per-row stagger in navbar.css.
                style={{ "--row-i": index }}
                // Soft navigation keeps the bar mounted, so without this the
                // panel stayed open over the page it had just navigated to.
                onClick={() => setOpen(false)}
              >
                {navCategoryIconSrc(entry) ? (
                  <img
                    // The CS2 glyphs are wide weapon silhouettes and the box
                    // is shaped for them (22x15). Item artwork is square, so
                    // it gets a modifier rather than being squashed into that
                    // ratio.
                    className={classNames("nav-menu-glyph", entry.iconSrc && "nav-menu-glyph-square")}
                    src={navCategoryIconSrc(entry)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <i className="fa-solid fa-layer-group" aria-hidden="true" />
                )}
                <span>{t(entry.labelKey)}</span>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  const NAV_WEAPON_GROUP_LINKS = [
    { href: "knives.html", labelKey: "icat_knives", weaponClass: "knives" },
    { href: "gloves.html", labelKey: "icat_gloves", weaponClass: "gloves" },
    { href: "pistols.html", labelKey: "nav_pistols", weaponClass: "pistols" },
    { href: "rifles.html", labelKey: "nav_rifles", weaponClass: "rifles" },
    { href: "smgs.html", labelKey: "nav_smgs", weaponClass: "smgs" },
    { href: "heavy.html", labelKey: "nav_heavy", weaponClass: "heavy" },
  ];

  const NAV_OTHER_GROUP_LINKS = [
    { href: "agents.html", labelKey: "icat_agents", section: "agents" },
    { href: "charms.html", labelKey: "icat_charms", section: "charms" },
    { href: "patches.html", labelKey: "icat_patches", section: "patches" },
    { href: "pins.html", labelKey: "icat_pins", section: "pins" },
    { href: "graffiti.html", labelKey: "icat_graffiti", section: "graffiti" },
    { href: "music.html", labelKey: "icat_musicKits", section: "music" },
    // No Collections: it has its own entry in the bar. A collection is a set
    // of weapon skins, not a class of item like the six above it, so it never
    // belonged in the same list.
  ];

  /**
   * The silhouette for a nav entry, as a URL, or "" when there is none.
   *
   * Two sources, both solid-white silhouettes so they read as one set:
   *   assets/icons/equipment  the game's own HUD art, for the weapon classes
   *                           (WEAPON_CATEGORY_ICONS, the map the weapon hub
   *                           cards use). A Deagle outline says "pistols"
   *                           better than anything drawn by hand.
   *   assets/icons/sections   traced from a real item render of each type -
   *                           an agent, a charm, a patch, a pin, a graffiti,
   *                           a music kit - by flood-filling the white
   *                           background out and keeping the rest as a white
   *                           mask (scratchpad trace_silhouettes.php). PNGs,
   *                           not SVGs: a traced bitmap silhouette with
   *                           box-filtered edges is smoother at 22x15 than
   *                           any vector outline of the same shape would be.
   */
  const NAV_SECTION_DRAWN_ICONS = {
    agents: "agent.png",
    charms: "charm.png",
    // Traced from the real item art (Howl Pin, Patch | The Boss, Winged
    // Defuser) rather than the generic pin/badge/note shapes.
    patches: "patch.png",
    pins: "pin.png",
    graffiti: "graffiti.png",
    music: "music-kit.png",
    // The NAVI Paris 2023 sticker, traced from its yellow ink.
    stickers: "sticker-navi.png",
  };

  // Collections have no "section" key — they are their own nav flag.
  const NAV_COLLECTIONS_ICON = "collection.svg";

  function navCategoryIconSrc(entry) {
    // An entry may carry its own artwork outright — the TF2 categories do,
    // each illustrated by the first item its Market Explorer lists. Checked
    // first so a ready-made path always wins over the CS2 lookups below.
    if (entry?.iconSrc) return entry.iconSrc;
    if (entry?.weaponClass && WEAPON_CATEGORY_ICONS[entry.weaponClass]) {
      return weaponEquipmentIconUrl("", entry.weaponClass);
    }
    if (entry?.collections) {
      return `assets/icons/sections/${NAV_COLLECTIONS_ICON}`;
    }
    const traced = NAV_SECTION_DRAWN_ICONS[entry?.section];
    return traced ? `assets/icons/sections/${traced}` : "";
  }

  // isWeaponNavActive folds knives and gloves into "rare", which would light up
  // both strip entries at once. The strip lists them separately, so match the
  // exact class instead and leave the grouped ones (heavy) to the shared check.
  function isWeaponClassNavActive(page, weaponClass) {
    if (weaponClass === "heavy") {
      return isWeaponNavActive(page, weaponClass);
    }
    if (page === `${weaponClass}.html`) {
      return true;
    }
    if (page !== "catalog-items.html") {
      return false;
    }
    const route = activeCatalogRoute();
    return route.section === "weapons" && route.weapon_class === weaponClass;
  }

  function isNavCategoryActive(page, entry) {
    if (page === "item_page.html") {
      const target = itemPageNavTarget();
      if (!target) return false;
      if (entry.weaponClass) return target.section === "skins" && target.weaponClass === entry.weaponClass;
      if (entry.section) return target.section === entry.section;
      return false;
    }
    if (entry.weaponClass) return isWeaponClassNavActive(page, entry.weaponClass);
    if (entry.cases) return page === "cases.html" || (page === "detail.html" && isCaseNavSectionActive());
    if (entry.collections) return page === "collections.html" || (page === "detail.html" && !isCaseNavSectionActive());
    if (entry.section) return isCatalogSectionActive(page, entry.section);
    return page === entry.href;
  }

  function Navbar() {
    const { t } = useI18n();
    const [overlayOpen, setOverlayOpen] = useState(false);
    const [loginModalOpen, setLoginModalOpen] = useState(false);
    const [routeTick, setRouteTick] = useState(0);
    const {
      authenticated,
      user: steamUser,
      loading: sessionLoading,
      loginHref,
      googleHref,
      discordHref,
      googleEnabled,
      discordEnabled,
    } = useSteamSession();
    const currentPage = getCurrentPageName();
    const game = useActiveGame();
    // On an item page, the entry the item belongs to (see itemPageNavTarget).
    const itemNavSection = currentPage === "item_page.html" ? (itemPageNavTarget()?.section || "") : "";
    const openLoginModal = useCallback(() => setLoginModalOpen(true), []);
    const closeLoginModal = useCallback(() => setLoginModalOpen(false), []);
    void routeTick;

    useEffect(() => {
      const onSoftNav = () => {
        setRouteTick((tick) => tick + 1);
      };
      window.addEventListener("cs2:soft-nav", onSoftNav);
      return () => window.removeEventListener("cs2:soft-nav", onSoftNav);
    }, []);

    useEffect(() => {
      window.addEventListener("cs2:open-login-modal", openLoginModal);
      return () => window.removeEventListener("cs2:open-login-modal", openLoginModal);
    }, [openLoginModal]);

    // Phone layout: the link row collapses behind a burger button. It closes on
    // navigation, on Escape, and when tapping outside the menu.
    const [menuOpen, setMenuOpen] = useState(false);
    // Drawer sections start folded; tapping a heading opens that one.
    const [openDrawerGroups, setOpenDrawerGroups] = useState({});
    // Read again every time the drawer opens: another tab may have chatted since.
    // Guests are skipped for the same reason the AI page skips them — it never
    // restores a guest's prior chats, so listing them here would dead-end.
    const [drawerChats, setDrawerChats] = useState([]);
    useEffect(() => {
      if (menuOpen) setDrawerChats(authenticated ? readHomeAiChats() : []);
    }, [menuOpen, authenticated]);

    // Theme sync, account -> device: only when this browser has no choice of
    // its own, so signing in never overrides what you picked here.
    useEffect(() => {
      if (!authenticated) return undefined;
      let stored = null;
      try {
        stored = window.localStorage.getItem(THEME_KEY);
      } catch (_error) { /* private mode */ }
      if (stored) return undefined;

      let cancelled = false;
      fetch("profile_api.php", { credentials: "same-origin", headers: { Accept: "application/json" } })
        .then((response) => response.json().catch(() => null))
        .then((payload) => {
          if (cancelled || !payload?.ok) return;
          const theme = String(payload.profile?.theme || "");
          if (theme && theme !== "system") applyThemeChoice(theme, { animate: false });
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }, [authenticated]);

    // The drawn glyphs replace the Font Awesome ones on phones. Rendering one or
    // the other (instead of hiding one with CSS) is what keeps them from ever
    // showing up as a pair.
    const [isPhoneBar, setIsPhoneBar] = useState(
      () => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 900px)").matches
    );
    useEffect(() => {
      if (typeof window.matchMedia !== "function") return undefined;
      const query = window.matchMedia("(max-width: 900px)");
      const sync = (event) => setIsPhoneBar(event.matches);
      query.addEventListener("change", sync);
      return () => query.removeEventListener("change", sync);
    }, []);

    useEffect(() => {
      if (!menuOpen) return undefined;
      const close = () => setMenuOpen(false);
      const onKey = (event) => { if (event.key === "Escape") close(); };
      const onClick = (event) => {
        if (!event.target?.closest?.(".navbar")) close();
      };
      window.addEventListener("cs2:soft-nav", close);
      document.addEventListener("keydown", onKey);
      document.addEventListener("click", onClick, true);
      return () => {
        window.removeEventListener("cs2:soft-nav", close);
        document.removeEventListener("keydown", onKey);
        document.removeEventListener("click", onClick, true);
      };
    }, [menuOpen]);

    // The old single row had to be measured and tightened per language because
    // every link shared one line with the search box. The two-tier header gives
    // the category strip a row of its own, which scrolls sideways when a
    // translation runs long, so nothing needs measuring any more.

    return (
      <>
      <div className={classNames("navbar", menuOpen && "nav-open")}>
        <div className="nav-left">
          <a
            className={classNames("logo", game === "tf2" && "logo-tf")}
            href={gameHome(game)}
            // The logo's hard-navigation special case below only covers
            // index.html; in TF2 mode the target is a different page, so the
            // opt-out has to be explicit or it would soft-nav instead.
            data-soft-nav={game === "tf2" ? "off" : undefined}
          >
            <GameWordmark game={game} />
          </a>

          <NavGameSwitcher game={game} authenticated={authenticated} />

          {/* Desktop row 1: every site tool spelled out, no menu to open.
              Item categories live in the strip below. The phone drawer
              repeats both lists and hides this row. */}
          <nav className="nav-primary">
            {navToolLinks(game).map((entry) => (
              <a
                className={classNames("nav-primary-link", currentPage === entry.href && "active")}
                href={entry.href}
                key={entry.href}
              >
                {t(entry.labelKey)}
              </a>
            ))}

            <a
              className={classNames(
                "nav-primary-link",
                // In TF2 the categories are the same page with a ?cat=, so
                // Market Explorer is only "current" when no category is
                // chosen — otherwise two links in the row highlight at once
                // and the more specific one is the category.
                (game === "tf2"
                  ? currentPage === "tf2-market.html" && !currentTf2Category()
                  : isMarketNavActive(currentPage)) && "active"
              )}
              href={navMarketHref(game)}
            >
              {t("nav_market")}
            </a>

            {/* TF2's own categories in place of the CS2 item strip. Everything
                from here to the end of the row is per-game: the CS2 branch is
                unchanged below. */}
            {game === "tf2" ? (
              <>
                {NAV_TF2_CATEGORY_LINKS.map((entry) => (
                  <a
                    className={classNames("nav-primary-link", isTf2CategoryActive(currentPage, entry) && "active")}
                    href={tf2CategoryHref(entry)}
                    key={entry.cat}
                  >
                    {t(entry.labelKey)}
                  </a>
                ))}

                <NavGroupMenu
                  label={t("nav_more")}
                  items={NAV_TF2_MORE_LINKS.map((entry) => ({
                    ...entry,
                    href: tf2CategoryHref(entry),
                    iconSrc: tf2CategoryIcon(entry),
                  }))}
                  currentPage={currentPage}
                  t={t}
                  isActive={(page, entry) => isTf2CategoryActive(page, entry)}
                />
              </>
            ) : (
              <>
            {/* The item groups: four links, then the two panels last so the
                menus sit together at the end of the row. */}
            <a
              className={classNames("nav-primary-link", (isStickerCatalogActive(currentPage) || itemNavSection === "stickers") && "active")}
              href="catalog-items.html?section=stickers&group=All"
            >
              {t("nav_stickers")}
            </a>

            <a
              className={classNames("nav-primary-link", (currentPage === "cases.html" || itemNavSection === "cases") && "active")}
              href="cases.html"
            >
              {t("nav_cases")}
            </a>

            <a
              className={classNames("nav-primary-link", (currentPage === "stickers.html" || itemNavSection === "capsules") && "active")}
              href="stickers.html"
            >
              {t("nav_capsules")}
            </a>

            <a
              className={classNames(
                "nav-primary-link",
                (currentPage === "collections.html" || (currentPage === "detail.html" && !isCaseNavSectionActive())) && "active"
              )}
              href="collections.html"
            >
              {t("nav_collections")}
            </a>

            {/* "Skins" is the panel, not a link beside it: a flat link to every
                finish at once said the same thing as the six weapon classes
                under it, only less usefully. */}
            <NavGroupMenu
              label={t("nav_skins")}
              items={NAV_WEAPON_GROUP_LINKS}
              currentPage={currentPage}
              t={t}
            />

            <NavGroupMenu
              label={t("nav_other")}
              items={NAV_OTHER_GROUP_LINKS}
              currentPage={currentPage}
              t={t}
            />
              </>
            )}
          </nav>

          <div className="nav-links" onClick={() => setMenuOpen(false)}>
            {/* Phone drawer header — mirrors the Mark AI sidebar so the menu is
                the same everywhere: wordmark on the left, search as a round
                button on the right. Hidden on desktop. */}
            <div className="nav-drawer-head">
              <a
                className={classNames("nav-drawer-brand", game === "tf2" && "logo-tf")}
                href={gameHome(game)}
                aria-label={game === "tf2" ? "TFPRICE" : "CSPRICE"}
                data-soft-nav={game === "tf2" ? "off" : undefined}
              >
                <GameWordmark game={game} decorative />
              </a>
              <NavGameSwitcher game={game} authenticated={authenticated} />
              <button
                type="button"
                className="nav-drawer-round"
                aria-label={t("home_search")}
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen(false);
                  setOverlayOpen(true);
                }}
              >
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              </button>
            </div>

            <div className="nav-drawer-divider" aria-hidden="true" />

            {/* Search is the round button in the drawer header — no row for it. */}

            {/* The three section hubs, same rows as the Mark AI drawer. */}
            <a className="nav-item nav-drawer-ai" href="tools.html">
              <i className="fa-solid fa-screwdriver-wrench" /> {t("nav_tools")}
            </a>

            <a className="nav-item nav-drawer-ai" href="skins.html">
              <i className="fa-solid fa-gun" /> {t("nav_skins")}
            </a>

            <a className="nav-item nav-drawer-ai" href="other.html">
              <i className="fa-solid fa-shapes" /> {t("nav_other")}
            </a>

            <a className="nav-item nav-drawer-ai" href="index.html">
              <i className="fa-regular fa-folder" /> {t("home_newProject")}
            </a>

            {/* The chats sit under the three hubs here exactly as they do in the
                Mark AI drawer. They live in localStorage, so any page can read
                them; opening one hands the id back to the AI page. */}
            <div className="nav-drawer-chats">
              <span className="nav-drawer-chats-head">{t("home_history")}</span>
              {drawerChats.length ? (
                drawerChats.map((chat) => (
                  <a
                    className="nav-item nav-drawer-chat"
                    href={`index.html?chat=${encodeURIComponent(chat.id)}`}
                    key={chat.id}
                    title={chat.title}
                  >
                    <i className="fa-regular fa-message" /> <span>{chat.title}</span>
                  </a>
                ))
              ) : (
                <a className="nav-item nav-drawer-chat" href="index.html">
                  <i className="fa-regular fa-message" /> <span>{t("home_newChat")}</span>
                </a>
              )}
            </div>

            {/* Tools, then the weapon classes under "Skins" and the rest under
                "Other" — the same split the bar's own menus use. Every section
                starts folded; its heading opens it. The drawn section/weapon
                artwork is used when there is one, the glyph is the fallback. */}
            {[
              {
                labelKey: "nav_tools",
                // Same per-game tool list as row 1, so the drawer cannot offer
                // a CS2 tool while the bar above it offers the TF2 one. The
                // Armory / Database / Market Data extras stay on both: they
                // are CS2 pages, but they are also the only place the drawer
                // surfaces them, and hiding them was not asked for.
                entries: (() => {
                  const tools = navToolLinks(game);
                  const deals = tools.find((entry) => entry.labelKey === "nav_deals");
                  const market = { href: navMarketHref(game), labelKey: "nav_market", icon: "fa-solid fa-chart-line" };
                  const rest = [...tools, ...NAV_DRAWER_EXTRA_LINKS]
                    .filter((entry) => entry.labelKey !== "nav_deals" && entry.labelKey !== "nav_market");
                  return [deals, market, ...rest].filter(Boolean);
                })(),
              },
              // In TF2 mode the drawer gets the TF2 categories as one group
              // instead of the CS2 weapon/section split, for the same reason
              // row 1 does: those sections are CS2 pages.
              ...(game === "tf2"
                ? [{
                    labelKey: "nav_categories",
                    // Same per-category artwork as the desktop More menu; the
                    // Font Awesome glyph stays as the fallback if an icon file
                    // is ever missing.
                    entries: [...NAV_TF2_CATEGORY_LINKS, ...NAV_TF2_MORE_LINKS]
                      .map((entry) => ({
                        ...entry,
                        href: tf2CategoryHref(entry),
                        iconSrc: tf2CategoryIcon(entry),
                        icon: "fa-solid fa-layer-group",
                      })),
                  }]
                : [
                    { labelKey: "nav_skins", entries: NAV_CATEGORY_LINKS.filter((entry) => entry.weaponClass) },
                    { labelKey: "nav_other", entries: NAV_CATEGORY_LINKS.filter((entry) => !entry.weaponClass) },
                  ]),
            ].map((group) => {
              const open = Boolean(openDrawerGroups[group.labelKey]);
              return (
                <div
                  className={classNames("nav-drawer-group", open && "is-open")}
                  key={group.labelKey}
                >
                  <button
                    type="button"
                    className="nav-drawer-group-toggle"
                    aria-expanded={open}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenDrawerGroups((prev) => ({
                        ...prev,
                        [group.labelKey]: !prev[group.labelKey],
                      }));
                    }}
                  >
                    <span>{t(group.labelKey)}</span>
                    <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                  </button>

                  {/* The rows stay mounted so the panel can slide open and shut;
                      the CSS animates its height. */}
                  <div className="nav-drawer-panel">
                    <div className="nav-drawer-panel-inner">
                      {group.entries.map((entry) => {
                        const drawnIcon = navCategoryIconSrc(entry);
                        const active = entry.weaponClass || entry.section || entry.cases || entry.collections
                          ? isNavCategoryActive(currentPage, entry)
                          : currentPage === entry.href;
                        return (
                          <a
                            className={classNames("nav-item", active && "active")}
                            href={entry.href}
                            key={entry.href}
                            tabIndex={open ? 0 : -1}
                            style={{ textDecoration: "none", color: "inherit" }}
                          >
                            {drawnIcon ? (
                              <img className="nav-category-icon" src={drawnIcon} alt="" loading="lazy" decoding="async" />
                            ) : (
                              <i className={entry.icon} />
                            )}
                            {" "}
                            {t(entry.labelKey)}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Pinned bottom bar, same as the AI drawer: the blue chat pill on
                the left, the account avatar on the right. */}
            <div className="nav-drawer-bottom">
              <a className="nav-drawer-new-pill" href="index.html">
                <i className="fa-regular fa-pen-to-square" aria-hidden="true" />
                <span>{t("home_newChat")}</span>
              </a>

              {steamUser ? (
                <a
                  className="nav-drawer-avatar"
                  href="login.html"
                  aria-label={sessionDisplayName(steamUser) || t("home_signedIn")}
                >
                  {sessionAvatarUrl(steamUser) ? (
                    <img src={sessionAvatarUrl(steamUser)} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <i className="fa-solid fa-user" aria-hidden="true" />
                  )}
                </a>
              ) : (
                <button
                  type="button"
                  className="nav-drawer-avatar"
                  aria-label={t("home_logIn")}
                  onClick={(event) => {
                    event.stopPropagation();
                    setMenuOpen(false);
                    openLoginModal();
                  }}
                >
                  <i className="fa-solid fa-user" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="nav-right">
          <button
            type="button"
            className="nav-burger"
            onClick={() => {
              // Phone only (the burger is hidden on desktop). On the Mark AI
              // landing page the drawer already holds the chat list plus the
              // site links, so one button opens that instead of a second menu.
              if (currentPage === "index.html") {
                window.dispatchEvent(new CustomEvent("cs2:toggle-ai-sidebar"));
                return;
              }
              setMenuOpen((open) => !open);
            }}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {isPhoneBar ? (
              <NavGlyph name={menuOpen ? "close" : "menu"} />
            ) : (
              <i className={menuOpen ? "fa-solid fa-xmark" : "fa-solid fa-bars"} />
            )}
          </button>

          {/* The model name is off the bar for now; NavModelPicker is still here
              to drop back in when the models are real. The phone header on the
              AI page keeps the private-chat toggle beside the account icon. */}

          {/* Order in the cluster: theme, bell, search, account. The theme
              button is desktop-only; phones switch from the profile menu. */}
          {!isPhoneBar ? <ThemeQuickToggle /> : null}

          <WatchlistBell
            authenticated={authenticated}
            onOpenLogin={openLoginModal}
          />

          <button
            type="button"
            className="search-container"
            onClick={() => setOverlayOpen(true)}
            aria-label="Open search"
          >
            {/* Icon first, label after — the marketplace-style search box. */}
            {isPhoneBar ? <NavGlyph name="search" /> : <i className="fa-solid fa-magnifying-glass" />}
            <span className="search-placeholder">{t("nav_searchPlaceholder")}</span>
          </button>

          {currentPage === "index.html" ? (
            <button
              type="button"
              className="nav-private-chat"
              aria-label="Private chat"
              onClick={() => window.dispatchEvent(new CustomEvent("cs2:toggle-private-chat"))}
            >
              <NavGlyph name="incognito" />
            </button>
          ) : null}

          <div className="nav-profile-slot">
            {sessionLoading ? (
              <div className="nav-profile-skeleton" aria-hidden="true">
                <span className="nav-profile-skeleton-avatar" />
                <span className="nav-profile-skeleton-text" />
                <span className="nav-profile-skeleton-chevron" />
              </div>
            ) : (
              <ProfileMenu
                steamUser={steamUser}
                onOpenLogin={openLoginModal}
              />
            )}
          </div>
        </div>

        {/* Phone: the link row opens as a left drawer, so it needs a backdrop to
            tap away like the Mark AI sidebar has. It lives inside .navbar on
            purpose — that is the stacking context the drawer is in, so it can
            dim the rest of the bar without covering the drawer itself. */}
        {menuOpen ? (
          <button
            type="button"
            className="nav-drawer-backdrop"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}
      </div>

      {/* The category strip that used to sit under the bar is gone: its fifteen
          entries are now the six groups in row 1 above (Weapons, Skins,
          Stickers, Cases, Capsules, Others). NAV_CATEGORY_LINKS still feeds the
          phone drawer, which lists every section flat. */}

      {overlayOpen && <SearchOverlay onClose={() => setOverlayOpen(false)} />}
      <LoginModal
        open={loginModalOpen}
        onClose={closeLoginModal}
        loginHref={loginHref}
        googleHref={googleHref}
        discordHref={discordHref}
        googleEnabled={googleEnabled}
        discordEnabled={discordEnabled}
      />
      </>
    );
  }

  const MARK_PAGE_GUIDES = {
    "carepackage.html": {
      id: "carepackage",
      title: "Care Package",
      subtitle: "Weekly drop explorer",
      guide: [
        "Care Package is your weekly drop explorer. Spin the deck to pull four random CS2 rewards from collections, cases, terminals, graffiti, and tools, then compare their live market values side by side.",
        "",
        "Use it to:",
        "• Discover undervalued collection skins before the market moves",
        "• Preview what a weekly reward mix could look like",
        "• Filter by item type before you spin",
        "• Jump straight to any pulled item's market page",
        "",
        "Tip: Re-spin anytime to shuffle a new mix without leaving the page.",
      ].join("\n"),
    },
    "deals.html": {
      id: "deals",
      title: "Deals",
      subtitle: "Cross-marketplace price gaps",
      guide: [
        "The Deals page compares two marketplaces head-to-head and surfaces items where the price gap is real.",
        "",
        "How it works:",
        "• Pick any two providers (Steam, Skinport, CSFloat, White.Market, DMarket, and more)",
        "• Only items with verified prices on both markets are listed",
        "• The cheaper side is highlighted so you can spot arbitrage quickly",
        "• Filter by item type, search by name, and open the cheaper listing in one click",
        "",
        "Use Deals when you already know what you want to buy and need the best place to buy it today.",
      ].join("\n"),
    },
    "skin-crafter.html": {
      id: "skincreator",
      title: "Skin Crafter",
      subtitle: "3D craft workshop",
      guide: [
        "Skin Crafter is the 3D workshop for previewing crafts before you buy stickers or list a skin.",
        "",
        "What you can do:",
        "• Inspect the weapon in 3D with realistic lighting",
        "• Search stickers and drag them onto the gun (or click-to-place on open slots)",
        "• See craft cost estimates under the sticker search bar",
        "• Preview wear tiers and how floats affect appearance",
        "",
        "Start with the default skin, search a sticker, then place it on an open slot. Great for planning crafts without spending on the market first.",
      ].join("\n"),
    },
    "login.html": {
      id: "inventory",
      title: "Inventory",
      subtitle: "Portfolio analysis",
      requiresAuth: true,
      useAi: true,
      guide: [
        "Your Inventory dashboard connects to Steam and values every marketable stack using live provider data.",
        "",
        "What's on this page:",
        "• Total portfolio estimate with switchable price modes (Steam, Skinport, CSFloat, and more)",
        "• Per-item mini price charts and latest sales in the detail window",
        "• Market / trade flags and stack counts",
        "• Click any item to open the detailed chart panel",
        "",
        "Sign in with Steam, wait for valuation to finish, then ask me again for an outlook on the items you already hold: what may rise, stall, stay liquid, and the main risks.",
      ].join("\n"),
      guideGuest: [
        "The Inventory page tracks your connected Steam items with live market valuations and mini price charts.",
        "",
        "Sign in with Steam to:",
        "• Value your full inventory across multiple price modes",
        "• Open per-item chart windows with sales history",
        "• Get an AI outlook on the future of your current stash",
        "",
        "Use the Steam login button on this page, then tap Ask Mark again once your inventory loads.",
      ].join("\n"),
      aiPrompt: "Review my Steam inventory. Analyze the future of the items I already hold — what may rise, stall, stay liquid, and the main risks. Note total € value and top holdings briefly. Do not recommend new items to buy.",
    },
  };

  // ── Clean URLs ─────────────────────────────────────────────────────────
  // Pages live at /heavy.html and, as a generated folder copy, at /heavy/
  // (scripts/build_clean_urls.php). The address bar always shows the folder
  // form; page checks are keyed by file name, so both forms map back to
  // "heavy.html". The site can sit at the domain root or under a folder
  // (/csgo_price_tracker/ on XAMPP), so the base path is detected, never assumed.
  function siteBasePath() {
    try {
      const baseEl = document.querySelector("base[href]");
      if (baseEl) return new URL(baseEl.getAttribute("href"), window.location.href).pathname;
      const shared = document.querySelector('script[src*="shared-components"]');
      if (shared) {
        const scriptPath = new URL(shared.getAttribute("src"), window.location.href).pathname;
        // Bundles are served through static.php/react/... (gzip + long cache).
        return scriptPath.replace(/(?:static\.php\/)?react\/[^/]*$/, "");
      }
    } catch (_error) {}
    return "/";
  }

  // First segment of a generated item URL: /skins/awp-dragon-lore/,
  // /stickers/sticker-apex-gold-paris-2023/ (scripts/build_item_urls.php).
  const ITEM_URL_SECTIONS = new Set([
    "skins", "stickers", "cases", "charms", "agents",
    "patches", "music-kits", "graffiti", "collectibles", "misc",
  ]);

  // First segment of a generated weapon listing: /smgs/mac-10/, /knives/karambit/
  // (scripts/build_catalog_urls.php).
  const CATALOG_URL_CLASSES = new Set([
    "pistols", "smgs", "shotguns", "lmgs", "rifles", "knives", "gloves",
  ]);

  function pathSegments(pathname) {
    const base = siteBasePath();
    let rel = String(pathname || "");
    if (base && rel.startsWith(base)) rel = rel.slice(base.length);
    return rel.replace(/^\/+/, "").split("/").filter(Boolean);
  }

  function pageNameFromPath(pathname) {
    const parts = pathSegments(pathname);
    // A generated item page is the item page, whatever the item is called -
    // page checks ("is this the item page?") must not see "awp-dragon-lore".
    if (parts.length >= 2 && ITEM_URL_SECTIONS.has(parts[0].toLowerCase())) return "item_page.html";
    // Same for a generated weapon listing: /smgs/mac-10/ IS catalog-items.html.
    if (parts.length >= 2 && CATALOG_URL_CLASSES.has(parts[0].toLowerCase())) return "catalog-items.html";
    // ...and /skin-crafter/ak-47-ice-coaled/field-tested/ IS the crafter.
    if (parts.length >= 2 && parts[0].toLowerCase() === "skin-crafter") return "skin-crafter.html";
    // TF2's clean folders. Everything downstream keys off page NAMES, so
    // these have to resolve to the same names the .html entry points use:
    // without this /tf2/deals/ reads as CS2's deals.html (wrong nav, wrong
    // page guide) and /tf2/melee/strange-jag/ reads as "strange-jag.html",
    // which is no page at all - the mini chat would not mount on it.
    if (parts.length >= 2 && parts[0].toLowerCase() === "tf2") {
      const second = parts[1].toLowerCase();
      if (second === "market") return "tf2-market.html";
      if (second === "deals") return "tf2-deals.html";
      if (second === "mann-up") return "tf2-drops.html";
      return parts.length >= 3 ? "tf2-item.html" : "tf2-market.html";
    }
    const last = parts.length ? parts[parts.length - 1] : "";
    if (!last) return "index.html";
    return /\.[A-Za-z0-9]{1,8}$/.test(last) ? last : `${last}.html`;
  }

  // ── Item pages: warm the next click ──────────────────────────────────────
  // Resting the pointer on a link to an item page (or touching it) fetches
  // that page's item_bootstrap.php answer - the exact URL react/item-page.tsx
  // asks for on mount, so it is already in the browser cache when the page
  // opens. On desktop a speculation-rules block also lets the browser prefetch
  // the page's HTML on hover and prerender the page once the click is under
  // way. Both are light on the server: the bootstrap is one cached read, and a
  // "conservative" prerender only starts on pointerdown, never on a hover.
  const ITEM_PREFETCH_RANGES = ["7D", "1M", "3M", "6M", "1Y", "ALL"];
  const itemPrefetched = new Set();
  let itemPrefetchTimer = 0;
  let itemPrefetchAnchor = null;

  function itemBootstrapUrlForAnchor(anchor) {
    let url;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch (_error) {
      return "";
    }
    if (url.origin !== window.location.origin) return "";
    const parts = pathSegments(url.pathname);
    if (parts.length < 2 || !ITEM_URL_SECTIONS.has(parts[0].toLowerCase())) return "";
    const names = window.CS2ItemNames;
    const name = names && typeof names.get === "function" ? String(names.get(`${parts[0]}/${parts[1]}/`) || "") : "";
    if (!name) return "";
    // Same parameters, same order, same values as the item page's own request
    // (scripts/build_item_urls.php uses the same rule for its <link rel=preload>).
    const stored = String(window.CSPrefs?.get("chartRange", "") || "").toUpperCase();
    return `${siteBasePath()}item_bootstrap.php?${new URLSearchParams({
      lookup_name: name,
      wear: parts[0].toLowerCase() === "skins" ? "Factory New" : "",
      range: ITEM_PREFETCH_RANGES.includes(stored) ? stored : "ALL",
    }).toString()}`;
  }

  function prefetchItemBootstrap(anchor) {
    const url = itemBootstrapUrlForAnchor(anchor);
    if (!url || itemPrefetched.has(url)) return;
    itemPrefetched.add(url);
    try {
      // Read the body to the end: a response abandoned half-way is not cached.
      fetch(url, { priority: "low", credentials: "same-origin" })
        .then((response) => response.arrayBuffer())
        .catch(() => {});
    } catch (_error) {}
  }

  function itemAnchorFrom(target) {
    return target instanceof Element ? target.closest("a[href]") : null;
  }

  function installItemPrefetch() {
    if (typeof document === "undefined" || window.__csItemPrefetchInstalled) return;
    window.__csItemPrefetchInstalled = true;
    document.addEventListener("pointerover", (event) => {
      const anchor = itemAnchorFrom(event.target);
      if (!anchor || anchor === itemPrefetchAnchor) return;
      window.clearTimeout(itemPrefetchTimer);
      itemPrefetchAnchor = anchor;
      itemPrefetchTimer = window.setTimeout(() => {
        itemPrefetchAnchor = null;
        prefetchItemBootstrap(anchor);
      }, 120);
    }, { passive: true });
    document.addEventListener("pointerout", (event) => {
      const anchor = itemAnchorFrom(event.target);
      if (!anchor || anchor !== itemPrefetchAnchor) return;
      if (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) return;
      window.clearTimeout(itemPrefetchTimer);
      itemPrefetchAnchor = null;
    }, { passive: true });
    ["pointerdown", "touchstart"].forEach((type) => {
      document.addEventListener(type, (event) => {
        const anchor = itemAnchorFrom(event.target);
        if (anchor) prefetchItemBootstrap(anchor);
      }, { passive: true });
    });

    try {
      if (typeof HTMLScriptElement === "undefined"
        || typeof HTMLScriptElement.supports !== "function"
        || !HTMLScriptElement.supports("speculationrules")) return;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      if (!document.head) return;
      // Every same-site page link, not only item pages: the host answers the
      // catalogue and section pages slowly at times (a static file took
      // seconds to start under load), so their HTML is fetched as soon as the
      // pointer rests on the link and the page is prerendered once the click
      // starts. PHP endpoints (logins, actions) are left alone.
      const base = siteBasePath();
      const pageWhere = {
        and: [
          { href_matches: `${base}*` },
          { not: { href_matches: `${base}*.php` } },
          { not: { href_matches: `${base}*.(json|js|css|png|jpg|jpeg|webp|svg|gif|txt|xml|pdf)` } },
        ],
      };
      const rules = document.createElement("script");
      rules.type = "speculationrules";
      rules.textContent = JSON.stringify({
        prefetch: [{ where: pageWhere, eagerness: "moderate" }],
        prerender: [{ where: pageWhere, eagerness: "conservative" }],
      });
      document.head.appendChild(rules);
    } catch (_error) {}
  }
  installItemPrefetch();

  function getCurrentPageName() {
    return pageNameFromPath(window.location.pathname);
  }

  // "/heavy.html" -> "/heavy/", "/index.html" -> "/", anything else untouched.
  function cleanUrlFor(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const match = parsed.pathname.match(/^(.*\/)([^/]+)\.html?$/i);
      if (!match) return parsed.href;
      const name = match[2];
      if (/^(item_page)$/i.test(name)) return parsed.href;
      parsed.pathname = name.toLowerCase() === "index" ? match[1] : `${match[1]}${name}/`;
      return parsed.href;
    } catch (_error) {
      return String(url);
    }
  }

  // The file to fetch for a URL in either form: "/heavy/" -> "/heavy.html",
  // "/" (site root) -> "/index.html".
  function htmlFileUrlFor(url) {
    try {
      const parsed = new URL(url, window.location.href);
      if (!parsed.pathname.endsWith("/")) return parsed.href;
      const base = siteBasePath();
      const parts = pathSegments(parsed.pathname);
      if (parsed.pathname === base || parsed.pathname === "/" || !parts.length) {
        parsed.pathname = `${parsed.pathname}index.html`;
      } else if (parts.length >= 2) {
        // Generated item pages are real index.html files in their own folder,
        // unlike the one-level folder copies, which mirror <name>.html.
        parsed.pathname = `${parsed.pathname}index.html`;
      } else {
        parsed.pathname = parsed.pathname.replace(/\/$/, ".html");
      }
      return parsed.href;
    } catch (_error) {
      return String(url);
    }
  }

  function showCleanUrlInAddressBar() {
    try {
      const clean = cleanUrlFor(window.location.href);
      if (clean === window.location.href) return;
      // Changing the URL to /heavy/ moves the document's base directory, so
      // every later relative fetch/image would resolve under /heavy/. Pin the
      // base to the site root first (folder copies already carry a <base>).
      if (!document.querySelector("base[href]")) {
        const base = document.createElement("base");
        base.setAttribute("href", siteBasePath());
        document.head.insertBefore(base, document.head.firstChild);
      }
      window.history.replaceState(window.history.state, "", clean);
    } catch (_error) {}
  }

  function getMarkDefaultQuickPrompts() {
    const t = window.I18N ? window.I18N.t : (key) => key;
    return [t("mark_quickPrompt1"), t("mark_quickPrompt2"), t("mark_quickPrompt3")];
  }

  function takeThreePrompts(list) {
    const cleaned = (Array.isArray(list) ? list : [])
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
    return cleaned.concat(getMarkDefaultQuickPrompts()).slice(0, 3);
  }

  function stripWearSuffix(name) {
    return String(name || "")
      .replace(/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "")
      .trim();
  }

  function weaponQuickPrompts(weapon) {
    const name = String(weapon || "").trim();
    if (!name) return null;
    return [
      `Cheapest ${name} skins right now`,
      `Best ${name} to invest in`,
      `Will ${name} skins go up?`,
    ];
  }

  function itemQuickPrompts(itemName) {
    const name = stripWearSuffix(itemName);
    if (!name) {
      return [
        "Will this skin go up in price?",
        "Best wear to buy right now",
        "Similar skins to consider",
      ];
    }
    return [
      `Will ${name} go up in price?`,
      `Best wear to buy for ${name}`,
      `Similar skins to ${name}`,
    ];
  }

  function catalogSectionPrompts(section) {
    const map = {
      stickers: [
        "Best stickers to invest in",
        "Cheapest Katowice stickers",
        "Which capsules have upside?",
      ],
      music: [
        "Cheapest music kits right now",
        "Best music kit to invest in",
        "StatTrak vs normal kit prices",
      ],
      agents: [
        "Cheapest agents right now",
        "Best agent skins to buy",
        "Which agents hold value?",
      ],
      charms: [
        "Cheapest charms right now",
        "Best charm to invest in",
        "Which keychains are hyped?",
      ],
      patches: [
        "Cheapest patches right now",
        "Best patches to collect",
        "Which patch sets hold value?",
      ],
      pins: [
        "Cheapest pins right now",
        "Best pins to collect",
        "Which pin series is undervalued?",
      ],
      graffiti: [
        "Cheapest graffiti right now",
        "Best graffiti to collect",
        "Which graffiti boxes have value?",
      ],
      weapons: [
        "Cheapest skins in this list",
        "Best skin here to invest in",
        "Which finishes look undervalued?",
      ],
    };
    return map[String(section || "").toLowerCase()] || null;
  }

  function getMarkQuickPrompts(pageName, context = {}) {
    const page = String(pageName || "").split("?")[0].toLowerCase();
    const params = context.params && typeof context.params === "object" ? context.params : {};
    const itemName = stripWearSuffix(
      context.item_name || params.display_name || params.item_name || params.lookup_name || params.market_hash_name || ""
    );
    const section = String(params.section || "").toLowerCase();
    const weapon = String(params.weapon || "").trim();
    const group = String(params.group || "").trim();

    // Every suggestion below is written around CS2 skins, wears and weapon
    // names, none of which exist in TF2.
    if (getActiveGame() === "tf2") {
      const tf2Item = stripWearSuffix(String(context.item_name || params.item || "").trim());
      if (tf2Item) {
        return [
          `Will ${tf2Item} go up in price?`,
          `Cheapest place to buy ${tf2Item}`,
          "Similar TF2 items to consider",
        ];
      }
      return ["What can this site do?", "TF2 items to invest in right now", "How do I find the best deals?"];
    }

    const byPage = {
      "smgs.html": [
        "Cheapest MAC-10 skins right now",
        "Best MP7 to invest in",
        "Compare MP9 vs P90 prices",
      ],
      "pistols.html": [
        "Cheapest Glock-18 skins right now",
        "Best USP-S to invest in",
        "Compare Desert Eagle vs Five-SeveN",
      ],
      "rifles.html": [
        "Cheapest AK-47 skins right now",
        "Best AWP to invest in",
        "Compare M4A1-S vs M4A4 prices",
      ],
      "ak47.html": [
        "Cheapest AK-47 skins right now",
        "Best AK-47 to invest in",
        "Compare Fire Serpent vs Vulcan",
      ],
      "heavy.html": [
        "Cheapest Nova skins right now",
        "Best MAG-7 to invest in",
        "Compare XM1014 vs M249",
      ],
      "knives.html": [
        "Cheapest knives right now",
        "Best knife to invest in",
        "Karambit vs Butterfly prices",
      ],
      "gloves.html": [
        "Cheapest gloves right now",
        "Best gloves to invest in",
        "Sport Gloves vs Specialist Gloves",
      ],
      "rare.html": [
        "Cheapest knives right now",
        "Best gloves to invest in",
        "Knife vs glove for a €500 budget",
      ],
      "carepackage.html": [
        "What's worth spinning today?",
        "Best Care Package value mix",
        "Undervalued collection skins",
      ],
      "deals.html": [
        "Biggest Steam vs Skinport gaps",
        "Best CS2 flip under €20",
        "How do Deals work?",
      ],
      "skin-crafter.html": [
        "How does Skin Crafter work?",
        "Cheapest 4-sticker crafts",
        "Best stickers for an AK craft",
      ],
      "collections.html": [
        "Best collections to invest in",
        "Cheapest collection skins",
        "Which collection is undervalued?",
      ],
      "cases.html": [
        "Best cases to invest in",
        "Cheapest cases right now",
        "Revolution vs Fracture case",
      ],
      "roi.html": [
        "Hottest movers today",
        "Best items under €10",
        "What is market cap doing?",
      ],
      "login.html": [
        "Analyze my inventory",
        "What should I buy next?",
        "Best add-on under €50",
      ],
      "stickers.html": [
        "Best stickers to invest in",
        "Cheapest Katowice stickers",
        "Which capsules have upside?",
      ],
      "agents.html": [
        "Cheapest agents right now",
        "Best agent skins to buy",
        "Which agents hold value?",
      ],
      "charms.html": [
        "Cheapest charms right now",
        "Best charm to invest in",
        "Which keychains are hyped?",
      ],
      "patches.html": [
        "Cheapest patches right now",
        "Best patches to collect",
        "Which patch sets hold value?",
      ],
      "pins.html": [
        "Cheapest pins right now",
        "Best pins to collect",
        "Which pin series is undervalued?",
      ],
      "graffiti.html": [
        "Cheapest graffiti right now",
        "Best graffiti to collect",
        "Which graffiti boxes have value?",
      ],
      "music.html": [
        "Cheapest music kits right now",
        "Best music kit to invest in",
        "StatTrak vs normal kit prices",
      ],
      "other.html": [
        "Cheapest charms right now",
        "Best agents to buy",
        "Which music kits hold value?",
      ],
      "armory.html": [
        "What's in the Armory pass?",
        "Best Armory items to buy",
        "Armory vs case value",
      ],
      "data.html": [
        "What is the market doing?",
        "Best 24h movers",
        "How do I read this data?",
      ],
      "stats-db.html": [
        "How big is the catalog?",
        "Rarest items we track",
        "What does this database show?",
      ],
      "fracture.html": [
        "Best Fracture skins to buy",
        "Cheapest Fracture items",
        "Is Fracture still worth it?",
      ],
      "revolution.html": [
        "Best Revolution skins to buy",
        "Cheapest Revolution Case items",
        "Is Revolution still worth it?",
      ],
    };

    if (byPage[page]) {
      return takeThreePrompts(byPage[page]);
    }

    if (page === "catalog-items.html") {
      const named = weaponQuickPrompts(weapon) || weaponQuickPrompts(group);
      if (named) return takeThreePrompts(named);
      const sectionPrompts = catalogSectionPrompts(section);
      if (sectionPrompts) return takeThreePrompts(sectionPrompts);
    }

    if (page === "item_page.html" || page === "item_page.php" || page === "detail.html") {
      return takeThreePrompts(itemQuickPrompts(itemName));
    }

    return getMarkDefaultQuickPrompts();
  }

  function getMarkEmptyIntro(pageName, context = {}) {
    // The assistant introduces itself by the name it answers under: Mark on
    // CS2, Dell on TF2.
    const name = getActiveGame() === "tf2" ? "Dell" : "Mark";
    return `Hey — I'm ${name}. ${getMarkEmptyIntroBody(pageName, context)}`;
  }

  function getMarkEmptyIntroBody(pageName, context = {}) {
    const page = String(pageName || "").split("?")[0].toLowerCase();
    if (getActiveGame() === "tf2") {
      const tf2Item = stripWearSuffix(String(context.item_name || "").trim());
      if (page === "tf2-item.html") {
        return tf2Item
          ? `Ask me about ${tf2Item} prices or outlook on this page.`
          : "Ask me about this item's price or outlook.";
      }
      return "Ask me about TF2 items, prices, or this page.";
    }
    const params = context.params && typeof context.params === "object" ? context.params : {};
    const itemName = stripWearSuffix(
      context.item_name || params.display_name || params.item_name || params.lookup_name || params.market_hash_name || ""
    );
    const weapon = String(params.weapon || params.group || "").trim();
    const section = String(params.section || "").toLowerCase();

    if (page === "item_page.html" || page === "item_page.php" || page === "detail.html") {
      return itemName
        ? `Ask me about ${itemName} prices or outlook on this page.`
        : "Ask me about this skin's price or outlook.";
    }

    if (page === "catalog-items.html") {
      if (weapon) {
        return `I can help with ${weapon} skins and prices on this page.`;
      }
      if (section) {
        return `I can help with ${section} prices on this page.`;
      }
    }

    const byPage = {
      "smgs.html": "I can help with SMG skins and prices on this page.",
      "pistols.html": "I can help with pistol skins and prices on this page.",
      "rifles.html": "I can help with rifle skins and prices on this page.",
      "ak47.html": "I can help with AK-47 skins and prices on this page.",
      "heavy.html": "I can help with heavy skins and prices on this page.",
      "knives.html": "I can help with knife skins and prices on this page.",
      "gloves.html": "I can help with glove skins and prices on this page.",
      "rare.html": "Ask me about knives, gloves, and rare-item prices here.",
      "carepackage.html": "I can help with Care Package drops and what's worth spinning.",
      "deals.html": "I can help spot price gaps and the cheapest place to buy.",
      "skin-crafter.html": "Ask me about Skin Crafter, sticker crafts, or costs.",
      "collections.html": "I can help with collection skins and prices on this page.",
      "cases.html": "Ask me about case prices and which ones look worth holding.",
      "roi.html": "I can help with movers and prices on this page.",
      "login.html": "I can help read your inventory and what to buy next.",
      "stickers.html": "I can help with sticker prices and capsules on this page.",
      "agents.html": "I can help with agent skins and prices on this page.",
      "charms.html": "I can help with charm prices on this page.",
      "patches.html": "I can help with patch prices on this page.",
      "pins.html": "I can help with pin prices on this page.",
      "graffiti.html": "I can help with graffiti prices on this page.",
      "music.html": "I can help with music kit prices on this page.",
      "other.html": "I can help with charms, agents, and other item prices here.",
      "armory.html": "I can help with Armory pass items and prices on this page.",
      "data.html": "I can help with market data and movers on this page.",
      "stats-db.html": "Ask me about the catalog and tracked items on this page.",
      "fracture.html": "I can help with Fracture skins and prices on this page.",
      "revolution.html": "I can help with Revolution skins and prices on this page.",
    };

    return byPage[page] || "Ask me about skins, prices, or this page.";
  }

  function resolveMarkPageGuide(pageName, authenticated = false) {
    const guide = MARK_PAGE_GUIDES[pageName];
    if (!guide) return null;
    if (guide.requiresAuth && !authenticated) {
      return { ...guide, variant: "guest" };
    }
    return guide;
  }

  async function buildBasicInventorySnapshot() {
    const response = await fetch("get_steam_inventory.php?count=120", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const payload = await response.json().catch(() => ({}));
    const items = Array.isArray(payload?.inventory?.items) ? payload.inventory.items : [];
    const grouped = {};

    items.forEach((item) => {
      const key = String(item.market_hash_name || item.display_name || "").trim();
      if (!key) return;
      if (!grouped[key]) {
        grouped[key] = {
          name: String(item.display_name || item.market_hash_name || key),
          quantity: 0,
          unit_value: null,
          total_value: null,
        };
      }
      grouped[key].quantity += Math.max(1, Number(item.amount) || 1);
    });

    const holdings = Object.values(grouped)
      .sort((left, right) => right.quantity - left.quantity)
      .slice(0, 12);

    return {
      total_value: null,
      item_count: items.length,
      priced_count: holdings.length,
      valuation_mode: "Steam inventory snapshot",
      top_holdings: holdings,
    };
  }

  async function resolveInventoryGuideSnapshot() {
    if (typeof window.CS2MarkInventoryBridge?.getSnapshot === "function") {
      let snapshot = window.CS2MarkInventoryBridge.getSnapshot();
      if (snapshot?.item_count && !snapshot?.priced_count && typeof window.CS2MarkInventoryBridge.waitForValuation === "function") {
        await window.CS2MarkInventoryBridge.waitForValuation(8000);
        snapshot = window.CS2MarkInventoryBridge.getSnapshot();
      }
      if (snapshot?.item_count) {
        return snapshot;
      }
    }

    return buildBasicInventorySnapshot();
  }

  function stripChatPlainText(value) {
    return String(value || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&(?:amp|lt|gt|quot);/g, " ")
      .replace(/\*\*/g, "")
      .trim();
  }

  function looksLikeChatCatalogItem(value) {
    const plain = stripChatPlainText(value);
    if (!plain) return false;
    if (plain.includes("|")) return true;
    if (/\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred|FN|MW|FT|WW|BS)\)/i.test(plain)) return true;
    // Wear abbreviations without parens: "USP-S Cortex FT", "Naga FN at €32"
    if (/\b(?:FN|MW|FT|WW|BS)\b/.test(plain)) return true;
    // Common weapon / item family heads (AI often omits the "|" pipe in Why lines).
    if (/^(?:StatTrak™?\s+)?(?:★\s+)?(?:AK-47|M4A1-S|M4A4|AWP|USP-S|Glock-18|Glock|Desert Eagle|Deagle|P250|P2000|Five-SeveN|Tec-9|CZ75-Auto|Dual Berettas|MAC-10|MP7|MP9|MP5-SD|UMP-45|P90|PP-Bizon|Galil AR|FAMAS|SG 553|AUG|SSG 08|SCAR-20|G3SG1|Negev|M249|Nova|XM1014|Sawed-Off|MAG-7|R8 Revolver)\b/i.test(plain)) {
      return true;
    }
    const head = String(plain.split(/\s+[—–]\s+/)[0] || plain);
    if (
      /\b(Case|Capsule|Package|Pin|Charm|Sticker|Patch|Agent|Graffiti|Terminal)\b/i.test(head)
      && /(?:€|\$|£)\s*\d/.test(plain)
    ) {
      return true;
    }
    // Why-pick lines with a euro/qty figure still count as item lines (plain, not bullets).
    if (/(?:€|\$|£)\s*\d/.test(plain) && /\b(?:x\s*\d+|\d+\s*x|listings?|30d|7d)\b/i.test(plain)) {
      return true;
    }
    // TF2 names carry none of the grammar above - no pipe, no wear, no CS2
    // weapon head - so "Strange Rocket Launcher" and "Cranial Cowl" failed
    // every test and their pick lines rendered as loose paragraphs with no
    // bullet. There the shape of the line is the signal: a short name, an em
    // dash, then a price. Scoped to TF2 so CS2 prose cannot start listing
    // itself.
    if (getActiveGame() === "tf2" && /^[^—–\n]{3,80}\s+[—–]\s+.{0,120}?(?:€|\$|£)\s*\d/.test(plain)) {
      return true;
    }
    return false;
  }

  function isChatDisclaimerLine(line) {
    const plain = stripChatPlainText(line).replace(/^#+\s+/, "").trim();
    if (!plain) return false;
    if (/^(?:one-line\s+)?disclaimer\b/i.test(plain)) return true;
    if (/^(?:this is\s+)?not financial advice\b/i.test(plain)) return true;
    if (/\bnot financial advice\b/i.test(plain) && /\bmarket vibes\b/i.test(plain)) return true;
    if (/\bmarket vibes from the data you see\b/i.test(plain)) return true;
    return false;
  }

  // Notes / outlook / analysis labels — never list extras or catalog bullets.
  function isChatSectionHeading(line) {
    const trim = stripChatHeadingEmojiAndShortlist(
      stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "")
    );
    if (!trim) return false;
    if (/^collections?\s+to\s+watch\b/i.test(trim)) return true;
    if (/^chart\s*\/\s*outlook$/i.test(trim) || /^chart\s+outlook$/i.test(trim) || /^hidden\s+metadata$/i.test(trim)) {
      return true;
    }
    if (/^(?:AI market(?: verdict)?|AI sentiment|Market outlook)\b/i.test(trim)) return true;
    return /^(?:Notes?|Why(?: these picks| this mix| AI is bullish)?|Hold thesis|Thesis|Future outlook|Outlook|Analysis|Summary|Caveats?|Risks?|Disclaimer|Reason to buy|Why(?: to buy| it)?|Chart pick|Chart focus|Buy on|What to buy next|Items to buy|Key read|Key factors|Marketplace supply|Liquidity read|Price action|Metrics|Market metrics|Item metrics|Verdict|CS2 markets overview|Top opportunity)$/i.test(trim);
  }

  function isChatWhySectionHeading(line) {
    const trim = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "").trim();
    if (!trim) return false;
    if (/^(?:Why(?: these (?:picks|pics)| this mix| AI is bullish)?|Reason to buy|Why(?: to buy| it)?|Chart pick)$/i.test(trim)) {
      return true;
    }
    return /^Why these (?:picks|pics)\b/i.test(trim);
  }

  function isChatWhyNamesOnlyHeading(line) {
    const trim = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "").trim();
    return /^(?:Why these (?:picks|pics)|Why this mix)\b/i.test(trim);
  }

  function chatWhyCardLabel(item) {
    return String(item?.display_name || item?.market_hash_name || "")
      .replace(/\s+\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "")
      .replace(/\*+/g, "")
      .trim();
  }

  function extractChatWhyItemName(line) {
    let name = stripChatPlainText(line)
      .replace(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/, "")
      .replace(/\*+/g, "")
      .trim();
    if (!name) return "";
    name = String(name.split(/\s+[—–]\s+/)[0] || name).trim();
    name = name.replace(/\s+[-:]\s+(?:€|\$|£).*$/, "").trim();
    name = name.replace(/\s+(?:€|\$|£)\s*\d[\d.,]*.*$/, "").trim();
    name = name.replace(/\s*[x×]\s*\d+\s*(?:=\s*(?:€|\$|£)\s*[\d.,]+)?/i, "").trim();
    const wearKeep = name.match(/^((?:StatTrak™|StatTrak|Souvenir|★)?\s*.+?\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred|FN|MW|FT|WW|BS)\))/i);
    if (wearKeep) {
      name = wearKeep[1].trim();
    } else {
      name = name.replace(/\s+\b(?:adds?|gives?|offers?|provides?|brings?|remains?|stays?|keeps?|makes?|helps?|delivers?|shows?|means?|looks?|feels?|works?|fits?|pairs?|complements?|boosts?|balances?|diversifies?|includes?|features?|creates?|opens?|holds?|trades?|lists?|sits?|comes?|gets?|lets?|allows?|enables?|supports?|is|are|was|were|has|have|had|can|could|will|would|should|may|might)\b.*$/i, "").trim();
    }
    name = name.replace(/[.,;:]+$/g, "").replace(/\s+/g, " ").trim();
    if (!name || name.length > 80) return "";
    if (/^(?:€|\$|£)/.test(name)) return "";
    return name;
  }

  function extractChatWhyClause(line, name) {
    let plain = stripChatPlainText(line)
      .replace(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/, "")
      .replace(/\*+/g, "")
      .trim();
    const item = String(name || "").trim();
    if (!plain || !item) return "";
    const dashParts = plain.split(/\s+[—–-]\s+/);
    let rest = "";
    if (dashParts.length > 1) {
      rest = dashParts.slice(1).join(" — ").trim();
    } else {
      const idx = plain.toLowerCase().indexOf(item.toLowerCase());
      rest = (idx >= 0 ? plain.slice(idx + item.length) : "").replace(/^[\s,;:\-–—]+/, "").trim();
    }
    rest = rest
      .replace(/(?:€|\$|£)\s*\d[\d.,]*/g, " ")
      .replace(/\b(?:30d|7d)\s*[+\-−]?\s*\d+(?:[.,]\d+)?\s*%/gi, " ")
      .replace(/\b[\d,]+\s+listings?\b/gi, " ")
      .replace(/\b24h\s+vol\b\S*/gi, " ")
      .replace(/\b[x×]\s*\d+\s*=?\s*/gi, " ")
      .replace(/\*+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s,;:\-–—\/]+|[\s,;:\-–—.\/]+$/g, "")
      .trim();
    if (rest) {
      const clauses = rest.split(/\s+[—–-]\s+/).map((part) => part.replace(/^[\s,;:\-–—\/]+|[\s,;:\-–—.\/]+$/g, "").trim()).filter(Boolean);
      if (clauses.length) rest = clauses[clauses.length - 1];
    }
    if (!rest || rest.length < 8 || /^(?:€|\$|£)/.test(rest)) return "";
    if (/^on\s+(?:csfloat|skinport|white\.?market|steam|buff|bitskins)\b/i.test(rest)) return "";
    const words = rest.split(/\s+/);
    if (words.length > 14) rest = words.slice(0, 14).join(" ");
    return rest;
  }

  function parseChatWhyEntry(line) {
    const name = extractChatWhyItemName(line);
    if (name && looksLikeChatCollectionTitleName(name)) {
      return { name, reason: extractChatWhyClause(line, name) };
    }
    if (isChatWhyIntroLine(line)) return null;
    if (!name) return null;
    return { name, reason: extractChatWhyClause(line, name) };
  }

  function chatWhyNameKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/\((?:factory new|minimal wear|field-tested|well-worn|battle-scarred|fn|mw|ft|ww|bs)\)/g, "")
      .replace(/\b(?:fn|mw|ft|ww|bs)\b/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function matchChatWhyReason(name, entries) {
    const key = chatWhyNameKey(name);
    if (!key || !Array.isArray(entries)) return "";
    for (const entry of entries) {
      const reason = String(entry?.reason || "").trim();
      if (!reason) continue;
      if (looksLikeChatCollectionTitleName(entry?.name)) continue;
      const other = chatWhyNameKey(entry?.name);
      if (!other) continue;
      if (other === key || other.includes(key) || key.includes(other)) return reason;
    }
    return "";
  }

  function fallbackChatCollectionWatchReason() {
    return ti("why_collectionWatch");
  }

  function fallbackChatWhyReason(name) {
    const plain = String(name || "").replace(/\*+/g, "").trim().toLowerCase();
    if (/\bcollection\b/.test(plain)) {
      return "";
    }
    if (/\b(?:case|capsule|package)\b/.test(plain)) {
      return ti("why_container");
    }
    if (/\b(?:sticker|graffiti|patch|charm|pin|music kit)\b/.test(plain)) {
      return ti("why_stickerish");
    }
    return ti("why_generic");
  }

  function isChatWhyExactCard(name, cardNames) {
    const key = chatWhyNameKey(name);
    if (!key || !Array.isArray(cardNames)) return false;
    return cardNames.some((card) => chatWhyNameKey(card) === key);
  }

  function isChatWhyThemeLabel(name, reason, cardNames) {
    const clean = String(name || "").replace(/\*+/g, "").trim();
    if (!clean) return false;
    if (String(reason || "").trim()) return false;
    if (/\|/.test(clean)) return false;
    if (isChatWhyExactCard(clean, cardNames)) return false;
    if (/\bcollection\b/i.test(clean)) return false;
    if (/\b(?:case|capsule|package)\b/i.test(clean)) return true;
    return /^(?:stattrak™?\s+)?(?:★\s+)?(?:ak-?47|m4a1-?s|m4a4|awp|usp-?s|glock-?18|glock|desert eagle|deagle|p250|p2000|five-seven|tec-9|cz75-auto|dual berettas|mac-10|mp7|mp9|mp5-sd|ump-45|p90|pp-bizon|galil ar|famas|sg 553|aug|ssg 08|scar-20|g3sg1|negev|m249|nova|xm1014|sawed-off|mag-7|r8 revolver)\s*$/i.test(clean);
  }

  function renderChatWhyThemeHtml(name) {
    const clean = String(name || "").replace(/\*+/g, "").trim();
    if (!clean) return "";
    return `<div class="home-ai-why-theme">${escapeChatHtml(clean)}</div>`;
  }

  function renderChatWhyLineHtml(name, reason) {
    const clean = String(name || "").replace(/\*+/g, "").trim();
    if (!clean || looksLikeChatCollectionTitleName(clean)) return "";
    const why = translateChatWhyReason(String(reason || "").replace(/\*+/g, "").trim())
      || fallbackChatWhyReason(clean);
    if (!why) return "";
    return `<div class="home-ai-why-line"><strong>${escapeChatHtml(clean)}</strong><span class="home-ai-why-reason"> — ${escapeChatHtml(why)}</span></div>`;
  }

  function isChatWhyIntroLine(line) {
    const plain = stripChatPlainText(line).replace(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/, "").trim();
    if (!plain) return true;
    if (/^(?:Portfolio\s+total|Final\s+total|Grand\s+total|Total|These|Those|Anyway|So yeah|Quick take|Reuse|This mix|Overall|Together|To hit|If you want to stay|Proposed|Replace)\b/i.test(plain)) {
      return true;
    }
    const name = extractChatWhyItemName(plain);
    if (!name) return true;
    if (looksLikeChatCatalogItem(name)) return false;
    if (/[.!?]$/.test(plain)) return true;
    if (plain.length > 60 && /\b(?:without|overpaying|dynamics|reasonable|depth|supply|demand)\b/i.test(plain)) {
      return true;
    }
    return plain.length > 90;
  }

  function parseChatFactorLine(line) {
    const plain = stripChatPlainText(line);
    const bulletBody = plain.replace(/^\s*•\s+/, "").trim();
    const plus = bulletBody.match(/^\+[\s\u00a0]+(.+)$/);
    if (plus) {
      return { sign: "+", text: plus[1].trim() };
    }
    const minus = bulletBody.match(/^[-−–][\s\u00a0]+(.+)$/);
    if (minus) {
      return { sign: "-", text: minus[1].trim() };
    }
    return null;
  }

  function isChatKeyFactorsHeading(line) {
    const plain = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "").trim();
    return /^key factors$/i.test(plain);
  }

  function isChatPositivesHeading(line) {
    const plain = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "").trim();
    return /^positives?$/i.test(plain);
  }

  function isChatNegativesHeading(line) {
    const plain = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "").trim();
    return /^negatives?$/i.test(plain);
  }

  function isChatPortfolioTotalLine(line) {
    const plain = stripChatPlainText(line).replace(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/, "").trim();
    if (!plain) return false;
    if (/^(?:Portfolio(?:\s+total)?|Final\s+total|Grand\s+total)\b/i.test(plain)) return true;
    if (/^Total\b/i.test(plain) && /(?:€|\$|£)\s*\d/.test(plain)) return true;
    return false;
  }

  function isChatRisksHeading(line) {
    const plain = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "").trim();
    return /^risks?$/i.test(plain);
  }

  function splitChatRiskProseIntoPoints(text, maxPoints = 3) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    const chunks = raw
      .split(/\s*;\s*|(?<=[.!?])\s+/u)
      .map((chunk) => {
        let point = chunk.replace(/^\s*•\s+/, "").replace(/^[+\-−–]\s+/, "").trim().replace(/[.]+$/, "").trim();
        if (point.length > 1) {
          point = point.charAt(0).toUpperCase() + point.slice(1);
        }
        return point;
      })
      .filter(Boolean);
    const points = [];
    for (const chunk of chunks) {
      let point = chunk;
      if (point.length > 140) {
        point = `${point.slice(0, 137).trim()}…`;
      }
      points.push(point);
      if (points.length >= maxPoints) break;
    }
    return points;
  }

  function extractAndStripChatRisksSection(text) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    const kept = [];
    const riskTexts = [];
    let inRisks = false;
    let riskBuffer = [];

    const flushRiskBuffer = () => {
      if (!riskBuffer.length) return;
      const joined = riskBuffer.join(" ").trim();
      splitChatRiskProseIntoPoints(joined, 3).forEach((point) => {
        if (riskTexts.length >= 3) return;
        riskTexts.push(point);
      });
      riskBuffer = [];
    };

    for (const line of lines) {
      if (isChatRisksHeading(line)) {
        flushRiskBuffer();
        inRisks = true;
        continue;
      }

      if (inRisks) {
        const trimmed = String(line || "").trim();
        if (!trimmed) {
          if (riskBuffer.length) {
            flushRiskBuffer();
            inRisks = false;
          }
          continue;
        }
        if (isChatSectionHeading(line) || /^(?:not financial advice)\b/i.test(stripChatPlainText(line))) {
          flushRiskBuffer();
          inRisks = false;
          kept.push(line);
          continue;
        }
        const signed = parseChatFactorLine(line);
        if (signed) {
          riskBuffer.push(signed.text);
        } else {
          riskBuffer.push(stripChatPlainText(line).replace(/^\s*•\s+/, "").trim());
        }
        continue;
      }

      kept.push(line);
    }

    flushRiskBuffer();
    return { riskTexts, content: kept.join("\n") };
  }

  function isChatKeptBodyAfterFactors(line) {
    if (isChatItemsToBuyHeading(line) || isChatWhySectionHeading(line)) return true;
    if (isChatKeyFactorsHeading(line) || isChatPositivesHeading(line) || isChatNegativesHeading(line) || isChatRisksHeading(line)) {
      return false;
    }
    if (typeof isChatSentimentHeading === "function" && isChatSentimentHeading(line)) return false;
    if (typeof isChatMarketVerdictHeading === "function" && isChatMarketVerdictHeading(line)) return false;
    if (typeof isChatMetricsHeading === "function" && isChatMetricsHeading(line)) return false;
    if (isChatSectionHeading(line)) return true;
    const trim = String(line || "").trim();
    const body = trim.replace(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/, "");
    if (!body) return false;
    return looksLikeChatCatalogItem(body) && (/^\s*•\s+/.test(String(line || "")) || /(?:€|\$|£)\s*\d/.test(body));
  }

  function isChatUnusedFactorLeftoverLine(line, extractedKeys) {
    if (isChatKeptBodyAfterFactors(line)) return false;
    const raw = String(line || "").trim();
    if (!raw) return true;
    const plain = stripChatPlainText(line).replace(/^\s*•\s+/, "").replace(/^[+\-−–]\s+/, "").trim();
    if (!plain) return true;
    if (looksLikeChatCatalogItem(plain) || /(?:€|\$|£)\s*\d/.test(plain)) return false;
    const keys = extractedKeys instanceof Set ? extractedKeys : new Set(extractedKeys || []);
    if (keys.has(plain.toLowerCase())) return true;
    const signed = parseChatFactorLine(line);
    if (signed) {
      const name = (typeof extractChatWhyItemName === "function" ? extractChatWhyItemName(signed.text) : "") || signed.text;
      if (typeof looksLikeChatCollectionTitleName === "function" && looksLikeChatCollectionTitleName(name)) {
        return false;
      }
      return true;
    }
    if (plain.length < 16 || plain.length > 220) return false;
    return /(?:\brisk\b|\bcan\b|\bmay\b|\bdampen\b|\baffect\b|\bcause\b|\bthin\b|\bswing|\bcycle|\bevent|\bhype\b|\bpromo|\bliquidity\b|\bfloat\b|\bpattern\b|\btournament\b|\bpremium\b|\bvolatil|\bsupply\b)/i.test(plain);
  }

  function stripUnusedChatFactorLeftovers(text, factors) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    const extracted = new Set(
      (Array.isArray(factors) ? factors : [])
        .map((entry) => String(entry && entry.text || "").trim().toLowerCase())
        .filter(Boolean)
    );
    let keepIdx = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (isChatKeptBodyAfterFactors(lines[i])) {
        keepIdx = i;
        break;
      }
    }
    const kept = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (keepIdx >= 0 && i < keepIdx && isChatUnusedFactorLeftoverLine(line, extracted)) {
        continue;
      }
      kept.push(line);
    }
    return kept.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
  }

  function splitChatKeyFactors(text) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    const factors = [];
    const kept = [];
    let inSection = false;
    let sectionSign = "";

    const startFactorSection = (sign) => {
      inSection = true;
      sectionSign = sign;
    };

    for (const line of lines) {
      if (isChatKeyFactorsHeading(line)) {
        startFactorSection("");
        continue;
      }
      if (isChatPositivesHeading(line)) {
        startFactorSection("+");
        continue;
      }
      if (isChatNegativesHeading(line) || isChatRisksHeading(line)) {
        startFactorSection("-");
        continue;
      }

      if (inSection) {
        const parsed = parseChatFactorLine(line);
        if (parsed) {
          factors.push(sectionSign ? { sign: sectionSign, text: parsed.text } : parsed);
          continue;
        }

        if (!String(line || "").trim()) {
          continue;
        }

        if (isChatSectionHeading(line)) {
          inSection = false;
          sectionSign = "";
          kept.push(line);
          continue;
        }

        if (sectionSign) {
          const unsigned = stripChatPlainText(line).replace(/^\s*•\s+/, "").trim();
          if (unsigned) {
            factors.push({ sign: sectionSign, text: unsigned });
          }
          continue;
        }

        if (factors.length && !isChatKeptBodyAfterFactors(line)) {
          continue;
        }

        if (factors.length) {
          inSection = false;
        }
        kept.push(line);
        continue;
      }

      kept.push(line);
    }

    const risksSplit = extractAndStripChatRisksSection(kept.join("\n"));
    const existing = new Set(factors.map((entry) => String(entry.text || "").trim().toLowerCase()));
    risksSplit.riskTexts.forEach((text) => {
      const key = String(text || "").trim().toLowerCase();
      if (!key || existing.has(key)) return;
      factors.push({ sign: "-", text: String(text).trim() });
      existing.add(key);
    });

    return {
      factors,
      content: risksSplit.content,
    };
  }

  function normalizeChatMetricLevel(raw) {
    let s = String(raw || "").trim();
    if (!s) return "";
    s = s.replace(/[–—]/g, "-");
    s = s.replace(/\s+to\s+/gi, "-");
    s = s.replace(/\s+/g, "-");
    s = s.replace(/-+/g, "-").replace(/^-|-$/g, "");
    return s.toUpperCase();
  }

  function sanitizeChatMetricDetail(detail) {
    let text = String(detail || "").trim();
    if (!text) return "";
    // Strip leftover prompt placeholders: why… / why... / Why: / why —
    text = text.replace(/^why\b\s*(?:[:\-–—…]|\.{1,3})?\s*/i, "").trim();
    if (!text || /^[\.…]{1,3}$/.test(text)) return "";
    return text;
  }

  function splitChatMetricValueAndDetail(rest) {
    const raw = String(rest || "").trim();
    if (!raw) return { value: "", detail: "" };

    // Already "LEVEL — detail"
    const dashed = raw.match(/^([A-Za-z][A-Za-z0-9%+.\-/ ]{0,24})\s*[—–\-]\s+(.+)$/);
    if (dashed && /^(?:very\s+)?(?:high|low|medium|moderate|extreme)|medium[\s\-–—]*high|moderate[\s\-–—]*(?:to\s+)?high$/i.test(dashed[1].trim())) {
      return {
        value: normalizeChatMetricLevel(dashed[1]),
        detail: sanitizeChatMetricDetail(dashed[2]),
      };
    }

    // Short chip value only
    if (/^[A-Z][A-Z0-9%+\-./ ]{0,18}$/i.test(raw) && raw.length <= 18) {
      return { value: normalizeChatMetricLevel(raw), detail: "" };
    }

    const levelRe = /^(very\s+high|very\s+low|medium[\s\-–—]*high|med[\s\-–—]*high|moderate[\s\-–—]*(?:to\s+)?high|moderate|medium|extreme|high|low)\b\s*(.*)$/i;
    const levelMatch = raw.match(levelRe);
    if (levelMatch) {
      let detail = String(levelMatch[2] || "").trim();
      detail = detail.replace(/^[—–\-:,\s]+/, "").trim();
      const wrapped = detail.match(/^\((.+)\)$/);
      if (wrapped) detail = wrapped[1].trim();
      return {
        value: normalizeChatMetricLevel(levelMatch[1]),
        detail: sanitizeChatMetricDetail(detail),
      };
    }

    const parts = raw.match(/^(\S+)\s+(.+)$/);
    if (parts) {
      return {
        value: normalizeChatMetricLevel(parts[1]),
        detail: sanitizeChatMetricDetail(parts[2]),
      };
    }

    return { value: normalizeChatMetricLevel(raw), detail: "" };
  }

  function formatChatMetricDisplayLabel(label) {
    const raw = String(label || "").trim();
    if (!raw) return "";
    // Known chip labels are translated; anything else keeps title-casing.
    const translated = translateChatMetricLabel(raw);
    if (translated && translated.toUpperCase() !== raw.toUpperCase()) return translated;
    const lower = raw.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  function formatChatMetricDisplayValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const translated = translateChatMetricValue(raw);
    if (translated && translated.toUpperCase() !== raw.toUpperCase()) return translated;
    return raw
      .split(/([\s\-–—/]+)/)
      .map((part) => {
        if (!part || /^[\s\-–—/]+$/.test(part)) return part;
        const lower = part.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join("");
  }

  function parseChatMetricLine(line) {
    // Strip markdown headings (### SCARCITY: HIGH), bullets, and bold markers.
    const plain = stripChatPlainText(line)
      .replace(/^\s*#+\s+/, "")
      .replace(/^\s*[•\-–—*]\s+/, "");
    const labelRe = "(?:SCARCITY|LIQUIDITY|DEMAND|VOLATILITY|RISK|TREND|SUPPLY|MOMENTUM|SENTIMENT|CONFIDENCE)";
    const withRest = plain.match(new RegExp(`^(${labelRe})\\s*[:\-–—]\\s*(.+)$`, "i"));
    // Space form only for short level chips (avoid matching "Liquidity read").
    const chipSpace = plain.match(
      new RegExp(
        `^(${labelRe})\\s+((?:very\\s+)?(?:high|low|medium|moderate|extreme|med)(?:[\\s\\-–—]*(?:to\\s+)?(?:high|low|medium|moderate))?)$`,
        "i"
      )
    );

    let label = "";
    let rest = "";
    if (withRest) {
      label = withRest[1].trim();
      rest = withRest[2].trim();
    } else if (chipSpace) {
      label = chipSpace[1].trim();
      rest = chipSpace[2].trim();
    } else {
      return null;
    }

    const split = splitChatMetricValueAndDetail(rest);
    let value = split.value || "MEDIUM";
    if (label.toUpperCase() === "SCARCITY" && value === "MEDIUM") {
      value = "MODERATE";
    }
    const out = { label: label.toUpperCase(), value: String(value || "").toUpperCase() };
    if (split.detail) out.detail = split.detail;
    return out;
  }

  function isChatMetricsHeading(line) {
    const plain = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "").trim();
    return /^(?:metrics|market metrics|item metrics)$/i.test(plain);
  }

  function isChatMarketOverviewHeading(line) {
    const trim = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "").trim();
    return /^(?:CS2|TF2) markets overview$/i.test(trim);
  }

  function isChatMarketOverviewBodyLine(line) {
    const plain = stripChatPlainText(line);
    if (!plain) return false;
    if (/\bLIVE DATA\b/i.test(plain)) return true;
    if (
      /\b(?:Market|24H Vol|24H Trend|7D Trend|30D Trend|1Y Trend|Items|AI Sentiment)\b/i.test(plain)
      && /(?:€|\$|%|[KMB]\b|BULLISH|BEARISH|NEUTRAL|[▲▼~])/i.test(plain)
    ) {
      return true;
    }
    return false;
  }

  // Drop a model-emitted overview so ChatMarketSnapshot is the only copy.
  function splitChatMarketOverview(text) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    const kept = [];
    let skipping = false;
    let removed = false;

    for (const line of lines) {
      if (isChatMarketOverviewHeading(line)) {
        skipping = true;
        removed = true;
        continue;
      }
      if (skipping) {
        if (!String(line || "").trim()) {
          skipping = false;
          continue;
        }
        if (isChatSectionHeading(line) && !isChatMarketOverviewHeading(line)) {
          skipping = false;
          kept.push(line);
          continue;
        }
        if (isChatMarketOverviewBodyLine(line)) {
          continue;
        }
        skipping = false;
      }
      if (!kept.length && isChatMarketOverviewBodyLine(line)) {
        removed = true;
        continue;
      }
      kept.push(line);
    }

    return {
      content: kept.join("\n"),
      hadOverview: removed,
    };
  }

  const INVENTORY_REVIEW_USER_PROMPT = "Review my Steam inventory. Analyze the future of the items I already hold — what may rise, stall, stay liquid, and the main risks. Note total € value and top holdings briefly. Do not recommend new items to buy.";

  function isInventoryReviewUserText(text) {
    const user = String(text || "").toLowerCase();
    if (!user) return false;
    if (/review my (?:steam )?inventory/.test(user)) return true;
    if (/analy[sz]e my steam inventory/.test(user)) return true;
    if (/(?:do not|don't) recommend new items/.test(user) && /\binventory\b/.test(user)) return true;
    return false;
  }

  function isInventoryReviewChat(userText, content, flagged) {
    if (flagged) return true;
    if (isInventoryReviewUserText(userText)) return true;
    const body = String(content || "");
    return /summary of your portfolio/i.test(body)
      && /(?:items to buy|why these picks|what to buy next)/i.test(body);
  }

  function formatAssistantChatHtml(content, snapshot, cardItems, forecast, userText, extras) {
    const inventoryReview = isInventoryReviewChat(userText, content, extras && extras.inventoryReview);
    const prepared = prepareChatAssistantSections(content, {
      snapshot,
      forecast,
      mini: true,
      inventoryReview,
    });
    let raw = resolveChatAssistantBodyMarkdown(prepared.body, content, cardItems, userText, { inventoryReview });
    // The mini review is a quick read: the pick list carries its own why clause,
    // so the separate "Why these picks" block is dropped here (the full page
    // chat keeps it).
    raw = String(raw || "").replace(/\n?#{1,6}\s*Why these picks[^\n]*\n[\s\S]*?(?=\n#{1,6}\s|\s*$)/i, "\n");
    let html = cleanChatMiniRenderedHtml(formatChatRichText(raw, cardItems, { mini: true, inventoryReview }));
    html = String(html || "").replace(/<hr[^>]*>/gi, "");
    if (!inventoryReview && !chatRenderedHtmlHasVisibleBody(html) && !chatBodyHasItemPicks(raw)) {
      html = cleanChatMiniRenderedHtml(formatChatRichText(
        synthesizeChatFallbackMarkdown(content, cardItems, userText),
        cardItems,
        { mini: true }
      ));
    }
    const hideMiniInventoryChrome = inventoryReview;
    const prefix = hideMiniInventoryChrome
      ? ""
      : [
        prepared.metrics && prepared.metrics.length
          ? renderChatMetricsHtml(prepared.metrics)
          : "",
        renderChatKeyFactorsHtml(prepared.factors),
        renderChatSentimentStripHtml(prepared.sentiment, prepared.factors),
      ].filter(Boolean).join("");
    return prefix + html;
  }

  function chatResolveSnapshotOutlook(forecast, content, snapshot) {
    const fromForecast = String(forecast?.outlook || "").trim().toLowerCase();
    if (fromForecast === "bullish" || fromForecast === "bearish" || fromForecast === "neutral") {
      return fromForecast;
    }

    const lines = String(content || "").split(/\r\n|\n|\r/).slice(0, 40);
    for (const line of lines) {
      const plain = stripChatPlainText(line);
      if (!/AI market(?: verdict)?|AI sentiment|Market outlook/i.test(plain)) continue;
      const match = plain.match(/\b(BULLISH|BEARISH|NEUTRAL)\b/i);
      if (match) return match[1].toLowerCase();
    }

    const trend = Number(snapshot?.trend_pct_30d ?? snapshot?.trend_pct);
    if (Number.isFinite(trend)) {
      if (trend > 1) return "bullish";
      if (trend < -1) return "bearish";
      return "neutral";
    }
    return "";
  }

  function splitChatMetrics(text) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    const metrics = [];
    const kept = [];
    let inSection = false;
    const seen = new Set();

    const pushMetric = (parsed) => {
      const key = String(parsed.label || "").trim().toUpperCase();
      if (!key) return;
      if (seen.has(key)) {
        const existing = metrics.find((entry) => String(entry.label || "").toUpperCase() === key);
        if (existing && !existing.detail && parsed.detail) {
          existing.detail = parsed.detail;
          if (parsed.value) existing.value = parsed.value;
        }
        return;
      }
      seen.add(key);
      metrics.push(parsed);
    };

    for (const line of lines) {
      if (isChatMetricsHeading(line)) {
        inSection = true;
        continue;
      }

      const parsed = parseChatMetricLine(line);

      if (inSection) {
        if (parsed) {
          pushMetric(parsed);
          continue;
        }

        if (!String(line || "").trim()) {
          if (metrics.length) {
            inSection = false;
          }
          continue;
        }

        if (isChatSectionHeading(line)) {
          inSection = false;
          kept.push(line);
          continue;
        }

        if (metrics.length) {
          inSection = false;
        }
        kept.push(line);
        continue;
      }

      // Strip metric chip/prose lines anywhere so they only live on the cards.
      if (parsed) {
        pushMetric(parsed);
        continue;
      }

      kept.push(line);
    }

    return {
      metrics,
      content: kept.join("\n"),
    };
  }

  // Details are resolved through genericChatMetricDetail() at render time so
  // they follow the active language rather than baking in English.
  const DEFAULT_CHAT_MARKET_METRICS = [
    { label: "SCARCITY", value: "MODERATE" },
    { label: "LIQUIDITY", value: "MEDIUM" },
    { label: "VOLATILITY", value: "MEDIUM" },
  ];

  function genericChatMetricDetail(label, value) {
    const lab = String(label || "").trim().toUpperCase();
    let val = String(value || "").trim().toUpperCase();
    if (lab === "SCARCITY" && val === "MEDIUM") val = "MODERATE";
    const map = {
      SCARCITY: {
        EXTREME: "ai_scarcityExtreme",
        HIGH: "ai_scarcityHigh",
        MODERATE: "ai_scarcityModerate",
        MEDIUM: "ai_scarcityModerate",
        LOW: "ai_scarcityLow",
      },
      LIQUIDITY: {
        HIGH: "ai_liquidityHigh",
        MEDIUM: "ai_liquidityMedium",
        LOW: "ai_liquidityLow",
      },
      VOLATILITY: {
        HIGH: "ai_volatilityHigh",
        MEDIUM: "ai_volatilityMedium",
        LOW: "ai_volatilityLow",
      },
    };
    if (map[lab]?.[val]) return ti(map[lab][val]);
    if (lab === "SCARCITY") return ti("ai_scarcityFallback");
    if (lab === "LIQUIDITY") return ti("ai_liquidityFallback");
    return ti("ai_volatilityFallback");
  }

  function ensureChatMarketMetrics(metrics) {
    const required = ["SCARCITY", "LIQUIDITY", "VOLATILITY"];
    const byLabel = new Map();
    (Array.isArray(metrics) ? metrics : []).forEach((entry) => {
      const label = String(entry?.label || "").trim().toUpperCase();
      const value = String(entry?.value || "").trim();
      if (!label || !value) return;
      const next = { label, value: value.toUpperCase() };
      const detail = sanitizeChatMetricDetail(entry?.detail || "");
      if (detail) next.detail = detail;
      byLabel.set(label, next);
    });
    DEFAULT_CHAT_MARKET_METRICS.forEach((entry) => {
      if (!byLabel.has(entry.label)) {
        byLabel.set(entry.label, { ...entry });
      }
    });
    return required.map((label) => {
      const entry = byLabel.get(label);
      if (!entry) return null;
      const detail = sanitizeChatMetricDetail(entry.detail || "")
        || genericChatMetricDetail(entry.label, entry.value);
      return { ...entry, detail };
    }).filter(Boolean);
  }

  // Rebuilt per call so the strings follow the active language.
  function defaultChatKeyFactors() {
    return [
      { sign: "+", text: ti("ai_factorDemand") },
      { sign: "+", text: ti("ai_factorCoverage") },
      { sign: "-", text: ti("ai_factorLiquidityThin") },
      { sign: "-", text: ti("ai_factorSwings") },
    ];
  }

  function ensureChatKeyFactors(factors) {
    const list = (Array.isArray(factors) ? factors : [])
      .filter((entry) => entry && String(entry.text || "").trim())
      .map((entry) => ({
        sign: entry.sign === "-" || entry.sign === "−" || entry.sign === "–" ? "-" : "+",
        text: String(entry.text || "").trim(),
      }));

    const defaults = defaultChatKeyFactors();
    if (!list.length) {
      return defaults.map((entry) => ({ ...entry }));
    }

    const hasPos = list.some((entry) => entry.sign === "+");
    const hasNeg = list.some((entry) => entry.sign === "-");
    const existing = new Set(list.map((entry) => entry.text.toLowerCase()));

    if (!hasNeg) {
      defaults.filter((entry) => entry.sign === "-").forEach((entry) => {
        if (existing.has(entry.text.toLowerCase())) return;
        list.push({ ...entry });
        existing.add(entry.text.toLowerCase());
      });
    }
    if (!hasPos) {
      defaults.filter((entry) => entry.sign === "+").forEach((entry) => {
        if (existing.has(entry.text.toLowerCase())) return;
        list.unshift({ ...entry });
        existing.add(entry.text.toLowerCase());
      });
    }
    return list;
  }

  function escapeChatHtmlText(text) {
    return String(text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderChatKeyFactorsHtml(factors) {
    const list = ensureChatKeyFactors(factors);
    const positives = list.filter((entry) => entry.sign === "+").slice(0, 3);
    const risks = list.filter((entry) => entry.sign !== "+").slice(0, 3);
    const group = (entries, tone, label) => {
      if (!entries.length) return "";
      const pills = entries.map((entry) => (
        `<span class="home-ai-factor-pill ${entry.sign === "+" ? "is-positive" : "is-negative"}">`
        + `<span class="home-ai-factor-sign" aria-hidden="true">${entry.sign === "+" ? "+" : "−"}</span>`
        + `<span>${escapeChatHtmlText(entry.text)}</span>`
        + `</span>`
      )).join("");
      return `<div class="cs2-chat-key-factors-group ${tone === "+" ? "is-positive" : "is-negative"}">`
        + `<div class="cs2-chat-key-factors-group-label">${label}</div>`
        + `<div class="home-ai-factor-row">${pills}</div>`
        + `</div>`;
    };
    return `<div class="cs2-chat-key-factors" aria-label="Key factors">`
      + `<div class="cs2-chat-key-factors-label">Key factors (Positives / Risks)</div>`
      + `<div class="cs2-chat-key-factors-groups">${group(positives, "+", "Positives")}${group(risks, "-", "Risks")}</div>`
      + `</div>`;
  }

  const CHAT_VERDICT_TOKENS = "BULLISH|BEARISH|NEUTRAL|SIDEWAYS|GOOD|BAD|POSITIVE|NEGATIVE";

  /** Map product verdict strings → tone class (bullish=green, bearish=red, neutral=yellow). */
  function chatVerdictTone(verdict) {
    const v = String(verdict || "").toUpperCase();
    if (v === "BULLISH" || v === "GOOD" || v === "POSITIVE") return "bullish";
    if (v === "BEARISH" || v === "BAD" || v === "NEGATIVE") return "bearish";
    if (v === "NEUTRAL" || v === "SIDEWAYS") return "neutral";
    return "";
  }

  function decorateChatVerdictHeadingTitle(title) {
    const raw = String(title || "");
    const match = raw.match(new RegExp(`(?:<strong>)?(?:\\*\\*)?(${CHAT_VERDICT_TOKENS})(?:\\*\\*)?(?:<\\/strong>)?`, "i"));
    if (!match) return { html: raw, tone: "" };
    const verdict = match[1].toUpperCase();
    const tone = chatVerdictTone(verdict);
    if (!tone) return { html: raw, tone: "" };
    const html = raw.replace(
      new RegExp(`(?:<strong>)?(?:\\*\\*)?(${CHAT_VERDICT_TOKENS})(?:\\*\\*)?(?:<\\/strong>)?`, "i"),
      `<span class="home-ai-verdict-word is-${tone}">${verdict}</span>`
    );
    return { html, tone };
  }

  const CHAT_OUTLOOK_LINE_PREFIX = "(?:(?:Outlook|Market outlook)\\s*[:\\-–—]\\s*)";

  function chatExtractVerdictTone(text) {
    const match = stripChatPlainText(text).match(new RegExp(`\\b(${CHAT_VERDICT_TOKENS})\\b`, "i"));
    return match ? chatVerdictTone(match[1]) : "";
  }

  function chatSentimentVerdictLabel(tone) {
    if (tone === "bullish") return "BULLISH";
    if (tone === "bearish") return "BEARISH";
    return "NEUTRAL";
  }

  // Resolved per call so the fallback "why" follows the active language.
  function defaultChatSentimentWhy(tone) {
    if (tone === "bullish") return ti("ai_whyBullish");
    if (tone === "bearish") return ti("ai_whyBearish");
    return ti("ai_whyNeutral");
  }

  function sanitizeChatSentimentDetail(detail) {
    let text = String(detail || "").replace(/\*+/g, " ").replace(/\s+/g, " ").trim();
    text = text.replace(/^[:\-–—]+\s*/, "").trim();
    text = text.replace(/^why\b\s*(?:[:\-–—…]|\.{1,3})?\s*/i, "").trim();
    if (!text || /^[.…]{1,3}$/.test(text)) return "";
    // Now/1y € leftovers are not a qualitative why.
    if (/^(?:now|1y)\b/i.test(text) && /€|\$|%/.test(text)) return "";
    return text;
  }

  function chatSentimentFallbackDetail(tone, factors) {
    const list = Array.isArray(factors) ? factors : [];
    const positives = list
      .filter((entry) => entry && entry.sign === "+")
      .map((entry) => String(entry.text || "").trim())
      .filter(Boolean);
    const risks = list
      .filter((entry) => entry && entry.sign !== "+")
      .map((entry) => String(entry.text || "").trim())
      .filter(Boolean);
    if (tone === "bearish") return risks[0] || positives[0] || defaultChatSentimentWhy("bearish");
    if (tone === "bullish") return positives[0] || defaultChatSentimentWhy("bullish");
    return positives[0] || risks[0] || defaultChatSentimentWhy("neutral");
  }

  function isChatSentimentHeading(line) {
    const plain = stripChatPlainText(line)
      .replace(/^#+\s+/, "")
      .replace(/:\s*$/, "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    return /^(?:AI sentiment|AI market(?: verdict)?|Market outlook)\b/i.test(plain);
  }

  function parseChatSentimentBanner(line) {
    const plain = stripChatPlainText(line).replace(/^#+\s+/, "").trim();
    if (!plain) return null;
    const labeled = plain.match(/^(?:AI\s+sentiment|Outlook|Market outlook)\s*[:\-–—]?\s*(.*)$/i);
    if (!labeled) return null;
    const rest = String(labeled[1] || "").trim();
    if (!rest) return { headingOnly: true };
    const match = rest.match(new RegExp(`^(?:\\*\\*)?(${CHAT_VERDICT_TOKENS})(?:\\*\\*)?\\s*[:\\-–—]?\\s*(.*)$`, "i"));
    if (!match) return { headingOnly: true };
    const tone = chatVerdictTone(match[1]);
    if (!tone) return { headingOnly: true };
    return {
      tone,
      verdict: chatSentimentVerdictLabel(tone),
      detail: String(match[2] || "").trim(),
    };
  }

  function parseChatSentimentVerdictLine(line) {
    const banner = parseChatSentimentBanner(line);
    if (banner && !banner.headingOnly) return banner;
    const plain = stripChatPlainText(line).replace(/^#+\s+/, "").trim();
    const match = plain.match(new RegExp(
      `^(?:🟢|🔴|🟡|📈|📉)?\\s*${CHAT_OUTLOOK_LINE_PREFIX}?(?:\\*\\*)?(${CHAT_VERDICT_TOKENS})(?:\\*\\*)?\\s*[:\\-–—]?\\s*(.*)$`,
      "i"
    ));
    if (!match) return null;
    const tone = chatVerdictTone(match[1]);
    if (!tone) return null;
    return {
      tone,
      verdict: chatSentimentVerdictLabel(tone),
      detail: String(match[2] || "").trim(),
    };
  }

  function splitChatSentiment(text) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    const kept = [];
    let sentiment = null;
    let inSection = false;

    const takeSentiment = (parsed) => {
      if (!parsed || parsed.headingOnly) return;
      const detail = sanitizeChatSentimentDetail(parsed.detail);
      if (sentiment && sentiment.verdict && !detail) return;
      sentiment = {
        tone: parsed.tone,
        verdict: parsed.verdict,
        detail: detail || (sentiment && sentiment.detail) || "",
      };
    };

    for (const line of lines) {
      if (isChatSentimentHeading(line) || isChatMarketVerdictHeading(line)) {
        inSection = true;
        const banner = parseChatSentimentBanner(line);
        if (banner && !banner.headingOnly) takeSentiment(banner);
        continue;
      }

      if (inSection) {
        if (!String(line || "").trim()) {
          if (sentiment) inSection = false;
          continue;
        }
        if (isChatSectionHeading(line) && !isChatSentimentHeading(line) && !isChatMarketVerdictHeading(line)) {
          inSection = false;
          kept.push(line);
          continue;
        }
        const parsed = parseChatSentimentVerdictLine(line);
        if (parsed) {
          takeSentiment(parsed);
          continue;
        }
        // Outlook prose stays in the body, after the strip.
        inSection = false;
        kept.push(line);
        continue;
      }

      const banner = parseChatSentimentBanner(line);
      if (banner) {
        if (!banner.headingOnly) takeSentiment(banner);
        continue;
      }
      const lone = parseChatSentimentVerdictLine(line);
      if (lone && !stripChatPlainText(line).replace(/^#+\s+/, "").trim().includes(" ")) {
        takeSentiment(lone);
        continue;
      }

      kept.push(line);
    }

    return { sentiment, content: kept.join("\n") };
  }

  function ensureChatSentiment(parsed, forecast, content, snapshot, factors) {
    const fromParsed = parsed && parsed.tone
      ? {
        tone: parsed.tone,
        verdict: parsed.verdict || chatSentimentVerdictLabel(parsed.tone),
        detail: sanitizeChatSentimentDetail(parsed.detail),
      }
      : null;
    const outlook = chatResolveSnapshotOutlook(forecast, content, snapshot);
    const tone = fromParsed?.tone || chatVerdictTone(outlook) || outlook || "neutral";
    const resolved = tone === "bullish" || tone === "bearish" ? tone : "neutral";
    return {
      tone: resolved,
      verdict: chatSentimentVerdictLabel(resolved),
      detail: fromParsed?.detail || chatSentimentFallbackDetail(resolved, factors),
    };
  }

  function filterChatReplyPicksByRequestedCategory(text, userText) {
    const raw = String(text || "");
    const user = String(userText || "").trim();
    if (!raw || !user || !chatShouldConstrainCategory(user)) return raw;
    const scope = chatRequestedCardScope(user);
    const lines = raw.split(/\r\n|\n|\r/);
    const out = [];
    let inItems = false;
    let inWhy = false;
    let keptItems = 0;
    let hasItemsHeading = false;
    const pickName = (body) => {
      const dash = String(body || "").match(/^(.+?)\s*[—–]\s*(.*)$/u);
      if (dash) return String(dash[1] || "").replace(/^\*\*(.+)\*\*$/u, "$1").replace(/[*]/g, "").trim();
      const priced = String(body || "").match(/^(.+?)\s+((?:€|\$|£)\s*\d[\d.,]*.*)$/u);
      if (priced) return String(priced[1] || "").replace(/^\*\*(.+)\*\*$/u, "$1").replace(/[*]/g, "").trim();
      return String(body || "").replace(/^\*\*(.+)\*\*$/u, "$1").replace(/[*]/g, "").trim();
    };
    for (const line of lines) {
      const trim = String(line || "").trim();
      if (isChatItemsToBuyHeading(line)) {
        inItems = true;
        inWhy = false;
        hasItemsHeading = true;
        out.push(line);
        continue;
      }
      if (isChatWhySectionHeading(line)) {
        inItems = false;
        inWhy = true;
        out.push(line);
        continue;
      }
      if ((inItems || inWhy) && /^#{1,6}\s+/.test(trim) && !isChatWhySectionHeading(line)) {
        inItems = false;
        inWhy = false;
        out.push(line);
        continue;
      }
      if (!(inItems || inWhy)) {
        out.push(line);
        continue;
      }
      const body = trim.replace(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/, "");
      if (!body) {
        out.push(line);
        continue;
      }
      const name = pickName(body);
      if (!name || /^(?:Portfolio\s+total|Total)\b/i.test(name)) {
        out.push(line);
        continue;
      }
      if (!chatItemMatchesScope(name, scope.weapon, scope.type, scope.stattrak)) continue;
      if (inItems) keptItems += 1;
      out.push(line);
    }
    if (keptItems > 0) return out.join("\n");
    const refill = defaultChatCategorySeedNames(scope.type).slice(0, 5);
    if (!refill.length) return out.join("\n");
    const itemLines = refill.map((name) => `• **${name}**`);
    const whyLines = refill.map((name) => `**${name}** — ${fallbackChatWhyReason(name)}`);
    const spliced = [];
    let injectedItems = false;
    let injectedWhy = false;
    if (!hasItemsHeading) out.push("", "### Items to buy", "");
    for (const line of out) {
      spliced.push(line);
      if (!injectedItems && isChatItemsToBuyHeading(line)) {
        spliced.push(...itemLines);
        injectedItems = true;
      }
      if (!injectedWhy && isChatWhySectionHeading(line)) {
        spliced.push(...whyLines);
        injectedWhy = true;
      }
    }
    if (!injectedWhy) spliced.push("", "### Why these picks", "", ...whyLines);
    return spliced.join("\n");
  }

  function expandChatWearAbbreviations(name) {
    const map = { fn: "Factory New", mw: "Minimal Wear", ft: "Field-Tested", ww: "Well-Worn", bs: "Battle-Scarred" };
    return String(name || "")
      .replace(/\((FN|MW|FT|WW|BS)\)/gi, (_, ab) => `(${map[String(ab).toLowerCase()] || ab})`)
      .replace(/\s+(FN|MW|FT|WW|BS)(?=\s*$|\s+[—–\-:])/gi, (_, ab) => ` (${map[String(ab).toLowerCase()] || ab})`);
  }

  function chatMaybeInsertSkinPipe(name) {
    const raw = String(name || "").trim();
    if (!raw || raw.includes("|")) return raw;
    if (/\b(Case|Capsule|Package|Sticker(?: Slab)?|Patch|Pin|Charm|Agent|Graffiti|Music Kit)\b/i.test(raw)) return raw;
    return raw.replace(
      /^((?:★\s*)?(?:StatTrak™|StatTrak|Souvenir)\s+)?(AK-47|M4A1-S|M4A4|AWP|USP-S|Glock-18|Glock|Desert Eagle|Deagle|P250|P2000|Five-SeveN|Tec-9|CZ75-Auto|Dual Berettas|MAC-10|MP7|MP9|MP5-SD|UMP-45|P90|PP-Bizon|Galil AR|FAMAS|SG 553|AUG|SSG 08|SCAR-20|G3SG1|Negev|M249|Nova|XM1014|Sawed-Off|MAG-7|R8 Revolver)\s+(.+)$/i,
      (_, pref, weapon, finish) => `${pref || ""}${weapon} | ${finish}`
    );
  }

  function chatReplyPickDisplayName(body) {
    const text = String(body || "").trim();
    if (!text) return "";
    const dash = text.match(/^(.+?)\s*[—–]\s*(.*)$/u);
    let name = dash ? String(dash[1] || "") : "";
    if (!name) {
      const priced = text.match(/^(.+?)\s+((?:€|\$|£)\s*\d[\d.,]*.*)$/u);
      name = priced ? String(priced[1] || "") : text;
    }
    return name.replace(/^\*\*(.+)\*\*$/u, "$1").replace(/[*]/g, "").trim();
  }

  /** Lowercase weapon|skin + expanded wear, or case/capsule name. FN ≡ Factory New; FT stays distinct. */
  function chatPickIdentityKey(name) {
    let clean = chatReplyPickDisplayName(name) || String(name || "").replace(/\*+/g, "").trim();
    clean = expandChatWearAbbreviations(clean);
    clean = chatMaybeInsertSkinPipe(clean);
    clean = clean
      .replace(/\bstattrak™\b/gi, "StatTrak")
      .replace(/\s*\|\s*/g, " | ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return clean;
  }

  function looksLikeFailedDuplicateSelfCorrection(line) {
    return /duplicate\s+line\s+not\s+allowed/i.test(String(line || "").replace(/\*\*/g, ""));
  }

  /**
   * After category filter: first Items to buy / Why these picks line wins;
   * later copies and "duplicate line not allowed" self-corrections are dropped.
   */
  function deduplicateChatReplyPicks(text) {
    const raw = String(text || "");
    if (!raw) return raw;
    const lines = raw.split(/\r\n|\n|\r/);
    const out = [];
    let inItems = false;
    let inWhy = false;
    const seenItems = Object.create(null);
    const seenWhy = Object.create(null);
    for (const line of lines) {
      const trim = String(line || "").trim();
      if (isChatItemsToBuyHeading(line)) {
        inItems = true;
        inWhy = false;
        out.push(line);
        continue;
      }
      if (isChatWhySectionHeading(line)) {
        inItems = false;
        inWhy = true;
        out.push(line);
        continue;
      }
      if ((inItems || inWhy) && /^#{1,6}\s+/.test(trim) && !isChatWhySectionHeading(line) && !isChatItemsToBuyHeading(line)) {
        inItems = false;
        inWhy = false;
        out.push(line);
        continue;
      }
      if (!(inItems || inWhy)) {
        out.push(line);
        continue;
      }
      if (!trim) {
        out.push(line);
        continue;
      }
      if (looksLikeFailedDuplicateSelfCorrection(line)) continue;
      const marked = /^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/.test(String(line || ""));
      if (inItems && !marked) {
        out.push(line);
        continue;
      }
      const body = trim.replace(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/, "");
      if (!body) {
        out.push(line);
        continue;
      }
      const name = chatReplyPickDisplayName(body);
      if (!name || /^(?:Portfolio\s+total|Total)\b/i.test(name)) {
        out.push(line);
        continue;
      }
      const hasWhyReason = /\s*[—–]\s+\S/u.test(body);
      if (inWhy && !hasWhyReason && isChatWhyThemeLabel(name, "", [])) {
        out.push(line);
        continue;
      }
      const key = chatPickIdentityKey(name);
      if (!key) {
        out.push(line);
        continue;
      }
      const seen = inItems ? seenItems : seenWhy;
      if (seen[key]) continue;
      seen[key] = true;
      out.push(line);
    }
    return out.join("\n");
  }

  function filterChatReplyPicks(text, userText) {
    return deduplicateChatReplyPicks(filterChatReplyPicksByRequestedCategory(text, userText));
  }

  function prepareChatAssistantSections(content, options) {
    const snapshot = options && options.snapshot ? options.snapshot : null;
    const forecast = options && options.forecast ? options.forecast : null;
    const mini = Boolean(options && options.mini);
    const inventoryReview = Boolean(options && options.inventoryReview);
    const userText = options && options.userText ? String(options.userText) : "";
    // On TF2 the overview is dropped whether or not a snapshot came with the
    // turn, so a model-written "TF2 markets overview" block cannot leak into
    // the body now that the strip itself is gone.
    let raw = (snapshot || getActiveGame() === "tf2")
      ? splitChatMarketOverview(content).content
      : String(content || "");
    const metricsSplit = splitChatMetrics(raw);
    const factorSplit = splitChatKeyFactors(metricsSplit.content);
    const sentimentSplit = splitChatSentiment(factorSplit.content);
    let body = stripUnusedChatFactorLeftovers(sentimentSplit.content, factorSplit.factors);
    body = reorderChatCollectionWatchAfterOutlook(body);
    if (mini) body = stripChatMiniMarketChrome(body);
    if (mini && inventoryReview) body = stripChatInventoryBuySections(body);
    else {
      if (!mini && !inventoryReview && userText) {
        body = filterChatReplyPicksByRequestedCategory(body, userText);
      }
      body = deduplicateChatReplyPicks(body);
    }
    const hideMiniInventoryChrome = mini && inventoryReview;
    // Strips render only when the reply actually carries them (first answers do;
    // follow-ups like "make it bigger" deliberately do not). Filling generic
    // placeholder chips on every turn made each answer look the same.
    const showStrips = !hideMiniInventoryChrome && (
      metricsSplit.metrics.length > 0
      || factorSplit.factors.length > 0
      || Boolean(forecast && (forecast.outlook || forecast.item))
      || Boolean(sentimentSplit.sentiment)
    );
    const factors = (hideMiniInventoryChrome || !showStrips) ? [] : ensureChatKeyFactors(factorSplit.factors);
    return {
      metrics: hideMiniInventoryChrome
        ? []
        : (showStrips ? ensureChatMarketMetrics(metricsSplit.metrics) : metricsSplit.metrics),
      factors,
      sentiment: (hideMiniInventoryChrome || !showStrips)
        ? null
        : ensureChatSentiment(sentimentSplit.sentiment, forecast, content, snapshot, factors),
      body,
      showStrips,
    };
  }

  function renderChatMetricsHtml(metrics) {
    const list = (Array.isArray(metrics) ? metrics : [])
      .filter((entry) => entry && String(entry.label || "").trim() && String(entry.value || "").trim());
    if (!list.length) return "";
    const chips = list.map((entry) => {
      const labelText = formatChatMetricDisplayLabel(entry.label).replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const valueText = formatChatMetricDisplayValue(entry.value).replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const detail = translateChatMetricDetail(sanitizeChatMetricDetail(entry.detail || ""))
        || genericChatMetricDetail(entry.label, entry.value);
      const detailHtml = detail
        ? `<span class="home-ai-metric-chip-detail">${detail.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`
        : "";
      return `<span class="home-ai-metric-chip has-detail"><span class="home-ai-metric-chip-label">${labelText}</span><span class="home-ai-metric-chip-value">${valueText}</span>${detailHtml}</span>`;
    }).join("");
    return `<div class="cs2-chat-metrics-strip" aria-label="Item metrics">`
      + `<div class="cs2-chat-metrics-label">Item metrics</div>`
      + `<div class="home-ai-metric-chips">${chips}</div>`
      + `</div>`;
  }

  function renderChatSentimentStripHtml(sentiment, factors) {
    const list = ensureChatKeyFactors(factors);
    const resolved = sentiment && String(sentiment.verdict || "").trim()
      ? sentiment
      : ensureChatSentiment(sentiment, null, "", null, list);
    const tone = resolved.tone === "bullish" || resolved.tone === "bearish" ? resolved.tone : "neutral";
    const verdict = escapeChatHtmlText(resolved.verdict || chatSentimentVerdictLabel(tone));
    const detail = String(resolved.detail || "").trim()
      || chatSentimentFallbackDetail(tone, list);
    const detailHtml = `<span class="cs2-chat-sentiment-sep" aria-hidden="true">—</span>`
      + `<span class="cs2-chat-sentiment-detail">${escapeChatHtmlText(detail)}</span>`;
    return `<div class="cs2-chat-sentiment" aria-label="AI sentiment">`
      + `<div class="cs2-chat-sentiment-label">AI sentiment</div>`
      + `<div class="home-ai-factor-row">`
      + `<span class="home-ai-factor-pill is-${tone}"><span class="cs2-chat-sentiment-badge">${verdict}</span>${detailHtml}</span>`
      + `</div>`
      + `</div>`;
  }

  function renderChatVerdictLine(line) {
    const plain = stripChatPlainText(line);
    const match = plain.match(new RegExp(
      `^(?:🟢|🔴|🟡|📈|📉)?\\s*${CHAT_OUTLOOK_LINE_PREFIX}?(?:\\*\\*)?(${CHAT_VERDICT_TOKENS})(?:\\*\\*)?(.*)$`,
      "i"
    ));
    if (!match) return null;
    const verdict = match[1].toUpperCase();
    const tone = chatVerdictTone(verdict);
    if (!tone) return null;
    let detail = String(line || "").trim()
      .replace(/^(?:🟢|🔴|🟡|📈|📉)\s*/, "")
      .replace(new RegExp(`^(?:<strong>)?(?:\\*\\*)?(?:Outlook|Market outlook)(?:\\*\\*)?(?:<\\/strong>)?\\s*[:\\-–—]\\s*`, "i"), "")
      .replace(new RegExp(`^(?:<strong>)?(?:\\*\\*)?(?:${CHAT_VERDICT_TOKENS})(?:\\*\\*)?(?:<\\/strong>)?`, "i"), "")
      .trim();
    if (detail.startsWith(":")) detail = detail.slice(1).trim();
    detail = detail.replace(new RegExp(`^${verdict}\\s*[:\\-–—]?\\s*`, "i"), "").trim();
    return `<div class="home-ai-verdict-strip is-${tone}"><span class="home-ai-verdict-badge">${verdict}</span>${detail ? `<span class="home-ai-verdict-detail">${detail}</span>` : ""}</div>`;
  }

  /** Plain outlook prose under ### AI market (no leading BULLISH/BEARISH/NEUTRAL token). */
  function renderChatVerdictProsePanel(line, tone) {
    const text = String(line || "").trim();
    if (!text) return null;
    const inferred = tone || chatExtractVerdictTone(text);
    const toneClass = inferred ? ` is-${inferred}` : "";
    return `<div class="home-ai-verdict-strip${toneClass}"><span class="home-ai-verdict-detail">${text}</span></div>`;
  }

  function renderChatMetricChipLine(line) {
    const parsed = parseChatMetricLine(line);
    if (!parsed) return null;
    const labelText = formatChatMetricDisplayLabel(parsed.label);
    const valueText = formatChatMetricDisplayValue(parsed.value);
    const detail = sanitizeChatMetricDetail(parsed.detail || "")
      || genericChatMetricDetail(parsed.label, parsed.value);
    const detailHtml = detail
      ? `<span class="home-ai-metric-chip-detail">${detail.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`
      : "";
    return `<span class="home-ai-metric-chip has-detail"><span class="home-ai-metric-chip-label">${labelText}</span><span class="home-ai-metric-chip-value">${valueText}</span>${detailHtml}</span>`;
  }

  function isChatMarketVerdictHeading(line) {
    const plain = stripChatPlainText(line)
      .replace(/^#+\s+/, "")
      .replace(/:\s*$/, "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    return /^(?:AI market(?: verdict)?|AI sentiment|Market outlook)\b/i.test(plain);
  }

  /** Lone ### Verdict / Verdict heading — not AI SENTIMENT / AI market. */
  function isChatStandaloneVerdictHeading(line) {
    const plain = stripChatHeadingEmojiAndShortlist(
      stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "")
    );
    return /^Verdict$/i.test(plain);
  }

  function stripChatHeadingEmojiAndShortlist(title) {
    return String(title || "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/\(\s*shortlist\s*\)/gi, "")
      .replace(/\bshortlist\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function chatCollectionsToWatchHeadingEmoji(line) {
    const marks = String(line || "").match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu);
    return marks ? marks.join(" ") : "";
  }

  function isChatCollectionsToWatchHeading(line) {
    const plain = stripChatHeadingEmojiAndShortlist(
      stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "")
    );
    return /^collections?\s+to\s+watch\b/i.test(plain);
  }

  function normalizeChatCollectionsToWatchHeading(line) {
    const emoji = chatCollectionsToWatchHeadingEmoji(line);
    return `### Collections to watch${emoji ? ` ${emoji}` : ""}`;
  }

  function isChatItemsToBuyHeading(line) {
    const plain = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "").trim();
    return /^(?:Items to buy|What to buy next|Top opportunity)$/i.test(plain);
  }

  function isChatItemRecapHeading(line) {
    const plain = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "").trim();
    if (!plain) return false;
    return /^(?:proposed\s+(?:final\s+)?mix|final\s+mix(?:\s+near\s+budget)?|adjusted\s+(?:final\s+)?mix)\b/i.test(plain);
  }

  function isChatBudgetAdjustEssay(line) {
    const plain = stripChatPlainText(line).replace(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/, "").trim();
    if (!plain) return false;
    if (/^to hit\b/i.test(plain) && /(?:€|\$|£|total|budget)/i.test(plain)) return true;
    if (/^if you want to stay\b/i.test(plain)) return true;
    if (/^replace\b/i.test(plain) && /\bwith\b/i.test(plain)) return true;
    if (/\bwithout overshooting\b/i.test(plain)) return true;
    if (/^keep\b.{0,80}\bas core\b/i.test(plain)) return true;
    if (/^or alternative\b/i.test(plain)) return true;
    if (/^add a heavier hitter\b/i.test(plain)) return true;
    if (/\bstill under budget\b/i.test(plain)) return true;
    if (/\bnear budget\b/i.test(plain) && /\b(?:proposed|final|mix|adjust)\b/i.test(plain)) return true;
    return false;
  }

  function isChatDuplicateItemRecapLine(line) {
    return isChatPortfolioTotalLine(line) || isChatItemRecapHeading(line) || isChatBudgetAdjustEssay(line);
  }

  /** Drop a lone ### Verdict / Verdict heading. Keep any body under it. */
  function stripChatStandaloneVerdictHeading(text) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    const kept = [];
    for (const line of lines) {
      if (isChatStandaloneVerdictHeading(line)) continue;
      kept.push(line);
    }
    return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  /** Drop a second pick dump / Proposed mix / Portfolio total recap on home and mini. */
  function stripChatDuplicateItemRecap(text) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    const kept = [];
    let seenItemsHeading = false;
    let inWhy = false;
    let itemsClosed = false;
    let skippingRecap = false;
    const isKeptChrome = (line) => isChatMarketVerdictHeading(line)
      || isChatStandaloneVerdictHeading(line)
      || isChatCollectionsToWatchHeading(line)
      || isChatKeyFactorsHeading(line)
      || isChatPositivesHeading(line)
      || isChatNegativesHeading(line)
      || isChatMetricsHeading(line)
      || isChatMarketOverviewHeading(line)
      || isChatRisksHeading(line);

    for (const line of lines) {
      const trim = String(line || "").trim();

      if (isChatWhySectionHeading(line)) {
        skippingRecap = false;
        inWhy = true;
        itemsClosed = true;
        kept.push(line);
        continue;
      }

      if (isChatItemsToBuyHeading(line)) {
        if (seenItemsHeading || itemsClosed) {
          skippingRecap = true;
          inWhy = false;
          continue;
        }
        seenItemsHeading = true;
        skippingRecap = false;
        inWhy = false;
        kept.push(line);
        continue;
      }

      if (skippingRecap) {
        if (!trim) continue;
        if (isChatWhySectionHeading(line)) {
          skippingRecap = false;
          inWhy = true;
          itemsClosed = true;
          kept.push(line);
          continue;
        }
        if (isKeptChrome(line) && !isChatItemRecapHeading(line) && !isChatItemsToBuyHeading(line)) {
          skippingRecap = false;
          inWhy = false;
          kept.push(line);
          continue;
        }
        continue;
      }

      if (isChatDuplicateItemRecapLine(line)) {
        skippingRecap = true;
        inWhy = false;
        continue;
      }

      if (inWhy) {
        if (isChatSectionHeading(line) && !isChatWhySectionHeading(line)) {
          inWhy = false;
          if (isChatItemRecapHeading(line) || isChatItemsToBuyHeading(line) || isChatDuplicateItemRecapLine(line)) {
            skippingRecap = true;
            continue;
          }
          kept.push(line);
          continue;
        }
        const whyBody = trim.replace(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/, "");
        if (
          whyBody
          && looksLikeChatCatalogItem(whyBody)
          && /(?:€|\$|£)\s*\d/.test(whyBody)
          && /(?:[x×]\s*\d+|line[_\s-]?total|listings?)/i.test(whyBody)
        ) {
          continue;
        }
        kept.push(line);
        continue;
      }

      const bullet = String(line || "").match(/^\s*•\s+(.*)$/);
      const body = bullet ? bullet[1].trim() : stripChatPlainText(line).trim();
      const isPick = Boolean(
        body
        && looksLikeChatCatalogItem(body)
        && (bullet || /(?:€|\$|£)\s*\d/.test(body))
      );
      if (isPick) {
        if (itemsClosed) {
          skippingRecap = true;
          continue;
        }
        kept.push(line);
        continue;
      }

      kept.push(line);
    }

    return kept.join("\n");
  }

  function looksLikeChatCollectionTitleName(name) {
    const clean = String(name || "").replace(/\*+/g, "").trim();
    if (!clean || /\|/.test(clean) || clean.length > 70) return false;
    if (/(?:€|\$|£)\s*\d/.test(clean)) return false;
    if (/^(?:The\s+)?.+\s+Collection$/i.test(clean)) return true;
    return /\bcollection\b/i.test(clean);
  }

  function parseChatCollectionWatchLine(line) {
    const trim = String(line || "").trim();
    if (!trim || isChatCollectionsToWatchHeading(trim)) return null;
    if (isChatSectionHeading(trim) && !isChatCollectionsToWatchHeading(trim)) return null;
    const unsigned = trim.replace(/^\s*[+\-−–]\s+/, "");
    const body = unsigned.replace(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/, "").trim();
    const entry = parseChatWhyEntry(body);
    const name = entry?.name || extractChatWhyItemName(body);
    if (!looksLikeChatCollectionTitleName(name)) return null;
    return { name: String(name).replace(/\*+/g, "").trim(), reason: String(entry?.reason || "").trim() };
  }

  /**
   * Remaining markdown after strips are extracted should keep ### AI SENTIMENT /
   * ### Collections to watch in that order — never a collections-first insert
   * before the outlook strip.
   */
  function reorderChatCollectionWatchAfterOutlook(text) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    if (!lines.length) return text;

    const sectionOf = [];
    let current = "body";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isChatMarketVerdictHeading(line)) current = "verdict";
      else if (isChatItemsToBuyHeading(line)) current = "items";
      else if (isChatWhySectionHeading(line)) current = "why";
      else if (isChatCollectionsToWatchHeading(line)) current = "collections";
      else if (isChatSectionHeading(line) || /^#{1,6}\s+\S/.test(String(line || "").trim())) {
        const heading = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "").trim();
        if (/^key factors$/i.test(heading)) current = "factors";
        else if (/^(?:item )?metrics$/i.test(heading)) current = "metrics";
        else current = "other";
      }
      sectionOf[i] = current;
    }

    const watchIdx = [];
    let headingEmoji = "";
    for (let i = 0; i < lines.length; i++) {
      const sec = sectionOf[i];
      if (sec === "items" || sec === "why" || sec === "verdict" || sec === "metrics") continue;
      const line = lines[i];
      if (isChatCollectionsToWatchHeading(line)) {
        watchIdx.push(i);
        const emoji = chatCollectionsToWatchHeadingEmoji(line);
        if (emoji) headingEmoji = emoji;
        continue;
      }
      if (parseChatCollectionWatchLine(line)) watchIdx.push(i);
    }
    if (!watchIdx.length) return text;

    const watchBody = [];
    const seen = new Set();
    watchIdx.forEach((i) => {
      if (isChatCollectionsToWatchHeading(lines[i])) return;
      const parsed = parseChatCollectionWatchLine(lines[i]);
      if (!parsed) return;
      const key = chatWhyNameKey(parsed.name) || parsed.name.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      watchBody.push(parsed.reason ? `**${parsed.name}** — ${parsed.reason}` : `**${parsed.name}**`);
    });
    if (!watchBody.length) return text;

    const heading = `### Collections to watch${headingEmoji ? ` ${headingEmoji}` : ""}`;
    const watchBlock = [heading, "", ...watchBody];

    let verdictLast = null;
    let factorsLast = null;
    let itemsFirst = null;
    for (let i = 0; i < lines.length; i++) {
      if (sectionOf[i] === "verdict") verdictLast = i;
      if (sectionOf[i] === "factors") factorsLast = i;
      if (sectionOf[i] === "items" && itemsFirst === null) itemsFirst = i;
    }
    let insertAt = 0;
    if (verdictLast !== null) insertAt = verdictLast + 1;
    else if (factorsLast !== null) insertAt = factorsLast + 1;
    else if (itemsFirst !== null) insertAt = itemsFirst;

    const remove = new Set(watchIdx);
    const out = [];
    let inserted = false;
    for (let i = 0; i < lines.length; i++) {
      if (i === insertAt && !inserted) {
        if (out.length && String(out[out.length - 1]).trim() !== "") out.push("");
        watchBlock.forEach((row) => out.push(row));
        out.push("");
        inserted = true;
      }
      if (remove.has(i)) continue;
      out.push(lines[i]);
    }
    if (!inserted) {
      if (out.length && String(out[out.length - 1]).trim() !== "") out.push("");
      watchBlock.forEach((row) => out.push(row));
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function extractChatCollectionWatchReasons(text) {
    const rows = [];
    const seen = new Set();
    let section = "body";
    String(text || "").split(/\r\n|\n|\r/).forEach((line) => {
      if (isChatMarketVerdictHeading(line)) { section = "verdict"; return; }
      if (isChatItemsToBuyHeading(line)) { section = "items"; return; }
      if (isChatWhySectionHeading(line)) { section = "why"; return; }
      if (isChatCollectionsToWatchHeading(line)) { section = "collections"; return; }
      if (isChatSectionHeading(line) || /^#{1,6}\s+\S/.test(String(line || "").trim())) {
        section = "other";
        return;
      }
      if (section === "items" || section === "why" || section === "verdict") return;
      const parsed = parseChatCollectionWatchLine(line);
      if (!parsed) return;
      const key = chatWhyNameKey(parsed.name) || parsed.name.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      rows.push(parsed);
    });
    return rows;
  }

  function isChatChartOutlookStubHeading(line) {
    const trim = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "").trim();
    return /^chart\s*\/\s*outlook$/i.test(trim) || /^chart\s+outlook$/i.test(trim);
  }

  function isChatHiddenMetadataHeading(line) {
    const trim = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/:\s*$/, "").trim();
    return /^hidden\s+metadata$/i.test(trim);
  }

  function isChatFutureChartAvailableLine(line) {
    const plain = stripChatPlainText(line).replace(/^#+\s+/, "").replace(/^\s*•\s+/, "").trim();
    return /^(?:future\s+)?charts?\s+available\s*:/i.test(plain);
  }

  // The prompt asks for "---FOLLOWUPS---", but the model also writes it as
  // "---\nFOLLOWUPS---", "--- FOLLOWUPS ---", "—FOLLOWUPS—" or "FOLLOW-UPS:",
  // and the strict match let the questions through into the visible answer
  // (a rule, then "FOLLOWUPS---|How does…"). Upper case is required so a
  // prose "follow-ups" mid-answer is never cut. Mirrors ai_chat_helpers.php.
  const CHAT_FOLLOWUPS_TAIL_RE = /(?:^|\n|-{3,})[ \t]*[-—–_*]*\s*FOLLOW[ \t_-]?UPS[ \t]*[-—–_*:]*[\s\S]*$/;

  function isChatFollowupsMarkerLine(line) {
    const text = String(line || "");
    return /^[ \t]*[-—–_*]*[ \t]*FOLLOW[ \t_-]?UPS[ \t]*[-—–_*:]*/.test(text)
      || /-{3,}[ \t]*FOLLOW[ \t_-]?UPS/.test(text);
  }

  /**
   * Drop Chart / outlook stubs, "Future chart available:…", and Hidden metadata.
   * Charts render from attached payload data — never keep this chrome in the body.
   */
  function stripChatChartOutlookProse(text) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    const kept = [];
    let skipping = false;
    for (const line of lines) {
      if (isChatChartOutlookStubHeading(line) || isChatHiddenMetadataHeading(line)) {
        skipping = true;
        continue;
      }
      if (isChatFutureChartAvailableLine(line) || isChatFollowupsMarkerLine(line)) {
        if (isChatFollowupsMarkerLine(line)) skipping = true;
        continue;
      }
      if (skipping) {
        const trim = String(line || "").trim();
        if (!trim || /^(?:-{3,}|\*{3,}|_{3,})$/.test(trim)) continue;
        if (
          (isChatSectionHeading(line) || /^#{1,6}\s+\S/.test(trim))
          && !isChatChartOutlookStubHeading(line)
          && !isChatHiddenMetadataHeading(line)
        ) {
          skipping = false;
        } else {
          continue;
        }
      }
      kept.push(line);
    }
    return kept.join("\n")
      .replace(CHAT_FOLLOWUPS_TAIL_RE, "")
      .replace(/(?:\n[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*)+\s*$/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function chatHasVisualAssistantPayload(payload) {
    if (!payload || typeof payload !== "object") return false;
    if (payload.forecast && typeof payload.forecast === "object") return true;
    if (payload.distribution && typeof payload.distribution === "object") return true;
    if (payload.price_history && typeof payload.price_history === "object") return true;
    const items = payload.items;
    return Array.isArray(items) && items.length > 0;
  }

  function isChatMiniChromeHeading(line) {
    return isChatMarketVerdictHeading(line)
      || isChatStandaloneVerdictHeading(line)
      || isChatKeyFactorsHeading(line)
      || isChatPositivesHeading(line)
      || isChatNegativesHeading(line)
      || isChatRisksHeading(line)
      || isChatMarketOverviewHeading(line)
      || isChatMetricsHeading(line)
      || isChatChartOutlookStubHeading(line)
      || isChatHiddenMetadataHeading(line);
  }

  /** Collections / items / why must survive chrome skip even when nested under AI market. */
  function isChatMiniKeepLine(line) {
    if (isChatCollectionsToWatchHeading(line) || isChatItemsToBuyHeading(line) || isChatWhySectionHeading(line)) {
      return true;
    }
    if (parseChatCollectionWatchLine(line)) return true;
    const trim = String(line || "").trim();
    const body = trim.replace(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/, "");
    if (!body) return false;
    return looksLikeChatCatalogItem(body) && (/^\s*•\s+/.test(String(line || "")) || /(?:€|\$|£)\s*\d/.test(body));
  }

  /** Mini inventory review: drop shopping lists so the reply stays on current holdings. */
  function stripChatInventoryBuySections(text) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    const kept = [];
    let skipping = false;
    for (const line of lines) {
      if (isChatItemsToBuyHeading(line) || isChatWhySectionHeading(line)) {
        skipping = true;
        continue;
      }
      if (skipping) {
        if (!String(line || "").trim()) continue;
        if (isChatSectionHeading(line) && !isChatItemsToBuyHeading(line) && !isChatWhySectionHeading(line)) {
          skipping = false;
          kept.push(line);
          continue;
        }
        continue;
      }
      kept.push(line);
    }
    return kept.join("\n");
  }

  /** Mini widget: drop leftover AI-market / Key-factors / NEUTRAL status / portfolio totals. */
  function stripChatMiniMarketChrome(text) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    const kept = [];
    let skipping = false;

    for (const line of lines) {
      if (isChatMiniChromeHeading(line)) {
        skipping = true;
        continue;
      }
      if (isChatFutureChartAvailableLine(line) || isChatFollowupsMarkerLine(line)) {
        continue;
      }
      if (isChatMetricsHeading(line) || parseChatMetricLine(line)) {
        continue;
      }

      if (isChatMiniKeepLine(line)) {
        skipping = false;
        kept.push(line);
        continue;
      }

      if (skipping) {
        if (!String(line || "").trim()) continue;
        if (isChatSectionHeading(line) && !isChatMiniChromeHeading(line)) {
          skipping = false;
        } else {
          continue;
        }
      }

      if (renderChatVerdictLine(line)) continue;
      if (isChatPortfolioTotalLine(line)) continue;
      const signed = parseChatFactorLine(line);
      if (signed) {
        const factorText = String(signed.text || "").trim();
        const signedName = extractChatWhyItemName(factorText) || factorText;
        if (looksLikeChatCollectionTitleName(signedName)) {
          kept.push(line);
          continue;
        }
        if (!looksLikeChatCatalogItem(factorText) && !/(?:€|\$|£)\s*\d/.test(factorText)) {
          continue;
        }
      }

      kept.push(line);
    }

    return kept.join("\n");
  }

  function defaultChatCollectionCatalogNames() {
    const names = [];
    const seen = new Set();
    const push = (value) => {
      const clean = String(value || "").trim();
      if (!clean || !/\bcollection\b/i.test(clean)) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      names.push(clean);
    };
    const catalog = (typeof window !== "undefined" && window.CS2ReactData && Array.isArray(window.CS2ReactData.COLLECTION_CATALOG))
      ? window.CS2ReactData.COLLECTION_CATALOG
      : [];
    catalog.forEach((entry) => push(entry && entry.name));
    ["The Achroma Collection", "The Ascent Collection", "The Boreal Collection"].forEach(push);
    return names.slice(0, 3);
  }

  function defaultChatPortfolioSeedNames() {
    return [
      "AK-47 | Redline (Field-Tested)",
      "USP-S | Cortex (Field-Tested)",
      "Glock-18 | Water Elemental (Factory New)",
      "M4A1-S | Night Terror (Factory New)",
      "AWP | Worm God (Factory New)",
    ];
  }

  function defaultChatCategorySeedNames(type) {
    if (type === "gloves") {
      return [
        "Specialist Gloves | Fade (Field-Tested)",
        "Hydra Gloves | Emerald (Field-Tested)",
        "Sport Gloves | Pandora's Box (Field-Tested)",
        "Driver Gloves | Imperial Plaid (Field-Tested)",
        "Specialist Gloves | Crimson Kimono (Field-Tested)",
      ];
    }
    if (type === "knife") {
      return [
        "Bayonet | Doppler (Factory New)",
        "Karambit | Fade (Factory New)",
        "Butterfly Knife | Autotronic (Field-Tested)",
        "M9 Bayonet | Tiger Tooth (Factory New)",
      ];
    }
    if (type === "sticker_capsule") {
      return [
        "Paris 2023 Legends Sticker Capsule",
        "Paris 2023 Challengers Sticker Capsule",
        "Paris 2023 Contenders Sticker Capsule",
        "Budapest 2025 Contenders Sticker Capsule",
        "Budapest 2025 Challengers Sticker Capsule",
      ];
    }
    if (type === "sticker") {
      return [
        "Sticker | Titan (Holo) | Katowice 2014",
        "Sticker | b1t | Paris 2023",
        "Sticker | arT | Paris 2023",
        "Paris 2023 Legends Sticker Capsule",
        "Budapest 2025 Contenders Sticker Capsule",
      ];
    }
    if (type === "charm") {
      return [
        "Charm | Backsplash",
        "Charm | Stitch-Loaded",
        "Charm | Lil' Cap Gun",
        "Charm | Fluffy",
        "Charm | Gritty",
      ];
    }
    if (type === "souvenir") {
      return [
        "Paris 2023 Anubis Souvenir Package",
        "Stockholm 2021 Dust II Souvenir Package",
        "Antwerp 2022 Mirage Souvenir Package",
        "Souvenir MAC-10 | Palm (Field-Tested)",
        "Souvenir Glock-18 | Groundwater (Field-Tested)",
      ];
    }
    if (type === "case") {
      return [
        "Dreams & Nightmares Case",
        "Kilowatt Case",
        "Revolution Case",
        "Fracture Case",
        "Recoil Case",
      ];
    }
    return [];
  }

  /**
   * Scopes whose answer must never bottom out in the generic gun-skin portfolio
   * seeds — a capsule ask answered with AK-47 | Redline is just wrong.
   */
  function chatScopeExcludesGunSkins(type) {
    return ["sticker_capsule", "sticker", "charm", "souvenir", "collection", "case"].includes(String(type || ""));
  }

  function chatShouldConstrainCategory(userText) {
    const scope = chatRequestedCardScope(userText);
    if (["souvenir", "charm", "collection", "sticker", "sticker_capsule"].includes(scope.type)) return false;
    if (["gloves", "knife", "rifle", "pistol", "smg", "shotgun", "sniper", "heavy", "stattrak", "case"].includes(scope.type)) {
      return true;
    }
    return Boolean(scope.weapon || scope.stattrak);
  }

  function chatUserWantsSkinsInvestPortfolio(userText) {
    const message = String(userText || "").toLowerCase();
    if (!message) return false;
    if (/\bsouvenirs?\b/.test(message) && !/\b(skins?|portfolio)\b/.test(message)) return false;
    if (/\b(charms?|keychains?)\b/.test(message) && !/\b(skins?|portfolio)\b/.test(message)) return false;
    if (/\bstickers?\b/.test(message) && !/\b(skins?|portfolio)\b/.test(message)) return false;
    if (/\bcapsules?\b/.test(message) && !/\b(skins?|cases?|portfolio)\b/.test(message)) return false;
    if (/\bcollections?\b/.test(message) && !/\b(skins?|finishes?)\b/.test(message)) return false;
    const wantsCases = /\bcases?\b/.test(message);
    const wantsSkins = /\b(skins?|finishes?)\b/.test(message);
    const wantsPortfolio = /\bportfolio\b/.test(message);
    if (wantsCases && !wantsSkins && !wantsPortfolio) return false;
    const hasMoney = /(?:€|\$|£)\s*\d{2,}|\babout\s+(?:€|\$|£)\s*\d{2,}/.test(message);
    const hasInvest = /\binvest(?:ing|ment)?s?\b/.test(message);
    const chartTop = /\bchart(?:s|ing)?\b.{0,48}\btop\s+item\b|\btop\s+item\b.{0,32}\bchart|\bchart(?:s|ing)?\b.{0,40}\bstrongest\s+pick\b/.test(message);
    if (hasMoney && (wantsPortfolio || hasInvest || chartTop)) return true;
    if (wantsPortfolio && hasInvest) return true;
    if (wantsSkins && hasInvest) return true;
    if (chartTop && (wantsPortfolio || hasInvest || hasMoney)) return true;
    return false;
  }

  function chatUserWantsCollectionsInvest(userText) {
    const message = String(userText || "").toLowerCase();
    if (!message || !/\bcollections?\b/.test(message)) return false;
    if (chatUserWantsSkinsInvestPortfolio(message)) return false;
    return /\b(invest(?:ing|ment)?s?|best|top|buy|hold|recommend|suggest|which|what)\b/.test(message);
  }

  function chatBodyHasItemPicks(text) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    for (const line of lines) {
      if (isChatItemsToBuyHeading(line) || isChatWhySectionHeading(line)) return true;
      const trim = String(line || "").trim();
      const body = trim.replace(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/, "");
      if (/^\s*•\s+/.test(String(line || "")) && looksLikeChatCatalogItem(body)) return true;
    }
    return false;
  }

  function chatMarkdownHasVisibleBody(text) {
    const lines = String(text || "").split(/\r\n|\n|\r/);
    for (const line of lines) {
      const trim = String(line || "").trim();
      if (!trim) continue;
      if (isChatMiniChromeHeading(line) || isChatMetricsHeading(line) || isChatMarketOverviewHeading(line)) continue;
      if (renderChatVerdictLine(line)) continue;
      if (typeof parseChatMetricLine === "function" && parseChatMetricLine(line)) continue;
      if (isChatPortfolioTotalLine(line) || isChatDisclaimerLine(line)) continue;
      const signed = parseChatFactorLine(line);
      if (signed) {
        const factorText = String(signed.text || "").trim();
        const signedName = extractChatWhyItemName(factorText) || factorText;
        if (!looksLikeChatCollectionTitleName(signedName) && !looksLikeChatCatalogItem(factorText) && !/(?:€|\$|£)\s*\d/.test(factorText)) {
          continue;
        }
      }
      const plain = stripChatPlainText(trim).replace(/^#+\s+/, "").trim();
      if (plain.length >= 3) return true;
    }
    return false;
  }

  function chatRenderedHtmlHasVisibleBody(html) {
    const plain = String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return plain.length >= 8;
  }

  function formatChatFallbackPrice(item) {
    const price = item && (item.cheapest_price != null ? item.cheapest_price : item.seed_sell_price);
    if (Number.isFinite(Number(price)) && Number(price) > 0) {
      return `€${Number(price).toFixed(2)}`;
    }
    return "";
  }

  function synthesizeChatFallbackMarkdown(content, cardItems, userText) {
    const items = parseChatItems(cardItems);
    const user = String(userText || "").trim();
    const wantsCollections = user !== "" && chatUserWantsCollectionsInvest(user);

    const skins = [];
    const seenSkin = new Set();
    const pushSkin = (name) => {
      const clean = String(name || "").replace(/\*+/g, "").trim();
      if (!clean || looksLikeChatCollectionTitleName(clean)) return;
      const key = clean.toLowerCase();
      if (seenSkin.has(key)) return;
      seenSkin.add(key);
      skins.push(clean);
    };
    const scope = chatRequestedCardScope(user);
    items.forEach((item) => {
      const name = item && (item.market_hash_name || item.display_name);
      if (!name) return;
      if (chatShouldConstrainCategory(user) && !chatItemMatchesScope(name, scope.weapon, scope.type, scope.stattrak)) {
        return;
      }
      pushSkin(name);
    });
    if (!skins.length) {
      const categorySeeds = defaultChatCategorySeedNames(scope.type);
      if (categorySeeds.length) categorySeeds.forEach(pushSkin);
      else if (!chatShouldConstrainCategory(user) && !chatScopeExcludesGunSkins(scope.type)) {
        defaultChatPortfolioSeedNames().forEach(pushSkin);
      }
    }

    const priceOf = (name) => {
      const key = String(name || "").toLowerCase();
      const hit = items.find((item) => String(item.market_hash_name || item.display_name || "").toLowerCase() === key);
      return hit ? formatChatFallbackPrice(hit) : "";
    };

    const itemLines = skins.slice(0, 5).map((name) => {
      const price = priceOf(name);
      return price ? `• **${name}** — ${price}` : `• **${name}**`;
    });
    const whyLines = skins.slice(0, 5).map((name) => `**${name}** — ${fallbackChatWhyReason(name)}`);

    if (wantsCollections) {
      const collections = [];
      const seenCol = new Set();
      const pushCollection = (name) => {
        const clean = String(name || "").replace(/\*+/g, "").trim();
        if (!looksLikeChatCollectionTitleName(clean)) return;
        const key = chatWhyNameKey(clean) || clean.toLowerCase();
        if (!key || seenCol.has(key)) return;
        seenCol.add(key);
        collections.push(clean);
      };
      extractChatCollectionWatchReasons(content).forEach((row) => pushCollection(row && row.name));
      defaultChatCollectionCatalogNames().forEach(pushCollection);
      const collectionNames = collections.slice(0, 3);
      const lines = ["### Collections to watch", ""];
      collectionNames.forEach((name) => {
        lines.push(`**${name}** — ${fallbackChatCollectionWatchReason()}`);
      });
      if (itemLines.length) {
        lines.push("", "### Items to buy", "", ...itemLines, "", "### Why these picks", "");
        lines.push(...whyLines);
      }
      return lines.join("\n").trim();
    }

    if (!itemLines.length) return "";
    return ["### Items to buy", "", ...itemLines, "", "### Why these picks", "", ...whyLines].join("\n").trim();
  }

  function resolveChatAssistantBodyMarkdown(preparedBody, originalContent, cardItems, userText, options) {
    const hideBuyLists = Boolean(options && options.inventoryReview) || isInventoryReviewUserText(userText);
    const body = String(preparedBody || "");
    if (hideBuyLists) return body;
    const user = String(userText || "").trim();
    if (chatBodyHasItemPicks(body)) {
      return filterChatReplyPicks(body, user);
    }
    if (chatUserWantsCollectionsInvest(user) && chatMarkdownHasVisibleBody(body)) return body;
    if (chatUserWantsSkinsInvestPortfolio(user) || !chatMarkdownHasVisibleBody(body)) {
      return synthesizeChatFallbackMarkdown(originalContent, cardItems, userText) || body;
    }
    return body;
  }

  function chatReplyFromPayload(payload, cardItems, userText) {
    let reply = stripMarkMarkdown(String((payload && (payload.reply || payload.message?.content)) || "").trim());
    if (!reply && !isInventoryReviewUserText(userText)) {
      reply = synthesizeChatFallbackMarkdown("", cardItems, userText);
    }
    return reply;
  }

  function isChatEmptyReplyFailure(payload, response) {
    const err = String((payload && payload.error) || "").trim();
    if (/empty reply/i.test(err)) return true;
    if (response && response.ok && payload && payload.success !== false) {
      return !String(payload.reply || payload.message?.content || "").trim();
    }
    return false;
  }

  function stripChatHeadingDecorations(title) {
    return String(title || "")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/\s+/g, " ")
      .replace(/:\s*$/, "")
      .trim();
  }

  function renderChatHeadingLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) return null;
    if (isChatStandaloneVerdictHeading(trimmed)) return "";
    if (/^-{3,}$/.test(trimmed)) return '<hr class="home-ai-md-divider">';
    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) {
      const rawTitle = h3[1].trim();
      if (isChatStandaloneVerdictHeading(rawTitle)) return "";
      const isVerdict = isChatMarketVerdictHeading(rawTitle);
      const isCollectionsWatch = isChatCollectionsToWatchHeading(rawTitle);
      let title = isVerdict ? stripChatHeadingDecorations(rawTitle) : rawTitle;
      if (isCollectionsWatch) title = normalizeChatCollectionsToWatchHeading(rawTitle).replace(/^#+\s+/, "");
      let cls = isVerdict
        ? "home-ai-md-h3 home-ai-verdict-label"
        : "home-ai-md-h3";
      if (isVerdict) {
        title = title.replace(/\bverdict\b/gi, "").replace(/\s+/g, " ").trim();
        const decorated = decorateChatVerdictHeadingTitle(title);
        title = decorated.html;
        if (decorated.tone) cls += ` is-${decorated.tone}`;
      } else {
        // The model keeps ### headings in English so the parser can key off
        // them; translate for display only (verdict titles are already HTML).
        title = translateChatSectionHeading(title);
      }
      return `<h3 class="${cls}">${title}</h3>`;
    }
    const h4 = trimmed.match(/^##\s+(.+)$/);
    if (h4) {
      const rawTitle = h4[1].trim();
      if (isChatStandaloneVerdictHeading(rawTitle)) return "";
      if (isChatSentimentHeading(rawTitle) || isChatMarketVerdictHeading(rawTitle)) {
        return `<h3 class="home-ai-md-h3 home-ai-verdict-label">${escapeChatHtmlText(ti("ai_sentiment"))}</h3>`;
      }
      return `<h4 class="home-ai-md-h4">${translateChatSectionHeading(rawTitle)}</h4>`;
    }
    if (isChatSectionHeading(trimmed)) {
      let label = stripChatHeadingDecorations(trimmed.replace(/^#+\s+/, ""));
      if (isChatStandaloneVerdictHeading(label)) return "";
      if (isChatSentimentHeading(label) || isChatMarketVerdictHeading(label)) {
        return `<h3 class="home-ai-md-h3 home-ai-verdict-label">${escapeChatHtmlText(ti("ai_sentiment"))}</h3>`;
      }
      if (isChatCollectionsToWatchHeading(label)) {
        label = normalizeChatCollectionsToWatchHeading(label).replace(/^#+\s+/, "");
      }
      return `<h4 class="home-ai-md-h4">${translateChatSectionHeading(label)}</h4>`;
    }
    return null;
  }

  const CHAT_BULLET_MARK = String.raw`(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+[.)])`;

  /** Collapse leftover `— —` / `--` and leading wrap dashes (mini Items to buy). */
  function cleanChatMiniDashJunk(value) {
    let s = String(value || "");
    s = s.replace(/(?:\s*[—–]\s*){2,}/g, " — ");
    s = s.replace(/\s+-{2,}\s+/g, " ");
    s = s.replace(/<br\s*\/?>\s*(?:[—–\-]+\s*)+/gi, "<br>");
    s = s.replace(/^(?:[\s]*[—–\-]+\s*)+/u, "");
    s = s.replace(/(?:[\s]*[—–\-]+\s*)+$/u, "");
    return s.replace(/\s+/g, " ").trim();
  }

  /**
   * Mini pick bullets: keep name + price (+ qty / line total). Drop the `— why` tail
   * so reasons stay under Why these picks and do not wrap a lone dash onto the next line.
   */
  function stripChatMiniPickReason(value) {
    let s = cleanChatMiniDashJunk(value);
    if (!s) return s;
    const qty = s.match(/^(.*?[x×]\s*\d+\s*=\s*(?:€|\$|£)\s*\d[\d.,]*)(.*)$/i);
    if (qty && /(?:€|\$|£)\s*\d/.test(qty[1])) {
      return qty[1].replace(/[\s,;:—–\-]+$/u, "").trim();
    }
    const priced = s.match(/^(.*?(?:€|\$|£)\s*\d[\d.,]*)(.*)$/);
    if (priced) {
      return priced[1].replace(/[\s,;:—–\-]+$/u, "").trim();
    }
    return s;
  }

  function cleanChatMiniRenderedHtml(html) {
    return String(html || "").replace(/<li>([\s\S]*?)<\/li>/g, (_, inner) => (
      `<li>${stripChatMiniPickReason(inner)}</li>`
    ));
  }

  function normalizeChatBulletMarkers(text) {
    // Preserve ASCII "-" so leftover signed factor lines stay detectable
    // (`+ Supply` / `- Thin liquidity`) and can be dropped, not turned into • bullets.
    const re = new RegExp(`^(\\s*)(${CHAT_BULLET_MARK})\\s+(.*)$`, "gm");
    return String(text || "").replace(re, (full, indent, mark, rest) => {
      const body = String(rest || "").trim();
      if (!body) {
        return `${indent}• `;
      }
      if (mark === "-" || mark === "−" || mark === "–") {
        return `${indent}- ${body}`;
      }
      return `${indent}• ${body}`;
    });
  }

  function flattenChatBulletItems(text, options) {
    const mini = Boolean(options && options.mini);
    const EXTRA_LIMIT = 220;
    const lines = String(text || "").split(/\r\n|\n|\r/);
    const isPostList = (line) => /\b(not financial advice|disclaimer|volatility|chart (?:is )?below|cards below)\b/i.test(String(line || "").trim());
    const isEssayHeading = (line) => isChatSectionHeading(line)
      || /^(?:\*\*)?(?:Reason to buy|Why(?: to buy| it)?|Chart pick|Outlook|Buy on)\s*:?\s*(?:\*\*)?$/i.test(String(line || "").trim());
    const isWrapUp = (line) => {
      const trim = String(line || "").trim();
      if (!trim) return false;
      if (isPostList(trim)) return true;
      if (isChatSectionHeading(trim)) return true;
      if (isChatDuplicateItemRecapLine(trim)) return true;
      return /^(?:These|Those|Anyway|So yeah|Quick take:)\b/i.test(trim);
    };
    const isContinuation = (line) => {
      const trim = line.trim();
      if (!trim) return false;
      if (isEssayHeading(trim)) return true;
      // Nested non-item bullets can fold into the parent; nested catalog items are promoted.
      if (/^\s+•\s+/.test(line) && !looksLikeChatCatalogItem(trim.replace(/^•\s+/, ""))) return true;
      return false;
    };
    const looksLikeItem = looksLikeChatCatalogItem;
    const extractPrice = (value) => {
      const match = String(value || "").match(/(?:€|\$|£)\s*\d[\d.,]*/);
      return match ? match[0].trim() : "";
    };
    const normalizeExtra = (extra) => String(extra || "")
      .trim()
      .replace(/^(?:[\s]*[—–\-]+[\s]*)+/u, "")
      .replace(/^•\s+/, "")
      .replace(/^(?:\*\*)?(?:Reason to buy|Why to buy)\s*:?\s*/i, "")
      .trim();
    const isMarketOnlyExtra = (value) => {
      const v = String(value || "").trim().replace(/[.,;]+$/g, "");
      if (!v) return true;
      if (/^(?:cheapest\s+)?(?:listed|ask|listing)$/i.test(v)) return true;
      if (/^(?:cheapest\s+)?on\s+(?:steam|skinport|cs\s*float|csfloat|white(?:\.?\s*market)?|dmarket|shadowpay|waxpeer|mannco(?:\.?\s*store)?|halo\s*skins|haloskins|market\.?csgo|buff(?:163)?|csmoney)(?:\s+market)?$/i.test(v)) return true;
      if (/^buy on\s+\S+$/i.test(v)) return true;
      return false;
    };
    const capExtra = (extra) => {
      const value = normalizeExtra(extra);
      if (!value || isEssayHeading(value) || isMarketOnlyExtra(value) || value.length > EXTRA_LIMIT) return "";
      return value;
    };
    const hasExtraClause = (body) => {
      const match = String(body || "").match(/(?:€|\$|£)\s*\d[\d.,]*(.*)$/);
      return !!(match && capExtra(match[1]));
    };
    const isKeepableExtra = (line) => {
      let trim = String(line || "").trim();
      if (!trim || isWrapUp(trim) || isEssayHeading(trim)) return false;
      if (/^\s*•\s+/.test(line) && !/^\s{2,}•\s+/.test(line)) return false;
      const nested = String(line || "").match(/^\s{2,}•\s+(.*)$/);
      if (nested) {
        const nestedBody = nested[1].trim();
        if (looksLikeItem(nestedBody)) return false;
        trim = nestedBody;
      }
      return capExtra(trim) !== "";
    };
    const trimBody = (body) => {
      let value = String(body || "").trim();
      let marketHint = "";
      const buyOn = value.match(/Buy on ([^*\n]+?) for ((?:€|\$|£)\s*\d[\d.,]*)/i);
      if (buyOn) {
        marketHint = buyOn[1].trim();
        const buyPrice = buyOn[2].trim();
        value = value.replace(/\s*(?:\*\*)?Buy on [^*\n]+? for (?:€|\$|£)\s*\d[\d.,]*(?:\*\*)?/gi, "");
        value = value.replace(/^[\s—–\-]+|[\s—–\-]+$/g, "").trim();
        if (!extractPrice(value) && buyPrice) value = value ? `${value} — ${buyPrice}` : buyPrice;
      }
      value = value.replace(/\s*(?:\*\*)?(?:Reason to buy|Why to buy)\s*:?\s*/gi, " ").replace(/\s+/g, " ").trim();
      if (!looksLikeItem(value)) return value;
      // Mini: keep a same-line why for Why-fallback parsing. Do not glue extras with another ` — `.
      if (mini) return value;
      const priced = value.match(/^(.+?(?:€|\$|£)\s*\d[\d.,]*)(.*)$/);
      if (!priced) {
        return value;
      }
      const head = priced[1].replace(/[ \t.,;]+$/, "");
      let extra = capExtra(priced[2]);
      return extra ? `${head} — ${extra}` : head;
    };
    const pushBullet = (body, harvestedPrice, keptExtraLine) => {
      let value = body;
      if (harvestedPrice && !extractPrice(value)) value += ` — ${harvestedPrice}`;
      if (!mini && keptExtraLine && !hasExtraClause(value)) value += ` — ${keptExtraLine}`;
      out.push(`• ${value}`);
    };

    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const bullet = line.match(/^(\s*)•\s+(.*)$/);
      if (bullet) {
        const indent = bullet[1] || "";
        let body = trimBody(bullet[2]);
        if (!body) {
          i += 1;
          continue;
        }
        // Nested catalog picks → same-level bullets (uniform size). Nested prose → plain text.
        if (indent.length >= 2 && !looksLikeItem(body)) {
          out.push(body);
          i += 1;
          continue;
        }
        if (!looksLikeItem(body)) {
          out.push(body);
          i += 1;
          continue;
        }
        i += 1;
        let harvestedPrice = "";
        let keptExtraLine = "";
        while (i < lines.length) {
          const next = lines[i];
          const trimNext = next.trim();
          if (trimNext === "") {
            let j = i;
            while (j < lines.length && lines[j].trim() === "") j += 1;
            if (j >= lines.length) {
              i = j;
              break;
            }
            const after = lines[j];
            if (/^\s*•\s+/.test(after) && !/^\s{2,}•\s+/.test(after)) {
              i = j;
              continue;
            }
            if (isWrapUp(after)) {
              pushBullet(body, harvestedPrice, keptExtraLine);
              i = j;
              body = "";
              break;
            }
            if (isContinuation(after) || isKeepableExtra(after)) {
              if (!harvestedPrice) harvestedPrice = extractPrice(after);
              i = j;
              continue;
            }
            pushBullet(body, harvestedPrice, keptExtraLine);
            i = j;
            body = "";
            break;
          }
          if (/^\s*•\s+/.test(next) && !/^\s{2,}•\s+/.test(next)) break;
          if (isWrapUp(next)) break;
          const buyOn = trimNext.match(/Buy on ([^*\n]+?) for ((?:€|\$|£)\s*\d[\d.,]*)/i);
          if (buyOn) {
            if (!harvestedPrice) harvestedPrice = buyOn[2].trim();
            i += 1;
            continue;
          }
          if (isEssayHeading(trimNext)) {
            i += 1;
            continue;
          }
          if (isKeepableExtra(next) && (mini || (!keptExtraLine && !hasExtraClause(body)))) {
            if (!harvestedPrice) harvestedPrice = extractPrice(next);
            if (!mini && !keptExtraLine && !hasExtraClause(body)) {
              keptExtraLine = capExtra(trimNext);
            }
            i += 1;
            continue;
          }
          break;
        }
        if (body) pushBullet(body, harvestedPrice, keptExtraLine);
        continue;
      }
      out.push(line);
      i += 1;
    }

    return out.join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/(^|\n)((?:• [^\n]*\n)+)\n+/g, "$1$2")
      .trim();
  }

  function stripMarkMarkdown(text) {
    let value = String(text || "");
    value = value.replace(/__(.+?)__/gs, "**$1**");
    // Convert markdown / unicode list markers into ball bullets.
    value = normalizeChatBulletMarkers(value);
    value = value.replace(/\[\s*Interactive\s+ARIMA\s+chart\s+appears\s+here\s*\]/gi, "");
    // Catch [Chart attached], [interactive chart below], [graph shown], etc.
    value = value.replace(
      /\[\s*(?:an?\s+)?(?:interactive\s+)?(?:ARIMA\s+)?(?:chart|graph|plot)(?:\s+(?:attached|appears|shown|here|below|above|ready)){0,3}\s*\]/gi,
      ""
    );
    // Bare stub lines the model sometimes emits instead of real prose.
    value = value.replace(
      /(?:^|\n)\s*(?:\*\*)?(?:Future(?:\s+outlook)?|Market\s+Distribution|Price\s+History|Charts?)(?:\*\*)?\s*:?\s*(?=\n|$)/gi,
      "\n"
    );
    value = value.replace(
      /(?:^|\n)\s*(?:chart|graph|plot)\s+(?:attached|appears|shown|below|here)\.?\s*(?=\n|$)/gi,
      "\n"
    );
    value = stripChatChartOutlookProse(value);
    value = flattenChatBulletItems(value);
    value = value
      .split(/\r\n|\n|\r/)
      .filter((line) => !isChatDisclaimerLine(line))
      .join("\n")
      .replace(/(?:\n[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*)+\s*$/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return value;
  }

  function escapeChatHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatChatRichText(text, cardItems, options) {
    const mini = Boolean(options && options.mini);
    const inventoryReview = Boolean(options && options.inventoryReview);
    let raw = String(text || "");
    raw = stripChatChartOutlookProse(raw);
    raw = normalizeChatBulletMarkers(raw);
    raw = stripChatDuplicateItemRecap(raw);
    raw = stripChatStandaloneVerdictHeading(raw);
    if (inventoryReview) raw = stripChatInventoryBuySections(raw);
    raw = flattenChatBulletItems(raw, { mini });
    raw = raw.replace(/\*\*$/, "");
    raw = reorderChatCollectionWatchAfterOutlook(raw);
    const cardWhyNames = parseChatItems(cardItems).map(chatWhyCardLabel).filter(Boolean);
    const escaped = escapeChatHtml(raw);
    const withBold = escaped
      .replace(/\*\*(.+?)\*\*/gs, "<strong>$1</strong>")
      .replace(/__(.+?)__/gs, "<strong>$1</strong>");

    const lines = withBold.split(/\r\n|\n|\r/);
    const out = [];
    let items = [];
    let pendingVerdictBody = false;
    let pendingVerdictTone = "";
    let inWhy = false;
    let inWhyNamesOnly = false;
    let whyNameBuffer = [];
    const pickNamesFromList = [];
    const pushHeadingChunk = (rawLine) => {
      if (
        isChatStandaloneVerdictHeading(rawLine)
        || isChatMiniChromeHeading(rawLine)
        || isChatSentimentHeading(rawLine)
        || isChatMarketVerdictHeading(rawLine)
      ) {
        pendingVerdictBody = false;
        pendingVerdictTone = "";
        return true;
      }
      const heading = renderChatHeadingLine(String(rawLine || "").trim());
      if (heading) {
        if (/home-ai-verdict-label/.test(heading)) {
          pendingVerdictBody = false;
          pendingVerdictTone = "";
          return true;
        }
        pendingVerdictBody = false;
        pendingVerdictTone = "";
        out.push(heading);
        return true;
      }
      return false;
    };
    const ensureChatItemTitleBold = (html) => {
      const raw = String(html || "");
      if (!raw || /<strong[\s>]/i.test(raw)) return raw;
      // Bold leading item title before first em dash / currency.
      const match = raw.match(/^(.+?)(\s*[—–]\s*.*|\s+(?:€|\$|£)\s*\d[\d.,]*.*)$/);
      if (!match) return raw;
      const name = match[1].trim();
      const rest = match[2];
      if (!name || name.length > 80) return raw;
      return `<strong>${name}</strong>${rest}`;
    };
    const stripWhyListMarker = (value) => String(value || "")
      .replace(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+/, "")
      .trim();
    const pushWhyLine = (body) => {
      flushList();
      const cleaned = stripWhyListMarker(body);
      if (!cleaned) return;
      const plainName = extractChatWhyItemName(stripChatPlainText(cleaned));
      if (plainName && looksLikeChatCollectionTitleName(plainName)) return;
      const entry = parseChatWhyEntry(stripChatPlainText(cleaned));
      // Why explains individual items only — collection titles get no rationale line.
      if (entry && looksLikeChatCollectionTitleName(entry.name)) return;
      if (entry && isChatWhyThemeLabel(entry.name, entry.reason, cardWhyNames)) {
        const theme = renderChatWhyThemeHtml(entry.name);
        if (theme) out.push(theme);
        return;
      }
      if (entry) {
        const html = renderChatWhyLineHtml(entry.name, entry.reason);
        if (html) out.push(html);
        return;
      }
      out.push(`<div class="home-ai-why-line">${ensureChatItemTitleBold(cleaned)}</div>`);
    };
    const endWhyNames = () => {
      if (!inWhyNamesOnly) {
        whyNameBuffer = [];
        return;
      }
      const rows = [];
      const themes = [];
      const seenRows = new Set();
      const seenThemes = new Set();
      const pushRow = (name, reason) => {
        const clean = String(name || "").replace(/\*+/g, "").trim();
        if (!clean || looksLikeChatCollectionTitleName(clean)) return;
        if (isChatWhyThemeLabel(clean, reason, cardWhyNames)) return;
        const key = chatWhyNameKey(clean) || clean.toLowerCase();
        if (seenRows.has(key)) return;
        seenRows.add(key);
        rows.push({ name: clean, reason: String(reason || "").trim() });
      };
      const pushTheme = (name) => {
        const clean = String(name || "").replace(/\*+/g, "").trim();
        if (!clean) return;
        const key = chatWhyNameKey(clean) || clean.toLowerCase();
        if (seenThemes.has(key)) return;
        seenThemes.add(key);
        themes.push(clean);
      };
      whyNameBuffer.forEach((entry) => {
        if (looksLikeChatCollectionTitleName(entry.name)) return;
        if (isChatWhyThemeLabel(entry.name, entry.reason, cardWhyNames)) {
          pushTheme(entry.name);
        }
      });
      if (cardWhyNames.length) {
        cardWhyNames.forEach((name) => {
          pushRow(name, matchChatWhyReason(name, whyNameBuffer) || matchChatWhyReason(name, pickNamesFromList));
        });
      } else if (whyNameBuffer.length) {
        whyNameBuffer.forEach((entry) => {
          if (looksLikeChatCollectionTitleName(entry.name)) return;
          pushRow(entry.name, entry.reason || matchChatWhyReason(entry.name, pickNamesFromList));
        });
      } else {
        pickNamesFromList.forEach((entry) => pushRow(entry.name, entry.reason));
      }
      flushList();
      themes.forEach((name) => {
        const html = renderChatWhyThemeHtml(name);
        if (html) out.push(html);
      });
      rows.forEach((row) => {
        const html = renderChatWhyLineHtml(row.name, row.reason);
        if (html) out.push(html);
      });
      whyNameBuffer = [];
      inWhyNamesOnly = false;
    };
    const normalizeMiniPick = (body) => (mini ? stripChatMiniPickReason(body) : body);
    const flushList = () => {
      if (!items.length) return;
      out.push(`<ul class="home-ai-md-list">${items.map((item) => `<li>${ensureChatItemTitleBold(item)}</li>`).join("")}</ul>`);
      items = [];
    };
    const isShortListExtra = (line) => {
      const trim = String(line || "").trim();
      if (!trim) return false;
      if (/^\s*•\s+/.test(line)) return false;
      if (isChatSectionHeading(trim)) return false;
      if (looksLikeChatCatalogItem(trim)) return false;
      if (/\b(not financial advice|disclaimer|volatility|chart (?:is )?below|cards below)\b/i.test(trim)) return false;
      if (/^(?:These|Those|Anyway|So yeah|Quick take:|If you|This mix|To hit|Proposed|Replace)\b/i.test(stripChatPlainText(trim))) return false;
      // Short why-clauses only — never fold Notes / paragraphs into the last pick.
      const extra = trim.replace(/^(?:[\s]*[—–\-]+[\s]*)+/u, "");
      return extra.length > 0 && extra.length <= 100;
    };
    for (const line of lines) {
      if (isChatDisclaimerLine(line)) continue;
      if (isChatChartOutlookStubHeading(line) || isChatHiddenMetadataHeading(line) || isChatFutureChartAvailableLine(line) || isChatFollowupsMarkerLine(line)) {
        flushList();
        pendingVerdictBody = false;
        pendingVerdictTone = "";
        continue;
      }
      if (isChatDuplicateItemRecapLine(line)) {
        flushList();
        pendingVerdictBody = false;
        pendingVerdictTone = "";
        continue;
      }
      if (isChatWhySectionHeading(line)) {
        flushList();
        endWhyNames();
        inWhy = true;
        inWhyNamesOnly = isChatWhyNamesOnlyHeading(line);
      } else if (isChatSectionHeading(line) || /^#{1,6}\s+/.test(String(line || "").trim())) {
        flushList();
        endWhyNames();
        inWhy = false;
      }
      if (inWhyNamesOnly && !isChatWhySectionHeading(line) && !isChatSectionHeading(line)) {
        const trimWhy = String(line || "").trim();
        if (!trimWhy) continue;
        if (isChatMetricsHeading(line) || parseChatMetricLine(line)) {
          pendingVerdictBody = false;
          pendingVerdictTone = "";
          continue;
        }
        const parsedFactor = parseChatFactorLine(line);
        if (parsedFactor) {
          const factorText = String(parsedFactor.text || "").trim();
          if (factorText && (looksLikeChatCatalogItem(factorText) || /(?:€|\$|£)\s*\d/.test(factorText))) {
            const entry = parseChatWhyEntry(factorText);
            if (entry) whyNameBuffer.push(entry);
          }
          continue;
        }
        if (isChatWhyIntroLine(trimWhy)) continue;
        const entry = parseChatWhyEntry(trimWhy);
        if (entry) whyNameBuffer.push(entry);
        continue;
      }
      if (inWhy && !isChatWhySectionHeading(line) && !isChatSectionHeading(line)) {
        const trimWhy = String(line || "").trim();
        if (!trimWhy) continue;
        const whyMatch = trimWhy.match(/^(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+\.)\s+(.*)$/);
        const whyBody = whyMatch ? whyMatch[1].trim() : trimWhy;
        if (!whyBody) continue;
        if (isChatMetricsHeading(line) || parseChatMetricLine(line)) {
          pendingVerdictBody = false;
          pendingVerdictTone = "";
          continue;
        }
        const parsedWhyFactor = parseChatFactorLine(line);
        if (parsedWhyFactor) {
          const factorText = String(parsedWhyFactor.text || "").trim();
          if (factorText && (looksLikeChatCatalogItem(factorText) || /(?:€|\$|£)\s*\d/.test(factorText))) {
            pushWhyLine(whyBody);
          }
          continue;
        }
        if (isChatDuplicateItemRecapLine(whyBody) || /^(?:These|Those|Anyway|So yeah|Quick take)\b/i.test(stripChatPlainText(whyBody))) {
          continue;
        }
        pushWhyLine(whyBody);
        continue;
      }
      const match = line.match(/^\s*•\s+(.*)$/);
      if (match) {
        // A second bullet is the server's "- " -> "• " rewrite landing on a
        // line the model already bulleted. Left in, it renders as a dot
        // followed by a literal "•".
        const body = match[1].replace(/^(?:\s*[•●○◉▪▫∙·‣⁃]\s*)+/, "").trim();
        if (!body) continue;
        // Keep ball points for catalog pick lines. Why-picks are plain lines above.
        if (looksLikeChatCatalogItem(body) || /(?:€|\$|£)\s*\d/.test(stripChatPlainText(body))) {
          const pickEntry = parseChatWhyEntry(body);
          if (pickEntry) pickNamesFromList.push(pickEntry);
          items.push(normalizeMiniPick(body));
        } else {
          flushList();
          out.push(body);
        }
        continue;
      }
      // Catalog pick lines missing a • still join the Items-to-buy list.
      const plainNoBullet = stripChatPlainText(line).trim();
      if (plainNoBullet && looksLikeChatCatalogItem(plainNoBullet) && !isChatSectionHeading(plainNoBullet)) {
        const pickEntry = parseChatWhyEntry(plainNoBullet);
        items.push(normalizeMiniPick(line.trim().replace(/^(?:[\s]*[—–\-]+[\s]*)+/u, "")));
        if (pickEntry) pickNamesFromList.push(pickEntry);
        continue;
      }
      const plainLine = stripChatPlainText(line);
      if (items.length && isChatSectionHeading(plainLine)) {
        flushList();
        if (!pushHeadingChunk(line)) out.push(line.trim());
        continue;
      }
      if (items.length && isShortListExtra(line)) {
        if (mini) continue;
        const extra = line.trim().replace(/^(?:[\s]*[—–\-]+[\s]*)+/u, "");
        const last = items[items.length - 1];
        if (extra && !last.includes("<br>")) {
          items[items.length - 1] = `${last}<br>${extra}`;
          continue;
        }
      }
      if (!String(line || "").trim()) {
        // Drop blank lines; CSS margins own section gaps (pre-wrap would double them).
        continue;
      }
      flushList();
      if (isChatPortfolioTotalLine(line) || isChatDuplicateItemRecapLine(line)) {
        pendingVerdictBody = false;
        pendingVerdictTone = "";
        continue;
      }
      if (parseChatFactorLine(line)) {
        pendingVerdictBody = false;
        pendingVerdictTone = "";
        continue;
      }
      const verdictLine = renderChatVerdictLine(line);
      if (verdictLine || parseChatSentimentBanner(line)) {
        pendingVerdictBody = false;
        pendingVerdictTone = "";
        continue;
      }
      // Item metrics live on the strip — skip leftover heading / chip lines in body markdown.
      if (isChatMetricsHeading(line) || parseChatMetricLine(line)) {
        pendingVerdictBody = false;
        pendingVerdictTone = "";
        continue;
      }
      if (pushHeadingChunk(line)) continue;
      if (pendingVerdictBody) {
        pendingVerdictBody = false;
        pendingVerdictTone = "";
      }
      out.push(line);
    }
    flushList();
    endWhyNames();
    const parts = [];
    for (const chunk of out) {
      if (String(chunk || "").trim() === "") continue;
      if (String(chunk).includes('class="home-ai-md-list"') && parts[parts.length - 1] === "") {
        parts.pop();
      }
      parts.push(chunk);
    }

    const isSectionHeading = (value) => /^<h[34]\b/.test(String(value || "").trim());
    const isDivider = (value) => /^<hr\b/.test(String(value || "").trim());
    const isTerminalBlock = (value) => /class="home-ai-(?:factor-row|verdict-strip|metric-chips)"/.test(String(value || ""));
    const isWhyLine = (value) => /class="home-ai-why-(?:line|theme)"/.test(String(value || ""));
    const isMdBlock = (value) => isSectionHeading(value) || isDivider(value) || isTerminalBlock(value) || isWhyLine(value);
    let html = "";
    let seenSection = false;
    for (let i = 0; i < parts.length; i++) {
      const chunk = parts[i];
      const trimmed = String(chunk || "").trim();
      if (i === 0) {
        if (isSectionHeading(trimmed)) seenSection = true;
        html += chunk;
        continue;
      }
      const prev = parts[i - 1];
      if (isSectionHeading(trimmed)) {
        if (seenSection && !isDivider(prev)) {
          html += '<hr class="home-ai-md-divider">';
        }
        seenSection = true;
      }
      const touchList = String(chunk).includes('class="home-ai-md-list"')
        || String(prev).includes('class="home-ai-md-list"')
        || isWhyLine(chunk)
        || isWhyLine(prev);
      if (touchList || isMdBlock(trimmed) || isMdBlock(prev)) {
        html += chunk;
      } else {
        html += `\n${chunk}`;
      }
    }
    html = html.replace(/\n{2,}/g, "\n");
    if (mini) html = cleanChatMiniRenderedHtml(html);
    return `<div class="home-ai-md${mini ? " is-mini" : ""}">${html}</div>`;
  }

  let chartJsLoaderPromise = null;
  function ensureChartJs() {
    if (typeof window !== "undefined" && typeof window.Chart === "function") {
      return Promise.resolve(window.Chart);
    }
    if (chartJsLoaderPromise) {
      return chartJsLoaderPromise;
    }

    const sources = [
      "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.3/chart.umd.min.js",
      "https://unpkg.com/chart.js@4.4.3/dist/chart.umd.min.js",
    ];

    chartJsLoaderPromise = new Promise((resolve, reject) => {
      let index = 0;

      const fail = (error) => {
        chartJsLoaderPromise = null;
        reject(error instanceof Error ? error : new Error("Chart.js failed to load"));
      };

      const tryNext = () => {
        if (typeof window !== "undefined" && typeof window.Chart === "function") {
          resolve(window.Chart);
          return;
        }
        if (index >= sources.length) {
          fail(new Error("Chart.js failed to load"));
          return;
        }

        const src = sources[index];
        index += 1;
        const existing = document.querySelector(`script[data-cs2-chartjs-src="${src}"]`);
        if (existing) {
          if (typeof window.Chart === "function") {
            resolve(window.Chart);
            return;
          }
          existing.addEventListener("load", () => {
            if (typeof window.Chart === "function") resolve(window.Chart);
            else tryNext();
          }, { once: true });
          existing.addEventListener("error", () => tryNext(), { once: true });
          return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.dataset.cs2Chartjs = "1";
        script.dataset.cs2ChartjsSrc = src;
        script.onload = () => {
          if (typeof window.Chart === "function") resolve(window.Chart);
          else tryNext();
        };
        script.onerror = () => tryNext();
        document.head.appendChild(script);
      };

      tryNext();
    });

    return chartJsLoaderPromise;
  }

  function loadChatMarketLogo(src) {
    return new Promise((resolve) => {
      const url = String(src || "").trim();
      if (!url) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function escapeChatTooltipText(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getChatMarketTooltipEl(chart) {
    const parent = chart?.canvas?.parentNode;
    if (!parent) return null;
    let tooltipEl = parent.querySelector(".cs2-chat-market-tooltip");
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "cs2-chat-market-tooltip";
      parent.appendChild(tooltipEl);
    }
    return tooltipEl;
  }

  function chatMarketLogoMarkup(name, color, imageUrl) {
    const safeName = escapeChatTooltipText(name);
    const url = String(imageUrl || chatBuyMarketLogoUrl(name) || "").trim();
    if (url) {
      return `<img class="cs2-chat-market-tooltip-logo" src="${escapeChatTooltipText(url)}" alt="" />`;
    }
    const fill = String(color || "#38bdf8");
    return `<span class="cs2-chat-market-tooltip-swatch" style="background:${escapeChatTooltipText(fill)}" aria-hidden="true"></span><span class="cs2-chat-market-tooltip-sr">${safeName}</span>`;
  }

  function externalChatPriceHistoryTooltip(context, logoUrlByLabel, colorByLabel) {
    const { chart, tooltip } = context;
    const tooltipEl = getChatMarketTooltipEl(chart);
    if (!tooltipEl) return;

    if (!tooltip || tooltip.opacity === 0) {
      tooltipEl.style.opacity = "0";
      tooltipEl.style.pointerEvents = "none";
      return;
    }

    const title = escapeChatTooltipText(tooltip.title?.[0] || "");
    const ranked = (tooltip.dataPoints || [])
      .filter((item) => Number.isFinite(item.parsed?.y))
      .map((item) => ({
        name: String(item.dataset?.label || ""),
        value: Number(item.parsed.y),
        color: String(item.dataset?.borderColor || colorByLabel?.get?.(item.dataset?.label) || "#38bdf8"),
      }))
      .sort((left, right) => right.value - left.value || left.name.localeCompare(right.name));

    const rows = ranked.map((entry) => {
      const imageUrl = logoUrlByLabel?.get?.(entry.name) || chatBuyMarketLogoUrl(entry.name);
      const icon = chatMarketLogoMarkup(entry.name, entry.color, imageUrl);
      return `<div class="cs2-chat-market-tooltip-row">${icon}<span class="cs2-chat-market-tooltip-label">${escapeChatTooltipText(entry.name)}</span><span class="cs2-chat-market-tooltip-value">€${entry.value.toFixed(2)}</span></div>`;
    }).join("");

    tooltipEl.innerHTML = `<div class="cs2-chat-market-tooltip-title">${title}</div>${rows}`;
    const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
    tooltipEl.style.opacity = "1";
    tooltipEl.style.pointerEvents = "none";
    tooltipEl.style.left = `${positionX + tooltip.caretX}px`;
    tooltipEl.style.top = `${positionY + tooltip.caretY}px`;
  }

  function externalChatDistributionTooltip(context, rows) {
    const { chart, tooltip } = context;
    const tooltipEl = getChatMarketTooltipEl(chart);
    if (!tooltipEl) return;

    if (!tooltip || tooltip.opacity === 0) {
      tooltipEl.style.opacity = "0";
      tooltipEl.style.pointerEvents = "none";
      return;
    }

    const point = tooltip.dataPoints?.[0];
    const index = Number(point?.dataIndex);
    const row = Number.isFinite(index) ? (rows[index] || {}) : {};
    const name = String(row.marketplace || point?.label || "");
    const volume = Number(row.volume) || 0;
    const pct = Number(row.pct);
    const meta = Number.isFinite(pct)
      ? `${volume.toLocaleString("en-US")} listings (${pct.toFixed(1)}%)`
      : `${volume.toLocaleString("en-US")} listings`;
    const icon = chatMarketLogoMarkup(name, row.color, row.image || chatBuyMarketLogoUrl(name));
    tooltipEl.innerHTML = `<div class="cs2-chat-market-tooltip-row">${icon}<span class="cs2-chat-market-tooltip-label">${escapeChatTooltipText(name)}</span><span class="cs2-chat-market-tooltip-value">${escapeChatTooltipText(meta)}</span></div>`;
    const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
    tooltipEl.style.opacity = "1";
    tooltipEl.style.pointerEvents = "none";
    tooltipEl.style.left = `${positionX + tooltip.caretX}px`;
    tooltipEl.style.top = `${positionY + tooltip.caretY}px`;
  }

  function formatForecastEuro(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `€${n.toFixed(2)}`;
  }

  function formatForecastPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "n/a";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}%`;
  }

  function forecastTimestampToMs(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    // Unix seconds are ~1e9; milliseconds are ~1e12.
    return value < 1e11 ? value * 1000 : value;
  }

  function formatForecastHoverDate(ms) {
    return new Date(ms).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function formatForecastAxisDate(ms) {
    return new Date(ms).toLocaleDateString("en-GB", {
      month: "short",
      year: "numeric",
    });
  }

  function buildForecastAxisTicks(minMs, maxMs, limit = 6) {
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) {
      return Number.isFinite(minMs) ? [minMs] : [];
    }

    const span = maxMs - minMs;
    const monthMs = 30.4375 * 24 * 60 * 60 * 1000;
    const yearMs = 365.25 * 24 * 60 * 60 * 1000;
    let step = monthMs;
    if (span >= yearMs * 5) step = yearMs;
    else if (span >= yearMs * 2) step = monthMs * 6;
    else if (span >= yearMs) step = monthMs * 3;
    else if (span >= monthMs * 6) step = monthMs * 2;

    const ticks = [minMs];
    let cursor = minMs + step;
    while (cursor < maxMs - step * 0.35 && ticks.length < Math.max(2, limit - 1)) {
      ticks.push(Math.min(maxMs, Math.round(cursor)));
      cursor += step;
    }
    ticks.push(maxMs);
    // De-dupe / keep strictly inside [min, max].
    return [...new Set(ticks.map((value) => Math.min(maxMs, Math.max(minMs, value))))];
  }

  /**
   * Cheap items stay on a €3 Y-axis so small gaps are readable.
   * If the item trades above €3, expand the max to fit the data.
   */
  function resolveChatPriceAxisBounds(values, baseCap = 3) {
    const prices = (Array.isArray(values) ? values : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);
    if (!prices.length) {
      return { min: 0, max: baseCap };
    }
    const min = prices[0];
    const max = prices[prices.length - 1];
    const p90 = prices[Math.min(prices.length - 1, Math.floor(prices.length * 0.9))];

    // Under €3: keep the chart capped at €3.
    if (p90 <= baseCap && max <= baseCap) {
      return {
        min: Math.max(0, Number((min * 0.92).toFixed(4))),
        max: baseCap,
      };
    }

    // Worth more than €3: expand past the base cap to fit real prices.
    const pad = Math.max((max - min) * 0.08, max * 0.05, 0.15);
    return {
      min: Math.max(0, Number((min - pad * 0.35).toFixed(4))),
      max: Number(Math.max(baseCap, max + pad).toFixed(4)),
    };
  }

  function resolveChatChartItemLabel(source) {
    if (!source || typeof source !== "object") return "Item";
    const candidates = [
      source.item_name,
      source.lookup_name,
      source.market_hash_name,
      source.item,
      source.title,
    ];
    for (const candidate of candidates) {
      const label = String(candidate || "").trim();
      if (!label || /can(?:not|'t)\s+create/i.test(label)) continue;
      return label;
    }
    return "Item";
  }

  function ChatForecastChart({ forecast }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);
    const [hidden, setHidden] = useState(false);
    const [infoOpen, setInfoOpen] = useState(false);

    useEffect(() => {
      if (!forecast || !canvasRef.current || hidden) {
        return undefined;
      }

      let cancelled = false;

      ensureChartJs()
        .then((Chart) => {
          if (cancelled || !canvasRef.current || !Chart) return;

          if (chartRef.current) {
            chartRef.current.destroy();
            chartRef.current = null;
          }

          const history = Array.isArray(forecast.history) ? forecast.history : [];
          const future = Array.isArray(forecast.forecast) ? forecast.forecast : [];
          const historyCutoffMs = Date.now() + (24 * 60 * 60 * 1000);

          const historySeries = history
            .map((point) => {
              const x = forecastTimestampToMs(point?.t ?? point?.time);
              const y = Number(point?.p);
              return Number.isFinite(x) && x > 0 && Number.isFinite(y) ? { x, y } : null;
            })
            .filter(Boolean)
            .filter((point) => point.x <= historyCutoffMs)
            .sort((left, right) => left.x - right.x);

          const forecastSparse = [];
          if (historySeries.length && future.length) {
            // Bridge history into forecast for a continuous line.
            forecastSparse.push(historySeries[historySeries.length - 1]);
          }
          future.forEach((point) => {
            const x = forecastTimestampToMs(point?.t ?? point?.time);
            const y = Number(point?.p);
            if (Number.isFinite(x) && x > 0 && Number.isFinite(y)) {
              forecastSparse.push({ x, y });
            }
          });

          // Densify Future so hover tracks continuously (not sparse dots).
          const densifySeries = (sparse) => {
            const out = [];
            for (let i = 0; i < sparse.length; i += 1) {
              const cur = sparse[i];
              out.push(cur);
              const next = sparse[i + 1];
              if (!next) continue;
              const span = next.x - cur.x;
              if (span <= 0) continue;
              const steps = Math.min(12, Math.max(2, Math.round(span / (7 * 24 * 60 * 60 * 1000))));
              for (let s = 1; s < steps; s += 1) {
                const t = s / steps;
                out.push({
                  x: cur.x + span * t,
                  y: cur.y + (next.y - cur.y) * t,
                });
              }
            }
            return out;
          };
          const forecastSeries = densifySeries(forecastSparse);

          // Upside-only confidence band: floor = prediction path, ceiling = high.
          const bandLowSparse = [];
          const bandHighSparse = [];
          if (historySeries.length && future.length) {
            const bridge = historySeries[historySeries.length - 1];
            bandLowSparse.push(bridge);
            bandHighSparse.push(bridge);
          }
          future.forEach((point) => {
            const x = forecastTimestampToMs(point?.t ?? point?.time);
            const mid = Number(point?.p);
            const loRaw = Number(point?.lo);
            const hi = Number(point?.hi);
            if (!(Number.isFinite(x) && x > 0)) return;
            const floor = Number.isFinite(mid)
              ? mid
              : (Number.isFinite(loRaw) ? Math.max(loRaw, 0.01) : null);
            if (Number.isFinite(floor)) bandLowSparse.push({ x, y: floor });
            if (Number.isFinite(hi)) {
              bandHighSparse.push({
                x,
                y: Number.isFinite(floor) ? Math.max(hi, floor) : hi,
              });
            }
          });
          const bandLow = densifySeries(bandLowSparse);
          const bandHigh = densifySeries(bandHighSparse);

          const allX = historySeries.concat(forecastSeries, bandLow, bandHigh).map((point) => point.x);
          const xMin = allX.length ? Math.min(...allX) : undefined;
          const xMax = allX.length ? Math.max(...allX) : undefined;
          const axisTicks = buildForecastAxisTicks(xMin, xMax, 7);
          const historyEndX = historySeries.length
            ? historySeries[historySeries.length - 1].x
            : null;
          // Bound the Y axis from history + future mid only (ignore wild high-band spikes).
          const yBounds = resolveChatPriceAxisBounds([
            ...historySeries.map((point) => point.y),
            ...forecastSeries.map((point) => point.y),
          ], 3);
          const clipY = (value) => {
            const n = Number(value);
            if (!Number.isFinite(n)) return n;
            return Math.min(yBounds.max, Math.max(yBounds.min, n));
          };
          bandHigh.forEach((point) => {
            point.y = clipY(point.y);
          });
          bandLow.forEach((point) => {
            point.y = clipY(point.y);
          });

          const interpolateSeriesY = (series, dataX) => {
            const points = (Array.isArray(series) ? series : [])
              .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
              .sort((a, b) => a.x - b.x);
            if (!points.length || !Number.isFinite(dataX)) return null;
            if (dataX <= points[0].x) return points[0].y;
            if (dataX >= points[points.length - 1].x) return points[points.length - 1].y;
            for (let i = 1; i < points.length; i += 1) {
              const left = points[i - 1];
              const right = points[i];
              if (dataX > right.x) continue;
              const span = right.x - left.x;
              if (!(span > 0)) return left.y;
              const t = (dataX - left.x) / span;
              return left.y + ((right.y - left.y) * t);
            }
            return points[points.length - 1].y;
          };

          // Pin caret to the rising High band in the forecast region (not the flat dashed median).
          Chart.Tooltip.positioners.forecastLine = function forecastLinePositioner(elements, eventPosition) {
            const chart = this.chart;
            const xScale = chart.scales?.x;
            const yScale = chart.scales?.y;
            const pixelX = Number(eventPosition?.x);
            if (!xScale || !yScale || !Number.isFinite(pixelX)) return false;

            const dataX = Number(xScale.getValueForPixel(pixelX));
            const endX = Number(chart.$forecastHistoryEndX);
            const preferFuture = Number.isFinite(endX)
              && Number.isFinite(dataX)
              && dataX >= endX - (3 * 24 * 60 * 60 * 1000);

            const datasets = Array.isArray(chart.data?.datasets) ? chart.data.datasets : [];
            const byLabel = (label) => datasets.find((ds) => String(ds?.label || "") === label)?.data;
            const series = preferFuture
              ? (byLabel("Future") || byLabel("High band") || byLabel("History"))
              : (byLabel("History") || byLabel("Future"));
            const yValue = interpolateSeriesY(series, dataX);
            if (!Number.isFinite(yValue)) {
              const usable = (Array.isArray(elements) ? elements : []).filter((entry) => {
                const label = String(datasets[entry.datasetIndex]?.label || "");
                return preferFuture
                  ? (label === "Future" || label === "High band" || label === "History")
                  : (label === "History" || label === "Future");
              });
              const target = usable[0];
              if (!target?.element) return false;
              return { x: target.element.x, y: target.element.y };
            }

            return {
              x: pixelX,
              y: yScale.getPixelForValue(yValue),
            };
          };

          chartRef.current = new Chart(canvasRef.current, {
            type: "line",
            data: {
              datasets: [
                {
                  label: "History",
                  data: historySeries,
                  borderColor: "#38bdf8",
                  backgroundColor: "rgba(56, 189, 248, 0.12)",
                  borderWidth: 2,
                  pointRadius: 0,
                  pointHoverRadius: 4,
                  pointHitRadius: 18,
                  hoverBorderWidth: 2,
                  hoverBackgroundColor: "#38bdf8",
                  hoverBorderColor: "#e2e8f0",
                  tension: 0.25,
                  spanGaps: false,
                },
                {
                  label: "Future",
                  data: forecastSeries,
                  borderColor: "#22c55e",
                  borderDash: [6, 4],
                  borderWidth: 2,
                  pointRadius: 0,
                  pointHoverRadius: 4,
                  pointHitRadius: 18,
                  tension: 0.25,
                  spanGaps: false,
                },
                {
                  label: "Low band",
                  data: bandLow,
                  borderColor: "rgba(34, 197, 94, 0.0)",
                  borderWidth: 0,
                  pointRadius: 0,
                  pointHoverRadius: 0,
                  pointHitRadius: 0,
                  tension: 0.25,
                  fill: false,
                  tooltip: { enabled: false },
                },
                {
                  label: "High band",
                  data: bandHigh,
                  borderColor: "rgba(34, 197, 94, 0.85)",
                  backgroundColor: "rgba(34, 197, 94, 0.12)",
                  borderWidth: 1.5,
                  pointRadius: 0,
                  pointHoverRadius: 5,
                  pointHitRadius: 28,
                  hoverBorderWidth: 2,
                  hoverBackgroundColor: "#22c55e",
                  hoverBorderColor: "#ecfdf5",
                  tension: 0.2,
                  fill: "-1",
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 450 },
              parsing: false,
              elements: {
                point: {
                  radius: 0,
                  hitRadius: 18,
                },
                line: {
                  borderCapStyle: "round",
                  borderJoinStyle: "round",
                },
              },
              interaction: {
                mode: "nearest",
                axis: "x",
                intersect: false,
              },
              plugins: {
                legend: {
                  display: false,
                },
                tooltip: {
                  enabled: true,
                  mode: "nearest",
                  axis: "x",
                  intersect: false,
                  position: "forecastLine",
                  backgroundColor: "rgba(15, 23, 42, 0.96)",
                  titleColor: "#e2e8f0",
                  bodyColor: "#f8fafc",
                  borderColor: "rgba(148, 163, 184, 0.28)",
                  borderWidth: 1,
                  padding: 10,
                  displayColors: true,
                  callbacks: {
                    title: (items) => {
                      const preferred = (Array.isArray(items) ? items : []).find((item) => {
                        const name = String(item.dataset?.label || "");
                        return name === "High band" || name === "Future" || name === "History";
                      }) || (Array.isArray(items) ? items[0] : null);
                      const x = preferred?.parsed?.x;
                      if (!Number.isFinite(x)) return "";
                      return formatForecastHoverDate(x);
                    },
                    label: (ctx) => {
                      const name = String(ctx.dataset?.label || "");
                      const v = ctx.parsed?.y;
                      if (!Number.isFinite(v)) return null;
                      if (name === "History") return `History: €${v.toFixed(2)}`;
                      if (name === "Future") return `Future: €${v.toFixed(2)}`;
                      if (name === "High band") return `Upside: €${v.toFixed(2)}`;
                      return null;
                    },
                  },
                  filter: (item) => {
                    const name = String(item.dataset?.label || "");
                    return (name === "History" || name === "Future" || name === "High band")
                      && Number.isFinite(item.parsed?.y);
                  },
                  itemSort: (a, b) => {
                    const rank = (item) => {
                      const name = String(item.dataset?.label || "");
                      if (name === "High band") return 0;
                      if (name === "History") return 1;
                      return 2;
                    };
                    return rank(a) - rank(b);
                  },
                },
              },
              scales: {
                x: {
                  type: "linear",
                  min: xMin,
                  max: xMax,
                  bounds: "data",
                  grace: 0,
                  offset: false,
                  ticks: {
                    color: "#64748b",
                    maxRotation: 0,
                    autoSkip: false,
                    includeBounds: true,
                    font: { size: 10 },
                    callback: (value) => {
                      const ms = Number(value);
                      if (!Number.isFinite(ms)) return "";
                      const match = axisTicks.some((tick) => Math.abs(tick - ms) < 24 * 60 * 60 * 1000);
                      return match ? formatForecastAxisDate(ms) : "";
                    },
                  },
                  afterBuildTicks: (scale) => {
                    // Keep ticks inside the data window so the line spans edge-to-edge.
                    scale.min = xMin;
                    scale.max = xMax;
                    scale.ticks = axisTicks.map((value) => ({ value }));
                  },
                  afterFit: (scale) => {
                    scale.min = xMin;
                    scale.max = xMax;
                  },
                  border: { display: false },
                  grid: { color: "rgba(148, 163, 184, 0.08)", drawBorder: false },
                },
                y: {
                  ticks: {
                    color: "#64748b",
                    font: { size: 10 },
                    callback: (value) => `€${value}`,
                  },
                  min: yBounds.min,
                  max: yBounds.max,
                  border: { display: false },
                  grid: { color: "rgba(148, 163, 184, 0.08)", drawBorder: false },
                },
              },
            },
          });
          chartRef.current.$forecastHistoryEndX = historyEndX;
        })
        .catch(() => {
          // Chart optional — text reply still works.
        });

      return () => {
        cancelled = true;
        if (chartRef.current) {
          chartRef.current.destroy();
          chartRef.current = null;
        }
      };
    }, [forecast, hidden]);

    if (!forecast) return null;

    const itemLabel = resolveChatChartItemLabel(forecast);

    if (hidden) {
      return (
        <button
          type="button"
          className="cs2-chat-forecast-hidden"
          onClick={() => setHidden(false)}
        >
          <i className="fa-solid fa-chart-line" aria-hidden="true" />
          Show chart
        </button>
      );
    }

    return (
      <div
        className="cs2-chat-forecast"
        role="button"
        tabIndex={0}
        title="Click to hide chart"
        onClick={() => setHidden(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setHidden(true);
          }
        }}
      >
        <div className="cs2-chat-forecast-head">
          <div className="cs2-chat-forecast-head-main">
            <strong>{itemLabel}</strong>
            <span className="cs2-chat-forecast-head-range">Since release → today</span>
          </div>
          <div className="cs2-chat-forecast-head-right">
            <span className={classNames("cs2-chat-forecast-tag", `is-${forecast.outlook || "neutral"}`)}>
              {forecast.outlook || "neutral"}
            </span>
            <button
              type="button"
              className={classNames("cs2-chat-forecast-info", infoOpen && "is-open")}
              aria-label="How this chart is calculated"
              title="How this chart is calculated"
              aria-expanded={infoOpen}
              onClick={(event) => {
                event.stopPropagation();
                setInfoOpen((open) => !open);
              }}
            >
              <i className="fa-solid fa-circle-info" aria-hidden="true" />
            </button>
          </div>
        </div>
        {infoOpen ? (
          <div
            className="cs2-chat-forecast-info-panel"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <p>
              <strong>History</strong> uses Steam market sale prices from the item’s first listing through today
              (all-time series, imported via the market history API).
            </p>
            <p>
              <strong>Future</strong> is a statistical path fit on weekly prices (ARIMA-style), then nudged by
              supply/demand signals like sell orders, buy orders, and recent volume. The shaded band is an
              uncertainty range — not a guarantee.
            </p>
            <p>Illustrative only. CS2 markets are volatile and this is not financial advice.</p>
          </div>
        ) : null}
        <div className="cs2-chat-forecast-stats">
          <span>Now {formatForecastEuro(forecast.current_price)}</span>
          <span>1y {formatForecastEuro(forecast.projected_1y)} ({formatForecastPct(forecast.change_pct)})</span>
        </div>
        <div className="cs2-chat-forecast-canvas-wrap">
          <canvas ref={canvasRef} aria-label={`Future price prediction chart for ${itemLabel}`} />
        </div>
      </div>
    );
  }

  function ChatMarketDistributionChart({ distribution }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
      if (!distribution || !canvasRef.current || hidden) return undefined;
      let cancelled = false;
      const rows = (Array.isArray(distribution.rows) ? distribution.rows : [])
        .filter((row) => row && String(row.marketplace || "").trim() !== "");
      if (!rows.length) return undefined;

      ensureChartJs()
        .then(async (Chart) => {
          if (cancelled || !canvasRef.current || !Chart) return;
          if (chartRef.current) {
            chartRef.current.destroy();
            chartRef.current = null;
          }

          const logos = await Promise.all(rows.map((row) => loadChatMarketLogo(row.image)));
          if (cancelled || !canvasRef.current) return;

          const labels = rows.map((row) => String(row.marketplace || "Market"));
          const values = rows.map((row) => Number(row.volume) || 0);
          const colors = rows.map((row) => String(row.color || "#38bdf8"));
          const formatVolume = (value) => {
            const n = Number(value) || 0;
            return n.toLocaleString("en-US");
          };

          const iconSize = 14;
          const iconGap = 6;
          const gapToBars = 10;
          const labelFont = "600 11px Inter, system-ui, sans-serif";
          const measureCanvas = document.createElement("canvas");
          const measureCtx = measureCanvas.getContext("2d");
          let maxLabelWidth = 72;
          if (measureCtx) {
            measureCtx.font = labelFont;
            maxLabelWidth = labels.reduce((widest, label) => {
              const width = measureCtx.measureText(label).width;
              return width > widest ? width : widest;
            }, 72);
          }
          const leftPad = Math.ceil(iconSize + iconGap + maxLabelWidth + gapToBars + 4);

          const labelPlugin = {
            id: "cs2MarketLabels",
            afterDraw(chart) {
              const yAxis = chart.scales?.y;
              const { ctx } = chart;
              if (!yAxis || !ctx) return;
              const chartLeft = chart.chartArea?.left || leftPad;
              ctx.save();
              ctx.font = labelFont;
              rows.forEach((_row, index) => {
                const y = yAxis.getPixelForValue(index);
                const label = labels[index];
                const textWidth = ctx.measureText(label).width;
                const textX = chartLeft - gapToBars - textWidth;
                const iconX = textX - iconGap - iconSize;
                const img = logos[index];
                if (img) {
                  ctx.globalAlpha = 0.95;
                  try {
                    ctx.drawImage(img, iconX, y - iconSize / 2, iconSize, iconSize);
                  } catch (_error) {
                    // Ignore broken bitmaps.
                  }
                }
                ctx.globalAlpha = 1;
                ctx.fillStyle = "#e2e8f0";
                ctx.textBaseline = "middle";
                ctx.textAlign = "left";
                ctx.fillText(label, textX, y);
              });
              ctx.restore();
            },
          };

          const valuePlugin = {
            id: "cs2MarketValues",
            afterDatasetsDraw(chart) {
              const meta = chart.getDatasetMeta(0);
              const { ctx } = chart;
              if (!meta?.data || !ctx) return;
              ctx.save();
              ctx.fillStyle = "#e2e8f0";
              ctx.font = labelFont;
              ctx.textBaseline = "middle";
              meta.data.forEach((bar, index) => {
                const volume = values[index] || 0;
                const text = formatVolume(volume);
                const x = (bar.x || 0) + 8;
                const y = bar.y || 0;
                ctx.fillText(text, x, y);
              });
              ctx.restore();
            },
          };

          chartRef.current = new Chart(canvasRef.current, {
            type: "bar",
            data: {
              labels,
              datasets: [{
                data: values,
                backgroundColor: colors,
                borderRadius: 8,
                borderSkipped: false,
                barThickness: 18,
              }],
            },
            plugins: [labelPlugin, valuePlugin],
            options: {
              indexAxis: "y",
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 350 },
              layout: {
                padding: { left: leftPad, right: 52 },
              },
              plugins: {
                legend: { display: false },
                tooltip: {
                  enabled: false,
                  external: (context) => externalChatDistributionTooltip(context, rows),
                },
              },
              scales: {
                x: {
                  beginAtZero: true,
                  border: { display: false },
                  grid: { color: "rgba(148, 163, 184, 0.12)", drawBorder: false },
                  ticks: {
                    color: "#94a3b8",
                    font: { size: 11 },
                    callback: (value) => formatVolume(value),
                  },
                },
                y: {
                  border: { display: false },
                  grid: { display: false, drawBorder: false },
                  ticks: {
                    display: false,
                  },
                },
              },
            },
          });
        })
        .catch(() => undefined);

      return () => {
        cancelled = true;
        const tip = canvasRef.current?.parentNode?.querySelector(".cs2-chat-market-tooltip");
        if (tip) tip.remove();
        if (chartRef.current) {
          chartRef.current.destroy();
          chartRef.current = null;
        }
      };
    }, [distribution, hidden]);

    if (!distribution?.rows?.length) return null;
    if (hidden) {
      return (
        <button type="button" className="cs2-chat-forecast-hidden" onClick={() => setHidden(false)}>
          <i className="fa-solid fa-chart-bar" aria-hidden="true" />
          Show distribution
        </button>
      );
    }

    const rowCount = (Array.isArray(distribution.rows) ? distribution.rows : [])
      .filter((row) => row && String(row.marketplace || "").trim() !== "").length;
    const height = Math.max(280, Math.min(900, (rowCount * 36) + 56));
    const itemLabel = resolveChatChartItemLabel(distribution);

    return (
      <div className="cs2-chat-forecast cs2-chat-market-chart" onClick={(event) => event.stopPropagation()}>
        <div className="cs2-chat-forecast-head">
          <div className="cs2-chat-forecast-head-main">
            <strong>{itemLabel}</strong>
            <span className="cs2-chat-forecast-head-range">Market Distribution · listing share</span>
          </div>
          <span className="cs2-chat-forecast-tag">{rowCount} data points</span>
        </div>
        <div className="cs2-chat-forecast-canvas-wrap" style={{ height }}>
          <canvas ref={canvasRef} aria-label={`Market distribution chart for ${itemLabel}`} />
        </div>
      </div>
    );
  }

  function ChatPriceHistoryChart({ priceHistory }) {
    const canvasRef = useRef(null);
    const chartRef = useRef(null);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
      if (!priceHistory || !canvasRef.current || hidden) return undefined;
      let cancelled = false;
      const providers = (Array.isArray(priceHistory.providers) ? priceHistory.providers : []).slice(0, 16);
      if (!providers.length) return undefined;

      const normalizeDate = (raw) => {
        const text = String(raw || "").trim();
        if (!text) return "";
        const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
        if (iso) return iso[1];
        const ts = Number(text);
        if (Number.isFinite(ts) && ts > 1e11) {
          return new Date(ts).toISOString().slice(0, 10);
        }
        if (Number.isFinite(ts) && ts > 1e9) {
          return new Date(ts * 1000).toISOString().slice(0, 10);
        }
        const parsed = Date.parse(text);
        if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
        return "";
      };

      ensureChartJs()
        .then(async (Chart) => {
          if (cancelled || !canvasRef.current || !Chart) return;
          if (chartRef.current) {
            chartRef.current.destroy();
            chartRef.current = null;
          }

          const cleanedProviders = providers.map((provider) => {
            const byDate = new Map();
            (Array.isArray(provider.points) ? provider.points : []).forEach((point) => {
              const date = normalizeDate(point?.date);
              const price = Number(point?.price);
              if (!date || !Number.isFinite(price) || price <= 0) return;
              byDate.set(date, price);
            });
            let points = Array.from(byDate.entries())
              .map(([date, price]) => ({ date, price }))
              .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

            // Soft outlier trim only — keep real market moves visible.
            if (points.length >= 6) {
              const sorted = points.map((point) => point.price).sort((a, b) => a - b);
              const median = sorted[Math.floor(sorted.length / 2)] || 0;
              if (median > 0) {
                const maxAllowed = median * 6;
                const minAllowed = Math.max(0.01, median * 0.08);
                const filtered = points.filter((point) => point.price >= minAllowed && point.price <= maxAllowed);
                if (filtered.length >= 2) points = filtered;
              }
            }

            return {
              name: String(provider.name || "Provider"),
              color: String(provider.color || "#38bdf8"),
              image: String(provider.image || ""),
              points,
            };
          }).filter((provider) => provider.points.length >= 2);

          if (!cleanedProviders.length) return;

          const logoUrlByLabel = new Map();
          const colorByLabel = new Map();
          cleanedProviders.forEach((provider) => {
            const url = String(provider.image || chatBuyMarketLogoUrl(provider.name) || "").trim();
            if (url) logoUrlByLabel.set(provider.name, url);
            colorByLabel.set(provider.name, provider.color);
          });
          // Prefetch so browser cache is warm when the HTML tooltip mounts images.
          await Promise.all(
            Array.from(logoUrlByLabel.values()).map((url) => loadChatMarketLogo(url))
          );
          if (cancelled || !canvasRef.current) return;

          // Shared axis = union of every provider date so sparse markets still plot.
          const labelSet = new Set();
          cleanedProviders.forEach((provider) => {
            provider.points.forEach((point) => labelSet.add(point.date));
          });
          const labels = Array.from(labelSet).sort();
          if (labels.length < 2) return;

          const datasets = cleanedProviders.map((provider) => {
            const priceByDate = new Map(provider.points.map((point) => [point.date, point.price]));
            const values = labels.map((date) => (
              priceByDate.has(date) ? priceByDate.get(date) : null
            ));

            // Carry-forward fill for small gaps so every provider line stays visible.
            for (let i = 1; i < values.length; i += 1) {
              if (values[i] != null) continue;
              let left = i - 1;
              while (left >= 0 && values[left] == null) left -= 1;
              let right = i + 1;
              while (right < values.length && values[right] == null) right += 1;
              if (left < 0 && right < values.length) {
                values[i] = values[right];
                continue;
              }
              if (right >= values.length && left >= 0) {
                values[i] = values[left];
                continue;
              }
              if (left < 0 || right >= values.length) continue;
              if (right - left > 8) continue;
              const t = (i - left) / (right - left);
              values[i] = values[left] + ((values[right] - values[left]) * t);
            }

            return {
              label: provider.name,
              data: values,
              borderColor: provider.color,
              backgroundColor: "transparent",
              borderWidth: 1.8,
              pointRadius: 0,
              pointHoverRadius: 3,
              tension: 0.12,
              spanGaps: true,
            };
          }).filter((ds) => ds.data.filter((value) => Number.isFinite(value)).length >= 2);

          if (!datasets.length) return;

          const axisPrices = [];
          datasets.forEach((dataset) => {
            dataset.data.forEach((value) => {
              if (Number.isFinite(value) && value > 0) axisPrices.push(value);
            });
          });
          const yBounds = resolveChatPriceAxisBounds(axisPrices, 3);

          const firstYear = labels[0].slice(0, 4);
          const lastYear = labels[labels.length - 1].slice(0, 4);
          const showYear = firstYear !== lastYear;
          const maxTicks = 6;

          chartRef.current = new Chart(canvasRef.current, {
            type: "line",
            data: { labels, datasets },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 350 },
              interaction: { mode: "index", intersect: false },
              plugins: {
                legend: { display: false },
                tooltip: {
                  enabled: false,
                  external: (context) => externalChatPriceHistoryTooltip(context, logoUrlByLabel, colorByLabel),
                },
              },
              scales: {
                x: {
                  type: "category",
                  offset: false,
                  border: { display: false },
                  grid: { color: "rgba(148, 163, 184, 0.10)", drawBorder: false },
                  ticks: {
                    color: "#94a3b8",
                    font: { size: 10 },
                    maxRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: maxTicks,
                    callback(value) {
                      const raw = labels[value] || String(this.getLabelForValue?.(value) || "");
                      const parts = raw.split("-");
                      if (parts.length < 3) return raw;
                      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                      const month = months[Number(parts[1]) - 1] || parts[1];
                      const day = Number(parts[2]);
                      return showYear ? `${day} ${month} ${parts[0]}` : `${day} ${month}`;
                    },
                  },
                },
                y: {
                  beginAtZero: false,
                  min: yBounds.min,
                  max: yBounds.max,
                  border: { display: false },
                  grid: { color: "rgba(148, 163, 184, 0.12)", drawBorder: false },
                  ticks: {
                    color: "#94a3b8",
                    font: { size: 10 },
                    callback: (value) => `€${Number(value).toFixed(value < 5 ? 2 : 0)}`,
                  },
                },
              },
            },
          });
        })
        .catch(() => undefined);

      return () => {
        cancelled = true;
        const tip = canvasRef.current?.parentNode?.querySelector(".cs2-chat-market-tooltip");
        if (tip) tip.remove();
        if (chartRef.current) {
          chartRef.current.destroy();
          chartRef.current = null;
        }
      };
    }, [priceHistory, hidden]);

    if (!priceHistory?.providers?.length) return null;
    const legendProviders = (Array.isArray(priceHistory.providers) ? priceHistory.providers : []).slice(0, 16);
    const providerCount = legendProviders.length;
    if (hidden) {
      return (
        <button type="button" className="cs2-chat-forecast-hidden" onClick={() => setHidden(false)}>
          <i className="fa-solid fa-chart-line" aria-hidden="true" />
          Show price history
        </button>
      );
    }

    const itemLabel = resolveChatChartItemLabel(priceHistory);

    return (
      <div className="cs2-chat-forecast cs2-chat-market-chart" onClick={(event) => event.stopPropagation()}>
        <div className="cs2-chat-forecast-head">
          <div className="cs2-chat-forecast-head-main">
            <strong>{itemLabel}</strong>
            <span className="cs2-chat-forecast-head-range">
              Price History · {providerCount} marketplaces
            </span>
          </div>
          <span className="cs2-chat-forecast-tag">{priceHistory.range || "1Y"}</span>
        </div>
        <div className="cs2-chat-forecast-canvas-wrap cs2-chat-price-history-wrap">
          <canvas ref={canvasRef} aria-label={`Multi-provider price history chart for ${itemLabel}`} />
        </div>
        <div className="cs2-chat-price-history-legend" aria-label="Provider legend">
          {legendProviders.map((provider) => {
            const name = String(provider?.name || "Provider");
            const color = String(provider?.color || "#38bdf8");
            const image = String(provider?.image || "").trim();
            return (
              <span key={name} className="cs2-chat-price-history-legend-item">
                {image ? (
                  <img src={image} alt="" className="cs2-chat-price-history-legend-logo" loading="lazy" decoding="async" />
                ) : (
                  <span className="cs2-chat-price-history-legend-swatch" style={{ background: color }} />
                )}
                <span className="cs2-chat-price-history-legend-name">{name}</span>
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  function chatNormalizeItemKey(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function chatForecastItemKey(source) {
    if (!source || typeof source !== "object") return "";
    return String(
      source.item_name
      || source.lookup_name
      || source.market_hash_name
      || source.item
      || source.title
      || ""
    ).trim();
  }

  function chatItemShortLabel(item) {
    return String(item?.display_name || item?.market_hash_name || "")
      .replace(/\s+\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "")
      .trim();
  }

  function chatMatchItemName(list, name) {
    const needle = chatNormalizeItemKey(name);
    if (!needle || !Array.isArray(list) || !list.length) return "";
    const exact = list.find((item) => chatNormalizeItemKey(item.market_hash_name) === needle);
    if (exact) return exact.market_hash_name;
    const loose = list.find((item) => {
      const full = chatNormalizeItemKey(item.market_hash_name);
      const short = chatNormalizeItemKey(chatItemShortLabel(item));
      return full.includes(needle) || needle.includes(full) || short === needle || needle.includes(short);
    });
    return loose ? loose.market_hash_name : "";
  }

  async function fetchChatChartsForItem(itemName, options = {}, signal) {
    const name = String(itemName || "").trim();
    if (!name) {
      return { forecast: null, distribution: null, price_history: null };
    }
    const include = {
      forecast: Boolean(options.forecast ?? true),
      distribution: Boolean(options.distribution ?? false),
      price_history: Boolean(options.price_history ?? false),
    };
    const body = {
      action: "charts",
      item: name,
      include,
      context: { lang: chatLanguageCode(), page_type: "mark" },
    };
    if (options.distribution_range) {
      body.distribution_range = String(options.distribution_range);
    }
    if (options.price_history_range) {
      body.price_history_range = String(options.price_history_range);
    }
    const response = await fetch("chat.php", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      throw new Error(String(payload?.error || "Could not load charts."));
    }
    return {
      forecast: payload.forecast && typeof payload.forecast === "object" ? payload.forecast : null,
      distribution: payload.distribution && typeof payload.distribution === "object" ? payload.distribution : null,
      price_history: payload.price_history && typeof payload.price_history === "object" ? payload.price_history : null,
    };
  }

  function ChatChartItemSwitcher({ items, selectedName, onSelect, disabled }) {
    if (!Array.isArray(items) || items.length < 2) return null;
    return (
      <div className="cs2-chat-chart-switcher" role="tablist" aria-label="Chart item">
        {items.map((item) => {
          const name = item.market_hash_name;
          const selected = chatNormalizeItemKey(name) === chatNormalizeItemKey(selectedName);
          const label = chatItemShortLabel(item);
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={selected}
              className={classNames("cs2-chat-chart-switcher-btn", selected && "is-selected")}
              disabled={disabled && !selected}
              title={name}
              onClick={(event) => {
                event.stopPropagation();
                if (typeof onSelect === "function") onSelect(name);
              }}
            >
              {item.image ? (
                <img src={item.image} alt="" width={18} height={18} loading="lazy" decoding="async" />
              ) : (
                <span className="cs2-chat-chart-switcher-fallback" aria-hidden="true">CS</span>
              )}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  function chatChartsBundleFromProps(forecast, distribution, priceHistory) {
    return {
      forecast: forecast && typeof forecast === "object" ? forecast : null,
      distribution: distribution && typeof distribution === "object" ? distribution : null,
      price_history: priceHistory && typeof priceHistory === "object" ? priceHistory : null,
      ready: true,
    };
  }

  function chatSeedChartsCache(primaryKey, matchedPrimary, bundle) {
    const seed = {};
    if (!bundle) return seed;
    const key = chatNormalizeItemKey(primaryKey);
    const matched = chatNormalizeItemKey(matchedPrimary);
    if (key) seed[key] = bundle;
    if (matched && matched !== key) seed[matched] = bundle;
    return seed;
  }

  function ChatAssistantCharts({
    forecast,
    distribution,
    priceHistory,
    items,
    selectedName,
    onSelectItem,
  }) {
    const list = parseChatItems(items);
    const wantForecast = Boolean(forecast);
    const wantDistribution = Boolean(distribution);
    const wantPriceHistory = Boolean(priceHistory);
    const showSwitcher = wantForecast && list.length >= 2;
    const primaryKey = chatForecastItemKey(forecast)
      || chatForecastItemKey(distribution)
      || chatForecastItemKey(priceHistory);
    const matchedPrimary = chatMatchItemName(list, primaryKey) || primaryKey || (list[0]?.market_hash_name || "");
    const primaryBundle = useMemo(
      () => chatChartsBundleFromProps(forecast, distribution, priceHistory),
      [forecast, distribution, priceHistory]
    );

    const [internalSelected, setInternalSelected] = useState(matchedPrimary);
    const selected = selectedName != null && String(selectedName).trim() !== ""
      ? String(selectedName).trim()
      : internalSelected;
    const setSelected = typeof onSelectItem === "function" ? onSelectItem : setInternalSelected;

    const [chartsByItem, setChartsByItem] = useState(() => (
      chatSeedChartsCache(primaryKey, matchedPrimary, primaryBundle)
    ));
    const chartsByItemRef = useRef(chartsByItem);
    chartsByItemRef.current = chartsByItem;
    const [loadingItem, setLoadingItem] = useState("");
    const [loadError, setLoadError] = useState("");

    useEffect(() => {
      setChartsByItem((prev) => {
        const seeded = chatSeedChartsCache(primaryKey, matchedPrimary, primaryBundle);
        let next = prev;
        let changed = false;
        Object.keys(seeded).forEach((key) => {
          if (prev[key] !== seeded[key]) {
            if (!changed) {
              next = { ...prev };
              changed = true;
            }
            next[key] = seeded[key];
          }
        });
        return changed ? next : prev;
      });
    }, [primaryBundle, primaryKey, matchedPrimary]);

    useEffect(() => {
      if (!showSwitcher || selected) return;
      setInternalSelected(matchedPrimary);
    }, [showSwitcher, matchedPrimary, selected]);

    useEffect(() => {
      if (!showSwitcher || !selected) return undefined;
      const cacheKey = chatNormalizeItemKey(selected);
      const cached = cacheKey ? chartsByItemRef.current[cacheKey] : null;
      if (!cacheKey || cached?.ready) {
        setLoadError("");
        setLoadingItem("");
        return undefined;
      }

      const controller = new AbortController();
      setLoadingItem(selected);
      setLoadError("");
      fetchChatChartsForItem(
        selected,
        {
          forecast: wantForecast,
          distribution: wantDistribution,
          price_history: wantPriceHistory,
          distribution_range: distribution?.range || "1Y",
          price_history_range: priceHistory?.range || "1Y",
        },
        controller.signal
      )
        .then((payload) => {
          const hasAny = Boolean(payload.forecast || payload.distribution || payload.price_history);
          if (!hasAny) {
            setLoadError("No chart data for this item yet.");
            return;
          }
          const bundle = { ...payload, ready: true };
          const resolvedKey = chatNormalizeItemKey(
            chatForecastItemKey(payload.forecast)
            || chatForecastItemKey(payload.distribution)
            || chatForecastItemKey(payload.price_history)
            || selected
          );
          setChartsByItem((prev) => ({
            ...prev,
            [cacheKey]: bundle,
            ...(resolvedKey && resolvedKey !== cacheKey ? { [resolvedKey]: bundle } : {}),
          }));
        })
        .catch((error) => {
          if (error?.name === "AbortError") return;
          setLoadError(String(error?.message || "Could not load charts."));
        })
        .finally(() => {
          setLoadingItem((current) => (current === selected ? "" : current));
        });

      return () => controller.abort();
    }, [
      selected,
      showSwitcher,
      wantForecast,
      wantDistribution,
      wantPriceHistory,
      distribution?.range,
      priceHistory?.range,
    ]);

    if (!forecast && !distribution && !priceHistory) return null;

    const activeBundle = showSwitcher
      ? (chartsByItem[chatNormalizeItemKey(selected)] || null)
      : primaryBundle;
    const activeForecast = wantForecast ? (activeBundle?.forecast || null) : null;
    const activeDistribution = wantDistribution ? (activeBundle?.distribution || null) : null;
    const activePriceHistory = wantPriceHistory ? (activeBundle?.price_history || null) : null;
    const isLoading = Boolean(loadingItem) && !activeBundle?.ready;

    return (
      <div className="cs2-chat-assistant-charts">
        {showSwitcher ? (
          <ChatChartItemSwitcher
            items={list}
            selectedName={selected}
            onSelect={setSelected}
            disabled={Boolean(loadingItem)}
          />
        ) : null}
        {activeForecast ? <ChatForecastChart forecast={activeForecast} /> : null}
        {isLoading ? (
          <div className="cs2-chat-forecast cs2-chat-chart-loading" aria-live="polite">
            <span className="cs2-chat-chart-loading-dot" aria-hidden="true" />
            Loading charts…
          </div>
        ) : null}
        {!isLoading && loadError && !activeForecast && !activeDistribution && !activePriceHistory ? (
          <div className="cs2-chat-forecast cs2-chat-chart-load-error" role="status">
            {loadError}
          </div>
        ) : null}
        {activeDistribution ? <ChatMarketDistributionChart distribution={activeDistribution} /> : null}
        {activePriceHistory ? <ChatPriceHistoryChart priceHistory={activePriceHistory} /> : null}
      </div>
    );
  }

  function ChatKeyFactorsStrip({ factors }) {
    const list = ensureChatKeyFactors(factors);
    const positives = list.filter((entry) => entry.sign === "+").slice(0, 3);
    const risks = list.filter((entry) => entry.sign !== "+").slice(0, 3);

    const renderGroup = (entries, tone, label) => {
      if (!entries.length) return null;
      return (
        <div className={classNames("cs2-chat-key-factors-group", tone === "+" ? "is-positive" : "is-negative")}>
          <div className="cs2-chat-key-factors-group-label">{label}</div>
          <div className="home-ai-factor-row">
            {entries.map((entry, index) => (
              <span
                key={`${entry.sign}-${index}-${entry.text}`}
                className={classNames(
                  "home-ai-factor-pill",
                  entry.sign === "+" ? "is-positive" : "is-negative"
                )}
              >
                <span className="home-ai-factor-sign" aria-hidden="true">{entry.sign === "+" ? "+" : "−"}</span>
                <span>{entry.text}</span>
              </span>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div className="cs2-chat-key-factors" aria-label={ti("aih_keyFactors")}>
        <div className="cs2-chat-key-factors-label">{ti("ai_keyFactors")}</div>
        <div className="cs2-chat-key-factors-groups">
          {renderGroup(positives, "+", ti("ai_positives"))}
          {renderGroup(risks, "-", ti("ai_risks"))}
        </div>
      </div>
    );
  }

  function ChatSentimentStrip({ sentiment, factors }) {
    const list = ensureChatKeyFactors(factors);
    const resolved = sentiment && String(sentiment.verdict || "").trim()
      ? sentiment
      : ensureChatSentiment(sentiment, null, "", null, list);
    const tone = resolved.tone === "bullish" || resolved.tone === "bearish"
      ? resolved.tone
      : "neutral";
    const verdict = String(resolved.verdict || chatSentimentVerdictLabel(tone));
    const detail = String(resolved.detail || "").trim() || chatSentimentFallbackDetail(tone, list);

    return (
      <div className="cs2-chat-sentiment" aria-label={ti("ai_sentiment")}>
        <div className="cs2-chat-sentiment-label">{ti("ai_sentiment")}</div>
        <div className="home-ai-factor-row">
          <span className={classNames("home-ai-factor-pill", `is-${tone}`)}>
            <span className="cs2-chat-sentiment-badge">{translateChatVerdict(verdict)}</span>
            <span className="cs2-chat-sentiment-sep" aria-hidden="true">—</span>
            <span className="cs2-chat-sentiment-detail">{detail}</span>
          </span>
        </div>
      </div>
    );
  }

  function ChatMetricsStrip({ metrics }) {
    const list = (Array.isArray(metrics) ? metrics : [])
      .filter((entry) => entry && String(entry.label || "").trim() && String(entry.value || "").trim());
    if (!list.length) return null;
    return (
      <div className="cs2-chat-metrics-strip" aria-label={ti("ai_itemMetrics")}>
        <div className="cs2-chat-metrics-label">{ti("ai_itemMetrics")}</div>
        <div className="home-ai-metric-chips">
          {list.map((entry) => {
            const detail = translateChatMetricDetail(sanitizeChatMetricDetail(entry.detail || ""))
              || genericChatMetricDetail(entry.label, entry.value);
            return (
              <span key={String(entry.label).toUpperCase()} className="home-ai-metric-chip has-detail">
                <span className="home-ai-metric-chip-label">{formatChatMetricDisplayLabel(entry.label)}</span>
                <span className="home-ai-metric-chip-value">{formatChatMetricDisplayValue(entry.value)}</span>
                {detail ? <span className="home-ai-metric-chip-detail">{detail}</span> : null}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  function ChatMarketSnapshot({ snapshot, forecast, content, hidden = false }) {
    if (hidden || !snapshot || typeof snapshot !== "object") return null;

    // Both games show the strip. What must never happen is one game's
    // numbers under the other's answer - CS2's market cap over a TF2 reply is
    // a lie, not a placeholder - so the payload has to declare which game it
    // is for and match the page. A snapshot with no stamp at all is CS2's,
    // which is what chat.php has always returned.
    const game = getActiveGame();
    const snapshotGame = String(snapshot.game || "").toLowerCase()
      || (Number(snapshot.app_id) === 440 ? "tf2" : Number(snapshot.app_id) === 730 ? "cs2" : "cs2");
    if (game === "tf2" ? snapshotGame !== "tf2" : snapshotGame === "tf2") return null;

    const trendEstimated = Boolean(snapshot.trend_estimated);
    const trendWindows = [
      {
        key: "24h",
        label: ti("ai_snapTrend24h"),
        raw: snapshot.trend_pct_24h,
        samples: snapshot.trend_sample_count_24h,
      },
      {
        key: "7d",
        label: ti("ai_snapTrend7d"),
        raw: snapshot.trend_pct_7d,
        samples: snapshot.trend_sample_count_7d,
      },
      {
        key: "30d",
        label: ti("ai_snapTrend30d", { period: snapshot.trend_period || "30D" }),
        raw: snapshot.trend_pct_30d ?? snapshot.trend_pct,
        samples: snapshot.trend_sample_count_30d ?? snapshot.trend_sample_count,
      },
      {
        key: "1y",
        label: ti("ai_snapTrend1y"),
        raw: snapshot.trend_pct_1y,
        samples: snapshot.trend_sample_count_1y,
      },
    ];

    const volumeRaw = snapshot.volume_24h;
    const volumeNum = Number(volumeRaw);
    const hasVolume = volumeRaw != null && Number.isFinite(volumeNum) && volumeNum > 0;
    const volumeEstimated = Boolean(snapshot.volume_24h_estimated);
    const volumeSampleCount = Number(snapshot.volume_sample_count);

    const trendTitles = trendWindows.map((entry) => {
      const formatted = formatSnapshotTrend(entry.raw);
      const sampleCount = Number(entry.samples);
      if (!formatted.hasTrend) return `${entry.label} unavailable`;
      const sampleText = Number.isFinite(sampleCount) && sampleCount > 0
        ? `${sampleCount.toLocaleString("en-US")} price history samples`
        : "cache";
      return `${trendEstimated ? "Estimated " : ""}${entry.label} from ${sampleText}`;
    });

    const overviewTitle = game === "tf2" ? ti("ai_marketsOverviewTf2") : ti("ai_marketsOverview");
    // "Market" and "24H Vol" are CS2's meanings. TF2's first cell is the value
    // of everything listed on Steam and its second is Skinport turnover, so
    // the cells say which - short forms, because the strip is one line.
    const marketLabel = game === "tf2" ? ti("ai_snapMarketTf2") : ti("ai_snapMarket");
    const volumeLabel = game === "tf2" ? ti("ai_snapVol24hTf2") : ti("ai_snapVol24h");

    return (
      <div
        className="cs2-chat-market-snapshot"
        aria-label={overviewTitle}
        title={[
          snapshot.market_cap_label || "Steam listing value",
          hasVolume
            ? `${volumeEstimated ? "Estimated " : ""}${snapshot.volume_24h_label || "24H turnover"} from ${Number.isFinite(volumeSampleCount) && volumeSampleCount > 0 ? `${volumeSampleCount.toLocaleString("en-US")} synced items` : "cache"}`
            : "24H volume unavailable",
          ...trendTitles,
        ].join(" · ")}
      >
        <div className="cs2-chat-market-snapshot-head">
          <span className="cs2-chat-market-snapshot-title">{overviewTitle}</span>
          <span className="cs2-chat-market-snapshot-live" aria-label={ti("ai_liveDataAria")}>● {ti("ai_liveData")}</span>
        </div>
        <div className="cs2-chat-market-snapshot-strip">
          <div className="cs2-chat-market-snapshot-cell">
            <span className="cs2-chat-market-snapshot-label">{marketLabel}</span>
            <span className="cs2-chat-market-snapshot-value">{formatSnapshotCompactEuro(snapshot.market_cap)}</span>
          </div>
          <span className="cs2-chat-market-snapshot-sep" aria-hidden="true">|</span>
          <div className="cs2-chat-market-snapshot-cell">
            <span className="cs2-chat-market-snapshot-label">{volumeLabel}</span>
            <span
              className="cs2-chat-market-snapshot-value"
              title={hasVolume && volumeEstimated ? "Estimated from synced price-history turnover" : undefined}
            >
              {hasVolume ? `${volumeEstimated ? "~" : ""}${formatSnapshotCompactEuro(volumeNum)}` : "—"}
            </span>
          </div>
          {trendWindows.map((entry) => {
            const formatted = formatSnapshotTrend(entry.raw);
            return (
              <React.Fragment key={entry.key}>
                <span className="cs2-chat-market-snapshot-sep" aria-hidden="true">|</span>
                <div className="cs2-chat-market-snapshot-cell">
                  <span className="cs2-chat-market-snapshot-label">{entry.label}</span>
                  <span
                    className={classNames(
                      "cs2-chat-market-snapshot-value",
                      "cs2-chat-market-snapshot-trend",
                      formatted.hasTrend && formatted.num > 0 && "is-up",
                      formatted.hasTrend && formatted.num < 0 && "is-down"
                    )}
                    title={formatted.hasTrend && trendEstimated ? "Estimated avg % move from synced price history" : undefined}
                  >
                    {formatted.hasTrend ? `${trendEstimated ? "~" : ""}${formatted.sign} ${formatted.text}` : "—"}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
          <span className="cs2-chat-market-snapshot-sep" aria-hidden="true">|</span>
          <div className="cs2-chat-market-snapshot-cell">
            <span className="cs2-chat-market-snapshot-label">{ti("ai_snapItems")}</span>
            <span className="cs2-chat-market-snapshot-value">{formatSnapshotCount(snapshot.items_tracked)}</span>
          </div>
        </div>
      </div>
    );
  }

  function formatSnapshotTrend(raw) {
    const hasTrend = raw != null && raw !== "" && Number.isFinite(Number(raw));
    const num = hasTrend ? Number(raw) : NaN;
    return {
      hasTrend,
      num,
      sign: hasTrend ? (num > 0 ? "▲" : num < 0 ? "▼" : "—") : "—",
      text: hasTrend ? `${Math.abs(num).toFixed(1)}%` : "—",
    };
  }

  function formatSnapshotCompactEuro(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    if (n >= 1_000_000_000) return `€${(n / 1_000_000_000).toFixed(2)}B`;
    if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `€${(n / 1_000).toFixed(1)}K`;
    return `€${n.toFixed(0)}`;
  }

  function formatSnapshotCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString("en-US");
  }

  /**
   * Big-AI-only fallback: when the backend reply didn't attach structured
   * `items`, pull the bold names out of its own "### Items to buy" bullets
   * so the cards can still be built from the client catalog. Mirrors the
   * bullet/bold parsing ai_chat_helpers.php uses server-side.
   */
  function extractItemsToBuyNames(content) {
    const text = String(content || "");
    const sectionMatch = text.match(
      /(?:^|\n)#{1,6}\s*(?:[^\n\w#]{0,6})?Items to buy\s*\r?\n([\s\S]*?)(?:\r?\n#{1,6}\s|$)/i
    );
    const block = sectionMatch ? sectionMatch[1] : "";
    if (!block.trim()) return [];
    const names = [];
    for (const line of block.split(/\r?\n/)) {
      const bulletMatch = line.match(/^\s*(?:[-*•●○◉▪▫◾∙·‣⁃]|\d+[.)])\s+(.+)$/);
      if (!bulletMatch) continue;
      let name = bulletMatch[1].trim();
      const boldMatch = name.match(/^\*\*(.+?)\*\*$/);
      if (boldMatch) name = boldMatch[1].trim();
      name = name.replace(/\s*[—–]\s+.*$/, "").trim();
      if (name) names.push(name);
    }
    return names;
  }

  function chatFallbackCatalogMatch(catalog, rawName) {
    const norm = String(rawName || "").trim().toLowerCase();
    if (!norm) return null;
    const bare = norm.replace(/\s*\((?:factory new|minimal wear|field-tested|well-worn|battle-scarred)\)\s*$/i, "").trim();
    let best = null;
    for (const entry of catalog) {
      const entryName = String(entry?.market_hash_name || "").trim().toLowerCase();
      if (!entryName) continue;
      if (entryName === norm) return entry;
      if (!best && (entryName === bare || entryName.startsWith(bare) || String(entry?.display_name || "").trim().toLowerCase() === bare)) {
        best = entry;
      }
    }
    return best;
  }

  function useChatItemsFallback(names) {
    const [resolved, setResolved] = useState([]);
    const key = names.join("");

    useEffect(() => {
      if (!names.length) {
        setResolved([]);
        return undefined;
      }
      const loadCatalog = window.CS2ReactData?.loadCatalog;
      if (typeof loadCatalog !== "function") {
        setResolved([]);
        return undefined;
      }
      let cancelled = false;
      loadCatalog()
        .then((catalog) => {
          if (cancelled || !Array.isArray(catalog)) return;
          const seen = new Set();
          const out = [];
          for (const rawName of names) {
            const hit = chatFallbackCatalogMatch(catalog, rawName);
            const hitKey = hit ? String(hit.market_hash_name || "") : "";
            if (hit && hitKey && !seen.has(hitKey)) {
              seen.add(hitKey);
              out.push(hit);
            }
          }
          setResolved(out);
        })
        .catch(() => {
          if (!cancelled) setResolved([]);
        });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return resolved;
  }

  function ChatAssistantMessageExtras({ items, forecast, distribution, priceHistory, content, hideItems = false }) {
    const backendList = parseChatItems(items);
    const fallbackNames = useMemo(
      () => (backendList.length ? [] : extractItemsToBuyNames(content)),
      [backendList.length, content]
    );
    const fallbackItems = useChatItemsFallback(fallbackNames);
    const list = backendList.length ? backendList : parseChatItems(fallbackItems);
    const hasCharts = Boolean(forecast || distribution || priceHistory);
    const showSelect = Boolean(forecast) && list.length >= 2;
    const primaryKey = chatForecastItemKey(forecast)
      || chatForecastItemKey(distribution)
      || chatForecastItemKey(priceHistory);
    const initialSelected = chatMatchItemName(list, primaryKey)
      || primaryKey
      || (list[0]?.market_hash_name || "");
    const [selectedName, setSelectedName] = useState(initialSelected);

    useEffect(() => {
      setSelectedName(initialSelected);
    }, [initialSelected]);

    return (
      <>
        {hideItems ? null : (
          <ChatItemCards
            items={list}
            selectedName={showSelect ? selectedName : ""}
            onSelectItem={showSelect ? setSelectedName : null}
          />
        )}
        {hasCharts ? (
          <ChatAssistantCharts
            forecast={forecast}
            distribution={distribution}
            priceHistory={priceHistory}
            items={list}
            selectedName={showSelect ? selectedName : undefined}
            onSelectItem={showSelect ? setSelectedName : undefined}
          />
        ) : null}
      </>
    );
  }

  function chatExtractWeaponFamily(text) {
    const message = String(text || "").toLowerCase().trim();
    if (!message) return "";
    const aliases = [
      ["desert eagle", "Desert Eagle"],
      ["dual berettas", "Dual Berettas"],
      ["r8 revolver", "R8 Revolver"],
      ["m4a1-s", "M4A1-S"],
      ["m4a1s", "M4A1-S"],
      ["glock-18", "Glock-18"],
      ["usp-s", "USP-S"],
      ["cz75-auto", "CZ75-Auto"],
      ["five-seven", "Five-SeveN"],
      ["sawed-off", "Sawed-Off"],
      ["pp-bizon", "PP-Bizon"],
      ["mac-10", "MAC-10"],
      ["mp5-sd", "MP5-SD"],
      ["sg 553", "SG 553"],
      ["ssg 08", "SSG 08"],
      ["ak-47", "AK-47"],
      ["ak 47", "AK-47"],
      ["m4a4", "M4A4"],
      ["m4a1", "M4A1-S"],
      ["galil ar", "Galil AR"],
      ["galil", "Galil AR"],
      ["famas", "FAMAS"],
      ["aug", "AUG"],
      ["awp", "AWP"],
      ["scar-20", "SCAR-20"],
      ["g3sg1", "G3SG1"],
      ["glock", "Glock-18"],
      ["usp", "USP-S"],
      ["p250", "P250"],
      ["deagle", "Desert Eagle"],
      ["tec-9", "Tec-9"],
      ["p2000", "P2000"],
      ["p90", "P90"],
      ["mp9", "MP9"],
      ["mp7", "MP7"],
      ["ump-45", "UMP-45"],
      ["ump", "UMP-45"],
      ["bizon", "PP-Bizon"],
      ["nova", "Nova"],
      ["xm1014", "XM1014"],
      ["mag-7", "MAG-7"],
      ["negev", "Negev"],
      ["m249", "M249"],
      ["ak47", "AK-47"],
      ["ak", "AK-47"],
      ["berettas", "Dual Berettas"],
      ["zeus", "Zeus x27"],
    ].sort((a, b) => b[0].length - a[0].length);
    for (const [needle, family] of aliases) {
      const plural = /[0-9]$/.test(needle) || needle.endsWith("s") ? "" : "s?";
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}${plural}\\b`, "i").test(message)) return family;
    }
    return "";
  }

  function chatStripItemNamePrefixes(name) {
    let next = String(name || "")
      .replace(/\s+\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "")
      .trim();
    for (let i = 0; i < 4; i++) {
      const stripped = next.replace(/^★\s*/u, "").replace(/^(?:StatTrak™|StatTrak|Souvenir)\s+/iu, "").trim();
      if (stripped === next) break;
      next = stripped;
    }
    return next;
  }

  function chatCatalogNameWeapon(name) {
    const stripped = chatStripItemNamePrefixes(name);
    if (!stripped) return "";
    const left = stripped.includes("|") ? stripped.split("|")[0].trim() : stripped;
    return chatExtractWeaponFamily(left);
  }

  function chatCatalogItemKind(name) {
    const stripped = chatStripItemNamePrefixes(name);
    if (!stripped) return "other";
    if (/^(sticker|patch|graffiti|music kit|pin|charm|keychain)\b/i.test(stripped)) return "other";
    if (stripped.includes("|")) return "skin";
    if (/\b(case|capsule|package)\s*$/i.test(stripped)) return "case";
    return "other";
  }

  function chatIsGloveItem(name) {
    const stripped = chatStripItemNamePrefixes(name);
    return /\b(?:gloves?|hand wraps?)\b/i.test(stripped);
  }

  function chatIsKnifeItem(name) {
    const raw = String(name || "").trim();
    const stripped = chatStripItemNamePrefixes(raw);
    if (!stripped || chatIsGloveItem(raw)) return false;
    if (/\b(?:knife|knives|bayonet|karambit|daggers?|talon|navaja|stiletto|ursus|bowie|falchion|butterfly|huntsman|shadow daggers|gut knife|flip knife|classic knife|paracord knife|survival knife|nomad knife|skeleton knife|kukri)\b/i.test(stripped)) {
      return true;
    }
    return /^★\s+/u.test(raw) && stripped.includes("|");
  }

  function chatItemWeaponClass(name) {
    if (chatIsGloveItem(name)) return "gloves";
    if (chatIsKnifeItem(name)) return "knife";
    const weapon = chatCatalogNameWeapon(name).toLowerCase();
    const map = {
      "desert eagle": "pistol", "dual berettas": "pistol", "r8 revolver": "pistol",
      "glock-18": "pistol", "usp-s": "pistol", "cz75-auto": "pistol",
      "five-seven": "pistol", p250: "pistol", "tec-9": "pistol",
      p2000: "pistol", "zeus x27": "pistol",
      "ak-47": "rifle", "m4a1-s": "rifle", m4a4: "rifle",
      "galil ar": "rifle", famas: "rifle", aug: "rifle", "sg 553": "rifle",
      awp: "sniper", "ssg 08": "sniper", "scar-20": "sniper", g3sg1: "sniper",
      "mac-10": "smg", "mp5-sd": "smg", "pp-bizon": "smg", p90: "smg",
      mp9: "smg", mp7: "smg", "ump-45": "smg",
      nova: "shotgun", xm1014: "shotgun", "mag-7": "shotgun", "sawed-off": "shotgun",
      negev: "heavy", m249: "heavy",
    };
    return map[weapon] || "";
  }

  function chatExtractExclusiveEquipmentCategory(text) {
    const message = String(text || "").toLowerCase().trim();
    if (!message) return "";
    const wantsSkins = /\b(skins?|finishes?)\b/.test(message);
    const wantsCases = /\bcases?\b/.test(message);
    const wantsStickers = /\b(stickers?|capsules?)\b/.test(message);
    if (wantsSkins && (wantsCases || wantsStickers)) return "";
    const hits = [];
    if (/\bgloves?\b|\bhand wraps?\b/.test(message)) hits.push("gloves");
    if (/\b(?:knives|knife|bayonets?|karambits?|butterfly knife)\b/.test(message)) hits.push("knife");
    if (/\brifles?\b/.test(message)) hits.push("rifle");
    if (/\bpistols?\b/.test(message)) hits.push("pistol");
    if (/\b(?:smgs?|sub-?machine(?:\s+guns?)?)\b/.test(message)) hits.push("smg");
    if (/\bshotguns?\b/.test(message)) hits.push("shotgun");
    if (/\bsnipers?\b/.test(message)) hits.push("sniper");
    if (/\b(?:heav(?:y|ies)|machine\s*guns?)\b/.test(message)) hits.push("heavy");
    return hits.length === 1 ? hits[0] : "";
  }

  function chatExtractRequestedItemType(text, weapon) {
    const message = String(text || "").toLowerCase().trim();
    if (!message) return "";
    if (/\bsouvenirs?\b/.test(message) && !/\b(charms?|keychains?)\b/.test(message)) return "souvenir";
    if (/\bcapsules?\b/.test(message) && !/\bcases?\b/.test(message) && !/\b(skins?|finishes?)\b/.test(message)) {
      return "sticker_capsule";
    }
    if (/\b(charms?|keychains?)\b/.test(message) && !/\b(skins?|portfolio)\b/.test(message)) return "charm";
    if (/\bstickers?\b/.test(message) && !/\b(skins?|portfolio)\b/.test(message)) return "sticker";
    const exclusive = chatExtractExclusiveEquipmentCategory(message);
    if (exclusive) return exclusive;
    if (chatUserWantsSkinsInvestPortfolio(message)) {
      const mixCases = /\bcases?\b/.test(message);
      const mixSkins = /\b(skins?|finishes?)\b/.test(message);
      const mixStickers = /\b(stickers?|capsules?)\b/.test(message);
      if (mixSkins && (mixCases || mixStickers)) return "";
      return "skin";
    }
    if (/\bcases?\b/.test(message) && !/\b(skins?|finishes?|sticker)\b/.test(message)) return "case";
    if (weapon) return "skin";
    if (/\bstattrak(?:™)?\b/.test(message)) return "stattrak";
    return "";
  }

  function chatRequestedCardScope(text) {
    const weapon = chatExtractWeaponFamily(text);
    let type = chatExtractRequestedItemType(text, weapon);
    let scopedWeapon = weapon;
    const stattrak = /\bstattrak(?:™)?\b/i.test(String(text || ""));
    if (type === "charm" || type === "sticker" || type === "sticker_capsule" || type === "souvenir" || type === "gloves" || type === "knife") {
      scopedWeapon = "";
    }
    return { weapon: scopedWeapon, type, stattrak };
  }

  function chatItemMatchesScope(name, weapon, type, wantStatTrak) {
    const kind = chatCatalogItemKind(name);
    if (wantStatTrak || type === "stattrak") {
      if (!/^(?:★\s*)?StatTrak/i.test(String(name || "").trim())) return false;
    }
    if (type === "skin" && kind !== "skin") return false;
    if (type === "case") {
      if (!/\bCase\s*$/i.test(chatStripItemNamePrefixes(name)) || /\b(Capsule|Souvenir Package)\b/i.test(name)) return false;
    }
    if (type === "gloves" && !chatIsGloveItem(name)) return false;
    if (type === "knife" && !chatIsKnifeItem(name)) return false;
    if (["rifle", "pistol", "smg", "shotgun", "sniper", "heavy"].includes(type)) {
      const itemClass = chatItemWeaponClass(name);
      if (type === "rifle") {
        if (itemClass !== "rifle" && itemClass !== "sniper") return false;
      } else if (itemClass !== type) {
        return false;
      }
    }
    if (weapon) {
      const got = chatCatalogNameWeapon(name);
      if (!got || got.toLowerCase() !== String(weapon).toLowerCase()) return false;
    }
    return true;
  }

  function parseChatItems(raw) {
    if (!Array.isArray(raw)) return [];
    const parsed = raw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const marketHashName = String(item.market_hash_name || "").trim();
        if (!marketHashName) return null;
        const priceRaw = item.seed_sell_price;
        const priceNum = priceRaw == null ? null : Number(priceRaw);
        const cheapestRaw = item.cheapest_price;
        const cheapestNum = cheapestRaw == null ? null : Number(cheapestRaw);
        const wearMatch = marketHashName.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i);
        const displayName = String(item.display_name || "")
          .trim()
          .replace(/\s+\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "");
        return {
          market_hash_name: marketHashName,
          display_name: displayName,
          image: String(item.image || "").trim(),
          name_color: String(item.name_color || "B0C3D9").replace(/^#/, ""),
          category: String(item.category || ""),
          type_note: String(item.type_note || ""),
          seed_sell_price: Number.isFinite(priceNum) ? priceNum : null,
          selected_wear: String(item.selected_wear || wearMatch?.[1] || "").trim(),
          cheapest_marketplace: String(item.cheapest_marketplace || "").trim(),
          cheapest_price: Number.isFinite(cheapestNum) && cheapestNum > 0 ? cheapestNum : null,
          cheapest_url: String(item.cheapest_url || item.market_url || "").trim(),
          market_url: String(item.market_url || "").trim(),
          scope_weapon: String(item.scope_weapon || "").trim(),
          scope_type: String(item.scope_type || "").trim(),
          // TF2 cards: the appid picks the marketplace links, and the effect /
          // base index are what tf2-item.html needs to open the right variant.
          app_id: Number(item.app_id) === 440 || Number(item.app_id) === 730 ? Number(item.app_id) : null,
          page_url: String(item.page_url || "").trim(),
          effect: String(item.effect || "").trim(),
          base_index: Number.isInteger(Number(item.base_index)) ? Number(item.base_index) : null,
        };
      })
      .filter(Boolean);
    const scopeWeapon = parsed.find((item) => item.scope_weapon)?.scope_weapon || "";
    const scopeType = parsed.find((item) => item.scope_type)?.scope_type || "";
    const filtered = (scopeWeapon || scopeType)
      ? parsed.filter((item) => chatItemMatchesScope(item.market_hash_name, scopeWeapon, scopeType, scopeType === "stattrak"))
      : parsed;
    return filtered.slice(0, 8);
  }

  function chatItemHref(item) {
    // The backend may hand the card its own page URL; it knows the item's
    // effect and base index, which the name alone does not carry.
    const given = String(item?.page_url || "").trim();
    if (given) return given;
    if (chatGameAppId(item) === 440) {
      const name = String(item?.market_hash_name || item?.display_name || "").trim();
      if (!name) return "tf2/market/";
      const effect = String(item?.effect || "").trim();
      const clean = tf2ItemHref(name, effect, item?.category);
      if (clean) return clean;
      // No category to file it under: the query page still resolves it.
      const params = new URLSearchParams({ item: name });
      if (effect) params.set("e", effect);
      // Number(null) is 0, and b=0 is a real base index - a missing one must
      // stay missing rather than point at another item's render.
      const base = item?.base_index == null || item.base_index === "" ? NaN : Number(item.base_index);
      if (Number.isInteger(base) && base >= 0) params.set("b", String(base));
      return `tf2-item.html?${params.toString()}`;
    }
    const catalog = window.CS2ReactData || {};
    if (typeof catalog.buildItemHref === "function") {
      const href = catalog.buildItemHref(item);
      if (href) return href;
    }
    return buildSearchHref(item);
  }

  function chatBuyMarketLogoUrl(label) {
    const key = String(label || "").toLowerCase().replace(/[\s._-]+/g, "");
    const logos = {
      steam: "assets/markets/steam.png",
      steammarket: "assets/markets/steam.png",
      whitemarket: "assets/markets/whitemarket.webp?v=20260602",
      skinport: "assets/markets/skinport.png",
      csfloat: "assets/markets/floatlogo.png?v=20260602",
      dmarket: "assets/markets/dmarket.png",
      marketcsgo: "assets/markets/marketcsgo.png",
      shadowpay: "assets/markets/shadowpay.png",
      waxpeer: "assets/markets/waxpeer.png",
      mannco: "assets/markets/mannco.ico",
      haloskins: "assets/markets/haloskins.png",
      rapidskins: "assets/markets/rapidskins.png",
      csmoney: "assets/markets/csmoney.png",
      buff163: "assets/markets/buff.webp",
      buff: "assets/markets/buff.webp",
      buffmarket: "assets/markets/buff.webp",
      white: "assets/markets/whitemarket.webp?v=20260602",
      float: "assets/markets/floatlogo.png?v=20260602",
      csmoneybot: "assets/markets/csmoney.png",
      skinmonkey: "assets/markets/skinmonkey.png",
      skinswap: "assets/markets/images.jfif",
      skinswapcn: "assets/markets/skinswap-cn.jfif?v=1",
      lisskins: "assets/markets/lis-skins.jpg",
      skinburn: "assets/markets/skins.png",
      uuskins: "assets/markets/uuskins.png?v=1",
      youpin898: "assets/markets/youpin898.png?v=1",
      youpin: "assets/markets/youpin898.png?v=1",
      ecosteam: "assets/markets/ecosteam.jpg?v=1",
    };
    return logos[key] || "";
  }

  function chatBuyMarketSourceKey(label) {
    const key = String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const aliases = {
      steammarket: "steam",
      steam_market: "steam",
      cs_float: "csfloat",
      float: "csfloat",
      whitemarket: "white_market",
      white: "white_market",
      marketcsgo: "market_csgo",
      halo_skins: "haloskins",
      buff: "buff163",
      buff_163: "buff163",
      buffmarket: "buff163",
      cs_money: "csmoney",
      csmoneybot: "csmoney",
    };
    return aliases[key] || key;
  }

  function chatSkinportItemUrl(marketHashName) {
    const name = String(marketHashName || "").trim();
    if (!name) return "";
    const slug = name
      .toLowerCase()
      .replace(/[★☆™©®]/g, "")
      .replace(/[|/_\\,.()[\]{}-]+/g, " ")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]+/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (slug) return `https://skinport.com/item/${slug}`;
    return `https://skinport.com/market/730?search=${encodeURIComponent(name)}`;
  }

  // mannco.store's own item pages are /item/<appid>-<slugified name>, and the
  // real slug only comes from their price API (the "url" field). Without it,
  // "https://mannco.store/?search=..." is not a search route at all - it drops
  // the visitor on the front page, which is what every TF2 Mannco link did.
  // Their per-game market does take a query, and lists the exact item first.
  function manncoSearchUrl(name, appId) {
    const query = encodeURIComponent(String(name || "").trim());
    return `https://mannco.store/${appId === 440 ? "tf2" : "cs2"}?search=${query}`;
  }

  // Steam's appid for the page's game. TF2 cards come from the TF2 index, so
  // every marketplace link on a TF2 answer has to point at 440 - a 730 link
  // for a TF2 item lands on an empty CS2 market page.
  function chatGameAppId(item) {
    const declared = Number(item?.app_id);
    if (declared === 440 || declared === 730) return declared;
    return getActiveGame() === "tf2" ? 440 : 730;
  }

  function chatFallbackListingUrl(label, marketHashName, appId) {
    const name = String(marketHashName || "").trim();
    if (!name) return "";
    const encoded = encodeURIComponent(name);
    const app = appId === 440 || appId === 730 ? appId : chatGameAppId();
    const source = chatBuyMarketSourceKey(label);
    if (app === 440) {
      switch (source) {
        case "skinport":
          // TF2 has no /item/<slug> pages worth guessing at; search is reliable.
          return `https://skinport.com/market/440?search=${encoded}`;
        case "mannco":
          return manncoSearchUrl(name, 440);
        case "dmarket":
          return `https://dmarket.com/ingame-items/item-list/tf2-items?title=${encoded}`;
        case "steam":
        default:
          return `https://steamcommunity.com/market/listings/440/${encoded}?l=english`;
      }
    }
    switch (source) {
      case "steam":
        return `https://steamcommunity.com/market/listings/730/${encoded}?l=english`;
      case "skinport":
        return chatSkinportItemUrl(name);
      case "csfloat":
        return `https://csfloat.com/search?market_hash_name=${encoded}`;
      case "white_market":
        return `https://white.market/item?appId=730&nameHash=${encoded}`;
      case "dmarket":
        return `https://dmarket.com/ingame-items/item-list/csgo-skins?title=${encoded}`;
      case "market_csgo":
        return `https://market.csgo.com/en/?search=${encoded}`;
      case "shadowpay":
        return `https://shadowpay.com/csgo-items?search=${encoded}`;
      case "waxpeer":
        return `https://waxpeer.com/?search=${encoded}`;
      case "mannco":
        return manncoSearchUrl(name, 730);
      case "haloskins":
        return `https://www.haloskins.com/market?keyword=${encoded}`;
      // /market does not exist (404) and the apex -> www redirect drops the
      // query string, so this must be www + /buy?marketHashNames=.
      case "rapidskins":
        return `https://www.rapidskins.com/buy?marketHashNames=${encoded}`;
      case "buff163":
        return `https://buff.163.com/market/csgo#tab=selling&search=${encoded}`;
      case "csmoney":
        return `https://cs.money/market/buy/?search=${encoded}`;
      default:
        return `https://steamcommunity.com/market/listings/730/${encoded}?l=english`;
    }
  }

  function chatListingHostsForSource(label) {
    return {
      steam: ["steamcommunity.com"],
      skinport: ["skinport.com"],
      csfloat: ["csfloat.com"],
      white_market: ["white.market"],
      dmarket: ["dmarket.com"],
      market_csgo: ["market.csgo.com"],
      shadowpay: ["shadowpay.com"],
      waxpeer: ["waxpeer.com"],
      mannco: ["mannco.store"],
      haloskins: ["haloskins.com"],
      rapidskins: ["rapidskins.com"],
      buff163: ["buff.163.com", "buff163.com"],
      csmoney: ["cs.money"],
    }[chatBuyMarketSourceKey(label)] || [];
  }

  function chatIsGenericListingUrl(label, url) {
    const raw = String(url || "").trim();
    const source = chatBuyMarketSourceKey(label);
    if (!raw || raw === "#" || /^javascript:/i.test(raw)) return true;
    if (/item_page\.html(?:[?#]|$)/i.test(raw)) return true;
    if (!/^https?:\/\//i.test(raw)) return true;
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_error) {
      return true;
    }
    const host = String(parsed.hostname || "").toLowerCase();
    const path = String(parsed.pathname || "").replace(/\/+$/, "").toLowerCase();
    const hosts = chatListingHostsForSource(source);
    if (hosts.length && !hosts.some((expected) => host === expected || host.endsWith(`.${expected}`))) {
      return true;
    }
    if (source === "white_market") {
      const hasName = Boolean(parsed.searchParams.get("nameHash") || parsed.searchParams.get("name"));
      if (["", "/csgo", "/market", "/en", "/en/csgo"].includes(path) && !hasName) return true;
      if (path === "/item" && !hasName) return true;
    }
    if (source === "skinport") {
      if (/^\/market\/(pistol|rifle|smg|sniper|shotgun|machinegun|knife|gloves|sticker)/.test(path)) return true;
      if (path === "" || path === "/market") return true;
      if (/^\/market\/(?:730|440)/.test(path) && !parsed.searchParams.get("search")) return true;
    }
    // Only /item/<slug> or a market page carrying ?search= reaches the item.
// "mannco.store/?search=" is the front page with a query nobody reads, so
    // an empty path is generic even when it carries one.
    if (source === "mannco" && !path.startsWith("/item/") && (!path || !parsed.searchParams.get("search"))) return true;
    if (source === "steam" && !/\/market\/listings\/(?:730|440)\//.test(path)) return true;
    return false;
  }

  function chatBuyListingUrl(label, marketHashName, existingUrl, appId) {
    const name = String(marketHashName || "").trim();
    const direct = String(existingUrl || "").trim();
    if (direct && !chatIsGenericListingUrl(label, direct)) {
      return direct;
    }
    return chatFallbackListingUrl(label, name, appId);
  }

  function chatIsDirectHttpUrl(url) {
    const raw = String(url || "").trim();
    if (!raw || raw === "#" || /^javascript:/i.test(raw)) return false;
    return /^https?:\/\//i.test(raw);
  }

  function chatPreferredBuyMarket(items) {
    const counts = Object.create(null);
    for (const item of Array.isArray(items) ? items : []) {
      const label = String(item?.cheapest_marketplace || "").trim();
      if (!label) continue;
      counts[label] = (counts[label] || 0) + 1;
    }
    let best = "";
    let bestN = 0;
    for (const label of Object.keys(counts)) {
      if (counts[label] > bestN) {
        best = label;
        bestN = counts[label];
      }
    }
    // TF2's own index quotes Mannco first, so that is the sane default there.
    return best || (getActiveGame() === "tf2" ? "Mannco" : "Skinport");
  }

  function chatBuyRedirect(item, preferredLabel) {
    const name = String(item?.market_hash_name || "").trim();
    const app = chatGameAppId(item);
    const fallbackLabel = app === 440 ? "Mannco" : "Skinport";
    const cheapestLabel = String(item?.cheapest_marketplace || "").trim();
    const preferred = String(preferredLabel || cheapestLabel || fallbackLabel).trim() || fallbackLabel;
    const existing = String(item?.cheapest_url || item?.market_url || "").trim();

    if (cheapestLabel) {
      const url = chatBuyListingUrl(cheapestLabel, name, existing, app);
      if (url) return { label: cheapestLabel, url };
    }

    if (chatIsDirectHttpUrl(existing) && !/item_page\.html(?:[?#]|$)/i.test(existing)) {
      return { label: preferred, url: existing };
    }

    if (name) {
      const preferredUrl = chatFallbackListingUrl(preferred, name, app);
      if (preferredUrl) return { label: preferred, url: preferredUrl };
      const steamUrl = chatFallbackListingUrl("steam", name, app);
      if (steamUrl) return { label: "Steam", url: steamUrl };
    }

    const href = chatItemHref(item);
    return { label: preferred, url: href || "#" };
  }

  function chatItemImageCandidates(item) {
    const seen = new Set();
    const out = [];
    const push = (value) => {
      const src = String(value || "").trim();
      if (!src || seen.has(src)) return;
      if (src === "assets/markets/steam.png" || src === "assets/markets/steam.webp") return;
      seen.add(src);
      out.push(src);
    };

    const marketHashName = String(item?.market_hash_name || "").trim();
    const catalog = window.CS2ReactData || {};
    push(item?.image);
    push(item?.steam_image_url);
    push(item?.project_image_path);
    push(item?.local_path);
    if (typeof catalog.resolveItemImage === "function") {
      push(catalog.resolveItemImage(item));
    }
    if (typeof catalog.catalogImageSource === "function") {
      push(catalog.catalogImageSource(item));
    }
    if (typeof catalog.findWeaponCatalogImage === "function" && marketHashName) {
      push(catalog.findWeaponCatalogImage(marketHashName));
    }

    // Steam Community CDN search page thumbnail fallback (encoded market hash).
    if (marketHashName) {
      // Local project asset path conventions used elsewhere in the app.
      const stripped = marketHashName
        .replace(/\s+\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "")
        .replace(/^(?:★\s*)?(?:StatTrak™|StatTrak|Souvenir)\s+/i, "")
        .trim();
      if (stripped.includes("|")) {
        const [weaponRaw, finishRaw] = stripped.split("|").map((part) => String(part || "").trim());
        const weapon = weaponRaw.toLowerCase().replace(/[^a-z0-9]+/g, "");
        const finish = finishRaw.toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (weapon && finish) {
          push(`https://cdn.csroi.com/default_generated/weapon_${weapon}_${finish}_light_png.png`);
        }
      }
    }

    return out;
  }

  function ChatItemCardImage({ item, quantity }) {
    const candidates = useMemo(() => chatItemImageCandidates(item), [item]);
    const [index, setIndex] = useState(0);
    const src = candidates[index] || "";

    useEffect(() => {
      setIndex(0);
    }, [item?.market_hash_name, item?.image, candidates.length]);

    return (
      <div className={classNames(
        "cs2-chat-item-card-media",
        (window.CS2ReactData?.isXm1014ItemName?.(item?.market_hash_name || item?.display_name || item?.name) || /xm[\s-]?1014/i.test(String(item?.market_hash_name || item?.display_name || item?.name || ""))) && "xm-hide-shell"
      )}>
        {quantity > 1 ? (
          <span className="cs2-chat-item-card-qty" aria-label={`Quantity ${quantity}`}>×{quantity}</span>
        ) : null}
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => {
              setIndex((prev) => (prev + 1 < candidates.length ? prev + 1 : candidates.length));
            }}
          />
        ) : (
          <span>{chatGameAppId(item) === 440 ? "TF" : "CS"}</span>
        )}
      </div>
    );
  }

  function ChatItemCards({ items, selectedName, onSelectItem }) {
    const list = parseChatItems(items);
    if (!list.length) return null;
    const canSelectChart = typeof onSelectItem === "function";
    const preferredMarket = chatPreferredBuyMarket(list);

    return (
      <div
        className="cs2-chat-item-cards"
        aria-label="Recommended items"
        data-count={list.length}
        style={{ "--card-count": Math.max(1, list.length) }}
      >
        {list.map((item, index) => {
          const title = String(item.display_name || item.market_hash_name)
            .replace(/\s+\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "")
            .trim();
          const cheapestPrice = item.cheapest_price != null ? item.cheapest_price : item.seed_sell_price;
          const quantity = Math.max(1, Number(item.quantity) || 1);
          const lineTotal = item.line_total != null
            ? Number(item.line_total)
            : (cheapestPrice != null ? cheapestPrice * quantity : null);
          const buy = chatBuyRedirect(item, preferredMarket);
          const listingUrl = buy.url || "#";
          const accent = `#${item.name_color || "60a5fa"}`;
          const logoUrl = chatBuyMarketLogoUrl(buy.label);
          // The marketplace name itself is never translated.
          const buyLabel = buy.label ? `${ti("card_buyOn")} ${buy.label}` : ti("card_buy");
          const buyTitle = lineTotal != null
            ? `${buyLabel} · ${quantity > 1 ? `${quantity}× ` : ""}€${lineTotal.toFixed(2)}`
            : (cheapestPrice != null ? `${buyLabel} · €${cheapestPrice.toFixed(2)}` : buyLabel);
          const isChartSelected = canSelectChart
            && chatNormalizeItemKey(selectedName) === chatNormalizeItemKey(item.market_hash_name);
          const buyMark = (
            <>
              <span>{ti("card_buyOn")}</span>
              {logoUrl ? (
                <img src={logoUrl} alt="" width={18} height={18} decoding="async" style={{ pointerEvents: "none" }} />
              ) : (
                <span className="cs2-chat-item-card-buy-market">{buy.label || "Steam"}</span>
              )}
            </>
          );
          return (
            <article
              key={`${item.market_hash_name}-${index}`}
              className={classNames("cs2-chat-item-card", isChartSelected && "is-chart-selected")}
              style={{ "--card-accent": accent }}
            >
              <a
                className="cs2-chat-item-card-main"
                href={chatItemHref(item)}
                title={canSelectChart ? `Show chart for ${title}` : `Open ${title}`}
                aria-pressed={canSelectChart ? isChartSelected : undefined}
                onClick={(event) => {
                  if (!canSelectChart) return;
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  onSelectItem(item.market_hash_name);
                }}
              >
                <ChatItemCardImage item={item} quantity={quantity} />
                <div className="cs2-chat-item-card-body">
                  {lineTotal != null ? (
                    <span className="cs2-chat-item-card-price">
                      <b>€{lineTotal.toFixed(2)}</b>
                      {quantity > 1 && cheapestPrice != null ? (
                        <small>{quantity}× €{cheapestPrice.toFixed(2)}</small>
                      ) : null}
                    </span>
                  ) : (cheapestPrice != null ? (
                    <span className="cs2-chat-item-card-price">
                      <b>€{cheapestPrice.toFixed(2)}</b>
                    </span>
                  ) : null)}
                  <strong>{title}</strong>
                </div>
              </a>
              <a
                className="cs2-chat-item-card-buy"
                href={listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={buyTitle}
                aria-label={buyTitle}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                {buyMark}
              </a>
            </article>
          );
        })}
      </div>
    );
  }

  function useChatTypewriter(text, active, onComplete) {
    const [displayed, setDisplayed] = useState("");
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    useEffect(() => {
      if (!active || !text) {
        setDisplayed("");
        return undefined;
      }

      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        setDisplayed(text);
        onCompleteRef.current?.();
        return undefined;
      }

      setDisplayed("");
      let index = 0;
      let cancelled = false;
      let timeoutId = null;

      const schedule = (fn, ms) => {
        timeoutId = window.setTimeout(fn, ms);
      };

      const tick = () => {
        if (cancelled) return;
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          setDisplayed(text);
          onCompleteRef.current?.();
          return;
        }

        let step = 1;
        if (text.length > 900) step = 3;
        else if (text.length > 450) step = 2;

        index = Math.min(text.length, index + step);
        setDisplayed(text.slice(0, index));

        if (index >= text.length) {
          schedule(() => {
            if (!cancelled) onCompleteRef.current?.();
          }, 260);
          return;
        }

        const justTyped = text[index - 1] || "";
        let delay = text.length > 900 ? 12 : text.length > 450 ? 16 : 24;
        if (justTyped === "\n") delay += 110;
        else if (".!?".includes(justTyped)) delay += 85;
        else if (",;:".includes(justTyped)) delay += 35;

        schedule(tick, delay);
      };

      schedule(tick, 60);
      return () => {
        cancelled = true;
        if (timeoutId) window.clearTimeout(timeoutId);
      };
    }, [active, text]);

    return displayed;
  }

  function useMarketSnapshot() {
    const [marketSnapshot, setMarketSnapshot] = useState(null);

    const ingest = useCallback((payload) => {
      if (payload?.market_snapshot && typeof payload.market_snapshot === "object") {
        setMarketSnapshot(payload.market_snapshot);
      }
    }, []);

    useEffect(() => {
      let cancelled = false;
      // Each game has its own snapshot file; ChatMarketSnapshot drops one
      // whose stamp does not match the page, so asking for the wrong one
      // would simply show nothing.
      const game = getActiveGame();
      fetch(game === "tf2" ? "get_market_snapshot.php?game=tf2" : "get_market_snapshot.php", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (cancelled || !payload?.success || !payload.snapshot) return;
          setMarketSnapshot(payload.snapshot);
        })
        .catch(() => {
          // Chat replies may still attach a snapshot.
        });
      return () => {
        cancelled = true;
      };
    }, []);

    return [marketSnapshot, ingest];
  }

  const ASK_AI_COMPOSERS = { home: null, mini: null };
  let askAiChipRoot = null;

  function registerAskAiComposer(kind, api) {
    const slot = kind === "home" ? "home" : "mini";
    ASK_AI_COMPOSERS[slot] = api || null;
    ensureAskAiSelectionChip();
    return () => {
      if (ASK_AI_COMPOSERS[slot] === api) ASK_AI_COMPOSERS[slot] = null;
    };
  }

  function useAskAiSelectionComposer(kind, insert) {
    const insertRef = useRef(insert);
    insertRef.current = insert;
    useEffect(() => {
      return registerAskAiComposer(kind, {
        insert: (text) => insertRef.current?.(text),
      });
    }, [kind]);
  }

  function isHomeAskAiVisible() {
    const root = document.querySelector(".home-ai");
    if (!root) return false;
    const style = window.getComputedStyle(root);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return root.getClientRects().length > 0;
  }

  function insertAskAiSelection(text) {
    const value = String(text || "").trim();
    if (!value) return;
    if (isHomeAskAiVisible() && ASK_AI_COMPOSERS.home) {
      ASK_AI_COMPOSERS.home.insert(value);
      return;
    }
    if (ASK_AI_COMPOSERS.mini) {
      ASK_AI_COMPOSERS.mini.insert(value);
      return;
    }
    if (ASK_AI_COMPOSERS.home) ASK_AI_COMPOSERS.home.insert(value);
  }

  function isAskAiIgnoredField(node) {
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    if (!el?.closest) return false;
    if (el.closest(".ask-ai-select-chip")) return false;
    if (el.closest(".home-ai-composer, .cs2-chat-form, .cs2-chat-footer")) return true;
    return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
  }

  function askAiNodeElement(node) {
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement;
  }

  function closestAskAiGeneratedHost(node) {
    const el = askAiNodeElement(node);
    if (!el?.closest) return null;
    const homeText = el.closest(".home-ai-text");
    if (homeText && homeText.closest(".home-ai-row.is-assistant")) return homeText;
    const miniText = el.closest(".cs2-chat-bubble-text");
    if (!miniText) return null;
    const bubble = miniText.closest(".cs2-chat-bubble.is-assistant");
    if (!bubble || bubble.classList.contains("cs2-chat-empty-intro")) return null;
    return miniText;
  }

  function isAskAiRangeInGeneratedText(sel, range) {
    const host = closestAskAiGeneratedHost(range.commonAncestorContainer);
    if (!host) return false;
    if (closestAskAiGeneratedHost(sel.anchorNode) !== host) return false;
    if (closestAskAiGeneratedHost(sel.focusNode) !== host) return false;
    return true;
  }

  function unionAskAiClientRects(rects) {
    if (!rects || !rects.length) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (let i = 0; i < rects.length; i += 1) {
      const box = rects[i];
      if (!box || (box.width === 0 && box.height === 0)) continue;
      left = Math.min(left, box.left);
      top = Math.min(top, box.top);
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom);
    }
    if (!Number.isFinite(left)) return null;
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  }

  function readAskAiSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const text = String(sel.toString() || "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const node = sel.focusNode || sel.anchorNode;
    if (isAskAiIgnoredField(node)) return null;
    const range = sel.getRangeAt(0);
    if (!isAskAiRangeInGeneratedText(sel, range)) return null;
    let rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      rect = unionAskAiClientRects(range.getClientRects());
    }
    if (!rect || (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0)) {
      return null;
    }
    return { text, rect };
  }

  function AskAiSelectionChip() {
    const [chip, setChip] = useState(null);
    const pointerDownRef = useRef(false);

    const syncChip = useCallback(() => {
      const next = readAskAiSelection();
      if (!next) {
        setChip(null);
        return;
      }
      const rect = next.rect;
      const midX = rect.left + (rect.width / 2);
      const midY = rect.top + (rect.height / 2);
      const flipBelow = rect.top < 56;
      const left = Math.max(56, Math.min(midX, window.innerWidth - 56));
      const top = Math.max(16, Math.min(midY, window.innerHeight - 16));
      setChip({ text: next.text, left, top, flipBelow });
    }, []);

    useEffect(() => {
      function onMouseDown(event) {
        pointerDownRef.current = true;
        if (event.target?.closest?.(".ask-ai-select-chip")) return;
        setChip(null);
      }
      function onMouseUp() {
        pointerDownRef.current = false;
        window.setTimeout(syncChip, 0);
      }
      function onSelectionChange() {
        if (pointerDownRef.current) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !String(sel.toString() || "").trim()) {
          setChip(null);
          return;
        }
        syncChip();
      }
      function onCopy() {
        syncChip();
      }
      function onKeyDown(event) {
        if (event.key === "Escape") setChip(null);
      }

      document.addEventListener("mousedown", onMouseDown, true);
      document.addEventListener("mouseup", onMouseUp, true);
      document.addEventListener("selectionchange", onSelectionChange);
      document.addEventListener("copy", onCopy, true);
      document.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("scroll", syncChip, true);
      window.addEventListener("resize", syncChip);
      return () => {
        document.removeEventListener("mousedown", onMouseDown, true);
        document.removeEventListener("mouseup", onMouseUp, true);
        document.removeEventListener("selectionchange", onSelectionChange);
        document.removeEventListener("copy", onCopy, true);
        document.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("scroll", syncChip, true);
        window.removeEventListener("resize", syncChip);
      };
    }, [syncChip]);

    if (!chip) return null;
    return (
      <button
        type="button"
        className={classNames("ask-ai-select-chip", chip.flipBelow && "is-below")}
        style={{ left: chip.left, top: chip.top }}
        aria-label="Ask AI"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const text = chip.text;
          setChip(null);
          try { window.getSelection()?.removeAllRanges(); } catch (_error) { /* ignore */ }
          insertAskAiSelection(text);
        }}
      >
        <span className="ask-ai-select-chip-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="11" height="11">
            <circle cx="7" cy="7" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path d="M10.15 10.15 13.1 13.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </span>
        Ask AI
      </button>
    );
  }

  function ensureAskAiSelectionChip() {
    if (typeof document === "undefined" || askAiChipRoot) return;
    let host = document.getElementById("ask-ai-select-chip-root");
    if (!host) {
      host = document.createElement("div");
      host.id = "ask-ai-select-chip-root";
      document.body.appendChild(host);
    }
    askAiChipRoot = ReactDOM.createRoot(host);
    askAiChipRoot.render(<AskAiSelectionChip />);
  }

  const MINI_CHAT_LEGACY_KEY = "cs2_chat_messages_v2";
  const MINI_CHAT_KEY_PREFIX = "cs2-ask-mark-mini:";
  const MINI_CHAT_PATH_KEY = "cs2-ask-mark-mini-path";

  function miniChatPageId(pageName) {
    const page = String(pageName || getCurrentPageName() || "").split("/").pop();
    return page || "index.html";
  }

  function miniChatStorageKey(pageName) {
    return MINI_CHAT_KEY_PREFIX + miniChatPageId(pageName);
  }

  function readMiniChatPath() {
    try {
      return String(
        window.sessionStorage.getItem(MINI_CHAT_PATH_KEY)
        || window.localStorage.getItem(MINI_CHAT_PATH_KEY)
        || ""
      );
    } catch (_error) {
      return "";
    }
  }

  function writeMiniChatPath(pageName) {
    const pageId = miniChatPageId(pageName);
    try {
      window.sessionStorage.setItem(MINI_CHAT_PATH_KEY, pageId);
      window.localStorage.setItem(MINI_CHAT_PATH_KEY, pageId);
    } catch (_error) {
      // Ignore storage failures.
    }
  }

  function normalizeStoredMiniMessages(saved) {
    if (!Array.isArray(saved)) return [];
    return saved.slice(-20).map((entry) => (
      entry?.role === "assistant"
        ? { ...entry, content: stripMarkMarkdown(entry.content) }
        : entry
    ));
  }

  function clearMiniChatTranscript(pageName) {
    try {
      if (pageName) window.localStorage.removeItem(miniChatStorageKey(pageName));
      window.localStorage.removeItem(MINI_CHAT_LEGACY_KEY);
    } catch (_error) {
      // Ignore storage failures.
    }
  }

  function beginMiniChatOnPage(pageName) {
    const pageId = miniChatPageId(pageName);
    const lastPath = readMiniChatPath();
    const navigated = Boolean(lastPath && lastPath !== pageId);
    if (navigated) {
      clearMiniChatTranscript(lastPath);
      clearMiniChatTranscript(pageId);
    } else {
      clearMiniChatTranscript("");
    }
    writeMiniChatPath(pageId);
    return { pageId, navigated };
  }

  function readMiniChatMessages(pageName, allowRestore) {
    const { pageId, navigated } = beginMiniChatOnPage(pageName);
    if (!allowRestore || navigated) return [];
    try {
      const saved = JSON.parse(window.localStorage.getItem(miniChatStorageKey(pageId)) || "[]");
      return normalizeStoredMiniMessages(saved);
    } catch (_error) {
      return [];
    }
  }

  function ChatWidget() {
    // Subscribed so a language switch re-renders the transcript — the assistant
    // markdown is rebuilt on every render and picks up the new strings.
    // `language` is also a memo dependency for anything built through t().
    const { language } = useI18n();
    // Same widget, different face per game: Mark on CS2, Dell on TF2. Neither
    // name is translated - they are names.
    const game = useActiveGame();
    const isTf2 = game === "tf2";
    const MARK_AVATAR_SRC = isTf2
      ? "assets/ai/dell-avatar.png?v=20260928-0140-dell-torso-1"
      : "assets/ai/mark-avatar.png?v=20260626-mark-transparent-1";
    const askLabel = isTf2 ? "Ask Dell" : "Ask Mark";
    const [currentPageName, setCurrentPageName] = useState(() => getCurrentPageName());
    const currentPageNameRef = useRef(currentPageName);
    currentPageNameRef.current = currentPageName;
    const { authenticated: steamAuthenticated, loading: steamSessionLoading } = useSteamSession();
    const canPersistChatRef = useRef(Boolean(steamAuthenticated));
    canPersistChatRef.current = Boolean(steamAuthenticated);
    const guestResetDoneRef = useRef(false);

    const [open, setOpen] = useState(false);
    const [enabled, setEnabled] = useState(null);
    const [assistantName, setAssistantName] = useState(() => (getActiveGame() === "tf2" ? "Dell" : "Mark"));
    const [marketSnapshot, ingestMarketSnapshot] = useMarketSnapshot();
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [messages, setMessages] = useState(() => {
      try {
        const cached = readCachedSteamSession();
        return readMiniChatMessages(getCurrentPageName(), Boolean(cached?.authenticated));
      } catch (_error) {
        return [];
      }
    });
    const [streamingReply, setStreamingReply] = useState(null);

    const listRef = useRef(null);
    const stickToBottomRef = useRef(true);
    const inputRef = useRef(null);
    const chatRootRef = useRef(null);

    useAskAiSelectionComposer("mini", (text) => {
      setOpen(true);
      setInput(text);
      window.setTimeout(() => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        try {
          inputRef.current?.focus({ preventScroll: true });
        } catch (_error) {
          try { inputRef.current?.focus(); } catch (_inner) { /* ignore */ }
        }
      }, 40);
    });

    const pageGuide = useMemo(
      () => resolveMarkPageGuide(currentPageName, steamAuthenticated),
      [currentPageName, steamAuthenticated]
    );

    const finishStreaming = useCallback(() => {
      setStreamingReply((current) => {
        if (!current?.content) return null;
        setMessages((prev) => prev.concat([{
          role: "assistant",
          content: current.content,
          forecast: current.forecast || null,
          distribution: current.distribution || null,
          price_history: current.price_history || null,
          items: current.items || [],
          inventoryReview: Boolean(current.inventoryReview),
        }]).slice(-20));
        return null;
      });
    }, []);

    const typedReply = useChatTypewriter(
      streamingReply?.content || "",
      Boolean(streamingReply),
      finishStreaming
    );

    const readPageContext = useCallback(() => {
      const params = new URLSearchParams(window.location.search);
      // game routes the turn: tf2AiIsRequest() in the backend takes
      // context.game === "tf2" as the answer, so a TF2 item page never falls
      // through to the CS2 catalogue. TF2 item URLs name the item in ?item=,
      // with the unusual effect in ?e=.
      const tf2 = getActiveGame() === "tf2";
      const tf2Name = tf2
        ? [params.get("e") || "", params.get("item") || ""].map((part) => part.trim()).filter(Boolean).join(" ")
        : "";
      return {
        lang: chatLanguageCode(),
        game: getActiveGame(),
        path: window.location.pathname,
        title: document.title || "",
        item_name: tf2Name || params.get("display_name") || params.get("item_name") || "",
        lookup_name: tf2 ? (params.get("item") || "") : (params.get("lookup_name") || params.get("market_hash_name") || ""),
      };
    }, []);

    const quickPrompts = useMemo(() => {
      const params = Object.fromEntries(new URLSearchParams(window.location.search).entries());
      const ctx = readPageContext();
      return getMarkQuickPrompts(currentPageName, {
        ...ctx,
        params,
      });
    }, [currentPageName, readPageContext, language]);

    const emptyIntro = useMemo(() => {
      const params = Object.fromEntries(new URLSearchParams(window.location.search).entries());
      const ctx = readPageContext();
      return getMarkEmptyIntro(currentPageName, {
        ...ctx,
        params,
      });
    }, [currentPageName, readPageContext, language]);

    useEffect(() => {
      let cancelled = false;
      let attempts = 0;

      const loadStatus = () => {
        attempts += 1;
        fetch("chat.php", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          cache: "no-store",
        })
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) => {
            if (cancelled) return;
            if (!payload || typeof payload !== "object") {
              if (attempts < 3) {
                window.setTimeout(loadStatus, 400 * attempts);
                return;
              }
              setEnabled(false);
              return;
            }
            setEnabled(Boolean(payload.enabled));
            // chat.php reports the CS2 assistant's configured name; on TF2 the
            // answers come from the TF2 persona instead, so the status call
            // must not rename Dell back to Mark.
            if (payload.name && getActiveGame() !== "tf2") {
              setAssistantName(String(payload.name));
            }
            ingestMarketSnapshot(payload);
          })
          .catch(() => {
            if (cancelled) return;
            if (attempts < 3) {
              window.setTimeout(loadStatus, 400 * attempts);
              return;
            }
            setEnabled(false);
          });
      };

      loadStatus();
      return () => {
        cancelled = true;
      };
    }, [ingestMarketSnapshot]);

    useEffect(() => {
      if (!canPersistChatRef.current) return;
      const livePage = getCurrentPageName();
      if (miniChatPageId(currentPageName) !== livePage) return;
      try {
        window.localStorage.setItem(
          miniChatStorageKey(livePage),
          JSON.stringify(messages.slice(-20))
        );
      } catch (_error) {
        // Ignore storage failures.
      }
    }, [messages, currentPageName]);

    useEffect(() => {
      const resetMiniChatForPage = (nextPage) => {
        const prevPage = currentPageNameRef.current;
        if (nextPage === prevPage) return;
        clearMiniChatTranscript(prevPage);
        clearMiniChatTranscript(nextPage);
        writeMiniChatPath(nextPage);
        currentPageNameRef.current = nextPage;
        setCurrentPageName(nextPage);
        setMessages([]);
        setStreamingReply(null);
        setError("");
        setInput("");
      };

      const onSoftNav = () => {
        resetMiniChatForPage(getCurrentPageName());
      };

      window.addEventListener("cs2:soft-nav", onSoftNav);
      return () => window.removeEventListener("cs2:soft-nav", onSoftNav);
    }, []);

    useEffect(() => {
      if (steamSessionLoading) return;

      if (steamAuthenticated) {
        guestResetDoneRef.current = false;
        const pageId = miniChatPageId(currentPageNameRef.current);
        const lastPath = readMiniChatPath();
        if (lastPath && lastPath !== pageId) {
          clearMiniChatTranscript(lastPath);
          clearMiniChatTranscript(pageId);
          writeMiniChatPath(pageId);
          setMessages([]);
          return;
        }
        try {
          const saved = JSON.parse(window.localStorage.getItem(miniChatStorageKey(pageId)) || "[]");
          if (Array.isArray(saved) && saved.length) {
            setMessages(normalizeStoredMiniMessages(saved));
          }
        } catch (_error) {
          // Ignore.
        }
        return;
      }

      if (guestResetDoneRef.current) return;
      guestResetDoneRef.current = true;
      setMessages([]);
      setStreamingReply(null);
      setError("");
      setInput("");
    }, [steamAuthenticated, steamSessionLoading]);

    useEffect(() => {
      if (!open || !listRef.current || !stickToBottomRef.current) {
        return;
      }
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages, open, loading, typedReply, streamingReply]);

    const handleChatScroll = useCallback(() => {
      const el = listRef.current;
      if (!el) return;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 96;
    }, []);

    useEffect(() => {
      if (!open || !inputRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      try {
        inputRef.current.focus({ preventScroll: true });
      } catch (_error) {
        try { inputRef.current.focus(); } catch (_inner) { /* ignore */ }
      }
    }, [open]);

    useEffect(() => {
      if (!open) {
        return undefined;
      }

      function handlePointerDown(event) {
        const root = chatRootRef.current;
        if (!root || root.contains(event.target)) {
          return;
        }
        if (event.target.closest && event.target.closest("[data-mark-item-analysis], [data-inventory-ai-btn], [data-action='analyze-inventory'], .ask-ai-select-chip")) {
          return;
        }
        setOpen(false);
      }

      document.addEventListener("mousedown", handlePointerDown);
      return () => document.removeEventListener("mousedown", handlePointerDown);
    }, [open]);

    const runInventoryMoneyAnalysis = useCallback(async (detail = {}) => {
      // Don't steal focus / open the panel if the user already left this tab.
      if (typeof document !== "undefined" && document.visibilityState !== "hidden") {
        setOpen(true);
      }
      setError("");
      setStreamingReply(null);
      setMessages([]);
      setLoading(true);

      try {
        let snapshot = detail.snapshot || null;
        if (!snapshot?.item_count && typeof window.CS2MarkInventoryBridge?.getSnapshot === "function") {
          snapshot = window.CS2MarkInventoryBridge.getSnapshot();
        }
        // Prefer the priced snapshot already on the inventory page. Only fall back
        // to a short wait when stacks exist but valuations have not landed yet.
        if (snapshot?.item_count && !(snapshot.total_value > 0) && !snapshot.priced_count
          && typeof window.CS2MarkInventoryBridge?.waitForValuation === "function") {
          await window.CS2MarkInventoryBridge.waitForValuation(2500);
          snapshot = window.CS2MarkInventoryBridge.getSnapshot() || snapshot;
        }
        if (!snapshot?.item_count) {
          snapshot = await resolveInventoryGuideSnapshot();
        }

        if (!snapshot?.item_count) {
          setError("Could not load inventory for analysis.");
          return;
        }

        const response = await fetch("chat.php", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [{
              role: "user",
              content: INVENTORY_REVIEW_USER_PROMPT,
            }],
            context: {
              lang: chatLanguageCode(),
              path: window.location.pathname,
              title: document.title || "",
              page_type: "inventory",
              mode: "portfolio",
              inventory: snapshot,
            },
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload || payload.success === false) {
          throw new Error(payload && payload.error ? payload.error : "AI analysis failed.");
        }
        ingestMarketSnapshot(payload);

        const reply = chatReplyFromPayload(payload, [], INVENTORY_REVIEW_USER_PROMPT);
        if (!reply) {
          throw new Error("AI analysis failed.");
        }

        setStreamingReply({ content: reply, inventoryReview: true });
      } catch (requestError) {
        setError(requestError && requestError.message ? requestError.message : "AI analysis failed.");
      } finally {
        setLoading(false);
      }
    }, [ingestMarketSnapshot]);

    useEffect(() => {
      function onInventoryAnalysis(event) {
        runInventoryMoneyAnalysis(event?.detail || {});
      }
      window.addEventListener("cs2:mark-inventory-analysis", onInventoryAnalysis);
      return () => window.removeEventListener("cs2:mark-inventory-analysis", onInventoryAnalysis);
    }, [runInventoryMoneyAnalysis]);

    const runItemAnalysis = useCallback(async (detail = {}) => {
      const itemName = String(detail.itemName || detail.marketHashName || "").trim();
      const wear = String(detail.wear || "").trim();
      const marketHashName = String(detail.marketHashName || itemName).trim();
      if (!itemName) {
        return;
      }

      window.__CS2_PENDING_ITEM_ANALYSIS__ = null;

      const label = wear ? `${itemName} (${wear})` : itemName;
      if (typeof document !== "undefined" && document.visibilityState !== "hidden") {
        setOpen(true);
      }
      setError("");
      setStreamingReply(null);
      setMessages([]);
      setLoading(true);

      try {
        const response = await fetch("chat.php", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [{
              role: "user",
              content: [
                `Run an AI analysis of ${label}.`,
                "Cover current price and liquidity briefly,",
                "then give a clear future outlook for this item (near-term and longer-term): trend, catalysts, risks, and realistic upside/downside in € or %.",
                `Also say whether it is a smart buy to grow a ${getActiveGame() === "tf2" ? "TF2" : "CS2"} portfolio for profit, and name 1-2 similar items to consider next.`,
                "Prefer buy/expand advice over sell advice. Keep it short and concrete.",
              ].join(" "),
            }],
            context: {
              lang: chatLanguageCode(),
              game: getActiveGame(),
              path: window.location.pathname,
              title: document.title || "",
              page_type: "item",
              mode: "item",
              item_name: itemName,
              lookup_name: marketHashName,
              wear,
            },
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload || payload.success === false) {
          throw new Error(payload && payload.error ? payload.error : "AI analysis failed.");
        }
        ingestMarketSnapshot(payload);

        const items = parseChatItems(payload.items);
        const reply = chatReplyFromPayload(payload, items, label);
        if (!reply) {
          throw new Error("AI analysis failed.");
        }

        const forecast = payload.forecast && typeof payload.forecast === "object"
          ? payload.forecast
          : null;
        const distribution = payload.distribution && typeof payload.distribution === "object"
          ? payload.distribution
          : null;
        const priceHistory = payload.price_history && typeof payload.price_history === "object"
          ? payload.price_history
          : null;
        setStreamingReply({
          content: reply,
          forecast,
          distribution,
          price_history: priceHistory,
          items,
        });
      } catch (requestError) {
        setError(requestError && requestError.message ? requestError.message : "AI analysis failed.");
      } finally {
        setLoading(false);
      }
    }, [ingestMarketSnapshot]);

    useEffect(() => {
      function onItemAnalysis(event) {
        const detail = event?.detail || {};
        window.__CS2_PENDING_ITEM_ANALYSIS__ = null;
        runItemAnalysis(detail);
      }
      window.addEventListener("cs2:mark-item-analysis", onItemAnalysis);

      const pending = window.__CS2_PENDING_ITEM_ANALYSIS__;
      if (pending) {
        window.__CS2_PENDING_ITEM_ANALYSIS__ = null;
        runItemAnalysis(pending);
      }

      return () => window.removeEventListener("cs2:mark-item-analysis", onItemAnalysis);
    }, [runItemAnalysis]);

    const handleToggleOpen = useCallback(() => {
      setOpen((current) => !current);
    }, []);

    const sendMessage = useCallback(async (rawText) => {
      const text = String(rawText || "").trim();
      if (!text || loading || streamingReply) {
        return;
      }

      stickToBottomRef.current = true;
      setError("");
      setLoading(true);

      const nextMessages = messages.concat([{ role: "user", content: text }]);
      setMessages(nextMessages);
      setInput("");

      try {
        const response = await fetch("chat.php", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: nextMessages,
            context: readPageContext(),
          }),
        });

        const payload = await response.json().catch(() => ({}));
        const requestFailed = !response.ok || !payload || payload.success === false;
        if (requestFailed && !isChatEmptyReplyFailure(payload, response)) {
          throw new Error(payload && payload.error ? payload.error : "Chat request failed.");
        }
        ingestMarketSnapshot(payload);

        const items = parseChatItems(payload.items);
        const reply = chatReplyFromPayload(payload, items, text);

        const forecast = payload.forecast && typeof payload.forecast === "object"
          ? payload.forecast
          : null;
        const distribution = payload.distribution && typeof payload.distribution === "object"
          ? payload.distribution
          : null;
        const priceHistory = payload.price_history && typeof payload.price_history === "object"
          ? payload.price_history
          : null;
        const assistantMessage = {
          role: "assistant",
          content: reply,
          forecast,
          distribution,
          price_history: priceHistory,
          items,
        };
        // Background tab: save reply without typewriter / focus stealing the user back.
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          setMessages((prev) => prev.concat([assistantMessage]).slice(-20));
          return;
        }
        setStreamingReply({
          content: reply,
          forecast,
          distribution,
          price_history: priceHistory,
          items,
        });
      } catch (requestError) {
        const msg = requestError && requestError.message ? requestError.message : "Chat request failed.";
        if (/empty reply/i.test(msg)) {
          const fallback = synthesizeChatFallbackMarkdown("", [], text);
          setStreamingReply({ content: fallback, forecast: null, distribution: null, price_history: null, items: [] });
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    }, [ingestMarketSnapshot, loading, messages, readPageContext, streamingReply]);

    const clearChat = useCallback(() => {
      setMessages([]);
      setStreamingReply(null);
      setError("");
      clearMiniChatTranscript(currentPageName);
    }, [currentPageName]);

    return (
      <div ref={chatRootRef} className={classNames("cs2-chat", open && "is-open")}>
        {open ? (
          <section className="cs2-chat-panel" aria-label={assistantName}>
            <header className="cs2-chat-header">
              <div className="cs2-chat-brand">
                <span className="cs2-chat-avatar" aria-hidden="true">
                  <img src={MARK_AVATAR_SRC} alt="" />
                </span>
                <div>
                  <strong>{assistantName}</strong>
                  <span>{pageGuide
                    ? `${pageGuide.title} · ${pageGuide.subtitle || "page guide"}`
                    : (isTf2 ? "TF2 prices, items, and site help" : "CS2 prices, skins, and site help")}</span>
                </div>
              </div>
              <div className="cs2-chat-header-actions">
                <button type="button" className="cs2-chat-icon-btn" onClick={clearChat} title="Clear chat">
                  <i className="fa-solid fa-trash-can" aria-hidden="true" />
                </button>
                <button type="button" className="cs2-chat-icon-btn" onClick={() => setOpen(false)} title="Close chat">
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="cs2-chat-messages" ref={listRef} onScroll={handleChatScroll}>
              {!messages.length && !streamingReply && !loading ? (
                <div className="cs2-chat-empty">
                  {enabled === false ? (
                    <p className="cs2-chat-setup">
                      Add an API key in <code>config.local.php</code> to enable live AI replies.
                    </p>
                  ) : null}
                  <div className="cs2-chat-bubble is-assistant cs2-chat-bubble-in cs2-chat-empty-intro">
                    <div className="cs2-chat-bubble-label">{assistantName}</div>
                    <div className="cs2-chat-bubble-text">{emptyIntro}</div>
                  </div>
                  <div className="cs2-chat-quick" role="group" aria-label="Suggested questions">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="cs2-chat-quick-btn"
                        onClick={() => sendMessage(prompt)}
                        disabled={loading || Boolean(streamingReply)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {messages.map((entry, index) => (
                <div
                  key={`${entry.role}-${index}-${String(entry.content || "").slice(0, 24)}`}
                  className={classNames(
                    "cs2-chat-bubble",
                    "cs2-chat-bubble-in",
                    entry.role === "user" ? "is-user" : "is-assistant"
                  )}
                  style={{ animationDelay: `${Math.min(index, 6) * 35}ms` }}
                >
                  <div className="cs2-chat-bubble-label">
                    {entry.role === "user" ? ti("ai_you") : assistantName}
                  </div>
                  <div
                    className="cs2-chat-bubble-text"
                    dangerouslySetInnerHTML={{
                      __html: entry.role === "assistant"
                        ? formatAssistantChatHtml(
                          entry.content,
                          marketSnapshot,
                          entry.items,
                          entry.forecast,
                          index > 0 && messages[index - 1]?.role === "user" ? messages[index - 1].content : "",
                          { inventoryReview: Boolean(entry.inventoryReview) }
                        )
                        : escapeChatHtml(entry.content),
                    }}
                  />
                  {entry.role === "assistant" ? (
                    <ChatAssistantMessageExtras
                      items={entry.items}
                      forecast={entry.forecast}
                      distribution={entry.distribution}
                      priceHistory={entry.price_history}
                      hideItems
                    />
                  ) : null}
                </div>
              ))}

              {streamingReply ? (
                <div className={classNames("cs2-chat-bubble", "is-assistant", "is-streaming", "cs2-chat-bubble-in")}>
                  <div className="cs2-chat-bubble-label">{assistantName}</div>
                  <div
                    className="cs2-chat-bubble-text cs2-chat-bubble-text--live"
                    dangerouslySetInnerHTML={{
                      __html: `${formatAssistantChatHtml(
                        typedReply,
                        marketSnapshot,
                        streamingReply.items,
                        streamingReply.forecast,
                        (messages.slice().reverse().find((row) => row && row.role === "user") || {}).content || "",
                        { inventoryReview: Boolean(streamingReply.inventoryReview) }
                      )}<span class="cs2-chat-type-cursor" aria-hidden="true"></span>`,
                    }}
                  />
                </div>
              ) : null}

              {loading ? (
                <div className="cs2-chat-bubble is-assistant is-typing">
                  <div className="cs2-chat-bubble-label">{assistantName}</div>
                  <div className="cs2-chat-typing" aria-label="Assistant is typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              ) : null}
            </div>

            <footer className="cs2-chat-footer">
              {error ? <div className="cs2-chat-error">{error}</div> : null}

              <form
                className="cs2-chat-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendMessage(input);
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={isTf2 ? "Ask about TF2 items, prices, or site features..." : "Ask about skins, prices, or site features..."}
                  maxLength={1200}
                  aria-label="Chat message"
                />
                <button type="submit" className="cs2-chat-send" disabled={loading || Boolean(streamingReply) || !input.trim()}>
                  <i className="fa-solid fa-paper-plane" aria-hidden="true" />
                </button>
              </form>
            </footer>
          </section>
        ) : null}

        <button
          type="button"
          className="cs2-chat-fab"
          onClick={handleToggleOpen}
          aria-expanded={open ? "true" : "false"}
          aria-label={open ? `Close chat with ${assistantName}` : `Open chat with ${assistantName}`}
        >
          {open ? (
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          ) : (
            <span className="cs2-chat-fab-avatar" aria-hidden="true">
              <img src={MARK_AVATAR_SRC} alt="" />
            </span>
          )}
          <span>{open ? "Close" : askLabel}</span>
        </button>
      </div>
    );
  }

  let chatWidgetRoot = null;
  let navChromeRoot = null;
  let footerChromeRoot = null;
  let pageContentRoot = null;
  let softNavInstalled = false;
  let softNavPending = false;

  function isInfoNoChatPage(href) {
    const page = softNavPageName(href || window.location.href).toLowerCase();
    return page === "about.html" || page === "contact.html";
  }

  // The mini chat lives on item pages only, where it has an item to talk
  // about; everywhere else the questions belong on the AI page. tf2-item.html
  // is the TF2 equivalent, where the widget answers as Dell.
  function isMiniChatPage(pageName) {
    const page = String(pageName || "").toLowerCase();
    return page === "item_page.html"
      || page === "item_page.php"
      || page === "detail.html"
      || page === "tf2-item.html";
  }

  /** Restart footer infoFadeUp by toggling .info-footer-enter (persistent chrome). */
  function replayInfoFooterEnter() {
    const footer = document.querySelector("#cs2-footer-root .site-footer");
    if (!footer) return;
    if (!isInfoNoChatPage()) {
      footer.classList.remove("info-footer-enter");
      return;
    }
    footer.classList.remove("info-footer-enter");
    // Force reflow so the next add restarts the CSS animation.
    void footer.offsetWidth;
    footer.classList.add("info-footer-enter");
  }

  function removePersistentChatWidget() {
    const chatHost = document.getElementById("cs2-chat-root");
    if (!chatHost) {
      chatWidgetRoot = null;
      return;
    }
    if (chatWidgetRoot) {
      try {
        chatWidgetRoot.unmount();
      } catch (_error) {}
      chatWidgetRoot = null;
    }
    chatHost.remove();
  }

  function ensureChatWidget() {
    if (typeof document === "undefined") {
      return;
    }

    // Resolved through pageNameFromPath, not the last path segment: on a clean
    // URL like /rifles/ak-47-redline/ that segment is "", which read as the
    // home page and kept the widget off every page of the site.
    if (!isMiniChatPage(getCurrentPageName())) {
      removePersistentChatWidget();
      return;
    }

    let host = document.getElementById("cs2-chat-root");
    if (!host) {
      host = document.createElement("div");
      host.id = "cs2-chat-root";
      document.body.appendChild(host);
      chatWidgetRoot = null;
    } else {
      host.style.display = "";
    }

    if (!chatWidgetRoot) {
      chatWidgetRoot = ReactDOM.createRoot(host);
      chatWidgetRoot.render(<ChatWidget />);
    }
  }

  function requestItemAnalysis(detail = {}) {
    const payload = detail && typeof detail === "object" ? detail : {};
    window.__CS2_PENDING_ITEM_ANALYSIS__ = payload;
    ensureChatWidget();
    window.dispatchEvent(new CustomEvent("cs2:mark-item-analysis", { detail: payload }));

    // Soft-nav / first-mount race: retry until ChatWidget consumes the pending request.
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (!window.__CS2_PENDING_ITEM_ANALYSIS__ || tries > 12) {
        window.clearInterval(timer);
        return;
      }
      ensureChatWidget();
      window.dispatchEvent(new CustomEvent("cs2:mark-item-analysis", {
        detail: window.__CS2_PENDING_ITEM_ANALYSIS__,
      }));
    }, 50);
  }

  function scriptIdentity(src) {
    try {
      const url = new URL(src, window.location.href);
      return url.pathname.replace(/\\/g, "/").toLowerCase();
    } catch (_error) {
      return String(src || "").split("?")[0].replace(/\\/g, "/").toLowerCase();
    }
  }

  function isSharedRuntimeScript(src) {
    const id = scriptIdentity(src);
    return (
      /\/react(\.production)?\.min\.js$/i.test(id)
      || /\/react-dom(\.production)?\.min\.js$/i.test(id)
      || /\/shared-data\.js$/i.test(id)
      || /\/shared-components(\.build)?\.js$/i.test(id)
    );
  }

  function isPageBundleScript(src) {
    const id = scriptIdentity(src);
    return (
      /\/[a-z0-9_-]+-page(\.build)?\.js$/i.test(id)
      || /\/item-page(\.build)?\.js$/i.test(id)
      || /\/case-pages(\.build)?\.js$/i.test(id)
      || /\/craft-inspect(\.build)?\.js$/i.test(id)
      || /\/auth-pages(\.build)?\.js$/i.test(id)
      || /\/auth-pages\.js$/i.test(id)
    );
  }

  function isScriptAlreadyPresent(src) {
    const id = scriptIdentity(src);
    return Array.from(document.scripts).some((node) => {
      const candidate = node.getAttribute("src") || node.src || "";
      if (!candidate) return false;
      return scriptIdentity(candidate) === id;
    });
  }

  function loadExternalScript(src, attrs = {}) {
    return new Promise((resolve, reject) => {
      if (isScriptAlreadyPresent(src)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      Object.entries(attrs).forEach(([key, value]) => {
        if (value == null || value === false) return;
        script.setAttribute(key, value === true ? "" : String(value));
      });
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.body.appendChild(script);
    });
  }

  async function runPageBundleScript(src) {
    const response = await fetch(src, { credentials: "same-origin", cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Failed to fetch page bundle: ${src}`);
    }
    const code = await response.text();
    document.querySelectorAll("script[data-cs2-soft-page='1']").forEach((node) => node.remove());
    const script = document.createElement("script");
    script.dataset.cs2SoftPage = "1";
    script.textContent = `${code}\n//# sourceURL=${scriptIdentity(src)}`;
    document.body.appendChild(script);
  }

  /**
   * Adds the incoming page's stylesheets to the live head, IN THE INCOMING
   * PAGE'S ORDER. Order is not cosmetic here: several sheets deliberately
   * depend on coming last. wide-screens.css raises the same grid selectors
   * collections.css and roi.css set (`.collections-shell .collections-grid`
   * to six columns above 1500px), and theme.css's light layer is written to
   * win ties the same way - both rely on being later in the document.
   *
   * Appending instead put a freshly loaded collections.css after them, so its
   * base `repeat(5)` tied on specificity and won on source order: /cases/
   * showed five cards per row when soft-navigated to and six after a reload,
   * which is exactly what the visitor reported. Every sheet a soft
   * navigation introduces has this hazard, not just that one.
   *
   * Each missing sheet therefore goes immediately before the first sheet that
   * follows it in the incoming document and is already present here; a sheet
   * with nothing after it is appended, because then last is where it belongs.
   */
  function syncDocumentStyles(doc) {
    const nodeById = new Map();
    Array.from(document.querySelectorAll('link[rel="stylesheet"]')).forEach((node) => {
      const id = scriptIdentity(node.getAttribute("href") || node.href || "");
      if (id && !nodeById.has(id)) nodeById.set(id, node);
    });

    const wanted = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
      .map((node) => {
        const href = node.getAttribute("href") || "";
        return { node, href, id: href ? scriptIdentity(href) : "" };
      })
      .filter((entry) => entry.href && entry.id);

    wanted.forEach((entry, index) => {
      if (nodeById.has(entry.id)) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = entry.href;
      if (entry.node.media) link.media = entry.node.media;

      let anchor = null;
      for (let i = index + 1; i < wanted.length; i += 1) {
        const candidate = nodeById.get(wanted[i].id);
        if (candidate && candidate.parentNode) {
          anchor = candidate;
          break;
        }
      }
      if (anchor) anchor.parentNode.insertBefore(link, anchor);
      else document.head.appendChild(link);
      // Later sheets from this same page can anchor on the one just added.
      nodeById.set(entry.id, link);
    });
  }

  function runInlineBootScripts(doc) {
    // Head first: a generated item page carries window.__ITEM_ROUTE__ there,
    // and item-page reads it the moment its bundle runs. The two guards are
    // page-load fixups that the live document has already applied.
    const inline = [
      ...doc.head.querySelectorAll("script:not([src])"),
      ...doc.body.querySelectorAll("script:not([src])"),
    ];
    inline.forEach((node) => {
      const code = String(node.textContent || "").trim();
      if (!code) return;
      // Data blocks, not code: every page carries application/ld+json in its
      // head, and re-appending one without its type ran it as JavaScript —
      // an uncaught SyntaxError on every soft navigation.
      const type = String(node.getAttribute("type") || "").toLowerCase();
      if (type && !/^(text\/javascript|application\/javascript|module)$/.test(type)) return;
      if (code.includes("csprice-https-guard") || code.includes("csprice-base-guard")) return;
      if (code.includes("scrollRestoration")) return;
      if (code.includes("CS2React") && code.includes("mountPage")) return;
      try {
        const script = document.createElement("script");
        script.dataset.cs2SoftInline = "1";
        script.textContent = code;
        document.body.appendChild(script);
      } catch (_error) {}
    });
  }

  function softNavPageName(href) {
    try {
      return pageNameFromPath(new URL(href, window.location.href).pathname);
    } catch (_error) {
      return "";
    }
  }

  function shouldHardNavigate(href) {
    const page = softNavPageName(href).toLowerCase();
    if (!page) return true;
    if (SOFT_NAV_HARD_PAGES.has(page)) return true;
    if (page.endsWith(".php") && page !== "item_page.php") return true;
    if (page.includes("steam_login") || page.includes("logout")) return true;
    return false;
  }

  // Browser-side crash reporting: a page that dies only in a visitor's browser
  // (other browser/extensions/device) still leaves a trace in
  // logs/client_errors.log on the server. Capped per page load.
  function reportClientError(message, stack, extra) {
    try {
      window.__CS2_ERROR_REPORTS__ = (window.__CS2_ERROR_REPORTS__ || 0) + 1;
      if (window.__CS2_ERROR_REPORTS__ > 5) return;
      const body = JSON.stringify({
        page: getCurrentPageName(),
        url: window.location.href,
        message: String(message || "").slice(0, 600),
        stack: String(stack || "").slice(0, 2500),
        extra: extra ? JSON.stringify(extra).slice(0, 600) : "",
      });
      fetch("log_client_error.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => {});
    } catch (_error) {
      // never let the reporter itself throw
    }
  }

  function installClientErrorReporter() {
    if (typeof window === "undefined" || window.__CS2_ERROR_REPORTER__) return;
    window.__CS2_ERROR_REPORTER__ = true;
    window.addEventListener("error", (event) => {
      const error = event?.error;
      const message = event?.message || (error && error.message) || "";
      if (!message || /ResizeObserver loop/i.test(message)) return;
      reportClientError(message, error && error.stack, {
        type: "error",
        file: event?.filename || "",
        line: event?.lineno || 0,
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event?.reason;
      const message = reason && (reason.message || String(reason));
      if (!message || /Failed to fetch|NetworkError|Load failed|aborted|AbortError/i.test(String(message))) return;
      reportClientError(message, reason && reason.stack, { type: "unhandledrejection" });
    });
  }

  function ensurePersistentChrome() {
    if (typeof document === "undefined") return;
    installClientErrorReporter();
    showCleanUrlInAddressBar();
    if (document.getElementById("site-chrome-root")) {
      window.__CS2_CHROME_MOUNTED__ = true;
      return;
    }

    const pageRoot = document.getElementById("root");
    if (!pageRoot || !pageRoot.parentNode) return;

    if (!document.getElementById("cs2-nav-root")) {
      const navHost = document.createElement("div");
      navHost.id = "cs2-nav-root";
      pageRoot.parentNode.insertBefore(navHost, pageRoot);
      if (!navChromeRoot) {
        navChromeRoot = ReactDOM.createRoot(navHost);
      }
      navChromeRoot.render(<Navbar />);
    }

    if (!document.getElementById("cs2-footer-root")) {
      const footerHost = document.createElement("div");
      footerHost.id = "cs2-footer-root";
      pageRoot.parentNode.insertBefore(footerHost, pageRoot.nextSibling);
      if (!footerChromeRoot) {
        footerChromeRoot = ReactDOM.createRoot(footerHost);
      }
      footerChromeRoot.render(<Footer />);
    }

    window.__CS2_CHROME_MOUNTED__ = true;
    ensureChatWidget();
    if (!window.__MARKET_PRICE_PRELOAD__?.loaded && !window.__MARKET_PRICE_PRELOAD_LOADING__) {
      warmMarketPriceCache();
    }
    installSoftNavigation();
  }

  // TF2 lives on its own host now (tf2price.eu); everything that is not a
  // TF2 page still lives on csprice.eu. Every page there ships an inline
  // click guard that redirects ordinary <a> clicks, but it cannot see a
  // scripted navigation - window.location.assign("index.html?panel=profile")
  // after signup would land on the TF2 home instead of the CS2 profile. This
  // is the same rule for the paths JS drives itself.
  //
  // Deliberately navigation-only: fetches to chat.php, the snapshot endpoint
  // and the gate must stay on whichever host is serving them.
  const CS2_SITE_ORIGIN = "https://csprice.eu";
  const TF2_SITE_ORIGIN = "https://tf2price.eu";

  function isTf2PriceHost(hostname) {
    return /(?:^|\.)tf2price\.eu$/i.test(String(hostname || ""));
  }

  function isCsPriceHost(hostname) {
    return /(?:^|\.)csprice\.eu$/i.test(String(hostname || ""));
  }

  /** The TF2 pages: /tf2, /tf2/..., /tf2.html and /tf2-* - the host's own. */
  function isTf2SitePath(pathname) {
    const path = String(pathname || "").toLowerCase();
    return /^\/tf2(?:$|\/|\.html|-)/.test(path);
  }

  /**
   * Sign-in is per host. A session cookie set on csprice.eu is never sent to
   * tf2price.eu, so a visitor who starts the flow on TF2 has to finish it on
   * TF2 - the peer session made oauthRedirectUri follow the request host, and
   * Steam OpenID already builds return_to from it. These paths are therefore
   * owned by whichever host the visitor is on, and crossSiteHref must leave
   * them where they are instead of handing them to csprice.eu.
   *
   * Matched on the last path segment, not from the root, so it still holds
   * under the local /csgo_price_tracker/ base.
   */
  function isOwnAuthPath(pathname) {
    const last = String(pathname || "").toLowerCase().replace(/\/+$/, "").split("/").pop() || "";
    if (last === "login" || last === "login.html") return true;
    if (last === "auth_email.php") return true;
    return /^(?:steam|google|discord)_(?:login|logout|callback|auth_callback)\.php$/.test(last);
  }

  /**
   * The account panels live in the shared home bundle, so tf2price.eu's own
   * index renders them exactly as csprice.eu does - home-page.jsx accepts
   * profile, watchlist and charts for any host. They are all signed-in views,
   * and a session on tf2price.eu does not exist on csprice.eu, so sending
   * them across lands the visitor on "Profile unavailable. Not signed in."
   * That is exactly what the owner hit on 2026-09-30 from a TF2 item page:
   * the avatar menu took them to csprice.eu/?panel=profile and failed.
   *
   * Both spellings have to match, because the href is written as
   * `index.html?panel=...` but the pages carry <base href="/"> and a soft
   * navigation can normalise it to a bare "/". Every auth flow that is not a
   * plain sign-in also lands here: signup (&verify=notsent), the password
   * reset (&password=ok) and the email-change confirmation (&email=...) -
   * which is why the panel is read from the query, not the whole string.
   */
  const OWN_PANELS = ["profile", "watchlist", "charts"];

  function isOwnPanelUrl(url) {
    try {
      const last = String(url.pathname || "").toLowerCase().replace(/\/+$/, "").split("/").pop() || "";
      if (last !== "" && last !== "index.html") return false;
      return OWN_PANELS.includes(String(url.searchParams.get("panel") || "").toLowerCase());
    } catch (_error) {
      return false;
    }
  }

  /**
   * Sends a navigation target to whichever site owns it. The two hosts split
   * the catalogue: TF2 pages live on tf2price.eu, everything else on
   * csprice.eu, and each still carries the other's links in the shared
   * navbar. csprice.eu redirects its old /tf2 paths, so this only saves the
   * hop - but a redirect costs a round trip and shows the wrong URL first.
   *
   * Anything cross-origin, non-http, or on neither host (localhost) is
   * returned untouched.
   */
  function crossSiteHref(href, hostname, base) {
    const raw = String(href || "");
    const host = hostname === undefined ? (typeof window !== "undefined" ? window.location.hostname : "") : hostname;
    if (!raw || (!isTf2PriceHost(host) && !isCsPriceHost(host))) return raw;
    let url;
    try {
      // document.baseURI, not location.href: these pages carry <base href="/">,
      // so "index.html" on /tf2/melee/ is the site root's index, not a file
      // inside the category folder. Resolving against the location would read
      // it as /tf2/melee/index.html - a TF2 path - and leave it alone.
      url = new URL(raw, base === undefined ? (document.baseURI || window.location.href) : base);
    } catch (_error) {
      return raw;
    }
    if (!/^https?:$/.test(url.protocol)) return raw;
    if (url.hostname.toLowerCase() !== String(host).toLowerCase()) return raw;
    const isTf2Target = isTf2SitePath(url.pathname);
    if (isTf2PriceHost(host)) {
      // The TF2 home is this host's front page: /tf2, /tf2/ and /tf2.html all
      // land on "/" (user, 2026-09-30: "always make me land on the index").
      if (/^\/tf2(?:\/|\.html)?$/i.test(url.pathname)) return "/" + url.search + url.hash;
      if (isTf2Target) return raw;
      // Sign-in and the account panels belong to the host they started on,
      // because a tf2price.eu session does not exist on csprice.eu.
      //
      // These two tests live INSIDE this branch on purpose. Hoisted above it
      // they also caught csprice.eu's own /tf2/login.html, which used to be
      // handed to tf2price.eu and would have started being returned raw - a
      // behaviour change on a host this was meant to leave completely alone.
      // A path can satisfy isTf2SitePath and isOwnAuthPath at once, so the
      // order of these two questions is the whole difference (caught by the
      // other session, 2026-09-30, diffing old against new rather than
      // re-sampling the new one).
      if (isOwnAuthPath(url.pathname)) return raw;
      if (isOwnPanelUrl(url)) return raw;
      return CS2_SITE_ORIGIN + url.pathname + url.search + url.hash;
    }
    if (!isTf2Target) return raw;
    // The TF2 home is tf2price.eu's root: /tf2/ and /tf2.html both collapse
    // to it, which is where csprice.eu's own redirect stubs send them
    // (verified live - both carry <meta http-equiv="refresh"
    // content="0;url=https://tf2price.eu/">). Every other TF2 path keeps its
    // own path, as those stubs do.
    const path = /^\/tf2(?:\/|\.html)?$/i.test(url.pathname) ? "/" : url.pathname;
    return TF2_SITE_ORIGIN + path + url.search + url.hash;
  }

  async function softNavigate(rawHref, { skipPush = false } = {}) {
    const href = crossSiteHref(rawHref);
    if (softNavPending) return;
    if (shouldHardNavigate(href)) {
      window.location.assign(href);
      return;
    }

    const targetUrl = new URL(href, window.location.href);
    if (targetUrl.origin !== window.location.origin) {
      window.location.assign(href);
      return;
    }

    softNavPending = true;
    const pageRoot = document.getElementById("root");
    if (pageRoot) pageRoot.classList.add("cs2-soft-nav-pending");
    // The route of the page we are leaving must not leak into the next one;
    // the target sets its own again if it has one.
    ["__ITEM_ROUTE__", "__CATALOG_ROUTE__", "__CRAFTER_ROUTE__"].forEach((key) => {
      try { delete window[key]; } catch (_error) { window[key] = null; }
    });

    try {
      // Always fetch the source page file (heavy.html), never the folder copy.
      const response = await fetch(htmlFileUrlFor(targetUrl.href), {
        credentials: "same-origin",
        headers: {
          Accept: "text/html",
          "X-CS2-Soft-Nav": "1",
        },
        cache: "no-cache",
      });
      if (!response.ok) {
        throw new Error(`Soft navigation failed (${response.status})`);
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      if (!doc.getElementById("root")) {
        throw new Error("Target page has no #root");
      }

      syncDocumentStyles(doc);
      document.title = doc.title || document.title;
      document.body.className = doc.body.className || "";

      if (!skipPush) {
        // Address bar shows /heavy/ — a real folder on the server (see
        // scripts/build_clean_urls.php), so a reload of that URL works too.
        // response.url is what the fetch actually ended on, so an item link
        // that item_page.php redirected to /skins/awp-dragon-lore/ shows the
        // pretty URL rather than the query string it was clicked from.
        // ...but response.url excludes the fragment by spec, so a link like
        // index.html?panel=profile#inventory lost its #inventory here and the
        // address bar ended on /?panel=profile. Put the clicked target's hash
        // back (measured live 2026-10-03: without this the Inventory entry in
        // the account menu landed on the profile panel with an empty hash).
        let pushUrl = cleanUrlFor(response.url || targetUrl.href);
        if (targetUrl.hash) {
          try {
            const withHash = new URL(pushUrl, window.location.href);
            withHash.hash = targetUrl.hash;
            pushUrl = withHash.href;
          } catch (_error) { /* keep the hashless URL rather than lose the push */ }
        }
        window.history.pushState({ softNav: true }, "", pushUrl);
      }

      const scripts = Array.from(doc.querySelectorAll("script[src]"))
        .map((node) => ({
          src: node.getAttribute("src"),
          crossorigin: node.getAttribute("crossorigin"),
          async: node.hasAttribute("async"),
          defer: node.hasAttribute("defer"),
        }))
        .filter((entry) => entry.src);

      const dependencyScripts = scripts.filter((entry) => (
        !isSharedRuntimeScript(entry.src) && !isPageBundleScript(entry.src)
      ));
      const pageScripts = scripts.filter((entry) => isPageBundleScript(entry.src));

      for (const entry of dependencyScripts) {
        await loadExternalScript(entry.src, {
          crossorigin: entry.crossorigin,
        });
      }

      runInlineBootScripts(doc);

      if (!pageScripts.length) {
        throw new Error("Target page has no page bundle");
      }

      for (const entry of pageScripts) {
        await runPageBundleScript(entry.src);
      }

      const chatHost = document.getElementById("cs2-chat-root");
      if (isMiniChatPage(softNavPageName(targetUrl.href))) {
        if (chatHost) chatHost.style.display = "";
        ensureChatWidget();
      } else {
        removePersistentChatWidget();
      }

      // body.className already synced from the fetched doc (page-about / page-contact).
      // Replay footer enter on About/Contact; clear the class when leaving info pages.
      if (isInfoNoChatPage(targetUrl.href)) {
        requestAnimationFrame(() => {
          requestAnimationFrame(replayInfoFooterEnter);
        });
      } else {
        replayInfoFooterEnter();
      }

      window.dispatchEvent(new CustomEvent("cs2:soft-nav", {
        detail: { href: targetUrl.href },
      }));
    } catch (_error) {
      window.location.assign(targetUrl.href);
    } finally {
      softNavPending = false;
      if (pageRoot) pageRoot.classList.remove("cs2-soft-nav-pending");
    }
  }

  function installSoftNavigation() {
    if (softNavInstalled || typeof document === "undefined") return;
    softNavInstalled = true;

    document.addEventListener("click", (event) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target?.closest?.("a[href]");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.getAttribute("data-soft-nav") === "off") return;

      // In-page anchors ("#top", "#") would resolve against <base> (the site
      // root) and leave the page; keep them on the current URL instead.
      const rawHref = String(anchor.getAttribute("href") || "");
      if (rawHref.startsWith("#")) {
        event.preventDefault();
        const id = rawHref.slice(1);
        const target = id ? (document.getElementById(id) || document.querySelector(`[name="${id}"]`)) : null;
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        try {
          window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${id ? `#${id}` : ""}`);
        } catch (_error) {}
        return;
      }

      let url;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch (_error) {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (url.hash && url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      // Signing out: drop the cached session before the navigation, not after.
      // useSteamSession paints from sessionStorage first and only then asks the
      // server, and that cache lives for five minutes - so on the page
      // steam_logout.php redirects to, the chip came back showing the account
      // that was just signed out (owner, 2026-09-30: "when i log out the
      // profile is still there"). Done here rather than on the link's onClick
      // because there is more than one way out: the navbar menu, the inventory
      // dashboard's Log out button in auth-pages, and the legacy .tsx bar.
      //
      // This does NOT decide whether the visitor is signed in - the fetch that
      // follows on the next page is still the only authority. It only stops a
      // stale cache from being painted as if it were.
      if (/(?:^|\/)[a-z_]*logout[a-z_]*\.php$/i.test(url.pathname)) {
        clearCachedSteamSession();
      }

      const page = pageNameFromPath(url.pathname).toLowerCase();
      const isHtml = /\.html?$/i.test(page) || page === "item_page.php";
      if (!isHtml) return;
      if (shouldHardNavigate(url.href)) return;

      // Logo / home link while already on the home page: a soft navigation to
      // the same page changes nothing visible, so hand it to the home page,
      // which resets to the landing view (new chat) instead.
      const currentPage = getCurrentPageName().toLowerCase();
      const isHomeTarget = page === "index.html";
      const isHomeNow = currentPage === "index.html";
      // The CSPRICE logo always lands on the main landing page, wherever the
      // user is: a full navigation (never soft-nav). On the home page the chat
      // is reset first so the reload opens the landing view, not the thread.
      if (isHomeTarget && anchor.classList.contains("logo")) {
        event.preventDefault();
        // The host serves HTML with max-age=7200, so a plain navigation may
        // reuse a stale cached index.html that still points at older CSS/JS
        // tags (e.g. the previous, fainter home grid). Refresh the cache entry
        // from the network first, then navigate; never wait more than ~1.5s.
        const go = () => window.location.assign(crossSiteHref(url.href));
        const refreshHomeThenGo = () => {
          let done = false;
          const finish = () => { if (!done) { done = true; go(); } };
          const guard = window.setTimeout(finish, 1500);
          try {
            fetch(url.href, { cache: "reload", credentials: "same-origin", headers: { Accept: "text/html" } })
              .catch(() => null)
              .then(() => { window.clearTimeout(guard); finish(); });
          } catch (_error) {
            window.clearTimeout(guard);
            finish();
          }
        };
        if (isHomeNow) {
          window.dispatchEvent(new CustomEvent("cs2:home-reset"));
          window.setTimeout(refreshHomeThenGo, 80);
        } else {
          refreshHomeThenGo();
        }
        return;
      }

      event.preventDefault();
      softNavigate(url.href);
    }, true);

    window.addEventListener("popstate", () => {
      softNavigate(window.location.href, { skipPush: true });
    });
  }

  function Layout({ children }) {
    useEffect(() => {
      ensurePersistentChrome();
      ensureChatWidget();
    }, []);

    if (window.__CS2_CHROME_MOUNTED__ || document.getElementById("site-chrome-root")) {
      return children;
    }

    return (
      <>
        <Navbar />
        {children}
        <Footer />
      </>
    );
  }

  function CollectionCard({ img, alt, name, wrapName = true, animated = false, staggerIndex = 0 }) {
    return (
      <div
        className={classNames("collection-card", animated && "home-collection-card")}
        style={animated ? { "--card-stagger": `${Math.min(staggerIndex, 12) * 40}ms` } : undefined}
      >
        <img src={img} alt={alt || name} loading="lazy" decoding="async" />
        <div className="collection-overlay">
          {wrapName ? <span>{name}</span> : name}
        </div>
      </div>
    );
  }

  function MarketCard({ item }) {
    const isUp = Number(item.change) > 0;
    const href = String(item?.href || "roi.html");
    const external = Boolean(item?.external);

    return (
      <a
        href={href}
        className="market-card home-market-card"
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      >
        <img src={item.img} alt={item.name} loading="lazy" decoding="async" />
        <div className="price-tag">€{Number(item.price).toFixed(2)}</div>
        <div className={classNames("change-tag", isUp ? "change-up" : "change-down")}>
          {isUp ? "\u25b2" : "\u25bc"} {Math.abs(Number(item.change)).toFixed(2)}%
        </div>
        <div className="item-name">{item.name}</div>
        <SparklineCanvas up={isUp} seed={item.sparkSeed || item.name} />
      </a>
    );
  }

  const RARITY_GLOW = {
    covert: "rgba(235, 75, 75, 0.34)",
    classified: "rgba(211, 44, 230, 0.32)",
    restricted: "rgba(136, 71, 255, 0.32)",
    milspec: "rgba(75, 105, 255, 0.3)",
    industrial: "rgba(94, 152, 217, 0.28)",
    consumer: "rgba(176, 195, 217, 0.28)",
  };

  function formatIntroLabel(value) {
    if (typeof data.formatCaseIntroDate === "function") {
      return data.formatCaseIntroDate(value);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || "");
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function ShowcaseCard({
    href,
    image,
    imageAlt,
    accent = "#60a5fa",
    mediaAccent,
    labelLeft,
    labelRight = "",
    title,
    subtitle = "",
    labelRightLoading = false,
    animated = false,
    staggerIndex = 0,
    onImageError,
    footer = null,
    showAccentFoot,
    mediaClassName = "",
  }) {
    const cardStyle = {
      "--card-accent": accent,
      ...(mediaAccent ? { "--card-media-accent": mediaAccent } : {}),
      ...(animated ? { "--card-stagger": `${Math.min(staggerIndex, 12) * 45}ms` } : {}),
    };
    const hasFooter = Boolean(footer);
    const accentFoot = showAccentFoot !== undefined ? showAccentFoot : !hasFooter;

    return (
      <a
        className={classNames(
          "card card-link showcase-card",
          hasFooter && "landing-card",
          animated && "landing-card-visible"
        )}
        href={href}
        style={cardStyle}
      >
        <div className={classNames("card-media", mediaClassName)}>
          <img
            className="card-media-img"
            src={image}
            alt={imageAlt || title}
            loading="lazy"
            decoding="async"
            onError={onImageError}
          />
        </div>

        <div className="card-body">
          <div className="card-top-labels">
            <span className="card-label left">{labelLeft}</span>
            {labelRight ? (
              <span className={classNames("card-label right", labelRightLoading && "loading")}>{labelRight}</span>
            ) : null}
          </div>

          <h3>{title}</h3>
          {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
          {hasFooter ? <div className="card-footer">{footer}</div> : null}
        </div>

        {accentFoot ? <span className="card-accent-foot" aria-hidden="true" /> : null}
      </a>
    );
  }

  function CaseItemCard({ item, collection, caseInfo, variant = "drop", showSubtitle = false, animated = false, staggerIndex = 0 }) {
    const normalPrice = item.normalPriceDisplay || "—";
    const normalRange = item.normalPriceRangeDisplay || "Steam price unavailable";
    const statTrakPrice = item.stattrakPriceDisplay || "—";
    const statTrakRange = item.stattrakPriceRangeDisplay || "Steam price unavailable";
    const steamUrl = item.normalSteamUrl || "https://steamcommunity.com/market/listings/730";
    const detailsUrl = item.detailsUrl || steamUrl;
    const accent = resolveRarityAccent(item);
    const title = `${item.weapon} | ${item.skin}`;
    const subtitle = showSubtitle
      ? (collection?.name || caseInfo?.name || item.category_label || "Weapon Skins")
      : (item.category_label || "Weapon Skins");

    if (variant === "legacy") {
      return (
        <div className={classNames("case-item-card", item.rarity)}>
          <div className="item-top">
            <span className="weapon">{item.weapon}</span>
            <span className={classNames("badge", item.rarity)}>{item.badge}</span>
          </div>
          <h3 className="skin-name">{item.skin}</h3>
          <div className="item-sources">
            <div className="source">
              <img src={collection.img} alt={collection.name} />
              <span>{collection.name}</span>
            </div>
            <div className="source">
              <img src={caseInfo.img} alt={caseInfo.name} />
              <span>{caseInfo.name}</span>
            </div>
          </div>
          <div className="item-image">
            <img src={item.img} alt={item.skin} />
          </div>
          <div className="float-bar">
            <div className="float-gradient" />
            <span>{item.float}</span>
          </div>
          <div className="price-stack">
            <div className="price-row normal">
              <span className="label">Normal</span>
              <span className={classNames("value", item.steamPriceLoading && "loading")}>{normalPrice}</span>
            </div>
            <div className="price-range">{normalRange}</div>
            {item.supportsSouvenir ? (
              <>
                <div className="price-row souvenir">
                  <span className="label">Souvenir</span>
                  <span className={classNames("value", item.steamPriceLoading && "loading")}>{item.souvenirPriceDisplay || "—"}</span>
                </div>
                <div className="price-range">{item.souvenirPriceRangeDisplay || "Steam price unavailable"}</div>
              </>
            ) : (
              <>
                <div className="price-row stattrak">
                  <span className="label">StatTrak{"\u2122"}</span>
                  <span className={classNames("value", item.steamPriceLoading && "loading")}>{statTrakPrice}</span>
                </div>
                <div className="price-range">{statTrakRange}</div>
              </>
            )}
          </div>
          <div className="card-actions">
            <a className="view-btn full" href={detailsUrl}>View Prices &amp; Details {"\u2192"}</a>
            <a className="steam-btn icon-only" href={steamUrl} target="_blank" rel="noreferrer" aria-label="View on Steam">
              <i className="fa-brands fa-steam" />
            </a>
          </div>
        </div>
      );
    }

    return (
      <ShowcaseCard
        href={detailsUrl}
        image={item.img}
        imageAlt={title}
        accent={accent}
        labelLeft={item.type_note || item.badge || item.weapon}
        labelRight={normalPrice}
        title={title}
        subtitle={subtitle}
        labelRightLoading={item.steamPriceLoading}
        animated={animated}
        staggerIndex={staggerIndex}
        mediaClassName={resolveWeaponMediaClass(item)}
      />
    );
  }

  function mountPage(element) {
    const rootNode = document.getElementById("root");
    if (!rootNode) return;
    ensurePersistentChrome();
    if (!pageContentRoot) {
      pageContentRoot = ReactDOM.createRoot(rootNode);
      window.__CS2_PAGE_ROOT__ = pageContentRoot;
    }
    pageContentRoot.render(element);
  }

  // "# 498 skins" metadata pill beside a page title. `label` is the translated
  // "{count} skins" string; the number gets a touch more weight than the unit.
  // No icon by default: the hash that used to sit in front of a count already
  // labelled "items" was noise. A caller can still pass one.
  function CategoryCountBadge({ label, icon = "" }) {
    const text = String(label || "").trim();
    if (!text) return null;
    const match = text.match(/^(.*?)(\d[\d.,  ]*\d|\d)(.*)$/);
    return (
      <span className="collections-head-count">
        {icon ? <i className={icon} aria-hidden="true" /> : null}
        {match ? (
          <>
            {match[1]}
            <strong>{match[2]}</strong>
            {match[3]}
          </>
        ) : text}
      </span>
    );
  }

  window.CS2React = {
    getActiveGame,
    setActiveGame,
    gameHome,
    AvatarEditorModal,
    CategoryCountBadge,
    Layout,
    Footer,
    Navbar,
    useI18n,
    translateTypeNote,
    LanguageSwitcher,
    FeaturedPreview,
    CollectionCard,
    MarketCard,
    CaseItemCard,
    ShowcaseCard,
    ChatForecastChart,
    ChatMarketDistributionChart,
    ChatPriceHistoryChart,
    ChatAssistantCharts,
    ChatAssistantMessageExtras,
    ChatMarketSnapshot,
    ChatMetricsStrip,
    ChatKeyFactorsStrip,
    ChatSentimentStrip,
    prepareChatAssistantSections,
    filterChatReplyPicks,
    deduplicateChatReplyPicks,
    chatPickIdentityKey,
    ensureChatSentiment,
    ChatItemCards,
    parseChatItems,
    splitChatMetrics,
    splitChatMarketOverview,
    formatAssistantChatHtml,
    splitChatKeyFactors,
    synthesizeChatFallbackMarkdown,
    chatMarkdownHasVisibleBody,
    resolveChatAssistantBodyMarkdown,
    chatReplyFromPayload,
    isChatEmptyReplyFailure,
    ensureChatMarketMetrics,
    ensureChatKeyFactors,
    ensureChartJs: ensureChartJs,
    resolveWeaponMediaClass,
    formatIntroLabel,
    SortChipPicker,
    CategoryNavIcon,
    weaponEquipmentIconUrl,
    classNames,
    mountPage,
    softNavigate,
    reportClientError,
    getCurrentPageName,
    pageNameFromPath,
    crossSiteHref,
    syncDocumentStyles,
    cleanUrlFor,
    siteBasePath,
    stripMarkMarkdown,
    formatChatRichText,
    createSparkData,
    warmMarketPriceCache,
    getMarketPricePreload,
    normalizePreloadPriceRecord,
    useSteamSession,
    ensureChatWidget,
    requestItemAnalysis,
    registerAskAiComposer,
    useAskAiSelectionComposer,
    sessionDisplayName,
    sessionAvatarUrl,
    sessionProviderLabel,
    AskAiSelectionChip,
    // Design system: the icon set and the theme switch.
    CSIcon,
    ThemeSegmented,
    ThemeQuickToggle,
    useThemeChoice,
    applyThemeChoice,
    readThemeChoice,
  };

  /* ==========================================================================
     Access gate lock screen
     --------------------------------------------------------------------------
     The site is private (see access_gate.php). Nginx still serves the static
     HTML to anyone, so an unapproved browser would otherwise get the full
     layout with every fetch failing on 403 and no explanation. This asks the
     one endpoint that answers while the gate is closed and, if we are not
     allowed in, replaces the page with a key prompt.

     Deliberately plain DOM and no dependency on React, the i18n bundle or any
     state: it has to work on a page where nothing else was able to load.
     ======================================================================== */
  function mountAccessLockScreen() {
    if (document.getElementById("csprice-gate-lock")) return;

    const overlay = document.createElement("div");
    overlay.id = "csprice-gate-lock";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:2147483646",
      "display:grid", "place-items:center", "padding:24px",
      "background:radial-gradient(circle at 50% 0%, #16203a 0%, #0b0f1a 60%)",
      "color:#e2e8f0",
      "font:15px/1.5 'Segoe UI', Inter, system-ui, sans-serif",
    ].join(";");

    const card = document.createElement("div");
    card.style.cssText = [
      "width:min(420px,100%)", "padding:32px", "text-align:center",
      "border:1px solid rgba(148,163,184,0.18)", "border-radius:18px",
      "background:rgba(15,23,42,0.86)", "box-shadow:0 30px 80px rgba(0,0,0,0.45)",
    ].join(";");

    const title = document.createElement("h1");
    title.textContent = "This site is private";
    title.style.cssText = "margin:0 0 6px;font-size:19px";

    const blurb = document.createElement("p");
    blurb.textContent = "Enter your device key to unlock it on this browser. You only have to do this once.";
    blurb.style.cssText = "margin:0 0 20px;color:#94a3b8;font-size:13.5px";

    const error = document.createElement("div");
    error.style.cssText = [
      "display:none", "margin:0 0 14px", "padding:10px 12px", "border-radius:10px",
      "background:rgba(239,68,68,0.12)", "border:1px solid rgba(239,68,68,0.35)",
      "color:#fca5a5", "font-size:13px",
    ].join(";");

    const form = document.createElement("form");
    form.style.cssText = "display:flex;flex-direction:column;gap:10px";

    const field = document.createElement("input");
    field.type = "password";
    field.placeholder = "Device key";
    field.autocomplete = "off";
    field.spellcheck = false;
    field.style.cssText = [
      "width:100%", "padding:12px 14px", "border-radius:10px",
      "border:1px solid rgba(148,163,184,0.28)", "background:rgba(2,6,23,0.7)",
      "color:#e2e8f0", "font:inherit", "letter-spacing:0.04em",
    ].join(";");

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Unlock";
    submit.style.cssText = [
      "padding:12px 14px", "border:none", "border-radius:10px",
      "background:linear-gradient(135deg,#38bdf8,#6366f1)", "color:#04121f",
      "font:inherit", "font-weight:700", "cursor:pointer",
    ].join(";");

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const key = field.value.trim();
      if (!key) return;
      submit.disabled = true;
      submit.textContent = "Checking…";
      fetch("/gate.php?format=json", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: "key=" + encodeURIComponent(key) + "&from=" + encodeURIComponent(window.location.pathname + window.location.search),
        credentials: "same-origin",
      })
        .then((response) => response.json().catch(() => ({})))
        .then((payload) => {
          if (payload && payload.allowed) {
            window.location.reload();
            return;
          }
          error.textContent = (payload && payload.error) || "That key is not valid, or it has been revoked.";
          error.style.display = "block";
          submit.disabled = false;
          submit.textContent = "Unlock";
          field.select();
        })
        .catch(() => {
          error.textContent = "Could not reach the server. Try again.";
          error.style.display = "block";
          submit.disabled = false;
          submit.textContent = "Unlock";
        });
    });

    form.appendChild(field);
    form.appendChild(submit);
    card.appendChild(title);
    card.appendChild(blurb);
    card.appendChild(error);
    card.appendChild(form);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = "hidden";
    try { field.focus(); } catch (_error) { /* focus is a nicety */ }
  }

  function checkAccessGate() {
    fetch("/access_status.php", { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload || !payload.gate_enabled || payload.allowed) return;
        if (document.body) mountAccessLockScreen();
        else document.addEventListener("DOMContentLoaded", mountAccessLockScreen, { once: true });
      })
      // A network failure is not a reason to lock the user out of a page that
      // may well be working - the PHP gate is the thing that actually enforces.
      .catch(() => {});
  }

  checkAccessGate();
})();

