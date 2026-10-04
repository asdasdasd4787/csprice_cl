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
    const diffSeconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
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
      })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load armory data.")))
        .then((data) => {
          if (!active) return;
          setPayload(data);
          setLoading(false);
        })
        .catch((loadError) => {
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
      const values = tiles
        .map((tile) => metricFor(tile, activeProvider.id))
        .filter(Boolean);

      const positiveProfitCount = values.filter((metric) => Number(metric.profit_pct) > 0).length;
      const avgRoi = values.length
        ? values.reduce((sum, metric) => sum + (Number(metric.roi_pct) || 0), 0) / values.length
        : 0;
      const avgProfit = values.length
        ? values.reduce((sum, metric) => sum + (Number(metric.profit_pct) || 0), 0) / values.length
        : 0;
      const boardValue = values.reduce((sum, metric) => sum + (Number(metric.market_price) || 0), 0);

      return {
        positiveProfitCount,
        avgRoi,
        avgProfit,
        boardValue
      };
    }, [tiles, activeProvider.id]);

    return (
      <Layout>
        <main className="armory-page">
          <div className="armory-shell">
            <section className="armory-hero armory-panel">
              <div className="armory-hero-copy">
                <span className="armory-eyebrow">
                  <i className="fa-solid fa-wand-magic-sparkles" /> Armory Revenue
                </span>
                <h1 className="armory-title">Best armory routes, priced live from your tracked data.</h1>
                <p className="armory-description">
                  This board mirrors the current CS2 armory lineup, then recalculates the value, ROI and hourly edge
                  from your own tracked pricing source instead of a static screenshot.
                </p>

                <div className="armory-controls">
                  <div className="armory-provider-toggle">
                    {providers.map((provider) => (
                      <button
                        type="button"
                        key={provider.id}
                        className={classNames("armory-pill", providerId === provider.id && "active")}
                        onClick={() => setProviderId(provider.id)}
                        style={providerId === provider.id ? { "--accent": PROVIDER_ACCENTS[provider.id] || "rgba(82, 163, 255, 0.9)" } : undefined}
                      >
                        {provider.label}
                      </button>
                    ))}
                  </div>

                  <label className="armory-select-wrap">
                    <span>★ / hr</span>
                    <select value={starsPerHour} onChange={(event) => setStarsPerHour(Number(event.target.value) || 12)}>
                      {(payload?.stars_per_hour_options || []).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="armory-hero-stats">
                <div className="armory-stat-card">
                  <span>Tracked routes</span>
                  <strong>{tiles.length}</strong>
                  <small>Full live armory board</small>
                </div>
                <div className="armory-stat-card">
                  <span>Board value</span>
                  <strong>{formatEuro(boardSummary.boardValue)}</strong>
                  <small>{activeProvider.label} total</small>
                </div>
                <div className="armory-stat-card">
                  <span>Average ROI</span>
                  <strong>{formatPercent(boardSummary.avgRoi)}</strong>
                  <small>Across all current options</small>
                </div>
                <div className="armory-stat-card">
                  <span>Positive profit</span>
                  <strong>{boardSummary.positiveProfitCount}</strong>
                  <small>{formatPercent(boardSummary.avgProfit)} average edge</small>
                </div>
              </div>
            </section>

            <section className="armory-risk-row">
              {riskCards.map((card) => {
                const amount = riskCardValue(card, activeProvider.id, starsPerHour);
                return (
                  <article key={card.id} className="armory-risk-card armory-panel">
                    <div className="armory-risk-copy">
                      <span>{card.label}</span>
                      <strong>{formatEuro(amount)} per hour</strong>
                      <small>{card.description}</small>
                    </div>
                    <img src={card.item?.image} alt={card.item?.name || card.label} loading="lazy" decoding="async" />
                  </article>
                );
              })}
            </section>

            <section className="armory-board armory-panel">
              <div className="armory-board-head">
                <div>
                  <span className="armory-eyebrow">Armory board</span>
                  <h2>Live armory board</h2>
                </div>
                <div className="armory-board-meta">
                  <span>{activeProvider.label}</span>
                  <strong>{formatAgo(payload?.source_updated_at)}</strong>
                </div>
              </div>

              {loading && <div className="armory-status">Loading armory board…</div>}
              {error && !loading && <div className="armory-status error">{error}</div>}

              {!loading && !error && (
                <div className="armory-board-grid">
                  {tiles.map((tile) => {
                    const metric = metricFor(tile, activeProvider.id);
                    const rank = tile?.rankings?.[activeProvider.id]?.profit_rank || null;
                    const avgValue = Number(metric?.average_return);
                    const profitPct = Number(metric?.profit_pct);
                    const roiPct = Number(metric?.roi_pct);
                    const cardClass = `span-${tile.layout_span || "md"}`;

                    return (
                      <a
                        key={tile.id}
                        className={classNames("armory-tile", "armory-tile-link", cardClass)}
                        href={tile.href && tile.href !== "#" ? tile.href : tile.steam_url || "#"}
                        target={tile.href && tile.href !== "#" ? undefined : "_blank"}
                        rel={tile.href && tile.href !== "#" ? undefined : "noreferrer"}
                      >
                        <div className="armory-tile-top">
                          <span className="armory-stars">{tile.star_label || "Direct"}</span>
                          {rank ? <span className="armory-rank">#{rank}</span> : null}
                        </div>

                        <div className="armory-tile-body">
                          <div className="armory-tile-copy">
                            <h3>{tile.title || tile.name}</h3>
                            <div className="armory-metric-pair">
                              <div>
                                <span>Star ROI</span>
                                <strong>{formatPercent(roiPct)}</strong>
                              </div>
                              <div>
                                <span>Profit</span>
                                <strong>{formatPercent(profitPct)}</strong>
                              </div>
                            </div>

                            <div className="armory-route">
                              {formatEuro(tile.star_cost)} → {formatEuro(avgValue)} AVG
                            </div>

                            <div className="armory-submeta">
                              <span>{tile.age_tag || "NEW"}</span>
                              {tile.timer_label ? <span>{tile.timer_label}</span> : <span>{activeProvider.label}</span>}
                            </div>
                          </div>

                          <div
                            className={classNames("armory-tile-visual", tile.image_kind === "logo" && "logo")}
                            style={tile.image_offset ? { "--image-offset": tile.image_offset } : undefined}
                          >
                            <img src={tile.logo_image || tile.image} alt={tile.name} loading="lazy" decoding="async" />
                          </div>
                        </div>

                        <div className="armory-accent-bar">
                          <span />
                          <span />
                          <span />
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </main>
      </Layout>
    );
  }

  mountPage(<ArmoryPage />);
})();
