(() => {
  const { useEffect, useMemo, useRef, useState } = React;
  const { mountPage } = window.CS2React;

  type AuthStatus = "success" | "failed" | "profile_error" | "logged_out" | null;

  type InventoryItem = {
    asset_id: string;
    class_id: string;
    instance_id: string;
    amount?: number;
    total_quantity?: number;
    asset_instances?: number;
    name: string;
    display_name: string;
    type: string;
    name_color: string;
    icon: string;
    marketable: boolean;
    tradable: boolean;
    market_url?: string;
  };

  type SteamUser = {
    steamid?: string;
    persona_name?: string;
    avatar?: string;
    profile_url?: string;
    member_since?: string;
    state_message?: string;
  };

  type ModalTab = "history" | "latest";

  type MarketHistoryPoint = {
    label: string;
    date: string;
    price: number;
    price_display: string;
    quantity: number;
  };

  type LatestSaleRow = {
    sold_at: string;
    price: number;
    price_display: string;
    quantity: number;
  };

  type MarketDetailPayload = {
    success?: boolean;
    steam_url?: string;
    summary?: {
      suggested_price?: number | null;
      suggested_price_display?: string;
      starting_price?: number | null;
      starting_price_display?: string;
      volume_display?: string;
      recent_sales_count?: number | null;
      sell_order_count?: number | null;
      sell_order_count_display?: string;
      status_label?: string;
    };
    sales_history?: MarketHistoryPoint[];
    latest_sales?: LatestSaleRow[];
    error?: string;
  };

  type MarketDetailState = {
    loading: boolean;
    data: MarketDetailPayload | null;
    error: string;
  };

  class PageErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; message: string }
  > {
    constructor(props: { children: React.ReactNode }) {
      super(props);
      this.state = { hasError: false, message: "" };
    }

    static getDerivedStateFromError(error: unknown) {
      return {
        hasError: true,
        message: error instanceof Error ? error.message : "This page hit an unexpected error."
      };
    }

    componentDidCatch(error: unknown) {
      console.error("Steam login page render failed:", error);
    }

    render() {
      if (this.state.hasError) {
        return (
          <div className="login-container">
            <div className="login-logo">
              <img src="logo.png" alt="CS2 Market" />
            </div>
            <div className="login-title">Steam dashboard could not load</div>
            <div className="login-sub">
              {this.state.message || "The page hit an unexpected rendering error. Please refresh and try again."}
            </div>
            <a className="steam-login" href="login.html">
              <i className="fa-solid fa-rotate-right" />
              Reload Login
            </a>
          </div>
        );
      }

      return this.props.children;
    }
  }

  function buildSteamMarketUrl(item: Partial<InventoryItem> | null | undefined) {
    if (item?.market_url) {
      return item.market_url;
    }

    const marketHashName = String(item?.name || item?.display_name || "").trim();
    if (!marketHashName) {
      return "https://steamcommunity.com/market";
    }

    return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}?l=english`;
  }

  function openInNewTab(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function scrollViewportToTop() {
    try {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch (_error) {
      // Ignore browser support issues here.
    }

    window.scrollTo(0, 0);
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }
  }

  function StatusBanner({ status }: { status: AuthStatus }) {
    if (!status) return null;

    const copy = {
      success: { tone: "success", text: "Steam login connected successfully." },
      failed: { tone: "error", text: "Steam login could not be verified. Please try again." },
      profile_error: { tone: "error", text: "Steam login worked, but the profile could not be loaded." },
      logged_out: { tone: "neutral", text: "You have been signed out." }
    }[status];

    if (!copy) return null;

    return <div className={`auth-status ${copy.tone}`}>{copy.text}</div>;
  }

  function itemQuantity(item: Partial<InventoryItem> | null | undefined) {
    const quantity = Number(item?.amount || 1);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  }

  function groupInventoryItems(items: InventoryItem[]) {
    const groups = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }

      const key = [
        item.class_id || "",
        item.instance_id || "",
        item.display_name || item.name || "",
        item.type || "",
        item.icon || ""
      ].join("::");

      const existing = groups.get(key);
      if (existing) {
        existing.total_quantity += itemQuantity(item);
        existing.asset_instances += 1;
        existing.marketable = existing.marketable || Boolean(item.marketable);
        existing.tradable = existing.tradable || Boolean(item.tradable);
        return;
      }

      groups.set(key, {
        ...item,
        total_quantity: itemQuantity(item),
        asset_instances: 1
      });
    });

    return Array.from(groups.values());
  }

  function SalesHistoryChart({ points }: { points: MarketHistoryPoint[] }) {
    if (!points.length) {
      return <div className="inventory-market-empty-state">Steam market history is not available for this item yet.</div>;
    }

    const width = 720;
    const height = 270;
    const padding = { top: 20, right: 22, bottom: 36, left: 58 };
    const values = points.map((point) => Number(point.price || 0));
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 0.01;
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    const chartPoints = points.map((point, index) => {
      const x = padding.left + (index / Math.max(1, points.length - 1)) * innerWidth;
      const y = padding.top + (1 - ((Number(point.price || 0) - minValue) / range)) * innerHeight;
      return { x, y, ...point };
    });

    const polyline = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
    const areaPath = [
      `M ${chartPoints[0].x} ${padding.top + innerHeight}`,
      ...chartPoints.map((point) => `L ${point.x} ${point.y}`),
      `L ${chartPoints[chartPoints.length - 1].x} ${padding.top + innerHeight}`,
      "Z"
    ].join(" ");

    const yTicks = Array.from({ length: 5 }, (_, tickIndex) => {
      const value = maxValue - (range / 4) * tickIndex;
      const y = padding.top + (tickIndex / 4) * innerHeight;
      return {
        value,
        label: `€${value.toFixed(2)}`,
        y
      };
    });

    return (
      <svg className="inventory-market-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="inventoryMarketChartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(56, 189, 248, 0.34)" />
            <stop offset="100%" stopColor="rgba(56, 189, 248, 0.02)" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => (
          <g key={tick.label}>
            <line className="inventory-market-grid-line" x1={padding.left} y1={tick.y} x2={width - padding.right} y2={tick.y} />
            <text className="inventory-market-axis-label" x={padding.left - 10} y={tick.y + 4}>{tick.label}</text>
          </g>
        ))}

        <path d={areaPath} fill="url(#inventoryMarketChartFill)" />
        <polyline className="inventory-market-chart-line" points={polyline} />

        {chartPoints.map((point, index) => (
          index % Math.max(1, Math.floor(points.length / 4)) === 0 || index === points.length - 1 ? (
            <text key={`${point.label}-${index}`} className="inventory-market-axis-label x-axis" x={point.x} y={height - 10}>
              {point.label}
            </text>
          ) : null
        ))}
      </svg>
    );
  }

  function InventoryMarketModal({
    item,
    detailState,
    activeTab,
    onTabChange,
    onClose,
    onOpenMarket
  }: {
    item: InventoryItem;
    detailState: MarketDetailState;
    activeTab: ModalTab;
    onTabChange: (tab: ModalTab) => void;
    onClose: () => void;
    onOpenMarket: (item: InventoryItem) => void;
  }) {
    const summary = detailState.data?.summary || {};
    const history = Array.isArray(detailState.data?.sales_history) ? detailState.data.sales_history : [];
    const latestSales = Array.isArray(detailState.data?.latest_sales) ? detailState.data.latest_sales : [];

    return (
      <div className="inventory-market-modal" role="dialog" aria-modal="true" aria-label={`${item.display_name || item.name} market details`}>
        <button type="button" className="inventory-market-backdrop" onClick={onClose} aria-label="Close item details" />

        <div className="inventory-market-shell">
          <button type="button" className="inventory-market-close" onClick={onClose} aria-label="Close item details">
            <i className="fa-solid fa-xmark" />
          </button>

          <div className="inventory-market-main">
            <section className="inventory-market-preview-panel">
              <div className="inventory-market-preview-card">
                {item.total_quantity > 1 ? <div className="inventory-market-quantity">×{item.total_quantity}</div> : null}
                {item.icon ? <img src={item.icon} alt={item.display_name || item.name} /> : <div className="inventory-placeholder">CS2</div>}
              </div>

              <div className="inventory-market-tools">
                <button type="button" className="inventory-market-link" onClick={() => onOpenMarket(item)}>
                  View at Steam <span aria-hidden="true">↗</span>
                </button>
                <div className="inventory-market-tools-dots" aria-hidden="true">•••</div>
              </div>

              <div className="inventory-market-tabs" role="tablist" aria-label="Steam market item details">
                <button type="button" className={`inventory-market-tab${activeTab === "history" ? " active" : ""}`} onClick={() => onTabChange("history")}>
                  Sales History
                </button>
                <button type="button" className={`inventory-market-tab${activeTab === "latest" ? " active" : ""}`} onClick={() => onTabChange("latest")}>
                  Latest Sales
                </button>
              </div>

              <div className="inventory-market-content">
                {detailState.loading ? (
                  <div className="inventory-market-empty-state">Loading Steam market data…</div>
                ) : detailState.error ? (
                  <div className="inventory-market-empty-state">{detailState.error}</div>
                ) : activeTab === "history" ? (
                  <SalesHistoryChart points={history} />
                ) : (
                  <div className="inventory-market-sales-list">
                    <div className="inventory-market-sales-head">
                      <span>Date/Time</span>
                      <span>Selling price</span>
                    </div>
                    {latestSales.length ? latestSales.map((sale) => (
                      <div className="inventory-market-sale-row" key={`${sale.sold_at}-${sale.price_display}`}>
                        <span>{sale.sold_at}</span>
                        <span>{sale.price_display}</span>
                      </div>
                    )) : (
                      <div className="inventory-market-empty-state">Recent Steam sales are not available for this item yet.</div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <aside className="inventory-market-side-panel">
              <div className="inventory-market-kicker">{item.type || "Steam Market Item"}</div>
              <h3>{item.display_name || item.name}</h3>
              <p>{item.type || item.name}</p>

              <div className="inventory-market-price-block">
                <span>Suggested price</span>
                <strong>{summary.suggested_price_display || "—"}</strong>
                <p>
                  {(summary.sell_order_count_display || "—")}
                  {" "}items for sale starting at{" "}
                  <strong>{summary.starting_price_display || "—"}</strong>.
                </p>
              </div>

              <div className="inventory-market-status-chip">
                {summary.status_label || "ACTIVE"}
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  function InventoryCard({
    item,
    onOpenMarket
  }: {
    item: InventoryItem;
    onOpenMarket: (item: InventoryItem) => void;
  }) {
    const metaParts = [
      item.marketable ? "Marketable" : item.tradable ? "Tradable" : "Inventory",
      `x${item.total_quantity}`,
      item.asset_instances > 1 ? `${item.asset_instances} stacks` : "Single stack"
    ];

    return (
      <div className="inventory-card">
        <div className="inventory-card-media">
          {item.total_quantity > 1 ? <div className="inventory-stack-badge">x{item.total_quantity}</div> : null}
          {item.icon ? <img src={item.icon} alt={item.display_name || item.name} /> : <div className="inventory-placeholder">CS2</div>}
        </div>

        <div className="inventory-card-kicker">{metaParts.join(" / ")}</div>
        <div className="inventory-card-copy">
          <div
            className="inventory-card-name"
            style={item.name_color ? { color: `#${item.name_color}` } : undefined}
          >
            {item.display_name || item.name}
          </div>
          <div className="inventory-card-sub">{item.type || item.name}</div>
        </div>

        <div className="inventory-card-actions">
          <button
            type="button"
            className="inventory-market-btn inventory-market-btn-sell"
            onClick={() => onOpenMarket(item)}
            disabled={!item.market_url}
          >
            <i className="fa-brands fa-steam" />
            View on Steam
          </button>
        </div>
      </div>
    );
  }

  function LoginPage() {
    const status = new URLSearchParams(window.location.search).get("auth");
    const inventoryRequestIdRef = useRef(0);
    const [activeModalItem, setActiveModalItem] = useState<InventoryItem | null>(null);
    const [activeModalTab, setActiveModalTab] = useState<ModalTab>("history");
    const [marketDetailState, setMarketDetailState] = useState<MarketDetailState>({
      loading: false,
      data: null,
      error: ""
    });
    const [sessionState, setSessionState] = useState({
      loading: true,
      authenticated: false,
      user: null,
      error: ""
    });
    const [inventoryState, setInventoryState] = useState({
      loading: false,
      items: [],
      total: 0,
      error: "",
      syncPages: 0,
      syncComplete: false
    });

    const loadInventory = async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
      const requestId = inventoryRequestIdRef.current + 1;
      inventoryRequestIdRef.current = requestId;

      setInventoryState((current) => ({
        ...current,
        loading: true,
        error: "",
        syncPages: 0,
        syncComplete: false
      }));

      const aggregatedItems = [];
      const seenAssetIds = new Set();
      let total = 0;
      let syncPages = 0;

      try {
        const params = new URLSearchParams({
          count: "200"
        });
        if (forceRefresh) {
          params.set("refresh", "1");
        }

        const response = await fetch(`get_steam_inventory.php?${params.toString()}`);
        if (!response.ok) throw new Error(`Inventory request failed (${response.status})`);
        const json = await response.json();
        if (json && json.error) throw new Error(json.error);

        const inventory = json.inventory || {};
        const nextItems = Array.isArray(inventory.items) ? inventory.items : [];

        nextItems.forEach((item) => {
          const assetKey = String(item?.asset_id || `${item?.class_id || ""}-${item?.instance_id || ""}-${aggregatedItems.length}`);
          if (seenAssetIds.has(assetKey)) {
            return;
          }

          seenAssetIds.add(assetKey);
          aggregatedItems.push(item);
        });

        total = Number(inventory.total_inventory_count || aggregatedItems.length);
        syncPages = Number(inventory.page_count || 1);

        if (inventoryRequestIdRef.current !== requestId) {
          return;
        }

        setInventoryState({
          loading: false,
          items: [...aggregatedItems],
          total: total || aggregatedItems.length,
          error: "",
          syncPages,
          syncComplete: true
        });
      } catch (error) {
        if (inventoryRequestIdRef.current !== requestId) {
          return;
        }

        setInventoryState((current) => ({
          ...current,
          loading: false,
          items: aggregatedItems.length ? [...aggregatedItems] : current.items,
          total: total || aggregatedItems.length || current.total,
          error: error.message || "Inventory could not be loaded.",
          syncPages,
          syncComplete: false
        }));
      }
    };

    useEffect(() => {
      scrollViewportToTop();
    }, []);

    useEffect(() => {
      document.body.classList.toggle("steam-auth-page", !sessionState.authenticated);
      document.body.classList.toggle("steam-dashboard-page", Boolean(sessionState.authenticated));

      return () => {
        document.body.classList.remove("steam-auth-page");
        document.body.classList.remove("steam-dashboard-page");
      };
    }, [sessionState.authenticated]);

    useEffect(() => {
      if (sessionState.authenticated) {
        scrollViewportToTop();
      }
    }, [sessionState.authenticated]);

    useEffect(() => {
      document.body.classList.toggle("inventory-modal-open", Boolean(activeModalItem));
      return () => {
        document.body.classList.remove("inventory-modal-open");
      };
    }, [activeModalItem]);

    useEffect(() => {
      if (!activeModalItem) {
        return undefined;
      }

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setActiveModalItem(null);
        }
      };

      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }, [activeModalItem]);

    useEffect(() => {
      let cancelled = false;

      fetch("get_steam_session.php")
        .then((response) => {
          if (!response.ok) throw new Error(`Session request failed (${response.status})`);
          return response.json();
        })
        .then((json) => {
          if (cancelled) return;
          setSessionState({
            loading: false,
            authenticated: Boolean(json.authenticated),
            user: json.user || null,
            error: json.error || ""
          });

          if (json.authenticated) {
            scrollViewportToTop();
            loadInventory({ forceRefresh: false });
          }
        })
        .catch((error) => {
          if (cancelled) return;
          setSessionState({
            loading: false,
            authenticated: false,
            user: null,
            error: error.message || "Steam session could not be loaded."
          });
        });

      return () => {
        cancelled = true;
      };
    }, []);

    const groupedInventoryItems = useMemo(
      () => groupInventoryItems(
        (Array.isArray(inventoryState.items) ? inventoryState.items : []).filter(
          (item): item is InventoryItem => Boolean(item && typeof item === "object")
        )
      ),
      [inventoryState.items]
    );

    useEffect(() => {
      if (!activeModalItem?.name) {
        setMarketDetailState({
          loading: false,
          data: null,
          error: ""
        });
        return undefined;
      }

      let cancelled = false;
      setMarketDetailState({
        loading: true,
        data: null,
        error: ""
      });

      const params = new URLSearchParams({
        market_hash_name: activeModalItem.name,
        app_id: "730"
      });

      fetch(`get_steam_market_activity.php?${params.toString()}`)
        .then((response) => {
          if (!response.ok) throw new Error(`Steam market request failed (${response.status})`);
          return response.json();
        })
        .then((json) => {
          if (cancelled) return;
          if (json && json.success === false) throw new Error(json.error || "Steam market data could not be loaded.");
          setMarketDetailState({
            loading: false,
            data: json,
            error: ""
          });
        })
        .catch((error) => {
          if (cancelled) return;
          setMarketDetailState({
            loading: false,
            data: null,
            error: error.message || "Steam market data could not be loaded."
          });
        });

      return () => {
        cancelled = true;
      };
    }, [activeModalItem?.name]);

    const openInventoryItemMarket = (item: InventoryItem) => {
      openInNewTab(buildSteamMarketUrl(item));
    };

    const openInventoryItemDetails = (item: InventoryItem) => {
      setActiveModalTab("history");
      setActiveModalItem(item);
    };

    const inventorySummary = useMemo(() => {
      const marketable = inventoryState.items.reduce(
        (sum, item) => sum + (item.marketable ? itemQuantity(item) : 0),
        0
      );
      const tradable = inventoryState.items.reduce(
        (sum, item) => sum + (item.tradable ? itemQuantity(item) : 0),
        0
      );
      return { marketable, tradable };
    }, [inventoryState.items]);

    if (sessionState.loading) {
      return (
        <div className="login-container">
          <div className="login-logo">
            <img src="logo.png" alt="CS2 Market" />
          </div>
          <div className="login-title">Checking Steam session</div>
          <div className="login-sub">Loading your account state and preparing the inventory view.</div>
        </div>
      );
    }

    if (!sessionState.authenticated) {
      return (
        <div className="login-container">
          <div className="login-logo">
            <img src="logo.png" alt="CS2 Market" />
          </div>

          <StatusBanner status={status} />

          <div className="login-title">
            Sign in with Steam
          </div>

          <a className="steam-login" href="steam_login.php">
            <i className="fa-brands fa-steam" />
            Continue with Steam
          </a>

          <div className="login-features">
            <span><i className="fa-solid fa-check" /> Steam OpenID session</span>
            <span><i className="fa-solid fa-check" /> Primitive CS2 inventory preview</span>
            <span><i className="fa-solid fa-check" /> No password stored locally</span>
          </div>

          {sessionState.error && <div className="auth-inline-error">{sessionState.error}</div>}

          <div className="login-footer">
            By continuing, you authenticate on Steam itself. This page only stores your returned SteamID
            in the local PHP session for this website.
          </div>
        </div>
      );
    }

    const user: SteamUser = sessionState.user || {};

    return (
      <div className="steam-dashboard">
        <StatusBanner status={status} />

        <div className="steam-dashboard-hero">
          <div className="steam-dashboard-user">
            <div className="steam-dashboard-avatar">
              {user.avatar ? <img src={user.avatar} alt={user.persona_name} /> : <div className="inventory-placeholder">ST</div>}
            </div>

            <div className="steam-dashboard-copy">
              <div className="steam-dashboard-kicker">Steam Connected</div>
              <h1>{user.persona_name || "Steam User"}</h1>
              <p>{user.state_message || "Steam session active for this browser."}</p>
              <div className="steam-dashboard-meta">
                <span>SteamID: {user.steamid}</span>
                {user.member_since ? <span>Member since: {user.member_since}</span> : null}
              </div>
            </div>
          </div>

          <div className="steam-dashboard-actions">
            <a className="dashboard-btn secondary" href={user.profile_url || "#"} target="_blank" rel="noreferrer">
              <i className="fa-solid fa-up-right-from-square" />
              Open Steam Profile
            </a>
            <button className="dashboard-btn" type="button" onClick={() => loadInventory({ forceRefresh: true })}>
              <i className="fa-solid fa-rotate-right" />
              Refresh Inventory
            </button>
            <a className="dashboard-btn danger" href="steam_logout.php">
              <i className="fa-solid fa-right-from-bracket" />
              Log Out
            </a>
          </div>
        </div>

        <div className="steam-dashboard-stats">
          <div className="steam-stat-card">
            <span>Total items</span>
            <strong>{inventoryState.total || inventoryState.items.length}</strong>
          </div>
          <div className="steam-stat-card">
            <span>Loaded assets</span>
            <strong>{inventoryState.items.length}</strong>
          </div>
          <div className="steam-stat-card">
            <span>Visible stacks</span>
            <strong>{groupedInventoryItems.length}</strong>
          </div>
          <div className="steam-stat-card">
            <span>Marketable</span>
            <strong>{inventorySummary.marketable}</strong>
          </div>
          <div className="steam-stat-card">
            <span>Tradable</span>
            <strong>{inventorySummary.tradable}</strong>
          </div>
        </div>

        <div className="steam-dashboard-panel">
          <div className="steam-dashboard-panel-head">
            <div>
              <div className="panel-kicker">Primitive Inventory Interface</div>
              <h2>Counter-Strike Inventory</h2>
            </div>
            {inventoryState.loading
              ? <div className="panel-badge">Syncing full inventory{inventoryState.syncPages ? ` (${inventoryState.syncPages} pages)` : ""}...</div>
              : <div className="panel-badge">{groupedInventoryItems.length} stacks synced</div>}
          </div>

          <div className="inventory-toolbar">
            <div className="inventory-toolbar-copy">
              <strong>{inventoryState.items.length}</strong>
              <span>raw Steam assets loaded</span>
            </div>
            {inventoryState.loading ? (
              <div className="panel-badge">Fetching every Steam inventory page...</div>
            ) : (
              <div className="panel-badge muted">Full inventory synced</div>
            )}
          </div>

          {inventoryState.error ? (
            <div className="auth-inline-error wide">
              {inventoryState.error}
              <br />
              If your inventory is private, Steam may refuse to expose the item list to this page.
            </div>
          ) : null}

          <div className="inventory-grid">
            {groupedInventoryItems.map((item) => (
              <InventoryCard
                item={item}
                key={`${item.asset_id}-${item.class_id}-${item.instance_id}`}
                onOpenMarket={openInventoryItemMarket}
              />
            ))}
          </div>

          {!inventoryState.loading && !inventoryState.error && !groupedInventoryItems.length ? (
            <div className="inventory-empty">
              No inventory items were returned yet. Try refreshing, or make sure the Steam inventory is public.
            </div>
          ) : null}
        </div>

        {activeModalItem ? (
          <InventoryMarketModal
            item={activeModalItem}
            detailState={marketDetailState}
            activeTab={activeModalTab}
            onTabChange={setActiveModalTab}
            onClose={() => setActiveModalItem(null)}
            onOpenMarket={openInventoryItemMarket}
          />
        ) : null}
      </div>
    );
  }

  function SignupPage() {
    useEffect(() => {
      document.body.classList.add("steam-auth-page");
      document.body.classList.remove("steam-dashboard-page");

      return () => {
        document.body.classList.remove("steam-auth-page");
      };
    }, []);

    return (
      <div className="auth-card">
        <div className="auth-header">
          <h1>Create Account</h1>
          <p>Track prices, inventory &amp; ROI in real time</p>
        </div>

        <form>
          <div className="auth-field">
            <label>Username</label>
            <input type="text" placeholder="Your username" />
          </div>

          <div className="auth-field">
            <label>Email</label>
            <input type="email" placeholder="you@email.com" />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <input type="password" placeholder={"â€˘â€˘â€˘â€˘â€˘â€˘â€˘â€˘"} />
          </div>

          <div className="auth-field">
            <label>Confirm Password</label>
            <input type="password" placeholder={"â€˘â€˘â€˘â€˘â€˘â€˘â€˘â€˘"} />
          </div>

          <button className="auth-btn">
            <i className="fa-solid fa-user-plus" /> Create Account
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?
          {" "}
          <a href="login.html">Log in</a>
        </div>
      </div>
    );
  }

  const path = window.location.pathname.toLowerCase();
  const page = (
    <PageErrorBoundary>
      {/\/signup(\.html)?\/?$/.test(path) ? <SignupPage /> : <LoginPage />}
    </PageErrorBoundary>
  );
  mountPage(page);
})();
