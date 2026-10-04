(() => {
  (() => {
    const { useEffect, useMemo, useState } = React;
    const { Layout, mountPage, classNames, useSteamSession } = window.CS2React;
    const WATCHLIST_KEY = "cs2_watchlist";
    const ALERTS_KEY = "cs2_price_alerts";
    function readWatchlist() {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch (_e) {
        return [];
      }
    }
    function writeWatchlist(items) {
      try {
        window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
      } catch (_e) {
      }
    }
    function readAlerts() {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(ALERTS_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch (_e) {
        return [];
      }
    }
    function writeAlerts(alerts) {
      try {
        window.localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
      } catch (_e) {
      }
    }
    function normalizeWatchlistItem(entry, index) {
      const id = String(entry?.id || entry?.key || entry?.itemId || `watch-${index}`);
      const name = String(entry?.name || entry?.title || entry?.marketHashName || "CS2 Item");
      const image = String(entry?.image || entry?.img || "");
      const href = String(entry?.item_page_url || entry?.href || "");
      const price = Number(entry?.current_price ?? entry?.price ?? 0);
      return {
        id,
        name,
        image,
        item_page_url: href,
        current_price: Number.isFinite(price) && price > 0 ? price : null,
        wear: entry?.wear || "",
        addedAt: entry?.addedAt || entry?.added_at || null,
        marketHashName: entry?.marketHashName || name
      };
    }
    function PriceAlertModal({ item, existingAlert, onSave, onClose }) {
      const [minPrice, setMinPrice] = useState(existingAlert ? String(existingAlert.min_price ?? "") : "");
      const [maxPrice, setMaxPrice] = useState(existingAlert ? String(existingAlert.max_price ?? "") : "");
      const [saved, setSaved] = useState(false);
      useEffect(() => {
        const onKey = (e) => {
          if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
      }, [onClose]);
      const handleSave = () => {
        const min = minPrice !== "" ? parseFloat(minPrice) : null;
        const max = maxPrice !== "" ? parseFloat(maxPrice) : null;
        if (min !== null && !Number.isFinite(min)) {
          alert("Please enter a valid minimum price.");
          return;
        }
        if (max !== null && !Number.isFinite(max)) {
          alert("Please enter a valid maximum price.");
          return;
        }
        if (min === null && max === null) {
          alert("Please enter at least one price threshold.");
          return;
        }
        onSave({
          item_id: item.id,
          item_name: item.name,
          min_price: min,
          max_price: max,
          email: String(existingAlert?.email || "").trim(),
          triggered: false,
          triggered_reason: null,
          read: false,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        });
        setSaved(true);
        window.setTimeout(() => onClose(), 1400);
      };
      return /* @__PURE__ */ React.createElement("div", { className: "watchlist-modal-backdrop", onClick: (e) => {
        if (e.target === e.currentTarget) onClose();
      } }, /* @__PURE__ */ React.createElement("div", { className: "watchlist-modal" }, /* @__PURE__ */ React.createElement("button", { className: "watchlist-modal-close", type: "button", onClick: onClose, "aria-label": "Close" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark" })), /* @__PURE__ */ React.createElement("div", { className: "watchlist-modal-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", null, "Price Alert"), /* @__PURE__ */ React.createElement("p", null, item.name))), saved ? /* @__PURE__ */ React.createElement("div", { className: "watchlist-modal-saved" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-check" }), "Alert saved! You'll get a notification when the price hits your threshold.") : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "watchlist-modal-field" }, /* @__PURE__ */ React.createElement("label", null, "Minimum Price (€)"), /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", placeholder: "e.g. 25.00", value: minPrice, onChange: (e) => setMinPrice(e.target.value) }), /* @__PURE__ */ React.createElement("span", { className: "watchlist-modal-hint" }, "Notify when price drops below this")), /* @__PURE__ */ React.createElement("div", { className: "watchlist-modal-field" }, /* @__PURE__ */ React.createElement("label", null, "Maximum Price (€)"), /* @__PURE__ */ React.createElement("input", { type: "text", inputMode: "decimal", placeholder: "e.g. 75.00", value: maxPrice, onChange: (e) => setMaxPrice(e.target.value) }), /* @__PURE__ */ React.createElement("span", { className: "watchlist-modal-hint" }, "Notify when price rises above this")), /* @__PURE__ */ React.createElement("div", { className: "watchlist-modal-actions" }, /* @__PURE__ */ React.createElement("button", { className: "watchlist-modal-btn secondary", type: "button", onClick: onClose }, "Cancel"), /* @__PURE__ */ React.createElement("button", { className: "watchlist-modal-btn primary", type: "button", onClick: handleSave }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-bell", "aria-hidden": "true" }), "Set Alert")))));
    }
    function WatchlistCard({ item, alertExists, onAlertClick, onRemove, index }) {
      return /* @__PURE__ */ React.createElement(
        "article",
        {
          className: "watchlist-card landing-card-visible",
          style: { "--card-stagger": `${Math.min(index, 12) * 40}ms` }
        },
        /* @__PURE__ */ React.createElement("div", { className: "watchlist-card-media" }, item.image ? /* @__PURE__ */ React.createElement("img", { src: item.image, alt: item.name, loading: "lazy", decoding: "async" }) : /* @__PURE__ */ React.createElement("div", { className: "watchlist-card-placeholder" }, "CS2"), item.wear ? /* @__PURE__ */ React.createElement("span", { className: "watchlist-card-wear" }, item.wear) : null),
        /* @__PURE__ */ React.createElement("div", { className: "watchlist-card-body" }, /* @__PURE__ */ React.createElement("div", { className: "watchlist-card-top" }, /* @__PURE__ */ React.createElement("h3", { className: "watchlist-card-name" }, item.name), item.current_price != null ? /* @__PURE__ */ React.createElement("span", { className: "watchlist-card-price" }, "€", Number(item.current_price).toFixed(2)) : /* @__PURE__ */ React.createElement("span", { className: "watchlist-card-price muted" }, "—")), /* @__PURE__ */ React.createElement("div", { className: "watchlist-card-actions" }, item.item_page_url ? /* @__PURE__ */ React.createElement("a", { href: item.item_page_url, className: "watchlist-card-btn primary" }, "View Details") : /* @__PURE__ */ React.createElement("span", { className: "watchlist-card-btn primary disabled" }, "View Details"), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: classNames("watchlist-card-btn alert-btn", alertExists && "active"),
            onClick: () => onAlertClick(item)
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-bell" })
        ), /* @__PURE__ */ React.createElement("button", { type: "button", className: "watchlist-card-btn remove-btn", onClick: () => onRemove(item.id), title: "Remove" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-trash-can" }))))
      );
    }
    function WatchlistPage() {
      const { authenticated, loginHref } = typeof useSteamSession === "function" ? useSteamSession() : { authenticated: false, loginHref: "login.html" };
      const [rawItems, setRawItems] = useState(() => readWatchlist());
      const [alerts, setAlerts] = useState(() => authenticated ? readAlerts() : []);
      const [alertModal, setAlertModal] = useState(null);
      const [search, setSearch] = useState("");
      const items = useMemo(
        () => rawItems.map(normalizeWatchlistItem),
        [rawItems]
      );
      useEffect(() => {
        setAlerts(authenticated ? readAlerts() : []);
      }, [authenticated]);
      useEffect(() => {
        const names = items.map((item) => item.marketHashName).filter(Boolean).slice(0, 24);
        if (!names.length) return void 0;
        let alive = true;
        fetch("get_roi_prices_cached.php", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            source: "steam",
            range: "30d",
            market_hash_names: names,
            steam_catalog_only: true
          })
        }).then((response) => response.ok ? response.json() : null).then((json) => {
          if (!alive || !json?.items) return;
          const lookup = new Map(
            json.items.map((row) => [String(row.market_hash_name || ""), Number(row.current_price || 0)])
          );
          setRawItems((current) => current.map((entry, index) => {
            const normalized = normalizeWatchlistItem(entry, index);
            const price = lookup.get(normalized.marketHashName);
            if (!Number.isFinite(price) || price <= 0) return entry;
            return Object.assign({}, entry, { current_price: price, price });
          }));
        }).catch(() => {
        });
        return () => {
          alive = false;
        };
      }, [items.length]);
      const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        let list = query ? items.filter((item) => item.name.toLowerCase().includes(query)) : [...items];
        list.sort((a, b) => Number(b.addedAt || 0) - Number(a.addedAt || 0));
        return list;
      }, [items, search]);
      const handleRemove = (itemId) => {
        const next = rawItems.filter((entry, index) => normalizeWatchlistItem(entry, index).id !== itemId);
        setRawItems(next);
        writeWatchlist(next);
      };
      const handleSaveAlert = (alert2) => {
        if (!authenticated) {
          window.location.href = loginHref;
          return;
        }
        const next = alerts.filter((a) => a.item_id !== alert2.item_id);
        next.push(alert2);
        setAlerts(next);
        writeAlerts(next);
      };
      const handleAlertClick = (entry) => {
        if (!authenticated) {
          window.location.href = loginHref;
          return;
        }
        setAlertModal(entry);
      };
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("section", { className: "watchlist-shell collections-shell" }, items.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "collections-controls watchlist-controls" }, /* @__PURE__ */ React.createElement("div", { className: "collections-search-wrap" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" }), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          placeholder: "Search watchlist...",
          value: search,
          onChange: (event) => setSearch(event.target.value)
        }
      ))) : null, items.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "watchlist-empty" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-bookmark", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("h2", null, "No items yet"), /* @__PURE__ */ React.createElement("p", null, "Add skins from market or item pages and they will show up here.")) : /* @__PURE__ */ React.createElement("div", { className: "watchlist-grid collections-grid-animated" }, filtered.map((item, index) => /* @__PURE__ */ React.createElement(
        WatchlistCard,
        {
          key: item.id,
          item,
          index,
          alertExists: Boolean(alerts.find((a) => a.item_id === item.id)),
          onAlertClick: handleAlertClick,
          onRemove: handleRemove
        }
      )))), alertModal ? /* @__PURE__ */ React.createElement(
        PriceAlertModal,
        {
          item: alertModal,
          existingAlert: alerts.find((a) => a.item_id === alertModal.id) || null,
          onSave: handleSaveAlert,
          onClose: () => setAlertModal(null)
        }
      ) : null);
    }
    mountPage(/* @__PURE__ */ React.createElement(WatchlistPage, null));
  })();
})();
