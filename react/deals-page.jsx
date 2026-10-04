(() => {
  const { useEffect, useMemo, useRef, useState } = React;
  const { Layout, mountPage, classNames, useI18n } = window.CS2React;

  // Served gzipped + cacheable by catalog_json.php (the raw file is 28 MB).
  const CATALOG_URL = "catalog_json.php?v=20260917-gz-1";
  const API_CHUNK   = 50;
  const DMARKET_API_CHUNK = 12;
  // Providers whose empty answer must never be cached as "no listing".
  const NO_MISS_SENTINEL_PROVIDERS = ["steam", "white_market", "dmarket", "waxpeer"];
  const STEAM_API_CHUNK = 10;
  const PAGE_SIZE   = 30;
  const MAX_PRICE_ITEMS = 100;       // hard cap — keeps imports light
  const MAX_DEALS = 100;             // never show/load more than this many deals
  const PRIORITY_PRICE_ITEMS = PAGE_SIZE; // paint top-of-table quotes first
  const PRICE_CONCURRENCY = 4;
  const STEAM_CONCURRENCY = 1;
  const STEAM_CHUNK_DELAY_MS = 350;
  const DMARKET_CONCURRENCY = 2;
  const CACHE_MAX_AGE_HOURS = 24;
  // Keep last-good Steam across the 24h live-refresh TTL. Missing/failed
  // refreshes must not wipe the column back to dashes.
  const STEAM_KEEP_MAX_AGE_HOURS = 14 * 24;
  // Live-ask markets (White.Market export ~10 min, DMarket file ~15 min).
  // 5 minutes was shorter than those TTLs, so verified quotes vanished as dashes.
  const LIVE_ASK_MAX_AGE_HOURS = 2;
  const STEAM_MAX_LISTING_PRICE = 1800;
  // Gaps above this are often stale Steam vs third-party. Keep a soft ceiling,
  // but don't wipe the table when Steam cache is a few days behind.
  const MAX_PLAUSIBLE_SAVINGS = 55;
  const FETCH_TIMEOUT_MS = 12000;    // abort a hung request after this
  const STEAM_FETCH_TIMEOUT_MS = 60000;
  const STEAM_LIVE_FETCH_TIMEOUT_MS = 90000;
  const FETCH_RETRIES = 1;           // retries for timeouts / 429 / 5xx
  const PRICE_LOAD_TIMEOUT_MS = 90000;

  const MARKET_PROVIDERS = [
    { id: "steam", label: "Steam", endpoint: "steam", image: "assets/markets/steam.png" },
    { id: "skinport", label: "Skinport", endpoint: "skinport", image: "assets/markets/skinport.png" },
    { id: "csfloat", label: "CSFloat", endpoint: "csfloat", image: "assets/markets/floatlogo.png?v=20260602" },
    { id: "white_market", label: "White.Market", endpoint: "white_market", image: "assets/markets/whitemarket.webp?v=20260602" },
    { id: "dmarket", label: "DMarket", endpoint: "dmarket", image: "assets/markets/dmarket.png" },
    // Sixth column (user, 2026-10-04: "add one another marketplace waxpeer").
    { id: "waxpeer", label: "Waxpeer", endpoint: "waxpeer", image: "assets/markets/waxpeer.png" },
  ];
  const ALL_DEAL_PROVIDER_IDS = MARKET_PROVIDERS.map((p) => p.id);

  const TYPE_TABS = [
    { id: "all",          label: "All"          },
    { id: "cases",        label: "Cases"        },
    { id: "skins",        label: "Skins"        },
    { id: "stickers",     label: "Stickers"     },
    { id: "capsules",     label: "Capsules"     },
    { id: "agents",       label: "Agents"       },
    { id: "patches",      label: "Patches"      },
    { id: "music",        label: "Music Kits"   },
  ];
  /* The phone's filter chips. `type` reuses the existing category filter;
     `maxPrice` is a price band, which the category filter has no concept of,
     so the two are applied separately below. One array so the copy and the
     order can change without touching the component. */
  const PHONE_CHIPS = [
    { id: "all", label: "mdeals_chipAll", type: "all" },
    { id: "under5", label: "mdeals_chipUnder", type: "all", maxPrice: 5 },
    { id: "rifles", label: "mdeals_chipRifles", type: "rifles" },
    { id: "pistols", label: "mdeals_chipPistols", type: "pistols" },
    { id: "knives", label: "mdeals_chipKnives", type: "knives" },
    { id: "cases", label: "mdeals_chipCases", type: "cases" },
    { id: "stickers", label: "mdeals_chipStickers", type: "stickers" },
  ];

  /* The phone sort sheet. Maps the spec's four plain-language options onto the
     sort ids the table already understands; `price_desc` is new because the
     desktop list never offered "most expensive first". */
  const PHONE_SORTS = [
    { id: "savings_desc", label: "mdeals_sortSaving" },
    { id: "cheapest_asc", label: "mdeals_sortLowest" },
    { id: "price_desc", label: "mdeals_sortHighest" },
    { id: "newest", label: "mdeals_sortNewest" },
  ];

  const WEAPON_TYPE_FILTERS = ["pistols", "rifles", "smgs", "shotguns", "lmgs", "knives", "gloves"];
  // Candidate ranking tier (lower = picked first into the price fetch pool).
  // All weapon skins share tier 0 so they compete purely on liquidity/value,
  // surfacing the most popular skins of every type — the Deals page is skins-led.
  const PROVIDER_FRIENDLY_SUB_FILTERS = new Map([
    ["rifles", 0],
    ["pistols", 0],
    ["smgs", 0],
    ["heavy", 0],
    ["shotguns", 0],
    ["knives", 0],
    ["gloves", 0],
    ["agents", 1],
    ["cases", 2],
    ["capsules", 3],
    ["stickers", 4],
    ["patches", 5],
    ["music", 6],
  ]);

  function fmtPrice(val) {
    if (val == null || !Number.isFinite(val) || val <= 0) return null;
    return "€" + val.toFixed(2);
  }

  function numericPrice(value, maxPrice = Infinity) {
    const price = Number(value);
    return Number.isFinite(price) && price > 0 && price <= maxPrice ? price : null;
  }

  function dedupeCatalogItems(items) {
    const map = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const key = String(item?.market_hash_name || "").trim().toLowerCase();
      if (!key || map.has(key)) return;
      map.set(key, item);
    });
    return Array.from(map.values());
  }

  function providerMeta(id) {
    return MARKET_PROVIDERS.find((provider) => provider.id === id) || MARKET_PROVIDERS[0];
  }

  function providerCandidateScore(item) {
    const subFilter = String(item?.sub_filter || item?.category || "").toLowerCase();
    const category = String(item?.category || "").toLowerCase();
    const price = Number(item?.seed_sell_price || 0);
    const listings = Number(item?.seed_sell_listings || 0);
    const typeRank = PROVIDER_FRIENDLY_SUB_FILTERS.has(subFilter)
      ? PROVIDER_FRIENDLY_SUB_FILTERS.get(subFilter)
      : PROVIDER_FRIENDLY_SUB_FILTERS.has(category)
        ? PROVIDER_FRIENDLY_SUB_FILTERS.get(category)
        : 20;
    // Cross-market availability bias: sub-€1.5 skins are usually NOT listed on
    // Skinport/CSFloat, and ultra-expensive items have thin/no cross listings —
    // both make poor "deals" candidates. Favour liquid, mid-value items.
    const pricePenalty =
      price < 1.5 ? 40 :
      price <= 400 ? 0 :
      price <= 1200 ? 15 : 45;
    const liquidityScore = Math.min(60, Math.log10(Math.max(1, listings)) * 14);

    return (typeRank * 100000) + (pricePenalty * 1000) - (liquidityScore * 10) + Math.min(price, 1800) * 0.01;
  }

  function providerRowPrice(record, fallback = null, maxPrice = Infinity) {
    return numericPrice(record?.current_price, maxPrice)
      ?? numericPrice(record?.lowest_price, maxPrice)
      ?? numericPrice(record?.min_price, maxPrice)
      ?? numericPrice(record?.price, maxPrice)
      ?? numericPrice(fallback, maxPrice);
  }

  // Trust marketplace quotes from API/DB snapshots (not stale preload for Steam).
  function dealRecordAgeHours(record) {
    const raw = String(
      record?.updated_at
      || record?.fetched_at
      || record?.cached_at
      || record?.timestamp
      || ""
    ).trim();
    if (!raw) return Number.POSITIVE_INFINITY;
    const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
    const ms = Date.parse(normalized);
    if (!Number.isFinite(ms)) return Number.POSITIVE_INFINITY;
    return Math.max(0, (Date.now() - ms) / 3600000);
  }

  function isVerifiedDealPrice(record, providerId) {
    if (!record || record._no_listing) {
      return false;
    }

    const price = providerRowPrice(record, null);
    if (price == null || price <= 0) {
      return false;
    }

    if (providerId === "steam") {
      if (record.from_preload) {
        return false;
      }
      // Catalog / seed quotes are often weeks old — never treat as live Steam asks.
      if (record._from_catalog_seed) {
        return false;
      }
      const origin = String(record.steam_price_source || "").toLowerCase();
      if (origin === "steam_catalog" || origin === "steam_catalog_seed") {
        return false;
      }
      const age = dealRecordAgeHours(record);
      // Only enforce age when we actually have a timestamp — missing updated_at
      // used to reject valid priceoverview quotes (Infinity > 12h).
      if (Number.isFinite(age) && age > STEAM_KEEP_MAX_AGE_HOURS) {
        return false;
      }
      if (record.price_verified === true) {
        return true;
      }
      // File/DB snapshots sometimes omit steam_price_source; treat priced rows as overview.
      if (!origin) {
        return true;
      }
      return ["priceoverview", "market_listing", "market_listing_wear", "steam_listing_buckets"].includes(origin);
    }

    if (providerId === "skinport") {
      return record.price_verified !== false;
    }

    if (providerId === "white_market") {
      // Overlay live cheapest asks; reject stale MySQL/export rows.
      if (dealRecordAgeHours(record) > LIVE_ASK_MAX_AGE_HOURS) {
        return false;
      }
      return record.price_verified !== false;
    }

    if (providerId === "csfloat") {
      // History-AVG DB fallback is not a live ask; price-list / listing quotes are.
      if (record._from_db && record.price_verified === false) {
        return false;
      }
      return record.price_verified !== false;
    }

    if (providerId === "dmarket") {
      // Accept short-lived file cache; force live aggregated cheapest offers otherwise.
      if (dealRecordAgeHours(record) > LIVE_ASK_MAX_AGE_HOURS) {
        return false;
      }
      return record.price_verified !== false && !record._no_listing;
    }

    if (providerId === "waxpeer") {
      // Live asks like White.Market: a stale cached row is not a deal.
      if (dealRecordAgeHours(record) > LIVE_ASK_MAX_AGE_HOURS) {
        return false;
      }
      return record.price_verified !== false && !record._no_listing;
    }

    return record.price_verified !== false;
  }

  function verifiedProviderPrice(record, providerId, maxPrice = Infinity) {
    return isVerifiedDealPrice(record, providerId)
      ? providerRowPrice(record, null, maxPrice)
      : null;
  }

  // ── Marketplace deep-links (preserve clickable rows) ───────────────────────
  function buildProviderFallbackUrl(providerId, marketHashName) {
    const name = String(marketHashName || "").trim();
    const encoded = encodeURIComponent(name);
    if (!name) return "";
    switch (providerId) {
      case "steam":
        return `https://steamcommunity.com/market/listings/730/${encoded}`;
      case "skinport":
        return `https://skinport.com/market/730?search=${encoded}`;
      case "csfloat":
        return `https://csfloat.com/search?market_hash_name=${encoded}`;
      case "dmarket":
        return `https://dmarket.com/ingame-items/item-list/csgo-skins?title=${encoded}`;
      case "white_market":
        // Must include nameHash — bare /csgo opens the hub with no item.
        return `https://white.market/item?appId=730&nameHash=${encoded}`;
      case "waxpeer":
        return `https://waxpeer.com/?search=${encoded}`;
      default:
        return "";
    }
  }

  function isGenericMarketplaceUrl(providerId, url) {
    const raw = String(url || "").trim();
    if (!raw) return true;
    try {
      const parsed = new URL(raw, "https://example.com");
      const host = String(parsed.hostname || "").toLowerCase();
      const path = String(parsed.pathname || "").replace(/\/+$/, "").toLowerCase();
      if (providerId === "waxpeer" && !host.includes("waxpeer.com")) return true;
      if (providerId === "white_market") {
        if (!host.includes("white.market")) return true;
        // Hub / category pages without an item — not a usable deal link.
        if (!path || path === "/csgo" || path === "/market" || path === "/en" || path === "/en/csgo") {
          const hasName = Boolean(parsed.searchParams.get("nameHash") || parsed.searchParams.get("name"));
          if (!hasName && !path.includes("/item")) return true;
        }
        if (path === "/item" || path.startsWith("/item/")) {
          const hasName = Boolean(parsed.searchParams.get("nameHash") || parsed.searchParams.get("name"));
          if (!hasName && path === "/item") return true;
        }
      }
      return false;
    } catch (_error) {
      return true;
    }
  }

  function providerRowUrl(providerId, record, marketHashName) {
    const direct = String(record?.market_url || record?.item_page || record?.market_page || "").trim();
    if (direct && !isGenericMarketplaceUrl(providerId, direct)) {
      return direct;
    }
    return buildProviderFallbackUrl(providerId, marketHashName);
  }

  function itemNeedsSteamStarPrefix(item) {
    const sub = String(item?.sub_filter || item?.category || "").toLowerCase();
    if (sub === "knives" || sub === "gloves") return true;
    const name = String(item?.market_hash_name || item?.display_name || "").trim();
    if (name.startsWith("★")) return false;
    // Containers named after a knife are not knives: the word test turned
    // Falchion Case, Shadow Case and Huntsman Weapon Case into "★ Falchion
    // Case", a name Steam does not have, so those rows never got a Steam
    // price (found 2026-10-04 while refreshing the Deals Steam column).
    if (/\b(Case|Capsule|Package|Key|Pin|Patch|Sticker|Graffiti|Charm|Pass|Music Kit)\b/i.test(name)) return false;
    return /\b(Knife|Gloves|Wraps|Bayonet|Karambit|Daggers|Navaja|Stiletto|Talon|Ursus|Skeleton|Nomad|Survival|Paracord|Classic|Butterfly|Flip|Gut|Huntsman|Falchion|Bowie|Shadow)\b/i.test(name);
  }

  function ensureSteamStarPrefix(name) {
    const raw = String(name || "").trim();
    if (!raw || raw.startsWith("★")) return raw;
    return `★ ${raw}`;
  }

  function itemSupportsWearVariants(name) {
    const base = String(name || "").trim();
    if (!base) return false;
    if (/\b(Patch|Music Kit|Graffiti|Pin|Sticker|Case|Capsule|Sealed Graffiti|Charm|Collectible|Package|Parcel|Pack|Box|Agent)\b/i.test(base)) {
      return false;
    }
    if (base.startsWith("★")) return true;
    return base.includes("|");
  }

  function dealWearLabel(item) {
    const base = String(item?.market_hash_name || "").trim();
    if (/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i.test(base)) {
      const match = base.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i);
      return match ? match[1] : "";
    }
    // Deals always compare Factory New across marketplaces for wear skins.
    return itemSupportsWearVariants(base) ? "Factory New" : "";
  }

  // Always compare Factory New (or catalog selected_wear) across every marketplace.
  function dealWearMarketName(item) {
    let base = String(item?.market_hash_name || "").trim();
    if (!base) return "";
    if (itemNeedsSteamStarPrefix(item)) {
      base = ensureSteamStarPrefix(base.replace(/^★\s*/, ""));
    }
    if (/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i.test(base)) {
      return base;
    }
    const wear = dealWearLabel({ ...item, market_hash_name: base });
    return wear ? `${base} (${wear})` : base;
  }

  function catalogNameForWearRow(row, chunk, wearToCatalog, nameByWear) {
    const apiName = String(row?.market_hash_name || "").trim();
    if (!apiName) return "";
    if (wearToCatalog.has(apiName)) return wearToCatalog.get(apiName);
    const idx = chunk.findIndex((name) => {
      if (apiName === name) return true;
      const wearName = nameByWear?.get(name) || dealWearMarketName({ market_hash_name: name });
      return wearName === apiName;
    });
    return idx >= 0 ? chunk[idx] : apiName.replace(/^★\s*/, "").replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, "");
  }

  function isCachedDealRecord(provider, name, cache) {
    const key = provider + "::" + name;
    if (!cache.has(key)) return false;
    const rec = cache.get(key);
    if (rec === null) return false;
    return isVerifiedDealPrice(rec, provider);
  }

  // ── Resilient JSON POST: timeout + retry w/ backoff + 429/5xx handling ──────
  function postJson(url, body, { timeout = FETCH_TIMEOUT_MS, retries = FETCH_RETRIES, signal } = {}) {
    const attempt = (n) => {
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      if (signal) {
        if (signal.aborted) ctrl.abort();
        else signal.addEventListener("abort", onAbort, { once: true });
      }
      const timer = setTimeout(() => ctrl.abort(), timeout);

      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: ctrl.signal,
      })
        .then((r) => {
          if (r.status === 429 || r.status >= 500) {
            const err = new Error("HTTP " + r.status);
            err.retryable = true;
            err.status = r.status;
            throw err;
          }
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .finally(() => {
          clearTimeout(timer);
          if (signal) signal.removeEventListener("abort", onAbort);
        })
        .catch((err) => {
          // Caller-driven cancellation: never retry, surface a quiet abort.
          if (signal && signal.aborted) throw Object.assign(new Error("cancelled"), { cancelled: true });
          const retryable = err?.retryable || err?.name === "AbortError" || /Failed to fetch|NetworkError/i.test(err?.message || "");
          if (n < retries && retryable) {
            const backoff = 600 * Math.pow(2, n) + Math.random() * 300;
            return new Promise((res) => setTimeout(res, backoff)).then(() => attempt(n + 1));
          }
          throw err;
        });
    };
    return attempt(0);
  }

  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function buildSortOptions() {
    return [
      { id: "savings_desc", label: "Best Gap" },
      { id: "cheapest_asc", label: "Cheapest Overall" },
      { id: "name_asc", label: "A to Z" },
      ...MARKET_PROVIDERS.map((p) => ({
        id: `price_${p.id}_asc`,
        label: `Cheapest ${p.label}`,
      })),
    ];
  }

  function MarketHead({ provider }) {
    return (
      <span className="deals-market-head">
        {provider.image ? (
          <img src={provider.image} alt="" loading="lazy" decoding="async" />
        ) : null}
        {provider.label}
      </span>
    );
  }

  // `market` is printed above the price on phones, where the column header is
  // gone (see the card layout in deals.css).
  function DealPriceCell({ price, url, isCheapest, pending, market, showLabel }) {
    const formatted = fmtPrice(price);
    // The desktop table has a header row naming each column; the phone card has
    // no head, so the market name rides along inside the cell.
    const label = showLabel ? <span className="mdeals-cell-label">{market}</span> : null;
    // No quote yet and that marketplace is still being fetched: show it is
    // loading. A plain dash is reserved for "this market has no listing",
    // which is what the slow markets used to look like for their first
    // half-minute.
    if (!formatted && pending) {
      return (
        <span className="deals-cell" data-market={market}>
          {label}
          <span className="deals-price deals-price-pending" aria-label="Loading price" />
        </span>
      );
    }
    if (formatted && url) {
      return (
        <span className={classNames("deals-cell", isCheapest && "is-cheapest")} data-market={market}>
          {label}
          <a
            className={classNames("deals-price-link", isCheapest && "cheaper")}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {formatted}
          </a>
        </span>
      );
    }
    return (
      <span className={classNames("deals-cell", isCheapest && formatted && "is-cheapest")} data-market={market}>
        {label}
        <span className={classNames("deals-price", !formatted && "na", isCheapest && "cheaper")}>
          {formatted || "—"}
        </span>
      </span>
    );
  }

  function matchesTypeFilter(row, typeFilter) {
    if (!typeFilter || typeFilter === "all") return true;
    const category = String(row?.category || "").toLowerCase();
    const sub = String(row?.sub_filter || "").toLowerCase();
    const type = String(row?.type_filter || "").toLowerCase();
    const scope = String(row?.scope_filter || "").toLowerCase();

    if (typeFilter === "skins") {
      return category === "skins"
        || category === "knives"
        || category === "gloves"
        || WEAPON_TYPE_FILTERS.includes(sub);
    }
    if (typeFilter === "cases") {
      // Real weapon/collection cases only — not souvenir packages / capsules.
      return sub === "cases";
    }
    if (typeFilter === "capsules") {
      return sub === "capsules" || category === "capsules";
    }
    if (typeFilter === "stickers") {
      return category === "stickers" || sub === "stickers";
    }
    if (typeFilter === "agents") {
      return category === "agents" || sub === "agents";
    }
    if (typeFilter === "patches") {
      return category === "patches" || sub === "patches";
    }
    if (typeFilter === "music") {
      return category === "music"
        || sub === "music"
        || category === "music_kits"
        || sub === "music_kits";
    }
    if (typeFilter === "collectibles") {
      return category === "collectibles"
        || category === "graffiti"
        || category === "charms"
        || ["pins", "graffiti", "coins", "medals", "souvenirs", "operations", "charms"].includes(sub);
    }
    return category === typeFilter || sub === typeFilter || type === typeFilter || scope === typeFilter;
  }

  function pickPriceCandidates(catalog, typeFilter) {
    return (Array.isArray(catalog) ? catalog : [])
      .filter((it) => {
        const seedPrice = Number(it.seed_sell_price || 0);
        if (!(Number.isFinite(seedPrice) && seedPrice > 0 && seedPrice <= STEAM_MAX_LISTING_PRICE)) {
          return false;
        }
        return matchesTypeFilter({
          category: it.category || "",
          sub_filter: it.sub_filter || it.category || "",
          type_filter: it.type_filter || "",
          scope_filter: it.scope_filter || "",
        }, typeFilter);
      })
      .sort((a, b) => providerCandidateScore(a) - providerCandidateScore(b))
      .slice(0, MAX_PRICE_ITEMS);
  }

  // ── Dropdown select ────────────────────────────────────────────────────────
  function DdSelect({ label, value, options, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const current = options.find((o) => o.id === value) || options[0];

    useEffect(() => {
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener("mousedown", h);
      return () => document.removeEventListener("mousedown", h);
    }, []);

    return (
      <div className={classNames("deals-dd-wrap", open && "is-open")} ref={ref}>
        <span>{label}</span>
        <button
          type="button"
          className={classNames("deals-dd-trigger", open && "open")}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{current.label}</span>
          <i className="fa-solid fa-chevron-down" />
        </button>
        <div className={classNames("deals-dd-menu", open && "open")}>
          {options.map((opt) => (
            <button
              type="button"
              key={opt.id}
              className={classNames("deals-dd-option", value === opt.id && "active")}
              onClick={() => { onChange(opt.id); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Skeleton rows ──────────────────────────────────────────────────────────
  function SkeletonRows({ n = 8 }) {
    return Array.from({ length: n }, (_, i) => (
      <div className="deals-skeleton-row" key={i}>
        <div className="deals-skel img" />
        <div style={{ display: "grid", gap: "8px", paddingRight: "16px" }}>
          <div className="deals-skel" style={{ width: "60%" }} />
          <div className="deals-skel" style={{ width: "40%" }} />
        </div>
        {MARKET_PROVIDERS.map((p) => (
          <div key={p.id} className="deals-skel" style={{ width: "70%", justifySelf: "end" }} />
        ))}
      </div>
    ));
  }

  // ── Main page ──────────────────────────────────────────────────────────────
  function DealsPage() {
    const [catalog, setCatalog]       = useState([]);
    const [catalogLoading, setCatLoad]= useState(true);
    const [catalogError, setCatError] = useState("");
    const [steamMap, setSteamMap]     = useState({});
    const [skinportMap, setSkinMap]   = useState({});
    const [csfloatMap, setCsfloatMap] = useState({});
    const [whiteMap, setWhiteMap]     = useState({});
    const [dmarketMap, setDmarketMap] = useState({});
    const [waxpeerMap, setWaxpeerMap] = useState({});
    const [priceLoading, setPriceLoad]= useState(false);
    const [allChunksDone, setAllDone] = useState(false);
    // { providerId: true } once that marketplace has finished its fetch pass.
    const [providersDone, setProvidersDone] = useState({});
    const [providerErrors, setProviderErrors] = useState({}); // { providerId: message }
    const [timedOut, setTimedOut]     = useState(false);
    /* Chip and sort come from the URL so back and refresh restore the view.
       Read once at mount; written back with replaceState so filtering does not
       stack history entries - the back button should leave the page, not undo
       seven chip taps. */
    const initialParams = (() => {
      try { return new URLSearchParams(window.location.search); } catch (e) { return new URLSearchParams(); }
    })();
    const initialChip = (() => {
      const want = String(initialParams.get("chip") || "all");
      return PHONE_CHIPS.some((c) => c.id === want) ? want : "all";
    })();
    const initialSort = (() => {
      const want = String(initialParams.get("sort") || "savings_desc");
      return PHONE_SORTS.some((o) => o.id === want) ? want : "savings_desc";
    })();

    const { t } = useI18n();

    const [query,       setQuery]     = useState("");
    const [typeFilter,  setTypeFilter]= useState("all");
    const [sortBy,      setSortBy]    = useState(initialSort);
    // The spec asks for 20 cards per page on phones; the desktop table keeps 30.
    /* Declared here, not next to the isPhone state 600 lines down: PAGE_STEP
       reads it immediately, and a const used above its own declaration is a
       temporal-dead-zone ReferenceError that esbuild compiles without a word. */
    const isPhoneInitial = (() => {
      try { return window.matchMedia("(max-width: 900px)").matches; } catch (e) { return false; }
    })();
    const PAGE_STEP = isPhoneInitial ? 20 : PAGE_SIZE;

    /* Hoisted to sit with the rest of the state: the phone row filter and the
       visible slice below both read `isPhone`, and leaving its declaration 600
       lines further down made every render throw "Cannot access 'isPhone'
       before initialization" - which took the whole page out, not just the
       phone layout. Same class of bug as isPhoneInitial above. */
    const [isPhone, setIsPhone] = useState(isPhoneInitial);
    useEffect(() => {
      const query = window.matchMedia("(max-width: 900px)");
      const sync = () => setIsPhone(query.matches);
      query.addEventListener("change", sync);
      setIsPhone(query.matches);
      return () => query.removeEventListener("change", sync);
    }, []);
    const [visibleLimit, setVisible]  = useState(PAGE_STEP);
    const [phoneChip,   setPhoneChip] = useState(initialChip);
    const [sortSheetOpen, setSortSheetOpen] = useState(false);
    // When the last marketplace finished, for the "updated ..." line.
    const [lastUpdated, setLastUpdated] = useState(null);
    const [preloadTick, setPreloadTick] = useState(() => (
      window.__MARKET_PRICE_PRELOAD__?.loaded ? 1 : 0
    ));
    const loadMoreRef = useRef(null);

    // Cross-render price cache so switching filters doesn't refetch known data.
    // key: `${providerId}::${market_hash_name}` -> record | null (null = fetched, no listing)
    const priceCacheRef = useRef(new Map());

    // Drop stale "no listing" sentinels so a prior failed run can retry.
    useEffect(() => {
      const cache = priceCacheRef.current;
      cache.forEach((value, key) => { if (value === null) cache.delete(key); });
    }, []);

    useEffect(() => {
      const onPreload = () => setPreloadTick((tick) => tick + 1);
      window.addEventListener("cs2:market-prices-preloaded", onPreload);
      return () => window.removeEventListener("cs2:market-prices-preloaded", onPreload);
    }, []);

    // ── Load catalog ──────────────────────────────────────────────────────
    useEffect(() => {
      let cancelled = false;
      setCatLoad(true);
      setCatError("");
      postJsonCatalog()
        .then((payload) => {
          if (cancelled) return;
          const items = Array.isArray(payload?.items) ? payload.items : [];
          const valid = dedupeCatalogItems(items.filter((it) => it.image && Number(it.seed_sell_price) > 0));
          setCatalog(valid);
          if (!valid.length) setCatError("Catalog loaded but contained no usable items.");
        })
        .catch((err) => {
          if (cancelled) return;
          setCatalog([]);
          setCatError("Could not load the item catalog. " + (err?.message || ""));
        })
        .finally(() => { if (!cancelled) setCatLoad(false); });
      return () => { cancelled = true; };
    }, []);

    function postJsonCatalog() {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      return fetch(CATALOG_URL, { signal: ctrl.signal })
        .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .finally(() => clearTimeout(timer));
    }

    // ── Fetch prices (per-provider, cached, resilient) ─────────────────────
    useEffect(() => {
      if (!catalog.length) return;
      const ac = new AbortController();
      const signal = ac.signal;

      const priceCandidates = pickPriceCandidates(catalog, typeFilter);
      const names = priceCandidates.map((it) => it.market_hash_name);
      const selectedProviders = ALL_DEAL_PROVIDER_IDS;

      if (!names.length) {
        setSteamMap({});
        setSkinMap({});
        setCsfloatMap({});
        setWhiteMap({});
        setDmarketMap({});
        setWaxpeerMap({});
        setPriceLoad(false);
        setAllDone(true);
        setProvidersDone(Object.fromEntries(selectedProviders.map((id) => [id, true])));
        return undefined;
      }

      const cacheKey = (provider, name) => provider + "::" + name;
      const cacheRecord = (provider, name) => priceCacheRef.current.get(cacheKey(provider, name));
      const hasCachedRecord = (provider, name) => isCachedDealRecord(provider, name, priceCacheRef.current);
      const clearMissingSentinels = () => {
        names.forEach((name) => {
          selectedProviders.forEach((provider) => {
            const key = cacheKey(provider, name);
            if (priceCacheRef.current.get(key) === null) {
              priceCacheRef.current.delete(key);
            }
          });
        });
      };
      clearMissingSentinels();
      const seedMapFromCache = (provider) => {
        const out = {};
        names.forEach((n) => {
          const rec = priceCacheRef.current.get(cacheKey(provider, n));
          if (rec) {
            if (!isVerifiedDealPrice(rec, provider)) {
              if (provider === "steam") {
                // Keep last-good Steam in the map even if a prior refresh marked
                // it unverified (stale TTL / empty shell). Never delete a priced row.
                const lastGood = numericPrice(rec.current_price ?? rec.lowest_price ?? rec.price);
                if (lastGood == null || rec._from_catalog_seed || rec.from_preload) {
                  priceCacheRef.current.delete(cacheKey(provider, n));
                } else {
                  out[n] = rec;
                  return;
                }
              }
            } else {
              out[n] = rec;
              return;
            }
          }
          // Never seed Steam from catalog — those prices are stale ROI seeds.
          if (provider === "steam") {
            return;
          }
          const preload = window.CS2React?.getMarketPricePreload?.(provider, n)
            || window.__MARKET_PRICE_PRELOAD__?.[provider]?.[n];
          const normalized = window.CS2React?.normalizePreloadPriceRecord?.(preload, provider)
            || (preload?.market_hash_name ? preload : null);
          if (normalized && isVerifiedDealPrice(normalized, provider)) {
            priceCacheRef.current.set(cacheKey(provider, n), normalized);
            out[n] = normalized;
          }
        });
        return out;
      };

      const setterFor = {
        steam: setSteamMap,
        skinport: setSkinMap,
        csfloat: setCsfloatMap,
        white_market: setWhiteMap,
        dmarket: setDmarketMap,
        waxpeer: setWaxpeerMap,
      };

      const liveMapsRef = {};
      selectedProviders.forEach((provider) => {
        liveMapsRef[provider] = seedMapFromCache(provider);
      });

      // Seed display maps instantly from cache; clear maps we no longer compare.
      Object.entries(setterFor).forEach(([provider, setter]) => {
        setter(selectedProviders.includes(provider) ? { ...liveMapsRef[provider] } : {});
      });

      setProviderErrors({});
      setTimedOut(false);
      setAllDone(false);
      setProvidersDone({});

      const fetchProvider = (providerId, chunk, wearNames = chunk, { liveRefresh = false, cacheOnly = false } = {}) => {
        switch (providerId) {
          case "steam":
            // Cache-first paints Factory New overview quotes immediately.
            // Listing scrapes are not wear-safe (one Steam page for every wear).
            return postJson("get_roi_prices_cached.php", {
              source: "steam",
              range: "30d",
              market_hash_names: wearNames,
              cache_only: !liveRefresh,
              skip_catalog_fallback: true,
              db_cache_first: true,
              max_cache_age_hours: CACHE_MAX_AGE_HOURS,
              steam_last_good_max_age_hours: STEAM_KEEP_MAX_AGE_HOURS,
              allow_live_refresh: liveRefresh,
              prefer_live: liveRefresh,
              ignore_cache: false,
              deals_mode: true,
              steam_fast_overview: true,
              steam_listing_fallback: false,
              steam_listing_first: false,
              steam_listing_fallback_limit: 0,
            }, {
              signal,
              timeout: liveRefresh ? STEAM_LIVE_FETCH_TIMEOUT_MS : 20000,
            });
          case "skinport":
            return postJson("get_roi_prices_cached.php", {
              source: "skinport", range: "30d", market_hash_names: wearNames,
              cache_only: false, db_cache_first: true,
              max_cache_age_hours: LIVE_ASK_MAX_AGE_HOURS,
              skip_catalog_fallback: true,
              allow_live_refresh: true,
              prefer_live: true,
              deals_mode: true,
              ignore_cache: false,
            }, { signal, timeout: 30000 });
          case "csfloat":
            return postJson("get_csfloat_prices.php", {
              market_hash_names: wearNames,
              cache_only: false,
              ignore_auctions: true,
              buy_now_only: true,
              skip_history: true,
              deals_mode: true,
              prefer_live: true,
              max_cache_age_hours: LIVE_ASK_MAX_AGE_HOURS,
            }, { signal, timeout: 45000 });
          case "white_market":
            return postJson("get_white_market_prices.php", {
              market_hash_names: wearNames,
              cache_only: cacheOnly,
              skip_history: true,
              deals_mode: true,
              prefer_live: !cacheOnly,
              max_cache_age_hours: LIVE_ASK_MAX_AGE_HOURS,
            }, { signal, timeout: 30000 });
          case "dmarket":
            return postJson("get_dmarket_prices.php", {
              market_hash_names: wearNames,
              cache_only: cacheOnly,
              skip_history: true,
              deals_mode: !cacheOnly,
              prefer_live: !cacheOnly,
              max_live_requests: cacheOnly ? 0 : wearNames.length,
            }, { signal, timeout: 45000 });
          case "waxpeer":
            return postJson("get_waxpeer_prices.php", {
              market_hash_names: wearNames,
              cache_only: cacheOnly,
              skip_history: true,
              deals_mode: true,
              prefer_live: !cacheOnly,
              max_cache_age_hours: LIVE_ASK_MAX_AGE_HOURS,
            }, { signal, timeout: 30000 });
          default:
            return Promise.resolve({ items: [] });
        }
      };

      const nameByWear = new Map(
        priceCandidates.map((item) => [item.market_hash_name, dealWearMarketName(item)])
      );
      const wearToCatalog = new Map(
        priceCandidates.map((item) => [dealWearMarketName(item), item.market_hash_name])
      );

      const mergeForProvider = (providerId, items) => {
        const live = liveMapsRef[providerId];
        const setter = setterFor[providerId];
        if (!live || !setter) return;
        items.forEach((r) => {
          if (!r?.market_hash_name) return;
          const existing = live[r.market_hash_name];
          if (existing && isVerifiedDealPrice(existing, providerId) && !isVerifiedDealPrice(r, providerId)) {
            return;
          }
          live[r.market_hash_name] = r;
        });
        setter({ ...live });
      };

      const ingestProviderItems = (providerId, chunk, items) => {
        const got = new Set();
        const responded = new Set();
        items.forEach((r) => {
          if (!r?.market_hash_name) return;
          const catalogName = catalogNameForWearRow(r, chunk, wearToCatalog, nameByWear);
          if (!catalogName) return;
          // Only treat as a definitive response when verified or an explicit miss.
          // Empty Steam shell rows (null price) must not block live refill.
          const verified = isVerifiedDealPrice(r, providerId);
          const explicitMiss = !!(r._no_listing || (r.price_verified === false && (r.current_price == null || Number(r.current_price) <= 0) && r.updated_at));
          if (verified || explicitMiss) {
            responded.add(catalogName);
          }
          if (!verified) return;
          const stored = { ...r, market_hash_name: catalogName };
          priceCacheRef.current.set(cacheKey(providerId, catalogName), stored);
          got.add(catalogName);
        });
        chunk.forEach((n) => {
          if (!got.has(n) && !responded.has(n) && !priceCacheRef.current.has(cacheKey(providerId, n))) {
            // Steam: never persist a "no listing" sentinel that would hide last-good
            // quotes after a 429 / timeout / empty cache-only shell.
            // White.Market and DMarket are live-ask feeds whose first call can
            // land while their export is still building. Caching a sentinel
            // then froze those two columns as dashes for the whole session,
            // even though a retry would have priced every row.
            if (!NO_MISS_SENTINEL_PROVIDERS.includes(providerId)) {
              priceCacheRef.current.set(cacheKey(providerId, n), null);
            }
          }
        });
        mergeForProvider(providerId, items
          .map((r) => {
            if (!r?.market_hash_name || !isVerifiedDealPrice(r, providerId)) return null;
            const catalogName = catalogNameForWearRow(r, chunk, wearToCatalog, nameByWear);
            return catalogName ? { ...r, market_hash_name: catalogName } : null;
          })
          .filter(Boolean));
        return got;
      };

      const fetchProviderChunk = async (providerId, chunk, liveRefresh = false, { cacheOnly = false } = {}) => {
        const wearChunk = chunk.map((name) => nameByWear.get(name) || name);
        const res = await fetchProvider(providerId, chunk, wearChunk, { liveRefresh, cacheOnly });
        if (signal.aborted) return new Set();
        const items = Array.isArray(res?.items) ? res.items : [];
        return ingestProviderItems(providerId, chunk, items);
      };

      let firstPaintDone = false;
      const markFirstPaint = () => {
        if (firstPaintDone) return;
        firstPaintDone = true;
        if (!signal.aborted) setPriceLoad(false);
      };

      // If either market is already seeded/cached, drop skeletons immediately so
      // a slow Steam refresh can't leave the table empty for minutes.
      const alreadySeeded = selectedProviders.some((provider) =>
        Object.keys(liveMapsRef[provider] || {}).length > 0
        || !names.some((n) => !hasCachedRecord(provider, n))
      );
      if (alreadySeeded) {
        markFirstPaint();
      }

      // Fetch a single provider's missing names, isolated from other providers.
      // nameList preserves display priority (top rows first).
      const runProvider = (providerId, nameList, { sequential = false } = {}) => {
        const missing = (nameList || []).filter((n) => !hasCachedRecord(providerId, n));
        if (!missing.length) {
          markFirstPaint();
          return Promise.resolve();
        }

        const chunks = chunkArray(
          missing,
          providerId === "steam"
            ? STEAM_API_CHUNK
            // DMarket prices one name at a time upstream, so a 50-name chunk
            // can run past its timeout and paint nothing. Smaller chunks land
            // progressively instead.
            : providerId === "dmarket"
              ? DMARKET_API_CHUNK
              : API_CHUNK
        );
        const concurrency = sequential
          ? 1
          : providerId === "dmarket"
            ? DMARKET_CONCURRENCY
            : providerId === "steam"
              ? STEAM_CONCURRENCY
              : PRICE_CONCURRENCY;
        let next = 0;

        const worker = async () => {
          while (!signal.aborted && next < chunks.length) {
            const chunk = chunks[next++];
            if (providerId === "steam" && next > 1) {
              await new Promise((res) => setTimeout(res, STEAM_CHUNK_DELAY_MS));
            }
            try {
              await fetchProviderChunk(providerId, chunk, false);
              markFirstPaint();
              if (providerId === "steam") {
                await fetchProviderChunk(providerId, chunk, true);
              }
            } catch (err) {
              if (err?.cancelled || signal.aborted) return;
              // A live-ask chunk that timed out has usually still finished on
              // the server and landed in its cache; ask for that copy before
              // giving the column up as dashes.
              if (NO_MISS_SENTINEL_PROVIDERS.includes(providerId)) {
                await new Promise((res) => setTimeout(res, 4000));
                if (signal.aborted) return;
                try {
                  await fetchProviderChunk(providerId, chunk, false, { cacheOnly: true });
                  markFirstPaint();
                  continue;
                } catch (_retryError) {
                  // Fall through to the error below.
                }
              }
              console.warn("[deals] provider fetch failed", providerId, err?.message || err);
              setProviderErrors((prev) => prev[providerId] ? prev : { ...prev, [providerId]: err?.message || "request failed" });
            }
          }
        };

        return Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
      };

      const priorityNames = names.slice(0, Math.min(PRIORITY_PRICE_ITEMS, names.length));
      const restNames = names.slice(priorityNames.length);

      // Everything already cached? Nothing to fetch.
      const anyMissing = selectedProviders.some((p) =>
        names.some((n) => !hasCachedRecord(p, n)));
      if (!anyMissing) {
        setPriceLoad(false);
        setAllDone(true);
        setProvidersDone(Object.fromEntries(selectedProviders.map((id) => [id, true])));
        return () => ac.abort();
      }

      // Keep skeletons only until the first real paint. If one market was already
      // seeded (common when prices are already cached), don't cover the table again.
      if (!firstPaintDone) {
        setPriceLoad(true);
      }
      const overall = setTimeout(() => { if (!signal.aborted) setTimedOut(true); }, PRICE_LOAD_TIMEOUT_MS);

      const markProviderDone = (providerId) => {
        if (signal.aborted) return;
        setProvidersDone((prev) => (prev[providerId] ? prev : { ...prev, [providerId]: true }));
      };

      (async () => {
        // Phase 1: top-of-table items first. Steam sequential (rate-limited); others concurrent.
        await Promise.allSettled(
          selectedProviders.map((providerId) => runProvider(providerId, priorityNames, { sequential: providerId === "steam" })
            // The visible rows are priced once phase 1 finishes for a market,
            // so stop showing its cells as loading even though phase 2 runs on.
            .then(() => markProviderDone(providerId), () => markProviderDone(providerId)))
        );
        if (signal.aborted) return;
        markFirstPaint();
        setPriceLoad(false);

        // Phase 2: remaining candidates after the visible top is priced.
        if (restNames.length) {
          await Promise.allSettled(
            selectedProviders.map((providerId) => runProvider(providerId, restNames, { sequential: false }))
          );
        }
        if (signal.aborted) return;
        clearTimeout(overall);
        setPriceLoad(false);
        setAllDone(true);

        // Fill any Steam gaps still missing after the main pass (rate-limit friendly).
        if (!selectedProviders.includes("steam")) return;

        const refreshNames = [...priorityNames, ...restNames].filter((n) => {
          const rec = priceCacheRef.current.get(cacheKey("steam", n));
          return !rec || !isVerifiedDealPrice(rec, "steam");
        });
        if (!refreshNames.length) return;
        const refreshChunks = chunkArray(
          refreshNames.slice(0, MAX_PRICE_ITEMS),
          STEAM_API_CHUNK
        );
        for (const chunk of refreshChunks) {
          if (signal.aborted) break;
          try {
            await fetchProviderChunk("steam", chunk, true);
            await new Promise((res) => setTimeout(res, STEAM_CHUNK_DELAY_MS));
          } catch (err) {
            if (!err?.cancelled) {
              console.warn("[deals] steam live refresh failed", err?.message || err);
            }
          }
        }
      })();

      return () => {
        ac.abort();
        clearTimeout(overall);
        clearMissingSentinels();
      };
    }, [catalog, typeFilter]);

    // When market-price preload arrives, merge into maps without aborting live Steam fetches.
    useEffect(() => {
      if (!preloadTick || !catalog.length) return;
      const priceCandidates = pickPriceCandidates(catalog, typeFilter);
      if (!priceCandidates.length) return;

      const mergeProvider = (provider, setter) => {
        if (provider === "steam") return; // never trust preload for Steam deals
        setter((prev) => {
          const next = { ...prev };
          let changed = false;
          priceCandidates.forEach((item) => {
            const name = item.market_hash_name;
            if (next[name] && isVerifiedDealPrice(next[name], provider)) return;
            const preload = window.CS2React?.getMarketPricePreload?.(provider, name)
              || window.__MARKET_PRICE_PRELOAD__?.[provider]?.[name];
            const normalized = window.CS2React?.normalizePreloadPriceRecord?.(preload, provider)
              || (preload?.market_hash_name ? preload : null);
            if (!normalized || !isVerifiedDealPrice(normalized, provider)) return;
            priceCacheRef.current.set(`${provider}::${name}`, normalized);
            next[name] = normalized;
            changed = true;
          });
          return changed ? next : prev;
        });
      };

      mergeProvider("skinport", setSkinMap);
      mergeProvider("csfloat", setCsfloatMap);
      mergeProvider("white_market", setWhiteMap);
      mergeProvider("dmarket", setDmarketMap);
      mergeProvider("waxpeer", setWaxpeerMap);
    }, [preloadTick, catalog, typeFilter]);

    // ── Build rows ────────────────────────────────────────────────────────
    const rows = useMemo(() => {
      const q = (query || "").toLowerCase().trim();
      // Price-fetch pool is category-aware (max 100) so each tab has real quotes.
      const pricedCatalog = pickPriceCandidates(catalog, typeFilter);

      return pricedCatalog
        .map((it) => {
          const steamRec  = steamMap[it.market_hash_name];
          const skinRec   = skinportMap[it.market_hash_name];
          const cfRec     = csfloatMap[it.market_hash_name];
          const whiteRec  = whiteMap[it.market_hash_name];
          const dmarketRec= dmarketMap[it.market_hash_name];
          const waxpeerRec= waxpeerMap[it.market_hash_name];
          const steamPrice = verifiedProviderPrice(steamRec, "steam", STEAM_MAX_LISTING_PRICE);
          const skinPrice = verifiedProviderPrice(skinRec, "skinport");
          const cfPrice   = verifiedProviderPrice(cfRec, "csfloat");
          const whitePrice= verifiedProviderPrice(whiteRec, "white_market");
          const dmarketPrice = verifiedProviderPrice(dmarketRec, "dmarket");
          const waxpeerPrice = verifiedProviderPrice(waxpeerRec, "waxpeer");

          const priceMap = {
            steam: steamPrice,
            skinport: skinPrice,
            csfloat: cfPrice,
            white_market: whitePrice,
            dmarket: dmarketPrice,
            waxpeer: waxpeerPrice,
          };
          const wearMarketName = dealWearMarketName(it);
          const providerUrls = {
            steam: providerRowUrl("steam", steamRec, wearMarketName),
            skinport: providerRowUrl("skinport", skinRec, wearMarketName),
            csfloat: providerRowUrl("csfloat", cfRec, wearMarketName),
            white_market: providerRowUrl("white_market", whiteRec, wearMarketName),
            dmarket: providerRowUrl("dmarket", dmarketRec, wearMarketName),
            waxpeer: providerRowUrl("waxpeer", waxpeerRec, wearMarketName),
          };

          const quoted = ALL_DEAL_PROVIDER_IDS
            .map((id) => ({ id, price: priceMap[id] }))
            .filter((entry) => entry.price != null && entry.price > 0);
          const expensivePrice = quoted.length
            ? Math.max(...quoted.map((entry) => entry.price))
            : 0;
          const cheapestPrice = quoted.length
            ? Math.min(...quoted.map((entry) => entry.price))
            : null;
          const savings = quoted.length >= 2 && expensivePrice > 0
            ? ((expensivePrice - cheapestPrice) / expensivePrice) * 100
            : 0;
          const cheapestProvider = quoted.length
            ? (quoted.find((entry) => entry.price === cheapestPrice)?.id || "")
            : "";
          const cheapestUrl = cheapestProvider ? providerUrls[cheapestProvider] : "";

          return {
            market_hash_name: it.market_hash_name,
            display_name:     it.display_name || it.market_hash_name,
            selected_wear:    dealWearLabel(it),
            type_note:        it.type_note || it.category_label || "",
            category:         it.category || "cases",
            sub_filter:       it.sub_filter || it.category || "",
            type_filter:      it.type_filter || "",
            scope_filter:     it.scope_filter || "",
            image:            it.image || "",
            prices:           priceMap,
            quote_count:      quoted.length,
            savings,
            cheapestPrice,
            provider_urls:    providerUrls,
            cheapest_provider: cheapestProvider,
            cheapest_url:     cheapestUrl,
          };
        })
        .filter((row) => {
          if (q && !row.display_name.toLowerCase().includes(q) &&
              !row.market_hash_name.toLowerCase().includes(q)) return false;
          if (!matchesTypeFilter(row, typeFilter)) return false;
          // Need at least two verified marketplace quotes to form a deal gap.
          if (row.quote_count < 2) return false;
          if (row.savings <= 0.1) return false;
          if (row.savings > MAX_PLAUSIBLE_SAVINGS) return false;
          return true;
        })
        .sort((a, b) => {
          if (sortBy === "cheapest_asc") {
            return (a.cheapestPrice || Infinity) - (b.cheapestPrice || Infinity);
          }
          // Added for the phone sheet; the desktop list never offered these.
          if (sortBy === "price_desc") {
            return (b.cheapestPrice || 0) - (a.cheapestPrice || 0);
          }
          if (sortBy === "newest") {
            // No per-deal timestamp exists, so "newest" is the catalogue's own
            // order, which is newest-first. Falling through to savings would
            // have made the option a silent no-op.
            return 0;
          }
          if (sortBy === "name_asc") {
            return a.display_name.localeCompare(b.display_name);
          }
          if (sortBy.startsWith("price_") && sortBy.endsWith("_asc")) {
            const providerId = sortBy.slice("price_".length, -"_asc".length);
            const ap = a.prices?.[providerId];
            const bp = b.prices?.[providerId];
            return (ap == null ? Infinity : ap) - (bp == null ? Infinity : bp);
          }
          return b.savings - a.savings;
        })
        .slice(0, MAX_DEALS);
    }, [catalog, steamMap, skinportMap, csfloatMap, whiteMap, dmarketMap, waxpeerMap, query, typeFilter, sortBy]);

    /* Chip -> rows. The category part reuses the existing type filter; the
       price band is applied here because `cheapest_price` is only known after
       the quotes land, so it cannot be folded into the category pass. */
    const chipConfig = PHONE_CHIPS.find((c) => c.id === phoneChip) || PHONE_CHIPS[0];
    const phoneRows = useMemo(() => {
      if (!isPhone) return rows;
      let out = rows;
      if (chipConfig.type && chipConfig.type !== "all") {
        out = out.filter((r) => matchesTypeFilter(r, chipConfig.type));
      }
      if (chipConfig.maxPrice != null) {
        out = out.filter((r) => {
          const p = Number(r.cheapest_price);
          return Number.isFinite(p) && p > 0 && p <= chipConfig.maxPrice;
        });
      }
      return out;
    }, [rows, isPhone, chipConfig]);

    // Keep chip and sort in the URL without stacking history entries.
    useEffect(() => {
      if (!isPhone) return;
      try {
        const next = new URLSearchParams(window.location.search);
        if (phoneChip === "all") next.delete("chip"); else next.set("chip", phoneChip);
        if (sortBy === "savings_desc") next.delete("sort"); else next.set("sort", sortBy);
        const qs = next.toString();
        const url = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
        window.history.replaceState(null, "", url);
      } catch (e) { /* history blocked: the view still works, it just will not restore */ }
    }, [isPhone, phoneChip, sortBy]);

    // Stamp the moment every marketplace has reported, for the header line.
    useEffect(() => {
      const ids = ALL_DEAL_PROVIDER_IDS;
      if (ids.every((id) => providersDone[id])) setLastUpdated(Date.now());
    }, [providersDone]);

    /* "updated just now / 7 min ago / 2 h ago". Null until every marketplace
       has reported, so the line never claims freshness it does not have. */
    const relativeUpdated = useMemo(() => {
      if (!lastUpdated) return t("mdeals_justNow");
      const mins = Math.max(0, Math.round((Date.now() - lastUpdated) / 60000));
      if (mins < 1) return t("mdeals_justNow");
      if (mins < 60) return t("mdeals_minutesAgo", { n: mins });
      return t("mdeals_hoursAgo", { n: Math.round(mins / 60) });
    }, [lastUpdated, t]);

    const activeSortLabel = (PHONE_SORTS.find((o) => o.id === sortBy) || PHONE_SORTS[0]).label;

    const sourceRows   = isPhone ? phoneRows : rows;
    const visibleRows  = sourceRows.slice(0, visibleLimit);
    const hasMoreRows  = sourceRows.length > visibleLimit;
    const isLoading    = catalogLoading || (catalog.length > 0 && priceLoading && rows.length === 0);
    const sortOptions = buildSortOptions();

    useEffect(() => {
      if (!hasMoreRows) return undefined;
      const node = loadMoreRef.current;
      if (!node || typeof IntersectionObserver !== "function") return undefined;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setVisible((current) => Math.min(current + PAGE_STEP, sourceRows.length));
          }
        },
        { root: null, rootMargin: "240px 0px", threshold: 0 }
      );
      observer.observe(node);
      return () => observer.disconnect();
    }, [hasMoreRows, rows.length, visibleLimit]);

    return (
      <Layout>
        <div className="deals-shell">

          {/* ── Phone header, chips and results row (owner, 2026-10-03) ──
              Desktop keeps its filter card untouched; everything in this block
              is phone-only and sits above the same table the desktop renders. */}
          {isPhone ? (
            <>
              {/* Title only (owner, 2026-10-03). The market-count/updated line
                  went with the logo and search icon above it - the chips and
                  the result count already say what is being shown, and the
                  space goes to the deals. */}
              <header className="mdeals-head">
                <h1 className="mdeals-title">{t("mdeals_title")}</h1>
              </header>

              <div className="mdeals-chips" role="group" aria-label={t("mdeals_title")}>
                {PHONE_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className={classNames("mdeals-chip", phoneChip === chip.id && "is-active")}
                    aria-pressed={phoneChip === chip.id}
                    onClick={() => { setPhoneChip(chip.id); setVisible(PAGE_STEP); }}
                  >
                    {chip.maxPrice != null
                      ? t(chip.label, { amount: fmtPrice(chip.maxPrice) || `€${chip.maxPrice}` })
                      : t(chip.label)}
                  </button>
                ))}
              </div>

              <div className="mdeals-results">
                <span className="mdeals-count">{t("mdeals_count", { n: sourceRows.length.toLocaleString() })}</span>
                <button
                  type="button"
                  className="mdeals-sort"
                  aria-haspopup="dialog"
                  aria-expanded={sortSheetOpen ? "true" : "false"}
                  onClick={() => setSortSheetOpen(true)}
                >
                  {t(activeSortLabel)}
                  <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                </button>
              </div>
            </>
          ) : null}

          {/* Phones drop the whole filter card (owner, 2026-10-02: "on mobile
              deals remove this"). It has to be the frame and not just its
              contents: .deals-filter-frame is what draws the bordered,
              gradient card in the screenshot, so hiding only the controls
              would leave an empty bordered box behind. The type tabs inside
              were already desktop-only, and the phone Category dropdown went
              with it - it could not render once the frame is !isPhone. */}
          {!isPhone ? (
          <div className="deals-filter-frame">
            {/* ── Type tabs (phones get the dropdown below instead) ── */}
            {!isPhone ? (
              <div className="deals-type-tabs">
                {TYPE_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={classNames("deals-type-tab", typeFilter === t.id && "active")}
                    onClick={() => { setTypeFilter(t.id); setVisible(PAGE_SIZE); }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ) : null}

            {/* ── Controls ── */}
            <div className="deals-controls-wrap">
              <div className="deals-filter-right">
                <div className="deals-search-wrap">
                  <i className="fa-solid fa-magnifying-glass" />
                  <input
                    type="text"
                    placeholder="Search items…"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE); }}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {query && (
                    <button type="button" className="deals-search-clear" onClick={() => setQuery("")}>
                      <i className="fa-solid fa-xmark" />
                    </button>
                  )}
                </div>
                <DdSelect
                  label="Sort by"
                  value={sortBy}
                  options={sortOptions}
                  onChange={(v) => { setSortBy(v); setVisible(PAGE_SIZE); }}
                />
              </div>
            </div>
          </div>
          ) : null}

          {/* ── Meta bar (desktop only - the item count sits inside the same
                 card the owner asked to remove on phones) ── */}
          {!isPhone ? (
          <div className="deals-meta">
            <span className="deals-meta-left" aria-hidden="true" />
            <span className="deals-meta-right">
              <span>{catalog.length.toLocaleString()} items · 30-day window</span>
            </span>
          </div>
          ) : null}

          {/* ── Non-blocking status notices ── */}
          {catalogError && (
            <div className="deals-status err">
              <i className="fa-solid fa-triangle-exclamation" /> {catalogError}
            </div>
          )}

          {/* ── Table ── */}
          <div className="deals-card">
            <div className="deals-table-scroll">
              <div className="deals-thead">
                <span></span>
                <span>Item</span>
                {MARKET_PROVIDERS.map((provider) => (
                  <span key={provider.id}>
                    <MarketHead provider={provider} />
                  </span>
                ))}
              </div>

              {isLoading ? (
                <SkeletonRows n={10} />
              ) : visibleRows.length === 0 ? (
                <div className="deals-empty">
                  <div className="deals-empty-icon">
                    <i className="fa-solid fa-tags" />
                  </div>
                  <strong>{isPhone ? t("mdeals_emptyTitle") : "No deals found"}</strong>
                  <span>
                    {catalogError
                      ? "We couldn't load the catalog. Please refresh to try again."
                      : "No items with a verified price gap across marketplaces matched your filters. Try another category or search."}
                  </span>
                  {/* Only offered when a filter is actually responsible - a
                      "Clear filters" button that clears nothing is worse than
                      no button. */}
                  {isPhone && !catalogError && (phoneChip !== "all" || query.trim()) ? (
                    <button
                      type="button"
                      className="mdeals-clear"
                      onClick={() => { setPhoneChip("all"); setQuery(""); setVisible(PAGE_STEP); }}
                    >
                      {t("mdeals_clearFilters")}
                    </button>
                  ) : null}
                </div>
              ) : (
                visibleRows.map((row, index) => {
                  const go = (url) => { if (url) window.location.href = url; };
                  return (
                    <div
                      key={row.market_hash_name}
                      className={classNames("deals-row", row.cheapest_url && "is-clickable")}
                      style={{ "--row-index": index }}
                      role={row.cheapest_url ? "link" : undefined}
                      tabIndex={row.cheapest_url ? 0 : undefined}
                      onClick={() => go(row.cheapest_url)}
                      onKeyDown={(event) => {
                        if (row.cheapest_url && (event.key === "Enter" || event.key === " ")) {
                          event.preventDefault();
                          go(row.cheapest_url);
                        }
                      }}
                    >

                      <div className="deals-row-img">
                        {row.image
                          ? <img src={row.image} alt={row.display_name} loading="lazy" />
                          : <span className="deals-row-placeholder">{row.display_name.slice(0,2).toUpperCase()}</span>}
                      </div>

                      <div className="deals-row-info">
                        <div className="deals-item-name">{row.display_name}</div>
                        {(row.selected_wear || row.type_note) && (
                          <div className="deals-item-sub">
                            {[row.selected_wear, row.type_note].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>

                      {/* No saving badge on phones (owner, 2026-10-04). The
                          market strip below already highlights the cheapest
                          price, so the percentage restated it while crowding
                          the item name. "Cheapest on Steam" stays: that is the
                          case where there is no saving to show, and the strip
                          alone does not say it. The desktop table keeps its
                          own gap column. */}
                      {isPhone && row.cheapest_provider === "steam" ? (
                        <span className="mdeals-cheapest-steam">{t("mdeals_cheapestSteam")}</span>
                      ) : null}

                      {MARKET_PROVIDERS.map((provider) => (
                        <DealPriceCell
                          key={provider.id}
                          market={provider.label}
                          price={row.prices?.[provider.id]}
                          url={row.provider_urls?.[provider.id]}
                          isCheapest={row.cheapest_provider === provider.id}
                          pending={!providersDone[provider.id]}
                          showLabel={isPhone}
                        />
                      ))}

                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Sort sheet (phones) ──
              A dialog rather than a styled menu so the backdrop click, the
              Escape key and the focus ring all behave the way the rest of the
              phone UI does. Options are PHONE_SORTS, so adding one is a config
              change. */}
          {isPhone && sortSheetOpen ? (
            <div
              className="mdeals-sheet-scrim"
              role="presentation"
              onClick={() => setSortSheetOpen(false)}
            >
              <div
                className="mdeals-sheet"
                role="dialog"
                aria-modal="true"
                aria-label={t("mdeals_sortLabel")}
                onClick={(event) => event.stopPropagation()}
              >
                <h2 className="mdeals-sheet-title">{t("mdeals_sortLabel")}</h2>
                {PHONE_SORTS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={classNames("mdeals-sheet-option", sortBy === option.id && "is-active")}
                    aria-pressed={sortBy === option.id}
                    onClick={() => { setSortBy(option.id); setVisible(PAGE_STEP); setSortSheetOpen(false); }}
                  >
                    {t(option.label)}
                    {sortBy === option.id ? <i className="fa-solid fa-check" aria-hidden="true" /> : null}
                  </button>
                ))}
                <button
                  type="button"
                  className="mdeals-sheet-cancel"
                  onClick={() => setSortSheetOpen(false)}
                >
                  {t("mdeals_cancel")}
                </button>
              </div>
            </div>
          ) : null}

          {/* ── Infinite scroll sentinel ── */}
          {hasMoreRows ? (
            <div
              ref={loadMoreRef}
              className="deals-load-more deals-load-more-sentinel"
              aria-hidden="true"
            />
          ) : null}

        </div>
      </Layout>
    );
  }

  mountPage(<DealsPage />);
})();
