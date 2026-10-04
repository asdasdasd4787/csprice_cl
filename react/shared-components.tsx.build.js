(() => {
  (() => {
    const { useDeferredValue, useEffect, useRef, useState } = React;
    const data = window.CS2ReactData;
    function classNames(...parts) {
      return parts.filter(Boolean).join(" ");
    }
    function normalize(text) {
      return String(text || "").toLowerCase();
    }
    function matchesQuery(text, query) {
      const value = normalize(query).trim();
      if (!value) return true;
      return normalize(text).includes(value);
    }
    function slugifyAssetName(text) {
      return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }
    function resolveWeaponNavEntry(item, fallbackFolder) {
      if (typeof item === "string") {
        return {
          label: item,
          folder: fallbackFolder,
          fileName: slugifyAssetName(item)
        };
      }
      return {
        label: item?.label || item?.name || "",
        folder: item?.folder || fallbackFolder || "rifles",
        fileName: item?.fileName || slugifyAssetName(item?.label || item?.name || "")
      };
    }
    const RARITY_COLORS = {
      EB4B4B: "Covert",
      D32CE6: "Classified",
      "8847FF": "Restricted",
      "4B69FF": "Mil-Spec",
      "5E98D9": "Industrial Grade",
      B0C3D9: "Consumer Grade",
      E4AE39: "Extraordinary",
      CFB97F: "High Grade",
      FAFAFA: "High Grade"
    };
    function rarityLabel(hex) {
      const key = String(hex || "").toUpperCase().replace("#", "").slice(0, 6);
      return RARITY_COLORS[key] || "Item";
    }
    function typeLabel(item) {
      const tn = String(item.type_note || "");
      const cat = String(item.category || "");
      if (cat === "knives") return "Knife";
      if (cat === "gloves") return "Gloves";
      if (cat === "agents") return "Agent";
      if (cat === "cases") return "Case";
      if (cat === "stickers") {
        if (tn.toLowerCase().includes("autograph")) return "Autograph Sticker";
        if (tn.toLowerCase().includes("tournament")) return "Tournament Sticker";
        return "Sticker";
      }
      if (cat === "music") return "Music Kit";
      if (cat === "patches") return "Patch";
      if (cat === "skins") return "Skin";
      return tn || "Item";
    }
    function buildSearchHref(item) {
      const name = String(item.display_name || item.market_hash_name || "");
      if (name.includes("|")) {
        return "item_page.html?" + new URLSearchParams({
          lookup_name: name,
          display_name: name,
          image: item.image || "",
          market_url: "https://steamcommunity.com/market/listings/730/" + encodeURIComponent(item.market_hash_name),
          type: item.type_note || "",
          color: item.name_color || "B0C3D9",
          selected_wear: item.selected_wear || ""
        }).toString();
      }
      return "https://steamcommunity.com/market/listings/730/" + encodeURIComponent(item.market_hash_name || name);
    }
    function SearchResultRow({ item, onClose }) {
      const tl = typeLabel(item);
      const price = item.seed_sell_price != null ? "$" + Number(item.seed_sell_price).toFixed(2) : "-";
      const offers = item.seed_sell_listings != null ? item.seed_sell_listings + " Offers" : "";
      const href = buildSearchHref(item);
      const isExternal = !href.startsWith("item_page");
      return /* @__PURE__ */ React.createElement(
        "a",
        {
          className: "srch-row",
          href,
          target: isExternal ? "_blank" : void 0,
          rel: isExternal ? "noreferrer" : void 0,
          onClick: onClose
        },
        /* @__PURE__ */ React.createElement("div", { className: "srch-row-img" }, item.image ? /* @__PURE__ */ React.createElement("img", { src: item.image, alt: item.display_name || item.market_hash_name, loading: "lazy" }) : /* @__PURE__ */ React.createElement("span", { className: "srch-row-placeholder" }, "CS")),
        /* @__PURE__ */ React.createElement("div", { className: "srch-row-body" }, /* @__PURE__ */ React.createElement("div", { className: "srch-row-badges" }, /* @__PURE__ */ React.createElement("span", { className: "srch-badge type" }, tl)), /* @__PURE__ */ React.createElement("div", { className: "srch-row-name" }, item.display_name || item.market_hash_name)),
        /* @__PURE__ */ React.createElement("div", { className: "srch-row-right" }, /* @__PURE__ */ React.createElement("div", { className: "srch-row-price" }, price), offers && /* @__PURE__ */ React.createElement("div", { className: "srch-row-offers" }, offers))
      );
    }
    function SearchOverlay({ onClose }) {
      const [query, setQuery] = useState("");
      const [results, setResults] = useState([]);
      const [fetching, setFetching] = useState(false);
      const [filters, setFilters] = useState({ stattrak: false, souvenir: false, wearOrder: false });
      const deferredQuery = useDeferredValue(query);
      const inputRef = useRef(null);
      const timerRef = useRef(null);
      const abortRef = useRef(null);
      useEffect(() => {
        if (inputRef.current) inputRef.current.focus();
        const onKey = (event) => {
          if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        return () => {
          document.removeEventListener("keydown", onKey);
          document.body.style.overflow = "";
        };
      }, []);
      useEffect(() => {
        window.clearTimeout(timerRef.current);
        if (abortRef.current) abortRef.current.abort();
        const q = deferredQuery.trim();
        if (q.length < 2) {
          setResults([]);
          setFetching(false);
          return void 0;
        }
        timerRef.current = window.setTimeout(() => {
          const controller = new AbortController();
          abortRef.current = controller;
          setFetching(true);
          fetch("search_items.php?q=" + encodeURIComponent(q) + "&limit=12", { signal: controller.signal }).then((response) => response.json()).then((payload) => {
            let items = Array.isArray(payload.items) ? payload.items : [];
            if (filters.wearOrder) {
              const wearRank = { "Factory New": 1, "Minimal Wear": 2, "Field-Tested": 3, "Well-Worn": 4, "Battle-Scarred": 5 };
              items = [...items].sort((a, b) => (wearRank[a.selected_wear] || 9) - (wearRank[b.selected_wear] || 9));
            }
            if (filters.stattrak) {
              items = [...items].sort((a) => a.market_hash_name.includes("StatTrak") ? -1 : 1);
            }
            if (filters.souvenir) {
              items = [...items].sort((a) => a.market_hash_name.includes("Souvenir") ? -1 : 1);
            }
            setResults(items);
          }).catch((error) => {
            if (error.name !== "AbortError") setResults([]);
          }).finally(() => {
            if (!controller.signal.aborted) setFetching(false);
          });
        }, 120);
        return () => {
          window.clearTimeout(timerRef.current);
          if (abortRef.current) abortRef.current.abort();
        };
      }, [deferredQuery, filters]);
      const toggleFilter = (key) => setFilters((current) => ({ ...current, [key]: !current[key] }));
      const chips = [
        { key: "stattrak", label: "StatTrak\u2122 First" },
        { key: "souvenir", label: "Souvenir First" },
        { key: "wearOrder", label: "Wear Order" }
      ];
      return /* @__PURE__ */ React.createElement("div", { className: "srch-overlay", onMouseDown: (event) => {
        if (event.target === event.currentTarget) onClose();
      } }, /* @__PURE__ */ React.createElement("div", { className: "srch-box" }, /* @__PURE__ */ React.createElement("div", { className: "srch-input-row" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass srch-icon" }), /* @__PURE__ */ React.createElement(
        "input",
        {
          ref: inputRef,
          className: "srch-input",
          type: "text",
          value: query,
          onChange: (event) => setQuery(event.target.value),
          placeholder: "Search skins, cases, stickers...",
          autoComplete: "off",
          spellCheck: false
        }
      ), fetching && /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-spinner fa-spin srch-spin" }), /* @__PURE__ */ React.createElement("button", { className: "srch-close", onClick: onClose, "aria-label": "Close" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark" }))), /* @__PURE__ */ React.createElement("div", { className: "srch-chips" }, chips.map((chip) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: chip.key,
          type: "button",
          className: classNames("srch-chip", filters[chip.key] && "active"),
          onClick: () => toggleFilter(chip.key)
        },
        filters[chip.key] ? /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-check" }) : /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-circle" }),
        chip.label
      ))), results.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "srch-results" }, results.map((item) => /* @__PURE__ */ React.createElement(SearchResultRow, { key: item.market_hash_name, item, onClose }))), query.trim().length >= 2 && !fetching && results.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "srch-empty" }, 'No items found for "', query, '"')));
    }
    const PRICE_NOTIFICATIONS_KEY = "cs2_price_notifications";
    function readStoredArray(key) {
      try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value : [];
      } catch (_error) {
        return [];
      }
    }
    function writeStoredArray(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (_error) {
      }
    }
    function formatNotificationTime(timestamp) {
      const age = Math.max(0, Date.now() - Number(timestamp || 0));
      const minutes = Math.floor(age / 6e4);
      if (minutes < 1) return "now";
      if (minutes < 60) return minutes + "m";
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return hours + "h";
      return Math.floor(hours / 24) + "d";
    }
    function WatchlistBell() {
      const [open, setOpen] = useState(false);
      const [notifications, setNotifications] = useState(() => readStoredArray(PRICE_NOTIFICATIONS_KEY));
      const menuRef = useRef(null);
      const unreadCount = notifications.filter((item) => !item.read).length;
      const visibleNotifications = notifications.slice(0, 8);
      const refresh = () => setNotifications(readStoredArray(PRICE_NOTIFICATIONS_KEY));
      useEffect(() => {
        if (!open) return void 0;
        const onOutside = (e) => {
          if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onOutside);
        return () => document.removeEventListener("mousedown", onOutside);
      }, [open]);
      useEffect(() => {
        const onStorage = (event) => {
          if (!event.key || event.key === PRICE_NOTIFICATIONS_KEY) refresh();
        };
        const onCustom = () => refresh();
        window.addEventListener("storage", onStorage);
        window.addEventListener("cs2:price-notifications-updated", onCustom);
        return () => {
          window.removeEventListener("storage", onStorage);
          window.removeEventListener("cs2:price-notifications-updated", onCustom);
        };
      }, []);
      const markAllRead = () => {
        const next = notifications.map((item) => ({ ...item, read: true }));
        writeStoredArray(PRICE_NOTIFICATIONS_KEY, next);
        setNotifications(next);
        window.dispatchEvent(new CustomEvent("cs2:price-notifications-updated"));
      };
      return /* @__PURE__ */ React.createElement("div", { ref: menuRef, className: classNames("nav-alert-menu", open && "open") }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "nav-alert-trigger",
          "aria-label": "Open price alert notifications",
          onClick: () => setOpen((current) => !current)
        },
        /* @__PURE__ */ React.createElement("i", { className: unreadCount ? "fa-solid fa-bell" : "fa-regular fa-bell" }),
        unreadCount > 0 && /* @__PURE__ */ React.createElement("span", { className: "nav-alert-badge" }, unreadCount > 9 ? "9+" : unreadCount)
      ), open && /* @__PURE__ */ React.createElement("div", { className: "nav-alert-dropdown" }, /* @__PURE__ */ React.createElement("div", { className: "nav-alert-head" }, /* @__PURE__ */ React.createElement("strong", null, "Notifications"), unreadCount > 0 && /* @__PURE__ */ React.createElement("button", { type: "button", onClick: markAllRead }, "Mark read")), visibleNotifications.length ? /* @__PURE__ */ React.createElement("div", { className: "nav-alert-list" }, visibleNotifications.map((item) => /* @__PURE__ */ React.createElement(
        "a",
        {
          key: item.id,
          className: classNames("nav-alert-item", !item.read && "unread"),
          href: item.href || "watchlist.html",
          onClick: markAllRead
        },
        /* @__PURE__ */ React.createElement("span", { className: "nav-alert-icon" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-trend-up" })),
        /* @__PURE__ */ React.createElement("span", { className: "nav-alert-copy" }, /* @__PURE__ */ React.createElement("strong", null, item.title || "Price alert"), /* @__PURE__ */ React.createElement("span", null, item.message || "A tracked price crossed your alert.")),
        /* @__PURE__ */ React.createElement("span", { className: "nav-alert-time" }, formatNotificationTime(item.createdAt))
      ))) : /* @__PURE__ */ React.createElement("div", { className: "nav-alert-empty" }, /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-bell" }), /* @__PURE__ */ React.createElement("span", null, "No price alerts yet")), /* @__PURE__ */ React.createElement("a", { className: "nav-alert-footer", href: "watchlist.html" }, "Open watchlist")));
    }
    function seriesSeed(source) {
      return Array.from(String(source || "spark")).reduce(
        (seed, character, index) => (seed + character.charCodeAt(0) * (index + 7)) % 9973,
        173
      );
    }
    function seededNoise(seed, index) {
      const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
      return value - Math.floor(value);
    }
    function createSparkData(points, up, seedSource, magnitude = 1) {
      const seed = seriesSeed(seedSource);
      const scale = Math.max(0.65, Math.min(Number(magnitude) || 1, 2.7));
      const drift = (up ? 0.78 : -0.74) * (0.72 + scale * 0.22);
      let value = 52 + seed % 11;
      return Array.from({ length: points }, (_, index) => {
        value += drift + (seededNoise(seed, index) - 0.5) * (4.8 + scale * 1.9);
        return Number(value.toFixed(2));
      });
    }
    function buildSparklinePaths(series, width = 160, height = 44) {
      const min = Math.min(...series);
      const max = Math.max(...series);
      const range = max - min || 1;
      const points = series.map((value, index) => {
        const x = Number((index / (series.length - 1 || 1) * width).toFixed(2));
        const y = Number((height - (value - min) / range * height).toFixed(2));
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      });
      const linePath = points.join(" ");
      const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
      return { areaPath, linePath };
    }
    function SparklineCanvas({ up, points = 18, seed = "spark", magnitude = 1, series = null }) {
      const resolvedSeries = Array.isArray(series) && series.length ? series : createSparkData(points, up, seed, magnitude);
      const durationMs = Math.round(760 + Math.min(Math.abs(Number(magnitude) - 1) * 180, 320));
      const { areaPath, linePath } = buildSparklinePaths(resolvedSeries);
      const stroke = up ? "#22c55e" : "#ef4444";
      const fill = up ? "rgba(34, 197, 94, 0.18)" : "rgba(239, 68, 68, 0.16)";
      return /* @__PURE__ */ React.createElement(
        "svg",
        {
          className: "sparkline",
          viewBox: "0 0 160 44",
          preserveAspectRatio: "none",
          "aria-hidden": "true",
          focusable: "false",
          style: { "--spark-duration": `${durationMs}ms` }
        },
        /* @__PURE__ */ React.createElement("path", { className: "sparkline-area", d: areaPath, fill }),
        /* @__PURE__ */ React.createElement(
          "path",
          {
            className: "sparkline-line",
            d: linePath,
            fill: "none",
            stroke,
            strokeWidth: "2.2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            pathLength: "100"
          }
        )
      );
    }
    function FeaturedPreview({ items }) {
      const progressRef = useRef(null);
      const preloadRef = useRef([]);
      const [activeIndex, setActiveIndex] = useState(0);
      const [fadeClass, setFadeClass] = useState("");
      const autoAdvanceMs = 4600;
      const fadeDurationMs = 260;
      useEffect(() => {
        preloadRef.current = (Array.isArray(items) ? items : []).map((item) => {
          const image = new Image();
          image.decoding = "async";
          image.src = item && item.img ? item.img : "";
          return image;
        });
        return () => {
          preloadRef.current = [];
        };
      }, [items]);
      useEffect(() => {
        const progress = progressRef.current;
        if (!progress || !items.length) return void 0;
        progress.style.setProperty("--progress-duration", `${autoAdvanceMs}ms`);
        progress.classList.remove("is-animating");
        void progress.offsetWidth;
        progress.classList.add("is-animating");
        const advanceId = window.setTimeout(() => {
          setFadeClass("fade-out");
          const swapId = window.setTimeout(() => {
            setActiveIndex((current) => (current + 1) % items.length);
            setFadeClass("fade-in");
          }, fadeDurationMs);
          progress.dataset.swapId = String(swapId);
        }, autoAdvanceMs);
        return () => {
          window.clearTimeout(advanceId);
          const pendingSwapId = Number(progress.dataset.swapId || 0);
          if (pendingSwapId) {
            window.clearTimeout(pendingSwapId);
            delete progress.dataset.swapId;
          }
        };
      }, [activeIndex, items, autoAdvanceMs, fadeDurationMs]);
      useEffect(() => {
        if (!fadeClass) return void 0;
        const id = window.setTimeout(() => setFadeClass(""), fadeDurationMs);
        return () => window.clearTimeout(id);
      }, [fadeClass, fadeDurationMs]);
      const activeItem = items[activeIndex] || items[0] || { title: "", img: "", rarity: "" };
      const itemHref = activeItem.href || (activeItem.title ? "item_page.html?" + new URLSearchParams({
        lookup_name: activeItem.title,
        display_name: activeItem.title,
        image: activeItem.img || "",
        type: "",
        color: "B0C3D9"
      }).toString() : null);
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
        "div",
        {
          className: classNames("featured-preview", activeItem.rarity, fadeClass),
          id: "featuredPreview"
        },
        /* @__PURE__ */ React.createElement(
          "img",
          {
            id: "featuredImage",
            src: activeItem.img,
            alt: activeItem.title,
            loading: "eager",
            decoding: "async",
            fetchPriority: "high"
          }
        )
      ), /* @__PURE__ */ React.createElement("div", { className: "featured-progress" }, /* @__PURE__ */ React.createElement("span", { id: "progressBar", ref: progressRef })), /* @__PURE__ */ React.createElement("div", { className: "skin-info" }, /* @__PURE__ */ React.createElement("div", { className: "skin-title", id: "featuredTitle" }, activeItem.title), itemHref ? /* @__PURE__ */ React.createElement("a", { className: "view-btn", href: itemHref }, "View Details ", /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-right" })) : /* @__PURE__ */ React.createElement("div", { className: "view-btn" }, "View Details ", /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-right" }))));
    }
    function Footer() {
      return /* @__PURE__ */ React.createElement("footer", { className: "site-footer" }, /* @__PURE__ */ React.createElement("div", { className: "footer-container" }, /* @__PURE__ */ React.createElement("div", { className: "footer-brand" }, /* @__PURE__ */ React.createElement("img", { src: "logo.png", alt: "CS2 Market Logo" }), /* @__PURE__ */ React.createElement("p", null, "Track CS2 skins, cases and market prices across multiple marketplaces with real-time data and analytics.")), /* @__PURE__ */ React.createElement("div", { className: "footer-links" }, data.footerColumns.map((column) => /* @__PURE__ */ React.createElement("div", { className: "footer-col", key: column.title }, /* @__PURE__ */ React.createElement("h4", null, column.title), column.links.map((link) => /* @__PURE__ */ React.createElement("a", { href: link.href, key: link.label }, link.label)))))));
    }
    function Navbar() {
      const [filters, setFilters] = useState({});
      const [overlayOpen, setOverlayOpen] = useState(false);
      const [steamSession, setSteamSession] = useState({ authenticated: false, user: null });
      const [profileOpen, setProfileOpen] = useState(false);
      const profileRef = useRef(null);
      const currentPage = window.location.pathname.split("/").pop() || "index.html";
      const steamUser = steamSession && steamSession.authenticated ? steamSession.user : null;
      const loginHref = "steam_login.php?return_to=" + encodeURIComponent(window.location.href);
      const setFilter = (key, value) => {
        setFilters((current) => ({ ...current, [key]: value }));
      };
      useEffect(() => {
        if (!profileOpen) return void 0;
        const onOutside = (e) => {
          if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
        };
        document.addEventListener("mousedown", onOutside);
        return () => document.removeEventListener("mousedown", onOutside);
      }, [profileOpen]);
      useEffect(() => {
        let alive = true;
        fetch("get_steam_session.php", {
          credentials: "same-origin",
          headers: { Accept: "application/json" }
        }).then((response) => response.ok ? response.json() : null).then((payload) => {
          if (!alive || !payload) return;
          setSteamSession({
            authenticated: Boolean(payload.authenticated),
            user: payload.user || null
          });
        }).catch(() => {
          if (alive) setSteamSession({ authenticated: false, user: null });
        });
        return () => {
          alive = false;
        };
      }, []);
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "navbar" }, /* @__PURE__ */ React.createElement("div", { className: "nav-left" }, /* @__PURE__ */ React.createElement("a", { className: "logo", href: "index.html" }, /* @__PURE__ */ React.createElement("img", { src: "logo.png", alt: "Logo" })), /* @__PURE__ */ React.createElement("div", { className: "nav-links" }, /* @__PURE__ */ React.createElement(
        "a",
        {
          className: classNames("nav-item", currentPage === "deals.html" && "active"),
          href: "deals.html",
          style: { textDecoration: "none", color: "inherit" }
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-tags" }),
        " Deals"
      ), /* @__PURE__ */ React.createElement(
        "a",
        {
          className: classNames("nav-item", currentPage === "roi.html" && "active"),
          href: "roi.html",
          style: { textDecoration: "none", color: "inherit" }
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-coins" }),
        " Market"
      ), /* @__PURE__ */ React.createElement(
        "a",
        {
          className: classNames("nav-item", currentPage === "carepackage.html" && "active"),
          href: "carepackage.html",
          style: { textDecoration: "none", color: "inherit" }
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-gift" }),
        " Care Package"
      ), /* @__PURE__ */ React.createElement("div", { className: "nav-item nav-collections" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-layer-group" }), " Collections", /* @__PURE__ */ React.createElement("div", { className: "collections-mega" }, /* @__PURE__ */ React.createElement("h4", null, "CS2 Collections"), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          className: "collection-search",
          placeholder: "Search for Collections...",
          value: filters.collections || "",
          onChange: (event) => setFilter("collections", event.target.value)
        }
      ), /* @__PURE__ */ React.createElement("div", { className: "collections-mega-grid" }, data.navCollections.filter((item) => matchesQuery(item.name, filters.collections)).map((item) => /* @__PURE__ */ React.createElement(
        "a",
        {
          href: item.href || "#",
          className: classNames("collection-item", item.href === currentPage && "active"),
          key: item.name
        },
        /* @__PURE__ */ React.createElement("img", { src: item.img, alt: item.alt }),
        /* @__PURE__ */ React.createElement("span", null, item.name)
      ))))), /* @__PURE__ */ React.createElement("div", { className: "nav-item nav-cases" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-box" }), " Cases", /* @__PURE__ */ React.createElement("div", { className: "cases-mega" }, /* @__PURE__ */ React.createElement("h4", null, "CS2 Cases"), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          className: "case-search",
          placeholder: "Search for Cases...",
          value: filters.cases || "",
          onChange: (event) => setFilter("cases", event.target.value)
        }
      ), /* @__PURE__ */ React.createElement("div", { className: "cases-mega-grid" }, data.navCases.filter((item) => matchesQuery(item.name, filters.cases)).map((item) => /* @__PURE__ */ React.createElement(
        "a",
        {
          href: item.href || "#",
          className: classNames("case-item", item.href === currentPage && "active"),
          key: item.name
        },
        /* @__PURE__ */ React.createElement("img", { src: item.img, alt: item.name }),
        /* @__PURE__ */ React.createElement("span", null, item.name)
      ))))), /* @__PURE__ */ React.createElement("div", { className: "nav-item nav-stickers" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-sticky-note" }), " Stickers", /* @__PURE__ */ React.createElement("div", { className: "stickers-mega" }, /* @__PURE__ */ React.createElement("h4", null, "CS2 Stickers"), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          className: "sticker-search",
          placeholder: "Search for Stickers...",
          value: filters.stickers || "",
          onChange: (event) => setFilter("stickers", event.target.value)
        }
      ), /* @__PURE__ */ React.createElement("div", { className: "stickers-mega-grid" }, data.navStickers.filter((item) => matchesQuery(item.name, filters.stickers)).map((item) => /* @__PURE__ */ React.createElement("a", { className: "sticker-card", key: item.name }, /* @__PURE__ */ React.createElement("img", { src: item.img, alt: item.name }), /* @__PURE__ */ React.createElement("span", null, item.name)))))), /* @__PURE__ */ React.createElement("div", { className: "nav-item nav-other" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-screwdriver-wrench" }), " Other", /* @__PURE__ */ React.createElement("div", { className: "other-mega" }, /* @__PURE__ */ React.createElement("h4", null, "Other Items"), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          className: "other-search",
          placeholder: "Search for Other...",
          value: filters.other || "",
          onChange: (event) => setFilter("other", event.target.value)
        }
      ), data.navOtherSections.map((section) => {
        const visibleItems = section.items.filter((item) => matchesQuery(item.name, filters.other));
        if (!visibleItems.length) return null;
        return /* @__PURE__ */ React.createElement("div", { className: "other-section", key: section.title }, /* @__PURE__ */ React.createElement("div", { className: "other-title" }, section.title), visibleItems.map((item) => /* @__PURE__ */ React.createElement("a", { className: "other-item", key: item.name }, /* @__PURE__ */ React.createElement("img", { src: item.img, alt: item.name }), /* @__PURE__ */ React.createElement("span", null, item.name))));
      }), /* @__PURE__ */ React.createElement("div", { className: "other-footer" }, /* @__PURE__ */ React.createElement("a", { href: "#" }, "Keys & Other Items ", "\u2192")))), data.weaponCategories.map((category) => /* @__PURE__ */ React.createElement("div", { className: "nav-item weapon-nav", key: category.key }, category.label, " ", /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-down" }), /* @__PURE__ */ React.createElement("div", { className: "dropdown weapon-dropdown wide", id: `${category.key}Dropdown` }, /* @__PURE__ */ React.createElement(
        "input",
        {
          className: "weapon-search",
          placeholder: category.placeholder,
          value: filters[category.key] || "",
          onChange: (event) => setFilter(category.key, event.target.value)
        }
      ), /* @__PURE__ */ React.createElement("div", { className: "weapon-list" }, category.items.map((item) => resolveWeaponNavEntry(item, category.folder)).filter((item) => matchesQuery(item.label, filters[category.key])).map((item) => {
        return /* @__PURE__ */ React.createElement("a", { href: "#", className: "weapon-item", key: `${category.key}-${item.label}` }, /* @__PURE__ */ React.createElement("img", { src: `assets/weapons/${item.folder}/${item.fileName}.webp`, alt: item.label }), /* @__PURE__ */ React.createElement("span", null, item.label));
      }))))))), /* @__PURE__ */ React.createElement("div", { className: "nav-right" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "search-container",
          onClick: () => setOverlayOpen(true),
          "aria-label": "Open search"
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" }),
        /* @__PURE__ */ React.createElement("span", { className: "search-placeholder" }, "Search skins, items...")
      ), /* @__PURE__ */ React.createElement(WatchlistBell, null), steamUser ? /* @__PURE__ */ React.createElement("div", { ref: profileRef, className: classNames("nav-profile-menu", profileOpen && "open") }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "nav-profile-trigger",
          "aria-label": "Open Steam profile menu",
          onClick: () => setProfileOpen((p) => !p)
        },
        steamUser.avatar ? /* @__PURE__ */ React.createElement("img", { src: steamUser.avatar, alt: steamUser.persona_name || "Steam profile" }) : /* @__PURE__ */ React.createElement("span", { className: "nav-profile-fallback" }, "ST"),
        /* @__PURE__ */ React.createElement("span", null, steamUser.persona_name || "Steam"),
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-down" })
      ), profileOpen && /* @__PURE__ */ React.createElement("div", { className: "nav-profile-dropdown" }, /* @__PURE__ */ React.createElement("a", { href: "login.html?auth=success" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-box-open" }), "Inventory"), /* @__PURE__ */ React.createElement("a", { href: "watchlist.html" }, /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-bell" }), "Watchlist"), /* @__PURE__ */ React.createElement("a", { href: "steam_logout.php", className: "nav-profile-logout" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-right-from-bracket" }), "Log out"))) : /* @__PURE__ */ React.createElement("a", { href: loginHref, className: "login-btn" }, /* @__PURE__ */ React.createElement("i", { className: "fa-brands fa-steam" }), " Login"))), overlayOpen && /* @__PURE__ */ React.createElement(SearchOverlay, { onClose: () => setOverlayOpen(false) }));
    }
    function Layout({ children }) {
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Navbar, null), children, /* @__PURE__ */ React.createElement(Footer, null));
    }
    function CollectionCard({ img, alt, name, wrapName = true }) {
      return /* @__PURE__ */ React.createElement("div", { className: "collection-card" }, /* @__PURE__ */ React.createElement("img", { src: img, alt: alt || name }), /* @__PURE__ */ React.createElement("div", { className: "collection-overlay" }, wrapName ? /* @__PURE__ */ React.createElement("span", null, name) : name));
    }
    function MarketCard({ item }) {
      const changeValue = Number(item.change) || 0;
      const isUp = changeValue >= 0;
      const href = item.href || "item_page.html";
      const isExternal = Boolean(item.external);
      const imageSrc = item.img || item.image || "";
      const priceValue = Number(item.price);
      const priceLabel = Number.isFinite(priceValue) ? `${item.currency || "$"}${priceValue.toFixed(2)}` : item.priceDisplay || "\u2014";
      const sparkMagnitude = Math.max(0.8, Math.min(Math.abs(changeValue) / 6 + 0.85, 2.8));
      return /* @__PURE__ */ React.createElement(
        "a",
        {
          href,
          className: "market-card market-link",
          target: isExternal ? "_blank" : void 0,
          rel: isExternal ? "noreferrer" : void 0
        },
        /* @__PURE__ */ React.createElement("img", { src: imageSrc, alt: item.name, loading: "lazy", decoding: "async" }),
        /* @__PURE__ */ React.createElement("div", { className: "price-tag" }, priceLabel),
        /* @__PURE__ */ React.createElement("div", { className: classNames("change-tag", isUp ? "change-up" : "change-down") }, isUp ? "\u25B2" : "\u25BC", " ", Math.abs(changeValue).toFixed(2), "%"),
        /* @__PURE__ */ React.createElement("div", { className: "item-name" }, item.name),
        /* @__PURE__ */ React.createElement(
          SparklineCanvas,
          {
            up: isUp,
            seed: item.sparkSeed || item.name,
            magnitude: sparkMagnitude,
            series: item.sparkSeries
          }
        )
      );
    }
    function CaseItemCard({ item, collection, caseInfo }) {
      const normalPrice = item.normalPriceDisplay || "\u2014";
      const normalRange = item.normalPriceRangeDisplay || "Steam price unavailable";
      const statTrakPrice = item.stattrakPriceDisplay || "\u2014";
      const statTrakRange = item.stattrakPriceRangeDisplay || "Steam price unavailable";
      const steamUrl = item.normalSteamUrl || "https://steamcommunity.com/market/listings/730";
      const detailsUrl = item.detailsUrl || steamUrl;
      return /* @__PURE__ */ React.createElement("div", { className: classNames("case-item-card", item.rarity) }, /* @__PURE__ */ React.createElement("div", { className: "item-top" }, /* @__PURE__ */ React.createElement("span", { className: "weapon" }, item.weapon), /* @__PURE__ */ React.createElement("span", { className: classNames("badge", item.rarity) }, item.badge)), /* @__PURE__ */ React.createElement("h3", { className: "skin-name" }, item.skin), /* @__PURE__ */ React.createElement("div", { className: "item-sources" }, /* @__PURE__ */ React.createElement("div", { className: "source" }, /* @__PURE__ */ React.createElement("img", { src: collection.img, alt: collection.name }), /* @__PURE__ */ React.createElement("span", null, collection.name)), /* @__PURE__ */ React.createElement("div", { className: "source" }, /* @__PURE__ */ React.createElement("img", { src: caseInfo.img, alt: caseInfo.name }), /* @__PURE__ */ React.createElement("span", null, caseInfo.name))), /* @__PURE__ */ React.createElement("div", { className: "item-image" }, /* @__PURE__ */ React.createElement("img", { src: item.img, alt: item.skin })), /* @__PURE__ */ React.createElement("div", { className: "float-bar" }, /* @__PURE__ */ React.createElement("div", { className: "float-gradient" }), /* @__PURE__ */ React.createElement("span", null, item.float)), /* @__PURE__ */ React.createElement("div", { className: "price-stack" }, /* @__PURE__ */ React.createElement("div", { className: "price-row normal" }, /* @__PURE__ */ React.createElement("span", { className: "label" }, "Normal"), /* @__PURE__ */ React.createElement("span", { className: classNames("value", item.steamPriceLoading && "loading") }, normalPrice)), /* @__PURE__ */ React.createElement("div", { className: "price-range" }, normalRange), /* @__PURE__ */ React.createElement("div", { className: "price-row stattrak" }, /* @__PURE__ */ React.createElement("span", { className: "label" }, "StatTrak", "\u2122"), /* @__PURE__ */ React.createElement("span", { className: classNames("value", item.steamPriceLoading && "loading") }, statTrakPrice)), /* @__PURE__ */ React.createElement("div", { className: "price-range" }, statTrakRange)), /* @__PURE__ */ React.createElement("div", { className: "card-actions" }, /* @__PURE__ */ React.createElement("a", { className: "view-btn full", href: detailsUrl }, "View Prices & Details ", "\u2192"), /* @__PURE__ */ React.createElement(
        "a",
        {
          className: "steam-btn icon-only",
          href: steamUrl,
          target: "_blank",
          rel: "noreferrer",
          "aria-label": "View on Steam"
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-brands fa-steam" })
      )));
    }
    function mountPage(element) {
      const rootNode = document.getElementById("root");
      if (!rootNode) return;
      ReactDOM.createRoot(rootNode).render(element);
    }
    window.CS2React = {
      Layout,
      Footer,
      Navbar,
      FeaturedPreview,
      CollectionCard,
      MarketCard,
      CaseItemCard,
      classNames,
      mountPage,
      createSparkData
    };
  })();
})();

