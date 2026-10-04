(() => {
  (() => {
    const { useState, useCallback } = React;
    const REVEAL_COUNT = 10;
    function sharedSim() {
      return window.CS2CaseSimulator || {};
    }
    function formatEuro(value) {
      const shared = sharedSim();
      if (typeof shared.formatEuro === "function") return shared.formatEuro(value);
      return "€" + Number(value || 0).toFixed(2);
    }
    function formatSignedEuro(value) {
      const shared = sharedSim();
      if (typeof shared.formatSignedEuro === "function") return shared.formatSignedEuro(value);
      const num = Number(value || 0);
      return (num >= 0 ? "+" : "-") + formatEuro(Math.abs(num));
    }
    function pickWeightedRarity(rarityKeys, weightByRarity) {
      const weighted = rarityKeys.map((key) => ({ key, weight: weightByRarity[key] || 0 }));
      const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
      if (!total) {
        return rarityKeys[Math.floor(Math.random() * rarityKeys.length)];
      }
      let roll = Math.random() * total;
      for (const entry of weighted) {
        roll -= entry.weight;
        if (roll <= 0) return entry.key;
      }
      return weighted[weighted.length - 1].key;
    }
    function rollCandidates(items, count) {
      const byRarity = {};
      items.forEach((item) => {
        const key = String(item.rarity || "milspec").toLowerCase();
        if (!byRarity[key]) byRarity[key] = [];
        byRarity[key].push(item);
      });
      const rarityKeys = Object.keys(byRarity);
      if (!rarityKeys.length) return [];
      const weights = sharedSim().RARITY_TOTAL_PROB || {};
      const results = [];
      for (let i = 0; i < count; i += 1) {
        const rarity = pickWeightedRarity(rarityKeys, weights);
        const pool = byRarity[rarity] && byRarity[rarity].length ? byRarity[rarity] : items;
        results.push(pool[Math.floor(Math.random() * pool.length)]);
      }
      return results;
    }
    function TerminalSimulator({
      config,
      terminalPrice,
      onClose,
      inline = false,
      openLabel = "Reveal Offers"
    }) {
      const items = Array.isArray(config?.items) ? config.items.filter((entry) => Number(entry.price) > 0) : [];
      const [phase, setPhase] = useState("idle");
      const [candidates, setCandidates] = useState([]);
      const [selected, setSelected] = useState(null);
      const [redeemCount, setRedeemCount] = useState(0);
      const [totalSpent, setTotalSpent] = useState(0);
      const [totalValue, setTotalValue] = useState(0);
      const reveal = useCallback(() => {
        if (!items.length) return;
        const count = Math.min(REVEAL_COUNT, items.length);
        setCandidates(rollCandidates(items, count));
        setSelected(null);
        setPhase("revealed");
      }, [items]);
      const choose = useCallback((item) => {
        const itemPrice = Number(item.price) || 0;
        const cost = Number(terminalPrice || 0) + itemPrice;
        setSelected(item);
        setPhase("result");
        setRedeemCount((c) => c + 1);
        setTotalSpent((s) => s + cost);
        setTotalValue((v) => v + itemPrice);
      }, [terminalPrice]);
      const selectedTotal = selected ? Number(terminalPrice || 0) + (Number(selected.price) || 0) : null;
      const net = totalValue - totalSpent;
      const panel = /* @__PURE__ */ React.createElement("div", { className: inline ? "detail-simulator-panel" : "sim-modal" }, !inline && /* @__PURE__ */ React.createElement("div", { className: "sim-header" }, /* @__PURE__ */ React.createElement("div", { className: "sim-header-left" }, config?.image ? /* @__PURE__ */ React.createElement("img", { src: config.image, alt: config.title || "" }) : null, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, config?.title || "Terminal"), /* @__PURE__ */ React.createElement("div", { className: "sim-subtitle-row" }, /* @__PURE__ */ React.createElement("span", { className: "sim-subtitle" }, "Terminal Simulator")))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "sim-close", onClick: onClose, "aria-label": "Close" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark" }))), phase === "idle" ? /* @__PURE__ */ React.createElement("p", { className: "term-intro" }, "Reveal ", Math.min(REVEAL_COUNT, items.length) || REVEAL_COUNT, " random items available through this terminal right now, then pick the one you'd actually redeem.") : null, phase !== "idle" ? /* @__PURE__ */ React.createElement("div", { className: "term-grid" }, candidates.map((item, index) => /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          key: index,
          className: "term-card " + String(item.rarity || "milspec").toLowerCase() + (selected === item ? " is-selected" : ""),
          style: { "--card-delay": index * 30 + "ms" },
          onClick: () => choose(item),
          title: item.title
        },
        /* @__PURE__ */ React.createElement("span", { className: "term-card-media" }, item.img ? /* @__PURE__ */ React.createElement("img", { src: item.img, alt: "" }) : /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-gun" })),
        /* @__PURE__ */ React.createElement("span", { className: "term-card-name" }, item.title),
        /* @__PURE__ */ React.createElement("span", { className: "term-card-price" }, item.priceDisplay || formatEuro(item.price))
      ))) : null, phase === "result" && selected ? /* @__PURE__ */ React.createElement("div", { className: "sim-result " + String(selected.rarity || "milspec").toLowerCase() }, selected.img ? /* @__PURE__ */ React.createElement("img", { className: "sim-result-img", src: selected.img, alt: "" }) : null, /* @__PURE__ */ React.createElement("div", { className: "sim-result-info" }, /* @__PURE__ */ React.createElement("h3", null, selected.title), /* @__PURE__ */ React.createElement("div", { className: "term-cost-breakdown" }, /* @__PURE__ */ React.createElement("span", null, "Terminal ", formatEuro(terminalPrice)), /* @__PURE__ */ React.createElement("span", null, "+ Item ", formatEuro(selected.price)), /* @__PURE__ */ React.createElement("strong", null, "= ", formatEuro(selectedTotal))))) : null, /* @__PURE__ */ React.createElement("div", { className: "sim-actions" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "sim-btn primary", onClick: reveal, disabled: !items.length }, phase === "idle" ? openLabel : "Reveal Again")), redeemCount > 0 && /* @__PURE__ */ React.createElement("div", { className: "sim-stats" }, /* @__PURE__ */ React.createElement("span", { className: "sim-stat-pill" }, "Redeemed: ", /* @__PURE__ */ React.createElement("span", { className: "hi" }, redeemCount, "×")), /* @__PURE__ */ React.createElement("span", { className: "sim-stat-pill" }, "Total spent: ", /* @__PURE__ */ React.createElement("span", { className: "hi" }, formatEuro(totalSpent))), /* @__PURE__ */ React.createElement("span", { className: "sim-stat-pill" }, "Net vs. market value:", " ", /* @__PURE__ */ React.createElement("span", { className: "hi " + (net >= 0 ? "profit" : "loss") }, formatSignedEuro(net)))));
      if (inline) return panel;
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "sim-overlay",
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && typeof onClose === "function") onClose();
          }
        },
        panel
      );
    }
    window.CS2TerminalSimulator = { TerminalSimulator };
  })();
})();
