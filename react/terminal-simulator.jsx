/**
 * Terminal Simulator — unlike a case, an Armory terminal isn't a single
 * random roll: it reveals a batch of random candidate items and lets you
 * pick which one to actually redeem (paying terminal price + that item's
 * own price). No spin animation, no sound — just a reveal grid + a pick.
 */
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
    openLabel = "Reveal Offers",
  }) {
    const items = Array.isArray(config?.items)
      ? config.items.filter((entry) => Number(entry.price) > 0)
      : [];

    const [phase, setPhase] = useState("idle"); // idle | revealed | result
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

    const selectedTotal = selected
      ? Number(terminalPrice || 0) + (Number(selected.price) || 0)
      : null;
    const net = totalValue - totalSpent;

    const panel = (
      <div className={inline ? "detail-simulator-panel" : "sim-modal"}>
        {!inline && (
          <div className="sim-header">
            <div className="sim-header-left">
              {config?.image ? <img src={config.image} alt={config.title || ""} /> : null}
              <div>
                <h2>{config?.title || "Terminal"}</h2>
                <div className="sim-subtitle-row">
                  <span className="sim-subtitle">Terminal Simulator</span>
                </div>
              </div>
            </div>
            <button type="button" className="sim-close" onClick={onClose} aria-label="Close">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        )}

        {phase === "idle" ? (
          <p className="term-intro">
            Reveal {Math.min(REVEAL_COUNT, items.length) || REVEAL_COUNT} random items available through
            this terminal right now, then pick the one you'd actually redeem.
          </p>
        ) : null}

        {phase !== "idle" ? (
          <div className="term-grid">
            {candidates.map((item, index) => (
              <button
                type="button"
                key={index}
                className={"term-card " + String(item.rarity || "milspec").toLowerCase()
                  + (selected === item ? " is-selected" : "")}
                style={{ "--card-delay": (index * 30) + "ms" }}
                onClick={() => choose(item)}
                title={item.title}
              >
                <span className="term-card-media">
                  {item.img ? <img src={item.img} alt="" /> : <i className="fa-solid fa-gun" />}
                </span>
                <span className="term-card-name">{item.title}</span>
                <span className="term-card-price">{item.priceDisplay || formatEuro(item.price)}</span>
              </button>
            ))}
          </div>
        ) : null}

        {phase === "result" && selected ? (
          <div className={"sim-result " + String(selected.rarity || "milspec").toLowerCase()}>
            {selected.img ? <img className="sim-result-img" src={selected.img} alt="" /> : null}
            <div className="sim-result-info">
              <h3>{selected.title}</h3>
              <div className="term-cost-breakdown">
                <span>Terminal {formatEuro(terminalPrice)}</span>
                <span>+ Item {formatEuro(selected.price)}</span>
                <strong>= {formatEuro(selectedTotal)}</strong>
              </div>
            </div>
          </div>
        ) : null}

        <div className="sim-actions">
          <button type="button" className="sim-btn primary" onClick={reveal} disabled={!items.length}>
            {phase === "idle" ? openLabel : "Reveal Again"}
          </button>
        </div>

        {redeemCount > 0 && (
          <div className="sim-stats">
            <span className="sim-stat-pill">
              Redeemed: <span className="hi">{redeemCount}&times;</span>
            </span>
            <span className="sim-stat-pill">
              Total spent: <span className="hi">{formatEuro(totalSpent)}</span>
            </span>
            <span className="sim-stat-pill">
              Net vs. market value:{" "}
              <span className={"hi " + (net >= 0 ? "profit" : "loss")}>{formatSignedEuro(net)}</span>
            </span>
          </div>
        )}
      </div>
    );

    if (inline) return panel;

    return (
      <div
        className="sim-overlay"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && typeof onClose === "function") onClose();
        }}
      >
        {panel}
      </div>
    );
  }

  window.CS2TerminalSimulator = { TerminalSimulator };
})();
