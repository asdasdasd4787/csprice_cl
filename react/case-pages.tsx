(() => {
  const { Layout, CaseItemCard, mountPage } = window.CS2React;
  const { useCallback, useEffect, useMemo, useRef, useState } = React;

  const STEAM_WEAR_RANGES = [
    { label: "Factory New",    min: 0,    max: 0.07 },
    { label: "Minimal Wear",   min: 0.07, max: 0.15 },
    { label: "Field-Tested",   min: 0.15, max: 0.38 },
    { label: "Well-Worn",      min: 0.38, max: 0.45 },
    { label: "Battle-Scarred", min: 0.45, max: 1    },
  ];

  const WEAR_WEIGHTS = [
    { name: "Factory New",    weight: 3  },
    { name: "Minimal Wear",   weight: 24 },
    { name: "Field-Tested",   weight: 33 },
    { name: "Well-Worn",      weight: 8  },
    { name: "Battle-Scarred", weight: 32 },
  ];

  /* Total probability per rarity tier (standard CS2 case odds) */
  const RARITY_TOTAL_PROB: Record<string, number> = {
    milspec:    0.7992,
    restricted: 0.1598,
    classified: 0.0320,
    covert:     0.0064,
  };

  function steamMarketUrl(marketHashName: string) {
    return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
  }

  function formatEuro(value: any) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? `€${n.toFixed(2)}` : "—";
  }

  function formatInt(value: any) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString("en-US") : "—";
  }

  function parseFloatRange(floatRange: any) {
    const match = String(floatRange || "").match(/([0-9.]+)\s*-\s*([0-9.]+)/);
    if (!match) return { min: 0, max: 1 };
    return {
      min: Math.max(0, Math.min(1, Number(match[1]))),
      max: Math.max(0, Math.min(1, Number(match[2]))),
    };
  }

  function wearOptionsForItem(item: any) {
    const range = parseFloatRange(item.float);
    const wears = STEAM_WEAR_RANGES
      .filter((w) => range.min <= w.max && range.max >= w.min)
      .map((w) => w.label);
    return wears.length ? wears : ["Factory New"];
  }

  function itemMarketHashName(item: any, wear: string, statTrak = false) {
    return `${statTrak ? "StatTrak™ " : ""}${item.weapon} | ${item.skin} (${wear})`;
  }

  function sortBySteamPrice(records: any[]) {
    return records
      .filter((r) => Number(r?.current_price) > 0)
      .sort((a, b) => Number(a.current_price) - Number(b.current_price));
  }

  function priceRangeDisplay(records: any[]) {
    const sorted = sortBySteamPrice(records);
    if (!sorted.length) return "Steam price unavailable";
    const min = sorted[0].current_price;
    const max = sorted[sorted.length - 1].current_price;
    if (Math.abs(Number(min) - Number(max)) < 0.005) return `${formatEuro(min)} Steam low`;
    return `${formatEuro(min)} – ${formatEuro(max)}`;
  }

  function unique(values: any[]) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function buildSteamPriceTargets(config: any) {
    const names = [config.title];
    config.items.forEach((item: any) => {
      wearOptionsForItem(item).forEach((wear) => {
        names.push(itemMarketHashName(item, wear, false));
        names.push(itemMarketHashName(item, wear, true));
      });
    });
    return unique(names);
  }

  function buildPriceMap(records: any[]) {
    const map = new Map<string, any>();
    records.forEach((r) => { if (r?.market_hash_name) map.set(r.market_hash_name, r); });
    return map;
  }

  function enrichCaseItem(item: any, priceMap: Map<string, any>, loading: boolean) {
    const wears = wearOptionsForItem(item);
    const normalNames = wears.map((w) => itemMarketHashName(item, w, false));
    const statTrakNames = wears.map((w) => itemMarketHashName(item, w, true));
    const normalRecords = normalNames.map((n) => priceMap.get(n)).filter(Boolean);
    const statTrakRecords = statTrakNames.map((n) => priceMap.get(n)).filter(Boolean);
    const bestNormal   = sortBySteamPrice(normalRecords)[0]   || null;
    const bestStatTrak = sortBySteamPrice(statTrakRecords)[0] || null;
    const defaultNormalName = normalNames[0];

    return {
      ...item,
      normalPriceDisplay:       bestNormal?.current_price_display  || (loading ? "Loading..." : "—"),
      normalPriceRangeDisplay:  loading ? "Checking Steam..." : priceRangeDisplay(normalRecords),
      stattrakPriceDisplay:     bestStatTrak?.current_price_display || (loading ? "Loading..." : "—"),
      stattrakPriceRangeDisplay:loading ? "Checking Steam..." : priceRangeDisplay(statTrakRecords),
      normalSteamUrl:    bestNormal?.market_url  || steamMarketUrl(defaultNormalName),
      stattrakSteamUrl:  bestStatTrak?.market_url || steamMarketUrl(statTrakNames[0]),
      detailsUrl: `item_page.php?market_hash_name=${encodeURIComponent(bestNormal?.market_hash_name || defaultNormalName)}&lookup_name=${encodeURIComponent(defaultNormalName)}`,
      steamPriceLoading: loading,
      _bestNormalPrice:  bestNormal?.current_price ? Number(bestNormal.current_price) : null,
      _bestStattrakPrice:bestStatTrak?.current_price ? Number(bestStatTrak.current_price) : null,
    };
  }

  /* ─── SIMULATOR ─────────────────────────────────────────────── */

  const ITEM_W   = 122; // px
  const ITEM_GAP = 8;   // px
  const ITEM_STEP = ITEM_W + ITEM_GAP;
  const REEL_SIZE = 64;
  const WIN_INDEX = 54; // winning item position in reel

  function rollWear(item: any) {
    const wears = wearOptionsForItem(item);
    const available = WEAR_WEIGHTS.filter((w) => wears.includes(w.name));
    if (!available.length) return wears[0] || "Field-Tested";
    const total = available.reduce((s, w) => s + w.weight, 0);
    let rand = Math.random() * total;
    for (const w of available) {
      rand -= w.weight;
      if (rand <= 0) return w.name;
    }
    return available[available.length - 1].name;
  }

  function rollResult(items: any[]) {
    const rarityCount: Record<string, number> = {};
    items.forEach((item) => { rarityCount[item.rarity] = (rarityCount[item.rarity] || 0) + 1; });

    const pool: Array<{ item: any; prob: number }> = items.map((item) => ({
      item,
      prob: (RARITY_TOTAL_PROB[item.rarity] || 0) / (rarityCount[item.rarity] || 1),
    }));

    const total = pool.reduce((s, p) => s + p.prob, 0);
    let rand = Math.random() * total;
    for (const { item, prob } of pool) {
      rand -= prob;
      if (rand <= 0) {
        return { ...item, wear: rollWear(item), isStatTrak: Math.random() < 0.1 };
      }
    }
    const fallback = items[Math.floor(Math.random() * items.length)];
    return { ...fallback, wear: "Field-Tested", isStatTrak: false };
  }

  function buildReel(winItem: any, allItems: any[]) {
    const covert     = allItems.filter((i) => i.rarity === "covert");
    const classified = allItems.filter((i) => i.rarity === "classified");
    const common     = allItems.filter((i) => i.rarity === "milspec" || i.rarity === "restricted");
    const pick = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];

    return Array.from({ length: REEL_SIZE }, (_, i) => {
      if (i === WIN_INDEX) return winItem;
      const r = Math.random();
      if (r < 0.05 && covert.length)     return pick(covert);
      if (r < 0.14 && classified.length) return pick(classified);
      return common.length ? pick(common) : pick(allItems);
    });
  }

  function buildPreviewReel(allItems: any[]) {
    if (!allItems.length) return [];
    return Array.from({ length: 24 }, () => allItems[Math.floor(Math.random() * allItems.length)]);
  }

  function CaseSimulator({ config, pricedItems, onClose }: any) {
    const [phase,           setPhase]           = useState<"idle"|"spinning"|"result">("idle");
    const [reel,            setReel]            = useState<any[]>(() => buildPreviewReel(config.items));
    const [result,          setResult]          = useState<any>(null);
    const [openCount,       setOpenCount]       = useState(0);
    const [translateX,      setTranslateX]      = useState(0);
    const [transitioning,   setTransitioning]   = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    useEffect(() => {
      if (phase !== "idle") return;
      setReel(buildPreviewReel(config.items));
      setTranslateX(0);
      setTransitioning(false);
    }, [config.items, phase]);

    const openCase = useCallback(() => {
      if (phase === "spinning") return;

      const winItem  = rollResult(config.items);
      const newReel  = buildReel(winItem, config.items);

      setReel(newReel);
      setResult(null);
      setTransitioning(false);
      setTranslateX(0);
      setPhase("spinning");

      /* let the DOM reset translateX=0, then start the animation */
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const cw = containerRef.current?.offsetWidth || 856;
        const centerX = cw / 2 - ITEM_W / 2;
        const final   = -(WIN_INDEX * ITEM_STEP - centerX);
        setTranslateX(final);
        setTransitioning(true);
        timerRef.current = setTimeout(() => {
          setPhase("result");
          setResult(winItem);
          setOpenCount((c) => c + 1);
        }, 8400);
      }));
    }, [phase, config.items]);

    /* helper: find best enriched price for result item */
    const resultPrice = useMemo(() => {
      if (!result || !pricedItems.length) return null;
      const enriched = pricedItems.find(
        (p: any) => p.weapon === result.weapon && p.skin === result.skin
      );
      if (!enriched) return null;
      if (result.isStatTrak && enriched._bestStattrakPrice) return enriched._bestStattrakPrice;
      return enriched._bestNormalPrice ?? null;
    }, [result, pricedItems]);

    return (
      <div
        className="sim-overlay"
        onMouseDown={(e: any) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="sim-modal">
          {/* header */}
          <div className="sim-header">
            <div className="sim-header-left">
              <img src={config.image} alt={config.title} />
              <div>
                <h2>{config.title}</h2>
                <span className="sim-subtitle">Case Opening Simulator</span>
              </div>
            </div>
            <button className="sim-close" onClick={onClose} aria-label="Close">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          {/* reel */}
          <div className="sim-reel-container" ref={containerRef}>
            <div
              className="sim-reel-track"
              style={{
                transform: `translateX(${translateX}px)`,
                transition: transitioning
                  ? "transform 8.2s cubic-bezier(0.04, 0.82, 0.18, 1)"
                  : "none",
              }}
            >
              {reel.map((item: any, i: number) => (
                <div key={i} className={`sim-item ${item.rarity}`}>
                  <img src={item.img} alt={item.skin} />
                  <span className="sim-item-name">{item.skin}</span>
                </div>
              ))}
            </div>
            <div className="sim-marker" />
            {phase === "idle" && (
              <div className="sim-idle-hint">Press Open Case to start</div>
            )}
          </div>

          {/* result */}
          {result && phase === "result" && (
            <div className={`sim-result ${result.rarity}`}>
              <img className="sim-result-img" src={result.img} alt={result.skin} />
              <div className="sim-result-info">
                {result.isStatTrak && (
                  <div className="sim-stattrak-label">StatTrak™</div>
                )}
                <h3>
                  {result.weapon} | {result.skin}
                </h3>
                <div className="sim-result-wear">{result.wear}</div>
                <span className={`badge ${result.rarity}`}>{result.badge}</span>
                <div className={`sim-result-price${resultPrice === null ? " loading" : ""}`}>
                  {resultPrice !== null ? formatEuro(resultPrice) : "Price unavailable"}
                </div>
              </div>
            </div>
          )}

          {/* actions */}
          <div className="sim-actions">
            <button
              className="sim-btn primary"
              onClick={openCase}
              disabled={phase === "spinning"}
            >
              <i className="fa-solid fa-box-open" />
              {phase === "spinning" ? "Opening…" : "Open Case"}
            </button>
            <button className="sim-btn secondary" onClick={onClose}>
              Close
            </button>
          </div>

          {openCount > 0 && (
            <div className="sim-stats">
              <span>Opened: <span className="hi">{openCount}×</span></span>
              <span>·</span>
              <span>
                Simulated spend:{" "}
                <span className="hi">
                  ~€{(openCount * (2.19 + parseFloat(
                    String(config.price).replace(/[^\d.,]/g, "").replace(",", ".")
                  ) || 0)).toFixed(2)}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─── PAGE CONFIGS ───────────────────────────────────────────── */

  const pageConfigs: Record<string, any> = {
    fracture: {
      title:      "Fracture Case",
      image:      "assets/cases/fracture-case.webp",
      price:      `0,60 ${"€"}`,
      keyPrice:   `+2,19 ${"€"} Key`,
      collection: { img: "assets/collections/fracture.webp",  name: "Fracture Collection" },
      caseInfo:   { img: "assets/cases/fracture-case.webp",   name: "Fracture Case" },
      stats: [
        { label: "Profit",        value: "4,74%",  key: "profit"      },
        { label: "Investing ROI", value: "74,3%",  key: null, highlight: true },
        { label: "Listings",      value: "238 983", key: "listings" },
      ],
      items: [
        { rarity: "covert",     weapon: "AK-47",      badge: "Covert",     skin: "Legion of Anubis", img: "assets/weapons/rifles/ak47-legion-of-anubis.webp.webp", float: "0.00 - 0.70" },
        { rarity: "covert",     weapon: "Desert Eagle",badge: "Covert",     skin: "Printstream",     img: "assets/weapons/rifles/deagle-printstream.webp",          float: "0.00 - 0.70" },
        { rarity: "classified", weapon: "M4A4",        badge: "Classified", skin: "Tooth Fairy",     img: "assets/weapons/rifles/M4A4Tooth Fairy.webp",             float: "0.00 - 0.73" },
        { rarity: "classified", weapon: "Glock-18",    badge: "Classified", skin: "Vogue",           img: "assets/weapons/rifles/glock-vogue.webp",                 float: "0.00 - 0.70" },
        { rarity: "classified", weapon: "XM1014",      badge: "Classified", skin: "Entombed",        img: "assets/weapons/shotguns/Entombed.webp",                  float: "0.00 - 0.80" },
        { rarity: "restricted", weapon: "Tec-9",       badge: "Restricted", skin: "Brother",         img: "assets/weapons/pistols/tec9-brother.webp",               float: "0.00 - 0.80" },
        { rarity: "restricted", weapon: "MAG-7",       badge: "Restricted", skin: "Monster Call",    img: "assets/weapons/shotguns/mag7-monster-call.webp",         float: "0.00 - 1.00" },
        { rarity: "restricted", weapon: "MAC-10",      badge: "Restricted", skin: "Allure",          img: "assets/weapons/smgs/mac10-allure.webp",                  float: "0.00 - 0.70" },
        { rarity: "restricted", weapon: "MP5-SD",      badge: "Restricted", skin: "Kitbash",         img: "assets/weapons/smgs/mp5sd-kitbash.webp",                 float: "0.00 - 0.85" },
        { rarity: "restricted", weapon: "Galil AR",    badge: "Restricted", skin: "Connexion",       img: "assets/weapons/rifles/galil-connexion.webp",             float: "0.00 - 0.90" },
        { rarity: "milspec",    weapon: "SG 553",      badge: "Mil-Spec",   skin: "Ol' Rusty",       img: "assets/weapons/rifles/sg553-ol-rusty.webp",              float: "0.40 - 1.00" },
        { rarity: "milspec",    weapon: "P250",        badge: "Mil-Spec",   skin: "Cassette",        img: "assets/weapons/pistols/p250-cassette.webp",              float: "0.00 - 0.80" },
        { rarity: "milspec",    weapon: "Negev",       badge: "Mil-Spec",   skin: "Ultralight",      img: "assets/weapons/heavy/negev-ultralight.webp",             float: "0.00 - 0.80" },
        { rarity: "milspec",    weapon: "P90",         badge: "Mil-Spec",   skin: "Freight",         img: "assets/weapons/smgs/p90-freight.webp",                   float: "0.00 - 0.80" },
        { rarity: "milspec",    weapon: "PP-Bizon",    badge: "Mil-Spec",   skin: "Runic",           img: "assets/weapons/smgs/ppbizon-runic.webp",                 float: "0.00 - 0.90" },
        { rarity: "milspec",    weapon: "SSG 08",      badge: "Mil-Spec",   skin: "Mainframe 001",   img: "assets/weapons/rifles/deepreffscout.webp",               float: "0.00 - 0.85" },
      ],
    },
    revolution: {
      title:      "Revolution Case",
      image:      "revolution-case.webp",
      price:      `0,30 ${"€"}`,
      keyPrice:   `+2,19 ${"€"} Key`,
      collection: { img: "assets/collections/revolution.webp",        name: "Revolution Collection" },
      caseInfo:   { img: "assets/cases/revolution-case.webp",          name: "Revolution Case" },
      stats: [
        { label: "Profit",        value: "8,3%",    key: "profit"      },
        { label: "Investing ROI", value: "81,4%",   key: null, highlight: true },
        { label: "Listings",      value: "412 000", key: "listings" },
      ],
      items: [
        { rarity: "covert",     weapon: "M4A4",       badge: "Covert",     skin: "Temukau",        img: "assets/weapons/rifles/M4A4 Temukau.webp",    float: "0.00 - 0.70" },
        { rarity: "covert",     weapon: "AK-47",      badge: "Covert",     skin: "Head Shot",      img: "assets/weapons/rifles/AK-47Head Shot.webp",  float: "0.00 - 0.70" },
        { rarity: "classified", weapon: "P2000",      badge: "Classified", skin: "Wicked Sick",    img: "assets/weapons/pistols/P2000 Wicked Sick.webp",float: "0.00 - 0.70" },
        { rarity: "classified", weapon: "AWP",        badge: "Classified", skin: "Duality",        img: "assets/weapons/pistols/Duality.webp",        float: "0.00 - 0.70" },
        { rarity: "classified", weapon: "UMP-45",     badge: "Classified", skin: "Wild Child",     img: "assets/weapons/smgs/Wild Child.webp",        float: "0.00 - 0.70" },
        { rarity: "restricted", weapon: "R8 Revolver",badge: "Restricted", skin: "Banana Cannon",  img: "assets/weapons/pistols/Banana Cannon.webp",  float: "0.00 - 0.80" },
        { rarity: "restricted", weapon: "M4A1-S",     badge: "Restricted", skin: "Emphorosaur-S",  img: "assets/weapons/rifles/Emphorosaur-S.webp",   float: "0.00 - 0.80" },
        { rarity: "restricted", weapon: "P90",        badge: "Restricted", skin: "Neoqueen",       img: "assets/weapons/smgs/Neoqueen.webp",          float: "0.00 - 1.00" },
        { rarity: "restricted", weapon: "MAC-10",     badge: "Restricted", skin: "Sakkaku",        img: "assets/weapons/smgs/Sakkaku.webp",           float: "0.00 - 0.70" },
        { rarity: "restricted", weapon: "Glock-18",   badge: "Restricted", skin: "Umbral Rabbit",  img: "assets/weapons/smgs/Umbral Rabbit.webp",     float: "0.00 - 0.85" },
        { rarity: "restricted", weapon: "SG 553",     badge: "Restricted", skin: "Cyberforce",     img: "assets/weapons/rifles/Cyberforce.webp",      float: "0.00 - 0.90" },
        { rarity: "milspec",    weapon: "SCAR-20",    badge: "Mil-Spec",   skin: "Fragments",      img: "assets/weapons/rifles/Fragments.webp",       float: "0.40 - 1.00" },
        { rarity: "milspec",    weapon: "P250",       badge: "Mil-Spec",   skin: "Re.built",       img: "assets/weapons/pistols/Re.built.webp",       float: "0.00 - 0.80" },
        { rarity: "milspec",    weapon: "MP9",        badge: "Mil-Spec",   skin: "Featherweight",  img: "assets/weapons/smgs/Featherweight.webp",     float: "0.00 - 0.80" },
        { rarity: "milspec",    weapon: "Tec-9",      badge: "Mil-Spec",   skin: "Rebel",          img: "assets/weapons/pistols/Rebel.webp",          float: "0.00 - 0.80" },
        { rarity: "milspec",    weapon: "MAG-7",      badge: "Mil-Spec",   skin: "Insomnia",       img: "assets/weapons/shotguns/Insomnia.webp",      float: "0.00 - 0.90" },
        { rarity: "milspec",    weapon: "MP5-SD",     badge: "Mil-Spec",   skin: "Liquidation",    img: "assets/weapons/smgs/Liquidatio.webp",        float: "0.00 - 0.85" },
      ],
    },
  };

  function resolveConfig() {
    const path = window.location.pathname.toLowerCase();
    if (path.includes("revolution.html")) return pageConfigs.revolution;
    return pageConfigs.fracture;
  }

  /* ─── MAIN PAGE ──────────────────────────────────────────────── */

  function CasePage({ config }: { config: any }) {
    const [steamPrices, setSteamPrices] = useState(() => ({
      loading: true,
      records: new Map<string, any>(),
      error:   "",
    }));
    const [range,         setRange]         = useState("6m");
    const [showSimulator, setShowSimulator] = useState(false);

    const requestedNames = useMemo(() => buildSteamPriceTargets(config), [config]);

    useEffect(() => {
      let cancelled = false;
      setSteamPrices((cur) => ({ ...cur, loading: true, error: "" }));

      fetch("get_roi_prices_cached.php", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          source:             "steam",
          range:              "30d",
          market_hash_names:  requestedNames,
          steam_catalog_only: true,
        }),
      })
        .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
        .then((data) => {
          if (cancelled) return;
          const records = Array.isArray(data?.items) ? data.items : [];
          setSteamPrices({
            loading: false,
            records: buildPriceMap(records),
            error:   data?.success ? "" : (data?.error || "Steam price data unavailable."),
          });
        })
        .catch((err) => {
          if (cancelled) return;
          setSteamPrices({ loading: false, records: new Map(), error: err?.message || "Steam price data unavailable." });
        });

      return () => { cancelled = true; };
    }, [requestedNames]);

    const caseSteamRecord = steamPrices.records.get(config.title);
    const casePrice       = caseSteamRecord?.current_price_display || (steamPrices.loading ? "Loading…" : config.price);
    const caseSubtitle    = caseSteamRecord?.listings_display
      ? `${caseSteamRecord.listings_display} Steam listings`
      : config.keyPrice;

    const pricedItems = useMemo(
      () => config.items.map((item: any) => enrichCaseItem(item, steamPrices.records, steamPrices.loading)),
      [steamPrices.records, steamPrices.loading, config.items]
    );

    /* Dynamic ROI from fetched Steam prices */
    const dynamicROI = useMemo(() => {
      if (steamPrices.loading) return null;
      const KEY_PRICE  = 2.19;
      const caseRaw    = caseSteamRecord?.current_price ? Number(caseSteamRecord.current_price) : 0.89;
      const totalCost  = caseRaw + KEY_PRICE;
      if (!totalCost) return null;

      const rarityCount: Record<string, number> = {};
      config.items.forEach((item: any) => { rarityCount[item.rarity] = (rarityCount[item.rarity] || 0) + 1; });

      let ev = 0;
      pricedItems.forEach((item: any) => {
        const count = rarityCount[item.rarity] || 1;
        const prob  = (RARITY_TOTAL_PROB[item.rarity] || 0) / count;
        const np    = item._bestNormalPrice   || 0;
        const sp    = item._bestStattrakPrice || np * 1.35;
        ev += prob * (0.9 * np + 0.1 * sp);
      });

      return {
        profit: (((ev - totalCost) / totalCost) * 100).toFixed(2) + "%",
      };
    }, [steamPrices.loading, pricedItems, caseSteamRecord, config.items]);

    const stats = config.stats.map((stat: any) => {
      if (stat.key === "listings" && caseSteamRecord?.listings_display)
        return { ...stat, value: caseSteamRecord.listings_display };
      if (stat.key === "profit" && dynamicROI?.profit)
        return { ...stat, value: dynamicROI.profit };
      return stat;
    });

    const RANGE_LABELS: Record<string, string> = { "1m": "1 Month", "6m": "6 Months", "1y": "1 Year" };

    return (
      <Layout>
        <div className="case-info-card">
          {/* range tabs */}
          <div className="range-tabs">
            {Object.entries(RANGE_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`range-tab${range === key ? " active" : ""}`}
                onClick={() => setRange(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="case-info-top">
            <img src={config.image} alt={config.title} />
            <div className="case-info-meta">
              <h3>{config.title}</h3>
              <div className="case-price">
                <span className="price">{casePrice}</span>
                <span className="key">{caseSubtitle}</span>
              </div>
            </div>
          </div>

          <div className="case-info-stats">
            {stats.map((stat: any) => (
              <div
                className={`info-stat${stat.highlight ? " highlight" : ""}`}
                key={stat.label}
              >
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>

          <div className="case-info-actions">
            <button type="button" className="info-btn">Prices, Stats &amp; History</button>
            <button
              type="button"
              className="info-btn secondary"
              onClick={() => setShowSimulator(true)}
            >
              Simulator
            </button>
          </div>
        </div>

        <div className="case-items-section">
          <div className="case-items-grid">
            {pricedItems.map((item: any) => (
              <CaseItemCard
                key={`${item.weapon}-${item.skin}`}
                item={item}
                collection={config.collection}
                caseInfo={config.caseInfo}
              />
            ))}
          </div>
          {steamPrices.error
            ? <p className="case-price-error">{steamPrices.error}</p>
            : null}
        </div>

        {showSimulator && (
          <CaseSimulator
            config={config}
            pricedItems={pricedItems}
            onClose={() => setShowSimulator(false)}
          />
        )}
      </Layout>
    );
  }

  mountPage(<CasePage config={resolveConfig()} />);
})();
