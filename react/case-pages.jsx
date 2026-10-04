(() => {
  const { Layout, CaseItemCard, SortChipPicker, mountPage } = window.CS2React;
  const { useCallback, useEffect, useMemo, useRef, useState } = React;
  const {
    lookupCaseCatalog,
    lookupCollectionCatalog,
    resolveCollectionItemSource,
    formatCaseIntroDate,
    COLLECTION_CATEGORY_COLORS,
    CASE_CATEGORY_COLORS,
    loadCatalog,
    stripWear,
    formatEuroPrice,
    buildItemHref,
    catalogImageSource,
    loadSouvenirSkinLookup,
    itemSupportsSouvenirSkin,
  } = window.CS2ReactData || {};

  /* ─── WEAR RANGES ─────────────────────────────────────────── */

  const STEAM_WEAR_RANGES = [
    { label: "Factory New",    min: 0,    max: 0.07 },
    { label: "Minimal Wear",   min: 0.07, max: 0.15 },
    { label: "Field-Tested",   min: 0.15, max: 0.38 },
    { label: "Well-Worn",      min: 0.38, max: 0.45 },
    { label: "Battle-Scarred", min: 0.45, max: 1    },
  ];

  function raritySortRank(rarity) {
    const key = String(rarity || "").trim().toLowerCase();
    const lookup = {
      contraband: 0,
      covert: 1,
      classified: 2,
      restricted: 3,
      milspec: 4,
      "mil-spec": 4,
      industrial: 5,
      consumer: 6,
    };
    return lookup[key] ?? 99;
  }

  function compareByName(left, right) {
    return `${left.weapon} | ${left.skin}`.localeCompare(`${right.weapon} | ${right.skin}`);
  }

  /* ─── PRICE HELPERS ───────────────────────────────────────── */

  function steamMarketUrl(name) {
    return "https://steamcommunity.com/market/listings/730/" + encodeURIComponent(name);
  }

  function formatEuro(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? "\u20ac" + n.toFixed(2) : "\u2014";
  }

  function parseMoney(value) {
    if (value == null) return null;
    const raw = String(value).replace(",", ".").replace(/[^\d.-]/g, "");
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function formatSignedPercent(value, digits = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "\u2014";
    return (n > 0 ? "+" : "") + n.toFixed(digits) + "%";
  }

  function parseFloatRange(floatRange) {
    const m = String(floatRange || "").match(/([0-9.]+)\s*-\s*([0-9.]+)/);
    if (!m) return { min: 0, max: 1 };
    return {
      min: Math.max(0, Math.min(1, Number(m[1]))),
      max: Math.max(0, Math.min(1, Number(m[2]))),
    };
  }

  function wearOptionsForItem(item) {
    const range = parseFloatRange(item.float);
    const wears = STEAM_WEAR_RANGES
      .filter((w) => range.min <= w.max && range.max >= w.min)
      .map((w) => w.label);
    return wears.length ? wears : ["Factory New"];
  }

  function mhn(item, wear, st, sv) {
    const base = item.weapon + " | " + item.skin + " (" + wear + ")";
    if (sv) return "Souvenir " + item.weapon + " | " + item.skin + " (" + wear + ")";
    return (st ? "StatTrak\u2122 " : "") + base;
  }

  function sortByPrice(records) {
    return records
      .filter((r) => Number(r && r.current_price) > 0)
      .sort((a, b) => Number(a.current_price) - Number(b.current_price));
  }

  function priceRangeDisplay(records) {
    const sorted = sortByPrice(records);
    if (!sorted.length) return "Steam price unavailable";
    const lo = sorted[0].current_price;
    const hi = sorted[sorted.length - 1].current_price;
    if (Math.abs(Number(lo) - Number(hi)) < 0.005) return formatEuro(lo) + " Steam low";
    return formatEuro(lo) + " – " + formatEuro(hi);
  }

  function unique(arr) { return Array.from(new Set(arr.filter(Boolean))); }

  function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  async function postSteamPrices(marketHashNames, range, extra) {
    const response = await fetch("get_roi_prices_cached.php", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(Object.assign({
        source: "steam",
        range,
        market_hash_names: marketHashNames,
      }, extra || {})),
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  }

  function mergeRecordsIntoMap(map, records) {
    records.forEach((record) => {
      if (record && record.market_hash_name) {
        map.set(record.market_hash_name, record);
      }
    });
  }

  function hasLivePrice(record) {
    return Boolean(record && Number(record.current_price) > 0);
  }

  function isStatTrakName(name) {
    return String(name || "").includes("StatTrak");
  }

  async function fetchAllSteamPrices(names, range, onProgress) {
    const merged = new Map();

    for (const chunk of chunkArray(names, 48)) {
      const data = await postSteamPrices(chunk, range, { steam_catalog_only: true });
      mergeRecordsIntoMap(merged, Array.isArray(data && data.items) ? data.items : []);
      if (typeof onProgress === "function") onProgress(new Map(merged));
    }

    const missing = names.filter((name) => !hasLivePrice(merged.get(name)));
    for (const chunk of chunkArray(missing, 20)) {
      const data = await postSteamPrices(chunk, range, {
        prefer_live: true,
        skip_catalog_fallback: true,
        steam_listing_fallback: true,
        steam_listing_fallback_limit: Math.min(8, chunk.length),
      });
      mergeRecordsIntoMap(merged, Array.isArray(data && data.items) ? data.items : []);
      if (typeof onProgress === "function") onProgress(new Map(merged));
    }

    // StatTrak and Souvenir wears are rarely in the Steam catalog cache, and
    // the pass above only fetches 8 listings per chunk of 20, so the rest
    // stayed "—". Each gets a pass that fetches every missing name
    // (user, 2026-10-02: "not all souvenir prices are loading, load them all").
    const stMissing = names.filter((name) => isStatTrakName(name) && !hasLivePrice(merged.get(name)));
    const svMissing = names.filter((name) => isSouvenirName(name) && !hasLivePrice(merged.get(name)));
    for (const chunk of chunkArray(stMissing.concat(svMissing), 8)) {
      const data = await postSteamPrices(chunk, range, {
        prefer_live: true,
        skip_catalog_fallback: true,
        steam_listing_fallback: true,
        steam_listing_fallback_limit: chunk.length,
        // Rare wears sit unlisted on Steam for weeks: keep the last price seen
        // for up to 30 days instead of a dash.
        steam_last_good_max_age_hours: 720,
      });
      mergeRecordsIntoMap(merged, Array.isArray(data && data.items) ? data.items : []);
      if (typeof onProgress === "function") onProgress(new Map(merged));
    }

    return merged;
  }

  function InlineHelp({ label = "More info", children, align = "right" }) {
    return (
      <span className={"ui-help " + (align === "left" ? "left" : "right")}>
        <button type="button" className="ui-help-trigger" aria-label={label}>
          <i className="fa-solid fa-circle-question" />
        </button>
        <span className="ui-help-bubble" role="tooltip">{children}</span>
      </span>
    );
  }

  function isSouvenirName(name) {
    return /^Souvenir\s+/i.test(String(name || "").trim());
  }

  function buildPriceTargets(config) {
    const isCollection = config.kind === "collection";
    const names = [config.title];
    config.items.forEach((item) => {
      const baseName = `${item.weapon} | ${item.skin}`;
      wearOptionsForItem(item).forEach((w) => {
        names.push(mhn(item, w, false, false));
        if (isCollection) {
          if (typeof itemSupportsSouvenirSkin === "function" && itemSupportsSouvenirSkin(baseName, config.title)) {
            names.push(mhn(item, w, false, true));
          }
        } else {
          names.push(mhn(item, w, true, false));
        }
      });
    });
    return unique(names);
  }

  function buildPriceMap(records) {
    const map = new Map();
    records.forEach((r) => { if (r && r.market_hash_name) map.set(r.market_hash_name, r); });
    return map;
  }

  const WEAR_ORDER = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];
  const SKIN_CATEGORIES = new Set(["skins", "knives", "gloves"]);

  function buildCatalogPriceLookup(catalog) {
    const map = new Map();
    (Array.isArray(catalog) ? catalog : []).forEach((entry) => {
      if (!SKIN_CATEGORIES.has(String(entry.category || ""))) return;
      const base = stripWear ? stripWear(entry.market_hash_name || entry.display_name || "") : "";
      if (!base) return;

      const existing = map.get(base);
      if (!existing) {
        map.set(base, entry);
        return;
      }

      const existingPrice = Number(existing.seed_sell_price || 0);
      const nextPrice = Number(entry.seed_sell_price || 0);
      if (nextPrice > 0 && existingPrice <= 0) {
        map.set(base, entry);
        return;
      }

      const existingWear = String(existing.selected_wear || "");
      const nextWear = String(entry.selected_wear || "");
      const existingIndex = WEAR_ORDER.indexOf(existingWear);
      const nextIndex = WEAR_ORDER.indexOf(nextWear);
      if (nextIndex >= 0 && (existingIndex < 0 || nextIndex < existingIndex)) {
        map.set(base, entry);
      }
    });
    return map;
  }

  function buildCatalogNameLookup(catalog) {
    const map = new Map();
    (Array.isArray(catalog) ? catalog : []).forEach((entry) => {
      const name = String(entry.market_hash_name || entry.display_name || "").trim();
      if (name) map.set(name.toLowerCase(), entry);
    });
    return map;
  }

  function enrichItem(item, priceMap, loading, catalogLookup, options = {}) {
    const collectionOrigin = String(options.collectionOrigin || "").trim();
    const isCollection = Boolean(collectionOrigin);
    const wears     = wearOptionsForItem(item);
    const baseName  = `${item.weapon} | ${item.skin}`;
    const supportsSouvenir = isCollection
      && typeof itemSupportsSouvenirSkin === "function"
      && itemSupportsSouvenirSkin(baseName, collectionOrigin);
    const normNames = wears.map((w) => mhn(item, w, false, false));
    const stNames   = isCollection ? [] : wears.map((w) => mhn(item, w, true, false));
    const svNames   = supportsSouvenir ? wears.map((w) => mhn(item, w, false, true)) : [];
    const normRecs  = normNames.map((n) => priceMap.get(n)).filter(Boolean);
    const stRecs    = stNames.map((n) => priceMap.get(n)).filter(Boolean);
    const svRecs    = svNames.map((n) => priceMap.get(n)).filter(Boolean);
    const bestNorm  = sortByPrice(normRecs)[0] || null;
    const bestST    = sortByPrice(stRecs)[0] || null;
    const bestSV    = sortByPrice(svRecs)[0] || null;
    const normPrice = bestNorm && Number(bestNorm.current_price) > 0 ? Number(bestNorm.current_price) : null;
    const stPrice   = bestST   && Number(bestST.current_price)   > 0 ? Number(bestST.current_price)   : null;
    const svPrice   = bestSV   && Number(bestSV.current_price)   > 0 ? Number(bestSV.current_price)   : null;
    const defName   = normNames[0];
    const catalogEntry = catalogLookup && catalogLookup.get(baseName);
    const catalogPrice = Number(catalogEntry?.seed_sell_price || 0);
    const hasCatalogPrice = catalogPrice > 0;
    const catalogPriceDisplay = hasCatalogPrice && typeof formatEuroPrice === "function"
      ? formatEuroPrice(catalogPrice)
      : (hasCatalogPrice ? formatEuro(catalogPrice) : "");
    const catalogImage = catalogEntry && typeof catalogImageSource === "function"
      ? catalogImageSource(catalogEntry)
      : "";
    const catalogHref = catalogEntry && typeof buildItemHref === "function"
      ? buildItemHref(catalogEntry)
      : "";

    const appendOrigin = (url) => {
      if (!url || !collectionOrigin) return url;
      const joiner = url.includes("?") ? "&" : "?";
      return `${url}${joiner}origin=${encodeURIComponent(collectionOrigin)}`;
    };

    return Object.assign({}, item, {
      img: item.img || catalogImage || item.img,
      type_note: catalogEntry?.type_note || item.badge,
      name_color: catalogEntry?.name_color || item.name_color,
      category_label: catalogEntry?.category_label || "Weapon Skins",
      normalPriceDisplay: hasCatalogPrice
        ? catalogPriceDisplay
        : (bestNorm ? bestNorm.current_price_display : (loading ? "Loading…" : "—")),
      normalPriceRangeDisplay: hasCatalogPrice
        ? `${catalogPriceDisplay} catalog`
        : (loading ? "Checking Steam…" : priceRangeDisplay(normRecs)),
      stattrakPriceDisplay: bestST ? bestST.current_price_display : (loading && !hasCatalogPrice ? "Loading…" : "—"),
      stattrakPriceRangeDisplay: loading && !hasCatalogPrice ? "Checking Steam…" : priceRangeDisplay(stRecs),
      souvenirPriceDisplay: bestSV ? bestSV.current_price_display : (loading && !hasCatalogPrice && supportsSouvenir ? "Loading…" : "—"),
      souvenirPriceRangeDisplay: loading && !hasCatalogPrice ? "Checking Steam…" : priceRangeDisplay(svRecs),
      supportsSouvenir,
      normalSteamUrl: bestNorm ? (bestNorm.market_url || steamMarketUrl(defName)) : steamMarketUrl(defName),
      stattrakSteamUrl: bestST ? (bestST.market_url || steamMarketUrl(stNames[0])) : steamMarketUrl(stNames[0] || defName),
      souvenirSteamUrl: bestSV ? (bestSV.market_url || steamMarketUrl(svNames[0])) : (svNames[0] ? steamMarketUrl(svNames[0]) : ""),
      detailsUrl: appendOrigin(catalogHref || ("item_page.php?market_hash_name=" + encodeURIComponent((bestNorm && bestNorm.market_hash_name) || defName)
        + "&lookup_name=" + encodeURIComponent(defName))),
      steamPriceLoading: !hasCatalogPrice && loading,
      _normPrice: hasCatalogPrice ? catalogPrice : (bestNorm && Number(bestNorm.current_price) > 0 ? Number(bestNorm.current_price) : null),
      _stPrice: stPrice,
      _svPrice: svPrice,
    });
  }

  /* ─── CASE HISTORY MODAL ─────────────────────────────────── */

  const HIST_RANGES = [
    { key: "1M", label: "1 Month"  },
    { key: "3M", label: "3 Months" },
    { key: "6M", label: "6 Months" },
    { key: "1Y", label: "1 Year"   },
  ];

  function buildLinePath(pts, xFn, yFn) {
    return pts.map((p, i) => (i === 0 ? "M" : "L") + " " + xFn(p).toFixed(1) + " " + yFn(p).toFixed(1)).join(" ");
  }

  function buildAreaPath(pts, xFn, yFn, bottomY) {
    if (!pts.length) return "";
    const last = pts[pts.length - 1];
    return (
      "M " + xFn(pts[0]).toFixed(1) + " " + bottomY +
      " L " + xFn(pts[0]).toFixed(1) + " " + yFn(pts[0]).toFixed(1) +
      " " + pts.slice(1).map(p => "L " + xFn(p).toFixed(1) + " " + yFn(p).toFixed(1)).join(" ") +
      " L " + xFn(last).toFixed(1) + " " + bottomY + " Z"
    );
  }

  function CaseHistoryModal({ config, onClose }) {
    const [range,     setRange]     = useState("1Y");
    const [histState, setHistState] = useState({ loading: true, points: [], error: "" });
    const [hover,     setHover]     = useState(null);
    const svgRef  = useRef(null);
    const plotRef = useRef(null);

    useEffect(() => {
      let alive = true;
      setHistState({ loading: true, points: [], error: "" });
      setHover(null);

      const params = new URLSearchParams({
        lookup_name: config.title,
        range,
        source: "steam",
        wear: "Factory New",
      });

      fetch("get_market_chart_bundle.php?" + params.toString())
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(data => {
          if (!alive) return;
          const raw = (data && data.series && data.series.steam && data.series.steam.points) || [];
          const points = raw
            .map(p => ({
              date:      String(p.date || ""),
              timestamp: Date.parse(String(p.date)) || 0,
              price:     Number(p.price),
              volume:    Number(p.volume || 0),
            }))
            .filter(p => p.price > 0 && p.timestamp > 0)
            .sort((a, b) => a.timestamp - b.timestamp);
          setHistState({
            loading: false,
            points,
            error: points.length < 2 ? "No price history available for this period." : "",
          });
        })
        .catch(e => {
          if (!alive) return;
          setHistState({ loading: false, points: [], error: "Could not load price history." });
        });

      return () => { alive = false; };
    }, [range, config.title]);

    const stats = useMemo(() => {
      const pts = histState.points;
      if (pts.length < 2) return null;
      const prices  = pts.map(p => p.price);
      const current = prices[prices.length - 1];
      const first   = prices[0];
      const high    = Math.max(...prices);
      const low     = Math.min(...prices);
      const changePct = ((current - first) / first) * 100;
      const totalVol  = pts.reduce((s, p) => s + p.volume, 0);
      return { current, high, low, changePct, totalVol };
    }, [histState.points]);

    const chart = useMemo(() => {
      const pts = histState.points;
      if (pts.length < 2) return null;

      const W  = 1060;
      const PH = 240;
      const VH = 72;
      const mg = { top: 20, right: 38, bottom: 34, left: 68 };
      const iw  = W  - mg.left - mg.right;
      const ipH = PH - mg.top  - mg.bottom;

      const prices = pts.map(p => p.price);
      const vols   = pts.map(p => p.volume);
      const minT = pts[0].timestamp;
      const maxT = pts[pts.length - 1].timestamp;
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      const pad  = Math.max((maxP - minP) * 0.12, maxP * 0.04, 0.02);
      const yMin  = Math.max(0, minP - pad);
      const yMax  = maxP + pad;
      const tRange = maxT - minT || 1;
      const pRange = yMax  - yMin || 1;
      const maxVol = Math.max(...vols, 1);

      const xFn = p => mg.left + ((p.timestamp - minT) / tRange) * iw;
      const yFn = p => mg.top  + (1 - (p.price - yMin)  / pRange) * ipH;

      const yTicks = Array.from({ length: 5 }, (_, i) => ({
        value: yMin + (yMax - yMin) * i / 4,
        y:     mg.top + (1 - i / 4) * ipH,
      }));
      const xTicks = Array.from({ length: 6 }, (_, i) => ({
        ts: minT + tRange * i / 5,
        x:  mg.left + iw * i / 5,
      }));

      const linePath = buildLinePath(pts, xFn, yFn);
      const areaPath = buildAreaPath(pts, xFn, yFn, mg.top + ipH);

      const barW = Math.max(1, iw / pts.length * 0.55);
      const bars = pts.map(p => ({
        x:      xFn(p) - barW / 2,
        h:      (p.volume / maxVol) * (VH - 10),
        y:      (VH - 10) - (p.volume / maxVol) * (VH - 10),
        date:   p.date,
        volume: p.volume,
        timestamp: p.timestamp,
      }));

      return { W, PH, VH, mg, iw, ipH, xFn, yFn, yTicks, xTicks, linePath, areaPath, bars, minT, maxT };
    }, [histState.points]);

    const isUp    = stats ? stats.changePct >= 0 : true;
    const lineClr = isUp ? "#22c55e" : "#ef4444";
    const gradId  = isUp ? "hist-grad-up" : "hist-grad-dn";

    const fmtDate = ts => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });

    const chartAnimKey = range + "-" + histState.points.length + "-" + (histState.points[histState.points.length - 1] ? histState.points[histState.points.length - 1].timestamp : 0);

    const onPointerMove = e => {
      if (!chart || !svgRef.current) return;
      const rect   = svgRef.current.getBoundingClientRect();
      const localX = ((e.clientX - rect.left) / rect.width) * chart.W;
      const ratio  = Math.min(1, Math.max(0, (localX - chart.mg.left) / chart.iw));
      const tgt    = chart.minT + (chart.maxT - chart.minT) * ratio;
      let best = null;
      histState.points.forEach(p => {
        const d = Math.abs(p.timestamp - tgt);
        if (!best || d < best.d) best = { d, p };
      });
      if (!best) return;
      const pRect = plotRef.current && plotRef.current.getBoundingClientRect();
      setHover({
        x:     chart.xFn(best.p),
        y:     chart.yFn(best.p),
        left:  e.clientX - (pRect ? pRect.left : 0) + 16,
        top:   e.clientY - (pRect ? pRect.top  : 0) - 80,
        price: "€" + best.p.price.toFixed(2),
        vol:   best.p.volume > 0 ? best.p.volume.toLocaleString() : "—",
        date:  best.p.date,
      });
    };

    return (
      <div className="hist-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="hist-modal">

          {/* ── Header ── */}
          <div className="hist-header">
            <div className="hist-header-left">
              <img src={config.image} alt={config.title} />
              <div>
                <h2>{config.title}</h2>
                <span className="hist-subtitle">Prices, Stats &amp; History</span>
              </div>
            </div>
            <div className="hist-header-right">
              <div className="hist-range-tabs">
                {HIST_RANGES.map(r => (
                  <button
                    key={r.key}
                    type="button"
                    className={"hist-range-tab" + (range === r.key ? " active" : "")}
                    onClick={() => setRange(r.key)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button className="hist-close" onClick={onClose} aria-label="Close">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          </div>

          {/* ── Stats ── */}
          {stats && (
            <div className="hist-stats-row">
              <div className="hist-stat-card">
                <div className="hist-stat-label">Current Price</div>
                <div className="hist-stat-value">{"€" + stats.current.toFixed(2)}</div>
              </div>
              <div className="hist-stat-card">
                <div className="hist-stat-label">Period High</div>
                <div className="hist-stat-value up">{"€" + stats.high.toFixed(2)}</div>
              </div>
              <div className="hist-stat-card">
                <div className="hist-stat-label">Period Low</div>
                <div className="hist-stat-value down">{"€" + stats.low.toFixed(2)}</div>
              </div>
              <div className="hist-stat-card">
                <div className="hist-stat-label">Change ({range})</div>
                <div className={"hist-stat-value " + (isUp ? "up" : "down")}>
                  {(isUp ? "+" : "") + stats.changePct.toFixed(1) + "%"}
                </div>
              </div>
            </div>
          )}

          {/* ── Chart ── */}
          <div className="hist-chart-section" ref={plotRef}
               onPointerMove={onPointerMove}
               onPointerLeave={() => setHover(null)}>
            <div className="hist-chart-label">Steam Market Price</div>

            {histState.loading ? (
              <div className="hist-loading">Loading price history…</div>
            ) : histState.error ? (
              <div className="hist-loading">{histState.error}</div>
            ) : chart ? (
              <>
                <svg
                  key={chartAnimKey}
                  ref={svgRef}
                  viewBox={"0 0 " + chart.W + " " + chart.PH}
                  preserveAspectRatio="none"
                  style={{ height: chart.PH + "px" }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%"   stopColor={lineClr} stopOpacity="0.24" />
                      <stop offset="100%" stopColor={lineClr} stopOpacity="0"    />
                    </linearGradient>
                  </defs>
                  {/* Y grid + labels */}
                  {chart.yTicks.map(t => (
                    <g key={t.value}>
                      <line x1={chart.mg.left} x2={chart.W - chart.mg.right}
                            y1={t.y} y2={t.y}
                            stroke="rgba(148,163,184,0.11)" strokeWidth="1" strokeDasharray="5 8" />
                      <text x={chart.mg.left - 10} y={t.y + 4}
                            fill="rgba(191,219,254,0.55)" fontSize="11" textAnchor="end" fontWeight="700">
                        {"€" + t.value.toFixed(2)}
                      </text>
                    </g>
                  ))}
                  {/* X labels */}
                  {chart.xTicks.map(t => (
                    <text key={t.ts} x={t.x} y={chart.PH - 8}
                          fill="rgba(191,219,254,0.5)" fontSize="11" textAnchor="middle" fontWeight="700">
                      {fmtDate(t.ts)}
                    </text>
                  ))}
                  {/* Area + line */}
                  <path className="hist-chart-area" d={chart.areaPath} fill={"url(#" + gradId + ")"} />
                  <path className="hist-chart-line" d={chart.linePath} fill="none"
                        stroke={lineClr} strokeWidth="2.6"
                        strokeLinecap="round" strokeLinejoin="round" />
                  {/* Hover indicator */}
                  {hover && (
                    <g>
                      <line x1={hover.x} x2={hover.x}
                            y1={chart.mg.top} y2={chart.mg.top + chart.ipH}
                            stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
                      <circle cx={hover.x} cy={hover.y} r="5"
                              fill={lineClr} stroke="#0f172a" strokeWidth="2.5" />
                    </g>
                  )}
                </svg>

                <div className="hist-vol-divider" />
                <div className="hist-chart-label" style={{ paddingTop: 8 }}>Volume</div>

                {/* Volume bars */}
                <svg
                     key={chartAnimKey + "-bars"}
                     viewBox={"0 0 " + chart.W + " " + chart.VH}
                     preserveAspectRatio="none"
                     style={{ height: chart.VH + "px" }}>
                  {chart.bars.map((b, i) => (
                    <rect key={i}
                      className="hist-bar-anim"
                      style={{ animationDelay: (i * 24) + "ms" }}
                      x={b.x} y={b.y}
                      width={Math.max(1, chart.W / chart.bars.length * 0.55)}
                      height={b.h}
                      fill={hover && hover.date === b.date
                        ? "rgba(96,165,250,0.75)"
                        : "rgba(96,165,250,0.26)"}
                      rx="1" />
                  ))}
                </svg>

                {hover && (
                  <div className="hist-tooltip"
                       style={{ left: hover.left + "px", top: hover.top + "px" }}>
                    <b>{hover.date}</b>
                    <span>{hover.price}</span>
                    <span className="hist-tooltip-vol">Volume: {hover.vol}</span>
                  </div>
                )}
              </>
            ) : null}
          </div>

        </div>
      </div>
    );
  }

  /* ─── PAGE CONFIGS ────────────────────────────────────────── */

  const pageConfigs = {
    fracture: {
      title:      "Fracture Case",
      image:      "assets/cases/fracture-case.webp",
      price:      "0.60",
      keyPrice:   "+€2.19 Key",
      collection: { img: "assets/collections/fracture.webp", name: "Fracture Collection" },
      caseInfo:   { img: "assets/cases/fracture-case.webp",  name: "Fracture Case" },
      stats: [
        { label: "Total Profit",  value: "\u2014", key: "profit"      },
        { label: "Investing ROI", value: "74.3%",  key: "investingROI", highlight: true },
        { label: "Listings",      value: "238,983", key: "listings"   },
      ],
      items: [
        { rarity: "covert",     weapon: "AK-47",       badge: "Covert",     skin: "Legion of Anubis", img: "assets/weapons/rifles/ak47-legion-of-anubis.webp.webp", float: "0.00 - 0.70" },
        { rarity: "covert",     weapon: "Desert Eagle", badge: "Covert",     skin: "Printstream",     img: "assets/weapons/rifles/deagle-printstream.webp",          float: "0.00 - 0.70" },
        { rarity: "classified", weapon: "M4A4",         badge: "Classified", skin: "Tooth Fairy",     img: "assets/weapons/rifles/M4A4Tooth Fairy.webp",             float: "0.00 - 0.73" },
        { rarity: "classified", weapon: "Glock-18",     badge: "Classified", skin: "Vogue",           img: "assets/weapons/rifles/glock-vogue.webp",                 float: "0.00 - 0.70" },
        { rarity: "classified", weapon: "XM1014",       badge: "Classified", skin: "Entombed",        img: "assets/weapons/shotguns/Entombed.webp",                  float: "0.00 - 0.80" },
        { rarity: "restricted", weapon: "Tec-9",        badge: "Restricted", skin: "Brother",         img: "assets/weapons/pistols/tec9-brother.webp",               float: "0.00 - 0.80" },
        { rarity: "restricted", weapon: "MAG-7",        badge: "Restricted", skin: "Monster Call",    img: "assets/weapons/shotguns/mag7-monster-call.webp",         float: "0.00 - 1.00" },
        { rarity: "restricted", weapon: "MAC-10",       badge: "Restricted", skin: "Allure",          img: "assets/weapons/smgs/mac10-allure.webp",                  float: "0.00 - 0.70" },
        { rarity: "restricted", weapon: "MP5-SD",       badge: "Restricted", skin: "Kitbash",         img: "assets/weapons/smgs/mp5sd-kitbash.webp",                 float: "0.00 - 0.85" },
        { rarity: "restricted", weapon: "Galil AR",     badge: "Restricted", skin: "Connexion",       img: "assets/weapons/rifles/galil-connexion.webp",             float: "0.00 - 0.90" },
        { rarity: "milspec",    weapon: "SG 553",       badge: "Mil-Spec",   skin: "Ol' Rusty",       img: "assets/weapons/rifles/sg553-ol-rusty.webp",              float: "0.40 - 1.00" },
        { rarity: "milspec",    weapon: "P250",         badge: "Mil-Spec",   skin: "Cassette",        img: "assets/weapons/pistols/p250-cassette.webp",              float: "0.00 - 0.80" },
        { rarity: "milspec",    weapon: "Negev",        badge: "Mil-Spec",   skin: "Ultralight",      img: "assets/weapons/heavy/negev-ultralight.webp",             float: "0.00 - 0.80" },
        { rarity: "milspec",    weapon: "P90",          badge: "Mil-Spec",   skin: "Freight",         img: "assets/weapons/smgs/p90-freight.webp",                   float: "0.00 - 0.80" },
        { rarity: "milspec",    weapon: "PP-Bizon",     badge: "Mil-Spec",   skin: "Runic",           img: "assets/weapons/smgs/ppbizon-runic.webp",                 float: "0.00 - 0.90" },
        { rarity: "milspec",    weapon: "SSG 08",       badge: "Mil-Spec",   skin: "Mainframe 001",   img: "assets/weapons/rifles/deepreffscout.webp",               float: "0.00 - 0.85" },
      ],
    },
    revolution: {
      title:      "Revolution Case",
      image:      "assets/cases/revolution-case.webp",
      price:      "0.30",
      keyPrice:   "+€2.19 Key",
      collection: { img: "assets/collections/revolution.webp",      name: "Revolution Collection" },
      caseInfo:   { img: "assets/cases/revolution-case.webp",        name: "Revolution Case" },
      stats: [
        { label: "Total Profit",  value: "\u2014",   key: "profit"      },
        { label: "Investing ROI", value: "81.4%",    key: "investingROI", highlight: true },
        { label: "Listings",      value: "412,000",  key: "listings"    },
      ],
      items: [
        { rarity: "covert",     weapon: "M4A4",        badge: "Covert",     skin: "Temukau",       img: "assets/weapons/rifles/M4A4 Temukau.webp",      float: "0.00 - 0.70" },
        { rarity: "covert",     weapon: "AK-47",       badge: "Covert",     skin: "Head Shot",     img: "assets/weapons/rifles/AK-47Head Shot.webp",    float: "0.00 - 0.70" },
        { rarity: "classified", weapon: "P2000",       badge: "Classified", skin: "Wicked Sick",   img: "assets/weapons/pistols/P2000 Wicked Sick.webp",float: "0.00 - 0.70" },
        { rarity: "classified", weapon: "AWP",         badge: "Classified", skin: "Duality",       img: "assets/weapons/pistols/Duality.webp",          float: "0.00 - 0.70" },
        { rarity: "classified", weapon: "UMP-45",      badge: "Classified", skin: "Wild Child",    img: "assets/weapons/smgs/Wild Child.webp",          float: "0.00 - 0.70" },
        { rarity: "restricted", weapon: "R8 Revolver", badge: "Restricted", skin: "Banana Cannon", img: "assets/weapons/pistols/Banana Cannon.webp",    float: "0.00 - 0.80" },
        { rarity: "restricted", weapon: "M4A1-S",      badge: "Restricted", skin: "Emphorosaur-S", img: "assets/weapons/rifles/Emphorosaur-S.webp",     float: "0.00 - 0.80" },
        { rarity: "restricted", weapon: "P90",         badge: "Restricted", skin: "Neoqueen",      img: "assets/weapons/smgs/Neoqueen.webp",            float: "0.00 - 1.00" },
        { rarity: "restricted", weapon: "MAC-10",      badge: "Restricted", skin: "Sakkaku",       img: "assets/weapons/smgs/Sakkaku.webp",             float: "0.00 - 0.70" },
        { rarity: "restricted", weapon: "Glock-18",    badge: "Restricted", skin: "Umbral Rabbit", img: "assets/weapons/smgs/Umbral Rabbit.webp",       float: "0.00 - 0.85" },
        { rarity: "restricted", weapon: "SG 553",      badge: "Restricted", skin: "Cyberforce",    img: "assets/weapons/rifles/Cyberforce.webp",        float: "0.00 - 0.90" },
        { rarity: "milspec",    weapon: "SCAR-20",     badge: "Mil-Spec",   skin: "Fragments",     img: "assets/weapons/rifles/Fragments.webp",         float: "0.40 - 1.00" },
        { rarity: "milspec",    weapon: "P250",        badge: "Mil-Spec",   skin: "Re.built",      img: "assets/weapons/pistols/Re.built.webp",         float: "0.00 - 0.80" },
        { rarity: "milspec",    weapon: "MP9",         badge: "Mil-Spec",   skin: "Featherweight", img: "assets/weapons/smgs/Featherweight.webp",       float: "0.00 - 0.80" },
        { rarity: "milspec",    weapon: "Tec-9",       badge: "Mil-Spec",   skin: "Rebel",         img: "assets/weapons/pistols/Rebel.webp",            float: "0.00 - 0.80" },
        { rarity: "milspec",    weapon: "MAG-7",       badge: "Mil-Spec",   skin: "Insomnia",      img: "assets/weapons/shotguns/Insomnia.webp",        float: "0.00 - 0.90" },
        { rarity: "milspec",    weapon: "MP5-SD",      badge: "Mil-Spec",   skin: "Liquidation",   img: "assets/weapons/smgs/Liquidatio.webp",          float: "0.00 - 0.85" },
      ],
    },
  };

  function CaseInlineChart({ title, image, rangeKey }) {
    const [range, setRange] = useState(rangeKey || "1Y");
    const [histState, setHistState] = useState({ loading: true, points: [], error: "" });
    const plotRef = useRef(null);
    const svgRef  = useRef(null);
    const [hover, setHover] = useState(null);

    useEffect(() => {
      let alive = true;
      setHistState({ loading: true, points: [], error: "" });
      const params = new URLSearchParams({
        lookup_name: title,
        range,
        source: "steam",
        wear: "Factory New",
      });
      fetch("get_market_chart_bundle.php?" + params.toString())
        .then((res) => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
        .then((data) => {
          if (!alive) return;
          const raw = (data && data.series && data.series.steam && data.series.steam.points) || [];
          const points = raw
            .map((point) => ({
              date: String(point.date || ""),
              timestamp: Date.parse(String(point.date || "")) || 0,
              price: Number(point.price),
              volume: Number(point.volume || 0),
            }))
            .filter((point) => point.timestamp > 0 && point.price > 0)
            .sort((a, b) => a.timestamp - b.timestamp);
          setHistState({ loading: false, points, error: points.length ? "" : "No chart data yet." });
        })
        .catch((err) => {
          if (!alive) return;
          setHistState({ loading: false, points: [], error: (err && err.message) || "Chart unavailable." });
        });
      return () => { alive = false; };
    }, [title, range]);

    const stats = useMemo(() => {
      const pts = histState.points;
      if (pts.length < 2) return null;
      const prices = pts.map((p) => p.price);
      const current = prices[prices.length - 1];
      const first = prices[0];
      const changePct = first > 0 ? ((current - first) / first) * 100 : null;
      return { current, changePct: Number.isFinite(changePct) ? changePct : null };
    }, [histState.points]);

    const chart = useMemo(() => {
      const pts = histState.points;
      if (pts.length < 2) return null;
      const W = 1060, PH = 220, mg = { top: 18, right: 28, bottom: 28, left: 58 };
      const iw = W - mg.left - mg.right;
      const ipH = PH - mg.top - mg.bottom;
      const prices = pts.map((p) => p.price);
      const minT = pts[0].timestamp;
      const maxT = pts[pts.length - 1].timestamp;
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);
      const pad = Math.max((maxP - minP) * 0.12, maxP * 0.04, 0.02);
      const yMin = Math.max(0, minP - pad);
      const yMax = maxP + pad;
      const tRange = maxT - minT || 1;
      const pRange = yMax - yMin || 1;
      const xFn = (p) => mg.left + ((p.timestamp - minT) / tRange) * iw;
      const yFn = (p) => mg.top + (1 - (p.price - yMin) / pRange) * ipH;
      return {
        W, PH, mg, ipH, xFn, yFn,
        linePath: buildLinePath(pts, xFn, yFn),
        areaPath: buildAreaPath(pts, xFn, yFn, mg.top + ipH),
        minT, maxT,
      };
    }, [histState.points]);

    const isUp = stats ? (stats.changePct || 0) >= 0 : true;
    const lineClr = isUp ? "#22c55e" : "#ef4444";
    const gradId = isUp ? "detail-grad-up" : "detail-grad-dn";

    const onPointerMove = (e) => {
      if (!chart || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const localX = ((e.clientX - rect.left) / rect.width) * chart.W;
      const ratio = Math.min(1, Math.max(0, (localX - chart.mg.left) / (chart.W - chart.mg.left - chart.mg.right)));
      const tgt = chart.minT + (chart.maxT - chart.minT) * ratio;
      let best = null;
      histState.points.forEach((p) => {
        const d = Math.abs(p.timestamp - tgt);
        if (!best || d < best.d) best = { d, p };
      });
      if (!best) return;
      const pRect = plotRef.current && plotRef.current.getBoundingClientRect();
      setHover({
        x: chart.xFn(best.p),
        y: chart.yFn(best.p),
        left: e.clientX - (pRect ? pRect.left : 0) + 12,
        top: e.clientY - (pRect ? pRect.top : 0) - 72,
        price: "€" + best.p.price.toFixed(2),
        date: best.p.date,
      });
    };

    return (
      <section className="detail-chart-panel">
        <div className="detail-panel-head">
          <div>
            <h2>Price History</h2>
            <p>{title} on Steam Market</p>
          </div>
          <div className="detail-range-tabs">
            {HIST_RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className={"detail-range-tab" + (range === r.key ? " active" : "")}
                onClick={() => setRange(r.key)}
              >
                {r.label.replace(" Months", "M").replace(" Month", "M").replace(" Year", "Y")}
              </button>
            ))}
          </div>
        </div>

        {stats && stats.changePct !== null && (
          <div className="detail-mini-stats" style={{ marginBottom: 12, maxWidth: 280 }}>
            <div className="detail-mini-stat">
              <span>Period change</span>
              <strong className={isUp ? "up" : "down"}>
                {(isUp ? "+" : "") + stats.changePct.toFixed(1) + "%"}
              </strong>
            </div>
            <div className="detail-mini-stat">
              <span>Latest</span>
              <strong>{"€" + stats.current.toFixed(2)}</strong>
            </div>
          </div>
        )}

        <div className="detail-chart-wrap" ref={plotRef} onMouseMove={onPointerMove} onMouseLeave={() => setHover(null)}>
          {histState.loading && <div className="detail-chart-empty">Loading chart…</div>}
          {!histState.loading && histState.error && <div className="detail-chart-empty">{histState.error}</div>}
          {!histState.loading && chart && (
            <>
              <svg ref={svgRef} viewBox={"0 0 " + chart.W + " " + chart.PH} preserveAspectRatio="none">
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineClr} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={lineClr} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={chart.areaPath} fill={"url(#" + gradId + ")"} />
                <path d={chart.linePath} fill="none" stroke={lineClr} strokeWidth="2.5" />
                {hover && (
                  <g>
                    <line x1={hover.x} x2={hover.x} y1={chart.mg.top} y2={chart.mg.top + chart.ipH}
                          stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
                    <circle cx={hover.x} cy={hover.y} r="5" fill={lineClr} stroke="#0f172a" strokeWidth="2.5" />
                  </g>
                )}
              </svg>
              {hover && (
                <div className="hist-tooltip" style={{ left: hover.left + "px", top: hover.top + "px" }}>
                  <b>{hover.date}</b>
                  <span>{hover.price}</span>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    );
  }

  const COLLECTION_TO_CASE_KEY = {
    "The Fracture Collection": "fracture",
    "Fracture Collection": "fracture",
  };

  const CASE_SLUGS = {
    "fracture case": "fracture",
    "revolution case": "revolution",
  };

  function slugify(value) {
    return String(value || "").trim().toLowerCase();
  }

  function enrichCaseMeta(config, title) {
    const catalog = typeof lookupCaseCatalog === "function" ? lookupCaseCatalog(title) : null;
    if (!catalog) return config;

    return Object.assign({}, config, {
      intro: catalog.intro,
      category: catalog.category,
      categoryColor: (CASE_CATEGORY_COLORS && CASE_CATEGORY_COLORS[catalog.category]) || "",
      description: catalog.description,
      update: catalog.update,
      image: config.image || catalog.image,
    });
  }

  function enrichCollectionMeta(config, title) {
    const catalog = typeof lookupCollectionCatalog === "function" ? lookupCollectionCatalog(title) : null;
    if (!catalog) return config;

    return Object.assign({}, config, {
      intro: catalog.intro,
      category: catalog.category,
      categoryColor: COLLECTION_CATEGORY_COLORS?.[catalog.category] || "",
    });
  }

  function buildFallbackConfig(meta) {
    const title = meta.title || meta.name || "Unknown";
    const image = meta.image || meta.img || "";
    const base = {
      title,
      image,
      kind: meta.kind || "case",
      price: "0.60",
      keyPrice: meta.kind === "collection" ? "" : "+€2.19 Key",
      collection: { img: image, name: meta.collectionName || title },
      caseInfo: { img: image, name: title },
      items: [],
    };
    if (meta.kind === "collection") {
      return enrichCollectionMeta(base, title);
    }
    return enrichCaseMeta(base, title);
  }

  function resolveConfig() {
    const params = new URLSearchParams(window.location.search);
    const type = (params.get("type") || "case").toLowerCase();
    const name = params.get("name") || params.get("case") || params.get("collection") || "";
    const slug = slugify(params.get("slug") || name);
    const imageParam = params.get("image") || "";

    const pickCase = (key) => {
      const base = pageConfigs[key];
      if (!base) return null;
      if (type === "collection") {
        return enrichCollectionMeta({
          title: name || base.collection.name,
          image: imageParam || base.collection.img,
          kind: "collection",
          price: base.price,
          keyPrice: "",
          collection: { img: imageParam || base.collection.img, name: name || base.collection.name },
          caseInfo: base.caseInfo,
          items: base.items,
        }, name || base.collection.name);
      }
      return enrichCaseMeta(Object.assign({}, base, { kind: "case" }), base.title);
    };

    if (slug.includes("revolution")) return pickCase("revolution") || pageConfigs.revolution;
    if (slug.includes("fracture")) return pickCase("fracture") || pageConfigs.fracture;

    if (type === "collection") {
      const caseKey = COLLECTION_TO_CASE_KEY[name];
      if (caseKey) return pickCase(caseKey);
    }

    const path = window.location.pathname.toLowerCase();
    if (path.includes("revolution")) return pickCase("revolution") || pageConfigs.revolution;
    if (path.includes("fracture")) return pickCase("fracture") || pageConfigs.fracture;

    return buildFallbackConfig({
      title: decodeURIComponent(name || "Case"),
      image: imageParam,
      kind: type,
      collectionName: name,
    });
  }

  /* ─── RANGE LABELS ────────────────────────────────────────── */

  const ITEM_PRICE_RANGE = "1y";

  /* Maps case-card range key → get_roi_prices_cached.php range param */
  const RANGE_TO_ROI = { "1m": "30d", "3m": "90d", "1y": "1y" };
  const RANGE_TO_CHART = { "1m": "1M", "3m": "3M", "1y": "1Y" };

  /* ─── MAIN PAGE ───────────────────────────────────────────── */

  function CasePage({ config }) {
    const [steamPrices, setSteamPrices] = useState({ loading: false, records: new Map(), error: "" });
    const [headerSteam, setHeaderSteam] = useState({ loading: true, record: null, error: "" });
    const [catalogItems, setCatalogItems] = useState([]);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogError, setCatalogError] = useState("");
    const [priceCatalog, setPriceCatalog] = useState([]);
    const [priceCatalogReady, setPriceCatalogReady] = useState(false);
    const [itemSearch, setItemSearch] = useState("");
    const [itemSort, setItemSort] = useState("rarity-desc");
    const [souvenirLookupReady, setSouvenirLookupReady] = useState(false);
    const isCase = config.kind !== "collection";
    const sourceItems = catalogItems.length > 0 ? catalogItems : config.items;
    const pageLoading = catalogLoading || !priceCatalogReady;

    const catalogLookup = useMemo(
      () => buildCatalogPriceLookup(priceCatalog),
      [priceCatalog]
    );
    const catalogNameLookup = useMemo(
      () => buildCatalogNameLookup(priceCatalog),
      [priceCatalog]
    );

    const requestedNames = useMemo(() => {
      const names = buildPriceTargets(Object.assign({}, config, { items: sourceItems }));
      if (isCase && !names.includes(config.title)) names.unshift(config.title);
      return names;
    }, [config, sourceItems, isCase, souvenirLookupReady]);

    useEffect(() => {
      if (typeof loadSouvenirSkinLookup !== "function") {
        setSouvenirLookupReady(true);
        return undefined;
      }
      let cancelled = false;
      loadSouvenirSkinLookup().finally(() => {
        if (!cancelled) setSouvenirLookupReady(true);
      });
      return () => { cancelled = true; };
    }, []);

    useEffect(() => {
      let cancelled = false;
      setPriceCatalogReady(false);

      if (typeof loadCatalog !== "function") {
        setPriceCatalog([]);
        setPriceCatalogReady(true);
        return undefined;
      }

      loadCatalog()
        .then((items) => {
          if (cancelled) return;
          setPriceCatalog(Array.isArray(items) ? items : []);
          setPriceCatalogReady(true);
        })
        .catch(() => {
          if (cancelled) return;
          setPriceCatalog([]);
          setPriceCatalogReady(true);
        });

      return () => { cancelled = true; };
    }, []);

    useEffect(() => {
      let cancelled = false;
      setCatalogLoading(true);
      setCatalogError("");
      setCatalogItems([]);

      const itemSourceName = (typeof resolveCollectionItemSource === "function"
        ? resolveCollectionItemSource(config.title)
        : "") || config.title;
      fetch("get_detail_items.php?name=" + encodeURIComponent(itemSourceName), {
        headers: { Accept: "application/json" },
      })
        .then((res) => res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status)))
        .then((data) => {
          if (cancelled) return;
          setCatalogItems(Array.isArray(data && data.items) ? data.items : []);
          setCatalogError(data && data.success === false ? (data.error || "Unable to load items.") : "");
          setCatalogLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setCatalogItems([]);
          setCatalogError((err && err.message) || "Unable to load items.");
          setCatalogLoading(false);
        });

      return () => { cancelled = true; };
    }, [config.title]);

    useEffect(() => {
      if (!isCase) {
        setHeaderSteam({ loading: false, record: null, error: "" });
        return undefined;
      }

      let cancelled = false;
      setHeaderSteam({ loading: true, record: null, error: "" });

      fetch("get_roi_prices_cached.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "steam",
          range: "30d",
          market_hash_names: [config.title],
          prefer_live: true,
          skip_catalog_fallback: true,
          steam_listing_first: true,
        }),
      })
        .then((res) => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
        .then((data) => {
          if (cancelled) return;
          const records = Array.isArray(data && data.items) ? data.items : [];
          const map = buildPriceMap(records);
          setHeaderSteam({
            loading: false,
            record: map.get(config.title) || records[0] || null,
            error: data && data.success ? "" : ((data && data.error) || ""),
          });
        })
        .catch((err) => {
          if (cancelled) return;
          setHeaderSteam({ loading: false, record: null, error: (err && err.message) || "Steam data unavailable." });
        });

      return () => { cancelled = true; };
    }, [config.title, isCase]);

    useEffect(() => {
      if (!priceCatalogReady || !requestedNames.length) {
        return undefined;
      }

      let cancelled = false;
      const roiRange = RANGE_TO_ROI[ITEM_PRICE_RANGE] || "1y";

      fetchAllSteamPrices(requestedNames, roiRange, (records) => {
        if (cancelled) return;
        setSteamPrices({ loading: false, records, error: "" });
      })
        .then((records) => {
          if (cancelled) return;
          setSteamPrices({ loading: false, records, error: "" });
        })
        .catch((err) => {
          if (cancelled) return;
          setSteamPrices({
            loading: false,
            records: new Map(),
            error: (err && err.message) || "Steam data unavailable.",
          });
        });

      return () => { cancelled = true; };
    }, [requestedNames, priceCatalogReady]);

    const caseCatalogEntry = catalogNameLookup.get(String(config.title || "").toLowerCase());
    const caseCatalogPrice = Number(caseCatalogEntry?.seed_sell_price || 0);
    const caseRec = headerSteam.record || steamPrices.records.get(config.title);
    const casePrice = caseCatalogPrice > 0 && typeof formatEuroPrice === "function"
      ? formatEuroPrice(caseCatalogPrice)
      : (headerSteam.loading
        ? "Loading…"
        : (caseRec && caseRec.current_price_display) || "—");
    const listingsText = headerSteam.loading
      ? ""
      : (caseRec && caseRec.listings_display)
        ? caseRec.listings_display + " for sale on Steam"
        : "";

    const pricedItems = useMemo(
      () => sourceItems.map((item) => enrichItem(
        item,
        steamPrices.records,
        steamPrices.loading,
        catalogLookup,
        { collectionOrigin: isCase ? "" : String(config.collection?.name || config.title || "") }
      )),
      [steamPrices.records, steamPrices.loading, sourceItems, catalogLookup, isCase, config.collection?.name, config.title]
    );

    const displayedItems = useMemo(() => {
      const query = itemSearch.trim().toLowerCase();
      let rows = pricedItems;
      if (query) {
        rows = rows.filter((item) => {
          const hay = `${item.weapon} ${item.skin} ${item.type_note || item.badge || ""}`.toLowerCase();
          return hay.includes(query);
        });
      }

      const sorted = [...rows];
      if (itemSort === "rarity-desc") {
        sorted.sort((left, right) => {
          const rankDiff = raritySortRank(left.rarity) - raritySortRank(right.rarity);
          return rankDiff !== 0 ? rankDiff : compareByName(left, right);
        });
      } else if (itemSort === "rarity-asc") {
        sorted.sort((left, right) => {
          const rankDiff = raritySortRank(right.rarity) - raritySortRank(left.rarity);
          return rankDiff !== 0 ? rankDiff : compareByName(left, right);
        });
      } else if (itemSort === "price-desc") {
        sorted.sort((left, right) => Number(right._normPrice || 0) - Number(left._normPrice || 0));
      } else if (itemSort === "price-asc") {
        sorted.sort((left, right) => Number(left._normPrice || 0) - Number(right._normPrice || 0));
      } else if (itemSort === "name-desc") {
        sorted.sort((left, right) => compareByName(right, left));
      } else {
        sorted.sort(compareByName);
      }
      return sorted;
    }, [pricedItems, itemSearch, itemSort]);

    return (
      <Layout>
        <div className="collections-shell detail-shell page-cases-collections">
          {/* No title on case/collection detail pages; a case keeps its price line. */}
          {!pageLoading && isCase && casePrice && casePrice !== "—" ? (
            <header className="collections-head">
              <p>Case price {casePrice}{listingsText ? ` · ${listingsText}` : ""}.</p>
            </header>
          ) : null}

          <section className="detail-items-section detail-items-section-primary">
            {!pageLoading && pricedItems.length > 0 ? (
              <div className="collections-controls detail-items-controls">
                <div className="collections-search-wrap">
                  <i className="fa-solid fa-magnifying-glass" />
                  <input
                    type="text"
                    placeholder={`Search ${config.title}...`}
                    value={itemSearch}
                    onChange={(event) => setItemSearch(event.target.value)}
                  />
                </div>
                <SortChipPicker
                  value={itemSort}
                  onChange={setItemSort}
                  ariaLabel={`Sort ${isCase ? "case" : "collection"} items`}
                  options={[
                    { value: "rarity-desc", label: "Rarest" },
                    { value: "rarity-asc", label: "Common" },
                    { value: "name-asc", label: "A → Z" },
                    { value: "name-desc", label: "Z → A" },
                    { value: "price-desc", label: "High $" },
                    { value: "price-asc", label: "Low $" },
                  ]}
                />
              </div>
            ) : null}

            {pageLoading ? (
              <div className="collections-grid">
                {Array.from({ length: 12 }).map((_, index) => (
                  <div className="card catalog-skeleton" key={index}>
                    <div className="card-media" />
                    <div className="card-body"><h3>Loading...</h3></div>
                  </div>
                ))}
              </div>
            ) : null}

            {!pageLoading && displayedItems.length > 0 ? (
              <div className="collections-grid collections-grid-animated" key={`items-${itemSearch.trim() || "all"}-${itemSort}`}>
                {displayedItems.map((item, index) => (
                  <CaseItemCard
                    key={item.weapon + "-" + item.skin}
                    item={item}
                    collection={config.collection}
                    caseInfo={isCase ? config.caseInfo : { img: "", name: "" }}
                    showSubtitle={false}
                    animated
                    staggerIndex={index}
                  />
                ))}
              </div>
            ) : null}

            {!pageLoading && !displayedItems.length ? (
              <div className="detail-empty-items">
                {catalogError || `No items found for this ${isCase ? "case" : "collection"} yet.`}
              </div>
            ) : null}
            {steamPrices.error && <p className="case-price-error">{steamPrices.error}</p>}
          </section>
        </div>
      </Layout>
    );
  }

  mountPage(<CasePage config={resolveConfig()} />);
})();
