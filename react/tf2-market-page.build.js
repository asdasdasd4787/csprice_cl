(() => {
  (() => {
    const { useEffect, useMemo, useRef, useState } = React;
    const { Layout, mountPage, SortChipPicker } = window.CS2React;
    const PAGE = 60;
    const CATEGORIES = [
      { id: "cosmetic", label: "Cosmetic" },
      { id: "melee", label: "Melee Weapon" },
      { id: "primary", label: "Primary Weapon" },
      { id: "secondary", label: "Secondary Weapon" },
      { id: "tool", label: "Tool" },
      { id: "crate", label: "Crate" },
      { id: "package", label: "Package" },
      { id: "craft_item", label: "Craft Item" },
      { id: "gift", label: "Gift" },
      { id: "war_paint", label: "War Paint" },
      { id: "taunt", label: "Taunt" },
      { id: "strange_part", label: "Strange Part" },
      { id: "party_favor", label: "Party Favor" },
      { id: "usable_item", label: "Usable Item" },
      { id: "supply_crate", label: "Supply Crate" }
    ];
    const LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
    LABEL.unusual = "Unusual";
    const KNOWN = /* @__PURE__ */ new Set([...CATEGORIES.map((c) => c.id), "unusual"]);
    const GROUPS = [
      { id: "weapons", label: "Weapons", cats: ["primary", "secondary", "melee", "war_paint"] },
      { id: "cosmetics", label: "Cosmetics", cats: ["cosmetic", "taunt"] },
      { id: "unusual", label: "Unusuals", cats: null },
      { id: "crates", label: "Crates", cats: ["crate", "supply_crate", "package"] },
      { id: "other", label: "Other", cats: ["tool", "strange_part", "craft_item", "gift", "party_favor", "usable_item"] }
    ];
    const GROUP_OF = {};
    for (const g of GROUPS) for (const c of g.cats || []) GROUP_OF[c] = g.id;
    const groupOf = (row) => row.e ? "unusual" : GROUP_OF[row.g] || "other";
    const SORTS = [
      { value: "listed", label: "Most listed" },
      { value: "price-desc", label: "Price: high to low" },
      { value: "price-asc", label: "Price: low to high" },
      { value: "name", label: "Name A–Z" }
    ];
    const MARKETS = ["s", "k", "m", "d"];
    const euro = (value) => typeof value === "number" && value > 0 ? new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(value) : "—";
    const count = (value) => new Intl.NumberFormat("en-US").format(value || 0);
    const has = (v) => typeof v === "number" && v > 0;
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
    const TF2_URL_FOLD = { "À": "a", "Á": "a", "Â": "a", "Ã": "a", "Ä": "a", "Å": "a", "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a", "Ç": "c", "ç": "c", "È": "e", "É": "e", "Ê": "e", "Ë": "e", "è": "e", "é": "e", "ê": "e", "ë": "e", "Ì": "i", "Í": "i", "Î": "i", "Ï": "i", "ì": "i", "í": "i", "î": "i", "ï": "i", "Ñ": "n", "ñ": "n", "Ò": "o", "Ó": "o", "Ô": "o", "Õ": "o", "Ö": "o", "Ø": "o", "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o", "ø": "o", "Ù": "u", "Ú": "u", "Û": "u", "Ü": "u", "ù": "u", "ú": "u", "û": "u", "ü": "u", "Ý": "y", "ý": "y", "ÿ": "y" };
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
    function tf2ItemHref(row, priced) {
      const ok = priced === void 0 ? tf2Priced(row) : priced;
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
    async function tf2DataStamp() {
      if (window.__TF2_DATA_STAMP !== void 0) return window.__TF2_DATA_STAMP;
      let stamp = "";
      try {
        const res = await fetch("assets/data/tf2/summary.json", { credentials: "same-origin", cache: "no-cache" });
        const json = res.ok ? await res.json() : null;
        stamp = String(json && json.generated_at || "");
      } catch (_error) {
      }
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
            const res2 = await fetch(path + query, opts);
            if (res2.ok && res2.body) {
              return JSON.parse(await new Response(res2.body.pipeThrough(new DecompressionStream("gzip"))).text());
            }
          } catch (_error) {
          }
        }
        const res = await fetch(path.replace(/\.gz$/, "") + query, opts);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })().catch((error) => {
        delete mem[path];
        throw error;
      });
      return mem[path];
    }
    function loadCatalog() {
      return tf2LoadJson("assets/data/tf2/catalog.json.gz");
    }
    function Tf2Card({ row, catalog, index }) {
      const img = imageFor(row, catalog);
      const quality = `#${row.q || "B0C3D9"}`;
      const price = bestPrice(row);
      const unusual = Boolean(row.e) || /^Unusual\b/.test(row.n);
      return /* @__PURE__ */ React.createElement(
        "a",
        {
          className: `roi-card clean-card category-${row.g}${unusual ? " is-unusual" : ""}`,
          href: itemHref(row),
          title: row.n,
          style: { "--rarity-accent": quality, "--card-delay": `${Math.min(index, 18) * 32}ms` }
        },
        /* @__PURE__ */ React.createElement("div", { className: "roi-card-media clean-media" }, img ? /* @__PURE__ */ React.createElement("img", { src: img, alt: row.n, loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" }) : /* @__PURE__ */ React.createElement("span", { className: "tf2-card-noimg", "aria-hidden": "true" }, "TF2")),
        /* @__PURE__ */ React.createElement("div", { className: "roi-card-copy clean-copy" }, /* @__PURE__ */ React.createElement("h3", null, row.n), /* @__PURE__ */ React.createElement("p", { className: "clean-copy-sub" }, row.e ? row.e.replace(/^★\s*/, "★ ") : LABEL[row.g] || ""), /* @__PURE__ */ React.createElement("div", { className: "roi-card-price-line" }, /* @__PURE__ */ React.createElement("strong", null, price ? euro(price) : "No listing")), /* @__PURE__ */ React.createElement("div", { className: "roi-card-foot" }, /* @__PURE__ */ React.createElement("span", { className: "roi-card-listings" }, listingsLine(row))))
      );
    }
    const TYPES = [
      { id: "all", label: "All" },
      { id: "strange", label: "Strange", re: /^Strange\b/ },
      { id: "vintage", label: "Vintage", re: /^Vintage\b/ },
      { id: "genuine", label: "Genuine", re: /^Genuine\b/ },
      { id: "australium", label: "Australium", re: /\bAustralium\b/ },
      { id: "killstreak", label: "Killstreak", re: /\bKillstreak\b/ },
      { id: "festivized", label: "Festivized", re: /^Festivized\b/ },
      { id: "collectors", label: "Collector's", re: /^Collector's\b/ },
      { id: "haunted", label: "Haunted", re: /^Haunted\b/ },
      { id: "craftable", label: "Craftable only", test: (n) => !/^Non-Craftable\b/.test(n) }
    ];
    const SOURCES = [
      { id: "best", label: "Best price" },
      { id: "s", label: "Steam Market" },
      { id: "k", label: "Skinport" },
      { id: "m", label: "Mannco.store" },
      { id: "d", label: "DMarket" }
    ];
    const priceIn = (row, source) => source === "best" ? bestPrice(row) : has(row[source]) ? row[source] : 0;
    function RoiMenu({ label, options, value, onChange, shellClass }) {
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
      const current = options.find((o) => o.id === value) || options[0];
      return /* @__PURE__ */ React.createElement("div", { className: `roi-select-shell compact${shellClass ? ` ${shellClass}` : ""}` }, /* @__PURE__ */ React.createElement("span", null, label), /* @__PURE__ */ React.createElement("div", { className: "roi-type-menu", ref: menuRef }, /* @__PURE__ */ React.createElement("button", { type: "button", className: `roi-type-trigger${open ? " open" : ""}`, onClick: () => setOpen((p) => !p) }, /* @__PURE__ */ React.createElement("span", null, current.label), /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-down" })), /* @__PURE__ */ React.createElement("div", { className: `roi-type-dropdown${open ? " open" : ""}` }, options.map((option) => /* @__PURE__ */ React.createElement("button", { type: "button", key: option.id, className: `roi-type-option${value === option.id ? " active" : ""}`, onClick: () => {
        onChange(option.id);
        setOpen(false);
      } }, option.label)))));
    }
    function interleaveByItem(list) {
      const groups = /* @__PURE__ */ new Map();
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
      const [routeCat] = useState(() => {
        try {
          const cat = window.__TF2_ROUTE__ && window.__TF2_ROUTE__.cat || new URLSearchParams(window.location.search).get("cat") || "";
          return KNOWN.has(cat) ? cat : "";
        } catch (_e) {
          return "";
        }
      });
      const explorer = !routeCat;
      const [chip, setChip] = useState("all");
      const [scope, setScope] = useState("weapons");
      const [type, setType] = useState("all");
      const [source, setSource] = useState("best");
      const category = explorer ? chip !== "all" ? chip : scope === "unusual" ? "unusual" : "all" : routeCat;
      const [sort, setSort] = useState("listed");
      const [shown, setShown] = useState(PAGE);
      const sentinelRef = useRef(null);
      const title = category === "all" ? "TF2 items" : `${LABEL[category]} items`;
      useEffect(() => {
        let alive = true;
        loadCatalog().then((data) => {
          if (!alive) return;
          if (!data || !Array.isArray(data.items)) throw new Error("Catalog is empty.");
          setCatalog(data);
        }).catch((err) => {
          if (alive) setError(err.message || "Could not load the TF2 catalog.");
        });
        return () => {
          alive = false;
        };
      }, []);
      useEffect(() => {
        const t = window.setTimeout(() => setDebounced(query.trim().toLowerCase()), 180);
        return () => window.clearTimeout(t);
      }, [query]);
      useEffect(() => {
        setShown(PAGE);
      }, [debounced, sort, chip, scope, type, source]);
      useEffect(() => {
        document.title = `${category === "all" ? "TF2 Market Explorer" : `TF2 ${LABEL[category]} items`} – Steam, Skinport, Mannco & DMarket Prices | TFPRICE`;
      }, [category]);
      const typeDef = TYPES.find((t) => t.id === type) || TYPES[0];
      const passes = (row) => priceIn(row, source) > 0 && (!typeDef.re || typeDef.re.test(row.n)) && (!typeDef.test || typeDef.test(row.n)) && (!debounced || `${row.n} ${row.e}`.toLowerCase().includes(debounced));
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
        let list = catalog.items.filter((row) => (explorer ? groupOf(row) === scope && (chip === "all" || row.g === chip) : category === "all" || (category === "unusual" ? Boolean(row.e) : row.g === category)) && passes(row));
        const p = (row) => priceIn(row, source);
        if (sort === "price-desc") list.sort((a, b) => p(b) - p(a));
        else if (sort === "price-asc") list.sort((a, b) => p(a) - p(b));
        else if (sort === "name") list.sort((a, b) => a.n.localeCompare(b.n));
        else if (explorer ? scope === "unusual" : category === "unusual") list = interleaveByItem(list);
        return list;
      }, [catalog, category, chip, scope, explorer, debounced, sort, type, source]);
      useEffect(() => {
        const node = sentinelRef.current;
        if (!node || shown >= rows.length) return void 0;
        const io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) setShown((n) => n + PAGE);
        }, { rootMargin: "600px 0px" });
        io.observe(node);
        return () => io.disconnect();
      }, [rows.length, shown]);
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("section", { className: `roi-shell roi-clean-shell tf2-roi${explorer ? "" : " tf2-roi--category"}` }, /* @__PURE__ */ React.createElement("h1", { className: "collections-head-sr-title" }, explorer ? "TF2 Market Explorer" : title), explorer ? /* @__PURE__ */ React.createElement("section", { className: "roi-filter-frame roi-reveal", style: { "--reveal-delay": "60ms" } }, /* @__PURE__ */ React.createElement("div", { className: "roi-scope-tabs", role: "tablist", "aria-label": "Scope" }, GROUPS.map(({ id, label }) => /* @__PURE__ */ React.createElement("button", { type: "button", key: id, className: `roi-scope-tab${scope === id ? " active" : ""}`, onClick: () => {
        setScope(id);
        setChip("all");
      } }, label))), /* @__PURE__ */ React.createElement("div", { className: "roi-sub-tabs" }, [{ id: "all", label: "All" }, ...CATEGORIES.filter((c) => counts[c.id] && (scope === "unusual" || groupOf({ g: c.id }) === scope))].map((option) => /* @__PURE__ */ React.createElement("button", { type: "button", key: option.id, className: `roi-sub-tab${chip === option.id ? " active" : ""}`, onClick: () => setChip(option.id) }, option.label, counts[option.id] ? /* @__PURE__ */ React.createElement("span", null, count(counts[option.id])) : null))), /* @__PURE__ */ React.createElement("div", { className: "roi-toolbar-clean compact" }, /* @__PURE__ */ React.createElement("label", { className: "roi-search-shell", "aria-label": "Search TF2 items" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" }), /* @__PURE__ */ React.createElement("input", { type: "text", value: query, placeholder: "Search items...", onChange: (event) => setQuery(event.target.value) })), /* @__PURE__ */ React.createElement(RoiMenu, { label: "Type", options: TYPES, value: type, onChange: setType }), /* @__PURE__ */ React.createElement(RoiMenu, { label: "Source", options: SOURCES, value: source, onChange: setSource, shellClass: "roi-select-source" }), /* @__PURE__ */ React.createElement(RoiMenu, { label: "Sort", options: SORTS.map((o) => ({ id: o.value, label: o.label })), value: sort, onChange: setSort }))) : /* @__PURE__ */ React.createElement("div", { className: "collections-controls" }, /* @__PURE__ */ React.createElement("div", { className: "collections-search-wrap" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" }), /* @__PURE__ */ React.createElement("input", { type: "text", placeholder: `Search ${title.toLowerCase()}...`, value: query, onChange: (event) => setQuery(event.target.value) })), /* @__PURE__ */ React.createElement("span", { className: "collections-results-count" }, catalog ? `${count(rows.length)} results` : "Loading…"), /* @__PURE__ */ React.createElement(SortChipPicker, { value: sort, options: SORTS, onChange: setSort, ariaLabel: `Sort ${title}` })), /* @__PURE__ */ React.createElement("section", { className: "roi-section-card roi-reveal", id: "roi-items", style: { "--reveal-delay": "130ms" } }, error ? /* @__PURE__ */ React.createElement("div", { className: "roi-empty-state" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-box-open" }), /* @__PURE__ */ React.createElement("strong", null, error)) : null, !catalog && !error ? /* @__PURE__ */ React.createElement("div", { className: "roi-grid loading" }, Array.from({ length: 10 }).map((_, i) => /* @__PURE__ */ React.createElement("div", { className: "roi-card skeleton", key: i }, /* @__PURE__ */ React.createElement("div", { className: "roi-card-media" }), /* @__PURE__ */ React.createElement("div", { className: "roi-card-lines" }, /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null))))) : null, catalog ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "roi-grid clean-grid" }, rows.slice(0, shown).map((row, index) => /* @__PURE__ */ React.createElement(Tf2Card, { key: `${row.n}|${row.e}`, row, catalog, index: index % PAGE }))), !rows.length ? /* @__PURE__ */ React.createElement("div", { className: "roi-empty-state" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-box-open" }), /* @__PURE__ */ React.createElement("strong", null, "No TF2 items match"), /* @__PURE__ */ React.createElement("span", null, "Try another search.")) : null, /* @__PURE__ */ React.createElement("div", { ref: sentinelRef, className: "tf2-sentinel", "aria-hidden": "true" })) : null)));
    }
    mountPage(/* @__PURE__ */ React.createElement(Tf2MarketPage, null));
  })();
})();
