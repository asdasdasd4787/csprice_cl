(() => {
  (() => {
    const { useEffect, useMemo, useState } = React;
    const { Layout, mountPage, classNames } = window.CS2React;
    const PROVIDER_ACCENTS = {
      steam: "rgba(82, 163, 255, 0.9)",
      skinport: "rgba(79, 219, 177, 0.9)",
      csfloat: "rgba(168, 118, 255, 0.9)"
    };
    function formatEuro(value) {
      const amount = Number(value);
      if (!Number.isFinite(amount)) return "—";
      return `€${amount.toFixed(2)}`;
    }
    function formatPercent(value, digits = 2) {
      const amount = Number(value);
      if (!Number.isFinite(amount)) return "—";
      return `${amount.toFixed(digits)}%`;
    }
    function formatAgo(value) {
      if (!value) return "Live now";
      const timestamp = new Date(value).getTime();
      if (!Number.isFinite(timestamp)) return "Live now";
      const diffSeconds = Math.max(1, Math.round((Date.now() - timestamp) / 1e3));
      if (diffSeconds < 60) return `${diffSeconds}s ago`;
      const diffMinutes = Math.round(diffSeconds / 60);
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      const diffHours = Math.round(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${Math.round(diffHours / 24)}d ago`;
    }
    function metricFor(tile, providerId) {
      return tile?.metrics?.[providerId] || null;
    }
    function computePerHour(metric, starsPerHour, starsPerOpen, metricKey) {
      if (!metric) return null;
      if (metricKey === "hourly_direct_profit") {
        const amount = Number(metric.after_fees_price);
        if (!Number.isFinite(amount) || !starsPerOpen) return null;
        return (amount - starsPerOpen * 0.35) * (starsPerHour / starsPerOpen);
      }
      const averageProfit = Number(metric.average_profit);
      if (!Number.isFinite(averageProfit) || !starsPerOpen) return null;
      return averageProfit * (starsPerHour / starsPerOpen);
    }
    function riskCardValue(card, providerId, starsPerHour) {
      const metric = metricFor(card.item, providerId);
      return computePerHour(metric, starsPerHour, Number(card.item?.stars || 0), card.metric_key);
    }
    function ArmoryPage() {
      const [payload, setPayload] = useState(null);
      const [error, setError] = useState("");
      const [loading, setLoading] = useState(true);
      const [providerId, setProviderId] = useState("steam");
      const [starsPerHour, setStarsPerHour] = useState(12);
      useEffect(() => {
        let active = true;
        fetch("get_armory_data.php", {
          headers: { Accept: "application/json" },
          credentials: "same-origin"
        }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load armory data."))).then((data) => {
          if (!active) return;
          setPayload(data);
          setLoading(false);
        }).catch((loadError) => {
          if (!active) return;
          setError(loadError.message || "Unable to load armory data.");
          setLoading(false);
        });
        return () => {
          active = false;
        };
      }, []);
      const providers = payload?.providers || [];
      const activeProvider = providers.find((provider) => provider.id === providerId) || providers[0] || { id: "steam", label: "Steam Market" };
      const tiles = payload?.armory?.tiles || [];
      const riskCards = payload?.armory?.risk_cards || [];
      const boardSummary = useMemo(() => {
        const values = tiles.map((tile) => metricFor(tile, activeProvider.id)).filter(Boolean);
        const positiveProfitCount = values.filter((metric) => Number(metric.profit_pct) > 0).length;
        const avgRoi = values.length ? values.reduce((sum, metric) => sum + (Number(metric.roi_pct) || 0), 0) / values.length : 0;
        const avgProfit = values.length ? values.reduce((sum, metric) => sum + (Number(metric.profit_pct) || 0), 0) / values.length : 0;
        const boardValue = values.reduce((sum, metric) => sum + (Number(metric.market_price) || 0), 0);
        return {
          positiveProfitCount,
          avgRoi,
          avgProfit,
          boardValue
        };
      }, [tiles, activeProvider.id]);
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("main", { className: "armory-page" }, /* @__PURE__ */ React.createElement("div", { className: "armory-shell" }, /* @__PURE__ */ React.createElement("section", { className: "armory-hero armory-panel" }, /* @__PURE__ */ React.createElement("div", { className: "armory-hero-copy" }, /* @__PURE__ */ React.createElement("span", { className: "armory-eyebrow" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-wand-magic-sparkles" }), " Armory Revenue"), /* @__PURE__ */ React.createElement("h1", { className: "armory-title" }, "Best armory routes, priced live from your tracked data."), /* @__PURE__ */ React.createElement("p", { className: "armory-description" }, "This board mirrors the current CS2 armory lineup, then recalculates the value, ROI and hourly edge from your own tracked pricing source instead of a static screenshot."), /* @__PURE__ */ React.createElement("div", { className: "armory-controls" }, /* @__PURE__ */ React.createElement("div", { className: "armory-provider-toggle" }, providers.map((provider) => /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          key: provider.id,
          className: classNames("armory-pill", providerId === provider.id && "active"),
          onClick: () => setProviderId(provider.id),
          style: providerId === provider.id ? { "--accent": PROVIDER_ACCENTS[provider.id] || "rgba(82, 163, 255, 0.9)" } : void 0
        },
        provider.label
      ))), /* @__PURE__ */ React.createElement("label", { className: "armory-select-wrap" }, /* @__PURE__ */ React.createElement("span", null, "★ / hr"), /* @__PURE__ */ React.createElement("select", { value: starsPerHour, onChange: (event) => setStarsPerHour(Number(event.target.value) || 12) }, (payload?.stars_per_hour_options || []).map((option) => /* @__PURE__ */ React.createElement("option", { key: option.value, value: option.value }, option.label)))))), /* @__PURE__ */ React.createElement("div", { className: "armory-hero-stats" }, /* @__PURE__ */ React.createElement("div", { className: "armory-stat-card" }, /* @__PURE__ */ React.createElement("span", null, "Tracked routes"), /* @__PURE__ */ React.createElement("strong", null, tiles.length), /* @__PURE__ */ React.createElement("small", null, "Full live armory board")), /* @__PURE__ */ React.createElement("div", { className: "armory-stat-card" }, /* @__PURE__ */ React.createElement("span", null, "Board value"), /* @__PURE__ */ React.createElement("strong", null, formatEuro(boardSummary.boardValue)), /* @__PURE__ */ React.createElement("small", null, activeProvider.label, " total")), /* @__PURE__ */ React.createElement("div", { className: "armory-stat-card" }, /* @__PURE__ */ React.createElement("span", null, "Average ROI"), /* @__PURE__ */ React.createElement("strong", null, formatPercent(boardSummary.avgRoi)), /* @__PURE__ */ React.createElement("small", null, "Across all current options")), /* @__PURE__ */ React.createElement("div", { className: "armory-stat-card" }, /* @__PURE__ */ React.createElement("span", null, "Positive profit"), /* @__PURE__ */ React.createElement("strong", null, boardSummary.positiveProfitCount), /* @__PURE__ */ React.createElement("small", null, formatPercent(boardSummary.avgProfit), " average edge")))), /* @__PURE__ */ React.createElement("section", { className: "armory-risk-row" }, riskCards.map((card) => {
        const amount = riskCardValue(card, activeProvider.id, starsPerHour);
        return /* @__PURE__ */ React.createElement("article", { key: card.id, className: "armory-risk-card armory-panel" }, /* @__PURE__ */ React.createElement("div", { className: "armory-risk-copy" }, /* @__PURE__ */ React.createElement("span", null, card.label), /* @__PURE__ */ React.createElement("strong", null, formatEuro(amount), " per hour"), /* @__PURE__ */ React.createElement("small", null, card.description)), /* @__PURE__ */ React.createElement("img", { src: card.item?.image, alt: card.item?.name || card.label, loading: "lazy", decoding: "async" }));
      })), /* @__PURE__ */ React.createElement("section", { className: "armory-board armory-panel" }, /* @__PURE__ */ React.createElement("div", { className: "armory-board-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "armory-eyebrow" }, "Armory board"), /* @__PURE__ */ React.createElement("h2", null, "Live armory board")), /* @__PURE__ */ React.createElement("div", { className: "armory-board-meta" }, /* @__PURE__ */ React.createElement("span", null, activeProvider.label), /* @__PURE__ */ React.createElement("strong", null, formatAgo(payload?.source_updated_at)))), loading && /* @__PURE__ */ React.createElement("div", { className: "armory-status" }, "Loading armory board…"), error && !loading && /* @__PURE__ */ React.createElement("div", { className: "armory-status error" }, error), !loading && !error && /* @__PURE__ */ React.createElement("div", { className: "armory-board-grid" }, tiles.map((tile) => {
        const metric = metricFor(tile, activeProvider.id);
        const rank = tile?.rankings?.[activeProvider.id]?.profit_rank || null;
        const avgValue = Number(metric?.average_return);
        const profitPct = Number(metric?.profit_pct);
        const roiPct = Number(metric?.roi_pct);
        const cardClass = `span-${tile.layout_span || "md"}`;
        return /* @__PURE__ */ React.createElement(
          "a",
          {
            key: tile.id,
            className: classNames("armory-tile", "armory-tile-link", cardClass),
            href: tile.href && tile.href !== "#" ? tile.href : tile.steam_url || "#",
            target: tile.href && tile.href !== "#" ? void 0 : "_blank",
            rel: tile.href && tile.href !== "#" ? void 0 : "noreferrer"
          },
          /* @__PURE__ */ React.createElement("div", { className: "armory-tile-top" }, /* @__PURE__ */ React.createElement("span", { className: "armory-stars" }, tile.star_label || "Direct"), rank ? /* @__PURE__ */ React.createElement("span", { className: "armory-rank" }, "#", rank) : null),
          /* @__PURE__ */ React.createElement("div", { className: "armory-tile-body" }, /* @__PURE__ */ React.createElement("div", { className: "armory-tile-copy" }, /* @__PURE__ */ React.createElement("h3", null, tile.title || tile.name), /* @__PURE__ */ React.createElement("div", { className: "armory-metric-pair" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", null, "Star ROI"), /* @__PURE__ */ React.createElement("strong", null, formatPercent(roiPct))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", null, "Profit"), /* @__PURE__ */ React.createElement("strong", null, formatPercent(profitPct)))), /* @__PURE__ */ React.createElement("div", { className: "armory-route" }, formatEuro(tile.star_cost), " → ", formatEuro(avgValue), " AVG"), /* @__PURE__ */ React.createElement("div", { className: "armory-submeta" }, /* @__PURE__ */ React.createElement("span", null, tile.age_tag || "NEW"), tile.timer_label ? /* @__PURE__ */ React.createElement("span", null, tile.timer_label) : /* @__PURE__ */ React.createElement("span", null, activeProvider.label))), /* @__PURE__ */ React.createElement(
            "div",
            {
              className: classNames("armory-tile-visual", tile.image_kind === "logo" && "logo"),
              style: tile.image_offset ? { "--image-offset": tile.image_offset } : void 0
            },
            /* @__PURE__ */ React.createElement("img", { src: tile.logo_image || tile.image, alt: tile.name, loading: "lazy", decoding: "async" })
          )),
          /* @__PURE__ */ React.createElement("div", { className: "armory-accent-bar" }, /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null))
        );
      }))))));
    }
    mountPage(/* @__PURE__ */ React.createElement(ArmoryPage, null));
  })();
})();
