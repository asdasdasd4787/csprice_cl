(() => {
  (() => {
    const { useDeferredValue, useEffect, useMemo, useRef, useState } = React;
    const { Layout, mountPage, classNames, useI18n, translateTypeNote } = window.CS2React;
    const data = window.CS2ReactData || {};
    const { resolveCaseCatalogEntry, formatCaseIntroDate } = data;
    function resolveCaseReleaseIso(entry) {
      if (typeof resolveCaseCatalogEntry !== "function") return "";
      const hit = resolveCaseCatalogEntry(entry?.display_name, entry?.market_hash_name);
      return String(hit?.intro || "").trim();
    }
    const CATALOG_URL = "catalog_json.php?v=20260917-gz-1";
    const ORIGIN_LOOKUP_URL = "assets/steam-market-cache/skin_origin_lookup.json?v=20260621-origin-1";
    const DEFAULT_VISIBLE_LIMIT = 25;
    const PRICE_REQUEST_TIMEOUT_MS = 8e3;
    const SOURCE_OPTIONS = [
      { id: "steam", label: "Steam Market" },
      { id: "skinport", label: "Skinport" },
      { id: "csfloat", label: "CSFloat" },
      { id: "white_market", label: "White.Market" },
      { id: "dmarket", label: "DMarket" }
    ];
    const RANGE_OPTIONS = [
      { id: "30d", label: "1M" },
      { id: "90d", label: "3M" },
      { id: "1y", label: "1Y" }
    ];
    const SORT_OPTIONS = [
      { id: "rarity_desc", labelKey: "sort_rarity" },
      { id: "price_desc", labelKey: "sort_highestPrice" },
      { id: "listings_desc", labelKey: "sort_mostListings" },
      { id: "name_asc", labelKey: "sort_nameAsc" }
    ];
    const CASES_SORT_OPTIONS = [
      { id: "release_desc", labelKey: "sort_newest" },
      ...SORT_OPTIONS
    ];
    const ITEM_RARITY_RANK_BY_COLOR = {
      E4AE39: 0,
      // Contraband / gold / ★
      EB4B4B: 1,
      // Covert / Extraordinary / Master
      D32CE6: 2,
      // Classified / Exotic / Superior
      "8847FF": 3,
      // Restricted / Remarkable / Exceptional
      "4B69FF": 4,
      // Mil-Spec / High Grade / Distinguished
      "5E98D9": 5,
      // Industrial Grade
      CFB97F: 6,
      FAFAFA: 6,
      DED6CC: 6,
      // Default / off-white
      B0C3D9: 7
      // Consumer / Base Grade
    };
    const ITEM_RARITY_NOTE_RANKS = [
      ["contraband", 0],
      ["extraordinary", 1],
      ["covert", 1],
      ["master", 1],
      ["classified", 2],
      ["exotic", 2],
      ["superior", 2],
      ["restricted", 3],
      ["remarkable", 3],
      ["exceptional", 3],
      ["mil-spec", 4],
      ["mil spec", 4],
      ["high grade", 4],
      ["distinguished", 4],
      ["industrial", 5],
      ["consumer", 6],
      ["base grade", 7],
      ["default", 8]
    ].sort((left, right) => right[0].length - left[0].length);
    function defaultSortForFilters(scopeId, subId) {
      if (scopeId === "armory" || subId === "charms") {
        return "rarity_desc";
      }
      if (subId === "cases") {
        return "release_desc";
      }
      return "price_desc";
    }
    function defaultSortForScope(scopeId) {
      return defaultSortForFilters(scopeId, defaultSubForScope(scopeId));
    }
    function itemRaritySortRank(item) {
      const color = String(item?.name_color || "").replace(/^#/, "").toUpperCase();
      if (Object.prototype.hasOwnProperty.call(ITEM_RARITY_RANK_BY_COLOR, color)) {
        return ITEM_RARITY_RANK_BY_COLOR[color];
      }
      const note = String(item?.type_note || item?.rarity || "").trim().toLowerCase();
      for (const [token, rank] of ITEM_RARITY_NOTE_RANKS) {
        if (note.includes(token)) {
          return rank;
        }
      }
      return 99;
    }
    const SCOPE_TABS = [
      { id: "armory", labelKey: "scope_weapons" },
      { id: "containers", labelKey: "icat_cases" },
      { id: "stickers", labelKey: "icat_stickers" },
      { id: "other", labelKey: "icat_other" }
    ];
    const SUB_FILTERS = {
      containers: [
        { id: "cases", labelKey: "icat_cases" },
        { id: "capsules", labelKey: "icat_capsules" },
        { id: "souvenirs", labelKey: "icat_souvenirs" }
      ],
      stickers: [
        { id: "stickers", labelKey: "icat_stickers" }
      ],
      other: [
        { id: "charms", labelKey: "icat_charms" },
        { id: "operations", labelKey: "icat_passes" },
        { id: "patches", labelKey: "icat_patches" },
        { id: "music", labelKey: "icat_musicKits" },
        { id: "pins", labelKey: "icat_pins" },
        { id: "graffiti", labelKey: "icat_graffiti" },
        { id: "other", labelKey: "icat_other" }
      ],
      armory: [
        { id: "pistols", labelKey: "icat_pistols" },
        { id: "smgs", labelKey: "icat_smgs" },
        { id: "shotguns", labelKey: "icat_shotguns" },
        { id: "lmgs", labelKey: "icat_lmgs" },
        { id: "rifles", labelKey: "icat_rifles" },
        { id: "knives", labelKey: "icat_knives" },
        { id: "gloves", labelKey: "icat_gloves" },
        { id: "agents", labelKey: "icat_agents" }
      ]
    };
    const ALL_TYPE_OPTION = { id: "all", labelKey: "type_all" };
    const CASE_CONTAINER_TYPE_OPTIONS = [
      ALL_TYPE_OPTION,
      { id: "case:cases", labelKey: "icat_cases" },
      { id: "case:packages", labelKey: "type_packages" },
      { id: "case:terminals", labelKey: "type_terminals" },
      { id: "case:special", labelKey: "type_special" }
    ];
    const STICKER_TYPE_OPTIONS = [
      ALL_TYPE_OPTION,
      { id: "sticker:high_grade", labelKey: "type_highGrade" },
      { id: "sticker:remarkable", labelKey: "type_remarkable" },
      { id: "sticker:exotic", labelKey: "type_exotic" },
      { id: "sticker:extraordinary", labelKey: "type_extraordinary" },
      { id: "sticker:contraband", labelKey: "type_contraband" },
      { id: "sticker:default", labelKey: "type_default" }
    ];
    const CHARM_TYPE_OPTIONS = [
      ALL_TYPE_OPTION,
      { id: "charm:charms", labelKey: "icat_charms" },
      { id: "charm:slabs", labelKey: "type_stickerSlabs" },
      { id: "charm:tournament", labelKey: "type_tournament" },
      { id: "charm:highlights", labelKey: "type_highlights" }
    ];
    const CAPSULE_TYPE_OPTIONS = [
      ALL_TYPE_OPTION,
      { id: "capsule:capsules", labelKey: "icat_capsules" },
      { id: "capsule:autographs", labelKey: "type_autographs" },
      { id: "capsule:collections", labelKey: "type_collections" }
    ];
    const SOUVENIR_TYPE_OPTIONS = [
      ALL_TYPE_OPTION,
      { id: "souvenir:packages", labelKey: "type_packages" },
      { id: "souvenir:highlights", labelKey: "type_highlightPackages" }
    ];
    const GRAFFITI_TYPE_OPTIONS = [
      ALL_TYPE_OPTION,
      { id: "graffiti:base", labelKey: "type_baseGrade" },
      { id: "graffiti:high_grade", labelKey: "type_highGrade" },
      { id: "graffiti:remarkable", labelKey: "type_remarkable" },
      { id: "graffiti:exotic", labelKey: "type_exotic" }
    ];
    const PATCH_TYPE_OPTIONS = [
      ALL_TYPE_OPTION,
      { id: "patch:high_grade", labelKey: "type_highGrade" },
      { id: "patch:remarkable", labelKey: "type_remarkable" },
      { id: "patch:exotic", labelKey: "type_exotic" },
      { id: "patch:collections", labelKey: "type_collections" }
    ];
    const MUSIC_TYPE_OPTIONS = [
      ALL_TYPE_OPTION,
      { id: "music:kits", labelKey: "icat_musicKits" },
      { id: "music:boxes", labelKey: "type_boxes" }
    ];
    const OPERATIONS_TYPE_OPTIONS = [
      ALL_TYPE_OPTION,
      { id: "ops:passes", labelKey: "type_viewerPasses" },
      { id: "ops:stars", labelKey: "type_operationStars" }
    ];
    const OTHER_TYPE_OPTIONS = [
      ALL_TYPE_OPTION,
      { id: "other:keys", labelKey: "type_caseKeys" },
      { id: "other:medals", labelKey: "type_medals" }
    ];
    function optionLabel(option, t) {
      if (!option) return "";
      return option.labelKey ? t(option.labelKey) : String(option.label || "");
    }
    function normalize(text) {
      return String(text || "").toLowerCase();
    }
    function buildSteamUrl(marketHashName) {
      return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
    }
    function stripWear(name) {
      return String(name || "").replace(/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "").trim();
    }
    function stripItemNamePrefixes(name) {
      let next = String(name || "").trim();
      for (let i = 0; i < 4; i += 1) {
        const stripped = next.replace(/^★\s*/u, "").replace(/^(?:StatTrak™|StatTrak|Souvenir)\s+/iu, "").trim();
        if (stripped === next) break;
        next = stripped;
      }
      return next;
    }
    function extractWeaponModelLabel(entryOrName) {
      const raw = typeof entryOrName === "string" ? entryOrName : entryOrName?.display_name || entryOrName?.market_hash_name || "";
      const stripped = stripItemNamePrefixes(stripWear(raw));
      if (!stripped) return "";
      return stripped.includes("|") ? stripped.split("|")[0].trim() : stripped;
    }
    function weaponModelTypeId(label) {
      const cleaned = String(label || "").trim();
      if (!cleaned) return "";
      return `model:${normalize(cleaned)}`;
    }
    function deriveWeaponModelId(entry) {
      return weaponModelTypeId(extractWeaponModelLabel(entry));
    }
    function resolveOriginName(entry, lookup) {
      const direct = String(entry?.origin_name || "").trim();
      if (direct) {
        return direct;
      }
      const baseName = stripWear(entry?.display_name || entry?.market_hash_name || "");
      return String(lookup?.[normalize(baseName)] || "").trim();
    }
    function showsOriginLabel(category) {
      return category === "skins" || category === "knives" || category === "gloves";
    }
    function buildInternalItemHref(entry) {
      const marketHashName = String(entry && entry.market_hash_name ? entry.market_hash_name : "").trim();
      const displayName = String(entry && entry.display_name ? entry.display_name : stripWear(marketHashName)).trim();
      const baseName = stripWear(displayName || marketHashName);
      const lookupName = baseName || marketHashName;
      if (!lookupName) {
        return "";
      }
      const params = new URLSearchParams({
        lookup_name: lookupName,
        display_name: baseName || displayName,
        market_hash_name: lookupName,
        image: String(entry.image || ""),
        market_url: buildSteamUrl(lookupName),
        type: String(entry.type_note || ""),
        category: String(entry.category_label || entry.category || ""),
        type_filter: String(entry.type_filter || entry.category || ""),
        color: String(entry.name_color || "B0C3D9")
      });
      if (itemNameUsesWearParam(baseName || lookupName)) {
        params.set("selected_wear", "Field-Tested");
      }
      return `item_page.php?${params.toString()}`;
    }
    function buildProjectFallbackCatalog() {
      const catalogMap = /* @__PURE__ */ new Map();
      const pushEntry = (entry) => {
        const marketHashName = String(entry && entry.market_hash_name ? entry.market_hash_name : "").trim();
        if (!marketHashName || catalogMap.has(marketHashName)) {
          return;
        }
        catalogMap.set(marketHashName, {
          market_hash_name: marketHashName,
          display_name: stripWear(marketHashName),
          selected_wear: "",
          image: String(entry.image || ""),
          category: String(entry.category || "cases"),
          category_label: String(entry.category_label || "Cases"),
          type_note: String(entry.type_note || "Counter-Strike item"),
          name_color: String(entry.name_color || "B0C3D9"),
          type_filter: String(entry.type_filter || "cases"),
          scope_filter: String(entry.scope_filter || "cases"),
          sub_filter: String(entry.sub_filter || "cases")
        });
      };
      (Array.isArray(data.navCases) ? data.navCases : []).forEach((item) => {
        pushEntry({
          market_hash_name: item.name,
          image: item.img,
          category: "cases",
          category_label: "Cases",
          type_note: "Weapon case",
          type_filter: "cases",
          scope_filter: "cases",
          sub_filter: "cases"
        });
      });
      return Array.from(catalogMap.values()).sort((left, right) => left.market_hash_name.localeCompare(right.market_hash_name));
    }
    function sortRecords(records, sortBy) {
      const rows = [...records];
      const compareDesc = (leftValue, rightValue) => {
        const leftSafe = Number.isFinite(leftValue) ? leftValue : -Infinity;
        const rightSafe = Number.isFinite(rightValue) ? rightValue : -Infinity;
        if (leftSafe === rightSafe) {
          return 0;
        }
        return rightSafe > leftSafe ? 1 : -1;
      };
      rows.sort((left, right) => {
        const leftPrice = Number(left && left.current_price);
        const rightPrice = Number(right && right.current_price);
        const leftListings = Number(left && left.listings);
        const rightListings = Number(right && right.listings);
        const leftName = String(left && (left.display_name || left.market_hash_name) || "");
        const rightName = String(right && (right.display_name || right.market_hash_name) || "");
        const leftModel = String(left && left.weapon_model || extractWeaponModelLabel(leftName));
        const rightModel = String(right && right.weapon_model || extractWeaponModelLabel(rightName));
        switch (sortBy) {
          case "release_desc": {
            const leftTime = Date.parse(String(left && left.release_iso) || "");
            const rightTime = Date.parse(String(right && right.release_iso) || "");
            return compareDesc(leftTime, rightTime) || leftModel.localeCompare(rightModel) || leftName.localeCompare(rightName);
          }
          case "rarity_desc": {
            const rarityDiff = itemRaritySortRank(left) - itemRaritySortRank(right);
            if (rarityDiff !== 0) {
              return rarityDiff;
            }
            return compareDesc(leftPrice, rightPrice) || leftModel.localeCompare(rightModel) || leftName.localeCompare(rightName);
          }
          case "listings_desc":
            return compareDesc(leftListings, rightListings) || leftModel.localeCompare(rightModel) || leftName.localeCompare(rightName);
          case "name_asc":
            return leftName.localeCompare(rightName);
          case "price_desc":
          default:
            return compareDesc(leftPrice, rightPrice) || leftModel.localeCompare(rightModel) || leftName.localeCompare(rightName);
        }
      });
      return rows;
    }
    function currentSourceLabel(sourceId) {
      return SOURCE_OPTIONS.find((item) => item.id === sourceId)?.label || "Steam Market";
    }
    function formatCompactPrice(value) {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? `€${number.toFixed(2)}` : "-";
    }
    function catalogSeedPrice(entry) {
      const price = Number(entry && entry.seed_sell_price);
      return Number.isFinite(price) && price > 0 ? price : null;
    }
    function recordHasDisplayPrice(record) {
      const price = Number(record && record.current_price);
      if (Number.isFinite(price) && price > 0) {
        return true;
      }
      const text = String(record && record.current_price_display || "").trim();
      return text !== "" && text !== "-" && text !== "—";
    }
    function buildSourceRequest(sourceId, rangeId, marketHashNames) {
      const source = String(sourceId || "steam");
      const names = Array.isArray(marketHashNames) ? marketHashNames.filter(Boolean) : [];
      if (source === "csfloat") {
        return {
          url: "get_csfloat_prices.php",
          body: {
            market_hash_names: names,
            cache_only: true,
            ignore_auctions: true,
            require_verified_buy_now: true,
            skip_history: true
          }
        };
      }
      if (source === "white_market") {
        return {
          url: "get_white_market_prices.php",
          body: { market_hash_names: names, cache_only: true, skip_history: true }
        };
      }
      if (source === "dmarket") {
        return {
          url: "get_dmarket_prices.php",
          body: {
            market_hash_names: names,
            cache_only: true,
            max_live_requests: 0,
            skip_history: true
          }
        };
      }
      return {
        url: "get_roi_prices_cached.php",
        body: {
          source,
          range: rangeId,
          market_hash_names: names,
          explorer_fast: true,
          skip_live_listings: true,
          cache_only: true,
          allow_live_refresh: false,
          steam_listing_fallback: false,
          steam_listing_fallback_limit: 0,
          prefer_live: false,
          ...source === "steam" ? { steam_catalog_only: true } : source === "skinport" ? { skip_catalog_fallback: false } : {}
        }
      };
    }
    function rowsFromPayload(payload, sourceId, rangeId) {
      const sourceLabel = currentSourceLabel(sourceId);
      const rangeLabel = RANGE_OPTIONS.find((item) => item.id === rangeId)?.label || "1Y";
      const rows = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.cases) ? payload.cases : [];
      return rows.map((row) => {
        const price = Number(row && row.current_price);
        return {
          ...row,
          source: row?.source || sourceId,
          source_label: row?.source_label || sourceLabel,
          range_used: row?.range_used || rangeLabel,
          current_price: Number.isFinite(price) ? price : null,
          current_price_display: row?.current_price_display || formatCompactPrice(price)
        };
      });
    }
    function roiTone(record) {
      const roi = Number(record?.roi_pct);
      if (!Number.isFinite(roi)) {
        return "flat";
      }
      if (roi > 0) {
        return "up";
      }
      if (roi < 0) {
        return "down";
      }
      return "flat";
    }
    function formatListingsBadge(record, tp) {
      const count = Number(record?.listings);
      if (Number.isFinite(count)) {
        return tp("roi_listings", count);
      }
      const raw = String(record?.listings_display || "").trim();
      if (!raw || raw === "-" || raw === "—") {
        return "";
      }
      if (/cache/i.test(raw)) {
        return "";
      }
      const parsed = Number(raw.replace(/,/g, ""));
      if (Number.isFinite(parsed)) {
        return tp("roi_listings", parsed);
      }
      if (/listing/i.test(raw)) {
        return "";
      }
      return raw;
    }
    function cardGlow(category, nameColor, subFilter) {
      const cat = String(category || "").toLowerCase();
      const sub = String(subFilter || "").toLowerCase();
      const noRarityGlowSubs = /* @__PURE__ */ new Set(["cases", "capsules", "souvenirs", "operations", "other"]);
      if (noRarityGlowSubs.has(sub) || cat === "cases" || cat === "containers") {
        return "transparent";
      }
      const hex = String(nameColor || "").replace(/[^a-fA-F0-9]/g, "").slice(0, 6);
      if (hex.length === 6) {
        const red = Number.parseInt(hex.slice(0, 2), 16);
        const green = Number.parseInt(hex.slice(2, 4), 16);
        const blue = Number.parseInt(hex.slice(4, 6), 16);
        return `rgba(${red}, ${green}, ${blue}, 0.34)`;
      }
      switch (cat) {
        case "stickers":
          return "rgba(168, 85, 247, 0.32)";
        case "agents":
          return "rgba(14, 165, 233, 0.32)";
        default:
          return "rgba(176, 195, 217, 0.28)";
      }
    }
    function placeholderText(label) {
      return String(label || "CS").split(/[\s|]+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "CS";
    }
    function RoiPlaceholder({ label }) {
      return /* @__PURE__ */ React.createElement("div", { className: "roi-placeholder" }, /* @__PURE__ */ React.createElement("span", null, placeholderText(label)));
    }
    function Sparkline({ values, positive, delay, micro = false }) {
      const series = Array.isArray(values) ? values.filter((value) => Number.isFinite(Number(value))).map(Number) : [];
      if (series.length < 2) {
        return micro ? null : /* @__PURE__ */ React.createElement("div", { className: "roi-sparkline-empty" });
      }
      const width = 160;
      const height = micro ? 32 : 54;
      const min = Math.min(...series);
      const max = Math.max(...series);
      const range = max - min || 1;
      const points = series.map((value, index) => {
        const x = Number((index / Math.max(1, series.length - 1) * width).toFixed(2));
        const y = Number((height - (value - min) / range * height).toFixed(2));
        return { x, y };
      });
      const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
      const area = `${line} L ${width} ${height} L 0 ${height} Z`;
      const cls = micro ? "roi-sparkline-micro" : "roi-sparkline";
      return /* @__PURE__ */ React.createElement("svg", { className: cls, viewBox: `0 0 160 ${height}`, preserveAspectRatio: "none", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          d: area,
          className: "roi-sparkline-area",
          fill: positive ? "rgba(34,197,94,0.14)" : "rgba(239,68,68,0.14)",
          style: { "--spark-delay": `${delay}ms` }
        }
      ), /* @__PURE__ */ React.createElement(
        "path",
        {
          d: line,
          pathLength: "100",
          className: classNames("roi-sparkline-line", positive ? "positive" : "negative"),
          fill: "none",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          style: { "--spark-delay": `${delay}ms` }
        }
      ));
    }
    function sourceTrend(arr) {
      if (!Array.isArray(arr) || arr.length < 2) return true;
      return Number(arr[arr.length - 1]) >= Number(arr[0]);
    }
    function deriveTypeFilter(entry) {
      return String(entry && entry.type_filter ? entry.type_filter : "all");
    }
    function deriveScopeFilter(entry) {
      const typeId = deriveTypeFilter(entry);
      const armoryTypes = /* @__PURE__ */ new Set(["skins", "agents"]);
      const fallbackScope = armoryTypes.has(typeId) ? "armory" : "cases";
      return String(entry && entry.scope_filter ? entry.scope_filter : fallbackScope);
    }
    const SUB_TO_UI_SCOPE = /* @__PURE__ */ new Map([
      ["cases", "containers"],
      ["capsules", "containers"],
      ["autographs", "containers"],
      ["souvenirs", "containers"],
      ["stickers", "stickers"]
    ]);
    function defaultSubForScope(scopeId) {
      return (SUB_FILTERS[scopeId] || SUB_FILTERS.containers)[0].id;
    }
    function uiScopeOf(entry) {
      if (deriveScopeFilter(entry) === "armory") return "armory";
      return SUB_TO_UI_SCOPE.get(deriveSubFilter(entry)) || "other";
    }
    function deriveSubFilter(entry) {
      const typeId = deriveTypeFilter(entry);
      const fallbackSub = typeId === "agents" ? "agents" : typeId === "skins" ? "pistols" : typeId || "cases";
      const raw = String(entry && entry.sub_filter ? entry.sub_filter : fallbackSub).trim().toLowerCase();
      if (raw === "heavy") return "lmgs";
      if (raw === "autographs") return "capsules";
      return raw || fallbackSub;
    }
    function typeOptionsForContext(scopeId, subId) {
      if (scopeId === "armory") {
        return [ALL_TYPE_OPTION];
      }
      switch (subId) {
        case "cases":
          return CASE_CONTAINER_TYPE_OPTIONS;
        case "stickers":
          return STICKER_TYPE_OPTIONS;
        case "charms":
          return CHARM_TYPE_OPTIONS;
        case "capsules":
          return CAPSULE_TYPE_OPTIONS;
        case "souvenirs":
          return SOUVENIR_TYPE_OPTIONS;
        case "graffiti":
          return GRAFFITI_TYPE_OPTIONS;
        case "patches":
          return PATCH_TYPE_OPTIONS;
        case "music":
          return MUSIC_TYPE_OPTIONS;
        case "operations":
          return OPERATIONS_TYPE_OPTIONS;
        case "other":
          return OTHER_TYPE_OPTIONS;
        case "pins":
        default:
          return [ALL_TYPE_OPTION];
      }
    }
    function deriveCaseContainerKind(entry) {
      const name = String(entry?.market_hash_name || entry?.display_name || "");
      if (/\bterminal\b/i.test(name)) return "terminals";
      if (/\b(package|parcel)\b/i.test(name)) return "packages";
      if (/\bcase\b/i.test(name)) return "cases";
      return "special";
    }
    function deriveStickerGradeId(entry) {
      const note = String(entry?.type_note || "");
      if (/contraband/i.test(note)) return "contraband";
      if (/extraordinary/i.test(note)) return "extraordinary";
      if (/exotic/i.test(note)) return "exotic";
      if (/remarkable/i.test(note)) return "remarkable";
      if (/high\s*grade/i.test(note)) return "high_grade";
      if (/default/i.test(note)) return "default";
      return "";
    }
    function deriveCharmKind(entry) {
      const name = String(entry?.market_hash_name || entry?.display_name || "").trim();
      const note = String(entry?.type_note || charmTypeNote(entry) || "");
      if (isStickerSlabName(name) || /sticker\s*slab/i.test(note)) return "slabs";
      if (/highlight/i.test(note) || /highlight/i.test(name)) return "highlights";
      if (/tournament/i.test(note) || /^Souvenir Charm\s*\|/i.test(name)) return "tournament";
      return "charms";
    }
    function deriveCapsuleKind(entry) {
      const name = String(entry?.market_hash_name || entry?.display_name || "");
      const note = String(entry?.type_note || "");
      if (/sticker\s*collection/i.test(name) || /sticker\s*collection/i.test(note)) return "collections";
      if (/autograph/i.test(name) || /\b(challengers?|legends?|contenders?|champions?)\b/i.test(name)) {
        return "autographs";
      }
      return "capsules";
    }
    function deriveSouvenirKind(entry) {
      const name = String(entry?.market_hash_name || entry?.display_name || "");
      if (/\bhighlight\b/i.test(name) || /highlight/i.test(String(entry?.type_note || ""))) {
        return "highlights";
      }
      if (/\b(package|parcel)\b/i.test(name)) return "packages";
      return "";
    }
    function deriveGraffitiGradeId(entry) {
      const note = String(entry?.type_note || "");
      if (/exotic/i.test(note)) return "exotic";
      if (/remarkable/i.test(note)) return "remarkable";
      if (/high\s*grade/i.test(note)) return "high_grade";
      if (/base\s*grade/i.test(note)) return "base";
      return "";
    }
    function derivePatchKind(entry) {
      const name = String(entry?.market_hash_name || entry?.display_name || "");
      const note = String(entry?.type_note || "");
      if (/collection|pack/i.test(name) || /patch\s*collection/i.test(note)) return "collections";
      if (/exotic/i.test(note)) return "exotic";
      if (/remarkable/i.test(note)) return "remarkable";
      if (/high\s*grade/i.test(note)) return "high_grade";
      return "";
    }
    function deriveMusicKind(entry) {
      const name = String(entry?.market_hash_name || entry?.display_name || "");
      const note = String(entry?.type_note || "");
      if (/\bbox\b/i.test(name) || /base\s*grade/i.test(note) && !/^Music Kit\s*\|/i.test(name)) {
        return "boxes";
      }
      return "kits";
    }
    function deriveOperationsKind(entry) {
      const note = String(entry?.type_note || "");
      if (/operation\s*star/i.test(note) || /\dstars?\s+for\s+operation/i.test(String(entry?.market_hash_name || ""))) {
        return "stars";
      }
      if (/viewer\s*pass/i.test(note) || /viewer\s*pass/i.test(String(entry?.market_hash_name || ""))) {
        return "passes";
      }
      return "";
    }
    function deriveOtherKind(entry) {
      if (isCaseKeyEntry(entry)) return "keys";
      const note = String(entry?.type_note || "");
      const name = String(entry?.market_hash_name || "");
      if (/medal/i.test(note) || /medal/i.test(name)) return "medals";
      return "";
    }
    function deriveSpecificTypeId(entry, scopeId, subId) {
      if (scopeId === "armory") {
        return deriveWeaponModelId(entry);
      }
      switch (subId) {
        case "cases":
          return `case:${deriveCaseContainerKind(entry)}`;
        case "stickers": {
          const grade = deriveStickerGradeId(entry);
          return grade ? `sticker:${grade}` : "";
        }
        case "charms":
          return `charm:${deriveCharmKind(entry)}`;
        case "capsules":
          return `capsule:${deriveCapsuleKind(entry)}`;
        case "souvenirs": {
          const kind = deriveSouvenirKind(entry);
          return kind ? `souvenir:${kind}` : "";
        }
        case "graffiti": {
          const grade = deriveGraffitiGradeId(entry);
          return grade ? `graffiti:${grade}` : "";
        }
        case "patches": {
          const kind = derivePatchKind(entry);
          return kind ? `patch:${kind}` : "";
        }
        case "music":
          return `music:${deriveMusicKind(entry)}`;
        case "operations": {
          const kind = deriveOperationsKind(entry);
          return kind ? `ops:${kind}` : "";
        }
        case "other": {
          const kind = deriveOtherKind(entry);
          return kind ? `other:${kind}` : "";
        }
        default:
          return "";
      }
    }
    function entryMatchesTypeFilter(entry, typeId, scopeId, subId) {
      if (!typeId || typeId === "all") return true;
      return deriveSpecificTypeId(entry, scopeId, subId) === typeId;
    }
    function isKnifeCatalogEntry(entry) {
      const subFilter = String(entry?.sub_filter || "").toLowerCase();
      const category = String(entry?.category || "").toLowerCase();
      return subFilter === "knives" || category === "knives";
    }
    function catalogEntryHasImage(entry) {
      return catalogImageCandidates(entry).length > 0;
    }
    function isFragilePanoramaImageUrl(url) {
      return /raw\.githubusercontent\.com\/ByMykel\/counter-strike-image-tracker/i.test(String(url || ""));
    }
    function rewriteFragilePanoramaImageUrl(url) {
      const raw = String(url || "").trim();
      if (!isFragilePanoramaImageUrl(raw)) {
        return "";
      }
      const generated = raw.match(/\/panorama\/images\/econ\/default_generated\/([^/?#]+)/i);
      if (generated) {
        return `https://cdn.csroi.com/default_generated/${generated[1]}`;
      }
      const weaponCase = raw.match(/\/panorama\/images\/econ\/weapon_cases\/([^/?#]+)/i);
      if (weaponCase) {
        return `https://cdn.csroi.com/weapon_cases/${weaponCase[1]}`;
      }
      return "";
    }
    function steamApisItemImageUrl(marketHashName) {
      const name = String(marketHashName || "").trim();
      if (!name) {
        return "";
      }
      return `https://api.steamapis.com/image/item/730/${encodeURIComponent(name)}`;
    }
    function catalogImageCandidates(entry) {
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      const push = (value) => {
        const src = String(value || "").trim();
        if (!src || seen.has(src)) {
          return;
        }
        seen.add(src);
        out.push(src);
      };
      const rawValues = [
        entry?.image,
        entry?.local_path,
        entry?.project_image_path,
        entry?.steam_image_url
      ];
      rawValues.forEach((value) => {
        const src = String(value || "").trim();
        if (!src || isFragilePanoramaImageUrl(src)) {
          return;
        }
        push(src);
      });
      rawValues.forEach((value) => {
        const rewritten = rewriteFragilePanoramaImageUrl(value);
        if (rewritten) {
          push(rewritten);
        }
      });
      push(steamApisItemImageUrl(entry?.market_hash_name));
      return out;
    }
    function catalogRowForSort(entry) {
      return {
        ...entry,
        display_name: entry.display_name || stripWear(entry.market_hash_name),
        weapon_model: extractWeaponModelLabel(entry),
        current_price: Number(entry.seed_sell_price),
        listings: Number(entry.seed_sell_listings)
      };
    }
    function RoiMarketCardImage({ candidates, alt }) {
      const list = useMemo(
        () => Array.isArray(candidates) ? candidates.map((value) => String(value || "").trim()).filter(Boolean) : [],
        [candidates]
      );
      const [index, setIndex] = useState(0);
      const src = list[index] || "";
      useEffect(() => {
        setIndex(0);
      }, [alt, list]);
      if (!src) {
        return /* @__PURE__ */ React.createElement(RoiPlaceholder, { label: alt });
      }
      return /* @__PURE__ */ React.createElement(
        "img",
        {
          src,
          alt,
          loading: "lazy",
          decoding: "async",
          onError: () => {
            setIndex((prev) => prev + 1 < list.length ? prev + 1 : list.length);
          }
        }
      );
    }
    function holoFoilNameAliases(name) {
      const normalized = String(name || "").trim();
      if (!normalized) {
        return [];
      }
      const aliases = [normalized];
      if (/\(Holo-Foil\)/i.test(normalized)) {
        aliases.push(normalized.replace(/\(Holo-Foil\)/gi, "(Holo/Foil)"));
      }
      if (/\(Holo\/Foil\)/i.test(normalized)) {
        aliases.push(normalized.replace(/\(Holo\/Foil\)/gi, "(Holo-Foil)"));
      }
      return aliases;
    }
    function resolveStickerCapsuleFallbackImage(name) {
      const stickerGroups = Array.isArray(data.navStickers) ? data.navStickers : [];
      const lower = String(name || "").toLowerCase();
      if (!lower) {
        return "";
      }
      let best = null;
      stickerGroups.forEach((group) => {
        const groupName = String(group?.name || "").trim();
        const groupImg = String(group?.img || "").trim();
        if (!groupName || !groupImg) {
          return;
        }
        const groupLower = groupName.toLowerCase();
        if (lower === groupLower || lower.startsWith(`${groupLower} `) || lower.includes(` ${groupLower} `) || lower.endsWith(` ${groupLower}`) || lower.includes(`| ${groupLower}`)) {
          if (!best || groupName.length > best.name.length) {
            best = { name: groupName, img: groupImg };
          }
        }
      });
      return best?.img || "";
    }
    function isStorageUnitEntry(entry) {
      const sub = String(entry?.sub_filter || "").toLowerCase();
      if (sub === "storage") {
        return true;
      }
      const name = normalize(entry?.market_hash_name || entry?.display_name || "");
      return name.includes("storage unit");
    }
    function isOperationStarEntry(entry) {
      const name = String(entry?.market_hash_name || entry?.display_name || "").trim();
      if (/\d+\s+stars?\s+for\s+operation/i.test(name)) {
        return true;
      }
      return normalize(entry?.type_note) === "operation star";
    }
    function isStickerSlabName(name) {
      return String(name || "").trim().startsWith("Sticker Slab |");
    }
    function isRegularStickerName(name) {
      const value = String(name || "").trim();
      return value.startsWith("Sticker |") && !isStickerSlabName(value);
    }
    function isStickerSlabEntry(entry) {
      return isStickerSlabName(entry?.market_hash_name || "");
    }
    function isCharmName(name) {
      const value = String(name || "").trim();
      return value.startsWith("Charm |") || value.startsWith("Souvenir Charm |");
    }
    function isCharmCatalogEntry(entry) {
      const name = String(entry?.market_hash_name || entry?.display_name || "").trim();
      if (isStickerSlabName(name) || isCharmName(name)) {
        return true;
      }
      return String(entry?.category || "").toLowerCase() === "charms";
    }
    function charmTypeNote(entry) {
      const name = String(entry?.market_hash_name || entry?.display_name || "").trim();
      if (isStickerSlabName(name)) return "Sticker Slab";
      if (name.startsWith("Souvenir Charm |")) return "Tournament Charm";
      if (name.startsWith("Charm |")) return "Charm";
      return entry?.type_note || "Charm";
    }
    function itemNameUsesWearParam(name) {
      const title = String(name || "").trim();
      if (!title.includes("|")) {
        return false;
      }
      if (isStickerSlabName(title) || isRegularStickerName(title) || isCharmName(title)) {
        return false;
      }
      if (/^(Patch|Sealed Graffiti|Graffiti|Music Kit|Charm|Agent|Pin|Collectible|Tool|Key|Name Tag|Pass)\s*\|/i.test(title)) {
        return false;
      }
      if (/^(Storage Unit|Sticker Capsule|Autograph Capsule|Souvenir Package|Patch Pack|Music Kit Box|Graffiti Box|Sticker Collection)\b/i.test(title)) {
        return false;
      }
      if (/\bcase\b/i.test(title)) {
        return false;
      }
      return true;
    }
    function isCapsuleContainerEntry(entry) {
      const name = String(entry?.market_hash_name || entry?.display_name || "").trim();
      if (!name || name.startsWith("Sticker |") || name.startsWith("Sticker Slab |")) {
        return false;
      }
      const lower = name.toLowerCase();
      if (lower.includes("capsule") || lower.includes("sticker collection")) {
        return true;
      }
      return /\b(challengers?|legends?|contenders?|champions?)\b/i.test(lower);
    }
    function isCaseKeyEntry(entry) {
      return /\skey$/i.test(String(entry?.market_hash_name || "").trim());
    }
    function isNonMarketableTrophyEntry(entry) {
      const name = String(entry?.market_hash_name || entry?.display_name || "");
      return /pick'em trophy|fantasy trophy|premier season (one|two|three|four) medal|\d{4} service medal|global offensive badge|loyalty badge/i.test(name);
    }
    const SOUVENIR_MAP_NAMES = [
      "Ancient",
      "Anubis",
      "Dust II",
      "Inferno",
      "Mirage",
      "Nuke",
      "Overpass",
      "Train",
      "Vertigo",
      "Cobblestone",
      "Cache",
      "Office",
      "Italy",
      "Aztec",
      "Canals",
      "Biome",
      "Black Gold",
      "Season",
      "Sugarcane",
      "Lake",
      "Safehouse",
      "Bazaar",
      "Shortdust",
      "Engage",
      "Basalt",
      "Insert",
      "Thrill",
      "Thera",
      "Palacio",
      "Memento",
      "Assembly",
      "Agency",
      "Ali",
      "Alpine",
      "Abbey",
      "Apollo",
      "Blacksite",
      "Breach",
      "Climb",
      "Edin",
      "Ember",
      "Farm",
      "Gulag",
      "Jungle",
      "Marquis",
      "Mocha",
      "Museum",
      "Ravine",
      "Rialto",
      "Rooster",
      "Sanctum",
      "Scar",
      "Shoots",
      "Stadium",
      "Studio",
      "Subzero",
      "Zoo"
    ];
    const SOUVENIR_MAP_PACKAGE_PATTERN = new RegExp(
      `\\b(${SOUVENIR_MAP_NAMES.map((map) => map.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s+Souvenir Package$`,
      "i"
    );
    function isSouvenirTokenEntry(entry) {
      return /\bSouvenir Token$/i.test(String(entry?.market_hash_name || entry?.display_name || "").trim());
    }
    function isGenericSouvenirPackageEntry(entry) {
      const name = String(entry?.market_hash_name || entry?.display_name || "").trim();
      if (!/\sSouvenir Package$/i.test(name)) {
        return false;
      }
      if (/\bHighlight\s+Souvenir Package$/i.test(name)) {
        return false;
      }
      return !SOUVENIR_MAP_PACKAGE_PATTERN.test(name);
    }
    function isCatalogTokenEntry(entry) {
      return isSouvenirTokenEntry(entry) || isGenericSouvenirPackageEntry(entry);
    }
    function isMarketableCatalogEntry(entry) {
      const listings = Number(entry?.seed_sell_listings);
      const price = Number(entry?.seed_sell_price);
      return listings > 0 || price > 0;
    }
    function normalizeCatalogEntry(entry) {
      if (!entry || typeof entry !== "object") {
        return entry;
      }
      if (isCharmCatalogEntry(entry)) {
        return {
          ...entry,
          category: "charms",
          category_label: "Charms",
          type_filter: "charms",
          scope_filter: "cases",
          sub_filter: "charms",
          type_note: charmTypeNote(entry)
        };
      }
      if (isCapsuleContainerEntry(entry)) {
        return {
          ...entry,
          category: "cases",
          category_label: "Cases",
          type_filter: "cases",
          scope_filter: "cases",
          sub_filter: "capsules",
          type_note: entry.type_note || "Capsule"
        };
      }
      if (isCaseKeyEntry(entry)) {
        return {
          ...entry,
          category: "tools",
          category_label: "Tools",
          type_filter: "tools",
          scope_filter: "cases",
          sub_filter: "other",
          type_note: entry.type_note || "Case Key"
        };
      }
      return entry;
    }
    function prepareCatalogItems(items) {
      const list = (Array.isArray(items) ? items : []).map(normalizeCatalogEntry).filter((item) => !isOperationStarEntry(item) && !isNonMarketableTrophyEntry(item) && !isCatalogTokenEntry(item));
      const imageByName = /* @__PURE__ */ new Map();
      list.forEach((entry) => {
        const image = catalogImageCandidates(entry)[0] || "";
        if (!image) {
          return;
        }
        holoFoilNameAliases(entry?.market_hash_name).forEach((alias) => {
          if (!imageByName.has(alias)) {
            imageByName.set(alias, image);
          }
        });
      });
      return list.map((entry) => {
        const existing = catalogImageCandidates(entry)[0] || "";
        if (existing) {
          return existing === entry.image ? entry : { ...entry, image: existing };
        }
        for (const alias of holoFoilNameAliases(entry?.market_hash_name)) {
          const found = imageByName.get(alias);
          if (found) {
            return { ...entry, image: found };
          }
        }
        if (isCapsuleContainerEntry(entry)) {
          const fallback = resolveStickerCapsuleFallbackImage(entry?.market_hash_name);
          if (fallback) {
            return { ...entry, image: fallback };
          }
        }
        return entry;
      });
    }
    function shouldShowCatalogEntry(entry) {
      if (isOperationStarEntry(entry)) {
        return false;
      }
      if (isNonMarketableTrophyEntry(entry)) {
        return false;
      }
      if (isCatalogTokenEntry(entry)) {
        return false;
      }
      if (isStorageUnitEntry(entry)) {
        return false;
      }
      if (!isKnifeCatalogEntry(entry)) {
        return true;
      }
      return catalogEntryHasImage(entry);
    }
    function readInitialFilters() {
      const params = new URLSearchParams(window.location.search || "");
      const rawScope = normalize(params.get("scope") || "");
      const rawSub = normalize(params.get("sub") || "");
      const normalizedSub = rawSub === "heavy" ? "lmgs" : rawSub === "autographs" ? "capsules" : rawSub;
      let scope;
      if (rawScope === "armory" || rawScope === "weapons" || rawScope === "skins") {
        scope = "armory";
      } else if (SUB_FILTERS[rawScope] && rawScope !== "armory") {
        scope = rawScope;
      } else if (normalizedSub && SUB_FILTERS.armory.some((option) => option.id === normalizedSub)) {
        scope = "armory";
      } else if (normalizedSub) {
        scope = SUB_TO_UI_SCOPE.get(normalizedSub) || (SUB_FILTERS.other.some((option) => option.id === normalizedSub) ? "other" : "containers");
      } else {
        scope = "containers";
      }
      const subOptions = SUB_FILTERS[scope] || SUB_FILTERS.containers;
      const sub = subOptions.some((option) => option.id === normalizedSub) ? normalizedSub : defaultSubForScope(scope);
      const rawType = String(params.get("type") || "").trim().toLowerCase();
      const typeOptions = typeOptionsForContext(scope, sub);
      let type = "all";
      if (typeOptions.some((option) => option.id === rawType)) {
        type = rawType;
      } else if (scope === "armory" && rawType.startsWith("model:")) {
        type = rawType;
      }
      return { scope, sub, type };
    }
    function RoiMenu({ labelKey, options, value, onChange, shellClass }) {
      const { t } = useI18n();
      const [open, setOpen] = useState(false);
      const menuRef = useRef(null);
      useEffect(() => {
        if (!open) return void 0;
        const onOutside = (e) => {
          if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onOutside);
        return () => document.removeEventListener("mousedown", onOutside);
      }, [open]);
      const currentLabel = optionLabel(options.find((o) => o.id === value) || options[0], t);
      return /* @__PURE__ */ React.createElement("div", { className: classNames("roi-select-shell compact", shellClass) }, /* @__PURE__ */ React.createElement("span", null, t(labelKey)), /* @__PURE__ */ React.createElement("div", { className: "roi-type-menu", ref: menuRef }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: classNames("roi-type-trigger", open && "open"),
          onClick: () => setOpen((p) => !p)
        },
        /* @__PURE__ */ React.createElement("span", null, currentLabel),
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-down" })
      ), /* @__PURE__ */ React.createElement("div", { className: classNames("roi-type-dropdown", open && "open") }, options.map((option) => /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          key: option.id,
          className: classNames("roi-type-option", value === option.id && "active"),
          onClick: () => {
            onChange(option.id);
            setOpen(false);
          }
        },
        optionLabel(option, t)
      )))));
    }
    function RoiExplorer() {
      const { t, tp, formatNumber } = useI18n();
      const [catalog, setCatalog] = useState(() => buildProjectFallbackCatalog());
      const [catalogUpdatedAt, setCatalogUpdatedAt] = useState("");
      const [catalogTotalCount, setCatalogTotalCount] = useState(0);
      const [catalogLoading, setCatalogLoading] = useState(true);
      const [originLookup, setOriginLookup] = useState({});
      const [source, setSource] = useState("steam");
      const range = "1y";
      const initialFilters = useMemo(() => readInitialFilters(), []);
      const [sortBy, setSortBy] = useState(() => defaultSortForFilters(initialFilters.scope, initialFilters.sub));
      const [scopeFilter, setScopeFilter] = useState(initialFilters.scope);
      const [typeFilter, setTypeFilter] = useState(initialFilters.type);
      const [subFilter, setSubFilter] = useState(initialFilters.sub);
      const [query, setQuery] = useState("");
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState("");
      const [records, setRecords] = useState([]);
      const [updatedAt, setUpdatedAt] = useState("");
      const [visibleLimit, setVisibleLimit] = useState(DEFAULT_VISIBLE_LIMIT);
      const deferredQuery = useDeferredValue(query);
      useEffect(() => {
        if (sortBy === "model_asc") {
          setSortBy(defaultSortForFilters(scopeFilter, subFilter));
        }
      }, [sortBy, scopeFilter, subFilter]);
      useEffect(() => {
        let cancelled = false;
        setCatalogLoading(true);
        fetch(CATALOG_URL).then((response) => {
          if (!response.ok) {
            throw new Error(`Catalog request failed (${response.status})`);
          }
          return response.json();
        }).then((payload) => {
          if (cancelled) {
            return;
          }
          const items = Array.isArray(payload && payload.items) ? payload.items : [];
          if (!items.length) {
            throw new Error("Catalog payload was empty.");
          }
          setCatalog(prepareCatalogItems(items));
          setCatalogUpdatedAt(String(payload.updated_at || ""));
          setCatalogTotalCount(Number(payload.total_count || items.length));
        }).catch(() => {
          if (!cancelled) {
            const fallback = buildProjectFallbackCatalog();
            setCatalog(fallback);
            setCatalogTotalCount(fallback.length);
          }
        }).finally(() => {
          if (!cancelled) {
            setCatalogLoading(false);
          }
        });
        fetch(ORIGIN_LOOKUP_URL, { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((payload) => {
          if (cancelled || !payload || typeof payload.items !== "object" || payload.items === null) {
            return;
          }
          setOriginLookup(payload.items);
        }).catch(() => {
        });
        return () => {
          cancelled = true;
        };
      }, []);
      const availableTypeOptions = useMemo(() => {
        const counts = /* @__PURE__ */ new Map();
        const labels = /* @__PURE__ */ new Map();
        catalog.forEach((entry) => {
          if (!shouldShowCatalogEntry(entry)) return;
          if (deriveScopeFilter(entry) !== scopeFilter) return;
          if (deriveSubFilter(entry) !== subFilter && !(subFilter === "lmgs" && deriveSubFilter(entry) === "heavy") && !(subFilter === "capsules" && deriveSubFilter(entry) === "autographs")) {
            return;
          }
          const key = deriveSpecificTypeId(entry, scopeFilter, subFilter);
          if (!key) return;
          counts.set(key, (counts.get(key) || 0) + 1);
          if (!labels.has(key)) {
            labels.set(key, extractWeaponModelLabel(entry) || key.replace(/^model:/, ""));
          }
        });
        if (scopeFilter === "armory") {
          const models = [...counts.entries()].map(([id]) => ({
            id,
            label: labels.get(id) || id.replace(/^model:/, "")
          })).sort((a, b) => a.label.localeCompare(b.label, void 0, { sensitivity: "base" }));
          return [ALL_TYPE_OPTION, ...models];
        }
        const options = typeOptionsForContext(scopeFilter, subFilter);
        return options.filter((option) => option.id === "all" || counts.has(option.id));
      }, [catalog, scopeFilter, subFilter]);
      const subOptions = useMemo(() => SUB_FILTERS[scopeFilter] || SUB_FILTERS.containers, [scopeFilter]);
      useEffect(() => {
        if (!availableTypeOptions.some((option) => option.id === typeFilter)) {
          setTypeFilter("all");
        }
      }, [availableTypeOptions, typeFilter]);
      const filteredCatalog = useMemo(() => {
        const queryValue = normalize(deferredQuery).trim();
        return catalog.filter((entry) => {
          if (!shouldShowCatalogEntry(entry)) {
            return false;
          }
          const entryScope = uiScopeOf(entry);
          const entrySub = deriveSubFilter(entry);
          const matchesScope = entryScope === scopeFilter;
          const matchesSub = subFilter === "all" || entrySub === subFilter || subFilter === "lmgs" && entrySub === "heavy" || subFilter === "capsules" && entrySub === "autographs";
          const matchesType = entryMatchesTypeFilter(entry, typeFilter, scopeFilter, subFilter);
          const matchesQuery = queryValue === "" || normalize(entry.market_hash_name).includes(queryValue) || normalize(entry.display_name).includes(queryValue) || normalize(entry.selected_wear).includes(queryValue) || normalize(entry.category_label).includes(queryValue) || normalize(entry.type_note).includes(queryValue);
          const matchesOtherMarket = subFilter !== "other" || isCaseKeyEntry(entry) || isMarketableCatalogEntry(entry);
          const listingCount = Number(entry.seed_sell_listings);
          const matchesListings = queryValue !== "" || !Number.isFinite(listingCount) || listingCount > 0;
          return matchesScope && matchesType && matchesSub && matchesQuery && matchesOtherMarket && matchesListings;
        });
      }, [catalog, deferredQuery, scopeFilter, subFilter, typeFilter]);
      useEffect(() => {
        setVisibleLimit(DEFAULT_VISIBLE_LIMIT);
      }, [deferredQuery, scopeFilter, subFilter, typeFilter, sortBy]);
      const sortedFilteredCatalog = useMemo(
        () => sortRecords(filteredCatalog.map(catalogRowForSort), sortBy),
        [filteredCatalog, sortBy]
      );
      const requestCatalog = useMemo(
        () => sortedFilteredCatalog.slice(0, visibleLimit),
        [sortedFilteredCatalog, visibleLimit]
      );
      useEffect(() => {
        if (!requestCatalog.length) {
          setRecords([]);
          setUpdatedAt("");
          setError("");
          setLoading(false);
          return void 0;
        }
        const controller = new AbortController();
        let timedOut = false;
        const timeoutId = window.setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, PRICE_REQUEST_TIMEOUT_MS);
        setLoading(true);
        setError("");
        const request = buildSourceRequest(
          source,
          range,
          requestCatalog.map((item) => item.market_hash_name)
        );
        fetch(request.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(request.body),
          signal: controller.signal
        }).then((response) => {
          if (!response.ok) {
            throw new Error(`ROI request failed (${response.status})`);
          }
          return response.json();
        }).then((payload) => {
          if (!payload || payload.success === false) {
            throw new Error(payload && payload.error ? payload.error : "ROI response was empty.");
          }
          const rows = rowsFromPayload(payload, source, range);
          setRecords(rows);
          setUpdatedAt(String(payload.updated_at || rows[0]?.updated_at || ""));
        }).catch((requestError) => {
          if (requestError && requestError.name === "AbortError") {
            return;
          }
          console.warn("[roi] price request failed:", requestError);
          setError("");
        }).finally(() => {
          window.clearTimeout(timeoutId);
          if (!controller.signal.aborted || timedOut) {
            setLoading(false);
          }
        });
        return () => {
          window.clearTimeout(timeoutId);
          controller.abort();
        };
      }, [requestCatalog, range, source]);
      const sourceLabel = SOURCE_OPTIONS.find((item) => item.id === source)?.label || "Steam Market";
      const rangeLabel = RANGE_OPTIONS.find((item) => item.id === range)?.label || "1Y";
      const typeLabel = optionLabel(availableTypeOptions.find((item) => item.id === typeFilter), t) || t("type_all");
      const totalCatalogCount = Number.isFinite(catalogTotalCount) && catalogTotalCount > 0 ? catalogTotalCount : catalog.length;
      const recordMap = useMemo(() => new Map(records.map((record) => [record.market_hash_name, record])), [records]);
      const mergedRecords = useMemo(() => {
        const rows = requestCatalog.map((entry) => {
          const record = recordMap.get(entry.market_hash_name) || null;
          const internalHref = buildInternalItemHref(entry);
          const href = internalHref || buildSteamUrl(entry.market_hash_name) || (record && record.market_url ? String(record.market_url) : "");
          const catalogListings = Number(entry.seed_sell_listings);
          const listings = record && record.listings != null && record.listings !== "" ? record.listings : Number.isFinite(catalogListings) ? catalogListings : null;
          const listingsDisplay = listings != null ? listings.toLocaleString("en-US") : record ? record.listings_display : "-";
          const imageCandidates = catalogImageCandidates(entry);
          const seedPrice = catalogSeedPrice(entry);
          const useRecordPrice = recordHasDisplayPrice(record);
          return {
            market_hash_name: entry.market_hash_name,
            display_name: entry.display_name || stripWear(entry.market_hash_name),
            weapon_model: extractWeaponModelLabel(entry),
            selected_wear: entry.selected_wear || "",
            category: entry.category,
            category_label: entry.category_label || typeLabel,
            sub_filter: deriveSubFilter(entry),
            type_note: entry.type_note,
            image: imageCandidates[0] || "",
            image_candidates: imageCandidates,
            name_color: entry.name_color,
            href,
            internal_href: Boolean(internalHref),
            source: record ? record.source : source,
            source_label: record ? record.source_label : sourceLabel,
            range_used: record ? record.range_used : rangeLabel,
            range_notice: record ? record.range_notice : "",
            current_price: useRecordPrice ? record.current_price : seedPrice,
            current_price_display: useRecordPrice ? record.current_price_display : formatCompactPrice(seedPrice),
            baseline_price_display: record ? record.baseline_price_display : "-",
            roi_pct: record ? record.roi_pct : null,
            roi_display: record ? record.roi_display : "-",
            profit_display: record ? record.profit_display : "-",
            listings,
            listings_display: listingsDisplay,
            secondary_metric_label: record ? record.secondary_metric_label : source === "skinport" ? "24h sales" : "Buy orders",
            secondary_metric_display: record ? record.secondary_metric_display : "-",
            sparkline: record ? record.sparkline : [],
            sparklines: record ? record.sparklines || {} : {},
            origin_name: showsOriginLabel(entry.category) ? resolveOriginName(entry, originLookup) : "",
            release_iso: entry.category === "cases" ? resolveCaseReleaseIso(entry) : ""
          };
        });
        return sortRecords(rows, sortBy);
      }, [originLookup, rangeLabel, recordMap, requestCatalog, sortBy, source, sourceLabel, typeLabel]);
      const scopedCatalog = useMemo(() => {
        return catalog.filter((entry) => {
          if (!shouldShowCatalogEntry(entry)) {
            return false;
          }
          return uiScopeOf(entry) === scopeFilter;
        });
      }, [catalog, scopeFilter]);
      const visibleSubCounts = useMemo(() => {
        const map = /* @__PURE__ */ new Map();
        let countedSlabFamily = false;
        for (const entry of scopedCatalog) {
          const key = deriveSubFilter(entry);
          if (key === "charms" && isStickerSlabEntry(entry)) {
            if (countedSlabFamily) {
              continue;
            }
            countedSlabFamily = true;
          }
          map.set(key, (map.get(key) || 0) + 1);
        }
        return map;
      }, [scopedCatalog]);
      const isCatalogLoading = catalogLoading;
      const pickScope = (nextScope) => {
        const nextSub = defaultSubForScope(nextScope);
        setScopeFilter(nextScope);
        setTypeFilter("all");
        setSubFilter(nextSub);
        setSortBy(defaultSortForFilters(nextScope, nextSub));
      };
      const pickSub = (nextSub) => {
        setSubFilter(nextSub);
        setTypeFilter("all");
        setSortBy(defaultSortForFilters(scopeFilter, nextSub));
      };
      const pickType = (nextType) => {
        setTypeFilter(nextType);
      };
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("section", { className: "roi-shell roi-clean-shell" }, /* @__PURE__ */ React.createElement("section", { className: "roi-filter-frame roi-reveal", style: { "--reveal-delay": "60ms" } }, /* @__PURE__ */ React.createElement("div", { className: "roi-scope-tabs", role: "tablist", "aria-label": t("roi_scopesAria") }, SCOPE_TABS.map((tab) => /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          key: tab.id,
          className: classNames("roi-scope-tab", scopeFilter === tab.id && "active"),
          onClick: () => pickScope(tab.id)
        },
        t(tab.labelKey)
      ))), /* @__PURE__ */ React.createElement("div", { className: "roi-sub-tabs", style: subOptions.length < 2 ? { display: "none" } : void 0 }, subOptions.map((option) => /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          key: option.id,
          className: classNames("roi-sub-tab", subFilter === option.id && "active"),
          onClick: () => pickSub(option.id)
        },
        t(option.labelKey),
        visibleSubCounts.has(option.id) ? /* @__PURE__ */ React.createElement("span", null, formatNumber(visibleSubCounts.get(option.id))) : null
      ))), /* @__PURE__ */ React.createElement("div", { className: "roi-toolbar-clean compact" }, /* @__PURE__ */ React.createElement("label", { className: "roi-search-shell", "aria-label": t("roi_searchAria") }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" }), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          value: query,
          onChange: (event) => setQuery(event.target.value),
          placeholder: t("roi_searchPlaceholder")
        }
      )), /* @__PURE__ */ React.createElement(RoiMenu, { labelKey: "roi_menuType", options: availableTypeOptions, value: typeFilter, onChange: pickType }), /* @__PURE__ */ React.createElement(RoiMenu, { labelKey: "roi_menuSource", options: SOURCE_OPTIONS, value: source, onChange: setSource, shellClass: "roi-select-source" }), /* @__PURE__ */ React.createElement(RoiMenu, { labelKey: "roi_menuSort", options: subFilter === "cases" ? CASES_SORT_OPTIONS : SORT_OPTIONS, value: sortBy, onChange: setSortBy }))), /* @__PURE__ */ React.createElement("section", { className: "roi-section-card roi-reveal", id: "roi-items", style: { "--reveal-delay": "130ms" } }, !isCatalogLoading && !mergedRecords.length ? /* @__PURE__ */ React.createElement("div", { className: "roi-empty-state" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-box-open" }), /* @__PURE__ */ React.createElement("strong", null, t("roi_emptyTitle")), /* @__PURE__ */ React.createElement("span", null, t("roi_emptyBody"))) : null, isCatalogLoading ? /* @__PURE__ */ React.createElement("div", { className: "roi-grid loading" }, Array.from({ length: Math.min(10, Math.max(5, requestCatalog.length || 10)) }, (_, index) => /* @__PURE__ */ React.createElement("div", { className: "roi-card skeleton", key: index }, /* @__PURE__ */ React.createElement("div", { className: "roi-card-media" }), /* @__PURE__ */ React.createElement("div", { className: "roi-card-lines" }, /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null))))) : mergedRecords.length ? /* @__PURE__ */ React.createElement("div", { className: "roi-grid clean-grid" }, mergedRecords.map((record, index) => {
        const tone = roiTone(record);
        const sparkValues = Array.isArray(record.sparkline) && record.sparkline.length ? record.sparkline : record.sparklines && record.sparklines[source] || [];
        const positiveTrend = sourceTrend(sparkValues);
        return /* @__PURE__ */ React.createElement(
          "a",
          {
            className: classNames("roi-card clean-card", record.category && `category-${record.category}`),
            key: `${record.category}-${record.market_hash_name}`,
            href: record.href,
            style: {
              "--card-glow": cardGlow(record.category, record.name_color, record.sub_filter),
              "--card-delay": `${Math.min(index, 18) * 32}ms`,
              "--rarity-accent": `#${String(record.name_color || "B0C3D9").replace(/[^a-fA-F0-9]/g, "").slice(0, 6)}`
            },
            title: t("roi_openItem", { name: record.display_name || record.market_hash_name })
          },
          /* @__PURE__ */ React.createElement("div", { className: classNames("roi-card-media", "clean-media", /xm[\s-]?1014/i.test(String(record.market_hash_name || record.display_name || "")) && "xm-hide-shell") }, /* @__PURE__ */ React.createElement("div", { className: "roi-card-glow" }), /* @__PURE__ */ React.createElement(
            RoiMarketCardImage,
            {
              candidates: record.image_candidates || [record.image].filter(Boolean),
              alt: record.market_hash_name
            }
          )),
          /* @__PURE__ */ React.createElement("div", { className: "roi-card-copy clean-copy" }, /* @__PURE__ */ React.createElement("h3", null, record.display_name || record.market_hash_name), /* @__PURE__ */ React.createElement("p", { className: "clean-copy-sub" }, record.origin_name || (record.release_iso ? formatCaseIntroDate(record.release_iso) : "") || translateTypeNote(record.type_note, t) || ""), /* @__PURE__ */ React.createElement("div", { className: "roi-card-price-line" }, /* @__PURE__ */ React.createElement("strong", null, record.current_price_display), record.roi_display && !/^[-—]$/.test(String(record.roi_display).trim()) ? /* @__PURE__ */ React.createElement("span", { className: classNames("roi-card-roi", tone) }, record.roi_display) : null), source === "skinport" ? null : /* @__PURE__ */ React.createElement(
            Sparkline,
            {
              values: sparkValues,
              positive: positiveTrend,
              delay: Math.min(index, 18) * 32,
              micro: true
            }
          ), /* @__PURE__ */ React.createElement("div", { className: "roi-card-foot" }, /* @__PURE__ */ React.createElement("span", { className: "roi-card-listings" }, formatListingsBadge(record, tp) || "—")))
        );
      })) : null), !isCatalogLoading && filteredCatalog.length > requestCatalog.length ? /* @__PURE__ */ React.createElement("div", { className: "roi-load-more roi-reveal", style: { "--reveal-delay": "220ms" } }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "roi-card-btn clean-btn",
          onClick: () => setVisibleLimit((current) => current + DEFAULT_VISIBLE_LIMIT)
        },
        t("roi_loadMore"),
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-down" })
      )) : null));
    }
    mountPage(/* @__PURE__ */ React.createElement(RoiExplorer, null));
  })();
})();
