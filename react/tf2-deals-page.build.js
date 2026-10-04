(() => {
  (() => {
    const { useEffect, useMemo, useRef, useState } = React;
    const { Layout, mountPage } = window.CS2React;
    const PAGE_SIZE = 60;
    const MARKETS = [
      { idx: 4, id: "steam", label: "Steam", image: "assets/markets/steam.png", url: (n) => `https://steamcommunity.com/market/listings/440/${encodeURIComponent(n)}` },
      { idx: 5, id: "skinport", label: "Skinport", image: "assets/markets/skinport.png", url: (n) => `https://skinport.com/tf2/market?search=${encodeURIComponent(n)}` },
      // row[10] is the item's mannco.store page slug (/item/<slug>) from the
      // importer; without it the TF2 search ("/?search=" is just the front page).
      { idx: 6, id: "mannco", label: "Mannco", image: "assets/markets/mannco.ico", url: (n, row) => row && row[10] ? `https://mannco.store/item/${encodeURIComponent(row[10])}` : `https://mannco.store/tf2?search=${encodeURIComponent(n)}` },
      { idx: 7, id: "dmarket", label: "DMarket", image: "assets/markets/dmarket.png", url: (n) => `https://dmarket.com/ingame-items/item-list/tf2-skins?title=${encodeURIComponent(n)}` }
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
      { id: "other", label: "Other" }
    ];
    const MAIN = new Set(TYPE_TABS.map((t) => t.id));
    const LABEL = {
      cosmetic: "Cosmetic",
      melee: "Melee Weapon",
      primary: "Primary Weapon",
      secondary: "Secondary Weapon",
      tool: "Tool",
      crate: "Crate",
      package: "Package",
      craft_item: "Craft Item",
      gift: "Gift",
      war_paint: "War Paint",
      taunt: "Taunt",
      strange_part: "Strange Part",
      party_favor: "Party Favor",
      usable_item: "Usable Item",
      supply_crate: "Supply Crate"
    };
    const SORT_OPTIONS = [
      { id: "gap", label: "Best Gap" },
      { id: "cheapest", label: "Cheapest Overall" },
      { id: "listed", label: "Most listed" },
      { id: "name", label: "A to Z" },
      ...MARKETS.map((m) => ({ id: `cheap-${m.id}`, label: `Cheapest ${m.label}` }))
    ];
    const classNames = (...parts) => parts.filter(Boolean).join(" ");
    const fmtPrice = (v) => typeof v === "number" && v > 0 ? new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(v) : "";
    const count = (v) => new Intl.NumberFormat("en-US").format(v || 0);
    const has = (v) => typeof v === "number" && v > 0;
    const prices = (row) => MARKETS.map((m) => row[m.idx]).filter(has);
    const cheapest = (row) => Math.min(...prices(row));
    const cheapestMarket = (row) => {
      const low = cheapest(row);
      return MARKETS.find((m) => has(row[m.idx]) && row[m.idx] === low);
    };
    const gap = (row) => {
      const p = prices(row);
      const hi = Math.max(...p);
      return hi > 0 ? (hi - Math.min(...p)) / hi : 0;
    };
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
    const itemHref = (name, base, category) => tf2ItemHref({ n: name, e: "", g: category, b: typeof base === "number" ? base : -1 }, true);
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
    function loadDeals() {
      return tf2LoadJson("assets/data/tf2/deals.json.gz");
    }
    function MarketHead({ provider }) {
      return /* @__PURE__ */ React.createElement("span", { className: "deals-market-head" }, provider.image ? /* @__PURE__ */ React.createElement("img", { src: provider.image, alt: "", loading: "lazy", decoding: "async" }) : null, provider.label);
    }
    function DealPriceCell({ price, url, isCheapest, market }) {
      const formatted = fmtPrice(price);
      if (formatted && url) {
        return /* @__PURE__ */ React.createElement(
          "a",
          {
            className: classNames("deals-price-link", isCheapest && "cheaper"),
            "data-market": market,
            href: url,
            target: "_blank",
            rel: "noopener noreferrer",
            onClick: (e) => e.stopPropagation()
          },
          formatted
        );
      }
      return /* @__PURE__ */ React.createElement("span", { className: classNames("deals-price", !formatted && "na"), "data-market": market }, formatted || "—");
    }
    function DdSelect({ label, value, options, onChange }) {
      const [open, setOpen] = useState(false);
      const ref = useRef(null);
      const current = options.find((o) => o.id === value) || options[0];
      useEffect(() => {
        const h = (e) => {
          if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
      }, []);
      return /* @__PURE__ */ React.createElement("div", { className: classNames("deals-dd-wrap", open && "is-open"), ref }, /* @__PURE__ */ React.createElement("span", null, label), /* @__PURE__ */ React.createElement("button", { type: "button", className: classNames("deals-dd-trigger", open && "open"), onClick: () => setOpen((v) => !v) }, /* @__PURE__ */ React.createElement("span", null, current.label), /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-down" })), /* @__PURE__ */ React.createElement("div", { className: classNames("deals-dd-menu", open && "open") }, options.map((opt) => /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          key: opt.id,
          className: classNames("deals-dd-option", value === opt.id && "active"),
          onClick: () => {
            onChange(opt.id);
            setOpen(false);
          }
        },
        opt.label
      ))));
    }
    function SkeletonRows({ n = 8 }) {
      return Array.from({ length: n }, (_, i) => /* @__PURE__ */ React.createElement("div", { className: "deals-skeleton-row", key: i }, /* @__PURE__ */ React.createElement("div", { className: "deals-skel img" }), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gap: "8px", paddingRight: "16px" } }, /* @__PURE__ */ React.createElement("div", { className: "deals-skel", style: { width: "60%" } }), /* @__PURE__ */ React.createElement("div", { className: "deals-skel", style: { width: "40%" } })), MARKETS.map((p) => /* @__PURE__ */ React.createElement("div", { key: p.id, className: "deals-skel", style: { width: "70%", justifySelf: "end" } }))));
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
        loadDeals().then((json) => {
          if (alive) setData(json);
        }).catch((err) => {
          if (alive) setError(err.message || "Could not load TF2 deals.");
        });
        return () => {
          alive = false;
        };
      }, []);
      useEffect(() => {
        const t = window.setTimeout(() => setDebounced(query.trim().toLowerCase()), 180);
        return () => window.clearTimeout(t);
      }, [query]);
      const rows = useMemo(() => {
        if (!data) return [];
        const list = data.items.filter((row) => (typeFilter === "all" || (typeFilter === "other" ? !MAIN.has(row[1]) : row[1] === typeFilter)) && (!debounced || String(row[0]).toLowerCase().includes(debounced)));
        if (sortBy === "gap") {
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
        if (!node || !hasMoreRows) return void 0;
        const io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) setVisible((n) => n + PAGE_SIZE);
        }, { rootMargin: "700px 0px" });
        io.observe(node);
        return () => io.disconnect();
      }, [hasMoreRows, rows.length, visible]);
      const isLoading = !data && !error;
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: "deals-shell tf2-deals" }, /* @__PURE__ */ React.createElement("div", { className: "deals-filter-frame" }, !isPhone ? /* @__PURE__ */ React.createElement("div", { className: "deals-type-tabs" }, TYPE_TABS.map((t) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: t.id,
          type: "button",
          className: classNames("deals-type-tab", typeFilter === t.id && "active"),
          onClick: () => {
            setTypeFilter(t.id);
            setVisible(PAGE_SIZE);
          }
        },
        t.label
      ))) : null, /* @__PURE__ */ React.createElement("div", { className: "deals-controls-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "deals-filter-right" }, /* @__PURE__ */ React.createElement("div", { className: "deals-search-wrap" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" }), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          placeholder: "Search items…",
          value: query,
          onChange: (e) => {
            setQuery(e.target.value);
            setVisible(PAGE_SIZE);
          },
          autoComplete: "off",
          spellCheck: false
        }
      ), query && /* @__PURE__ */ React.createElement("button", { type: "button", className: "deals-search-clear", onClick: () => setQuery("") }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark" }))), isPhone ? /* @__PURE__ */ React.createElement(DdSelect, { label: "Category", value: typeFilter, options: TYPE_TABS, onChange: (v) => {
        setTypeFilter(v);
        setVisible(PAGE_SIZE);
      } }) : null, /* @__PURE__ */ React.createElement(DdSelect, { label: "Sort by", value: sortBy, options: SORT_OPTIONS, onChange: (v) => {
        setSortBy(v);
        setVisible(PAGE_SIZE);
      } })))), /* @__PURE__ */ React.createElement("div", { className: "deals-meta" }, /* @__PURE__ */ React.createElement("span", { className: "deals-meta-left", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "deals-meta-right" }, /* @__PURE__ */ React.createElement("span", null, data ? `${count(rows.length)} items · 2+ markets · updated ${new Date(data.generated_at).toLocaleDateString()}` : "Loading TF2 deals…"))), error ? /* @__PURE__ */ React.createElement("div", { className: "deals-status err" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-triangle-exclamation" }), " ", error) : null, /* @__PURE__ */ React.createElement("div", { className: "deals-card" }, /* @__PURE__ */ React.createElement("div", { className: "deals-table-scroll" }, /* @__PURE__ */ React.createElement("div", { className: "deals-thead" }, /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null, "Item"), MARKETS.map((provider) => /* @__PURE__ */ React.createElement("span", { key: provider.id }, /* @__PURE__ */ React.createElement(MarketHead, { provider })))), isLoading ? /* @__PURE__ */ React.createElement(SkeletonRows, { n: 10 }) : visibleRows.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "deals-empty" }, /* @__PURE__ */ React.createElement("div", { className: "deals-empty-icon" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-tags" })), /* @__PURE__ */ React.createElement("strong", null, "No deals found"), /* @__PURE__ */ React.createElement("span", null, "No TF2 items with a price on two or more markets matched your filters. Try another category or search.")) : visibleRows.map((row, index) => {
        const [name, category, quality, image] = row;
        const img = image ? image[0] === "!" ? image.slice(1).replace(/^http:/, "https:") : `${data.icon_base}${image}/96fx96f` : "";
        const low = cheapest(row);
        const best = cheapestMarket(row);
        const href = itemHref(name, row[9], row[1]);
        const go = () => {
          window.location.href = href;
        };
        return /* @__PURE__ */ React.createElement(
          "div",
          {
            key: name,
            className: "deals-row is-clickable",
            style: { "--row-index": index },
            role: "link",
            tabIndex: 0,
            onClick: go,
            onKeyDown: (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                go();
              }
            }
          },
          /* @__PURE__ */ React.createElement("div", { className: "deals-row-img" }, img ? /* @__PURE__ */ React.createElement("img", { src: img, alt: name, loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" }) : /* @__PURE__ */ React.createElement("span", { className: "deals-row-placeholder" }, name.slice(0, 2).toUpperCase())),
          /* @__PURE__ */ React.createElement("div", { className: "deals-row-info" }, /* @__PURE__ */ React.createElement("div", { className: "deals-item-name", style: quality ? { color: `color-mix(in srgb, #${quality} 55%, currentColor)` } : void 0 }, name), /* @__PURE__ */ React.createElement("div", { className: "deals-item-sub" }, [LABEL[category] || "", row[8] ? `${count(row[8])} listed on Steam` : "", `save ${Math.round(gap(row) * 100)}%${best ? ` on ${best.label}` : ""}`].filter(Boolean).join(" · "))),
          MARKETS.map((m) => /* @__PURE__ */ React.createElement(
            DealPriceCell,
            {
              key: m.id,
              market: m.label,
              price: row[m.idx],
              url: has(row[m.idx]) ? m.url(name, row) : "",
              isCheapest: has(row[m.idx]) && row[m.idx] === low
            }
          ))
        );
      }))), hasMoreRows ? /* @__PURE__ */ React.createElement("div", { ref: loadMoreRef, className: "deals-load-more deals-load-more-sentinel", "aria-hidden": "true" }) : null));
    }
    mountPage(/* @__PURE__ */ React.createElement(Tf2DealsPage, null));
  })();
})();
