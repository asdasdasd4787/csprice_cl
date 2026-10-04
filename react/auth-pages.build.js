(() => {
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
      return /* @__PURE__ */ React.createElement("div", { className: `auth-status ${copy.tone}` }, copy.text);
    }
    function itemQuantity(item) {
      const quantity = Number(item?.amount || 1);
      return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    }
    function groupInventoryItems(items) {
      const groups = /* @__PURE__ */ new Map();
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
      return /* @__PURE__ */ React.createElement("div", { className: "inventory-card" }, /* @__PURE__ */ React.createElement("div", { className: "inventory-card-media" }, item.total_quantity > 1 ? /* @__PURE__ */ React.createElement("div", { className: "inventory-stack-badge" }, "x", item.total_quantity) : null, item.icon ? /* @__PURE__ */ React.createElement("img", { src: item.icon, alt: item.display_name || item.name }) : /* @__PURE__ */ React.createElement("div", { className: "inventory-placeholder" }, "CS2")), /* @__PURE__ */ React.createElement("div", { className: "inventory-card-copy" }, /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "inventory-card-name",
          style: item.name_color ? { color: `#${item.name_color}` } : void 0
        },
        item.display_name || item.name
      ), /* @__PURE__ */ React.createElement("div", { className: "inventory-card-sub" }, item.type || item.name, item.asset_instances > 1 ? ` - ${item.asset_instances} stacks` : "")), /* @__PURE__ */ React.createElement("div", { className: "inventory-card-flags" }, /* @__PURE__ */ React.createElement("span", { className: `inventory-flag${item.marketable ? " on" : ""}` }, "Market"), /* @__PURE__ */ React.createElement("span", { className: `inventory-flag${item.tradable ? " on" : ""}` }, "Trade")));
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
        fetch(`get_steam_inventory.php?${params.toString()}`).then((response) => {
          if (!response.ok) throw new Error(`Inventory request failed (${response.status})`);
          return response.json();
        }).then((json) => {
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
        }).catch((error) => {
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
        fetch("get_steam_session.php").then((response) => {
          if (!response.ok) throw new Error(`Session request failed (${response.status})`);
          return response.json();
        }).then((json) => {
          if (cancelled) return;
          setSessionState({
            loading: false,
            authenticated: Boolean(json.authenticated),
            user: json.user || null,
            error: json.error || ""
          });
          if (json.authenticated && String(json.user?.steamid || "").trim()) {
            loadInventory();
          }
        }).catch((error) => {
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
        return /* @__PURE__ */ React.createElement("div", { className: "login-container" }, /* @__PURE__ */ React.createElement("div", { className: "login-logo" }, /* @__PURE__ */ React.createElement("img", { src: "logo.png", alt: "CS2 Market" })), /* @__PURE__ */ React.createElement("div", { className: "login-title" }, "Checking Steam session"), /* @__PURE__ */ React.createElement("div", { className: "login-sub" }, "Loading your account state and preparing the inventory view."));
      }
      if (!sessionState.authenticated) {
        return /* @__PURE__ */ React.createElement("div", { className: "login-container" }, /* @__PURE__ */ React.createElement("div", { className: "login-logo" }, /* @__PURE__ */ React.createElement("img", { src: "logo.png", alt: "CS2 Market" })), /* @__PURE__ */ React.createElement(StatusBanner, { status }), /* @__PURE__ */ React.createElement("div", { className: "login-title" }, "Welcome back"), /* @__PURE__ */ React.createElement("div", { className: "login-sub" }, "Sign in to track your inventory, prices, and ROI."), /* @__PURE__ */ React.createElement("a", { className: "steam-login", href: "steam_login.php" }, /* @__PURE__ */ React.createElement("i", { className: "fa-brands fa-steam" }), "Sign in with Steam"), sessionState.error && /* @__PURE__ */ React.createElement("div", { className: "auth-inline-error" }, sessionState.error), /* @__PURE__ */ React.createElement("div", { className: "login-footer" }, "You authenticate directly on Steam. We only store your SteamID in a local session — no password ever touches this server."));
      }
      const user = sessionState.user || {};
      const steamLinked = Boolean(String(user.steamid || "").trim());
      if (!steamLinked) {
        const providerLabel = user.provider === "google" ? "Google" : user.provider === "discord" ? "Discord" : "email";
        return /* @__PURE__ */ React.createElement("div", { className: "login-container" }, /* @__PURE__ */ React.createElement("div", { className: "login-logo" }, /* @__PURE__ */ React.createElement("img", { src: "logo.png", alt: "CS2 Market" })), /* @__PURE__ */ React.createElement(StatusBanner, { status }), /* @__PURE__ */ React.createElement("div", { className: "login-title" }, "Connect Steam to see your inventory"), /* @__PURE__ */ React.createElement("div", { className: "login-sub" }, "You are signed in with ", providerLabel, ". Your items live on Steam, so the inventory needs a Steam account linked to this one."), /* @__PURE__ */ React.createElement("a", { className: "steam-login", href: "steam_login.php" }, /* @__PURE__ */ React.createElement("i", { className: "fa-brands fa-steam" }), "Connect Steam"), sessionState.error && /* @__PURE__ */ React.createElement("div", { className: "auth-inline-error" }, sessionState.error), /* @__PURE__ */ React.createElement("div", { className: "login-footer" }, "Linking only stores your SteamID against this account — no password ever touches this server, and you stay signed in with ", providerLabel, "."));
      }
      return /* @__PURE__ */ React.createElement("div", { className: "steam-dashboard" }, /* @__PURE__ */ React.createElement(StatusBanner, { status }), /* @__PURE__ */ React.createElement("div", { className: "steam-dashboard-hero" }, /* @__PURE__ */ React.createElement("div", { className: "steam-dashboard-user" }, /* @__PURE__ */ React.createElement("div", { className: "steam-dashboard-avatar" }, user.avatar || user.picture ? /* @__PURE__ */ React.createElement("img", { src: user.avatar || user.picture, alt: user.persona_name || user.name || "Profile", referrerPolicy: "no-referrer" }) : /* @__PURE__ */ React.createElement("div", { className: "inventory-placeholder" }, "ST")), /* @__PURE__ */ React.createElement("div", { className: "steam-dashboard-copy" }, /* @__PURE__ */ React.createElement("div", { className: "steam-dashboard-kicker" }, user.provider === "google" ? "Google" : user.provider === "discord" ? "Discord" : "Steam", " Connected"), /* @__PURE__ */ React.createElement("h1", null, user.persona_name || user.display_name || user.name || "Signed in"), /* @__PURE__ */ React.createElement("p", null, user.state_message || "Steam session active for this browser."), /* @__PURE__ */ React.createElement("div", { className: "steam-dashboard-meta" }, /* @__PURE__ */ React.createElement("span", null, "SteamID: ", user.steamid), user.member_since ? /* @__PURE__ */ React.createElement("span", null, "Member since: ", user.member_since) : null))), /* @__PURE__ */ React.createElement("div", { className: "steam-dashboard-actions" }, /* @__PURE__ */ React.createElement("a", { className: "dashboard-btn secondary", href: user.profile_url || "#", target: "_blank", rel: "noreferrer" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-up-right-from-square" }), "Open Steam Profile"), /* @__PURE__ */ React.createElement("button", { className: "dashboard-btn", type: "button", onClick: () => loadInventory() }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-rotate-right" }), "Refresh Inventory"), /* @__PURE__ */ React.createElement("a", { className: "dashboard-btn danger", href: "steam_logout.php" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-right-from-bracket" }), "Log Out"))), /* @__PURE__ */ React.createElement("div", { className: "steam-dashboard-stats" }, /* @__PURE__ */ React.createElement("div", { className: "steam-stat-card" }, /* @__PURE__ */ React.createElement("span", null, "Total items"), /* @__PURE__ */ React.createElement("strong", null, inventoryState.total || inventoryState.items.length)), /* @__PURE__ */ React.createElement("div", { className: "steam-stat-card" }, /* @__PURE__ */ React.createElement("span", null, "Loaded assets"), /* @__PURE__ */ React.createElement("strong", null, inventoryState.items.length)), /* @__PURE__ */ React.createElement("div", { className: "steam-stat-card" }, /* @__PURE__ */ React.createElement("span", null, "Visible stacks"), /* @__PURE__ */ React.createElement("strong", null, groupedInventoryItems.length)), /* @__PURE__ */ React.createElement("div", { className: "steam-stat-card" }, /* @__PURE__ */ React.createElement("span", null, "Marketable"), /* @__PURE__ */ React.createElement("strong", null, inventorySummary.marketable)), /* @__PURE__ */ React.createElement("div", { className: "steam-stat-card" }, /* @__PURE__ */ React.createElement("span", null, "Tradable"), /* @__PURE__ */ React.createElement("strong", null, inventorySummary.tradable))), /* @__PURE__ */ React.createElement("div", { className: "steam-dashboard-panel" }, /* @__PURE__ */ React.createElement("div", { className: "steam-dashboard-panel-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "panel-kicker" }, "Primitive Inventory Interface"), /* @__PURE__ */ React.createElement("h2", null, "Counter-Strike Inventory")), inventoryState.loading ? /* @__PURE__ */ React.createElement("div", { className: "panel-badge" }, "Refreshing...") : /* @__PURE__ */ React.createElement("div", { className: "panel-badge" }, groupedInventoryItems.length, " stacks loaded")), /* @__PURE__ */ React.createElement("div", { className: "inventory-toolbar" }, /* @__PURE__ */ React.createElement("div", { className: "inventory-toolbar-copy" }, /* @__PURE__ */ React.createElement("strong", null, inventoryState.items.length), /* @__PURE__ */ React.createElement("span", null, "raw Steam assets loaded")), inventoryState.hasMore ? /* @__PURE__ */ React.createElement("button", { className: "dashboard-btn secondary inventory-load-more", type: "button", onClick: loadMoreInventory }, /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${inventoryState.loadingMore ? "fa-spinner fa-spin" : "fa-plus"}` }), inventoryState.loadingMore ? "Loading more..." : "Load More Inventory") : /* @__PURE__ */ React.createElement("div", { className: "panel-badge muted" }, "All currently fetched assets loaded")), inventoryState.error ? /* @__PURE__ */ React.createElement("div", { className: "auth-inline-error wide" }, inventoryState.error, /* @__PURE__ */ React.createElement("br", null), "If your inventory is private, Steam may refuse to expose the item list to this page.") : null, /* @__PURE__ */ React.createElement("div", { className: "inventory-grid" }, groupedInventoryItems.map((item) => /* @__PURE__ */ React.createElement(InventoryCard, { item, key: `${item.asset_id}-${item.class_id}-${item.instance_id}` }))), !inventoryState.loading && !inventoryState.error && !groupedInventoryItems.length ? /* @__PURE__ */ React.createElement("div", { className: "inventory-empty" }, "No inventory items were returned yet. Try refreshing, or make sure the Steam inventory is public.") : null));
    }
    function SignupPage() {
      return /* @__PURE__ */ React.createElement("div", { className: "auth-card" }, /* @__PURE__ */ React.createElement("div", { className: "auth-header" }, /* @__PURE__ */ React.createElement("h1", null, "Create Account"), /* @__PURE__ */ React.createElement("p", null, "Track prices, inventory & ROI in real time")), /* @__PURE__ */ React.createElement("form", null, /* @__PURE__ */ React.createElement("div", { className: "auth-field" }, /* @__PURE__ */ React.createElement("label", null, "Username"), /* @__PURE__ */ React.createElement("input", { type: "text", placeholder: "Your username" })), /* @__PURE__ */ React.createElement("div", { className: "auth-field" }, /* @__PURE__ */ React.createElement("label", null, "Email"), /* @__PURE__ */ React.createElement("input", { type: "email", placeholder: "you@email.com" })), /* @__PURE__ */ React.createElement("div", { className: "auth-field" }, /* @__PURE__ */ React.createElement("label", null, "Password"), /* @__PURE__ */ React.createElement("input", { type: "password", placeholder: "â€˘â€˘â€˘â€˘â€˘â€˘â€˘â€˘" })), /* @__PURE__ */ React.createElement("div", { className: "auth-field" }, /* @__PURE__ */ React.createElement("label", null, "Confirm Password"), /* @__PURE__ */ React.createElement("input", { type: "password", placeholder: "â€˘â€˘â€˘â€˘â€˘â€˘â€˘â€˘" })), /* @__PURE__ */ React.createElement("button", { className: "auth-btn" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-user-plus" }), " Create Account")), /* @__PURE__ */ React.createElement("div", { className: "auth-footer" }, "Already have an account?", " ", /* @__PURE__ */ React.createElement("a", { href: "login.html" }, "Log in")));
    }
    const path = window.location.pathname.toLowerCase();
    const page = /\/signup(\.html)?$/.test(path) ? /* @__PURE__ */ React.createElement(SignupPage, null) : /* @__PURE__ */ React.createElement(LoginPage, null);
    mountPage(page);
  })();
})();
