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
      fetch("get_item_stats.php", { headers: { Accept: "application/json" } })
        .then((response) => {
          if (!response.ok) throw new Error(`Stats request failed (${response.status})`);
          return response.json();
        })
        .then((payload) => {
          if (!alive) return;
          if (!payload?.success) throw new Error(payload?.error || "Stats unavailable.");
          setStats(payload);
          setLoading(false);
        })
        .catch((requestError) => {
          if (!alive) return;
          setError(requestError?.message || "Stats unavailable.");
          setLoading(false);
        });

      return () => {
        alive = false;
      };
    }, []);

    return (
      <Layout>
        <div className="collections-shell stats-db-shell">
          <header className="collections-head collections-head-animated">
            <div className="collections-kicker">Item Database</div>
            <h1>CS2 Item Universe</h1>
            <p className="collections-hero-copy">
              How many skins, cases, stickers, and other items exist in our tracked catalog — inspired by community databases like CSFloat DB.
            </p>
          </header>

          {loading ? <p className="results-meta">Loading catalog statistics...</p> : null}
          {error ? <p className="no-results">{error}</p> : null}

          {stats ? (
            <>
              <div className="stats-db-summary">
                <div className="stats-db-card">
                  <span>Total Listings</span>
                  <strong>{formatNumber(stats.total_listings)}</strong>
                </div>
                <div className="stats-db-card">
                  <span>Unique Base Items</span>
                  <strong>{formatNumber(stats.total_unique_items)}</strong>
                </div>
                <div className="stats-db-card">
                  <span>Categories</span>
                  <strong>{formatNumber(stats.categories?.length || 0)}</strong>
                </div>
              </div>

              <div className="collections-grid stats-db-grid">
                {(stats.categories || []).map((row, index) => (
                  <div
                    className="card stats-db-category-card landing-card-visible"
                    key={row.category}
                    style={{ "--card-stagger": `${Math.min(index, 12) * 40}ms` }}
                  >
                    <div className="card-body">
                      <div className="card-top-labels">
                        <span className="card-label left">{row.label}</span>
                        <span className="card-label right">{formatNumber(row.unique_items)} unique</span>
                      </div>
                      <h3>{formatNumber(row.listings)}</h3>
                      <p className="card-subtitle">Tracked market listings in {row.label.toLowerCase()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </Layout>
    );
  }

  mountPage(<StatsDbPage />);
})();
