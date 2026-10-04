(() => {
  const { useCallback, useEffect, useMemo, useRef, useState } = React;

  const STEAM_WEAR_RANGES = [
    { label: "Factory New", min: 0, max: 0.07 },
    { label: "Minimal Wear", min: 0.07, max: 0.15 },
    { label: "Field-Tested", min: 0.15, max: 0.38 },
    { label: "Well-Worn", min: 0.38, max: 0.45 },
    { label: "Battle-Scarred", min: 0.45, max: 1 },
  ];

  const WEAR_WEIGHTS = [
    { name: "Factory New", weight: 3 },
    { name: "Minimal Wear", weight: 24 },
    { name: "Field-Tested", weight: 33 },
    { name: "Well-Worn", weight: 8 },
    { name: "Battle-Scarred", weight: 32 },
  ];

  const RARITY_TOTAL_PROB = {
    milspec: 0.7992,
    restricted: 0.1598,
    classified: 0.0320,
    covert: 0.0064,
  };

  const ITEM_W = 122;
  const ITEM_GAP = 8;
  const ITEM_STEP = ITEM_W + ITEM_GAP;
  const REEL_LEN = 64;
  const WIN_IDX = 54;

  function formatEuro(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? "\u20ac" + n.toFixed(2) : "\u2014";
  }

  function formatSignedEuro(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "\u2014";
    const sign = n > 0 ? "+" : n < 0 ? "-" : "";
    return sign + "\u20ac" + Math.abs(n).toFixed(2);
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
    if (item && item.noWear) return ["Factory New"];
    const range = parseFloatRange(item && item.float);
    const wears = STEAM_WEAR_RANGES
      .filter((w) => range.min <= w.max && range.max >= w.min)
      .map((w) => w.label);
    return wears.length ? wears : ["Factory New"];
  }

  function mhn(item, wear, st) {
    const weapon = String(item?.weapon || "").trim();
    const skin = String(item?.skin || "").trim();
    if (item?.noWear || item?.flatName) {
      const flat = item.flatName || (weapon && skin ? `${weapon} | ${skin}` : (skin || weapon));
      return st ? `StatTrak\u2122 ${flat}` : flat;
    }
    const base = `${weapon} | ${skin} (${wear || "Factory New"})`;
    return (st ? "StatTrak\u2122 " : "") + base;
  }

  function candidateMarketNames(result) {
    if (!result) return [];
    const wear = String(result.wear || "").trim() || "Field-Tested";
    const weapon = String(result.weapon || "").trim();
    const skin = String(result.skin || "").trim();
    const flat = String(result.flatName || "").trim();
    const baseNoWear = flat || (weapon && skin ? `${weapon} | ${skin}` : (skin || weapon));
    const baseWithWear = result.noWear
      ? baseNoWear
      : (/\([A-Za-z-]+\)$/.test(baseNoWear) ? baseNoWear : `${weapon} | ${skin} (${wear})`);
    const names = [];
    if (result.isStatTrak) {
      names.push(`StatTrak\u2122 ${baseWithWear}`);
      names.push(`StatTrak(TM) ${baseWithWear}`);
    }
    names.push(baseWithWear);
    if (flat && flat !== baseWithWear) names.push(flat);
    if (!result.noWear) {
      names.push(mhn(result, wear, false));
      if (result.isStatTrak) names.push(mhn(result, wear, true));
    }
    return Array.from(new Set(names.map((name) => String(name || "").trim()).filter(Boolean)));
  }

  function extractPriceFromRoiItem(item) {
    if (!item || typeof item !== "object") return null;
    const candidates = [
      item.current_price,
      item.price,
      item.steam_price,
      item.median_price,
      item.lowest_price,
    ];
    for (const value of candidates) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const display = String(item.current_price_display || item.price_display || "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");
    const fromDisplay = Number(display);
    return Number.isFinite(fromDisplay) && fromDisplay > 0 ? fromDisplay : null;
  }

  function extractPriceFromRoiPayload(data, preferredNames = []) {
    const items = Array.isArray(data?.items) ? data.items : [];
    const preferred = (Array.isArray(preferredNames) ? preferredNames : [])
      .map((name) => String(name || "").toLowerCase());
    for (const name of preferred) {
      const hit = items.find((item) => String(item?.market_hash_name || "").toLowerCase() === name);
      const price = extractPriceFromRoiItem(hit);
      if (price !== null) return price;
    }
    for (const item of items) {
      const price = extractPriceFromRoiItem(item);
      if (price !== null) return price;
    }
    return null;
  }

  async function fetchSteamPriceForNames(names, signal) {
    const list = Array.from(new Set((Array.isArray(names) ? names : []).filter(Boolean)));
    if (!list.length) return null;
    try {
      const response = await fetch("get_roi_prices_cached.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        signal,
        body: JSON.stringify({
          source: "steam",
          range: "30d",
          market_hash_names: list,
          steam_listing_fallback: true,
          steam_listing_fallback_limit: Math.min(10, Math.max(1, list.length)),
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const price = extractPriceFromRoiPayload(data, list);
        if (price !== null) return price;
      }
    } catch (_) {
      /* try wear endpoint next */
    }
    return null;
  }

  async function fetchSteamWearPrice(result, signal) {
    if (!result || result.noWear) return null;
    const weapon = String(result.weapon || "").trim();
    const skin = String(result.skin || "").trim();
    const base = weapon && skin ? `${weapon} | ${skin}` : String(result.flatName || "").trim();
    if (!base) return null;
    const wear = String(result.wear || "").trim() || "Field-Tested";
    try {
      const response = await fetch(
        `get_steam_wear_prices.php?lookup_name=${encodeURIComponent(base)}&prefer_live=1`,
        { headers: { Accept: "application/json" }, signal }
      );
      if (!response.ok) return null;
      const data = await response.json();
      const rows = Array.isArray(data?.quality_rows) ? data.quality_rows : [];
      const row = rows.find((entry) => String(entry?.wear || "") === wear) || rows[0];
      if (!row) return null;
      if (result.isStatTrak) {
        const st = Number(row.stattrak);
        if (Number.isFinite(st) && st > 0) return st;
      }
      const normal = Number(row.price);
      return Number.isFinite(normal) && normal > 0 ? normal : null;
    } catch (_) {
      return null;
    }
  }

  async function resolveResultSteamPrice(result, signal) {
    const names = candidateMarketNames(result);
    const fromNames = await fetchSteamPriceForNames(names, signal);
    if (fromNames !== null) return fromNames;
    return fetchSteamWearPrice(result, signal);
  }

  function resultItemPrice(result, pricedItems) {
    if (!result || !pricedItems.length) return null;
    const enriched = pricedItems.find((p) => (
      p.weapon === result.weapon && p.skin === result.skin
    ) || (
      p.flatName && result.flatName && p.flatName === result.flatName
    ));
    if (!enriched) return null;
    if (result.isStatTrak) {
      if (Number(enriched._stPrice) > 0) return Number(enriched._stPrice);
      if (Number(enriched._normPrice) > 0) return Number(enriched._normPrice);
      return null;
    }
    return Number(enriched._normPrice) > 0 ? Number(enriched._normPrice) : null;
  }

  function priceCacheKey(result) {
    if (!result) return "";
    return [
      result.isStatTrak ? "st" : "n",
      String(result.weapon || ""),
      String(result.skin || ""),
      String(result.wear || ""),
      String(result.flatName || ""),
    ].join("|").toLowerCase();
  }

  function InlineHelp({ label = "More info", children, align = "left" }) {
    return (
      <span className={"ui-help " + (align === "right" ? "right" : "left")}>
        <button type="button" className="ui-help-trigger" aria-label={label}>
          <i className="fa-solid fa-circle-question" />
        </button>
        <span className="ui-help-bubble" role="tooltip">{children}</span>
      </span>
    );
  }

  function rollWear(item) {
    if (item?.noWear) return "";
    const wears = wearOptionsForItem(item);
    const available = WEAR_WEIGHTS.filter((w) => wears.includes(w.name));
    if (!available.length) return wears[0] || "Field-Tested";
    const total = available.reduce((s, w) => s + w.weight, 0);
    let r = Math.random() * total;
    for (const w of available) {
      r -= w.weight;
      if (r <= 0) return w.name;
    }
    return available[available.length - 1].name;
  }

  function itemsHaveRarityOdds(items) {
    return (Array.isArray(items) ? items : []).some((item) => (
      Object.prototype.hasOwnProperty.call(RARITY_TOTAL_PROB, String(item?.rarity || "").toLowerCase())
    ));
  }

  function rollResult(items, options = {}) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return null;

    const equalWeight = Boolean(options.equalWeight) || !itemsHaveRarityOdds(list);
    if (equalWeight) {
      const pick = list[Math.floor(Math.random() * list.length)];
      return Object.assign({}, pick, {
        wear: rollWear(pick),
        isStatTrak: !pick.noWear && Math.random() < 0.1,
      });
    }

    const count = {};
    list.forEach((item) => {
      const key = String(item.rarity || "").toLowerCase();
      count[key] = (count[key] || 0) + 1;
    });
    const pool = list.map((item) => {
      const key = String(item.rarity || "").toLowerCase();
      return {
        item,
        prob: (RARITY_TOTAL_PROB[key] || 0) / (count[key] || 1),
      };
    });
    const total = pool.reduce((s, p) => s + p.prob, 0) || 1;
    let r = Math.random() * total;
    for (const p of pool) {
      r -= p.prob;
      if (r <= 0) {
        return Object.assign({}, p.item, {
          wear: rollWear(p.item),
          isStatTrak: Math.random() < 0.1,
        });
      }
    }
    const fb = list[Math.floor(Math.random() * list.length)];
    return Object.assign({}, fb, { wear: rollWear(fb), isStatTrak: false });
  }

  function buildReel(winItem, allItems) {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const covert = allItems.filter((i) => String(i.rarity || "").toLowerCase() === "covert");
    const classified = allItems.filter((i) => String(i.rarity || "").toLowerCase() === "classified");
    const common = allItems.filter((i) => {
      const key = String(i.rarity || "").toLowerCase();
      return key === "milspec" || key === "restricted" || !key;
    });

    return Array.from({ length: REEL_LEN }, (_, i) => {
      if (i === WIN_IDX) return winItem;
      const r = Math.random();
      if (r < 0.05 && covert.length) return pick(covert);
      if (r < 0.14 && classified.length) return pick(classified);
      return common.length ? pick(common) : pick(allItems);
    });
  }

  function buildPreviewReel(allItems) {
    if (!allItems.length) return [];
    return Array.from({ length: 24 }, () => allItems[Math.floor(Math.random() * allItems.length)]);
  }

  function currentTranslateX(node, fallback) {
    if (!node || !window.getComputedStyle) return fallback || 0;
    const transform = window.getComputedStyle(node).transform;
    if (!transform || transform === "none") return fallback || 0;
    const matrix3d = transform.match(/^matrix3d\((.+)\)$/);
    if (matrix3d) {
      const parts = matrix3d[1].split(",").map(Number);
      return Number.isFinite(parts[12]) ? parts[12] : (fallback || 0);
    }
    const matrix = transform.match(/^matrix\((.+)\)$/);
    if (matrix) {
      const parts = matrix[1].split(",").map(Number);
      return Number.isFinite(parts[4]) ? parts[4] : (fallback || 0);
    }
    return fallback || 0;
  }

  function resultTitle(result) {
    if (!result) return "";
    if (result.noWear || result.flatName) {
      return result.flatName || `${result.weapon} | ${result.skin}`.replace(/^\s*\|\s*/, "");
    }
    return `${result.weapon} | ${result.skin}`;
  }

  function CaseSimulator({
    config,
    pricedItems = [],
    caseOpenCost,
    onClose,
    inline = false,
    equalWeight = false,
    openLabel = "Open Case",
    // "Capsule Opening Simulator" on a sticker capsule page, and so on.
    subtitle = "Case Opening Simulator",
  }) {
    const items = Array.isArray(config?.items) ? config.items : [];
    const [phase, setPhase] = useState("idle");
    const [reel, setReel] = useState(() => buildPreviewReel(items));
    const [result, setResult] = useState(null);
    const [openCount, setOpenCount] = useState(0);
    const [totalProfit, setTotalProfit] = useState(0);
    const [fallbackPrice, setFallbackPrice] = useState(null);
    const [priceFetching, setPriceFetching] = useState(false);
    const [priceCache, setPriceCache] = useState({});
    const [translateX, setTranslateX] = useState(0);
    const [transitioning, setTransitioning] = useState(false);
    const [spinMs, setSpinMs] = useState(8200);
    const [spinCurve, setSpinCurve] = useState("cubic-bezier(0.04,0.82,0.18,1)");
    const containerRef = useRef(null);
    const trackRef = useRef(null);
    const timerRef = useRef(null);
    const finalXRef = useRef(0);
    const winRef = useRef(null);
    const spedUpRef = useRef(false);
    const profitBookedRef = useRef(false);
    const priceCacheRef = useRef({});

    useEffect(() => {
      priceCacheRef.current = priceCache;
    }, [priceCache]);

    useEffect(() => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    // Prefetch common wear prices so wins resolve instantly when possible.
    useEffect(() => {
      if (!items.length) return undefined;
      const controller = new AbortController();
      const names = [];
      items.slice(0, 40).forEach((item) => {
        const wears = item.noWear ? [""] : wearOptionsForItem(item).slice(0, 3);
        wears.forEach((wear) => {
          names.push(mhn(item, wear || "Factory New", false));
          if (!item.noWear) names.push(mhn(item, wear || "Factory New", true));
        });
      });
      const uniqueNames = Array.from(new Set(names.filter(Boolean))).slice(0, 60);
      if (!uniqueNames.length) return undefined;

      fetch("get_roi_prices_cached.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          source: "steam",
          range: "30d",
          market_hash_names: uniqueNames,
          steam_listing_fallback: true,
          steam_listing_fallback_limit: Math.min(10, uniqueNames.length),
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const rows = Array.isArray(data?.items) ? data.items : [];
          if (!rows.length) return;
          setPriceCache((prev) => {
            const next = { ...prev };
            rows.forEach((row) => {
              const price = extractPriceFromRoiItem(row);
              const key = String(row?.market_hash_name || "").toLowerCase();
              if (price !== null && key) next[key] = price;
            });
            return next;
          });
        })
        .catch(() => {});

      return () => controller.abort();
    }, [items]);

    useEffect(() => {
      if (phase !== "idle") return;
      setReel(buildPreviewReel(items));
      setTranslateX(0);
      setTransitioning(false);
    }, [items, phase]);

    const settleSpin = useCallback(() => {
      const winItem = winRef.current;
      if (!winItem) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      const cached = (() => {
        const fromItems = resultItemPrice(winItem, pricedItems);
        if (fromItems !== null) return fromItems;
        const names = candidateMarketNames(winItem);
        for (const name of names) {
          const hit = priceCacheRef.current[String(name).toLowerCase()];
          if (Number(hit) > 0) return Number(hit);
        }
        return null;
      })();
      const cost = Number(caseOpenCost) > 0 ? Number(caseOpenCost) : 0;
      setPhase("result");
      setResult(winItem);
      setOpenCount((c) => c + 1);
      if (cached !== null) {
        setFallbackPrice(cached);
        if (cost > 0 && !profitBookedRef.current) {
          profitBookedRef.current = true;
          setTotalProfit((p) => p + (Number(cached) - cost));
        }
      }
    }, [pricedItems, caseOpenCost]);

    const speedUpSpin = useCallback(() => {
      if (phase !== "spinning" || spedUpRef.current) return;
      spedUpRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      const currentX = currentTranslateX(trackRef.current, translateX);
      setTransitioning(false);
      setTranslateX(currentX);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setSpinMs(1350);
        setSpinCurve("cubic-bezier(0.14,0.72,0.13,1)");
        setTransitioning(true);
        setTranslateX(finalXRef.current);
        timerRef.current = setTimeout(settleSpin, 1450);
      }));
    }, [phase, translateX, settleSpin]);

    useEffect(() => {
      if (phase !== "spinning") return undefined;
      const onKeyDown = (event) => {
        if (event.key === "Escape") return;
        speedUpSpin();
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [phase, speedUpSpin]);

    const openCase = useCallback(() => {
      if (phase === "spinning") {
        speedUpSpin();
        return;
      }
      if (!items.length) return;
      const winItem = rollResult(items, { equalWeight: equalWeight || Boolean(config?.equalWeight) });
      if (!winItem) return;
      const newReel = buildReel(winItem, items);
      const duration = 7600 + Math.round(Math.random() * 700);

      winRef.current = winItem;
      spedUpRef.current = false;
      profitBookedRef.current = false;
      setReel(newReel);
      setResult(null);
      setFallbackPrice(null);
      setPriceFetching(false);
      setTransitioning(false);
      setTranslateX(0);
      setSpinMs(duration);
      setSpinCurve("cubic-bezier(0.05,0.78,0.16,1)");
      setPhase("spinning");

      requestAnimationFrame(() => requestAnimationFrame(() => {
        const cw = (containerRef.current && containerRef.current.offsetWidth) || 856;
        const centerX = cw / 2 - ITEM_W / 2;
        const final = -(WIN_IDX * ITEM_STEP - centerX);
        finalXRef.current = final;
        setTranslateX(final);
        setTransitioning(true);
        timerRef.current = setTimeout(settleSpin, duration + 180);
      }));
    }, [phase, items, equalWeight, config, speedUpSpin, settleSpin]);

    const resultPrice = useMemo(() => {
      const fromItems = resultItemPrice(result, pricedItems);
      if (fromItems !== null) return fromItems;
      if (!result) return null;
      const names = candidateMarketNames(result);
      for (const name of names) {
        const hit = priceCache[String(name).toLowerCase()];
        if (Number(hit) > 0) return Number(hit);
      }
      return null;
    }, [result, pricedItems, priceCache]);

    const openCost = Number(caseOpenCost) > 0 ? Number(caseOpenCost) : null;
    const displayResultPrice = resultPrice !== null ? resultPrice : fallbackPrice;

    useEffect(() => {
      if (!result) return undefined;
      if (displayResultPrice !== null) return undefined;

      const names = candidateMarketNames(result);
      if (!names.length) return undefined;

      const controller = new AbortController();
      let cancelled = false;
      setPriceFetching(true);

      resolveResultSteamPrice(result, controller.signal)
        .then((price) => {
          if (cancelled || price === null) return;
          setFallbackPrice(price);
          setPriceCache((prev) => {
            const next = { ...prev };
            names.forEach((name) => {
              next[String(name).toLowerCase()] = price;
            });
            return next;
          });
          if (openCost !== null && !profitBookedRef.current) {
            profitBookedRef.current = true;
            setTotalProfit((p) => p + (price - openCost));
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setPriceFetching(false);
        });

      return () => {
        cancelled = true;
        controller.abort();
      };
    }, [result, displayResultPrice, openCost]);

    const panel = (
      <div className={inline ? "detail-simulator-panel" : "sim-modal"}>
        {!inline && (
          <div className="sim-header">
            <div className="sim-header-left">
              {config?.image ? <img src={config.image} alt={config.title || ""} /> : null}
              <div>
                <h2>{config?.title || "Container"}</h2>
                <div className="sim-subtitle-row">
                  <span className="sim-subtitle">{subtitle}</span>
                  <InlineHelp label="How simulator pricing works" align="left">
                    Opening cost is the live container price plus the key price when a key is required.
                  </InlineHelp>
                </div>
              </div>
            </div>
            <button type="button" className="sim-close" onClick={onClose} aria-label="Close">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        )}

        {inline && (
          <div className="detail-panel-head">
            <div>
              <h2>{subtitle}</h2>
              <p>Spin the reel with live Steam prices for the selected timeframe.</p>
            </div>
          </div>
        )}

        <div className="sim-reel-container" ref={containerRef}>
          <div
            ref={trackRef}
            className="sim-reel-track"
            style={{
              transform: "translateX(" + translateX + "px)",
              transition: transitioning ? "transform " + (spinMs / 1000).toFixed(2) + "s " + spinCurve : "none",
            }}
          >
            {reel.map((item, i) => (
              <div key={i} className="sim-item">
                <img src={item.img} alt={item.skin || item.flatName || ""} />
                <span className="sim-item-name">{item.skin || item.flatName || item.weapon}</span>
              </div>
            ))}
          </div>
          <div className="sim-marker" />
        </div>

        {result && phase === "result" && (
          <div className={"sim-result " + String(result.rarity || "milspec").toLowerCase()}>
            <img className="sim-result-img" src={result.img} alt={result.skin || ""} />
            <div className="sim-result-info">
              {result.isStatTrak && <div className="sim-stattrak-label">StatTrak{"\u2122"}</div>}
              <h3>{resultTitle(result)}</h3>
              {result.wear ? <div className="sim-result-wear">{result.wear}</div> : null}
              <div className={"sim-result-price" + (displayResultPrice === null ? " loading" : "")}>
                {displayResultPrice !== null
                  ? formatEuro(displayResultPrice)
                  : (priceFetching ? "Checking Steam..." : "Price unavailable")}
              </div>
            </div>
          </div>
        )}

        <div className="sim-actions">
          <button type="button" className="sim-btn primary" onClick={openCase} disabled={!items.length}>
            {phase === "spinning" ? "Speed Up" : openLabel}
          </button>
        </div>

        {openCount > 0 && (
          <div className="sim-stats">
            <span className="sim-stat-pill">
              Opened: <span className="hi">{openCount}&times;</span>
            </span>
            {openCost !== null && (
              <span className="sim-stat-pill">
                Open cost: <span className="hi">{formatEuro(openCost)}</span>
                <InlineHelp label="What is open cost?">
                  Open cost equals the current container price plus the key price when required.
                </InlineHelp>
              </span>
            )}
            <span className="sim-stat-pill">
              Total profit:{" "}
              <span className={"hi " + (totalProfit >= 0 ? "profit" : "loss")}>
                {formatSignedEuro(totalProfit)}
              </span>
              <InlineHelp label="What is total profit?">
                Total profit is the combined value of all won items minus the total amount spent opening in this session.
              </InlineHelp>
            </span>
          </div>
        )}
      </div>
    );

    if (inline) return panel;

    return (
      <div
        className="sim-overlay"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && typeof onClose === "function") onClose();
        }}
      >
        {panel}
      </div>
    );
  }

  function normalizeDetailItems(payload) {
    const raw = Array.isArray(payload?.items)
      ? payload.items
      : (Array.isArray(payload) ? payload : []);
    return raw.map((entry) => {
      const weapon = String(entry.weapon || entry.Weapon || "").trim();
      const skin = String(entry.skin || entry.Skin || entry.name || "").trim();
      const badge = String(entry.badge || entry.rarity || entry.Rarity || "").trim();
      const rarity = String(entry.rarity || entry.Rarity || entry.badge || "milspec")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
      const rarityKey = rarity.includes("covert") || rarity.includes("extraordinary") || rarity.includes("contraband")
        ? "covert"
        : rarity.includes("classified") || rarity.includes("exotic")
          ? "classified"
          : rarity.includes("restricted") || rarity.includes("remarkable")
            ? "restricted"
            : rarity.includes("industrial")
              ? "industrial"
              : rarity.includes("consumer") || rarity.includes("base")
                ? "consumer"
                : rarity.includes("mil") || rarity.includes("highgrade") || rarity.includes("high-grade")
                  ? "milspec"
                  : rarity;
      const isNonWearWeapon = /^(sticker|patch|charm|agent|pin|music kit|sealed graffiti|graffiti)$/i.test(weapon);
      const flatName = String(entry.flatName || entry.market_hash_name || entry.marketHashName || "").trim()
        || (isNonWearWeapon && weapon && skin ? `${weapon} | ${skin}` : "");
      return {
        weapon: weapon || "Item",
        skin: skin || "Unknown",
        rarity: rarityKey,
        badge: badge || entry.badge || entry.rarity || "",
        img: entry.img || entry.image || entry.icon || "",
        float: entry.float || entry.float_range || "",
        noWear: Boolean(entry.noWear) || isNonWearWeapon || (!weapon && skin && !String(entry.float || "").includes("-")),
        flatName,
      };
    }).filter((entry) => entry.skin || entry.flatName);
  }

  function inferNonWearRarityFromName(name) {
    const lower = String(name || "").toLowerCase();
    if (/\(gold\)|\(lenticular\)/.test(lower)) return "covert";
    if (/\(foil\)/.test(lower)) return "classified";
    if (/\(holo\)|\(glitter\)/.test(lower)) return "restricted";
    return "milspec";
  }

  function inferNonWearBadgeFromName(name) {
    const lower = String(name || "").toLowerCase();
    if (/\(gold\)|\(lenticular\)/.test(lower)) return "Extraordinary";
    if (/\(foil\)/.test(lower)) return "Exotic";
    if (/\(holo\)|\(glitter\)/.test(lower)) return "Remarkable";
    if (/^sticker\s*\|/i.test(String(name || ""))) return "High Grade";
    return "";
  }

  function itemsFromNameList(names, imageLookup = {}) {
    return (Array.isArray(names) ? names : []).map((name) => {
      const clean = String(name || "").trim();
      if (!clean) return null;

      let weapon = "Item";
      let skin = clean;
      let flatName = clean;

      if (/^Sealed Graffiti\s*\|/i.test(clean) || /^Graffiti\s*\|/i.test(clean)) {
        weapon = "Graffiti";
        skin = clean.replace(/^Sealed Graffiti\s*\|\s*/i, "").replace(/^Graffiti\s*\|\s*/i, "");
        flatName = /^Sealed Graffiti\s*\|/i.test(clean) ? clean : `Sealed Graffiti | ${skin}`;
      } else if (/^Sticker\s*\|/i.test(clean)) {
        weapon = "Sticker";
        skin = clean.replace(/^Sticker\s*\|\s*/i, "");
      } else if (/^Charm\s*\|/i.test(clean)) {
        weapon = "Charm";
        skin = clean.replace(/^Charm\s*\|\s*/i, "");
      } else if (/^Patch\s*\|/i.test(clean)) {
        weapon = "Patch";
        skin = clean.replace(/^Patch\s*\|\s*/i, "");
      } else if (/^(StatTrak\u2122\s+)?Music Kit\s*\|/i.test(clean)) {
        weapon = "Music Kit";
        skin = clean.replace(/^StatTrak\u2122\s+/i, "").replace(/^Music Kit\s*\|\s*/i, "");
      } else if (clean.includes("|")) {
        const parts = clean.split("|").map((part) => part.trim());
        weapon = parts[0] || "Item";
        skin = parts.slice(1).join(" | ") || clean;
      } else if (/\bpin$/i.test(clean)) {
        weapon = "Pin";
        skin = clean;
      } else {
        // Bare graffiti design names from group maps
        weapon = "Graffiti";
        skin = clean;
        flatName = `Sealed Graffiti | ${clean}`;
      }

      const rarity = inferNonWearRarityFromName(flatName || clean);
      const badge = inferNonWearBadgeFromName(flatName || clean);

      return {
        weapon,
        skin,
        rarity,
        badge,
        img: imageLookup[clean] || imageLookup[flatName] || "",
        float: "",
        noWear: true,
        flatName,
      };
    }).filter(Boolean);
  }

  window.CS2CaseSimulator = {
    CaseSimulator,
    rollResult,
    buildPreviewReel,
    normalizeDetailItems,
    itemsFromNameList,
    wearOptionsForItem,
    RARITY_TOTAL_PROB,
    formatEuro,
    formatSignedEuro,
  };
})();
