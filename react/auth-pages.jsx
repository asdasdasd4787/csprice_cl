(() => {
  const { useEffect, useMemo, useState } = React;
  const { mountPage } = window.CS2React;

  function StatusBanner({ status }) {
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

  function itemQuantity(item) {
    const quantity = Number(item?.amount || 1);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  }

  function groupInventoryItems(items) {
    const groups = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
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

  function InventoryCard({ item }) {
    return (
      <div className="inventory-card">
        <div className="inventory-card-media">
          {item.total_quantity > 1 ? <div className="inventory-stack-badge">x{item.total_quantity}</div> : null}
          {item.icon ? <img src={item.icon} alt={item.display_name || item.name} /> : <div className="inventory-placeholder">CS2</div>}
        </div>

        <div className="inventory-card-copy">
          <div
            className="inventory-card-name"
            style={item.name_color ? { color: `#${item.name_color}` } : undefined}
          >
            {item.display_name || item.name}
          </div>
          <div className="inventory-card-sub">
            {item.type || item.name}
            {item.asset_instances > 1 ? ` - ${item.asset_instances} stacks` : ""}
          </div>
        </div>

        <div className="inventory-card-flags">
          <span className={`inventory-flag${item.marketable ? " on" : ""}`}>Market</span>
          <span className={`inventory-flag${item.tradable ? " on" : ""}`}>Trade</span>
        </div>
      </div>
    );
  }

  function LoginPage() {
    const status = new URLSearchParams(window.location.search).get("auth");
    const [sessionState, setSessionState] = useState({
      loading: true,
      authenticated: false,
      user: null,
      error: ""
    });
    const [inventoryState, setInventoryState] = useState({
      loading: false,
      loadingMore: false,
      items: [],
      total: 0,
      nextCursor: "",
      hasMore: false,
      error: ""
    });

    const loadInventory = ({ append = false, cursor = "" } = {}) => {
      setInventoryState((current) => ({
        ...current,
        loading: !append,
        loadingMore: append,
        error: append ? current.error : ""
      }));

      const params = new URLSearchParams({
        count: "120"
      });

      if (cursor) {
        params.set("cursor", cursor);
      }

      fetch(`get_steam_inventory.php?${params.toString()}`)
        .then((response) => {
          if (!response.ok) throw new Error(`Inventory request failed (${response.status})`);
          return response.json();
        })
        .then((json) => {
          if (json && json.error) throw new Error(json.error);
          const inventory = json.inventory || {};
          const nextItems = Array.isArray(inventory.items) ? inventory.items : [];
          setInventoryState((current) => ({
            loading: false,
            loadingMore: false,
            items: append ? [...current.items, ...nextItems] : nextItems,
            total: Number(inventory.total_inventory_count || (append ? current.total : nextItems.length)),
            nextCursor: inventory.last_assetid || "",
            hasMore: Boolean(inventory.more_items && inventory.last_assetid),
            error: ""
          }));
        })
        .catch((error) => {
          setInventoryState((current) => ({
            ...current,
            loading: false,
            loadingMore: false,
            error: error.message || "Inventory could not be loaded."
          }));
        });
    };

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

          // Only fetch once a SteamID is actually linked. A Google/Discord/
          // email session has no inventory to read, and the request could only
          // come back empty or error.
          if (json.authenticated && String(json.user?.steamid || "").trim()) {
            loadInventory();
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

    const loadMoreInventory = () => {
      if (inventoryState.loadingMore || !inventoryState.hasMore || !inventoryState.nextCursor) {
        return;
      }

      loadInventory({
        append: true,
        cursor: inventoryState.nextCursor
      });
    };

    const groupedInventoryItems = useMemo(
      () => groupInventoryItems(inventoryState.items),
      [inventoryState.items]
    );

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

          <div className="login-title">Welcome back</div>
          <div className="login-sub">Sign in to track your inventory, prices, and ROI.</div>

          <a className="steam-login" href="steam_login.php">
            <i className="fa-brands fa-steam" />
            Sign in with Steam
          </a>

          {sessionState.error && <div className="auth-inline-error">{sessionState.error}</div>}

          <div className="login-footer">
            You authenticate directly on Steam. We only store your SteamID in a local session — no password ever touches this server.
          </div>
        </div>
      );
    }

    const user = sessionState.user || {};

    // The inventory is read straight off Steam, so a session that has no
    // SteamID behind it has nothing to show. Signing in with Google, Discord
    // or email authenticates the person but does not link a Steam account, and
    // the dashboard used to render anyway: "SteamID: undefined", an Open Steam
    // Profile link pointing at "#", and an inventory fetch that could only
    // fail. Gate on the SteamID rather than on being signed in, and offer the
    // link instead.
    const steamLinked = Boolean(String(user.steamid || "").trim());

    if (!steamLinked) {
      const providerLabel = user.provider === "google"
        ? "Google"
        : user.provider === "discord"
          ? "Discord"
          : "email";

      return (
        <div className="login-container">
          <div className="login-logo">
            <img src="logo.png" alt="CS2 Market" />
          </div>

          <StatusBanner status={status} />

          <div className="login-title">Connect Steam to see your inventory</div>
          <div className="login-sub">
            You are signed in with {providerLabel}. Your items live on Steam, so the
            inventory needs a Steam account linked to this one.
          </div>

          <a className="steam-login" href="steam_login.php">
            <i className="fa-brands fa-steam" />
            Connect Steam
          </a>

          {sessionState.error && <div className="auth-inline-error">{sessionState.error}</div>}

          <div className="login-footer">
            Linking only stores your SteamID against this account — no password
            ever touches this server, and you stay signed in with {providerLabel}.
          </div>
        </div>
      );
    }

    return (
      <div className="steam-dashboard">
        <StatusBanner status={status} />

        <div className="steam-dashboard-hero">
          <div className="steam-dashboard-user">
            <div className="steam-dashboard-avatar">
              {user.avatar || user.picture
                ? <img src={user.avatar || user.picture} alt={user.persona_name || user.name || "Profile"} referrerPolicy="no-referrer" />
                : <div className="inventory-placeholder">ST</div>}
            </div>

            <div className="steam-dashboard-copy">
              <div className="steam-dashboard-kicker">{user.provider === "google" ? "Google" : user.provider === "discord" ? "Discord" : "Steam"} Connected</div>
              <h1>{user.persona_name || user.display_name || user.name || "Signed in"}</h1>
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
            <button className="dashboard-btn" type="button" onClick={() => loadInventory()}>
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
              ? <div className="panel-badge">Refreshing...</div>
              : <div className="panel-badge">{groupedInventoryItems.length} stacks loaded</div>}
          </div>

          <div className="inventory-toolbar">
            <div className="inventory-toolbar-copy">
              <strong>{inventoryState.items.length}</strong>
              <span>raw Steam assets loaded</span>
            </div>
            {inventoryState.hasMore ? (
              <button className="dashboard-btn secondary inventory-load-more" type="button" onClick={loadMoreInventory}>
                <i className={`fa-solid ${inventoryState.loadingMore ? "fa-spinner fa-spin" : "fa-plus"}`} />
                {inventoryState.loadingMore ? "Loading more..." : "Load More Inventory"}
              </button>
            ) : (
              <div className="panel-badge muted">All currently fetched assets loaded</div>
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
              <InventoryCard item={item} key={`${item.asset_id}-${item.class_id}-${item.instance_id}`} />
            ))}
          </div>

          {!inventoryState.loading && !inventoryState.error && !groupedInventoryItems.length ? (
            <div className="inventory-empty">
              No inventory items were returned yet. Try refreshing, or make sure the Steam inventory is public.
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function SignupPage() {
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
  const page = /\/signup(\.html)?$/.test(path) ? <SignupPage /> : <LoginPage />;
  mountPage(page);
})();
