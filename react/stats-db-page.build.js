(() => {
  (() => {
    const { useEffect, useState } = React;
    const { Layout, mountPage } = window.CS2React;
    function formatNumber(value) {
      return new Intl.NumberFormat("en-US").format(Number(value || 0));
    }
    function StatsDbPage() {
      const [stats, setStats] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState("");
      useEffect(() => {
        let alive = true;
        fetch("get_item_stats.php", { headers: { Accept: "application/json" } }).then((response) => {
          if (!response.ok) throw new Error(`Stats request failed (${response.status})`);
          return response.json();
        }).then((payload) => {
          if (!alive) return;
          if (!payload?.success) throw new Error(payload?.error || "Stats unavailable.");
          setStats(payload);
          setLoading(false);
        }).catch((requestError) => {
          if (!alive) return;
          setError(requestError?.message || "Stats unavailable.");
          setLoading(false);
        });
        return () => {
          alive = false;
        };
      }, []);
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: "collections-shell stats-db-shell" }, /* @__PURE__ */ React.createElement("header", { className: "collections-head collections-head-animated" }, /* @__PURE__ */ React.createElement("div", { className: "collections-kicker" }, "Item Database"), /* @__PURE__ */ React.createElement("h1", null, "CS2 Item Universe"), /* @__PURE__ */ React.createElement("p", { className: "collections-hero-copy" }, "How many skins, cases, stickers, and other items exist in our tracked catalog — inspired by community databases like CSFloat DB.")), loading ? /* @__PURE__ */ React.createElement("p", { className: "results-meta" }, "Loading catalog statistics...") : null, error ? /* @__PURE__ */ React.createElement("p", { className: "no-results" }, error) : null, stats ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "stats-db-summary" }, /* @__PURE__ */ React.createElement("div", { className: "stats-db-card" }, /* @__PURE__ */ React.createElement("span", null, "Total Listings"), /* @__PURE__ */ React.createElement("strong", null, formatNumber(stats.total_listings))), /* @__PURE__ */ React.createElement("div", { className: "stats-db-card" }, /* @__PURE__ */ React.createElement("span", null, "Unique Base Items"), /* @__PURE__ */ React.createElement("strong", null, formatNumber(stats.total_unique_items))), /* @__PURE__ */ React.createElement("div", { className: "stats-db-card" }, /* @__PURE__ */ React.createElement("span", null, "Categories"), /* @__PURE__ */ React.createElement("strong", null, formatNumber(stats.categories?.length || 0)))), /* @__PURE__ */ React.createElement("div", { className: "collections-grid stats-db-grid" }, (stats.categories || []).map((row, index) => /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "card stats-db-category-card landing-card-visible",
          key: row.category,
          style: { "--card-stagger": `${Math.min(index, 12) * 40}ms` }
        },
        /* @__PURE__ */ React.createElement("div", { className: "card-body" }, /* @__PURE__ */ React.createElement("div", { className: "card-top-labels" }, /* @__PURE__ */ React.createElement("span", { className: "card-label left" }, row.label), /* @__PURE__ */ React.createElement("span", { className: "card-label right" }, formatNumber(row.unique_items), " unique")), /* @__PURE__ */ React.createElement("h3", null, formatNumber(row.listings)), /* @__PURE__ */ React.createElement("p", { className: "card-subtitle" }, "Tracked market listings in ", row.label.toLowerCase()))
      )))) : null));
    }
    mountPage(/* @__PURE__ */ React.createElement(StatsDbPage, null));
  })();
})();
