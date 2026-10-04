(function () {
  // Embedded on the profile page (index.html?panel=profile) the dashboard
  // renders into #inventory-embed and leaves the page's own navbar alone;
  // on login.html / signup.html it owns #root as before. Anywhere else a
  // stray #root is not ours (user, 2026-10-03: "put the inventory UI under
  // the profile").
  const path = window.location.pathname.toLowerCase();
  const EMBEDDED = Boolean(document.getElementById("inventory-embed"));
  const root = EMBEDDED
    ? document.getElementById("inventory-embed")
    : (/\/(login|signup)(\.html)?\/?$/.test(path) ? document.getElementById("root") : null);
  if (!root) {
    return;
  }

  const isSignupPage = /\/signup(\.html)?\/?$/.test(path);
  const authStatus = new URLSearchParams(window.location.search).get("auth");
  // tf2price.eu (html[data-game="tf2"]): the Team Fortress 2 inventory. The
  // server prices every item from the TF2 index in one go, so the CS2
  // per-provider quote calls are skipped and the modes are TF2's markets.
  const TF2_MODE = document.documentElement.getAttribute("data-game") === "tf2"
    || /(^|\.)tf2price\.eu$/i.test(String(window.location.hostname || ""));
  const APP_LABEL = TF2_MODE ? "TF2" : "CS2";
  const VALUATION_MODES = [
    { id: "steam_starting", label: "Steam Market - Starting at", provider: "steam" },
    { id: "steam_suggested", label: "Steam Market - Suggested price", provider: "steam" },
    { id: "steam_latest_sale", label: "Steam Market - Latest sale", provider: "steam" },
    { id: "steam_avg_7d", label: "Steam Market - 7D average", provider: "steam" },
    { id: "steam_avg_30d", label: "Steam Market - 30D average", provider: "steam" },
    { id: "skinport_min", label: "Skinport - Starting at", provider: "skinport" },
    { id: "skinport_suggested", label: "Skinport - Suggested price", provider: "skinport" },
    { id: "skinport_mean", label: "Skinport - Mean price", provider: "skinport" },
    { id: "skinport_median", label: "Skinport - Median price", provider: "skinport" },
    { id: "csfloat_lowest", label: "CSFloat - Lowest listing", provider: "csfloat" },
    { id: "dmarket_lowest", label: "DMarket - Lowest listing", provider: "dmarket" },
  ];
  if (TF2_MODE) {
    VALUATION_MODES.splice(0, VALUATION_MODES.length,
      { id: "steam_starting", label: "Steam Market - Starting at", provider: "steam" },
      { id: "mannco_lowest", label: "Mannco.store - Lowest listing", provider: "dmarket" },
      { id: "skinport_min", label: "Skinport - Starting at", provider: "skinport" },
      { id: "dmarket_lowest", label: "DMarket - Lowest listing", provider: "dmarket" });
  }
  const CHART_RANGES = [
    { id: "24h", label: "24H", points: 2 },
    { id: "7d", label: "7D", points: 7 },
    { id: "30d", label: "30D", points: 30 },
    { id: "90d", label: "90D", points: 90 },
    { id: "all", label: "All", points: 0 },
  ];
  const SALES_PERIODS = [
    { id: "day", label: "Day" },
    { id: "week", label: "Week" },
    { id: "quarter", label: "Quarter" },
    { id: "year", label: "Year" },
  ];
  const INVENTORY_SORTS = [
    { id: "value_desc", label: "Highest Value" },
    { id: "value_asc", label: "Lowest Value" },
    { id: "quantity_desc", label: "Most Items" },
    { id: "name_asc", label: "Name A-Z" },
  ];
  let valuationRequestId = 0;
  let valuationForceFreshActive = false;
  let inventoryPanelRenderFrame = 0;
  let inventoryGridRenderTimer = 0;
  let inventorySearchTimer = 0;
  let inventoryValuationRenderTimer = 0;
  let inventoryGridAnimateNext = false;
  let inventoryHasAnimatedOnce = false;
  const inventoryPanelRenderScopes = new Set();
  // Separate browser snapshots per game, so a CS2 inventory cached on this
  // origin is never shown while the TF2 one loads.
  const INVENTORY_SNAPSHOT_PREFIX = TF2_MODE ? "tf2_inventory_snapshot:" : "cs2_inventory_snapshot:";
  const STEAM_SESSION_CACHE_KEY = "cs2_steam_session_cache";

  function sessionDisplayName(user) {
    return String((user && (user.persona_name || user.display_name || user.name || user.email)) || "").trim() || "Signed in";
  }

  function sessionAvatarUrl(user) {
    return String((user && (user.avatar || user.picture || user.avatarfull)) || "").trim();
  }

  function sessionProviderLabel(user) {
    const provider = String((user && user.provider) || "steam").toLowerCase();
    if (provider === "google") return "Google";
    if (provider === "discord") return "Discord";
    return "Steam";
  }

  function sessionAvatarMarkup(user) {
    const src = sessionAvatarUrl(user);
    const name = sessionDisplayName(user);
    if (src) {
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(name)}" referrerpolicy="no-referrer">`;
    }
    const provider = sessionProviderLabel(user);
    return `<div class="inventory-placeholder">${escapeHtml(provider.slice(0, 2).toUpperCase())}</div>`;
  }

  function readCachedSteamSession() {
    try {
      const rawValue = window.sessionStorage.getItem(STEAM_SESSION_CACHE_KEY);
      if (!rawValue) {
        return null;
      }

      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      return {
        authenticated: Boolean(parsed.authenticated),
        user: parsed.user && typeof parsed.user === "object" ? parsed.user : null,
      };
    } catch (_error) {
      return null;
    }
  }

  function writeCachedSteamSession(session) {
    try {
      window.sessionStorage.setItem(STEAM_SESSION_CACHE_KEY, JSON.stringify({
        authenticated: Boolean(session && session.authenticated),
        user: session && session.user ? session.user : null,
      }));
    } catch (_error) {
      // Ignore sessionStorage write failures.
    }
  }

  function applyInventorySnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.items) || !snapshot.items.length) {
      return false;
    }

    state.inventoryItems = snapshot.items.slice();
    state.totalInventoryCount = Number(snapshot.totalInventoryCount || snapshot.items.length);
    state.hasMoreInventory = false;
    state.inventoryCursor = "";
    state.inventoryPagesLoaded = Number(snapshot.pageCount || 1);
    state.lastInventoryLoadedAt = snapshot.lastSyncedAt || "";
    state.valuations = snapshot.valuations && typeof snapshot.valuations === "object"
      ? snapshot.valuations
      : {};
    return true;
  }

  function hydrateFromBrowserCache() {
    const cachedSession = readCachedSteamSession();
    if (!cachedSession || !cachedSession.authenticated || !cachedSession.user) {
      return false;
    }

    state.authenticated = true;
    state.user = cachedSession.user;
    state.sessionLoading = false;
    applyInventorySnapshot(readInventorySnapshot(String(cachedSession.user.steamid || "")));
    return true;
  }

  function deriveAppBaseUrl() {
    if (window.location.protocol === "file:") {
      const normalizedPath = decodeURIComponent(window.location.pathname || "").replace(/\\/g, "/");
      const marker = "/htdocs/";
      const lowerPath = normalizedPath.toLowerCase();
      const markerIndex = lowerPath.indexOf(marker);
      let appPath = "/csgo_price_tracker/";

      if (markerIndex !== -1) {
        const relativePath = normalizedPath.slice(markerIndex + marker.length);
        const parts = relativePath.split("/").filter(Boolean);
        if (parts.length > 1) {
          appPath = `/${parts.slice(0, -1).join("/")}/`;
        }
      }

      return `http://localhost${appPath}`;
    }

    const segments = window.location.pathname.split("/").filter(Boolean);
    const directory = segments.length > 1 ? `/${segments.slice(0, -1).join("/")}/` : "/";
    return `${window.location.origin}${directory}`;
  }

  const appBaseUrl = deriveAppBaseUrl();

  // The address bar shows the folder form (/login/, /signup/) like every other
  // page - those folder copies exist on the server - instead of login.html
  // (user, 2026-09-30). The base is pinned first so relative URLs keep
  // resolving from the site root after the path gains a folder.
  (function showCleanAddress() {
    try {
      const match = window.location.pathname.match(/^(.*\/)(login|signup)\.html$/i);
      if (!match || window.location.protocol === "file:") return;
      if (!document.querySelector("base[href]")) {
        const base = document.createElement("base");
        base.setAttribute("href", match[1]);
        document.head.insertBefore(base, document.head.firstChild);
      }
      window.history.replaceState(window.history.state, "", `${match[1]}${match[2].toLowerCase()}/${window.location.search}${window.location.hash}`);
    } catch (_error) {}
  })();

  function appUrl(relativePath) {
    return `${appBaseUrl}${String(relativePath || "").replace(/^\/+/, "")}`;
  }

  function splitSteamWearName(value) {
    const trimmed = String(value || "").trim();
    const match = trimmed.match(/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/);
    if (!match) {
      return [trimmed, ""];
    }

    return [String(match[1] || "").trim(), String(match[2] || "").trim()];
  }

  function inventoryWearShortLabel(wear) {
    const labels = {
      "factory new": "FN",
      "minimal wear": "MW",
      "field-tested": "FT",
      "well-worn": "WW",
      "battle-scarred": "BS",
    };
    const key = String(wear || "").trim().toLowerCase();
    return labels[key] || "";
  }

  function inventoryMarketHashName(item) {
    if (!item || typeof item !== "object") {
      return "";
    }

    const explicit = String(item.market_hash_name || "").trim();
    const named = String(item.name || "").trim();
    const display = String(item.display_name || "").trim();
    const taggedWear = String(item.exterior || item.wear || "").trim();

    const withWear = [explicit, named].find((value) => splitSteamWearName(value)[1]);
    if (withWear) {
      return withWear;
    }

    const base = explicit || named || display;
    if (base && taggedWear && !splitSteamWearName(base)[1]) {
      return `${base} (${taggedWear})`;
    }

    return base;
  }

  function buildInventoryItemDetailUrl(item) {
    if (TF2_MODE && item && item.detail_url) {
      return appUrl(String(item.detail_url));
    }
    const marketHashName = inventoryMarketHashName(item);
    const [baseName, wear] = splitSteamWearName(marketHashName);
    const params = new URLSearchParams();

    if (marketHashName) {
      params.set("lookup_name", marketHashName);
    }
    if (baseName || marketHashName) {
      params.set("display_name", baseName || marketHashName);
    }
    if (item && item.icon) {
      params.set("image", String(item.icon));
    }
    if (item && item.market_url) {
      params.set("market_url", String(item.market_url));
    }
    if (item && item.type) {
      params.set("type", String(item.type));
    }
    if (item && item.name_color) {
      params.set("color", String(item.name_color));
    }
    if (wear) {
      params.set("selected_wear", wear);
    }
    params.set("from_inventory", "1");

    return appUrl(`item_page.php?${params.toString()}`);
  }

  function inventorySnapshotKey(steamId) {
    const normalizedSteamId = String(steamId || "").trim();
    return normalizedSteamId ? `${INVENTORY_SNAPSHOT_PREFIX}${normalizedSteamId}` : "";
  }

  function readInventorySnapshot(steamId) {
    const snapshotKey = inventorySnapshotKey(steamId);
    if (!snapshotKey) {
      return null;
    }

    try {
      const rawValue = window.localStorage.getItem(snapshotKey);
      if (!rawValue) {
        return null;
      }

      const parsed = JSON.parse(rawValue);
      const items = Array.isArray(parsed && parsed.items)
        ? parsed.items.filter((item) => item && typeof item === "object")
        : [];

      return {
        items,
        totalInventoryCount: Number(parsed && parsed.totalInventoryCount ? parsed.totalInventoryCount : items.length),
        pageCount: Number(parsed && parsed.pageCount ? parsed.pageCount : (items.length ? 1 : 0)),
        lastSyncedAt: String(parsed && parsed.lastSyncedAt ? parsed.lastSyncedAt : ""),
        valuations: parsed && parsed.valuations && typeof parsed.valuations === "object" ? parsed.valuations : {},
      };
    } catch (_error) {
      return null;
    }
  }

  function writeInventorySnapshot(steamId, payload) {
    const snapshotKey = inventorySnapshotKey(steamId);
    if (!snapshotKey) {
      return;
    }

    const items = Array.isArray(payload && payload.items) ? payload.items : [];

    try {
      window.localStorage.setItem(snapshotKey, JSON.stringify({
        items,
        totalInventoryCount: Number(payload && payload.totalInventoryCount ? payload.totalInventoryCount : items.length),
        pageCount: Number(payload && payload.pageCount ? payload.pageCount : (items.length ? 1 : 0)),
        lastSyncedAt: String(payload && payload.lastSyncedAt ? payload.lastSyncedAt : ""),
        valuations: payload && payload.valuations && typeof payload.valuations === "object" ? payload.valuations : {},
        savedAt: new Date().toISOString(),
      }));
    } catch (_error) {
      // Ignore localStorage write failures and keep the SQL-backed flow working.
    }
  }

  if (window.location.protocol === "file:") {
    const targetPage = isSignupPage ? "signup.html" : "login.html";
    window.location.replace(`${appUrl(targetPage)}${window.location.search}${window.location.hash}`);
    return;
  }

  const state = {
    isSignupPage,
    authStatus,
    sessionLoading: !isSignupPage,
    authenticated: false,
    sessionError: "",
    user: null,
    oauth: {
      google: false,
      discord: false,
    },
    inventoryLoading: false,
    inventorySyncing: false,
    inventoryError: "",
    inventoryItems: [],
    totalInventoryCount: 0,
    hasMoreInventory: false,
    inventoryCursor: "",
    inventoryPagesLoaded: 0,
    inventorySyncMode: "idle",
    lastInventoryLoadedAt: "",
    valuationMode: VALUATION_MODES[0].id,
    sortBy: INVENTORY_SORTS[0].id,
    chartRange: CHART_RANGES[4].id,
    modalChartRange: "all",
    modalSalesPeriod: "day",
    valuationLoading: false,
    valuationError: "",
    valuationProgress: 0,
    valuationTotal: 0,
    valuations: {},
    providersLoaded: {
      steam: false,
      skinport: false,
      csfloat: false,
      dmarket: false,
    },
    providerLoading: {
      steam: false,
      skinport: false,
      csfloat: false,
      dmarket: false,
    },
    providerErrors: {
      steam: "",
      skinport: "",
      csfloat: "",
      dmarket: "",
    },
    filters: {
      query: "",
      marketableOnly: false,
      tradableOnly: false,
    },
    filterPanelOpen: false,
    sortMenuOpen: false,
    itemDetailModal: null,
    inventoryAiLoading: false,
  };

  let siteNavRoot = null;

  function mountSiteChrome() {
    if (EMBEDDED) {
      return;
    }
    const bundle = window.CS2React;
    if (!bundle || !bundle.Navbar || !window.ReactDOM || !window.ReactDOM.createRoot) {
      return;
    }

    let host = document.getElementById("site-chrome-root");
    if (!host) {
      host = document.createElement("div");
      host.id = "site-chrome-root";
      document.body.insertBefore(host, root);
    }
    // The bar renders inside #cs2-nav-root like on every other page, so the
    // floating-card inset (navbar.css / wide-screens.css pad that id) applies
    // here too; #site-chrome-root stays as the marker shared-components
    // checks before mounting its own chrome (user, 2026-10-03: "the navbar
    // gets glued to the top in inventory").
    let navHost = document.getElementById("cs2-nav-root");
    if (!navHost) {
      navHost = document.createElement("div");
      navHost.id = "cs2-nav-root";
      host.appendChild(navHost);
    }

    if (!siteNavRoot) {
      siteNavRoot = window.ReactDOM.createRoot(navHost);
    }

    siteNavRoot.render(window.React.createElement(bundle.Navbar));
    if (typeof bundle.ensureChatWidget === "function") {
      bundle.ensureChatWidget();
    }
  }

  function unmountSiteChrome() {
    if (EMBEDDED) {
      return;
    }
    if (siteNavRoot) {
      siteNavRoot.render(null);
    }
  }

  if (!isSignupPage) {
    hydrateFromBrowserCache();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function nl2br(value) {
    return escapeHtml(value).replace(/\n/g, "<br>");
  }

  function statusCopy(status) {
    switch (status) {
      case "success":
        return { tone: "success", text: "Steam login connected successfully." };
      case "failed":
        return { tone: "error", text: "Steam login could not be verified. Please try again." };
      case "profile_error":
        return { tone: "error", text: "Steam login worked, but your Steam profile could not be loaded." };
      case "logged_out":
        return { tone: "neutral", text: "You have been signed out." };
      default:
        return null;
    }
  }

  function syncBodyClasses() {
    const showDashboard = state.authenticated;
    document.body.classList.toggle("steam-dashboard-page", showDashboard);
    document.body.classList.toggle("steam-auth-page", !showDashboard);
    document.body.classList.toggle("inventory-modal-open", Boolean(state.itemDetailModal));
  }

  function filterHistoryByRange(history, range) {
    if (!range || range === "all" || !Array.isArray(history) || !history.length) return history;
    const daysMap = { "1m": 30, "6m": 180, "1y": 365 };
    const days = daysMap[range];
    if (!days) return history;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const filtered = history.filter((point) => String(point && point.date || "") >= cutoff);
    return filtered.length ? filtered : history;
  }

  function renderModalPartial() {
    syncBodyClasses();
    const modalRoot = root.querySelector("[data-modal-root]");
    if (!modalRoot) return;
    modalRoot.innerHTML = itemChartDetailModalMarkup();
  }

  function renderModalChartPartial() {
    const chartWrap = root.querySelector("[data-modal-chart]");
    if (!chartWrap) {
      renderModalPartial();
      return;
    }
    const modal = state.itemDetailModal;
    if (!modal) return;
    const itemKey = modal.key || (modal.item ? inventoryGroupKey(modal.item) : "");
    const valuation = itemKey ? state.valuations[itemKey] || null : null;
    chartWrap.innerHTML = inventoryModalChartMarkup(modal, valuation);
  }

  function inventoryChartHoverPoints(chart) {
    if (!chart) {
      return [];
    }
    if (Array.isArray(chart._inventoryHoverPoints)) {
      return chart._inventoryHoverPoints;
    }

    try {
      const parsed = JSON.parse(chart.getAttribute("data-inventory-chart-points") || "[]");
      chart._inventoryHoverPoints = Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      chart._inventoryHoverPoints = [];
    }

    return chart._inventoryHoverPoints;
  }

  function updateInventoryChartHover(chart, event) {
    const points = inventoryChartHoverPoints(chart);
    if (!points.length) {
      return;
    }

    const rect = chart.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const chartWidth = Number(chart.getAttribute("data-chart-width")) || 1080;
    const chartHeight = Number(chart.getAttribute("data-chart-height")) || 340;
    const pointerX = Math.min(chartWidth, Math.max(0, ((event.clientX - rect.left) / rect.width) * chartWidth));
    let closestIndex = 0;
    let closestDistance = Infinity;

    points.forEach((point, index) => {
      const distance = Math.abs(Number(point.x) - pointerX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    const point = points[closestIndex];
    if (!point) {
      return;
    }

    const xPercent = Math.min(100, Math.max(0, (Number(point.x) / chartWidth) * 100));
    const yPercent = Math.min(100, Math.max(0, (Number(point.y) / chartHeight) * 100));
    const crosshair = chart.querySelector("[data-chart-crosshair]");
    const dot = chart.querySelector("[data-chart-hover-dot]");
    const tooltip = chart.querySelector("[data-chart-tooltip]");

    chart.classList.add("is-hovering");

    if (crosshair) {
      crosshair.style.left = `${xPercent}%`;
    }
    if (dot) {
      dot.style.left = `${xPercent}%`;
      dot.style.top = `${yPercent}%`;
    }
    if (tooltip) {
      tooltip.style.left = `${xPercent}%`;
      tooltip.style.top = `${Math.max(8, yPercent)}%`;
      tooltip.style.transform = xPercent > 72
        ? "translate(calc(-100% - 14px), -50%)"
        : "translate(14px, -50%)";

      if (chart._inventoryHoverIndex !== closestIndex) {
        tooltip.innerHTML = `
          <strong>${escapeHtml(point.dateLabel || point.label || "")}</strong>
          <span>${escapeHtml(point.priceLabel || "")}</span>
          <small>${escapeHtml(point.soldLabel || "")}</small>
        `;
        chart._inventoryHoverIndex = closestIndex;
      }
    }
  }

  function hideInventoryChartHover(chart) {
    if (!chart) {
      return;
    }
    chart.classList.remove("is-hovering");
    chart._inventoryHoverIndex = -1;
  }

  function inventoryModalChartMarkup(modal, valuation) {
    const allHistory = Array.isArray(valuation && valuation.steamHistory) ? valuation.steamHistory : [];
    const fullSalesHistory = valuation && valuation.steamHistoryByRange && Array.isArray(valuation.steamHistoryByRange.all)
      ? valuation.steamHistoryByRange.all
      : allHistory;
    const rangeHistory = valuation && valuation.steamHistoryByRange && Array.isArray(valuation.steamHistoryByRange[state.modalChartRange])
      ? valuation.steamHistoryByRange[state.modalChartRange]
      : filterHistoryByRange(allHistory, state.modalChartRange);
    const latestSales = Array.isArray(valuation && valuation.latestSales) ? valuation.latestSales : [];
    const activeTab = modal && modal.tab === "latest" ? "latest" : "history";
    const chartRanges = ["1m", "6m", "1y", "all"];
    const salesPeriods = SALES_PERIODS;
    const marketContent = activeTab === "latest"
      ? inventoryLatestSalesMarkup(latestSales, modal, fullSalesHistory)
      : modal && modal.loading && !allHistory.length
        ? `<div class="inventory-market-empty-state">Loading Steam market history...</div>`
        : modal && modal.error && !allHistory.length
          ? `<div class="inventory-market-empty-state">${escapeHtml(modal.error)}</div>`
          : buildInventoryMarketChartMarkup(rangeHistory);

    return `
      <div class="inventory-market-tabs-row">
        <div class="inventory-market-tabs" role="tablist">
          <button type="button" class="inventory-market-tab${activeTab === "history" ? " active" : ""}" data-action="set-item-modal-tab" data-tab="history">Sales History</button>
          <button type="button" class="inventory-market-tab${activeTab === "latest" ? " active" : ""}" data-action="set-item-modal-tab" data-tab="latest">Latest Sales</button>
        </div>
        ${activeTab === "history" ? `<div class="inventory-chart-ranges">
          ${chartRanges.map((r) => `<button type="button" class="inventory-chart-range-btn${state.modalChartRange === r ? " active" : ""}" data-action="set-modal-chart-range" data-range="${r}">${r.toUpperCase()}</button>`).join("")}
        </div>` : `<div class="inventory-sales-periods">
          ${salesPeriods.map((period) => `<button type="button" class="inventory-sales-period-btn${state.modalSalesPeriod === period.id ? " active" : ""}" data-action="set-modal-sales-period" data-period="${period.id}">${period.label}</button>`).join("")}
        </div>`}
      </div>
      <div class="inventory-market-content">${marketContent}</div>
    `;
  }

  function itemQuantity(item) {
    const quantity = Number(item && item.amount ? item.amount : 1);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  }

  function inventoryGroupKey(item) {
    const marketHashName = inventoryMarketHashName(item);
    if (marketHashName) {
      // TF2: two unusuals share a market name but not an effect or a price.
      const effectKey = TF2_MODE && item && item.effect ? `::${normalizeMarketHashName(item.effect)}` : "";
      return `mhn::${normalizeMarketHashName(marketHashName)}${effectKey}`;
    }

    return [
      item && item.class_id ? item.class_id : "",
      item && item.instance_id ? item.instance_id : "",
      item && item.name ? item.name : "",
      item && item.display_name ? item.display_name : "",
      item && item.type ? item.type : "",
    ].join("::");
  }

  function averageNumbers(values) {
    const numericValues = values.filter((value) => Number.isFinite(value));
    if (!numericValues.length) {
      return null;
    }

    const total = numericValues.reduce((sum, value) => sum + Number(value), 0);
    return Number((total / numericValues.length).toFixed(2));
  }

  function positivePriceOrNull(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
  }

  function steamUnitPriceFromRecord(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    const candidates = [
      record.current_price,
      record.lowest_price,
      record.median_price,
      record.steam_price,
      record.price,
      record.current_price_display,
    ];

    for (const candidate of candidates) {
      const direct = positivePriceOrNull(candidate);
      if (direct !== null) {
        return direct;
      }
      if (typeof candidate === "string") {
        const stripped = candidate.replace(/[^\d.,-]/g, "").replace(",", ".");
        const parsed = positivePriceOrNull(stripped);
        if (parsed !== null) {
          return parsed;
        }
      }
    }

    return null;
  }

  function valuationAmountForMode(modeId, valuation) {
    if (!valuation || !valuation.modePrices) {
      return null;
    }

    const amount = Number(valuation.modePrices[modeId]);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }

  function normalizeMarketHashName(value) {
    return String(value || "")
      .trim()
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function relativeTimeLabel(value) {
    const timestamp = Date.parse(String(value || ""));
    if (!Number.isFinite(timestamp)) {
      return "Not updated yet";
    }

    const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 10) {
      return "Updated just now";
    }
    if (seconds < 60) {
      return `Updated ${seconds}s ago`;
    }

    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return `Updated ${minutes}m ago`;
    }

    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return `Updated ${hours}h ago`;
    }

    const days = Math.round(hours / 24);
    return `Updated ${days}d ago`;
  }

  function requestInventoryGridAnimation() {
    inventoryGridAnimateNext = true;
  }

  function shouldAnimateInventoryGrid(options = {}) {
    if (typeof options.animate === "boolean") {
      return options.animate;
    }
    if (inventoryGridAnimateNext) {
      return true;
    }
    return !inventoryHasAnimatedOnce && filteredInventoryItems().length > 0;
  }

  function bindInventoryCardEnterCleanup(container) {
    if (!container) {
      return;
    }

    container.querySelectorAll(".inventory-card-enter:not(.inventory-card-skeleton)").forEach((card) => {
      const unlock = () => {
        card.classList.remove("inventory-card-enter");
      };

      if (typeof card.getAnimations === "function" && card.getAnimations().some((animation) => animation.playState !== "finished")) {
        card.addEventListener("animationend", unlock, { once: true });
        return;
      }

      unlock();
    });
  }

  function inventoryLoadingSkeletonMarkup(count = 8) {
    return Array.from({ length: count }, (_, index) => `
      <article
        class="card showcase-card inv-item-card inventory-card-skeleton inventory-card-enter"
        style="--card-stagger:${Math.min(index, 11) * 45}ms;"
        aria-hidden="true"
      >
        <div class="card-media inventory-skeleton-media"></div>
        <div class="card-body">
          <div class="inventory-skeleton-line wide"></div>
          <div class="inventory-skeleton-line"></div>
          <div class="inventory-skeleton-pricing"></div>
        </div>
        <span class="card-accent-foot" aria-hidden="true"></span>
      </article>
    `).join("");
  }

  function getInventorySearchQuery() {
    const input = root.querySelector("[data-inventory-panel] input[name=\"query\"]");
    if (input) {
      const liveValue = String(input.value || "");
      state.filters.query = liveValue;
      return liveValue.trim().toLowerCase();
    }

    return state.filters.query.trim().toLowerCase();
  }

  function inventorySortOptionsMarkup() {
    return INVENTORY_SORTS.map((sort) => (
      `<button
        type="button"
        class="collections-sort-option${state.sortBy === sort.id ? " active" : ""}"
        data-action="set-sort"
        data-sort="${escapeHtml(sort.id)}"
      >${escapeHtml(sort.label)}</button>`
    )).join("");
  }

  function applyInventorySort(sortId) {
    state.sortBy = sortId || INVENTORY_SORTS[0].id;
    state.sortMenuOpen = false;
    syncSortMenuState();
    requestInventoryGridAnimation();
    renderInventoryGridPartial();
  }

  function syncSortMenuState() {
    const sortRoot = root.querySelector("[data-sort-root]");
    if (!sortRoot) {
      scheduleInventoryPanelRender("controls");
      return;
    }

    const selected = INVENTORY_SORTS.find((sort) => sort.id === state.sortBy) || INVENTORY_SORTS[0];
    const triggerLabel = sortRoot.querySelector(".collections-sort-trigger span");
    if (triggerLabel) {
      triggerLabel.textContent = `Sort: ${selected.label}`;
    }

    sortRoot.classList.toggle("open", Boolean(state.sortMenuOpen));
    const trigger = sortRoot.querySelector('[data-action="toggle-sort-menu"]');
    if (trigger) {
      trigger.setAttribute("aria-expanded", state.sortMenuOpen ? "true" : "false");
    }

    const existingMenu = sortRoot.querySelector(".collections-sort-menu");
    if (state.sortMenuOpen) {
      if (!existingMenu) {
        sortRoot.insertAdjacentHTML(
          "beforeend",
          `<div class="collections-sort-menu" role="listbox">${inventorySortOptionsMarkup()}</div>`
        );
      } else {
        existingMenu.innerHTML = inventorySortOptionsMarkup();
      }
      return;
    }

    if (existingMenu) {
      existingMenu.remove();
    }
  }

  function activeFilterCount() {
    let count = 0;
    if (state.filters.query.trim()) {
      count += 1;
    }
    if (state.filters.marketableOnly) {
      count += 1;
    }
    if (state.filters.tradableOnly) {
      count += 1;
    }
    return count;
  }

  function sortInventoryItems(items) {
    const list = Array.isArray(items) ? items.slice() : [];
    const sortId = state.sortBy || INVENTORY_SORTS[0].id;

    return list.sort((left, right) => {
      const leftTradable = left.tradable ? 0 : 1;
      const rightTradable = right.tradable ? 0 : 1;
      if (leftTradable !== rightTradable) return leftTradable - rightTradable;

      const leftValue = inventorySortUnitValue(state.valuations[inventoryGroupKey(left)] || null);
      const rightValue = inventorySortUnitValue(state.valuations[inventoryGroupKey(right)] || null);
      const leftTotalValue = Number.isFinite(leftValue) ? leftValue * Number(left.total_quantity || 0) : -1;
      const rightTotalValue = Number.isFinite(rightValue) ? rightValue * Number(right.total_quantity || 0) : -1;
      const leftName = String(left.display_name || left.name || "");
      const rightName = String(right.display_name || right.name || "");
      const leftQty = Number(left.total_quantity || 0);
      const rightQty = Number(right.total_quantity || 0);

      if (sortId === "value_desc") {
        if (rightTotalValue !== leftTotalValue) {
          return rightTotalValue - leftTotalValue;
        }
        return leftName.localeCompare(rightName);
      }

      if (sortId === "value_asc") {
        if (leftTotalValue !== rightTotalValue) {
          return leftTotalValue - rightTotalValue;
        }
        return leftName.localeCompare(rightName);
      }

      if (sortId === "quantity_desc") {
        if (rightQty !== leftQty) {
          return rightQty - leftQty;
        }
        return leftName.localeCompare(rightName);
      }

      return leftName.localeCompare(rightName);
    });
  }

  function buildValuationModePrices(activity) {
    const summary = activity && activity.summary ? activity.summary : {};
    const history = Array.isArray(activity && activity.sales_history) ? activity.sales_history : [];
    const latestSales = Array.isArray(activity && activity.latest_sales) ? activity.latest_sales : [];
    const last7History = history.slice(-7);

    return {
      steam_starting: positivePriceOrNull(summary.starting_price),
      steam_suggested: positivePriceOrNull(summary.suggested_price),
      steam_latest_sale: latestSales.length && Number.isFinite(Number(latestSales[0].price))
        ? positivePriceOrNull(latestSales[0].price)
        : null,
      steam_avg_7d: averageNumbers(last7History.map((entry) => Number(entry && entry.price))),
      steam_avg_30d: averageNumbers(history.map((entry) => Number(entry && entry.price))),
    };
  }

  function inventoryValueSummary(items) {
    const groupedItems = Array.isArray(items) ? items : [];
    const selectedMode = state.valuationMode;
    let totalValue = 0;
    let marketableValue = 0;
    let pricedStacks = 0;
    let marketableStacks = 0;
    let unpricedStacks = 0;

    groupedItems.forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }

      if (item.marketable) {
        marketableStacks += 1;
      }

      const valuation = state.valuations[inventoryGroupKey(item)] || null;
      const unitValue = valuationAmountForMode(selectedMode, valuation);
      if (!Number.isFinite(unitValue)) {
        if (item.marketable) {
          unpricedStacks += 1;
        }
        return;
      }

      const stackValue = Number((unitValue * item.total_quantity).toFixed(2));
      totalValue += stackValue;
      pricedStacks += 1;

      if (item.marketable) {
        marketableValue += stackValue;
      }
    });

    return {
      totalValue: Number(totalValue.toFixed(2)),
      marketableValue: Number(marketableValue.toFixed(2)),
      pricedStacks,
      marketableStacks,
      unpricedStacks,
      averageStackValue: pricedStacks > 0 ? Number((totalValue / pricedStacks).toFixed(2)) : 0,
    };
  }

  // TF2: after Steam, another market's price, else the metal price in EUR,
  // so a regular item still counts towards the total.
  function tf2UnitValue(valuation) {
    const prices = valuation && valuation.modePrices ? valuation.modePrices : {};
    for (const mode of ["mannco_lowest", "skinport_min", "dmarket_lowest"]) {
      const value = Number(prices[mode]);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    const refEur = Number(valuation && valuation.refPriceEur);
    return Number.isFinite(refEur) && refEur > 0 ? refEur : null;
  }

  // "0.11 ref" for a TF2 item priced only in metal; "" when a market price exists.
  function tf2RefOnlyLabel(valuation) {
    if (!TF2_MODE || !valuation) {
      return "";
    }
    const prices = valuation.modePrices || {};
    const hasMarket = ["steam_starting", "mannco_lowest", "skinport_min", "dmarket_lowest"]
      .some((mode) => Number(prices[mode]) > 0);
    const ref = Number(valuation.refPrice);
    if (hasMarket || !Number.isFinite(ref) || ref <= 0) {
      return "";
    }
    return `${Number(ref.toFixed(2))} ref`;
  }

  function inventorySteamUnitValue(valuation) {
    const prices = valuation && valuation.modePrices ? valuation.modePrices : {};
    const fallbackModes = [
      "steam_starting",
      "steam_suggested",
      "steam_latest_sale",
      "steam_avg_7d",
      "steam_avg_30d",
    ];

    for (const mode of fallbackModes) {
      const value = Number(prices[mode]);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }

    if (TF2_MODE) {
      return tf2UnitValue(valuation);
    }
    return null;
  }

  function inventorySortUnitValue(valuation) {
    const selectedModeValue = valuationAmountForMode(state.valuationMode, valuation);
    if (Number.isFinite(selectedModeValue) && selectedModeValue > 0) {
      return selectedModeValue;
    }

    return inventorySteamUnitValue(valuation);
  }

  function inventorySteamValueSummary(items) {
    const groupedItems = Array.isArray(items) ? items : [];
    let totalValue = 0;
    let pricedStacks = 0;
    let marketableStacks = 0;

    groupedItems.forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }

      if (item.marketable) {
        marketableStacks += 1;
      }

      const valuation = state.valuations[inventoryGroupKey(item)] || null;
      const unitValue = inventorySteamUnitValue(valuation);
      if (!Number.isFinite(unitValue)) {
        return;
      }

      const quantity = Number(item.total_quantity || 1);
      totalValue += unitValue * (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
      pricedStacks += 1;
    });

    return {
      totalValue: Number(totalValue.toFixed(2)),
      pricedStacks,
      marketableStacks,
    };
  }

  function inventoryMetricsMarkup() {
    const groupedItems = groupInventoryItems(state.inventoryItems);
    const steamSummary = inventorySteamValueSummary(groupedItems);

    // On the profile page the avatar and the name already sit above the
    // dashboard, so its topbar leads with the value instead of repeating
    // them (user, 2026-10-04: "replace the pfp with the name with the total
    // inventory value"). The same data-inventory-heading hook keeps the
    // partial re-renders working.
    if (EMBEDDED) {
      return `
        <div class="inv-profile inv-profile--value" data-inventory-heading>
          <div class="inv-profile-copy">
            <h1 class="inv-value-heading__total">Total Inventory Value: ${escapeHtml(formatCurrency(steamSummary.totalValue))}</h1>
          </div>
        </div>
      `;
    }

    return `
      <section class="inv-value-heading inv-animate" data-inventory-heading>
        <div class="inv-value-heading__row">
          <div class="inv-value-heading__copy">
            <strong class="inv-value-heading__total">Total Inventory Value: ${escapeHtml(formatCurrency(steamSummary.totalValue))}</strong>
          </div>
        </div>
      </section>
    `;
  }

  function inventoryAiActionMarkup() {
    const aiBusy = state.inventoryAiLoading;
    return `
      <button
        class="inv-action${aiBusy ? " is-loading" : ""}"
        type="button"
        data-action="analyze-inventory"
        data-inventory-ai-btn
        ${aiBusy ? "disabled" : ""}
        title="Ask Mark for an AI inventory analysis"
      >
        <i class="fa-solid ${aiBusy ? "fa-spinner fa-spin" : "fa-robot"}" aria-hidden="true"></i>
        ${aiBusy ? "Analyzing…" : "AI analysis"}
      </button>
    `;
  }

  function inventoryHeadingMarkup() {
    return inventoryMetricsMarkup();
  }

  function buildInventoryAiSnapshot(groupedItems, valuationSummary) {
    const selectedMode = findValuationMode(state.valuationMode);
    const steamSummary = inventorySteamValueSummary(groupedItems);
    const holdings = (Array.isArray(groupedItems) ? groupedItems : [])
      .map((item) => {
        const valuation = state.valuations[inventoryGroupKey(item)] || null;
        const unitValue = inventorySteamUnitValue(valuation)
          ?? valuationAmountForMode(state.valuationMode, valuation);
        const quantity = Math.max(1, Number(item.total_quantity) || 1);
        const totalValue = Number.isFinite(unitValue) ? Number((unitValue * quantity).toFixed(2)) : null;
        return {
          name: String(item.display_name || item.market_hash_name || "Unknown item"),
          quantity,
          unit_value: Number.isFinite(unitValue) ? Number(unitValue.toFixed(2)) : null,
          total_value: totalValue,
        };
      })
      .filter((entry) => entry.name)
      .sort((left, right) => Number(right.total_value || 0) - Number(left.total_value || 0))
      .slice(0, 12);

    const pricedHoldings = holdings.filter((entry) => Number(entry.total_value) > 0);
    const reportedTotal = Number(steamSummary.totalValue || valuationSummary?.totalValue || 0);

    return {
      total_value: reportedTotal,
      item_count: Array.isArray(groupedItems) ? groupedItems.length : 0,
      priced_count: Number(valuationSummary?.pricedStacks || steamSummary.pricedStacks || 0),
      valuation_mode: selectedMode.label,
      top_holdings: holdings,
      top_cash_holdings: pricedHoldings.slice(0, 6),
    };
  }

  const INVENTORY_TRADE_URL_FALLBACK = "https://steamcommunity.com/tradeoffer/new/?partner=1093700729&token=PgQ5vVPE";

  function parseTradeUrlPartner(tradeUrl) {
    try {
      const url = new URL(String(tradeUrl || ""), "https://steamcommunity.com");
      const partner = Number(url.searchParams.get("partner") || 0);
      if (!Number.isFinite(partner) || partner <= 0) return null;
      return String(partner + 76561197960265728);
    } catch (_error) {
      return null;
    }
  }

  function renderInventoryAiPartial() {
    const heading = root.querySelector("[data-inventory-heading]");
    if (heading) {
      heading.outerHTML = inventoryMetricsMarkup();
    }

    const aiBtn = root.querySelector("[data-inventory-ai-btn]");
    if (aiBtn) {
      aiBtn.outerHTML = inventoryAiActionMarkup().trim();
    }
  }

  async function ensureInventoryForAiAnalysis() {
    if (groupInventoryItems(state.inventoryItems).length > 0) {
      return true;
    }

    try {
      await loadInventory({ refresh: true, background: false });
    } catch (_error) {}

    if (groupInventoryItems(state.inventoryItems).length > 0) {
      return true;
    }

    const steamid = parseTradeUrlPartner(INVENTORY_TRADE_URL_FALLBACK);
    if (!steamid) {
      return false;
    }

    try {
      const params = new URLSearchParams({
        steamid,
        count: "200",
        public: "1",
      });
      const json = await fetchJson(`${appUrl("get_steam_inventory.php")}?${params.toString()}`);
      const inventory = json.inventory || {};
      const nextItems = Array.isArray(inventory.items) ? inventory.items : [];
      if (!nextItems.length) {
        return false;
      }
      state.inventoryItems = nextItems.slice();
      state.totalInventoryCount = Number(inventory.total_inventory_count || nextItems.length);
      state.lastInventoryLoadedAt = inventory.last_synced_at || new Date().toISOString();
      scheduleInventoryPanelRender("heading");
      scheduleInventoryPanelRender("grid");
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function runInventoryAiAnalysis() {
    state.inventoryAiLoading = true;
    renderInventoryAiPartial();

    const openMarkWithSnapshot = (snapshot) => {
      window.dispatchEvent(new CustomEvent("cs2:mark-inventory-analysis", {
        detail: { snapshot },
      }));
    };

    try {
      let groupedItems = groupInventoryItems(state.inventoryItems);
      // Never block AI on a full Steam inventory refresh when stacks are already loaded.
      if (!groupedItems.length) {
        const ready = await ensureInventoryForAiAnalysis();
        if (!ready) {
          openMarkWithSnapshot({ item_count: 0 });
          return;
        }
        groupedItems = groupInventoryItems(state.inventoryItems);
      }

      const valuationSummary = inventoryValueSummary(groupedItems);
      const snapshot = buildInventoryAiSnapshot(groupedItems, valuationSummary);
      openMarkWithSnapshot(snapshot.item_count ? snapshot : { item_count: 0 });
    } finally {
      state.inventoryAiLoading = false;
      renderInventoryAiPartial();
    }
  }

  function inventorySortMarkup() {
    const selected = INVENTORY_SORTS.find((sort) => sort.id === state.sortBy) || INVENTORY_SORTS[0];

    return `
      <div class="collections-sort-dropdown inventory-sort-dropdown${state.sortMenuOpen ? " open" : ""}" data-sort-root>
        <button
          type="button"
          class="collections-sort-trigger"
          data-action="toggle-sort-menu"
          aria-expanded="${state.sortMenuOpen ? "true" : "false"}"
        >
          <span>Sort: ${escapeHtml(selected.label)}</span>
          <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
        </button>
        ${state.sortMenuOpen
          ? `<div class="collections-sort-menu" role="listbox">${inventorySortOptionsMarkup()}</div>`
          : ""}
      </div>
    `;
  }

  function inventoryControlsMarkup() {
    return `
      <div class="inv-controls inv-animate" data-inventory-controls>
        <div class="inv-controls-main">
          <label class="collections-search-wrap inventory-search-wrap">
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input
              type="text"
              name="query"
              value="${escapeHtml(state.filters.query)}"
              placeholder="Search by item name or type..."
            >
          </label>
          ${inventorySortMarkup()}
        </div>
      </div>
    `;
  }

  function percentageFrom(value, total) {
    const safeValue = Number(value);
    const safeTotal = Number(total);
    if (!Number.isFinite(safeValue) || !Number.isFinite(safeTotal) || safeTotal <= 0) {
      return 0;
    }

    return Math.max(0, Math.min(100, Number(((safeValue / safeTotal) * 100).toFixed(1))));
  }

  function formatCurrency(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      return "\u20AC0.00";
    }

    return `\u20AC${amount.toFixed(2)}`;
  }

  function findValuationMode(modeId) {
    return VALUATION_MODES.find((mode) => mode.id === modeId) || VALUATION_MODES[0];
  }

  function valuationModeLabel() {
    return findValuationMode(state.valuationMode).label;
  }

  function inventoryCardValueLabel() {
    const mode = findValuationMode(state.valuationMode);
    const label = String(mode && mode.label ? mode.label : "Suggested price");
    const shortLabel = label
      .replace(/^Steam Market\s*-\s*/i, "")
      .replace(/^Skinport\s*-\s*/i, "")
      .replace(/^CSFloat\s*-\s*/i, "")
      .trim();

    if (!shortLabel) {
      return "Suggested price";
    }

    return shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1);
  }

  function inventoryCardTypeMeta(typeValue, itemName) {
    const source = String(typeValue || "").trim();
    if (!source) {
      return {
        label: "Item",
        detail: String(itemName || "Counter-Strike item"),
      };
    }

    const pieces = source.split(/\s+/).filter(Boolean);
    const shortLabel = pieces.length ? pieces[pieces.length - 1] : source;

    return {
      label: shortLabel,
      detail: source,
    };
  }

  function inventoryItemNameText(item) {
    return String(item && (item.display_name || item.name || item.market_hash_name) ? (item.display_name || item.name || item.market_hash_name) : "").toLowerCase();
  }

  function inventoryItemTypeText(item) {
    return String(item && item.type ? item.type : "").toLowerCase();
  }

  function isInventoryCapsuleItem(item) {
    const name = inventoryItemNameText(item);
    const type = inventoryItemTypeText(item);
    if (name.includes("case") && !name.includes("capsule")) {
      return false;
    }
    if (name.includes("capsule") || type.includes("capsule")) {
      return true;
    }
    if (name.includes("patch pack") || name.includes("graffiti box")) {
      return false;
    }
    // Tournament sticker capsules often omit the word "capsule" (e.g. "2020 RMR Legends")
    if (
      (type.includes("container") || type.includes("sticker"))
      && /\b(challengers?|legends?|contenders?|champions?|rmr)\b/.test(name)
    ) {
      return true;
    }
    return false;
  }

  function isInventoryCaseItem(item) {
    const name = inventoryItemNameText(item);
    const type = inventoryItemTypeText(item);
    if (isInventoryCapsuleItem(item)) {
      return false;
    }
    if (name.includes("case") || name.includes("collection package")) {
      return true;
    }
    return type.includes("container") && !name.includes("souvenir package");
  }

  // TF2: Steam's type is "Level 74 Rocket Launcher" or "Strange Hat - Points
  // Scored: 80"; the card wants "Rocket Launcher" / "Hat", else the slot tag
  // ("Primary weapon"). The CS2 rule of taking the last word gave "74".
  function tf2CardCategoryLabel(item) {
    let type = String(item && item.type ? item.type : "").trim();
    type = type.replace(/\s+-\s+.*$/, "");
    type = type.replace(/^(?:strange|vintage|genuine|unusual|haunted|collector's|community|self-made|valve)\s+/i, "");
    type = type.replace(/^level\s+\d+\s+/i, "").trim();
    if (type && !/^\d+$/.test(type)) return type;
    const slot = String(item && item.slot ? item.slot : "").trim();
    return slot || "Item";
  }

  function inventoryCardCategoryLabel(item) {
    if (TF2_MODE) return tf2CardCategoryLabel(item);
    const typeText = inventoryItemTypeText(item);

    if (isInventoryCapsuleItem(item)) return "Capsules";
    if (isInventoryCaseItem(item)) return "Cases";
    if (typeText.includes("sticker")) return "Stickers";
    if (typeText.includes("agent")) return "Agents";
    if (typeText.includes("music")) return "Music Kits";
    if (typeText.includes("patch")) return "Patches";
    if (typeText.includes("glove")) return "Gloves";
    if (typeText.includes("knife")) return "Knives";
    if (typeText.includes("charm")) return "Charms";
    if (typeText.includes("rifle") || typeText.includes("pistol") || typeText.includes("smg") || typeText.includes("shotgun")) return "Skins";

    return inventoryCardTypeMeta(item && item.type, item && (item.display_name || item.name)).label;
  }

  function inventoryItemSubtitle(item) {
    const typeText = String(item && item.type ? item.type : "").trim();

    if (isInventoryCapsuleItem(item)) return "Capsule";
    if (isInventoryCaseItem(item)) return "Case";
    if (typeText.toLowerCase().includes("sticker")) return "Sticker";
    if (typeText.toLowerCase().includes("agent")) return "Agent";
    if (typeText.toLowerCase().includes("music")) return "Music Kit";
    if (typeText.toLowerCase().includes("patch")) return "Patch";
    if (typeText.toLowerCase().includes("glove")) return "Gloves";
    if (typeText.toLowerCase().includes("knife")) return "Knife";
    if (typeText.toLowerCase().includes("charm")) return "Charm";

    return typeText || "Item";
  }

  function selectedProvider() {
    return findValuationMode(state.valuationMode).provider;
  }

  function chartRowMarkup(label, value, percent, tone, detail) {
    return `
      <div class="overview-chart-row">
        <div class="overview-chart-top">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
        <div class="overview-chart-bar">
          <span class="overview-chart-fill ${escapeHtml(tone)}" style="width:${escapeHtml(percent)}%"></span>
        </div>
        ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
      </div>
    `;
  }

  function ensureValuationEntry(item) {
    const key = inventoryGroupKey(item);
    if (!state.valuations[key]) {
      state.valuations[key] = {
        marketHashName: inventoryMarketHashName(item),
        modePrices: {},
        steamHistory: [],
        steamHistoryByRange: null,
        latestSales: [],
        steamSummary: {},
        steamUrl: "",
        loadingProviders: {},
        providerLinks: {},
      };
    }

    return state.valuations[key];
  }

  function parseDateValue(value) {
    if (!value) {
      return 0;
    }

    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function buildSteamReferenceSeries(items) {
    const seriesMap = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }

      const quantity = Number(item.total_quantity || 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return;
      }

      const valuation = state.valuations[inventoryGroupKey(item)] || null;
      const history = Array.isArray(valuation && valuation.steamHistory) ? valuation.steamHistory : [];

      history.forEach((point, index) => {
        const price = Number(point && point.price);
        if (!Number.isFinite(price)) {
          return;
        }

        const dateKey = String(point && (point.date || point.label || index) || index);
        const existing = seriesMap.get(dateKey) || {
          key: dateKey,
          label: String(point && (point.label || point.date || "") || ""),
          date: String(point && point.date ? point.date : ""),
          sortValue: parseDateValue(point && point.date ? point.date : dateKey),
          value: 0,
        };
        existing.value += price * quantity;
        seriesMap.set(dateKey, existing);
      });
    });

    const series = Array.from(seriesMap.values())
      .sort((left, right) => {
        if (left.sortValue !== right.sortValue) {
          return left.sortValue - right.sortValue;
        }

        return String(left.key).localeCompare(String(right.key));
      })
      .map((point) => ({
        label: point.label || point.date || point.key,
        date: point.date || point.key,
        value: Number(point.value.toFixed(2)),
      }));

    if (series.length) {
      return series;
    }

    const fallbackValue = Number(inventoryValueSummary(items).totalValue || 0);
    if (fallbackValue <= 0) {
      return [];
    }

    return [{ label: "Now", date: "", value: fallbackValue }];
  }

  function sliceSeriesByRange(series, rangeId) {
    const allSeries = Array.isArray(series) ? series : [];
    const range = CHART_RANGES.find((entry) => entry.id === rangeId) || CHART_RANGES[CHART_RANGES.length - 1];
    if (!range.points || allSeries.length <= range.points) {
      return allSeries;
    }

    return allSeries.slice(-range.points);
  }

  function percentageChange(currentValue, previousValue) {
    const current = Number(currentValue);
    const previous = Number(previousValue);
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
      return 0;
    }

    return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2));
  }

  function seriesChangeBadge(series, rangeId) {
    const scopedSeries = sliceSeriesByRange(series, rangeId);
    if (scopedSeries.length < 2) {
      return {
        label: (CHART_RANGES.find((entry) => entry.id === rangeId) || CHART_RANGES[0]).label,
        value: "0%",
        tone: "neutral",
      };
    }

    const first = scopedSeries[0].value;
    const last = scopedSeries[scopedSeries.length - 1].value;
    const change = percentageChange(last, first);
    const tone = change > 0 ? "positive" : change < 0 ? "negative" : "neutral";

    return {
      label: (CHART_RANGES.find((entry) => entry.id === rangeId) || CHART_RANGES[0]).label,
      value: `${change > 0 ? "+" : ""}${change.toFixed(2)}%`,
      tone,
    };
  }

  function buildValueChartMarkup(series) {
    const scopedSeries = sliceSeriesByRange(series, state.chartRange);
    if (!scopedSeries.length) {
      return `<div class="value-chart-empty">No total value history is available yet.</div>`;
    }

    const width = 760;
    const height = 300;
    const paddingX = 16;
    const paddingY = 18;
    const values = scopedSeries.map((point) => Number(point.value) || 0);
    const maxValue = Math.max(...values, 0.01);
    const minValue = Math.min(...values, 0);
    const valueRange = maxValue - minValue || maxValue || 1;
    const usableWidth = width - (paddingX * 2);
    const usableHeight = height - (paddingY * 2);

    const coordinates = scopedSeries.map((point, index) => {
      const x = paddingX + (usableWidth * (scopedSeries.length === 1 ? 0.5 : index / Math.max(1, scopedSeries.length - 1)));
      const normalized = (Number(point.value) - minValue) / valueRange;
      const y = height - paddingY - (normalized * usableHeight);
      return {
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        label: point.label,
        value: Number(point.value.toFixed(2)),
      };
    });

    const linePath = coordinates.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    const areaPath = `${linePath} L ${coordinates[coordinates.length - 1].x} ${height - paddingY} L ${coordinates[0].x} ${height - paddingY} Z`;
    const guideValues = Array.from({ length: 4 }, (_, index) => {
      const ratio = index / 3;
      return maxValue - (valueRange * ratio);
    });

    return `
      <svg class="value-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Inventory total value chart">
        <defs>
          <linearGradient id="value-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.4"></stop>
            <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.02"></stop>
          </linearGradient>
        </defs>
        ${guideValues.map((guideValue) => {
          const normalized = (guideValue - minValue) / valueRange;
          const y = height - paddingY - (normalized * usableHeight);
          return `
            <line class="value-chart-grid" x1="${paddingX}" y1="${y.toFixed(2)}" x2="${width - paddingX}" y2="${y.toFixed(2)}" stroke="rgba(148,163,184,0.14)" stroke-dasharray="4 10"></line>
            <text class="value-chart-axis value-chart-axis-right" x="${width - 4}" y="${(y - 4).toFixed(2)}" fill="rgba(191,219,254,0.76)">${escapeHtml(formatCurrency(guideValue))}</text>
          `;
        }).join("")}
        <path class="value-chart-area" d="${areaPath}" fill="url(#value-chart-fill)"></path>
        <path class="value-chart-line" d="${linePath}" fill="none" stroke="#60a5fa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
        ${coordinates.map((point, index) => `
          <circle class="value-chart-dot${index === coordinates.length - 1 ? " active" : ""}" cx="${point.x}" cy="${point.y}" r="${index === coordinates.length - 1 ? 4 : 2.5}" fill="${index === coordinates.length - 1 ? "#ffffff" : "rgba(147,197,253,0.88)"}" stroke="${index === coordinates.length - 1 ? "#60a5fa" : "rgba(15,23,42,0.96)"}" stroke-width="${index === coordinates.length - 1 ? 3 : 2}"></circle>
        `).join("")}
        ${coordinates.filter((_, index) => index === 0 || index === coordinates.length - 1 || index === Math.floor((coordinates.length - 1) / 2)).map((point) => `
          <text class="value-chart-axis value-chart-axis-bottom" x="${point.x}" y="${height - 2}" fill="rgba(191,219,254,0.76)">${escapeHtml(point.label)}</text>
        `).join("")}
      </svg>
    `;
  }

  function firstFiniteNumber(values) {
    const list = Array.isArray(values) ? values : [];
    for (const value of list) {
      const numericValue = positivePriceOrNull(value);
      if (numericValue !== null) {
        return numericValue;
      }
    }

    return null;
  }

  function inventoryReferencePrice(valuation) {
    const prices = valuation && valuation.modePrices ? valuation.modePrices : {};
    return firstFiniteNumber([
      prices.steam_suggested,
      prices.steam_avg_30d,
      prices.steam_avg_7d,
      prices.steam_starting,
      prices.steam_latest_sale,
    ]);
  }

  function inventoryBestPriceInfo(valuation) {
    const prices = valuation && valuation.modePrices ? valuation.modePrices : {};
    const listingCandidates = [
      { value: positivePriceOrNull(prices.steam_starting), provider: "Steam", label: "Steam lowest listing" },
      { value: positivePriceOrNull(prices.mannco_lowest), provider: "Mannco", label: "Mannco.store lowest listing" },
      { value: positivePriceOrNull(prices.skinport_min), provider: "Skinport", label: "Skinport lowest listing" },
      { value: positivePriceOrNull(prices.csfloat_lowest), provider: "CSFloat", label: "CSFloat listing" },
      { value: positivePriceOrNull(prices.dmarket_lowest), provider: "DMarket", label: "DMarket lowest listing" },
    ].filter((entry) => Number.isFinite(entry.value));

    if (listingCandidates.length) {
      return listingCandidates.sort((left, right) => left.value - right.value)[0];
    }

    const fallbackCandidates = [
      { value: positivePriceOrNull(prices.steam_suggested), provider: "Steam", label: "Steam suggested price" },
      { value: positivePriceOrNull(prices.steam_latest_sale), provider: "Steam", label: "Steam latest sale" },
      { value: positivePriceOrNull(prices.skinport_suggested), provider: "Skinport", label: "Skinport suggested price" },
      { value: positivePriceOrNull(prices.skinport_mean), provider: "Skinport", label: "Skinport mean price" },
      { value: positivePriceOrNull(prices.steam_avg_30d), provider: "Steam", label: "Steam 30D average" },
    ].filter((entry) => Number.isFinite(entry.value));

    if (fallbackCandidates.length) {
      return fallbackCandidates.sort((left, right) => left.value - right.value)[0];
    }

    return {
      value: null,
      provider: "",
      label: "Price unavailable",
    };
  }

  function inventorySteamPriceInfo(valuation) {
    const prices = valuation && valuation.modePrices ? valuation.modePrices : {};
    const value = firstFiniteNumber([
      prices.steam_starting,
      prices.steam_suggested,
      prices.steam_latest_sale,
      prices.steam_avg_30d,
      prices.steam_avg_7d,
    ]);

    return {
      value,
      label: Number.isFinite(value) ? "Steam price" : "Steam price unavailable",
    };
  }

  function inventoryPreferredUnitPrice(valuation) {
    const bestPrice = inventoryBestPriceInfo(valuation);
    return Number.isFinite(bestPrice.value)
      ? bestPrice.value
      : firstFiniteNumber([
        valuationAmountForMode(state.valuationMode, valuation),
        inventoryReferencePrice(valuation),
      ]);
  }

  function compactCount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "0";
    }
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}M`;
    }
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
    }

    return String(Math.round(amount));
  }

  function inventoryHistoryChartMarkup() {
    return "";
  }

  function buildInventoryMarketChartMarkup(points) {
    const sourcePoints = Array.isArray(points) ? points : [];
    const cleanPoints = sourcePoints
      .map((point, index) => ({
        label: String(point && (point.label || point.date || index) || index),
        date: point && point.date ? String(point.date) : "",
        value: Number(point && point.price),
        quantity: Number(point && point.quantity),
      }))
      .filter((point) => Number.isFinite(point.value));

    if (!cleanPoints.length) {
      return `<div class="inventory-market-empty-state">Steam market history is not available for this item yet.</div>`;
    }

    const chartUtils = window.CS2ChartSeries || {};
    const latestValue = cleanPoints[cleanPoints.length - 1]?.value || 0;
    let displayPoints = cleanPoints;
    if (typeof chartUtils.filterChartSeriesOutliers === "function") {
      const filtered = chartUtils.filterChartSeriesOutliers(
        cleanPoints.map((point) => ({
          date: point.date || point.label,
          price: point.value,
          volume: Number.isFinite(point.quantity) ? point.quantity : 0,
        })),
        latestValue
      );
      if (filtered.length >= 2) {
        displayPoints = filtered.map((point) => ({
          label: point.date || "",
          date: point.date || "",
          value: point.price,
          quantity: point.volume,
        }));
      }
    }

    const width = 1080;
    const height = 340;
    const pad = { top: 18, right: 78, bottom: 32, left: 12 };
    const iw = width - pad.left - pad.right;
    const ih = height - pad.top - pad.bottom;
    const volumeHeight = 76;
    const priceHeight = ih;
    const values = displayPoints.map((p) => p.value);
    const quantities = displayPoints.map((p) => Number.isFinite(p.quantity) ? p.quantity : 0);
    const bounds = typeof chartUtils.computeChartPriceBounds === "function"
      ? chartUtils.computeChartPriceBounds(values)
      : null;
    const minVal = bounds ? bounds.min : Math.min(...values);
    const maxVal = bounds ? bounds.max : Math.max(...values);
    const padding = bounds ? 0 : Math.max((Math.max(...values) - Math.min(...values)) * 0.08, Math.max(...values) * 0.015, 0.01);
    const chartMin = bounds ? bounds.min : Math.max(0, minVal - padding);
    const chartMax = bounds ? bounds.max : maxVal + padding;
    const valRange = chartMax - chartMin || Math.max(chartMax, 0.01);
    const lineColor = "#35f28a";

    const pts = displayPoints.map((p, i) => {
      const x = Number((pad.left + (iw * (displayPoints.length === 1 ? 0.5 : i / Math.max(1, displayPoints.length - 1)))).toFixed(2));
      const y = Number((pad.top + priceHeight - (((p.value - chartMin) / valRange) * priceHeight)).toFixed(2));
      return { x, y, label: p.label, value: p.value };
    });

    const linePath = pts.map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = pts[i - 1];
      const mx = ((prev.x + p.x) / 2).toFixed(2);
      return `C ${mx} ${prev.y} ${mx} ${p.y} ${p.x} ${p.y}`;
    }).join(" ");
    const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${height - pad.bottom} L ${pts[0].x} ${height - pad.bottom} Z`;

    const yGuides = [0.16, 0.38, 0.6, 0.82].map((r) => {
      const val = chartMin + valRange * (1 - r);
      const y = Number((pad.top + priceHeight * r).toFixed(2));
      return { y, label: formatCurrency(val) };
    });

    const firstDate = displayPoints[0] && displayPoints[0].date ? new Date(displayPoints[0].date) : null;
    const lastDate = displayPoints[displayPoints.length - 1] && displayPoints[displayPoints.length - 1].date
      ? new Date(displayPoints[displayPoints.length - 1].date)
      : null;
    const spansYears = firstDate instanceof Date
      && lastDate instanceof Date
      && Number.isFinite(firstDate.getTime())
      && Number.isFinite(lastDate.getTime())
      && (lastDate.getTime() - firstDate.getTime()) > 330 * 24 * 60 * 60 * 1000;
    const formatChartLabel = (point) => {
      const source = displayPoints[pts.indexOf(point)];
      if (!source || !source.date) {
        return point.label;
      }
      const date = new Date(source.date);
      if (!Number.isFinite(date.getTime())) {
        return point.label;
      }
      return date.toLocaleDateString(undefined, spansYears ? { month: "short", year: "numeric" } : { day: "numeric", month: "short" });
    };
    const xLabels = [pts[0], pts[Math.floor((pts.length - 1) / 2)], pts[pts.length - 1]].filter(Boolean);
    const lastPt = pts[pts.length - 1];
    const maxVolume = Math.max(...quantities, 1);
    const barWidth = Math.max(1.2, Math.min(5.2, iw / Math.max(1, displayPoints.length) * 0.62));
    const volumeBaseline = height - pad.bottom;
    const volumeBars = pts.map((point, index) => {
      const quantity = quantities[index] || 0;
      const barHeight = Math.max(2, (quantity / maxVolume) * volumeHeight);
      const x = Number((point.x - barWidth / 2).toFixed(2));
      const y = Number((volumeBaseline - barHeight).toFixed(2));
      return `<rect class="inventory-market-volume-bar" x="${x}" y="${y}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="0.8"></rect>`;
    }).join("");
    const hoverPointData = pts.map((point, index) => {
      const source = displayPoints[index] || {};
      const date = source.date ? new Date(source.date) : null;
      const dateLabel = date && Number.isFinite(date.getTime())
        ? date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" })
        : point.label;
      const soldLabel = quantities[index] ? `${Math.round(quantities[index]).toLocaleString()} sold` : "Sales unavailable";

      return {
        x: point.x,
        y: point.y,
        label: point.label,
        dateLabel,
        priceLabel: formatCurrency(point.value),
        soldLabel,
      };
    });
    const hoverPointDataAttr = escapeHtml(JSON.stringify(hoverPointData));

    return `
      <div class="inventory-market-tv-chart" data-inventory-chart-points="${hoverPointDataAttr}" data-chart-width="${width}" data-chart-height="${height}">
        <svg class="inventory-market-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Steam sales history">
          <defs>
            <linearGradient id="imcfg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="${lineColor}" stop-opacity="0.32"></stop>
              <stop offset="64%" stop-color="${lineColor}" stop-opacity="0.16"></stop>
              <stop offset="100%" stop-color="${lineColor}" stop-opacity="0.015"></stop>
            </linearGradient>
          </defs>
          ${yGuides.map((g) => `
            <line class="inventory-market-grid-line" x1="${pad.left}" y1="${g.y}" x2="${width - pad.right}" y2="${g.y}"></line>
            <text class="inventory-market-axis-label y-axis" text-anchor="start" x="${width - pad.right + 8}" y="${g.y + 4}">${escapeHtml(g.label)}</text>
          `).join("")}
          ${volumeBars}
          <path class="inventory-market-chart-area" d="${areaPath}" fill="url(#imcfg)" opacity="0.8"></path>
          <path class="inventory-market-chart-line" d="${linePath}" pathLength="1" fill="none" stroke="${lineColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>
          <circle class="inventory-market-chart-dot" cx="${lastPt.x}" cy="${lastPt.y}" r="3.5" fill="${lineColor}"></circle>
          ${xLabels.map((p) => `<text class="inventory-market-axis-label x-axis" text-anchor="middle" x="${p.x}" y="${height - 6}">${escapeHtml(formatChartLabel(p))}</text>`).join("")}
        </svg>
        <div class="inventory-chart-hover-crosshair" data-chart-crosshair></div>
        <div class="inventory-chart-hover-dom-dot" data-chart-hover-dot></div>
        <div class="inventory-chart-floating-tooltip" data-chart-tooltip></div>
      </div>
    `;
  }

  function parseSteamSalesDate(value) {
    const source = String(value || "").trim();
    if (!source) {
      return null;
    }

    const isoMatch = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const date = isoMatch
      ? new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])))
      : new Date(source);

    return Number.isFinite(date.getTime()) ? date : null;
  }

  function salesQuantityValue(entry) {
    const direct = Number(entry && entry.quantity);
    if (Number.isFinite(direct) && direct > 0) {
      return direct;
    }

    const match = String(entry && entry.quantity_display ? entry.quantity_display : "").replace(/,/g, "").match(/\d+/);
    return match ? Math.max(1, Number(match[0])) : 1;
  }

  function utcDayStart(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  function addUtcDays(date, days) {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  function formatSalesDate(date) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function salesPeriodBucket(date, period) {
    const start = utcDayStart(date);
    const year = start.getUTCFullYear();

    if (period === "week") {
      const dayOffset = (start.getUTCDay() + 6) % 7;
      const weekStart = addUtcDays(start, -dayOffset);
      const weekEnd = addUtcDays(weekStart, 6);
      return {
        key: weekStart.toISOString().slice(0, 10),
        start: weekStart,
        label: `${formatSalesDate(weekStart)} - ${formatSalesDate(weekEnd)}`,
      };
    }

    if (period === "quarter") {
      const quarter = Math.floor(start.getUTCMonth() / 3) + 1;
      return {
        key: `${year}-Q${quarter}`,
        start: new Date(Date.UTC(year, (quarter - 1) * 3, 1)),
        label: `${year} Q${quarter}`,
      };
    }

    if (period === "year") {
      return {
        key: String(year),
        start: new Date(Date.UTC(year, 0, 1)),
        label: String(year),
      };
    }

    return {
      key: start.toISOString().slice(0, 10),
      start,
      label: formatSalesDate(start),
    };
  }

  function groupedSalesRows(latestSales, history, period) {
    const periodId = SALES_PERIODS.some((entry) => entry.id === period) ? period : "day";
    const historyRows = Array.isArray(history) ? history : [];
    const latestRows = Array.isArray(latestSales) ? latestSales : [];
    const sourceRows = historyRows.length ? historyRows : latestRows;
    const buckets = new Map();

    sourceRows.forEach((entry) => {
      const date = parseSteamSalesDate(entry && (entry.date || entry.sold_at || entry.label));
      const price = Number(entry && entry.price);
      if (!date || !Number.isFinite(price) || price <= 0) {
        return;
      }

      const quantity = salesQuantityValue(entry);
      const bucket = salesPeriodBucket(date, periodId);
      const existing = buckets.get(bucket.key) || {
        key: bucket.key,
        start: bucket.start,
        label: bucket.label,
        quantity: 0,
        priceTotal: 0,
        priceWeight: 0,
      };

      existing.quantity += quantity;
      existing.priceTotal += price * quantity;
      existing.priceWeight += quantity;
      buckets.set(bucket.key, existing);
    });

    return Array.from(buckets.values())
      .map((entry) => {
        const price = entry.priceWeight > 0 ? Number((entry.priceTotal / entry.priceWeight).toFixed(2)) : null;
        return {
          ...entry,
          price,
          quantity_display: `${Math.round(entry.quantity).toLocaleString()} sold`,
          price_display: Number.isFinite(price) ? formatCurrency(price) : "--",
        };
      })
      .sort((left, right) => right.start.getTime() - left.start.getTime());
  }

  function buildInventorySalesPeriodChartMarkup(groups, period) {
    const periodId = SALES_PERIODS.some((entry) => entry.id === period) ? period : "day";
    const visibleLimit = periodId === "day" ? 32 : periodId === "week" ? 26 : periodId === "quarter" ? 16 : 12;
    const chartGroups = groups.slice(0, visibleLimit).reverse();
    if (!chartGroups.length) {
      return "";
    }

    const width = 1080;
    const height = 300;
    const pad = { top: 18, right: 78, bottom: 32, left: 12 };
    const iw = width - pad.left - pad.right;
    const ih = height - pad.top - pad.bottom;
    const volumeHeight = 78;
    const priceHeight = ih;
    const maxQuantity = Math.max(...chartGroups.map((entry) => Number(entry.quantity) || 0), 1);
    const prices = chartGroups.map((entry) => Number(entry.price)).filter((price) => Number.isFinite(price));
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 1;
    const padding = Math.max((maxPrice - minPrice) * 0.08, maxPrice * 0.015, 0.01);
    const chartMin = Math.max(0, minPrice - padding);
    const chartMax = maxPrice + padding;
    const priceRange = chartMax - chartMin || Math.max(chartMax, 0.01);
    const barWidth = Math.max(1.2, Math.min(5.2, iw / Math.max(1, chartGroups.length) * 0.62));

    const points = chartGroups.map((entry, index) => {
      const x = Number((pad.left + (iw * (chartGroups.length === 1 ? 0.5 : index / Math.max(1, chartGroups.length - 1)))).toFixed(2));
      const quantity = Number(entry.quantity) || 0;
      const barHeight = Math.max(2, (quantity / maxQuantity) * volumeHeight);
      const price = Number(entry.price);
      const priceY = Number((pad.top + priceHeight - (((price - chartMin) / priceRange) * priceHeight)).toFixed(2));
      return {
        x,
        label: entry.label,
        quantity,
        price,
        barHeight,
        barY: Number((height - pad.bottom - barHeight).toFixed(2)),
        priceY: Number.isFinite(priceY) ? priceY : height - pad.bottom,
      };
    });
    const pricePath = points.map((point, index) => {
      if (index === 0) return `M ${point.x} ${point.priceY}`;
      const prev = points[index - 1];
      const midX = ((prev.x + point.x) / 2).toFixed(2);
      return `C ${midX} ${prev.priceY} ${midX} ${point.priceY} ${point.x} ${point.priceY}`;
    }).join(" ");
    const areaPath = pricePath
      ? `${pricePath} L ${points[points.length - 1].x} ${height - pad.bottom} L ${points[0].x} ${height - pad.bottom} Z`
      : "";
    const yGuides = [0.16, 0.38, 0.6, 0.82].map((ratio) => {
      const value = chartMin + priceRange * (1 - ratio);
      const y = Number((pad.top + priceHeight * ratio).toFixed(2));
      return { y, label: formatCurrency(value) };
    });
    const xLabels = [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]].filter(Boolean);
    const hoverPointData = points.map((point) => ({
      x: point.x,
      y: point.priceY,
      label: point.label,
      dateLabel: point.label,
      priceLabel: formatCurrency(point.price),
      soldLabel: `${Math.round(point.quantity).toLocaleString()} sold`,
    }));
    const hoverPointDataAttr = escapeHtml(JSON.stringify(hoverPointData));

    return `
      <div class="inventory-market-tv-chart inventory-sales-chart" data-inventory-chart-points="${hoverPointDataAttr}" data-chart-width="${width}" data-chart-height="${height}">
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Grouped Steam sales chart">
          <defs>
            <linearGradient id="imsalescfg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#35f28a" stop-opacity="0.32"></stop>
              <stop offset="64%" stop-color="#35f28a" stop-opacity="0.16"></stop>
              <stop offset="100%" stop-color="#35f28a" stop-opacity="0.015"></stop>
            </linearGradient>
          </defs>
          ${yGuides.map((guide) => `
            <line class="inventory-market-grid-line" x1="${pad.left}" y1="${guide.y}" x2="${width - pad.right}" y2="${guide.y}"></line>
            <text class="inventory-market-axis-label y-axis" text-anchor="start" x="${width - pad.right + 8}" y="${guide.y + 4}">${escapeHtml(guide.label)}</text>
          `).join("")}
          ${points.map((point) => `
            <rect class="inventory-market-volume-bar" x="${(point.x - barWidth / 2).toFixed(2)}" y="${point.barY}" width="${barWidth.toFixed(2)}" height="${point.barHeight.toFixed(2)}" rx="0.8"></rect>
          `).join("")}
          ${areaPath ? `<path class="inventory-market-chart-area" d="${areaPath}" fill="url(#imsalescfg)" opacity="0.8"></path>` : ""}
          ${pricePath ? `<path class="inventory-market-chart-line" d="${pricePath}" pathLength="1" fill="none" stroke="#35f28a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>` : ""}
          ${points.length ? `<circle class="inventory-market-chart-dot" cx="${points[points.length - 1].x}" cy="${points[points.length - 1].priceY}" r="3.5" fill="#35f28a"></circle>` : ""}
          ${xLabels.map((point) => `<text class="inventory-market-axis-label x-axis" text-anchor="middle" x="${point.x}" y="${height - 6}">${escapeHtml(point.label)}</text>`).join("")}
        </svg>
        <div class="inventory-chart-hover-crosshair" data-chart-crosshair></div>
        <div class="inventory-chart-hover-dom-dot" data-chart-hover-dot></div>
        <div class="inventory-chart-floating-tooltip" data-chart-tooltip></div>
      </div>
    `;
  }

  function inventoryLatestSalesMarkup(latestSales, modal, history) {
    const rows = Array.isArray(latestSales) ? latestSales : [];
    const historyRows = Array.isArray(history) ? history : [];
    if (modal && modal.loading && !rows.length && !historyRows.length) {
      return `<div class="inventory-market-empty-state">Loading Steam sales...</div>`;
    }
    if (modal && modal.error && !rows.length && !historyRows.length) {
      return `<div class="inventory-market-empty-state">${escapeHtml(modal.error)}</div>`;
    }
    const period = SALES_PERIODS.some((entry) => entry.id === state.modalSalesPeriod) ? state.modalSalesPeriod : "day";
    const groupedRows = groupedSalesRows(rows, historyRows, period);
    if (!groupedRows.length) {
      return `<div class="inventory-market-empty-state">Recent Steam sales are not available for this item yet.</div>`;
    }

    const tableLimit = period === "day" ? 12 : period === "week" ? 12 : period === "quarter" ? 10 : 8;
    const visibleRows = groupedRows.slice(0, tableLimit);
    const periodLabel = SALES_PERIODS.find((entry) => entry.id === period).label;

    return `
      ${buildInventorySalesPeriodChartMarkup(groupedRows, period)}
      <div class="inventory-market-sales-list">
        <div class="inventory-market-sales-head">
          <span>${escapeHtml(periodLabel)}</span>
          <span>Sold</span>
          <span>Avg median price</span>
        </div>
        ${visibleRows.map((sale) => `
          <div class="inventory-market-sale-row">
            <span>${escapeHtml(sale && sale.label ? sale.label : "Recent sale")}</span>
            <span>${escapeHtml(sale && sale.quantity_display ? sale.quantity_display : sale && sale.quantity ? `${Number(sale.quantity).toLocaleString()} sold` : "--")}</span>
            <span>${escapeHtml(sale && sale.price_display ? sale.price_display : formatCurrency(sale && sale.price))}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function inventoryItemStackValue(item, valuation) {
    const priceInfo = inventoryBestPriceInfo(valuation);
    const quantity = Number(item && item.total_quantity ? item.total_quantity : 1);
    const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;

    return {
      unitValue: Number.isFinite(priceInfo.value) ? priceInfo.value : null,
      stackValue: Number.isFinite(priceInfo.value) ? Number((priceInfo.value * safeQuantity).toFixed(2)) : null,
      quantity: safeQuantity,
      priceInfo,
    };
  }

  function inventoryModalInsightMarkup(item, itemKey, valuation) {
    const groupedItems = groupInventoryItems(state.inventoryItems);
    const summary = inventoryValueSummary(groupedItems);
    const steamSummary = valuation && valuation.steamSummary ? valuation.steamSummary : {};
    const stack = inventoryItemStackValue(item, valuation);
    const stackCopy = Number.isFinite(stack.stackValue)
      ? `${formatCurrency(stack.stackValue)} stack value from ${stack.quantity} owned`
      : "Waiting for a live market price for this stack.";
    const sellOrderCount = Number(steamSummary.sell_order_count);
    const supplyDisplay = steamSummary.sell_order_count_display && steamSummary.sell_order_count_display !== "—"
      ? String(steamSummary.sell_order_count_display)
      : Number.isFinite(sellOrderCount) && sellOrderCount > 0
        ? sellOrderCount.toLocaleString()
        : "—";

    return `
      <div class="inventory-modal-insights">
        <section class="inventory-modal-insight-card">
          <span>Inventory Valuation</span>
          <strong>${escapeHtml(formatCurrency(summary.totalValue))}</strong>
          <p>${escapeHtml(stackCopy)}</p>
        </section>

        <section class="inventory-modal-insight-card">
          <span>Total Supply</span>
          <strong>${escapeHtml(supplyDisplay)}</strong>
          <p>Steam sell listings currently tracked for this item.</p>
        </section>
      </div>
    `;
  }

  function inventoryExportTypeLabel(item) {
    if (isInventoryCapsuleItem(item)) {
      return "capsule";
    }
    if (isInventoryCaseItem(item)) {
      return "case";
    }
    const category = String(inventoryCardCategoryLabel(item) || "").trim().toLowerCase();
    if (category === "skins" || category === "skin") {
      return "skin";
    }
    return category || "item";
  }

  function inventoryExportUnitPrice(item) {
    const valuation = state.valuations[inventoryGroupKey(item)] || null;
    return inventorySteamUnitValue(valuation)
      ?? inventoryPreferredUnitPrice(valuation)
      ?? valuationAmountForMode(state.valuationMode, valuation);
  }

  function buildInventoryExcelTable(exportRows, meta) {
    const rows = Array.isArray(exportRows) ? exportRows : [];
    const info = meta && typeof meta === "object" ? meta : {};
    const headers = [
      "Item",
      "Wear",
      "Quantity",
      "Unit Steam Price (EUR)",
      "Line Total (EUR)",
      "Type",
      "Market Hash Name",
    ];
    const money = (value) => (Number.isFinite(value) ? Number(Number(value).toFixed(2)) : "");
    let qtySum = 0;
    let lineTotalSum = 0;
    const ledgerRows = rows.map((row) => {
      const qty = Math.max(0, Number(row.quantity) || 0);
      const unitValue = Number.isFinite(Number(row.unitPrice)) ? Number(row.unitPrice) : null;
      const lineTotal = Number.isFinite(unitValue) ? Number((unitValue * qty).toFixed(2)) : null;
      qtySum += qty;
      if (Number.isFinite(lineTotal)) {
        lineTotalSum += lineTotal;
      }
      return [
        String(row.name || "Unknown Item"),
        String(row.wear || "—"),
        qty,
        money(unitValue),
        money(lineTotal),
        String(row.type || "item"),
        String(row.marketHashName || ""),
      ];
    });
    const totalsRow = ["TOTAL", "", qtySum, "", Number(lineTotalSum.toFixed(2)), "", ""];
    const exportedAt = info.exportedAt instanceof Date ? info.exportedAt : new Date();
    const summaryRows = [
      ["Inventory Excel export"],
      ["Exported at", exportedAt.toISOString()],
      ["Steam user", String(info.personaName || "")],
      ["Steam ID", String(info.steamId || "")],
      ["Visible stacks", rows.length],
      ["Total quantity", qtySum],
      ["Line total (EUR)", Number(lineTotalSum.toFixed(2))],
      [],
      ["Notes"],
      ["Unit Steam Price", "Same wear-aware Steam price shown on the inventory page"],
      ["Empty prices", "Left blank when a price has not loaded yet"],
    ];
    return {
      headers,
      ledgerRows,
      totalsRow,
      summaryRows,
      qtySum,
      lineTotalSum: Number(lineTotalSum.toFixed(2)),
      fileNameXlsx: "inventory.xlsx",
      fileNameXls: "inventory.xls",
    };
  }

  function downloadInventoryExcelFile(table) {
    const headers = table.headers;
    const ledgerRows = table.ledgerRows;
    const totalsRow = table.totalsRow;
    const summaryRows = table.summaryRows;
    const colWidths = [
      { wch: 42 },
      { wch: 16 },
      { wch: 10 },
      { wch: 22 },
      { wch: 18 },
      { wch: 12 },
      { wch: 48 },
    ];

    if (window.XLSX && typeof window.XLSX.utils === "object") {
      const workbook = window.XLSX.utils.book_new();
      const ledgerSheet = window.XLSX.utils.aoa_to_sheet([headers, ...ledgerRows, totalsRow]);
      ledgerSheet["!cols"] = colWidths;
      window.XLSX.utils.book_append_sheet(workbook, ledgerSheet, "Inventory");

      const summarySheet = window.XLSX.utils.aoa_to_sheet(summaryRows);
      summarySheet["!cols"] = [{ wch: 28 }, { wch: 56 }];
      window.XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

      window.XLSX.writeFile(workbook, table.fileNameXlsx);
      return table.fileNameXlsx;
    }

    const escapeXml = (value) => String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    const cellXml = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
      }
      return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
    };

    const sheetRowsXml = [headers, ...ledgerRows, totalsRow]
      .map((row) => `<Row>${row.map(cellXml).join("")}</Row>`)
      .join("");

    const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Inventory">
  <Table>${sheetRowsXml}</Table>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = table.fileNameXls;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return table.fileNameXls;
  }

  function exportInventoryExcel() {
    const items = filteredInventoryItems();
    const exportRows = items.map((item) => {
      const marketHashName = inventoryMarketHashName(item);
      const [baseName, wearFromName] = splitSteamWearName(marketHashName);
      const wear = wearFromName || String(item.exterior || item.wear || "");
      return {
        name: baseName || marketHashName || String(item.display_name || item.name || "Unknown Item"),
        wear: wear || "—",
        quantity: Math.max(0, Number(item.total_quantity) || 0),
        unitPrice: inventoryExportUnitPrice(item),
        type: inventoryExportTypeLabel(item),
        marketHashName,
      };
    });
    const table = buildInventoryExcelTable(exportRows, {
      exportedAt: new Date(),
      personaName: state.user && state.user.persona_name,
      steamId: state.user && state.user.steamid,
    });
    try {
      return downloadInventoryExcelFile(table);
    } catch (error) {
      console.error("Inventory Excel export failed", error);
      return "";
    }
  }

  function groupInventoryItems(items) {
    const groups = new Map();

    items.forEach((item) => {
      if (!item || typeof item !== "object") {
        return;
      }

      const key = inventoryGroupKey(item);

      if (groups.has(key)) {
        const existing = groups.get(key);
        existing.total_quantity += itemQuantity(item);
        existing.asset_instances += 1;
        existing.marketable = existing.marketable || Boolean(item.marketable);
        existing.tradable = existing.tradable || Boolean(item.tradable);
        return;
      }

      const marketHashName = inventoryMarketHashName(item) || String(item.name || item.display_name || "Unknown Item");
      const [, exterior] = splitSteamWearName(marketHashName);
      groups.set(key, {
        asset_id: String(item.asset_id || ""),
        class_id: String(item.class_id || ""),
        instance_id: String(item.instance_id || ""),
        name: marketHashName,
        market_hash_name: marketHashName,
        display_name: String(item.display_name || item.name || marketHashName || "Unknown Item"),
        exterior: String(item.exterior || item.wear || exterior || ""),
        type: String(item.type || ""),
        name_color: String(item.name_color || ""),
        icon: String(item.icon || ""),
        marketable: Boolean(item.marketable),
        tradable: Boolean(item.tradable),
        market_url: String(item.market_url || ""),
        total_quantity: itemQuantity(item),
        asset_instances: 1,
        // TF2 fields (get_steam_inventory.php?app=440): the prices come with
        // the inventory, so the group must keep them.
        effect: String(item.effect || ""),
        slot: String(item.slot || ""),
        quality: String(item.quality || ""),
        tf2_prices: item.tf2_prices && typeof item.tf2_prices === "object" ? item.tf2_prices : null,
        detail_url: String(item.detail_url || ""),
        ref_price: positivePriceOrNull(item.ref_price),
        ref_price_eur: positivePriceOrNull(item.ref_price_eur),
      });
    });

    return Array.from(groups.values()).sort((left, right) => {
      const leftName = String(left.display_name || left.name || "");
      const rightName = String(right.display_name || right.name || "");
      return leftName.localeCompare(rightName);
    });
  }

  function filteredInventoryItems() {
    const query = getInventorySearchQuery();
    return sortInventoryItems(groupInventoryItems(state.inventoryItems).filter((item) => {
      const matchesQuery = query === ""
        || String(item.display_name || "").toLowerCase().includes(query)
        || String(item.type || "").toLowerCase().includes(query)
        || String(item.name || "").toLowerCase().includes(query);

      if (!matchesQuery) {
        return false;
      }

      if (state.filters.marketableOnly && !item.marketable) {
        return false;
      }

      if (state.filters.tradableOnly && !item.tradable) {
        return false;
      }

      return true;
    }));
  }

  function inventorySummary() {
    return state.inventoryItems.reduce(
      (summary, item) => {
        const quantity = itemQuantity(item);
        summary.totalLoaded += quantity;
        if (item.marketable) {
          summary.marketable += quantity;
        }
        if (item.tradable) {
          summary.tradable += quantity;
        }
        return summary;
      },
      { totalLoaded: 0, marketable: 0, tradable: 0 }
    );
  }

  function sanitizeHexColor(value) {
    const normalized = String(value || "").trim().replace(/^#/, "");
    return /^[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : "";
  }

  function hexToRgba(hexValue, alpha) {
    const normalized = sanitizeHexColor(hexValue);
    if (!normalized) {
      return `rgba(96, 165, 250, ${alpha})`;
    }

    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  const INVENTORY_RARITY_HEX = {
    covert: "EB4B4B",
    classified: "D32CE6",
    restricted: "8847FF",
    "mil-spec": "4B69FF",
    industrial: "5E98D9",
    consumer: "B0C3D9",
    extraordinary: "E4AE39",
    contraband: "E4AE39",
    "high grade": "CFB97F",
    "base grade": "B0C3D9",
  };

  function inventoryQualityColor(item) {
    const explicitColor = sanitizeHexColor(item && item.name_color ? item.name_color : "");
    if (explicitColor) {
      return explicitColor;
    }

    const typeText = String(item && item.type ? item.type : "").toLowerCase();
    if (typeText.includes("contraband") || typeText.includes("extraordinary")) return INVENTORY_RARITY_HEX.extraordinary;
    if (typeText.includes("covert")) return INVENTORY_RARITY_HEX.covert;
    if (typeText.includes("classified")) return INVENTORY_RARITY_HEX.classified;
    if (typeText.includes("restricted")) return INVENTORY_RARITY_HEX.restricted;
    if (typeText.includes("mil-spec")) return INVENTORY_RARITY_HEX["mil-spec"];
    if (typeText.includes("industrial")) return INVENTORY_RARITY_HEX.industrial;
    if (typeText.includes("consumer")) return INVENTORY_RARITY_HEX.consumer;
    if (typeText.includes("high grade")) return INVENTORY_RARITY_HEX["high grade"];
    if (typeText.includes("base grade") || typeText.includes("container")) return INVENTORY_RARITY_HEX["base grade"];
    return INVENTORY_RARITY_HEX["mil-spec"];
  }

  function inventoryWeaponMediaClass(item) {
    const name = String(item?.display_name || item?.name || "").toLowerCase();
    if (/(awp|ssg 08|g3sg1|scar-20)/.test(name)) return "type-snipers";
    if (/(ak-47|m4a1|m4a4|aug|sg 553|famas|galil)/.test(name)) return "type-rifles";
    if (/(mac-10|mp9|mp7|ump-45|p90|pp-bizon|mp5)/.test(name)) return "type-smgs";
    if (/(nova|xm1014|mag-7|sawed-off)/.test(name)) {
      return /xm[\s-]?1014/.test(name) ? "type-shotguns xm-hide-shell" : "type-shotguns";
    }
    if (/(m249|negev)/.test(name)) return "type-heavy";
    if (/(glock|usp|p2000|p250|tec-9|five-seven|cz75|dual berettas|desert eagle|revolver|r8)/.test(name)) return "type-pistols";
    if (/(bayonet|knife|karambit|daggers|★)/.test(name)) return "type-knives";
    if (/(gloves|wraps)/.test(name)) return "type-gloves";
    if (/capsule|\b(challengers?|legends?|contenders?|champions?|rmr)\b/.test(name) && !/\bcase\b/.test(name)) return "type-capsules";
    if (/(case|container)/.test(name)) return "type-containers";
    return "";
  }

  function inventoryMediaStyle(item) {
    const hex = inventoryQualityColor(item);
    return `style="--card-accent:#${escapeHtml(hex)};"`;
  }

  function findGroupedInventoryItemByKey(itemKey) {
    const normalizedKey = String(itemKey || "");
    if (!normalizedKey) {
      return null;
    }

    return groupInventoryItems(state.inventoryItems).find((item) => inventoryGroupKey(item) === normalizedKey) || null;
  }

  function inventoryCardItemMarkup(item, options = {}) {
    const { disabledActions = false, animateIndex = -1 } = options;
    // TF2 names stay white; Steam's quality colour (unique = yellow) is not used.
    const accent = item.name_color && !TF2_MODE ? `style="color:#${escapeHtml(item.name_color)}"` : "";
    const valuation = state.valuations[inventoryGroupKey(item)] || null;
    const unitValue = inventorySteamUnitValue(valuation)
      ?? inventoryPreferredUnitPrice(valuation)
      ?? valuationAmountForMode(state.valuationMode, valuation);
    const qty = Number(item.total_quantity) || 1;
    const categoryLabel = inventoryCardCategoryLabel(item);
    const marketHashName = inventoryMarketHashName(item);
    const [, wearFromName] = splitSteamWearName(marketHashName);
    const wear = String(item.exterior || item.wear || wearFromName || "");
    const wearShort = inventoryWearShortLabel(wear);
    // The count only when there is a stack (user, 2026-10-03: "don't show the ×1").
    // Same line as the CS2 card (category, wear, stack count when more than
    // one) - TF2 just paints it grey, no quality colour (user, 2026-10-03:
    // "make the tf2 card just like the cs2 one but don't use the colors").
    const leftMeta = [categoryLabel, wearShort, qty > 1 ? `×${qty}` : ""].filter(Boolean).join(" · ");
    // Trade status tag (user, 2026-09-30: "create tags if the item is tradable").
    // Not on TF2 cards (user, 2026-10-03: "remove the tradable tag in tf2").
    const tradeTag = TF2_MODE
      ? ""
      : (item.tradable
        ? `<span class="inv-trade-tag is-tradable">Tradable</span>`
        : `<span class="inv-trade-tag is-locked">Untradable</span>`);
    const accentHex = inventoryQualityColor(item);
    const itemDetailUrl = buildInventoryItemDetailUrl(item);
    const accentGlow = hexToRgba(accentHex, 0.36);

    const enterClass = animateIndex >= 0 ? " inventory-card-enter" : "";
    const delayRule = animateIndex >= 0
      ? `--card-stagger:${Math.min(animateIndex, 23) * 45}ms;`
      : "";
    const cardStyleAttr = `style="--card-accent:#${escapeHtml(accentHex)};--card-media-accent:#${escapeHtml(accentHex)};--item-quality-glow:${escapeHtml(accentGlow)};${delayRule}"`;

    const pricingLoading = Boolean(state.valuationLoading && item.marketable && !Number.isFinite(unitValue));
    const refLabel = tf2RefOnlyLabel(valuation);
    const priceRight = refLabel
      || (Number.isFinite(unitValue) ? formatCurrency(unitValue) : (pricingLoading ? "…" : "—"));

    const hrefAttr = item.marketable && !disabledActions
      ? `data-item-href="${escapeHtml(itemDetailUrl)}"`
      : "";

    return `
      <article class="card showcase-card inv-item-card${enterClass}" ${cardStyleAttr} ${hrefAttr} role="button" tabindex="0" title="${escapeHtml(marketHashName || item.display_name || item.name)}">
        <div class="inventory-card-media card-media ${escapeHtml(inventoryWeaponMediaClass(item))}">
          ${qty > 1 ? `<div class="inventory-stack-badge">×${escapeHtml(qty)}</div>` : ""}
          ${item.icon
            ? `<img class="card-media-img${/xm[\s-]?1014/i.test(String(item.display_name || item.name || "")) ? " xm-hide-shell" : ""}" src="${escapeHtml(item.icon)}" alt="${escapeHtml(item.display_name || item.name)}" loading="lazy" decoding="async">`
            : `<div class="inventory-placeholder">${APP_LABEL}</div>`}
        </div>

        <div class="card-body">
          <div class="card-top-labels">
            <span class="card-label left">${escapeHtml(leftMeta)}${tradeTag}</span>
            <span class="card-label right">${escapeHtml(priceRight)}</span>
          </div>
          <h3 ${accent}>${escapeHtml(item.display_name || item.name)}</h3>
          ${item.marketable && !disabledActions
            ? `<div class="card-footer">
                <span class="card-intro">
                  <span class="card-intro-dot" aria-hidden="true"></span>
                  Click to open
                </span>
              </div>`
            : ""}
        </div>
      </article>
    `;
  }

  function legacyInventoryCardsMarkup(items) {
    const groupedItems = Array.isArray(items) ? items : filteredInventoryItems();
    if (!groupedItems.length) {
      return `
        <div class="inventory-empty">
          No items match the current filters yet.
        </div>
      `;
    }

    return groupedItems.map((item) => {
      const accent = item.name_color && !TF2_MODE ? `style="color:#${escapeHtml(item.name_color)}"` : "";
      const itemDetailUrl = buildInventoryItemDetailUrl(item);
      const itemKey = inventoryGroupKey(item);
      const valuation = state.valuations[itemKey] || null;
      const unitValue = valuationAmountForMode(state.valuationMode, valuation);
      const stackValue = Number.isFinite(unitValue) && item.total_quantity > 1
        ? Number((unitValue * item.total_quantity).toFixed(2))
        : null;

      const priceHtml = Number.isFinite(unitValue)
        ? `<div class="inventory-card-price-block">
            <span class="inventory-card-price-unit">€${escapeHtml(unitValue.toFixed(2))}</span>
            ${stackValue !== null ? `<span class="inventory-card-price-total">€${escapeHtml(stackValue.toFixed(2))} total</span>` : ""}
           </div>`
        : `<div class="inventory-card-price-block muted"><span class="inventory-card-price-unit">—</span></div>`;

      const steamUrl = item.marketable && item.market_url ? item.market_url : "";

      return `
          <article class="inventory-card inventory-card-clickable" ${inventoryMediaStyle(item)} data-item-key="${escapeHtml(itemKey)}" data-item-href="${escapeHtml(itemDetailUrl)}" role="button" tabindex="0" title="Open item details">
            <div class="inventory-card-media ${escapeHtml(inventoryWeaponMediaClass(item))}" ${inventoryMediaStyle(item)}>
            ${item.icon
              ? `<img class="${/xm[\s-]?1014/i.test(String(item.display_name || item.name || "")) ? "xm-hide-shell" : ""}" src="${escapeHtml(item.icon)}" alt="${escapeHtml(item.display_name || item.name)}">`
              : `<div class="inventory-placeholder">${APP_LABEL}</div>`}
          </div>

          <div class="inventory-card-copy">
            <div class="inventory-card-name" ${accent}>${escapeHtml(item.display_name || item.name)}</div>
            <div class="inventory-card-sub">${escapeHtml(item.type || "Counter-Strike item")}</div>
            ${priceHtml}
          </div>
        </article>
      `;
    }).join("");
  }

  function inventoryCardsMarkup(items, options = {}) {
    const { animate = false } = options;
    const groupedItems = Array.isArray(items) ? items : filteredInventoryItems();
    if (!groupedItems.length) {
      if (!state.inventoryItems.length && (state.inventoryLoading || state.inventorySyncing)) {
        return inventoryLoadingSkeletonMarkup();
      }

      return `
        <div class="inventory-empty inventory-empty-animated">
          No items match the current filters yet.
        </div>
      `;
    }

    return groupedItems.map((item, index) => inventoryCardItemMarkup(item, {
      animateIndex: animate ? index : -1,
    })).join("");
  }

  function inventoryFilterButtonMarkup() {
    const filtersCount = activeFilterCount();
    return `
      <i class="fa-solid fa-filter"></i>
      Filters
      ${filtersCount ? `<span class="inventory-filter-count">${escapeHtml(filtersCount)}</span>` : ""}
    `;
  }

  function legacyItemDetailModalMarkup() {
    const modal = state.itemDetailModal;
    if (!modal || !modal.href) {
      return "";
    }

    const item = modal.item || null;
    const title = item ? String(item.display_name || item.name || "Item details") : "Item details";
    const subtitle = item ? String(item.type || "Counter-Strike item") : "Counter-Strike item";

    return `
      <div class="inventory-item-modal inventory-market-modal" data-item-modal>
        <button class="inventory-market-backdrop" type="button" data-action="close-item-modal" aria-label="Close item details"></button>
        <div class="inventory-item-shell">
          <button class="inventory-market-close" type="button" data-action="close-item-modal" aria-label="Close item details">&times;</button>
          <div class="inventory-item-shell-head">
            <div class="inventory-item-shell-copy">
              <div class="panel-kicker">Inventory Item</div>
              <h3>${escapeHtml(title)}</h3>
              <p>${escapeHtml(subtitle)}</p>
            </div>
          </div>
          <div class="inventory-item-embed-wrap">
            <iframe
              class="inventory-item-embed"
              src="${escapeHtml(modal.href)}"
              title="${escapeHtml(title)}"
              loading="eager"
              referrerpolicy="same-origin"
            ></iframe>
          </div>
        </div>
      </div>
    `;
  }

  function itemDetailModalMarkup() {
    return itemChartDetailModalMarkup();

    const modal = state.itemDetailModal;
    const item = modal && modal.item ? modal.item : null;
    if (!modal || !item) {
      return "";
    }

    const title = String(item.display_name || item.name || "Item details");
    const subtitle = String(item.type || "Counter-Strike item");
    const itemKey = modal.key || inventoryGroupKey(item);
    const valuation = state.valuations[itemKey] || null;
    const prices = valuation && valuation.modePrices ? valuation.modePrices : {};
    const summary = valuation && valuation.steamSummary ? valuation.steamSummary : {};
    const suggestedPrice = firstFiniteNumber([
      summary.suggested_price,
      prices.steam_suggested,
      prices.steam_avg_30d,
      prices.steam_starting,
    ]);
    const startingPrice = firstFiniteNumber([
      summary.starting_price,
      prices.steam_starting,
      prices.steam_latest_sale,
      suggestedPrice,
    ]);
    const quantity = Number(item.total_quantity || 0);
    const sellOrderCount = Number(summary.sell_order_count);
    const sellOrderCopy = summary.sell_order_count_display && summary.sell_order_count_display !== "â€”"
      ? String(summary.sell_order_count_display)
      : Number.isFinite(sellOrderCount) && sellOrderCount > 0
        ? compactCount(sellOrderCount)
        : "Tracked";
    const activeTab = modal.tab === "latest" ? "latest" : "history";
    const allHistory = Array.isArray(valuation && valuation.steamHistory) ? valuation.steamHistory : [];
    const rangeHistory = valuation && valuation.steamHistoryByRange && Array.isArray(valuation.steamHistoryByRange[state.modalChartRange])
      ? valuation.steamHistoryByRange[state.modalChartRange]
      : filterHistoryByRange(allHistory, state.modalChartRange);
    const latestSales = Array.isArray(valuation && valuation.latestSales) ? valuation.latestSales : [];
    const steamUrl = String((valuation && valuation.steamUrl) || item.market_url || "");
    const chartRanges = ["1m", "6m", "1y", "all"];
    const marketContent = activeTab === "latest"
      ? inventoryLatestSalesMarkup(latestSales, modal)
      : modal.loading && !allHistory.length
        ? `<div class="inventory-market-empty-state">Loading Steam market history...</div>`
        : modal.error && !allHistory.length
          ? `<div class="inventory-market-empty-state">${escapeHtml(modal.error)}</div>`
          : buildInventoryMarketChartMarkup(rangeHistory);

    return `
      <div class="inventory-item-modal inventory-market-modal" data-item-modal>
        <button class="inventory-market-backdrop" type="button" data-action="close-item-modal" aria-label="Close item details"></button>
        <div class="inventory-market-shell inventory-item-detail-shell" ${inventoryMediaStyle(item)}>
          <button class="inventory-market-close" type="button" data-action="close-item-modal" aria-label="Close item details">&times;</button>

          <div class="inventory-market-main inventory-item-detail-main">
            <section class="inventory-market-preview-panel inventory-item-detail-preview">
              <div class="inventory-market-preview-card inventory-item-detail-image${/xm[\s-]?1014/i.test(String(title || item.display_name || item.name || "")) ? " xm-hide-shell" : ""}">
                ${item.icon
                  ? `<img class="${/xm[\s-]?1014/i.test(String(title || item.display_name || item.name || "")) ? "xm-hide-shell" : ""}" src="${escapeHtml(item.icon)}" alt="${escapeHtml(title)}">`
                  : `<div class="inventory-placeholder">${APP_LABEL}</div>`}
              </div>

              <div class="inventory-market-tools">
                ${steamUrl
                  ? `<button type="button" class="inventory-market-link" data-market-url="${escapeHtml(steamUrl)}">
                      Open Steam listing <span aria-hidden="true">&nearr;</span>
                    </button>`
                  : `<button type="button" class="inventory-market-link" disabled>
                      Steam market unavailable
                    </button>`}
              </div>

              <div data-modal-chart>
                <div class="inventory-market-tabs-row">
                  <div class="inventory-market-tabs" role="tablist" aria-label="Steam market item details">
                    <button type="button" class="inventory-market-tab${activeTab === "history" ? " active" : ""}" data-action="set-item-modal-tab" data-tab="history">
                      Sales History
                    </button>
                    <button type="button" class="inventory-market-tab${activeTab === "latest" ? " active" : ""}" data-action="set-item-modal-tab" data-tab="latest">
                      Latest Sales
                    </button>
                  </div>
                  ${activeTab === "history" ? `<div class="inventory-chart-ranges">
                    ${chartRanges.map((r) => `<button type="button" class="inventory-chart-range-btn${state.modalChartRange === r ? " active" : ""}" data-action="set-modal-chart-range" data-range="${r}">${r.toUpperCase()}</button>`).join("")}
                  </div>` : ""}
                </div>

                <div class="inventory-market-content">
                  ${marketContent}
                </div>
              </div>
            </section>

            <aside class="inventory-market-side-panel inventory-item-detail-side">
              <div class="inventory-market-kicker">${escapeHtml(subtitle || "Steam Market Item")}</div>
              <h3>${escapeHtml(title)}</h3>
              <p>${escapeHtml(subtitle || title)}</p>

              <div class="inventory-market-price-block">
                <span>Suggested price</span>
                <strong>${Number.isFinite(suggestedPrice) ? escapeHtml(formatCurrency(suggestedPrice)) : "&mdash;"}</strong>
                <p>
                  ${escapeHtml(sellOrderCopy)} items for sale starting at
                  <strong>${Number.isFinite(startingPrice) ? escapeHtml(formatCurrency(startingPrice)) : "&mdash;"}</strong>.
                </p>
              </div>

              

            </aside>
          </div>
        </div>
      </div>
    `;
  }

  function itemChartDetailModalMarkup() {
    const modal = state.itemDetailModal;
    const item = modal && modal.item ? modal.item : null;
    if (!modal || !item) {
      return "";
    }

    const title = String(item.display_name || item.name || "Item details");
    const subtitle = inventoryItemSubtitle(item);
    const itemKey = modal.key || inventoryGroupKey(item);
    const valuation = state.valuations[itemKey] || null;
    const steamPrice = inventorySteamPriceInfo(valuation);
    const steamUrl = String((valuation && valuation.steamUrl) || item.market_url || "");
    const marketUrlAttr = steamUrl ? `data-market-url="${escapeHtml(steamUrl)}"` : "";
    const showInsights = modal.tab !== "latest";

    return `
      <div class="inventory-item-modal inventory-market-modal" data-item-modal>
        <button class="inventory-market-backdrop" type="button" data-action="close-item-modal" aria-label="Close item details"></button>
        <div class="inventory-market-shell inventory-item-detail-shell inventory-chart-detail-shell" ${inventoryMediaStyle(item)}>
          <button class="inventory-market-close" type="button" data-action="close-item-modal" aria-label="Close item details">&times;</button>

          <section class="inventory-chart-detail">
            <header class="inventory-chart-detail-head">
              <div class="inventory-chart-detail-item${steamUrl ? " is-clickable" : ""}" ${marketUrlAttr} title="${steamUrl ? "Open Steam listing" : ""}">
                <div class="inventory-chart-detail-thumb${/xm[\s-]?1014/i.test(String(title || item.display_name || item.name || "")) ? " xm-hide-shell" : ""}">
                  ${item.icon
                    ? `<img class="${/xm[\s-]?1014/i.test(String(title || item.display_name || item.name || "")) ? "xm-hide-shell" : ""}" src="${escapeHtml(item.icon)}" alt="${escapeHtml(title)}">`
                    : `<div class="inventory-placeholder">${APP_LABEL}</div>`}
                </div>
                <div>
                  <div class="inventory-market-kicker">${escapeHtml(subtitle)}</div>
                  <h3>${escapeHtml(title)}</h3>
                  <p>${escapeHtml(item.type || subtitle || "Counter-Strike item")}</p>
                </div>
              </div>

              <div class="inventory-chart-detail-price${steamUrl ? " is-clickable" : ""}" ${marketUrlAttr} title="${steamUrl ? "Open Steam listing" : ""}">
                <span>Steam Price</span>
                <strong>${Number.isFinite(steamPrice.value) ? escapeHtml(formatCurrency(steamPrice.value)) : "&mdash;"}</strong>
              </div>
            </header>

            <div class="inventory-chart-detail-body">
              <div data-modal-chart>
                ${inventoryModalChartMarkup(modal, valuation)}
              </div>
              ${showInsights ? inventoryModalInsightMarkup(item, itemKey, valuation) : ""}
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function inventoryFilterShellClassName() {
    const filtersCount = activeFilterCount();
    return `inventory-filter-shell${state.filterPanelOpen || filtersCount ? " is-open" : ""}${filtersCount ? " has-active" : ""}`;
  }

  function inventoryFilterRowMarkup() {
    return `
      <div class="inventory-filter-row">
        <label class="inventory-toggle${state.filters.marketableOnly ? " active" : ""}">
          <input type="checkbox" name="marketableOnly" ${state.filters.marketableOnly ? "checked" : ""}>
          <span>Marketable only</span>
        </label>

        <label class="inventory-toggle${state.filters.tradableOnly ? " active" : ""}">
          <input type="checkbox" name="tradableOnly" ${state.filters.tradableOnly ? "checked" : ""}>
          <span>Tradable only</span>
        </label>

        <button class="inventory-clear-btn" type="button" data-action="clear-filters">
          Reset
        </button>
      </div>
    `;
  }

  function inventoryPanelBodyMarkup(options = {}) {
    const animateCards = shouldAnimateInventoryGrid(options);
    return `
      ${state.inventoryError
        ? `<div class="auth-inline-error wide">${escapeHtml(state.inventoryError)}<br>If your Steam inventory is private, Steam may block this data.</div>`
        : ""}
      <div class="inventory-grid inventory-grid-animated">${inventoryCardsMarkup(filteredInventoryItems(), { animate: animateCards })}</div>
    `;
  }

  function syncInventoryFilterChipStates() {
    ["marketableOnly", "tradableOnly"].forEach((name) => {
      const input = root.querySelector(`input[name="${name}"]`);
      const chip = input ? input.closest(".inventory-filter-chip") : null;
      if (chip) {
        chip.classList.toggle("active", Boolean(state.filters[name]));
      }
      if (input) {
        input.checked = Boolean(state.filters[name]);
      }
    });
  }

  function renderInventoryControlsPartial() {
    const panel = root.querySelector("[data-inventory-panel]");
    const controls = panel ? panel.querySelector("[data-inventory-controls]") : null;
    const controlsHost = panel ? panel.querySelector("[data-inventory-controls-host]") : null;
    if (!panel) {
      return;
    }

    if (controlsHost) {
      controlsHost.innerHTML = inventoryControlsMarkup();
    } else if (controls) {
      controls.outerHTML = inventoryControlsMarkup();
    }
    syncInventoryFilterChipStates();
  }

  function renderInventoryGridPartial(options = {}) {
    const panel = root.querySelector("[data-inventory-panel]");
    const panelBody = panel ? panel.querySelector("[data-inventory-panel-body]") : null;
    if (!panelBody) {
      return;
    }

    const animateCards = shouldAnimateInventoryGrid(options);
    inventoryGridAnimateNext = false;
    const nextMarkup = inventoryPanelBodyMarkup({ animate: animateCards });
    const existingGrid = panelBody.querySelector(".inventory-grid");

    const commitGridMarkup = () => {
      window.clearTimeout(inventoryGridRenderTimer);
      inventoryGridRenderTimer = 0;
      panelBody.innerHTML = nextMarkup;
      bindInventoryCardEnterCleanup(panelBody.querySelector(".inventory-grid"));
      if (animateCards && filteredInventoryItems().length > 0) {
        inventoryHasAnimatedOnce = true;
      }
    };

    if (animateCards && existingGrid && !existingGrid.classList.contains("is-leaving")) {
      existingGrid.classList.add("is-leaving");
      window.clearTimeout(inventoryGridRenderTimer);
      inventoryGridRenderTimer = window.setTimeout(commitGridMarkup, 130);
      return;
    }

    commitGridMarkup();
  }

  function scheduleInventorySearchRender() {
    window.clearTimeout(inventorySearchTimer);
    inventorySearchTimer = window.setTimeout(() => {
      inventorySearchTimer = 0;
      requestInventoryGridAnimation();
      renderInventoryGridPartial();
    }, 90);
  }

  function scheduleValuationProgressRender() {
    window.clearTimeout(inventoryValuationRenderTimer);
    inventoryValuationRenderTimer = window.setTimeout(() => {
      inventoryValuationRenderTimer = 0;
      scheduleInventoryPanelRender("heading");
      scheduleInventoryPanelRender("grid");
    }, 220);
  }

  function renderInventoryPanelPartial(scope = "all") {
    if (!state.authenticated) {
      render();
      return;
    }

    const panel = root.querySelector("[data-inventory-panel]");
    const panelBody = panel ? panel.querySelector("[data-inventory-panel-body]") : null;
    const controls = panel ? panel.querySelector("[data-inventory-controls]") : null;
    const controlsHost = panel ? panel.querySelector("[data-inventory-controls-host]") : null;
    // Heading lives outside the panel in the modern layout.
    const heading = root.querySelector("[data-inventory-heading]");

    if (!panel || !panelBody) {
      render();
      return;
    }

    const renderAll = scope === "all";
    const renderHeading = renderAll || scope === "heading";
    const renderControls = renderAll || scope === "controls";
    const renderGrid = renderAll || scope === "grid";

    if (renderHeading && heading) {
      heading.outerHTML = inventoryHeadingMarkup();
    }
    if (renderControls) {
      renderInventoryControlsPartial();
    }
    if (renderGrid) {
      renderInventoryGridPartial();
    } else if (renderAll) {
      panelBody.innerHTML = inventoryPanelBodyMarkup();
    }
  }

  function scheduleInventoryPanelRender(scope = "all") {
    if (scope === "all") {
      inventoryPanelRenderScopes.clear();
      inventoryPanelRenderScopes.add("all");
    } else {
      inventoryPanelRenderScopes.add(scope);
    }

    if (inventoryPanelRenderFrame) {
      window.cancelAnimationFrame(inventoryPanelRenderFrame);
    }

    inventoryPanelRenderFrame = window.requestAnimationFrame(() => {
      inventoryPanelRenderFrame = 0;
      const scopes = inventoryPanelRenderScopes;
      inventoryPanelRenderScopes.clear();

      if (scopes.has("all")) {
        renderInventoryPanelPartial("all");
        return;
      }

      if (scopes.has("heading")) {
        renderInventoryPanelPartial("heading");
      }
      if (scopes.has("controls")) {
        renderInventoryPanelPartial("controls");
      }
      if (scopes.has("grid")) {
        renderInventoryPanelPartial("grid");
      }
    });
  }

  function bannerMarkup() {
    const banner = statusCopy(state.authStatus);
    if (!banner || banner.tone === "success") {
      return "";
    }

    return `<div class="auth-status ${banner.tone}">${escapeHtml(banner.text)}</div>`;
  }

  function oauthReturnTo() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}` || "login.html";
  }

  function oauthLoginHref(file) {
    return `${appUrl(file)}?return_to=${encodeURIComponent(oauthReturnTo())}`;
  }

  function loginSocialMarkup(href, enabled, iconClass, label) {
    if (enabled && href) {
      return `<a class="login-social is-live" href="${escapeHtml(href)}" aria-label="Continue with ${escapeHtml(label)}" title="Continue with ${escapeHtml(label)}"><i class="${iconClass}" aria-hidden="true"></i></a>`;
    }

    return `<button type="button" class="login-social" disabled aria-label="${escapeHtml(label)} — not configured" title="${escapeHtml(label)} login is not configured"><i class="${iconClass}" aria-hidden="true"></i></button>`;
  }

  function loginMarkup() {
    const googleEnabled = Boolean(state.oauth && state.oauth.google);
    const discordEnabled = Boolean(state.oauth && state.oauth.discord);

    return `
      <div class="login-container">
        <div class="login-logo">
          <img src="logo.png?v=20260815-csprice-restore-1" alt="CS2 Market">
        </div>

        ${bannerMarkup()}

        <div class="login-title">Sign in with Steam</div>
<a class="steam-login" href="${escapeHtml(oauthLoginHref("steam_login.php"))}">
          <i class="fa-brands fa-steam"></i>
          Continue with Steam
        </a>

        <div class="login-divider" role="separator"><span>Or continue via</span></div>
        <div class="login-socials">
          ${loginSocialMarkup(oauthLoginHref("google_login.php"), googleEnabled, "fa-brands fa-google", "Google")}
          ${loginSocialMarkup(oauthLoginHref("discord_login.php"), discordEnabled, "fa-brands fa-discord", "Discord")}
        </div>

        ${state.sessionError ? `<div class="auth-inline-error">${escapeHtml(state.sessionError)}</div>` : ""}

        <div class="login-footer">
          Steam, Google, or Discord can create a local session. Inventory sync still uses Steam.
          <br>
          Need a first-time account page? <a href="${escapeHtml(appUrl("signup.html"))}">Create it with Steam</a>
        </div>
      </div>
    `;
  }

  function signupMarkup() {
    return `
      <div class="auth-card">
        <div class="auth-header">
          <h1>Create Account</h1>
          <p>Use Steam to create your profile and start tracking your items.</p>
        </div>

        <a class="auth-btn auth-btn-link" href="${escapeHtml(appUrl("steam_login.php"))}">
          <i class="fa-brands fa-steam"></i>
          Continue with Steam
        </a>

        <div class="auth-footer">
          Already connected?
          <a href="${escapeHtml(appUrl("login.html"))}">Open your dashboard</a>
        </div>
      </div>
    `;
  }

  function dashboardMarkup() {
    const user = state.user || {};
    const allGroupedItems = groupInventoryItems(state.inventoryItems);
    const groupedItems = filteredInventoryItems();
    const summary = inventorySummary();
    const valuationSummary = inventoryValueSummary(allGroupedItems);
    const profileUrl = user.profile_url || "#";
    const profileOpenAttrs = user.profile_url
      ? `href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer"`
      : `href="javascript:void(0)" aria-disabled="true"`;

    const inventoryCards = groupedItems.length
      ? groupedItems.map((item) => inventoryCardItemMarkup(item, { disabledActions: true })).join("")
      : `
        <div class="inventory-empty">
          No items match the current filters yet.
        </div>
      `;

    return `
      <div class="steam-dashboard">
        <div class="steam-dashboard-hero">
          <div class="steam-dashboard-user">
            <div class="steam-dashboard-avatar">
              ${sessionAvatarMarkup(user)}
            </div>

            <div class="steam-dashboard-copy">
              <div class="steam-dashboard-kicker">${escapeHtml(sessionProviderLabel(user))} Connected</div>
              <h1>${escapeHtml(sessionDisplayName(user))}</h1>
              <p>${nl2br(user.state_message || "Your Steam session is active in this browser.")}</p>
              <div class="steam-dashboard-meta">
                ${user.steamid ? `<span>SteamID: ${escapeHtml(user.steamid)}</span>` : ""}
                ${user.member_since ? `<span>Member since: ${escapeHtml(user.member_since)}</span>` : ""}
              </div>
            </div>
          </div>

          <div class="steam-dashboard-actions">
            <a class="dashboard-btn secondary" ${profileOpenAttrs}>
              <i class="fa-solid fa-up-right-from-square"></i>
              Open Steam Profile
            </a>
            <button class="dashboard-btn${state.inventoryLoading && state.inventorySyncMode === "full" ? " is-loading" : ""}" type="button" data-action="refresh-inventory" ${state.inventoryLoading && state.inventorySyncMode === "full" ? "disabled" : ""}>
              <i class="fa-solid ${state.inventoryLoading && state.inventorySyncMode === "full" ? "fa-spinner fa-spin" : "fa-rotate-right"}"></i>
              ${state.inventoryLoading && state.inventorySyncMode === "full" ? "Refreshing…" : "Refresh Inventory"}
            </button>
            <a class="dashboard-btn danger" href="${escapeHtml(appUrl("steam_logout.php"))}">
              <i class="fa-solid fa-right-from-bracket"></i>
              Log Out
            </a>
          </div>
        </div>

        <div class="steam-dashboard-panel inventory-valuation-tool">
          <div class="steam-dashboard-panel-head">
            <div>
              <div class="panel-kicker">Valuation Tool</div>
              <h2>Inventory Valuation</h2>
            </div>
            <div class="panel-badge${state.valuationLoading ? "" : " muted"}">
              ${state.valuationLoading
                ? `Valuing ${escapeHtml(state.valuationProgress)}/${escapeHtml(state.valuationTotal)} marketable stacks...`
                : `${escapeHtml(valuationSummary.pricedStacks)}/${escapeHtml(valuationSummary.marketableStacks)} marketable stacks valued`}
            </div>
          </div>

          <div class="inventory-valuation-tool-grid">
            <div class="inventory-valuation-hero">
              <span class="inventory-valuation-label">Estimated inventory total</span>
              <strong>${escapeHtml(formatCurrency(valuationSummary.totalValue))}</strong>
              <p>
                Pick one pricing mode and instantly recalculate your whole inventory value,
                marketable value, and average stack prices from one tool.
              </p>

              <div class="inventory-valuation-meta">
                <span>${escapeHtml(`${state.totalInventoryCount || summary.totalLoaded} items`)}</span>
                <span>${escapeHtml(`${groupedItems.length} visible stacks`)}</span>
                <span>${escapeHtml(`${summary.marketable} marketable`)}</span>
                <span>${escapeHtml(`${summary.tradable} tradable`)}</span>
              </div>
            </div>

            <div class="inventory-valuation-side">
              <label class="valuation-select-wrap">
                <span class="valuation-select-label">Price mode</span>
                <select name="valuationMode">
                  ${VALUATION_MODES.map((mode) => (
                    `<option value="${escapeHtml(mode.id)}"${state.valuationMode === mode.id ? " selected" : ""}>${escapeHtml(mode.label)}</option>`
                  )).join("")}
                </select>
              </label>

              <div class="valuation-number-grid">
                <div class="valuation-number-card">
                  <span>Marketable value</span>
                  <strong>${escapeHtml(formatCurrency(valuationSummary.marketableValue))}</strong>
                </div>
                <div class="valuation-number-card">
                  <span>Avg stack value</span>
                  <strong>${escapeHtml(formatCurrency(valuationSummary.averageStackValue))}</strong>
                </div>
                <div class="valuation-number-card">
                  <span>Valued stacks</span>
                  <strong>${escapeHtml(`${valuationSummary.pricedStacks}/${Math.max(valuationSummary.marketableStacks, 0)}`)}</strong>
                </div>
                <div class="valuation-number-card">
                  <span>Using</span>
                  <strong>${escapeHtml(valuationModeLabel())}</strong>
                </div>
              </div>

              ${state.valuationError ? `<div class="auth-inline-error compact">${escapeHtml(state.valuationError)}</div>` : ""}
            </div>
          </div>
        </div>

        <div class="steam-dashboard-stats">
          <div class="steam-stat-card">
            <span>Steam total</span>
            <strong>${escapeHtml(state.totalInventoryCount || summary.totalLoaded)}</strong>
          </div>
          <div class="steam-stat-card">
            <span>Loaded items</span>
            <strong>${escapeHtml(summary.totalLoaded)}</strong>
          </div>
          <div class="steam-stat-card">
            <span>Inventory value</span>
            <strong>${escapeHtml(`€${valuationSummary.totalValue.toFixed(2)}`)}</strong>
          </div>
          <div class="steam-stat-card">
            <span>Visible stacks</span>
            <strong>${escapeHtml(groupedItems.length)}</strong>
          </div>
          <div class="steam-stat-card">
            <span>Marketable</span>
            <strong>${escapeHtml(summary.marketable)}</strong>
          </div>
          <div class="steam-stat-card">
            <span>Tradable</span>
            <strong>${escapeHtml(summary.tradable)}</strong>
          </div>
          <div class="steam-stat-card">
            <span>Marketable value</span>
            <strong>${escapeHtml(`€${valuationSummary.marketableValue.toFixed(2)}`)}</strong>
          </div>
          <div class="steam-stat-card">
            <span>Valued stacks</span>
            <strong>${escapeHtml(`${valuationSummary.pricedStacks}/${Math.max(valuationSummary.marketableStacks, 0)}`)}</strong>
          </div>
          <div class="steam-stat-card">
            <span>Avg stack value</span>
            <strong>${escapeHtml(`€${valuationSummary.averageStackValue.toFixed(2)}`)}</strong>
          </div>
        </div>

        <div class="steam-dashboard-panel">
          <div class="steam-dashboard-panel-head">
            <div>
              <div class="panel-kicker">Profile Overview</div>
              <h2>Item Tracking</h2>
            </div>
            <div class="panel-badge">
              ${state.inventoryLoading
                ? `Syncing full inventory${state.inventoryPagesLoaded ? ` (${escapeHtml(state.inventoryPagesLoaded)} pages)` : ""}...`
                : `${escapeHtml(state.inventoryPagesLoaded || 0)} page${state.inventoryPagesLoaded === 1 ? "" : "s"} loaded`}
            </div>
          </div>

          <div class="inventory-valuation-strip">
            <div class="inventory-valuation-copy">
              <div class="panel-kicker">Provider</div>
              <h3>Inventory Valuation</h3>
              <p>Choose which Steam pricing measure should be used for the inventory total and the per-item stack values.</p>
            </div>

            <div class="inventory-valuation-controls">
              <label class="valuation-select-wrap">
                <span class="valuation-select-label">Price mode</span>
                <select name="valuationMode">
                  ${VALUATION_MODES.map((mode) => (
                    `<option value="${escapeHtml(mode.id)}"${state.valuationMode === mode.id ? " selected" : ""}>${escapeHtml(mode.label)}</option>`
                  )).join("")}
                </select>
              </label>

              <div class="inventory-valuation-status">
                <span class="panel-badge${state.valuationLoading ? "" : " muted"}">
                  ${state.valuationLoading
                    ? `Valuing ${escapeHtml(state.valuationProgress)}/${escapeHtml(state.valuationTotal)} marketable stacks...`
                    : `${escapeHtml(valuationSummary.pricedStacks)}/${escapeHtml(valuationSummary.marketableStacks)} marketable stacks valued`}
                </span>
                ${state.valuationError ? `<div class="auth-inline-error compact">${escapeHtml(state.valuationError)}</div>` : ""}
              </div>
            </div>
          </div>

          <div class="inventory-toolbar">
            <div class="inventory-toolbar-copy">
              <strong>${escapeHtml(state.inventoryItems.length)}</strong>
              <span>${state.inventoryLoading ? "raw Steam assets syncing from every page" : "raw Steam assets loaded from your full inventory"}</span>
            </div>
            <div class="inventory-toolbar-actions">
              ${state.hasMoreInventory
                ? `<button class="dashboard-btn secondary inventory-load-more" type="button" data-action="refresh-inventory" ${state.inventoryLoading ? "disabled" : ""}>
                    <i class="fa-solid fa-arrows-rotate"></i>
                    Resume Inventory Sync
                  </button>`
                : `<div class="panel-badge muted">Inventory sync ${state.inventoryItems.length ? "ready" : "waiting"}</div>`}
            </div>
          </div>

          <div class="inventory-controls">
            <label class="inventory-search">
              <span class="inventory-search-icon">
                <i class="fa-solid fa-magnifying-glass"></i>
              </span>
              <span class="inventory-search-copy">
                <span class="inventory-search-label">Search Inventory</span>
                <input
                  type="text"
                  name="query"
                  value="${escapeHtml(state.filters.query)}"
                  placeholder="Filter by item name, weapon, or type"
                >
              </span>
            </label>
          </div>

          ${state.inventoryError
            ? `<div class="auth-inline-error wide">${escapeHtml(state.inventoryError)}<br>If your Steam inventory is private, Steam may block this data.</div>`
            : ""}

          <div class="steam-dashboard-hint">
            Search your items, filter tradeable and marketable skins, and open any item on the Steam market from here.
          </div>

          <div class="roi-grid clean-grid inventory-grid">
            ${inventoryCards}
          </div>
        </div>
      </div>
    `;
  }

  function dashboardMarkupModern() {
    const user = state.user || {};
    const profileUrl = user.profile_url || "#";
    const profileOpenAttrs = user.profile_url
      ? `href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer"`
      : `href="javascript:void(0)" aria-disabled="true"`;

    return `
      <div class="inv-page inv-page-enter">
        ${bannerMarkup()}

        <header class="inv-topbar inv-animate">
          ${EMBEDDED ? inventoryMetricsMarkup() : `
          <div class="inv-profile">
            <div class="inv-avatar">
              ${sessionAvatarMarkup(user)}
            </div>
            <div class="inv-profile-copy">
              <h1>${escapeHtml(sessionDisplayName(user))}</h1>
            </div>
          </div>
          `}

          <div class="inv-topbar-actions" data-inventory-topbar-actions>
            <a class="inv-action" ${profileOpenAttrs}>
              <i class="fa-brands fa-steam"></i>
              Profile
            </a>
            <button class="inv-action${state.inventoryLoading && state.inventorySyncMode === "full" ? " is-loading" : ""}" type="button" data-action="refresh-inventory" ${state.inventoryLoading && state.inventorySyncMode === "full" ? "disabled" : ""} title="Fetch latest Steam inventory">
              <i class="fa-solid ${state.inventoryLoading && state.inventorySyncMode === "full" ? "fa-spinner fa-spin" : "fa-rotate-right"}"></i>
              ${state.inventoryLoading && state.inventorySyncMode === "full" ? "Refreshing…" : "Refresh"}
            </button>
            <button class="inv-action" type="button" data-action="export-excel" title="Download the current inventory as an Excel file">
              <i class="fa-solid fa-file-excel"></i>
              Export to Excel
            </button>
            ${inventoryAiActionMarkup()}
            <a class="inv-action danger" href="${escapeHtml(appUrl("steam_logout.php"))}">
              <i class="fa-solid fa-right-from-bracket"></i>
              Log out
            </a>
          </div>
        </header>

        ${EMBEDDED ? "" : inventoryMetricsMarkup()}

        <section class="inv-workspace" id="inventory-panel" data-inventory-panel>
          <div data-inventory-controls-host>
            ${inventoryControlsMarkup()}
          </div>

          <div class="inventory-panel-body">
            <div data-inventory-panel-body>
              ${inventoryPanelBodyMarkup()}
            </div>
          </div>
        </section>
      </div>
      <div data-modal-root>${itemChartDetailModalMarkup()}</div>
    `;
  }

  function buildWlSparklineSvg(prices) {
    const W = 160, H = 44;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const pts = prices.map(function(p, i) {
      const x = (i / Math.max(prices.length - 1, 1)) * W;
      const y = H - ((p - min) / range) * H;
      return (i === 0 ? "M" : "L") + " " + x.toFixed(1) + " " + y.toFixed(1);
    });
    const line = pts.join(" ");
    const area = line + " L " + W + " " + H + " L 0 " + H + " Z";
    const isUp = prices[prices.length - 1] >= prices[0];
    const stroke = isUp ? "#22c55e" : "#ef4444";
    const fill = isUp ? "rgba(34,197,94,0.14)" : "rgba(239,68,68,0.14)";
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="wl-spark-svg">'
      + '<path d="' + area + '" fill="' + fill + '"/>'
      + '<path d="' + line + '" fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
      + '</svg>';
  }

  function watchlistPanelMarkup() {
    let watched = [];
    try { watched = JSON.parse(localStorage.getItem("cs2_watchlist") || "[]"); } catch(e) {}

    const emptyState = `
      <div class="wl-empty">
        <i class="fa-regular fa-bell wl-empty-icon"></i>
        <p>No items watched yet. Open any skin page and click <strong>watchlist</strong> to track it here.</p>
      </div>`;

    const cards = watched.map(function(w, i) {
      const displayDate = w.addedAt
        ? new Date(w.addedAt).toLocaleDateString("en-GB", {day:"numeric",month:"short",year:"numeric"})
        : "";
      const itemHref = w.href || (w.itemId
        ? "item_page.php?item_id=" + encodeURIComponent(w.itemId)
          + "&display_name=" + encodeURIComponent(w.title || "")
          + (w.wear ? "&selected_wear=" + encodeURIComponent(w.wear) : "")
          + (w.image ? "&image=" + encodeURIComponent(w.image) : "")
        : "#");
      const imageHtml = w.image
        ? '<img src="' + escapeHtml(w.image) + '" alt="' + escapeHtml(w.title) + '" loading="lazy">'
        : '<div class="roi-placeholder"><span>' + escapeHtml((w.title || "CS").slice(0,2).toUpperCase()) + '</span></div>';

      return `
        <div class="roi-card clean-card wl-card" style="--card-glow:rgba(96,165,250,0.28);--card-delay:${Math.min(i,18)*32}ms;display:grid;" data-wl-key="${escapeHtml(w.key)}">
          <div class="roi-card-media clean-media">
            <div class="roi-card-glow"></div>
            ${imageHtml}
          </div>
          <div class="roi-card-copy clean-copy">
            <div class="roi-card-meta clean-meta">
              <span>WATCHLIST</span>
              ${displayDate ? `<span>${escapeHtml(displayDate)}</span>` : ""}
            </div>
            <h3>${escapeHtml(w.title || "Unknown item")}</h3>
            <p>${escapeHtml(w.wear || "All Conditions")}</p>
            <div class="wl-sparkline-wrap" data-wl-spark="${escapeHtml(w.key)}">
              <div class="wl-spark-loader"></div>
            </div>
            <div class="roi-card-price-line">
              <strong class="wl-price-value" data-wl-price="${escapeHtml(w.key)}">—</strong>
            </div>
            <div class="wl-card-actions">
              <a href="${escapeHtml(itemHref)}" class="wl-view-btn" target="_blank" rel="noopener noreferrer">
                <i class="fa-solid fa-chart-line"></i> View Chart
              </a>
              <button type="button" class="wl-remove-btn" data-action="wl-remove" data-wl-key="${escapeHtml(w.key)}" title="Remove from watchlist">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
        </div>`;
    }).join("");

    return `
      <div class="steam-dashboard-panel wl-panel" id="wl-panel">
        <div class="steam-dashboard-panel-head">
          <div>
            <div class="panel-kicker">Price Tracking</div>
            <h2>Watchlist <i class="fa-regular fa-bell" style="font-size:0.7em;opacity:0.6;margin-left:6px;"></i></h2>
          </div>
          <span class="panel-badge${watched.length ? "" : " muted"}">${watched.length} item${watched.length !== 1 ? "s" : ""}</span>
        </div>
        ${watched.length
          ? `<div class="roi-grid clean-grid wl-grid">${cards}</div>`
          : emptyState}
      </div>`;
  }

  function loadWatchlistCharts() {
    const panel = document.getElementById("wl-panel");
    if (!panel) return;
    const sparkHosts = panel.querySelectorAll("[data-wl-spark]");
    sparkHosts.forEach(function(host) {
      const key = host.getAttribute("data-wl-spark") || "";
      const parts = key.split(":");
      const itemId = parts[0];
      const wear = parts.slice(1).join(":");
      const priceEl = panel.querySelector('[data-wl-price="' + CSS.escape(key) + '"]');
      if (!itemId) return;
      const url = "get_market_chart_bundle.php?item_id=" + encodeURIComponent(itemId)
        + "&wear=" + encodeURIComponent(wear)
        + "&source=steam&days=30";
      fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          const series = Array.isArray(data.series) ? data.series : [];
          const prices = series.map(function(p) {
            return Number(p.price != null ? p.price : (p.close != null ? p.close : 0));
          }).filter(function(v) { return v > 0; });
          if (prices.length >= 2) {
            host.innerHTML = buildWlSparklineSvg(prices);
            if (priceEl) {
              const last = prices[prices.length - 1];
              priceEl.textContent = "€" + last.toFixed(2);
            }
          } else {
            host.innerHTML = "";
          }
        })
        .catch(function() { host.innerHTML = ""; });
    });
  }

  function syncMarkInventoryBridge() {
    if (!state.authenticated) {
      delete window.CS2MarkInventoryBridge;
      return;
    }

    window.CS2MarkInventoryBridge = {
      getSnapshot() {
        const groupedItems = groupInventoryItems(state.inventoryItems);
        const valuationSummary = inventoryValueSummary(groupedItems);
        return buildInventoryAiSnapshot(groupedItems, valuationSummary);
      },
      waitForValuation(maxMs = 8000) {
        return new Promise((resolve) => {
          const started = Date.now();
          const tick = () => {
            const groupedItems = groupInventoryItems(state.inventoryItems);
            const summary = inventoryValueSummary(groupedItems);
            if (!state.valuationLoading && Number(summary.pricedStacks) > 0) {
              resolve(true);
              return;
            }
            if (Date.now() - started >= maxMs) {
              resolve(false);
              return;
            }
            window.setTimeout(tick, 400);
          };
          tick();
        });
      },
    };
  }

  function render() {
    syncBodyClasses();

    if (state.authenticated) {
      mountSiteChrome();
      root.innerHTML = dashboardMarkupModern();
      syncMarkInventoryBridge();
      return;
    }

    unmountSiteChrome();
    delete window.CS2MarkInventoryBridge;

    if (state.isSignupPage) {
      root.innerHTML = signupMarkup();
      return;
    }

    if (state.sessionLoading) {
      root.innerHTML = `
        <div class="login-container">
          <div class="login-logo">
            <img src="logo.png?v=20260815-csprice-restore-1?v=20260815-csai-1" alt="CSAI">
          </div>
          <div class="login-title">Checking Steam session</div>
          <div class="login-sub">Loading your account state and preparing the tracker.</div>
        </div>
      `;
      return;
    }

    root.innerHTML = loginMarkup();
  }

  function updateFilters(target) {
    if (!target || !target.name) {
      return;
    }

    if (target.name === "valuationMode") {
      state.valuationMode = target.value || VALUATION_MODES[0].id;
      render();
      const provider = selectedProvider();
      if (state.authenticated && state.inventoryItems.length && !state.providerLoading[provider] && !state.providersLoaded[provider]) {
        loadSupplementalProviderQuotes([provider], {
          renderOnStart: true,
          renderOnFinish: true,
        });
      }
      return;
    }

    if (target.name === "chartRange") {
      state.chartRange = target.value || CHART_RANGES[CHART_RANGES.length - 1].id;
      render();
      return;
    }

    if (target.name === "query") {
      state.filters.query = target.value || "";
      scheduleInventorySearchRender();
      return;
    }

    if (target.name === "sortBy") {
      applyInventorySort(target.value || INVENTORY_SORTS[0].id);
      return;
    }

    if (target.name === "marketableOnly" || target.name === "tradableOnly") {
      state.filters[target.name] = Boolean(target.checked);
      syncInventoryFilterChipStates();
      requestInventoryGridAnimation();
      scheduleInventoryPanelRender("grid");
    }
  }

  function mergeInventoryItems(existingItems, nextItems) {
    const merged = existingItems.slice();
    const seen = new Set(existingItems.map((item) => String(item && item.asset_id ? item.asset_id : "")));

    nextItems.forEach((item) => {
      const assetId = String(item && item.asset_id ? item.asset_id : "");
      if (assetId && seen.has(assetId)) {
        return;
      }
      if (assetId) {
        seen.add(assetId);
      }
      merged.push(item);
    });

    return merged;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
      },
    });

    const json = await response.json().catch(() => {
      throw new Error("Server response was not valid JSON.");
    });

    if (!response.ok) {
      throw new Error(json && json.error ? json.error : `Request failed (${response.status})`);
    }

    return json;
  }

  function applySteamPriceRecord(item, record) {
    const entry = ensureValuationEntry(item);
    const marketHashName = inventoryMarketHashName(item);
    entry.marketHashName = marketHashName;
    const price = steamUnitPriceFromRecord(record);
    if (Number.isFinite(price)) {
      entry.modePrices = {
        ...entry.modePrices,
        steam_starting: price,
        steam_suggested: price,
      };
    }
    entry.steamUrl = String((record && record.market_url) || (item && item.market_url) || "");
    entry.cached = true;
    return entry;
  }

  function applySteamMarketActivity(item, activity) {
    const entry = ensureValuationEntry(item);
    entry.marketHashName = inventoryMarketHashName(item);
    entry.modePrices = {
      ...entry.modePrices,
      ...buildValuationModePrices(activity),
    };
    entry.cached = Boolean(activity && activity.cached);
    entry.steamHistory = Array.isArray(activity && activity.sales_history) ? activity.sales_history : [];
    entry.steamHistoryByRange = activity && activity.sales_history_by_range && typeof activity.sales_history_by_range === "object"
      ? activity.sales_history_by_range
      : null;
    entry.latestSales = Array.isArray(activity && activity.latest_sales) ? activity.latest_sales : [];
    entry.steamSummary = activity && activity.summary && typeof activity.summary === "object" ? activity.summary : {};
    entry.steamUrl = String(activity && activity.steam_url ? activity.steam_url : "");
    return entry;
  }

  function openInventoryItemDetailModal(itemKey) {
    const item = findGroupedInventoryItemByKey(itemKey);
    if (!item) {
      return;
    }

    const entry = ensureValuationEntry(item);
    const hasSteamRangeData = entry.steamHistoryByRange && typeof entry.steamHistoryByRange === "object";
    const hasSteamData = Array.isArray(entry.steamHistory) && entry.steamHistory.length > 0
      && Array.isArray(entry.latestSales) && entry.latestSales.length > 0
      && entry.steamSummary && Object.keys(entry.steamSummary).length > 0
      && hasSteamRangeData;
    state.modalChartRange = "all";
    state.itemDetailModal = {
      item,
      key: itemKey,
      tab: "history",
      loading: !hasSteamData,
      error: "",
    };
    renderModalPartial();

    if (!hasSteamData) {
      loadInventoryItemMarketDetail(item, itemKey);
    }
    loadInventoryItemProviderQuotes(item, itemKey);
  }

  async function loadInventoryItemMarketDetail(item, itemKey) {
    if (!item || !itemKey) {
      return;
    }

    try {
      const params = new URLSearchParams({
        market_hash_name: inventoryMarketHashName(item),
        app_id: TF2_MODE ? "440" : "730",
      });
      const activity = await fetchJson(`${appUrl("get_steam_market_activity.php")}?${params.toString()}`);
      applySteamMarketActivity(item, activity);

      if (state.itemDetailModal && state.itemDetailModal.key === itemKey) {
        state.itemDetailModal.loading = false;
        state.itemDetailModal.error = "";
        renderModalPartial();
      }
    } catch (error) {
      if (state.itemDetailModal && state.itemDetailModal.key === itemKey) {
        state.itemDetailModal.loading = false;
        state.itemDetailModal.error = error && error.message ? error.message : "Steam market data could not be loaded.";
        renderModalPartial();
      }
    }
  }

  async function loadInventoryItemProviderQuotes(item, itemKey) {
    if (!item || !itemKey || !item.marketable || TF2_MODE) {
      return;
    }

    const marketHashName = inventoryMarketHashName(item);
    if (!marketHashName) {
      return;
    }

    const entry = ensureValuationEntry(item);
    const prices = entry.modePrices || {};
    const needsSkinport = !Number.isFinite(Number(prices.skinport_min))
      && !Number.isFinite(Number(prices.skinport_suggested))
      && !Number.isFinite(Number(prices.skinport_mean));
    const needsCsfloat = !Number.isFinite(Number(prices.csfloat_lowest));
    const needsDmarket = !Number.isFinite(Number(prices.dmarket_lowest));
    const providers = [
      needsSkinport ? "skinport" : "",
      needsCsfloat ? "csfloat" : "",
      needsDmarket ? "dmarket" : "",
    ].filter(Boolean);

    if (!providers.length) {
      return;
    }

    entry.loadingProviders = {
      ...entry.loadingProviders,
      ...providers.reduce((flags, provider) => {
        flags[provider] = true;
        return flags;
      }, {}),
    };
    if (state.itemDetailModal && state.itemDetailModal.key === itemKey) {
      renderModalPartial();
    }

    try {
      const response = await fetch(appUrl("get_inventory_provider_quotes.php"), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          market_hash_names: [marketHashName],
          providers,
        }),
      });
      const json = await response.json().catch(() => {
        throw new Error("Provider quote response was not valid JSON.");
      });
      if (!response.ok || !json || json.success === false) {
        throw new Error(json && json.error ? json.error : `Provider quote request failed (${response.status})`);
      }

      const itemQuotes = json.quotes && json.quotes[marketHashName] && typeof json.quotes[marketHashName] === "object"
        ? json.quotes[marketHashName]
        : {};

      providers.forEach((provider) => {
        const providerQuote = itemQuotes[provider] || null;
        if (!providerQuote || providerQuote.available === false) {
          return;
        }

        const providerPrices = providerQuote.prices && typeof providerQuote.prices === "object" ? providerQuote.prices : {};
        entry.modePrices = {
          ...entry.modePrices,
          ...providerPrices,
        };
        entry.providerLinks = {
          ...entry.providerLinks,
          [`${provider}_item_page`]: providerQuote.item_page || "",
          [`${provider}_market_page`]: providerQuote.market_page || providerQuote.market_url || "",
        };
      });
    } catch (error) {
      entry.providerError = error && error.message ? error.message : "Provider quotes could not be loaded.";
    } finally {
      entry.loadingProviders = {
        ...entry.loadingProviders,
        ...providers.reduce((flags, provider) => {
          flags[provider] = false;
          return flags;
        }, {}),
      };

      if (state.itemDetailModal && state.itemDetailModal.key === itemKey) {
        renderModalPartial();
      }
    }
  }

  async function loadInventoryValuations(options) {
    if (!state.authenticated) {
      return;
    }

    const settings = options && typeof options === "object" ? options : {};
    const renderOnStart = settings.renderOnStart !== false;
    const renderOnFinish = settings.renderOnFinish !== false;
    const forceFresh = settings.forceFresh === true;
    // A cache pass must not cancel / overwrite an in-flight live refresh.
    if (!forceFresh && valuationForceFreshActive) {
      return;
    }
    const preserveValuations = settings.preserveValuations !== false;
    if (TF2_MODE) {
      // Prices came with the inventory (get_steam_inventory.php?app=440).
      const tf2Grouped = groupInventoryItems(state.inventoryItems);
      tf2Grouped.forEach((item) => {
        if (!item) {
          return;
        }
        const entry = ensureValuationEntry(item);
        const prices = item.tf2_prices && typeof item.tf2_prices === "object" ? item.tf2_prices : {};
        entry.modePrices = {
          steam_starting: positivePriceOrNull(prices.steam),
          mannco_lowest: positivePriceOrNull(prices.mannco),
          skinport_min: positivePriceOrNull(prices.skinport),
          dmarket_lowest: positivePriceOrNull(prices.dmarket),
        };
        // Metal price for items no market sells (a dropped weapon = 0.11 ref).
        entry.refPrice = positivePriceOrNull(item.ref_price);
        entry.refPriceEur = positivePriceOrNull(item.ref_price_eur);
        entry.steamUrl = item.market_url ? String(item.market_url) : "";
      });
      state.valuationLoading = false;
      state.valuationError = "";
      state.valuationProgress = tf2Grouped.length;
      state.valuationTotal = tf2Grouped.length;
      ["steam", "skinport", "csfloat", "dmarket"].forEach((provider) => {
        state.providersLoaded[provider] = true;
        state.providerLoading[provider] = false;
        state.providerErrors[provider] = "";
      });
      if (forceFresh) {
        valuationForceFreshActive = false;
      }
      if (renderOnStart || renderOnFinish) {
        scheduleInventoryPanelRender("heading");
        scheduleInventoryPanelRender("grid");
      }
      writeInventorySnapshot(String(state.user && state.user.steamid ? state.user.steamid : ""), {
        items: state.inventoryItems,
        totalInventoryCount: state.totalInventoryCount,
        pageCount: state.inventoryPagesLoaded,
        lastSyncedAt: state.lastInventoryLoadedAt,
        valuations: state.valuations,
      });
      return;
    }
    const groupedItems = sortInventoryItems(
      groupInventoryItems(state.inventoryItems).filter((item) => item.marketable && inventoryMarketHashName(item))
    );
    const names = Array.from(new Set(
      groupedItems
        .map((item) => inventoryMarketHashName(item))
        .filter(Boolean)
    ));
    const itemsByName = new Map();
    const itemsByNormalizedName = new Map();
    groupedItems.forEach((item) => {
      const name = inventoryMarketHashName(item);
      if (!name) {
        return;
      }
      if (!itemsByName.has(name)) {
        itemsByName.set(name, []);
      }
      itemsByName.get(name).push(item);

      const normalized = normalizeMarketHashName(name);
      if (!itemsByNormalizedName.has(normalized)) {
        itemsByNormalizedName.set(normalized, []);
      }
      itemsByNormalizedName.get(normalized).push(item);
    });

    const resolveItemsForPriceName = (marketHashName) => {
      const recordName = String(marketHashName || "").trim();
      if (!recordName) {
        return [];
      }
      const exact = itemsByName.get(recordName) || [];
      if (exact.length) {
        return exact;
      }
      const normalized = itemsByNormalizedName.get(normalizeMarketHashName(recordName)) || [];
      const [, recordWear] = splitSteamWearName(recordName);
      return normalized.filter((item) => {
        const itemHash = inventoryMarketHashName(item);
        const [, itemWear] = splitSteamWearName(itemHash);
        const taggedWear = String(item.exterior || item.wear || "");
        const wear = itemWear || taggedWear;
        // Never apply a wear-less / other-exterior quote onto a worn stack.
        if (wear && !recordWear) {
          return false;
        }
        if (wear && recordWear && wear.toLowerCase() !== recordWear.toLowerCase()) {
          return false;
        }
        return normalizeMarketHashName(itemHash) === normalizeMarketHashName(recordName);
      });
    };

    const applySteamRecords = (records) => {
      let applied = 0;
      (Array.isArray(records) ? records : []).forEach((record) => {
        const marketHashName = String(record && record.market_hash_name ? record.market_hash_name : "").trim();
        if (!marketHashName || !Number.isFinite(steamUnitPriceFromRecord(record))) {
          return;
        }
        const matched = resolveItemsForPriceName(marketHashName);
        matched.forEach((item) => {
          applySteamPriceRecord(item, record);
          applied += 1;
        });
      });
      return applied;
    };

    const unpricedSteamNames = () => names.filter((name) => {
      const items = itemsByName.get(name) || [];
      return !items.some((item) => Number.isFinite(inventorySteamUnitValue(state.valuations[inventoryGroupKey(item)])));
    });

    const applySteamPreload = () => {
      const bucket = window.__MARKET_PRICE_PRELOAD__ && window.__MARKET_PRICE_PRELOAD__.steam;
      if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
        return 0;
      }
      return applySteamRecords(names.map((name) => {
        const row = bucket[name];
        if (!row || typeof row !== "object") {
          return null;
        }
        return {
          ...row,
          market_hash_name: row.market_hash_name || name,
        };
      }).filter(Boolean));
    };

    const currentRequestId = valuationRequestId + 1;
    valuationRequestId = currentRequestId;
    if (forceFresh) {
      valuationForceFreshActive = true;
    }
    state.providersLoaded.steam = false;
    state.providerErrors.steam = "";
    state.providerLoading.steam = names.length > 0;

    state.valuationLoading = names.length > 0;
    state.valuationError = "";
    state.valuationProgress = 0;
    state.valuationTotal = names.length;
    if (!preserveValuations) {
      state.valuations = {};
    }
    if (renderOnStart) {
      scheduleInventoryPanelRender("heading");
      scheduleInventoryPanelRender("grid");
    }

    if (!names.length) {
      state.valuationLoading = false;
      state.providerLoading.steam = false;
      state.providersLoaded.steam = true;
      if (forceFresh && valuationRequestId === currentRequestId) {
        valuationForceFreshActive = false;
      }
      if (renderOnFinish || renderOnStart) {
        scheduleInventoryPanelRender("heading");
        scheduleInventoryPanelRender("grid");
      }
      return;
    }

    // Small chunks + steam_fast_overview: a 40-name live pass used to hit PHP's
    // 120s cap (wear listing scrapes) and leave every card as "—" / €0.00.
    const chunkSize = 5;

    const fetchSteamPriceChunk = async (chunk, liveFirst) => {
      const payload = {
        market_hash_names: chunk,
        source: "steam",
        allow_live_refresh: true,
        // Full market_hash_name (wear + StatTrak/Souvenir). Do not let a
        // wear-less catalog/FN seed overwrite exterior-specific Steam quotes.
        max_cache_age_hours: forceFresh || liveFirst ? 24 : 168,
        db_cache_first: !(forceFresh || liveFirst),
        skip_catalog_fallback: true,
        steam_fast_overview: true,
        skip_history: true,
      };
      if (forceFresh || liveFirst) {
        payload.prefer_live = true;
        payload.fresh = true;
      }

      const response = await fetch(appUrl("get_roi_prices_cached.php"), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json || json.success === false) {
        throw new Error(json && json.error ? json.error : `Steam price request failed (${response.status})`);
      }
      const records = Array.isArray(json.items) && json.items.length
        ? json.items
        : (Array.isArray(json.cases) ? json.cases : []);
      return applySteamRecords(records);
    };

    // Instant first pass: one cached-only request per 60 names (no live Steam
    // scrape) so every stack the price database already knows gets a value
    // and the total shows within a second. The live chunks below then fill
    // in / refresh whatever is still missing.
    const fetchSteamCachedPass = async (targetNames) => {
      for (let offset = 0; offset < targetNames.length; offset += 60) {
        if (valuationRequestId !== currentRequestId) {
          return;
        }
        const chunk = targetNames.slice(offset, offset + 60);
        try {
          const response = await fetch(appUrl("get_roi_prices_cached.php"), {
            method: "POST",
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              market_hash_names: chunk,
              source: "steam",
              allow_live_refresh: false,
              max_cache_age_hours: 720,
              db_cache_first: true,
              skip_catalog_fallback: true,
              steam_fast_overview: true,
              skip_history: true,
            }),
          });
          const json = await response.json().catch(() => null);
          if (!response.ok || !json || json.success === false) {
            continue;
          }
          const records = Array.isArray(json.items) && json.items.length
            ? json.items
            : (Array.isArray(json.cases) ? json.cases : []);
          if (applySteamRecords(records) > 0) {
            state.valuationProgress = Math.min(names.length - unpricedSteamNames().length, names.length);
            scheduleValuationProgressRender();
            scheduleInventoryPanelRender("heading");
            scheduleInventoryPanelRender("grid");
          }
        } catch (_error) {
          // The live pass below still runs for these names.
        }
      }
    };

    // Live chunks run three at a time instead of strictly one after another.
    const fetchSteamPriceChunks = async (targetNames, liveFirst) => {
      let lastError = "";
      const chunks = [];
      for (let offset = 0; offset < targetNames.length; offset += chunkSize) {
        chunks.push(targetNames.slice(offset, offset + chunkSize));
      }
      let cursor = 0;
      const worker = async () => {
        while (cursor < chunks.length) {
          if (valuationRequestId !== currentRequestId) {
            return;
          }
          const chunk = chunks[cursor];
          cursor += 1;
          try {
            await fetchSteamPriceChunk(chunk, liveFirst);
          } catch (chunkError) {
            lastError = chunkError && chunkError.message
              ? chunkError.message
              : "Steam price request failed.";
          }
          state.valuationProgress = Math.min(
            names.length - unpricedSteamNames().length,
            names.length
          );
          scheduleValuationProgressRender();
          scheduleInventoryPanelRender("heading");
          scheduleInventoryPanelRender("grid");
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, chunks.length || 1) }, worker));
      return lastError;
    };

    try {
      if (applySteamPreload() > 0) {
        scheduleInventoryPanelRender("heading");
        scheduleInventoryPanelRender("grid");
      }

      if (!forceFresh) {
        await fetchSteamCachedPass(unpricedSteamNames());
      }

      let lastError = await fetchSteamPriceChunks(unpricedSteamNames(), forceFresh);

      // Preload buckets are often empty (stale roi_prices). If every stack is
      // still unpriced, that is a fetch bug — retry wear-specific live Steam.
      const missingAfterCache = unpricedSteamNames();
      if (missingAfterCache.length && missingAfterCache.length === names.length) {
        lastError = await fetchSteamPriceChunks(missingAfterCache, true) || lastError;
      }

      if (unpricedSteamNames().length === names.length && names.length) {
        state.valuationError = lastError || "Steam prices could not be loaded for this inventory.";
        state.providerErrors.steam = state.valuationError;
      }

      writeInventorySnapshot(String(state.user && state.user.steamid ? state.user.steamid : ""), {
        items: state.inventoryItems,
        totalInventoryCount: state.totalInventoryCount,
        pageCount: state.inventoryPagesLoaded,
        lastSyncedAt: state.lastInventoryLoadedAt,
        valuations: state.valuations,
      });

      window.setTimeout(() => {
        loadSupplementalProviderQuotes(["skinport", "csfloat", "dmarket"], {
          renderOnStart: false,
          renderOnFinish: false,
        });
      }, 0);
    } catch (error) {
      if (valuationRequestId === currentRequestId) {
        state.valuationError = error && error.message ? error.message : "Inventory value could not be calculated.";
        state.providerErrors.steam = state.valuationError;
      }
    } finally {
      if (valuationRequestId === currentRequestId) {
        state.valuationLoading = false;
        state.providerLoading.steam = false;
        state.providersLoaded.steam = true;
        if (forceFresh) {
          valuationForceFreshActive = false;
        }
        if (renderOnFinish) {
          scheduleInventoryPanelRender("heading");
          scheduleInventoryPanelRender("grid");
        }
      }
    }
  }

  async function loadSupplementalProviderQuotes(providers, options) {
    if (TF2_MODE) {
      return;
    }
    const list = Array.isArray(providers) ? providers.filter(Boolean) : [];
    const settings = options && typeof options === "object" ? options : {};
    const renderOnStart = settings.renderOnStart !== false;
    const renderOnFinish = settings.renderOnFinish !== false;
    const names = groupInventoryItems(state.inventoryItems)
      .filter((item) => item && item.marketable && inventoryMarketHashName(item))
      .map((item) => inventoryMarketHashName(item))
      .filter(Boolean);

    if (!names.length || !list.length) {
      return;
    }

    const missingProviders = list.filter((provider) => settings.force || !state.providersLoaded[provider]);
    if (!missingProviders.length) {
      return;
    }

    missingProviders.forEach((provider) => {
      state.providerLoading[provider] = true;
      state.providerErrors[provider] = "";
    });

    if (renderOnStart) {
      scheduleInventoryPanelRender("heading");
      scheduleInventoryPanelRender("grid");
    }

    try {
      const response = await fetch(appUrl("get_inventory_provider_quotes.php"), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          market_hash_names: names,
          providers: missingProviders,
        }),
      });
      const json = await response.json().catch(() => {
        throw new Error("Provider quote response was not valid JSON.");
      });
      if (!response.ok || !json || json.success === false) {
        throw new Error(json && json.error ? json.error : `Provider quote request failed (${response.status})`);
      }

      const quotes = json.quotes && typeof json.quotes === "object" ? json.quotes : {};
      groupInventoryItems(state.inventoryItems).forEach((item) => {
        const quoteName = inventoryMarketHashName(item);
        if (!item || !item.marketable || !quoteName) {
          return;
        }

        const entry = ensureValuationEntry(item);
        const itemQuotes = quotes[quoteName] || quotes[String(item.name)] || {};
        missingProviders.forEach((provider) => {
          const providerQuote = itemQuotes[provider] || null;
          if (!providerQuote || providerQuote.available === false) {
            if (providerQuote && providerQuote.error && !state.providerErrors[provider]) {
              state.providerErrors[provider] = providerQuote.error;
            }
            return;
          }

          const prices = providerQuote.prices && typeof providerQuote.prices === "object" ? providerQuote.prices : {};
          entry.modePrices = {
            ...entry.modePrices,
            ...prices,
          };
          entry.providerLinks = {
            ...entry.providerLinks,
            [`${provider}_item_page`]: providerQuote.item_page || "",
            [`${provider}_market_page`]: providerQuote.market_page || providerQuote.market_url || "",
          };
        });
      });
    } catch (error) {
      const message = error && error.message ? error.message : "Provider quotes could not be loaded.";
      missingProviders.forEach((provider) => {
        if (!state.providerErrors[provider]) {
          state.providerErrors[provider] = message;
        }
      });
    } finally {
      missingProviders.forEach((provider) => {
        state.providersLoaded[provider] = true;
        state.providerLoading[provider] = false;
      });

      if (renderOnFinish) {
        scheduleInventoryPanelRender("heading");
        scheduleInventoryPanelRender("grid");
      }
    }
  }

  async function loadSession() {
    state.sessionError = "";
    const hadCachedAuth = state.authenticated;

    if (!hadCachedAuth) {
      state.sessionLoading = true;
      render();
    }

    try {
      const json = await fetchJson(appUrl("get_steam_session.php"));
      state.authenticated = Boolean(json.authenticated);
      state.user = json.user || null;
      state.oauth = {
        google: Boolean(json.oauth && json.oauth.google),
        discord: Boolean(json.oauth && json.oauth.discord),
      };
      state.sessionError = json.error || "";
      writeCachedSteamSession({
        authenticated: state.authenticated,
        user: state.user,
      });
    } catch (error) {
      state.authenticated = false;
      state.user = null;
      state.sessionError = error && error.message
        ? error.message
        : "Steam session could not be loaded. Make sure Apache is running in XAMPP and open the site through localhost.";
      writeCachedSteamSession({
        authenticated: false,
        user: null,
      });
    } finally {
      state.sessionLoading = false;
    }

    if (!state.authenticated) {
      render();
      return;
    }

    if (!state.inventoryItems.length) {
      applyInventorySnapshot(readInventorySnapshot(String(state.user && state.user.steamid ? state.user.steamid : "")));
    }

    if (hadCachedAuth) {
      requestInventoryGridAnimation();
      scheduleInventoryPanelRender("heading");
      scheduleInventoryPanelRender("grid");
    } else {
      render();
    }

    // One inventory load owns valuation refresh. Starting a separate forceFresh
    // pass here used to get cancelled by the cache pass below and leave stale € prices.
    void loadInventory({
      background: true,
      refresh: false,
      forceValuationFresh: false,
    });
  }


  function syncInventoryRefreshControls() {
    const busy = Boolean(state.inventoryLoading && state.inventorySyncMode === "full");
    root.querySelectorAll('[data-action="refresh-inventory"]').forEach((btn) => {
      btn.disabled = busy;
      btn.classList.toggle("is-loading", busy);
      btn.title = busy ? "Fetching Steam inventory…" : "Refresh inventory and live Steam prices";
      const icon = btn.querySelector("i");
      if (icon) {
        icon.className = busy ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-rotate-right";
      }
      const label = busy ? "Refreshing…" : (btn.classList.contains("dashboard-btn") ? "Refresh Inventory" : "Refresh");
      const nodes = Array.from(btn.childNodes);
      let textNode = nodes.find((node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || "").trim());
      if (!textNode) {
        textNode = document.createTextNode(` ${label}`);
        btn.appendChild(textNode);
      } else {
        textNode.textContent = ` ${label}`;
      }
    });
  }

  async function loadInventory(options) {
    const settings = options && typeof options === "object" ? options : {};
    const refresh = Boolean(settings.refresh);
    const background = settings.background !== false;
    const hardReset = Boolean(settings.reset) && !background;
    const forceValuationFresh = Boolean(settings.forceValuationFresh) || refresh;
    const hasItems = state.inventoryItems.length > 0;

    if (!state.authenticated) {
      return;
    }

    if (state.inventoryLoading && !background) {
      return;
    }

    if (background) {
      state.inventorySyncing = true;
    } else {
      state.inventoryLoading = true;
    }
    state.inventorySyncMode = refresh ? "full" : "cache";
    state.inventoryError = "";
    if (refresh) {
      syncInventoryRefreshControls();
    }

    if (hardReset) {
      state.inventoryItems = [];
      state.totalInventoryCount = 0;
      state.inventoryPagesLoaded = 0;
      state.lastInventoryLoadedAt = "";
      state.hasMoreInventory = false;
      state.inventoryCursor = "";
      state.valuationLoading = false;
      state.valuationError = "";
      state.valuationProgress = 0;
      state.valuationTotal = 0;
      state.valuations = {};
      state.providersLoaded = {
        steam: false,
        skinport: false,
        csfloat: false,
        dmarket: false,
      };
      state.providerLoading = {
        steam: false,
        skinport: false,
        csfloat: false,
        dmarket: false,
      };
      state.providerErrors = {
        steam: "",
        skinport: "",
        csfloat: "",
        dmarket: "",
      };
      inventoryHasAnimatedOnce = false;
      requestInventoryGridAnimation();
      scheduleInventoryPanelRender("heading");
      scheduleInventoryPanelRender("grid");
    } else if (hasItems) {
      scheduleInventoryPanelRender("heading");
    }

    try {
      const params = new URLSearchParams({ count: "200" });
      if (refresh) {
        params.set("refresh", "1");
      }
      if (TF2_MODE) {
        params.set("app", "440");
      }

      const json = await fetchJson(`${appUrl("get_steam_inventory.php")}?${params.toString()}`);
      const inventory = json.inventory || {};
      const nextItems = Array.isArray(inventory.items) ? inventory.items : [];

      if (refresh || nextItems.length || !hasItems) {
        state.inventoryItems = nextItems.slice();
        state.totalInventoryCount = Number(inventory.total_inventory_count || nextItems.length || 0);
        state.inventoryPagesLoaded = Number(inventory.page_count || 1);
        state.lastInventoryLoadedAt = inventory.last_synced_at || new Date().toISOString();
      }

      if (nextItems.length && (!hasItems || refresh || hardReset)) {
        requestInventoryGridAnimation();
      }

      state.hasMoreInventory = false;
      state.inventoryCursor = "";
      writeInventorySnapshot(String(state.user && state.user.steamid ? state.user.steamid : ""), {
        items: state.inventoryItems,
        totalInventoryCount: state.totalInventoryCount,
        pageCount: state.inventoryPagesLoaded,
        lastSyncedAt: state.lastInventoryLoadedAt,
        valuations: state.valuations,
      });

      scheduleInventoryPanelRender("heading");
      scheduleInventoryPanelRender("grid");

      if (state.inventoryItems.length) {
        loadInventoryValuations({
          renderOnStart: true,
          renderOnFinish: true,
          preserveValuations: true,
          forceFresh: forceValuationFresh,
        });
      }
    } catch (error) {
      state.inventoryError = error && error.message
        ? error.message
        : "Inventory could not be loaded. Make sure Apache is running in XAMPP and your Steam inventory is public.";
      if (!hasItems && !state.inventoryItems.length) {
        scheduleInventoryPanelRender("grid");
      } else if (refresh) {
        window.alert(state.inventoryError);
      }
    } finally {
      state.inventoryLoading = false;
      state.inventorySyncing = false;
      state.inventorySyncMode = "idle";
      if (refresh) {
        syncInventoryRefreshControls();
      }
      scheduleInventoryPanelRender("heading");
      if (refresh) {
        scheduleInventoryPanelRender("grid");
      }
    }
  }

  root.addEventListener("input", (event) => {
    updateFilters(event.target);
  });

  root.addEventListener("change", (event) => {
    updateFilters(event.target);
  });

  root.addEventListener("pointermove", (event) => {
    const chart = event.target.closest(".inventory-market-tv-chart[data-inventory-chart-points]");
    if (!chart) {
      return;
    }
    updateInventoryChartHover(chart, event);
  });

  root.addEventListener("pointerout", (event) => {
    const chart = event.target.closest(".inventory-market-tv-chart[data-inventory-chart-points]");
    if (!chart || chart.contains(event.relatedTarget)) {
      return;
    }
    hideInventoryChartHover(chart);
  });

  root.addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-sort-root]")) {
      event.stopPropagation();
    }
  }, true);

  root.addEventListener("click", (event) => {
    const sortAction = event.target.closest('[data-action="toggle-sort-menu"], [data-action="set-sort"]');
    if (sortAction) {
      event.preventDefault();
      event.stopPropagation();
      const action = sortAction.getAttribute("data-action");
      if (action === "toggle-sort-menu") {
        state.sortMenuOpen = !state.sortMenuOpen;
        syncSortMenuState();
        return;
      }
      if (action === "set-sort") {
        applyInventorySort(sortAction.getAttribute("data-sort") || INVENTORY_SORTS[0].id);
        return;
      }
    }

    if (state.sortMenuOpen && !event.target.closest("[data-sort-root]")) {
      state.sortMenuOpen = false;
      syncSortMenuState();
    }

    const target = event.target.closest("[data-action], [data-market-url], [data-item-href]");
    if (!target) {
      return;
    }

    const itemKey = target.getAttribute("data-item-key");
    const itemHref = target.getAttribute("data-item-href");
    const action = target.getAttribute("data-action");
    if (action === "open-item-modal" && itemKey) {
      openInventoryItemDetailModal(itemKey);
      return;
    }

    if (itemHref) {
      window.open(itemHref, "_blank", "noopener,noreferrer");
      return;
    }

    const marketUrl = target.getAttribute("data-market-url");
    if (marketUrl) {
      window.open(marketUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (action === "refresh-inventory") {
      if (state.inventoryLoading && state.inventorySyncMode === "full") {
        return;
      }
      void loadInventory({
        refresh: true,
        background: false,
      });
      return;
    }

    if (action === "analyze-inventory") {
      runInventoryAiAnalysis();
      return;
    }

    if (action === "set-item-modal-tab") {
      if (state.itemDetailModal) {
        state.itemDetailModal.tab = target.getAttribute("data-tab") === "latest" ? "latest" : "history";
        const item = state.itemDetailModal.item || null;
        const itemKey = state.itemDetailModal.key || (item ? inventoryGroupKey(item) : "");
        const valuation = itemKey ? state.valuations[itemKey] || null : null;
        const latestSales = Array.isArray(valuation && valuation.latestSales) ? valuation.latestSales : [];
        if (state.itemDetailModal.tab === "latest" && item && itemKey && !latestSales.length && !state.itemDetailModal.loading) {
          state.itemDetailModal.loading = true;
          loadInventoryItemMarketDetail(item, itemKey);
        }
        renderModalChartPartial();
      }
      return;
    }

    if (action === "set-modal-chart-range") {
      state.modalChartRange = target.getAttribute("data-range") || "all";
      renderModalChartPartial();
      return;
    }

    if (action === "set-modal-sales-period") {
      const period = target.getAttribute("data-period") || "day";
      state.modalSalesPeriod = SALES_PERIODS.some((entry) => entry.id === period) ? period : "day";
      renderModalChartPartial();
      return;
    }

    if (action === "set-chart-range") {
      state.chartRange = target.getAttribute("data-range") || CHART_RANGES[CHART_RANGES.length - 1].id;
      render();
      return;
    }

    if (action === "clear-filters") {
      state.filters.query = "";
      state.filters.marketableOnly = false;
      state.filters.tradableOnly = false;
      state.filterPanelOpen = false;
      state.sortMenuOpen = false;
      const queryInput = root.querySelector('input[name="query"]');
      if (queryInput) {
        queryInput.value = "";
      }
      syncInventoryFilterChipStates();
      scheduleInventorySearchRender();
      return;
    }

    if (action === "toggle-filter-panel") {
      state.filterPanelOpen = !state.filterPanelOpen;
      scheduleInventoryPanelRender("controls");
      return;
    }

    if (action === "close-item-modal") {
      state.itemDetailModal = null;
      renderModalPartial();
      return;
    }

    if (action === "export-excel" || action === "export-csv") {
      event.preventDefault();
      exportInventoryExcel();
      return;
    }

  });

  root.addEventListener("keydown", (event) => {
    const target = event.target.closest('[data-action="open-item-modal"][data-item-key], [data-item-href]');
    if (!target) {
      if (event.key === "Escape" && state.itemDetailModal) {
        state.itemDetailModal = null;
        renderModalPartial();
      }
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    const itemHref = target.getAttribute("data-item-href");
    if (itemHref) {
      window.open(itemHref, "_blank", "noopener,noreferrer");
      return;
    }

    const itemKey = target.getAttribute("data-item-key");
    if (!itemKey) {
      return;
    }

    openInventoryItemDetailModal(itemKey);
  });

  render();

  if (window.CS2React && typeof window.CS2React.ensureChatWidget === "function") {
    window.CS2React.ensureChatWidget();
  }

  if (!isSignupPage) {
    loadSession();
  }
})();
