(() => {
  const { useEffect, useMemo, useRef, useState } = React;
  const { Layout, mountPage } = window.CS2React;

  // TF2 Deals (tf2-deals.html) on the CS2 Deals page's own classes (deals.css),
  // so the two look the same: TF2 items priced on at least two of Steam,
  // Skinport, Mannco.store and DMarket, cheapest highlighted. Data:
  // assets/data/tf2/deals.json(.gz) from scripts/tf2_import.php, rows
  // [name, category, quality, image, steam, skinport, mannco, dmarket,
  // steam listings, base index]. Image: a Steam icon path, or "!" + a full
  // schema image URL. Rows open the item's page on this site.
  const PAGE_SIZE = 60;
  const MARKETS = [
    { idx: 4, id: "steam", label: "Steam", image: "assets/markets/steam.png", url: (n) => `https://steamcommunity.com/market/listings/440/${encodeURIComponent(n)}` },
    { idx: 5, id: "skinport", label: "Skinport", image: "assets/markets/skinport.png", url: (n) => `https://skinport.com/tf2/market?search=${encodeURIComponent(n)}` },
    // row[10] is the item's mannco.store page slug (/item/<slug>) from the
    // importer; without it the TF2 search ("/?search=" is just the front page).
    { idx: 6, id: "mannco", label: "Mannco", image: "assets/markets/mannco.ico", url: (n, row) => (row && row[10] ? `https://mannco.store/item/${encodeURIComponent(row[10])}` : `https://mannco.store/tf2?search=${encodeURIComponent(n)}`) },
    { idx: 7, id: "dmarket", label: "DMarket", image: "assets/markets/dmarket.png", url: (n) => `https://dmarket.com/ingame-items/item-list/tf2-skins?title=${encodeURIComponent(n)}` },
  ];
  const TYPE_TABS = [
    { id: "all", label: "All" },
    { id: "cosmetic", label: "Cosmetics" },
    { id: "primary", label: "Primary" },
    { id: "secondary", label: "Secondary" },
    { id: "melee", label: "Melee" },
    { id: "war_paint", label: "War Paints" },
    { id: "taunt", label: "Taunts" },
    { id: "tool", label: "Tools" },
    { id: "crate", label: "Crates" },
    { id: "other", label: "Other" },
  ];
  const MAIN = new Set(TYPE_TABS.map((t) => t.id));
  const LABEL = {
    cosmetic: "Cosmetic", melee: "Melee Weapon", primary: "Primary Weapon", secondary: "Secondary Weapon", tool: "Tool",
    crate: "Crate", package: "Package", craft_item: "Craft Item", gift: "Gift", war_paint: "War Paint", taunt: "Taunt",
    strange_part: "Strange Part", party_favor: "Party Favor", usable_item: "Usable Item", supply_crate: "Supply Crate",
  };
  const SORT_OPTIONS = [
    { id: "gap", label: "Best Gap" },
    { id: "cheapest", label: "Cheapest Overall" },
    { id: "listed", label: "Most listed" },
    { id: "name", label: "A to Z" },
    ...MARKETS.map((m) => ({ id: `cheap-${m.id}`, label: `Cheapest ${m.label}` })),
  ];

  const classNames = (...parts) => parts.filter(Boolean).join(" ");
  const fmtPrice = (v) => (typeof v === "number" && v > 0
    ? new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(v)
    : "");
  const count = (v) => new Intl.NumberFormat("en-US").format(v || 0);
  const has = (v) => typeof v === "number" && v > 0;
  const prices = (row) => MARKETS.map((m) => row[m.idx]).filter(has);
  const cheapest = (row) => Math.min(...prices(row));
  const cheapestMarket = (row) => { const low = cheapest(row); return MARKETS.find((m) => has(row[m.idx]) && row[m.idx] === low); };
  // Gap: how much cheaper the best market is than the priciest one, as a
  // share of the priciest - the saving for buying in the right place.
  const gap = (row) => { const p = prices(row); const hi = Math.max(...p); return hi > 0 ? (hi - Math.min(...p)) / hi : 0; };
  // Clean TF2 URLs (scripts/tf2_url_helpers.php, same rules): every priced
  // item has a static page at tf2/<category>/<slug>/ (unusuals under
  // tf2/unusual/, the slug led by the effect); anything else keeps the query
  // URL. Keep this in step with the PHP twin.
  const TF2_URL_FOLD = { "\u00c0": "a", "\u00c1": "a", "\u00c2": "a", "\u00c3": "a", "\u00c4": "a", "\u00c5": "a", "\u00e0": "a", "\u00e1": "a", "\u00e2": "a", "\u00e3": "a", "\u00e4": "a", "\u00e5": "a", "\u00c7": "c", "\u00e7": "c", "\u00c8": "e", "\u00c9": "e", "\u00ca": "e", "\u00cb": "e", "\u00e8": "e", "\u00e9": "e", "\u00ea": "e", "\u00eb": "e", "\u00cc": "i", "\u00cd": "i", "\u00ce": "i", "\u00cf": "i", "\u00ec": "i", "\u00ed": "i", "\u00ee": "i", "\u00ef": "i", "\u00d1": "n", "\u00f1": "n", "\u00d2": "o", "\u00d3": "o", "\u00d4": "o", "\u00d5": "o", "\u00d6": "o", "\u00d8": "o", "\u00f2": "o", "\u00f3": "o", "\u00f4": "o", "\u00f5": "o", "\u00f6": "o", "\u00f8": "o", "\u00d9": "u", "\u00da": "u", "\u00db": "u", "\u00dc": "u", "\u00f9": "u", "\u00fa": "u", "\u00fb": "u", "\u00fc": "u", "\u00dd": "y", "\u00fd": "y", "\u00ff": "y" };
  function tf2Slug(name, effect) {
    const fx = String(effect || "").trim().replace(/^\u2605\s*/, "");
    let t = `${fx ? `${fx} ` : ""}${String(name || "").trim()}`;
    t = t.replace(/[\u00c0-\u00ff]/g, (c) => TF2_URL_FOLD[c] || c).replace(/[^\x00-\x7F]/g, "").toLowerCase();
    t = t.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return t || "item";
  }
  function tf2Priced(row) {
    return ["s", "k", "m", "d"].some((k) => typeof row[k] === "number" && row[k] > 0);
  }
  /** Link to an item: { n, e, g, b, s, k, m, d } catalog-row shape; priced = override. */
  function tf2ItemHref(row, priced) {
    const ok = priced === undefined ? tf2Priced(row) : priced;
    if (ok && row.n) {
      const seg = row.e ? "unusual" : String(row.g || "cosmetic").toLowerCase().replace(/_/g, "-");
      return `tf2/${seg}/${tf2Slug(row.n, row.e)}/`;
    }
    const p = new URLSearchParams({ item: row.n || "" });
    if (row.e) p.set("e", row.e);
    if (typeof row.b === "number" && row.b >= 0) p.set("b", String(row.b));
    return `tf2-item.html?${p.toString()}`;
  }
  // Deals rows are effect-less and priced on two or more markets: always a clean page.
  const itemHref = (name, base, category) => tf2ItemHref({ n: name, e: "", g: category, b: typeof base === "number" ? base : -1 }, true);

  // Cached data loads (user, 2026-10-03: "make the tab switching smooth"):
  // the host serves assets/data with max-age=30, so every page change used
  // to re-download and re-parse the multi-megabyte catalog. Parsed data now
  // lives on window for the session (soft navigation keeps the window), and
  // the browser cache is keyed by the data stamp (summary.json generated_at),
  // so a full reload fetches each file once per weekly refresh.
  async function tf2DataStamp() {
    if (window.__TF2_DATA_STAMP !== undefined) return window.__TF2_DATA_STAMP;
    let stamp = "";
    try {
      const res = await fetch("assets/data/tf2/summary.json", { credentials: "same-origin", cache: "no-cache" });
      const json = res.ok ? await res.json() : null;
      stamp = String((json && json.generated_at) || "");
    } catch (_error) { /* no stamp: plain caching below */ }
    window.__TF2_DATA_STAMP = stamp;
    return stamp;
  }

  function tf2LoadJson(path) {
    const mem = window.__TF2_DATA_MEM || (window.__TF2_DATA_MEM = {});
    if (mem[path]) return mem[path];
    mem[path] = (async () => {
      const stamp = await tf2DataStamp();
      const query = stamp ? `?v=${encodeURIComponent(stamp)}` : "";
      const opts = { credentials: "same-origin", cache: stamp ? "force-cache" : "default" };
      if (path.endsWith(".gz") && typeof DecompressionStream === "function") {
        try {
          const res = await fetch(path + query, opts);
          if (res.ok && res.body) {
            return JSON.parse(await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text());
          }
        } catch (_error) { /* plain file below */ }
      }
      const res = await fetch(path.replace(/\.gz$/, "") + query, opts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })().catch((error) => { delete mem[path]; throw error; });
    return mem[path];
  }

  function loadDeals() {
    return tf2LoadJson("assets/data/tf2/deals.json.gz");
  }

  function MarketHead({ provider }) {
    return (
      <span className="deals-market-head">
        {provider.image ? <img src={provider.image} alt="" loading="lazy" decoding="async" /> : null}
        {provider.label}
      </span>
    );
  }

  function DealPriceCell({ price, url, isCheapest, market }) {
    const formatted = fmtPrice(price);
    if (formatted && url) {
      return (
        <a
          className={classNames("deals-price-link", isCheapest && "cheaper")}
          data-market={market}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {formatted}
        </a>
      );
    }
    return <span className={classNames("deals-price", !formatted && "na")} data-market={market}>{formatted || "—"}</span>;
  }

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
        <button type="button" className={classNames("deals-dd-trigger", open && "open")} onClick={() => setOpen((v) => !v)}>
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

  function SkeletonRows({ n = 8 }) {
    return Array.from({ length: n }, (_, i) => (
      <div className="deals-skeleton-row" key={i}>
        <div className="deals-skel img" />
        <div style={{ display: "grid", gap: "8px", paddingRight: "16px" }}>
          <div className="deals-skel" style={{ width: "60%" }} />
          <div className="deals-skel" style={{ width: "40%" }} />
        </div>
        {MARKETS.map((p) => <div key={p.id} className="deals-skel" style={{ width: "70%", justifySelf: "end" }} />)}
      </div>
    ));
  }

  function Tf2DealsPage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [sortBy, setSortBy] = useState("gap");
    const [visible, setVisible] = useState(PAGE_SIZE);
    const [isPhone, setIsPhone] = useState(() => window.matchMedia("(max-width: 767px)").matches);
    const loadMoreRef = useRef(null);

    useEffect(() => {
      const mq = window.matchMedia("(max-width: 767px)");
      const on = () => setIsPhone(mq.matches);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    }, []);
    useEffect(() => {
      let alive = true;
      loadDeals()
        .then((json) => { if (alive) setData(json); })
        .catch((err) => { if (alive) setError(err.message || "Could not load TF2 deals."); });
      return () => { alive = false; };
    }, []);
    useEffect(() => {
      const t = window.setTimeout(() => setDebounced(query.trim().toLowerCase()), 180);
      return () => window.clearTimeout(t);
    }, [query]);

    const rows = useMemo(() => {
      if (!data) return [];
      const list = data.items.filter((row) => (
        (typeFilter === "all" || (typeFilter === "other" ? !MAIN.has(row[1]) : row[1] === typeFilter))
        && (!debounced || String(row[0]).toLowerCase().includes(debounced))
      ));
      if (sortBy === "gap") {
        // Big savings on items that actually trade; a gap above 3x is a
        // troll listing, not a deal, and sinks.
        const score = (row) => {
          const p = prices(row);
          if (Math.max(...p) > 3 * Math.min(...p)) return -1;
          const liquidity = Math.min(1, (row[8] || 0) / 25) * 0.7 + (p.length - 1) * 0.1;
          return gap(row) * Math.min(1, cheapest(row)) * liquidity;
        };
        list.sort((a, b) => score(b) - score(a));
      } else if (sortBy === "cheapest") {
        list.sort((a, b) => cheapest(a) - cheapest(b));
      } else if (sortBy === "listed") {
        list.sort((a, b) => (b[8] || 0) - (a[8] || 0));
      } else if (sortBy === "name") {
        list.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      } else {
        const m = MARKETS.find((x) => sortBy === `cheap-${x.id}`);
        if (m) {
          const only = list.filter((row) => has(row[m.idx]));
          only.sort((a, b) => a[m.idx] - b[m.idx]);
          return only;
        }
      }
      return list;
    }, [data, typeFilter, debounced, sortBy]);

    const visibleRows = rows.slice(0, visible);
    const hasMoreRows = visible < rows.length;
    useEffect(() => {
      const node = loadMoreRef.current;
      if (!node || !hasMoreRows) return undefined;
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((n) => n + PAGE_SIZE);
      }, { rootMargin: "700px 0px" });
      io.observe(node);
      return () => io.disconnect();
    }, [hasMoreRows, rows.length, visible]);

    const isLoading = !data && !error;

    return (
      <Layout>
        <div className="deals-shell tf2-deals">
          <div className="deals-filter-frame">
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
                {isPhone ? (
                  <DdSelect label="Category" value={typeFilter} options={TYPE_TABS} onChange={(v) => { setTypeFilter(v); setVisible(PAGE_SIZE); }} />
                ) : null}
                <DdSelect label="Sort by" value={sortBy} options={SORT_OPTIONS} onChange={(v) => { setSortBy(v); setVisible(PAGE_SIZE); }} />
              </div>
            </div>
          </div>

          <div className="deals-meta">
            <span className="deals-meta-left" aria-hidden="true" />
            <span className="deals-meta-right">
              <span>{data ? `${count(rows.length)} items · 2+ markets · updated ${new Date(data.generated_at).toLocaleDateString()}` : "Loading TF2 deals…"}</span>
            </span>
          </div>

          {error ? (
            <div className="deals-status err"><i className="fa-solid fa-triangle-exclamation" /> {error}</div>
          ) : null}

          <div className="deals-card">
            <div className="deals-table-scroll">
              <div className="deals-thead">
                <span></span>
                <span>Item</span>
                {MARKETS.map((provider) => <span key={provider.id}><MarketHead provider={provider} /></span>)}
              </div>

              {isLoading ? (
                <SkeletonRows n={10} />
              ) : visibleRows.length === 0 ? (
                <div className="deals-empty">
                  <div className="deals-empty-icon"><i className="fa-solid fa-tags" /></div>
                  <strong>No deals found</strong>
                  <span>No TF2 items with a price on two or more markets matched your filters. Try another category or search.</span>
                </div>
              ) : (
                visibleRows.map((row, index) => {
                  const [name, category, quality, image] = row;
                  const img = image ? (image[0] === "!" ? image.slice(1).replace(/^http:/, "https:") : `${data.icon_base}${image}/96fx96f`) : "";
                  const low = cheapest(row);
                  const best = cheapestMarket(row);
                  const href = itemHref(name, row[9], row[1]);
                  const go = () => { window.location.href = href; };
                  return (
                    <div
                      key={name}
                      className="deals-row is-clickable"
                      style={{ "--row-index": index }}
                      role="link"
                      tabIndex={0}
                      onClick={go}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); go(); } }}
                    >
                      <div className="deals-row-img">
                        {img ? <img src={img} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <span className="deals-row-placeholder">{name.slice(0, 2).toUpperCase()}</span>}
                      </div>
                      <div className="deals-row-info">
                        <div className="deals-item-name" style={quality ? { color: `color-mix(in srgb, #${quality} 55%, currentColor)` } : undefined}>{name}</div>
                        <div className="deals-item-sub">
                          {[LABEL[category] || "", row[8] ? `${count(row[8])} listed on Steam` : "", `save ${Math.round(gap(row) * 100)}%${best ? ` on ${best.label}` : ""}`].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {MARKETS.map((m) => (
                        <DealPriceCell
                          key={m.id}
                          market={m.label}
                          price={row[m.idx]}
                          url={has(row[m.idx]) ? m.url(name, row) : ""}
                          isCheapest={has(row[m.idx]) && row[m.idx] === low}
                        />
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {hasMoreRows ? <div ref={loadMoreRef} className="deals-load-more deals-load-more-sentinel" aria-hidden="true" /> : null}
        </div>
      </Layout>
    );
  }

  mountPage(<Tf2DealsPage />);
})();
