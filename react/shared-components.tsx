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
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
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
      return "item_page.php?" + new URLSearchParams({
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
    const price = item.seed_sell_price != null
      ? "$" + Number(item.seed_sell_price).toFixed(2)
      : "-";
    const offers = item.seed_sell_listings != null
      ? item.seed_sell_listings + " Offers"
      : "";
    const href = buildSearchHref(item);
    const isExternal = !href.startsWith("item_page");

    return (
      <a
        className="srch-row"
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer" : undefined}
        onClick={onClose}
      >
        <div className="srch-row-img">
          {item.image
            ? <img src={item.image} alt={item.display_name || item.market_hash_name} loading="lazy" />
            : <span className="srch-row-placeholder">CS</span>}
        </div>

        <div className="srch-row-body">
          <div className="srch-row-name">{item.display_name || item.market_hash_name}</div>
        </div>

        <div className="srch-row-right">
          <div className="srch-row-price">{price}</div>
          {offers && <div className="srch-row-offers">{offers}</div>}
        </div>
      </a>
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
      const onKey = (event) => { if (event.key === "Escape") onClose(); };
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
        return undefined;
      }

      timerRef.current = window.setTimeout(() => {
        const controller = new AbortController();
        abortRef.current = controller;
        setFetching(true);

        fetch("search_items.php?q=" + encodeURIComponent(q) + "&limit=12", { signal: controller.signal })
          .then((response) => response.json())
          .then((payload) => {
            let items = Array.isArray(payload.items) ? payload.items : [];

            if (filters.wearOrder) {
              const wearRank = { "Factory New": 1, "Minimal Wear": 2, "Field-Tested": 3, "Well-Worn": 4, "Battle-Scarred": 5 };
              items = [...items].sort((a, b) => (wearRank[a.selected_wear] || 9) - (wearRank[b.selected_wear] || 9));
            }
            if (filters.stattrak) {
              items = [...items].sort((a) => (a.market_hash_name.includes("StatTrak") ? -1 : 1));
            }
            if (filters.souvenir) {
              items = [...items].sort((a) => (a.market_hash_name.includes("Souvenir") ? -1 : 1));
            }

            setResults(items);
          })
          .catch((error) => {
            if (error.name !== "AbortError") setResults([]);
          })
          .finally(() => {
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

    return (
      <div className="srch-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="srch-box">
          <div className="srch-input-row">
            <i className="fa-solid fa-magnifying-glass srch-icon" />
            <input
              ref={inputRef}
              className="srch-input"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search skins, cases, stickers..."
              autoComplete="off"
              spellCheck={false}
            />
            {fetching && <i className="fa-solid fa-spinner fa-spin srch-spin" />}
            <button className="srch-close" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
          </div>

          {results.length > 0 && (
            <div className="srch-results">
              {results.map((item) => (
                <SearchResultRow key={item.market_hash_name} item={item} onClose={onClose} />
              ))}
            </div>
          )}

          {query.trim().length >= 2 && !fetching && results.length === 0 && (
            <div className="srch-empty">No items found for "{query}"</div>
          )}
        </div>
      </div>
    );
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
    } catch (_error) {}
  }

  function formatNotificationTime(timestamp) {
    const age = Math.max(0, Date.now() - Number(timestamp || 0));
    const minutes = Math.floor(age / 60000);
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
      if (!open) return undefined;
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

    return (
      <div ref={menuRef} className={classNames("nav-alert-menu", open && "open")}>
        <button
          type="button"
          className="nav-alert-trigger"
          aria-label="Open price alert notifications"
          onClick={() => setOpen((current) => !current)}
        >
          <i className={unreadCount ? "fa-solid fa-bell" : "fa-regular fa-bell"} />
          {unreadCount > 0 && <span className="nav-alert-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
        </button>

        {open && (
          <div className="nav-alert-dropdown">
            <div className="nav-alert-head">
              <strong>Notifications</strong>
              {unreadCount > 0 && <button type="button" onClick={markAllRead}>Mark read</button>}
            </div>

            {visibleNotifications.length ? (
              <div className="nav-alert-list">
                {visibleNotifications.map((item) => (
                  <a
                    key={item.id}
                    className={classNames("nav-alert-item", !item.read && "unread")}
                    href={item.href || "watchlist.html"}
                    onClick={markAllRead}
                  >
                    <span className="nav-alert-icon"><i className="fa-solid fa-arrow-trend-up" /></span>
                    <span className="nav-alert-copy">
                      <strong>{item.title || "Price alert"}</strong>
                      <span>{item.message || "A tracked price crossed your alert."}</span>
                    </span>
                    <span className="nav-alert-time">{formatNotificationTime(item.createdAt)}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div className="nav-alert-empty">
                <i className="fa-regular fa-bell" />
                <span>No price alerts yet</span>
              </div>
            )}

            <a className="nav-alert-footer" href="watchlist.html">Open watchlist</a>
          </div>
        )}
      </div>
    );
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
    let value = 52 + (seed % 11);

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
      const x = Number(((index / (series.length - 1 || 1)) * width).toFixed(2));
      const y = Number((height - ((value - min) / range) * height).toFixed(2));
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    });
    const linePath = points.join(" ");
    const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
    return { areaPath, linePath };
  }

  function SparklineCanvas({ up, points = 18, seed = "spark", magnitude = 1, series = null }) {
    const resolvedSeries = Array.isArray(series) && series.length
      ? series
      : createSparkData(points, up, seed, magnitude);
    const durationMs = Math.round(760 + Math.min(Math.abs(Number(magnitude) - 1) * 180, 320));
    const { areaPath, linePath } = buildSparklinePaths(resolvedSeries);
    const stroke = up ? "#22c55e" : "#ef4444";
    const fill = up ? "rgba(34, 197, 94, 0.18)" : "rgba(239, 68, 68, 0.16)";

    return (
      <svg
        className="sparkline"
        viewBox="0 0 160 44"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        style={{ "--spark-duration": `${durationMs}ms` }}
      >
        <path className="sparkline-area" d={areaPath} fill={fill} />
        <path
          className="sparkline-line"
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="100"
        />
      </svg>
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
      if (!progress || !items.length) return undefined;

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
      if (!fadeClass) return undefined;
      const id = window.setTimeout(() => setFadeClass(""), fadeDurationMs);
      return () => window.clearTimeout(id);
    }, [fadeClass, fadeDurationMs]);

    const activeItem = items[activeIndex] || items[0] || { title: "", img: "", rarity: "" };
    const itemHref = activeItem.href || (activeItem.title
      ? "item_page.php?" + new URLSearchParams({
          lookup_name: activeItem.title,
          display_name: activeItem.title,
          image: activeItem.img || "",
          type: "",
          color: "B0C3D9",
        }).toString()
      : null);

    return (
      <>
        <div
          className={classNames("featured-preview", activeItem.rarity, fadeClass)}
          id="featuredPreview"
        >
          <img
            id="featuredImage"
            src={activeItem.img}
            alt={activeItem.title}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        </div>

        <div className="featured-progress">
          <span id="progressBar" ref={progressRef} />
        </div>

        <div className="skin-info">
          <div className="skin-title" id="featuredTitle">
            {activeItem.title}
          </div>

          {itemHref ? (
            <a className="view-btn" href={itemHref}>
              View Details <i className="fa-solid fa-arrow-right" />
            </a>
          ) : (
            <div className="view-btn">
              View Details <i className="fa-solid fa-arrow-right" />
            </div>
          )}
        </div>
      </>
    );
  }

  function Footer() {
    return (
      <footer className="site-footer">
        <div className="footer-container">
          <div className="footer-brand">
            <img src="logo.png" alt="CS2 Market Logo" />
            <p>
              Track CS2 skins, cases and market prices across multiple marketplaces
              with real-time data and analytics.
            </p>
          </div>

          <div className="footer-links">
            {data.footerColumns.map((column) => (
              <div className="footer-col" key={column.title}>
                <h4>{column.title}</h4>
                {column.links.map((link) => (
                  <a href={link.href} key={link.label}>
                    {link.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>

      </footer>
    );
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
      if (!profileOpen) return undefined;
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
      })
        .then((response) => response.ok ? response.json() : null)
        .then((payload) => {
          if (!alive || !payload) return;
          setSteamSession({
            authenticated: Boolean(payload.authenticated),
            user: payload.user || null
          });
        })
        .catch(() => {
          if (alive) setSteamSession({ authenticated: false, user: null });
        });

      return () => {
        alive = false;
      };
    }, []);

    return (
      <>
      <div className="navbar">
        <div className="nav-left">
          <a className="logo" href="index.html">
            <img src="logo.png" alt="Logo" />
          </a>

          <div className="nav-links">
            <a
              className={classNames("nav-item", currentPage === "deals.html" && "active")}
              href="deals.html"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <i className="fa-solid fa-tags" /> Deals
            </a>

            <a
              className={classNames("nav-item", currentPage === "roi.html" && "active")}
              href="roi.html"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <i className="fa-solid fa-coins" /> Market
            </a>

            <a
              className={classNames("nav-item", currentPage === "carepackage.html" && "active")}
              href="carepackage.html"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <i className="fa-solid fa-gift" /> Care Package
            </a>


            <div className="nav-item nav-collections">
              <i className="fa-solid fa-layer-group" /> Collections

              <div className="collections-mega">
                <h4>CS2 Collections</h4>

                <input
                  type="text"
                  className="collection-search"
                  placeholder="Search for Collections..."
                  value={filters.collections || ""}
                  onChange={(event) => setFilter("collections", event.target.value)}
                />

                <div className="collections-mega-grid">
                  {data.navCollections
                    .filter((item) => matchesQuery(item.name, filters.collections))
                    .map((item) => (
                      <a
                        href={item.href || "#"}
                        className={classNames("collection-item", item.href === currentPage && "active")}
                        key={item.name}
                      >
                        <img src={item.img} alt={item.alt} />
                        <span>{item.name}</span>
                      </a>
                    ))}
                </div>
              </div>
            </div>

            <div className="nav-item nav-cases">
              <i className="fa-solid fa-box" /> Cases

              <div className="cases-mega">
                <h4>CS2 Cases</h4>

                <input
                  type="text"
                  className="case-search"
                  placeholder="Search for Cases..."
                  value={filters.cases || ""}
                  onChange={(event) => setFilter("cases", event.target.value)}
                />

                <div className="cases-mega-grid">
                  {data.navCases
                    .filter((item) => matchesQuery(item.name, filters.cases))
                    .map((item) => (
                      <a
                        href={item.href || "#"}
                        className={classNames("case-item", item.href === currentPage && "active")}
                        key={item.name}
                      >
                        <img src={item.img} alt={item.name} />
                        <span>{item.name}</span>
                      </a>
                    ))}
                </div>
              </div>
            </div>

            <div className="nav-item nav-stickers">
              <i className="fa-solid fa-sticky-note" /> Stickers

              <div className="stickers-mega">
                <h4>CS2 Stickers</h4>

                <input
                  type="text"
                  className="sticker-search"
                  placeholder="Search for Stickers..."
                  value={filters.stickers || ""}
                  onChange={(event) => setFilter("stickers", event.target.value)}
                />

                <div className="stickers-mega-grid">
                  {data.navStickers
                    .filter((item) => matchesQuery(item.name, filters.stickers))
                    .map((item) => (
                      <a className="sticker-card" key={item.name}>
                        <img src={item.img} alt={item.name} />
                        <span>{item.name}</span>
                      </a>
                    ))}
                </div>

              </div>
            </div>

            <div className="nav-item nav-other">
              <i className="fa-solid fa-screwdriver-wrench" /> Other

              <div className="other-mega">
                <h4>Other Items</h4>

                <input
                  type="text"
                  className="other-search"
                  placeholder="Search for Other..."
                  value={filters.other || ""}
                  onChange={(event) => setFilter("other", event.target.value)}
                />

                {data.navOtherSections.map((section) => {
                  const visibleItems = section.items.filter((item) => matchesQuery(item.name, filters.other));
                  if (!visibleItems.length) return null;

                  return (
                    <div className="other-section" key={section.title}>
                      <div className="other-title">{section.title}</div>

                      {visibleItems.map((item) => (
                        <a className="other-item" key={item.name}>
                          <img src={item.img} alt={item.name} />
                          <span>{item.name}</span>
                        </a>
                      ))}
                    </div>
                  );
                })}

                <div className="other-footer">
                  <a href="#">Keys &amp; Other Items {"\u2192"}</a>
                </div>
              </div>
            </div>

            {data.weaponCategories.map((category) => (
              <div className="nav-item weapon-nav" key={category.key}>
                {category.label} <i className="fa-solid fa-chevron-down" />
                <div className="dropdown weapon-dropdown wide" id={`${category.key}Dropdown`}>
                  <input
                    className="weapon-search"
                    placeholder={category.placeholder}
                    value={filters[category.key] || ""}
                    onChange={(event) => setFilter(category.key, event.target.value)}
                  />
                  <div className="weapon-list">
                    {category.items
                      .map((item) => resolveWeaponNavEntry(item, category.folder))
                      .filter((item) => matchesQuery(item.label, filters[category.key]))
                      .map((item) => {
                        return (
                          <a href="#" className="weapon-item" key={`${category.key}-${item.label}`}>
                            <img src={`assets/weapons/${item.folder}/${item.fileName}.webp`} alt={item.label} />
                            <span>{item.label}</span>
                          </a>
                        );
                      })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="nav-right">
          <button
            type="button"
            className="search-container"
            onClick={() => setOverlayOpen(true)}
            aria-label="Open search"
          >
            <i className="fa-solid fa-magnifying-glass" />
            <span className="search-placeholder">Search skins, items...</span>
          </button>

          <WatchlistBell />

          {steamUser ? (
            <div ref={profileRef} className={classNames("nav-profile-menu", profileOpen && "open")}>
              <button
                type="button"
                className="nav-profile-trigger"
                aria-label="Open Steam profile menu"
                onClick={() => setProfileOpen((p) => !p)}
              >
                {steamUser.avatar
                  ? <img src={steamUser.avatar} alt={steamUser.persona_name || "Steam profile"} />
                  : <span className="nav-profile-fallback">ST</span>}
                <span>{steamUser.persona_name || "Steam"}</span>
                <i className="fa-solid fa-chevron-down" />
              </button>
              {profileOpen && (
                <div className="nav-profile-dropdown">
                  <a href="login.html?auth=success">
                    <i className="fa-solid fa-box-open" />
                    Inventory
                  </a>
                  <a href="watchlist.html">
                    <i className="fa-regular fa-bell" />
                    Watchlist
                  </a>
                  <a href="steam_logout.php" className="nav-profile-logout">
                    <i className="fa-solid fa-arrow-right-from-bracket" />
                    Log out
                  </a>
                </div>
              )}
            </div>
          ) : (
            <a href={loginHref} className="login-btn">
              <i className="fa-brands fa-steam" /> Login
            </a>
          )}
        </div>
      </div>

      {overlayOpen && <SearchOverlay onClose={() => setOverlayOpen(false)} />}
      </>
    );
  }

  function Layout({ children }) {
    return (
      <>
        <Navbar />
        {children}
        <Footer />
      </>
    );
  }

  function CollectionCard({ img, alt, name, wrapName = true }) {
    return (
      <div className="collection-card">
        <img src={img} alt={alt || name} />
        <div className="collection-overlay">
          {wrapName ? <span>{name}</span> : name}
        </div>
      </div>
    );
  }

  function MarketCard({ item }) {
    const changeValue = Number(item.change) || 0;
    const isUp = changeValue >= 0;
    const href = item.href || "item_page.html";
    const isExternal = Boolean(item.external);
    const imageSrc = item.img || item.image || "";
    const priceValue = Number(item.price);
    const priceLabel = Number.isFinite(priceValue)
      ? `${item.currency || "$"}${priceValue.toFixed(2)}`
      : item.priceDisplay || "â€”";
    const sparkMagnitude = Math.max(0.8, Math.min(Math.abs(changeValue) / 6 + 0.85, 2.8));

    return (
      <a
        href={href}
        className="market-card market-link"
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer" : undefined}
      >
        <img src={imageSrc} alt={item.name} loading="lazy" decoding="async" />
        <div className="price-tag">{priceLabel}</div>
        <div className={classNames("change-tag", isUp ? "change-up" : "change-down")}>
          {isUp ? "\u25b2" : "\u25bc"} {Math.abs(changeValue).toFixed(2)}%
        </div>
        <div className="item-name">{item.name}</div>
        <SparklineCanvas
          up={isUp}
          seed={item.sparkSeed || item.name}
          magnitude={sparkMagnitude}
          series={item.sparkSeries}
        />
      </a>
    );
  }

  function CaseItemCard({ item, collection, caseInfo }) {
    const normalPrice = item.normalPriceDisplay || "â€”";
    const normalRange = item.normalPriceRangeDisplay || "Steam price unavailable";
    const statTrakPrice = item.stattrakPriceDisplay || "â€”";
    const statTrakRange = item.stattrakPriceRangeDisplay || "Steam price unavailable";
    const steamUrl = item.normalSteamUrl || "https://steamcommunity.com/market/listings/730";
    const detailsUrl = item.detailsUrl || steamUrl;

    return (
      <div className={classNames("case-item-card", item.rarity)}>
        <div className="item-top">
          <span className="weapon">{item.weapon}</span>
          <span className={classNames("badge", item.rarity)}>{item.badge}</span>
        </div>

        <h3 className="skin-name">{item.skin}</h3>

        <div className="item-sources">
          <div className="source">
            <img src={collection.img} alt={collection.name} />
            <span>{collection.name}</span>
          </div>
          <div className="source">
            <img src={caseInfo.img} alt={caseInfo.name} />
            <span>{caseInfo.name}</span>
          </div>
        </div>

        <div className="item-image">
          <img src={item.img} alt={item.skin} />
        </div>

        <div className="float-bar">
          <div className="float-gradient" />
          <span>{item.float}</span>
        </div>

        <div className="price-stack">
          <div className="price-row normal">
            <span className="label">Normal</span>
            <span className={classNames("value", item.steamPriceLoading && "loading")}>{normalPrice}</span>
          </div>
          <div className="price-range">{normalRange}</div>

          <div className="price-row stattrak">
            <span className="label">StatTrak{"\u2122"}</span>
            <span className={classNames("value", item.steamPriceLoading && "loading")}>{statTrakPrice}</span>
          </div>
          <div className="price-range">{statTrakRange}</div>
        </div>

        <div className="card-actions">
          <a className="view-btn full" href={detailsUrl}>View Prices &amp; Details {"\u2192"}</a>

          <a
            className="steam-btn icon-only"
            href={steamUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="View on Steam"
          >
            <i className="fa-brands fa-steam" />
          </a>
        </div>
      </div>
    );
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

