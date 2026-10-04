(() => {
  const { useEffect, useMemo, useRef, useState } = React;
  const { Layout, mountPage, SortChipPicker } = window.CS2React;

  // TF2 Market Explorer (tf2-market.html), in the CS2 explorer's clean shape:
  // one full-width search field, the result count and a single Sort control
  // (collections.css, the CS2 category-page toolbar) above the CS2 explorer's
  // cards (roi.css) with TF2 data in them - no scope tabs, no chip row, no
  // Type / Source menus (the user asked for the CS2 look). ?cat=<id> from the
  // navbar narrows it to one category; without it every priced item shows.
  // Catalog: assets/data/tf2/catalog.json(.gz) from scripts/tf2_import.php.
  // Row keys: n name, e unusual effect, g category, q quality colour, b base
  // index, i Steam icon path, l Steam listings, s Steam EUR, k Skinport EUR,
  // m Mannco EUR, d DMarket EUR. Cards open tf2-item.html.
  const PAGE = 60;
  const CATEGORIES = [
    { id: "cosmetic", label: "Cosmetic" }, { id: "melee", label: "Melee Weapon" }, { id: "primary", label: "Primary Weapon" },
    { id: "secondary", label: "Secondary Weapon" }, { id: "tool", label: "Tool" }, { id: "crate", label: "Crate" },
    { id: "package", label: "Package" }, { id: "craft_item", label: "Craft Item" }, { id: "gift", label: "Gift" },
    { id: "war_paint", label: "War Paint" }, { id: "taunt", label: "Taunt" }, { id: "strange_part", label: "Strange Part" },
    { id: "party_favor", label: "Party Favor" }, { id: "usable_item", label: "Usable Item" }, { id: "supply_crate", label: "Supply Crate" },
  ];
  const LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
  // "unusual" is not a Skinport category but a navbar entry: every priced
  // item that carries an unusual effect, whatever its category.
  LABEL.unusual = "Unusual";
  const KNOWN = new Set([...CATEGORIES.map((c) => c.id), "unusual"]);
  // Market Explorer tabs: five groups, each with its own category chips.
  // Every row carrying an unusual effect sits under Unusuals; any category
  // not listed below falls into Other.
  const GROUPS = [
    { id: "weapons", label: "Weapons", cats: ["primary", "secondary", "melee", "war_paint"] },
    { id: "cosmetics", label: "Cosmetics", cats: ["cosmetic", "taunt"] },
    { id: "unusual", label: "Unusuals", cats: null },
    { id: "crates", label: "Crates", cats: ["crate", "supply_crate", "package"] },
    { id: "other", label: "Other", cats: ["tool", "strange_part", "craft_item", "gift", "party_favor", "usable_item"] },
  ];
  const GROUP_OF = {};
  for (const g of GROUPS) for (const c of g.cats || []) GROUP_OF[c] = g.id;
  const groupOf = (row) => (row.e ? "unusual" : (GROUP_OF[row.g] || "other"));
  const SORTS = [
    { value: "listed", label: "Most listed" }, { value: "price-desc", label: "Price: high to low" },
    { value: "price-asc", label: "Price: low to high" }, { value: "name", label: "Name A–Z" },
  ];
  const MARKETS = ["s", "k", "m", "d"];

  const euro = (value) => (typeof value === "number" && value > 0 ? new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value) : "—");
  const count = (value) => new Intl.NumberFormat("en-US").format(value || 0);
  const has = (v) => typeof v === "number" && v > 0;

  // Where the item is listed: Steam's count when it has one (an unusual's
  // effect rows carry the plain name's Steam count), else Skinport's,
  // DMarket's or Mannco.store's stock, else the market that prices it - never
  // a bare dash.
  function listingsLine(row) {
    if (has(row.l)) return `${count(row.l)} listed on Steam`;
    if (has(row.kq)) return `${count(row.kq)} listed on Skinport`;
    if (has(row.dq)) return `${count(row.dq)} listed on DMarket`;
    if (has(row.mq)) return `${count(row.mq)} listed on Mannco.store`;
    const markets = [["m", "Mannco.store"], ["k", "Skinport"], ["d", "DMarket"], ["s", "Steam"]].filter(([k]) => has(row[k])).map(([, n]) => n);
    return markets.length ? `Listed on ${markets.join(" · ")}` : "No listing";
  }
  function bestPrice(row) {
    let best = 0;
    for (const key of MARKETS) if (has(row[key]) && (!best || row[key] < best)) best = row[key];
    return best;
  }
  function imageFor(row, catalog) {
    if (row.i) return `${catalog.icon_base}${row.i}/128fx128f`;
    const base = row.b >= 0 ? catalog.bases[row.b] : null;
    if (base && base[1]) return String(base[1]).replace(/^http:/, "https:");
    return "";
  }
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
  const itemHref = (row) => tf2ItemHref(row, true);
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

  function loadCatalog() {
    return tf2LoadJson("assets/data/tf2/catalog.json.gz");
  }

  function Tf2Card({ row, catalog, index }) {
    const img = imageFor(row, catalog);
    const quality = `#${row.q || "B0C3D9"}`;
    const price = bestPrice(row);
    // Unusuals (an effect, or an effect-less "Unusual …" base) get the purple
    // glow behind the render (tf2.css .is-unusual).
    const unusual = Boolean(row.e) || /^Unusual\b/.test(row.n);
    return (
      <a className={`roi-card clean-card category-${row.g}${unusual ? " is-unusual" : ""}`} href={itemHref(row)} title={row.n}
        style={{ "--rarity-accent": quality, "--card-delay": `${Math.min(index, 18) * 32}ms` }}>
        <div className="roi-card-media clean-media">
          {img ? <img src={img} alt={row.n} loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <span className="tf2-card-noimg" aria-hidden="true">TF2</span>}
        </div>
        <div className="roi-card-copy clean-copy">
          <h3>{row.n}</h3>
          <p className="clean-copy-sub">{row.e ? row.e.replace(/^★\s*/, "★ ") : (LABEL[row.g] || "")}</p>
          <div className="roi-card-price-line">
            <strong>{price ? euro(price) : "No listing"}</strong>
          </div>
          <div className="roi-card-foot"><span className="roi-card-listings">{listingsLine(row)}</span></div>
        </div>
      </a>
    );
  }

  // The Market Explorer page (tf2/market/) carries the CS2 explorer's filter
  // bar: Weapons / Cosmetics / Unusuals / Crates / Other tabs, category chips with counts, search and
  // the Type / Source / Sort menus. The category pages (tf2/<category>/) keep
  // the plain search + count + sort toolbar.
  const TYPES = [
    { id: "all", label: "All" }, { id: "strange", label: "Strange", re: /^Strange\b/ }, { id: "vintage", label: "Vintage", re: /^Vintage\b/ },
    { id: "genuine", label: "Genuine", re: /^Genuine\b/ }, { id: "australium", label: "Australium", re: /\bAustralium\b/ },
    { id: "killstreak", label: "Killstreak", re: /\bKillstreak\b/ }, { id: "festivized", label: "Festivized", re: /^Festivized\b/ },
    { id: "collectors", label: "Collector's", re: /^Collector's\b/ }, { id: "haunted", label: "Haunted", re: /^Haunted\b/ },
    { id: "craftable", label: "Craftable only", test: (n) => !/^Non-Craftable\b/.test(n) },
  ];
  const SOURCES = [
    { id: "best", label: "Best price" }, { id: "s", label: "Steam Market" }, { id: "k", label: "Skinport" },
    { id: "m", label: "Mannco.store" }, { id: "d", label: "DMarket" },
  ];
  const priceIn = (row, source) => (source === "best" ? bestPrice(row) : (has(row[source]) ? row[source] : 0));

  function RoiMenu({ label, options, value, onChange, shellClass }) {
    const [open, setOpen] = useState(false);
    const menuRef = useRef(null);
    useEffect(() => {
      if (!open) return undefined;
      const onOutside = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
      document.addEventListener("mousedown", onOutside);
      return () => document.removeEventListener("mousedown", onOutside);
    }, [open]);
    const current = options.find((o) => o.id === value) || options[0];
    return (
      <div className={`roi-select-shell compact${shellClass ? ` ${shellClass}` : ""}`}>
        <span>{label}</span>
        <div className="roi-type-menu" ref={menuRef}>
          <button type="button" className={`roi-type-trigger${open ? " open" : ""}`} onClick={() => setOpen((p) => !p)}>
            <span>{current.label}</span>
            <i className="fa-solid fa-chevron-down" />
          </button>
          <div className={`roi-type-dropdown${open ? " open" : ""}`}>
            {options.map((option) => (
              <button type="button" key={option.id} className={`roi-type-option${value === option.id ? " active" : ""}`} onClick={() => { onChange(option.id); setOpen(false); }}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /**
   * Unusuals sorted "Most listed" would show one item's 40 effects in a row
   * (every effect of an item shares the item's Steam count). Round-robin by
   * item instead: the first effect of each item, then the second, ... so the
   * page mixes hats, taunts and weapons.
   */
  function interleaveByItem(list) {
    const groups = new Map();
    for (const row of list) {
      if (!groups.has(row.n)) groups.set(row.n, []);
      groups.get(row.n).push(row);
    }
    const buckets = [...groups.values()];
    const out = [];
    for (let i = 0; out.length < list.length; i += 1) {
      for (const b of buckets) if (i < b.length) out.push(b[i]);
    }
    return out;
  }

  function Tf2MarketPage() {
    const [catalog, setCatalog] = useState(null);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [debounced, setDebounced] = useState("");
    // The clean category pages (tf2/<category>/) carry it in the route; the
    // explorer (tf2/market/) has none and shows the full filter bar.
    const [routeCat] = useState(() => {
      try { const cat = (window.__TF2_ROUTE__ && window.__TF2_ROUTE__.cat) || new URLSearchParams(window.location.search).get("cat") || ""; return KNOWN.has(cat) ? cat : ""; } catch (_e) { return ""; }
    });
    const explorer = !routeCat;
    const [chip, setChip] = useState("all");
    const [scope, setScope] = useState("weapons");
    const [type, setType] = useState("all");
    const [source, setSource] = useState("best");
    const category = explorer ? (chip !== "all" ? chip : (scope === "unusual" ? "unusual" : "all")) : routeCat;
    const [sort, setSort] = useState("listed");
    const [shown, setShown] = useState(PAGE);
    const sentinelRef = useRef(null);
    const title = category === "all" ? "TF2 items" : `${LABEL[category]} items`;

    useEffect(() => {
      let alive = true;
      loadCatalog().then((data) => { if (!alive) return; if (!data || !Array.isArray(data.items)) throw new Error("Catalog is empty."); setCatalog(data); })
        .catch((err) => { if (alive) setError(err.message || "Could not load the TF2 catalog."); });
      return () => { alive = false; };
    }, []);
    useEffect(() => { const t = window.setTimeout(() => setDebounced(query.trim().toLowerCase()), 180); return () => window.clearTimeout(t); }, [query]);
    useEffect(() => { setShown(PAGE); }, [debounced, sort, chip, scope, type, source]);
    useEffect(() => { document.title = `${category === "all" ? "TF2 Market Explorer" : `TF2 ${LABEL[category]} items`} – Steam, Skinport, Mannco & DMarket Prices | TFPRICE`; }, [category]);

    const typeDef = TYPES.find((t) => t.id === type) || TYPES[0];
    const passes = (row) => priceIn(row, source) > 0
      && (!typeDef.re || typeDef.re.test(row.n))
      && (!typeDef.test || typeDef.test(row.n))
      && (!debounced || `${row.n} ${row.e}`.toLowerCase().includes(debounced));
    // Chip counts on the explorer: every category under the current scope,
    // type, source and search.
    const counts = useMemo(() => {
      const out = { all: 0 };
      if (!catalog || !explorer) return out;
      for (const row of catalog.items) {
        if (groupOf(row) !== scope || !passes(row)) continue;
        out.all += 1;
        out[row.g] = (out[row.g] || 0) + 1;
      }
      return out;
    }, [catalog, explorer, scope, type, source, debounced]);
    const rows = useMemo(() => {
      if (!catalog) return [];
      let list = catalog.items.filter((row) => (explorer
        ? groupOf(row) === scope && (chip === "all" || row.g === chip)
        : (category === "all" || (category === "unusual" ? Boolean(row.e) : row.g === category)))
        && passes(row));
      const p = (row) => priceIn(row, source);
      if (sort === "price-desc") list.sort((a, b) => p(b) - p(a));
      else if (sort === "price-asc") list.sort((a, b) => p(a) - p(b));
      else if (sort === "name") list.sort((a, b) => a.n.localeCompare(b.n));
      else if (explorer ? scope === "unusual" : category === "unusual") list = interleaveByItem(list);
      return list;
    }, [catalog, category, chip, scope, explorer, debounced, sort, type, source]);
    useEffect(() => {
      const node = sentinelRef.current;
      if (!node || shown >= rows.length) return undefined;
      const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setShown((n) => n + PAGE); }, { rootMargin: "600px 0px" });
      io.observe(node);
      return () => io.disconnect();
    }, [rows.length, shown]);

    return (
      <Layout>
        <section className={`roi-shell roi-clean-shell tf2-roi${explorer ? "" : " tf2-roi--category"}`}>
          <h1 className="collections-head-sr-title">{explorer ? "TF2 Market Explorer" : title}</h1>
          {explorer ? (
            <section className="roi-filter-frame roi-reveal" style={{ "--reveal-delay": "60ms" }}>
              <div className="roi-scope-tabs" role="tablist" aria-label="Scope">
                {GROUPS.map(({ id, label }) => (
                  <button type="button" key={id} className={`roi-scope-tab${scope === id ? " active" : ""}`} onClick={() => { setScope(id); setChip("all"); }}>{label}</button>
                ))}
              </div>
              <div className="roi-sub-tabs">
                {[{ id: "all", label: "All" }, ...CATEGORIES.filter((c) => counts[c.id] && (scope === "unusual" || groupOf({ g: c.id }) === scope))].map((option) => (
                  <button type="button" key={option.id} className={`roi-sub-tab${chip === option.id ? " active" : ""}`} onClick={() => setChip(option.id)}>
                    {option.label}
                    {counts[option.id] ? <span>{count(counts[option.id])}</span> : null}
                  </button>
                ))}
              </div>
              <div className="roi-toolbar-clean compact">
                <label className="roi-search-shell" aria-label="Search TF2 items">
                  <i className="fa-solid fa-magnifying-glass" />
                  <input type="text" value={query} placeholder="Search items..." onChange={(event) => setQuery(event.target.value)} />
                </label>
                <RoiMenu label="Type" options={TYPES} value={type} onChange={setType} />
                <RoiMenu label="Source" options={SOURCES} value={source} onChange={setSource} shellClass="roi-select-source" />
                <RoiMenu label="Sort" options={SORTS.map((o) => ({ id: o.value, label: o.label }))} value={sort} onChange={setSort} />
              </div>
            </section>
          ) : (
            <div className="collections-controls">
              <div className="collections-search-wrap">
                <i className="fa-solid fa-magnifying-glass" />
                <input type="text" placeholder={`Search ${title.toLowerCase()}...`} value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <span className="collections-results-count">{catalog ? `${count(rows.length)} results` : "Loading…"}</span>
              <SortChipPicker value={sort} options={SORTS} onChange={setSort} ariaLabel={`Sort ${title}`} />
            </div>
          )}

          <section className="roi-section-card roi-reveal" id="roi-items" style={{ "--reveal-delay": "130ms" }}>
            {error ? <div className="roi-empty-state"><i className="fa-solid fa-box-open" /><strong>{error}</strong></div> : null}
            {!catalog && !error ? (
              <div className="roi-grid loading">
                {Array.from({ length: 10 }).map((_, i) => <div className="roi-card skeleton" key={i}><div className="roi-card-media" /><div className="roi-card-lines"><span /><span /><span /></div></div>)}
              </div>
            ) : null}
            {catalog ? (
              <>
                <div className="roi-grid clean-grid">
                  {rows.slice(0, shown).map((row, index) => <Tf2Card key={`${row.n}|${row.e}`} row={row} catalog={catalog} index={index % PAGE} />)}
                </div>
                {!rows.length ? <div className="roi-empty-state"><i className="fa-solid fa-box-open" /><strong>No TF2 items match</strong><span>Try another search.</span></div> : null}
                <div ref={sentinelRef} className="tf2-sentinel" aria-hidden="true" />
              </>
            ) : null}
          </section>
        </section>
      </Layout>
    );
  }

  mountPage(<Tf2MarketPage />);
})();
