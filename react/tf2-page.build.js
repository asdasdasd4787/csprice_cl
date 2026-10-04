(() => {
  (() => {
    const { useEffect, useMemo, useRef, useState } = React;
    const { Layout, mountPage } = window.CS2React;
    const CATALOG_URL = "tf2_catalog.php";
    const PAGE = 60;
    const CATEGORIES = [
      { id: "all", label: "All" },
      { id: "unusual", label: "Unusuals" },
      { id: "cosmetics", label: "Cosmetics" },
      { id: "weapons", label: "Weapons" },
      { id: "warpaints", label: "War Paints" },
      { id: "taunts", label: "Taunts" },
      { id: "tools", label: "Tools" },
      { id: "keys", label: "Keys" },
      { id: "cases", label: "Cases" },
      { id: "other", label: "Other" }
    ];
    const SORTS = [
      { id: "listed", label: "Most listed" },
      { id: "price-desc", label: "Price: high to low" },
      { id: "price-asc", label: "Price: low to high" },
      { id: "name", label: "Name A–Z" }
    ];
    const euro = (value) => typeof value === "number" && value > 0 ? new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: value < 1 ? 2 : 2 }).format(value) : "—";
    const count = (value) => new Intl.NumberFormat("en-US").format(value || 0);
    function bestPrice(row) {
      const prices = [row.s, row.m].filter((p) => typeof p === "number" && p > 0);
      return prices.length ? Math.min(...prices) : 0;
    }
    function imageFor(row, catalog) {
      if (row.i) return `${catalog.icon_base}${row.i}/128fx128f`;
      const base = row.b >= 0 ? catalog.bases[row.b] : null;
      if (base && base[1]) return String(base[1]).replace(/^http:/, "https:");
      return "";
    }
    function steamUrl(row) {
      return `https://steamcommunity.com/market/listings/440/${encodeURIComponent(row.n)}`;
    }
    function manncoUrl(row) {
      const q = row.e ? `${row.n} ${row.e.replace(/^★\s*/, "")}` : row.n;
      return `https://mannco.store/?search=${encodeURIComponent(q)}`;
    }
    function Tf2Card({ row, catalog }) {
      const img = imageFor(row, catalog);
      const color = row.q ? `#${row.q}` : void 0;
      return /* @__PURE__ */ React.createElement("article", { className: "tf2-card", style: color ? { "--tf2-quality": color } : void 0 }, /* @__PURE__ */ React.createElement("a", { className: "tf2-card-media", href: row.l ? steamUrl(row) : manncoUrl(row), target: "_blank", rel: "noopener noreferrer" }, img ? /* @__PURE__ */ React.createElement("img", { src: img, alt: "", loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" }) : /* @__PURE__ */ React.createElement("span", { className: "tf2-card-noimg", "aria-hidden": "true" }, "TF2")), /* @__PURE__ */ React.createElement("div", { className: "tf2-card-body" }, /* @__PURE__ */ React.createElement("h3", { className: "tf2-card-name", title: row.n }, row.n), row.e ? /* @__PURE__ */ React.createElement("p", { className: "tf2-card-effect" }, row.e.replace(/^★\s*/, "★ ")) : null, /* @__PURE__ */ React.createElement("dl", { className: "tf2-card-prices" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Steam"), /* @__PURE__ */ React.createElement("dd", null, typeof row.s === "number" ? euro(row.s) : "—", row.l ? /* @__PURE__ */ React.createElement("span", { className: "tf2-card-listings" }, count(row.l), " listed") : null)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "Mannco"), /* @__PURE__ */ React.createElement("dd", null, typeof row.m === "number" ? euro(row.m) : "—"))), /* @__PURE__ */ React.createElement("div", { className: "tf2-card-links" }, /* @__PURE__ */ React.createElement("a", { href: steamUrl(row), target: "_blank", rel: "noopener noreferrer" }, "Steam"), /* @__PURE__ */ React.createElement("a", { href: manncoUrl(row), target: "_blank", rel: "noopener noreferrer" }, "Mannco"))));
    }
    function Tf2Page() {
      const [catalog, setCatalog] = useState(null);
      const [error, setError] = useState("");
      const [query, setQuery] = useState("");
      const [debounced, setDebounced] = useState("");
      const [category, setCategory] = useState("all");
      const [inStock, setInStock] = useState(true);
      const [sort, setSort] = useState("listed");
      const [shown, setShown] = useState(PAGE);
      const sentinelRef = useRef(null);
      useEffect(() => {
        let alive = true;
        fetch(CATALOG_URL, { credentials: "same-origin" }).then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))).then((data) => {
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
      }, [debounced, category, inStock, sort]);
      const priced = (row) => typeof row.m === "number" && row.m > 0 || typeof row.s === "number" && row.s > 0;
      const counts = useMemo(() => {
        const out = { all: 0 };
        if (!catalog) return out;
        for (const row of catalog.items) {
          if (inStock && !priced(row)) continue;
          if (debounced && !`${row.n} ${row.e}`.toLowerCase().includes(debounced)) continue;
          out.all += 1;
          out[row.c] = (out[row.c] || 0) + 1;
        }
        return out;
      }, [catalog, debounced, inStock]);
      const rows = useMemo(() => {
        if (!catalog) return [];
        const list = catalog.items.filter((row) => (category === "all" || row.c === category) && (!inStock || priced(row)) && (!debounced || `${row.n} ${row.e}`.toLowerCase().includes(debounced)));
        if (sort === "price-desc") list.sort((a, b) => bestPrice(b) - bestPrice(a));
        else if (sort === "price-asc") list.sort((a, b) => (bestPrice(a) || Infinity) - (bestPrice(b) || Infinity));
        else if (sort === "name") list.sort((a, b) => a.n.localeCompare(b.n));
        return list;
      }, [catalog, category, inStock, debounced, sort]);
      useEffect(() => {
        const node = sentinelRef.current;
        if (!node || shown >= rows.length) return void 0;
        const io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) setShown((n) => n + PAGE);
        }, { rootMargin: "600px 0px" });
        io.observe(node);
        return () => io.disconnect();
      }, [rows.length, shown]);
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: "tf2-shell" }, /* @__PURE__ */ React.createElement("header", { className: "tf2-head" }, /* @__PURE__ */ React.createElement("h1", { className: "tf2-title" }, "TF2 Market"), /* @__PURE__ */ React.createElement("p", { className: "tf2-sub" }, catalog ? `${count(catalog.count)} Team Fortress 2 items · ${count(catalog.items.filter((r) => typeof r.m === "number").length)} in stock on Mannco · Steam prices for ${count(catalog.steam_items)} items so far` : "Loading the TF2 catalog…")), /* @__PURE__ */ React.createElement("div", { className: "tf2-controls" }, /* @__PURE__ */ React.createElement("label", { className: "tf2-search" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "tf2-sr" }, "Search TF2 items"), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "search",
          value: query,
          placeholder: "Search TF2 items, e.g. Burning Flames Team Captain",
          onChange: (event) => setQuery(event.target.value)
        }
      )), /* @__PURE__ */ React.createElement("label", { className: "tf2-toggle" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: inStock, onChange: (event) => setInStock(event.target.checked) }), /* @__PURE__ */ React.createElement("span", null, "Priced only")), /* @__PURE__ */ React.createElement("label", { className: "tf2-sort" }, /* @__PURE__ */ React.createElement("span", { className: "tf2-sr" }, "Sort"), /* @__PURE__ */ React.createElement("select", { value: sort, onChange: (event) => setSort(event.target.value) }, SORTS.map((s) => /* @__PURE__ */ React.createElement("option", { key: s.id, value: s.id }, s.label))))), /* @__PURE__ */ React.createElement("div", { className: "tf2-chips", role: "group", "aria-label": "Category" }, CATEGORIES.map((c) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: c.id,
          type: "button",
          className: "tf2-chip" + (category === c.id ? " is-active" : ""),
          "aria-pressed": category === c.id,
          onClick: () => setCategory(c.id)
        },
        c.label,
        /* @__PURE__ */ React.createElement("span", { className: "tf2-chip-count" }, count(counts[c.id] || 0))
      ))), error ? /* @__PURE__ */ React.createElement("p", { className: "tf2-empty" }, error) : null, !catalog && !error ? /* @__PURE__ */ React.createElement("div", { className: "tf2-grid" }, Array.from({ length: 12 }).map((_, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "tf2-card is-skeleton" }))) : null, catalog ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("p", { className: "tf2-results" }, count(rows.length), " items"), /* @__PURE__ */ React.createElement("div", { className: "tf2-grid" }, rows.slice(0, shown).map((row) => /* @__PURE__ */ React.createElement(Tf2Card, { key: `${row.n}|${row.e}`, row, catalog }))), !rows.length ? /* @__PURE__ */ React.createElement("p", { className: "tf2-empty" }, "No TF2 items match.") : null, /* @__PURE__ */ React.createElement("div", { ref: sentinelRef, className: "tf2-sentinel", "aria-hidden": "true" })) : null));
    }
    mountPage(/* @__PURE__ */ React.createElement(Tf2Page, null));
  })();
})();
