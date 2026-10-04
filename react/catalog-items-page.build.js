(() => {
  (() => {
    const { useEffect, useMemo, useRef, useState } = React;
    const { Layout, SortChipPicker, ShowcaseCard, resolveWeaponMediaClass, mountPage, useI18n, classNames } = window.CS2React;
    const data = window.CS2ReactData || {};
    const MSEARCH_SUGGEST_COUNT = 5;
    const MSEARCH_RECENT_MAX = 10;
    const MSEARCH_RECENT_SHOWN = 5;
    const MSEARCH_DEBOUNCE_MS = 150;
    const MSEARCH_MIN_CHARS = 2;
    const MSEARCH_RECENT_KEY = "csprice-recent-searches";
    const MSEARCH_LAST_SET_KEY = "csprice-last-suggestions";
    function msearchReadRecents() {
      try {
        const raw = window.localStorage.getItem(MSEARCH_RECENT_KEY);
        const list = JSON.parse(raw || "[]");
        return Array.isArray(list) ? list.filter((v) => typeof v === "string").slice(0, MSEARCH_RECENT_MAX) : [];
      } catch (e) {
        return [];
      }
    }
    function msearchWriteRecents(list) {
      try {
        window.localStorage.setItem(MSEARCH_RECENT_KEY, JSON.stringify(list.slice(0, MSEARCH_RECENT_MAX)));
      } catch (e) {
      }
    }
    function msearchRemember(query) {
      const q = String(query || "").trim();
      if (!q) return msearchReadRecents();
      const next = [q, ...msearchReadRecents().filter((v) => v.toLowerCase() !== q.toLowerCase())];
      msearchWriteRecents(next);
      return next;
    }
    const CATALOG_PAGE_SIZE = 120;
    const CATALOG_SAMPLE_SIZE = 24;
    const {
      AGENT_GROUP_MAP,
      PIN_GROUP_MAP,
      PATCH_GROUP_MAP,
      CHARM_GROUP_MAP,
      GRAFFITI_GROUP_MAP,
      STICKER_GROUP_MAP,
      MUSIC_GROUP_MAP,
      buildItemHref,
      catalogImageSource,
      filterCatalogItems,
      formatEuroPrice,
      hasCatalogImage,
      itemRaritySortRank,
      loadCatalog,
      stripWear,
      stickerRaritySortRank,
      resolveCollectionReleaseDate,
      formatCollectionReleaseDate
    } = data;
    const params = new URLSearchParams(window.location.search);
    const CATALOG_ROUTE = window.__CATALOG_ROUTE__ && typeof window.__CATALOG_ROUTE__ === "object" ? window.__CATALOG_ROUTE__ : null;
    if (CATALOG_ROUTE) {
      ["section", "group", "weapon", "weapon_class"].forEach((key) => {
        const value = String(CATALOG_ROUTE[key] || "").trim();
        if (value && !params.get(key)) params.set(key, value);
      });
    }
    const section = String(params.get("section") || "").trim();
    const group = String(params.get("group") || "").trim();
    const weapon = String(params.get("weapon") || group || "").trim();
    const weaponClass = String(params.get("weapon_class") || "").trim();
    (() => {
      try {
        if (CATALOG_ROUTE) return;
        if (!window.history || typeof window.history.replaceState !== "function") return;
        if (!section || !group) return;
        const keep = new URLSearchParams();
        keep.set("section", section);
        keep.set("group", group);
        if (weaponClass) keep.set("weapon_class", weaponClass);
        const q = params.get("q");
        if (q) keep.set("q", q);
        const pretty = typeof data.catalogPrettyHref === "function" ? data.catalogPrettyHref(section, group, { weapon_class: weaponClass }) : "";
        if (pretty) {
          if (!document.querySelector("base[href]")) {
            const baseEl = document.createElement("base");
            const basePath = window.CS2React && typeof window.CS2React.siteBasePath === "function" ? window.CS2React.siteBasePath() : "/";
            baseEl.setAttribute("href", basePath);
            document.head.insertBefore(baseEl, document.head.firstChild);
          }
          const base = document.querySelector("base[href]").getAttribute("href");
          const q2 = params.get("q");
          const target = base + pretty + (q2 ? `?q=${encodeURIComponent(q2)}` : "");
          window.history.replaceState(window.history.state, "", target);
          return;
        }
        const tidy = window.location.pathname + "?" + keep.toString();
        if (tidy !== window.location.pathname + window.location.search) {
          window.history.replaceState(window.history.state, "", tidy);
        }
      } catch (_error) {
      }
    })();
    const DATED_ORIGIN_SECTIONS = /* @__PURE__ */ new Set(["agents", "charms", "patches", "pins", "graffiti", "music"]);
    const CATALOG_SORT_OPTIONS = [
      { value: "rarity-desc", label: "Rarity" },
      { value: "rarity-asc", label: "Common" },
      { value: "name-asc", label: "A → Z" },
      { value: "name-desc", label: "Z → A" },
      { value: "price-desc", label: "High $" },
      { value: "price-asc", label: "Low $" }
    ];
    const CATALOG_SORT_OPTIONS_DATED = [
      { value: "date-desc", label: "Newest" },
      { value: "date-asc", label: "Oldest" },
      ...CATALOG_SORT_OPTIONS
    ];
    const SECTION_LABELS = {
      stickers: "Stickers",
      music: "Music Kits",
      agents: "Agents",
      charms: "Charms",
      patches: "Patches",
      pins: "Collectible Pins",
      graffiti: "Graffiti",
      weapons: "Weapon Skins"
    };
    const SKIN_ORIGIN_LOOKUP_URL = "assets/steam-market-cache/skin_origin_lookup.json?v=20260710-collection-origin-fix-1";
    let skinOriginLookupPromise = null;
    function loadSkinOriginLookup() {
      if (!skinOriginLookupPromise) {
        skinOriginLookupPromise = fetch(SKIN_ORIGIN_LOOKUP_URL, { cache: "no-store" }).then((response) => {
          if (!response.ok) throw new Error(`Skin origin lookup failed (${response.status})`);
          return response.json();
        }).then((payload) => payload?.items && typeof payload.items === "object" ? payload.items : {}).catch(() => ({}));
      }
      return skinOriginLookupPromise;
    }
    function normalizeOriginLookupKey(name) {
      return String(name || "").replace(/^Souvenir\s+/i, "").replace(/^StatTrak™\s+/i, "").replace(/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "").trim().toLowerCase();
    }
    function resolveItemOrigin(originLookup, item) {
      if (!originLookup) return "";
      const key = normalizeOriginLookupKey(item.market_hash_name);
      return key ? String(originLookup[key] || "").trim() : "";
    }
    function resolveItemOriginName(originLookup, item) {
      return resolveItemOrigin(originLookup, item) || item.category_label || "";
    }
    function resolveItemReleaseIso(originLookup, item) {
      if (typeof resolveCollectionReleaseDate !== "function") return "";
      return resolveCollectionReleaseDate(resolveItemOriginName(originLookup, item));
    }
    function CatalogItemCard({ item, sectionLabel, index, originLookup }) {
      const [hidden, setHidden] = useState(false);
      const title = String(item.display_name || stripWear(item.market_hash_name) || item.market_hash_name);
      const href = typeof buildItemHref === "function" ? buildItemHref(item) : "#";
      const accent = item.name_color ? `#${String(item.name_color).replace(/^#/, "")}` : "#60a5fa";
      const price = formatEuroPrice ? formatEuroPrice(item.seed_sell_price) : "—";
      const image = typeof catalogImageSource === "function" ? catalogImageSource(item) : "";
      const originName = resolveItemOriginName(originLookup, item);
      const releaseIso = resolveItemReleaseIso(originLookup, item);
      const subtitle = releaseIso && typeof formatCollectionReleaseDate === "function" ? formatCollectionReleaseDate(releaseIso) : originName || sectionLabel;
      if (!image || hidden) {
        return null;
      }
      return /* @__PURE__ */ React.createElement(
        ShowcaseCard,
        {
          href,
          image,
          imageAlt: title,
          accent,
          labelLeft: item.type_note || sectionLabel,
          labelRight: price,
          title,
          subtitle,
          animated: true,
          staggerIndex: index,
          mediaClassName: section === "weapons" ? resolveWeaponMediaClass(title) : "",
          onImageError: () => setHidden(true)
        }
      );
    }
    function CatalogItemsPage() {
      const { t } = useI18n();
      const [catalog, setCatalog] = useState([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState("");
      const [search, setSearch] = useState("");
      const msearchInitialPhone = (() => {
        try {
          return window.matchMedia("(max-width: 767px)").matches;
        } catch (e) {
          return false;
        }
      })();
      const [msPhone, setMsPhone] = useState(msearchInitialPhone);
      const [msQuery, setMsQuery] = useState("");
      const [msSubmitted, setMsSubmitted] = useState(() => {
        try {
          const p = new URLSearchParams(window.location.search);
          return Boolean(p.get("q") || p.get("section") || p.get("group") || p.get("weapon") || p.get("weapon_class"));
        } catch (e) {
          return false;
        }
      });
      const [msSuggestions, setMsSuggestions] = useState([]);
      const [msBusy, setMsBusy] = useState(false);
      const [msRecents, setMsRecents] = useState([]);
      const [msActive, setMsActive] = useState(-1);
      const [msTotalMatches, setMsTotalMatches] = useState(0);
      const msInputRef = useRef(null);
      const msAbortRef = useRef(null);
      const msTimerRef = useRef(0);
      const isDatedSection = DATED_ORIGIN_SECTIONS.has(section);
      const [sortValue, setSortValue] = useState(isDatedSection && section !== "charms" && section !== "agents" ? "date-desc" : "rarity-desc");
      const [originLookup, setOriginLookup] = useState(null);
      useEffect(() => {
        let alive = true;
        loadSkinOriginLookup().then((lookup) => {
          if (alive) setOriginLookup(lookup);
        });
        return () => {
          alive = false;
        };
      }, []);
      useEffect(() => {
        let alive = true;
        setLoading(true);
        setError("");
        if (typeof loadCatalog !== "function") {
          setError("Catalog helpers are unavailable.");
          setLoading(false);
          return void 0;
        }
        loadCatalog().then((items) => {
          if (!alive) return;
          setCatalog(items);
          setLoading(false);
        }).catch((fetchError) => {
          if (!alive) return;
          setCatalog([]);
          setLoading(false);
          setError(fetchError?.message || "Unable to load catalog.");
        });
        return () => {
          alive = false;
        };
      }, []);
      useEffect(() => {
        let mq;
        try {
          mq = window.matchMedia("(max-width: 767px)");
        } catch (e) {
          return void 0;
        }
        const sync = () => setMsPhone(mq.matches);
        sync();
        if (mq.addEventListener) {
          mq.addEventListener("change", sync);
          return () => mq.removeEventListener("change", sync);
        }
        if (mq.addListener) {
          mq.addListener(sync);
          return () => mq.removeListener(sync);
        }
        return void 0;
      }, []);
      useEffect(() => {
        setMsRecents(msearchReadRecents());
      }, []);
      useEffect(() => {
        const on = msPhone && !msSubmitted;
        try {
          document.body.classList.toggle("msearch-active", on);
        } catch (e) {
        }
        return () => {
          try {
            document.body.classList.remove("msearch-active");
          } catch (e) {
          }
        };
      }, [msPhone, msSubmitted]);
      useEffect(() => {
        if (!msPhone || msSubmitted || msQuery.trim()) return void 0;
        let cancelled = false;
        let previous = [];
        try {
          previous = JSON.parse(window.sessionStorage.getItem(MSEARCH_LAST_SET_KEY) || "[]");
        } catch (e) {
          previous = [];
        }
        const draw = (attempt) => {
          fetch(`search_items.php?random=${MSEARCH_SUGGEST_COUNT}`, { headers: { Accept: "application/json" } }).then((r) => r.ok ? r.json() : null).then((payload) => {
            if (cancelled) return;
            const items = Array.isArray(payload?.items) ? payload.items : [];
            const keys = items.map((i) => String(i.market_hash_name || ""));
            const same = keys.length > 0 && previous.length === keys.length && keys.every((k, i) => k === previous[i]);
            if (same && attempt < 1) {
              draw(attempt + 1);
              return;
            }
            setMsSuggestions(items);
            try {
              window.sessionStorage.setItem(MSEARCH_LAST_SET_KEY, JSON.stringify(keys));
            } catch (e) {
            }
          }).catch(() => {
          });
        };
        draw(0);
        return () => {
          cancelled = true;
        };
      }, [msPhone, msSubmitted, msQuery]);
      useEffect(() => {
        if (!msPhone || msSubmitted) return void 0;
        const q = msQuery.trim();
        if (q.length < MSEARCH_MIN_CHARS) {
          setMsBusy(false);
          return void 0;
        }
        window.clearTimeout(msTimerRef.current);
        msTimerRef.current = window.setTimeout(() => {
          try {
            msAbortRef.current?.abort();
          } catch (e) {
          }
          const controller = new AbortController();
          msAbortRef.current = controller;
          setMsBusy(true);
          fetch(
            `search_items.php?q=${encodeURIComponent(q)}&limit=${MSEARCH_SUGGEST_COUNT}`,
            { headers: { Accept: "application/json" }, signal: controller.signal }
          ).then((r) => r.ok ? r.json() : null).then((payload) => {
            const items = Array.isArray(payload?.items) ? payload.items : [];
            setMsSuggestions(items);
            setMsTotalMatches(Number(payload?.total) || items.length);
            setMsActive(-1);
            setMsBusy(false);
          }).catch((error2) => {
            if (error2?.name !== "AbortError") setMsBusy(false);
          });
        }, MSEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(msTimerRef.current);
      }, [msQuery, msPhone, msSubmitted]);
      useEffect(() => {
        if (!msPhone || msSubmitted) return;
        const node = msInputRef.current;
        if (!node) return;
        try {
          node.focus({ preventScroll: true });
        } catch (e) {
          node.focus();
        }
      }, [msPhone, msSubmitted]);
      const [rarityFilter, setRarityFilter] = useState("");
      const [statTrakOnly, setStatTrakOnly] = useState(false);
      const rarityWord = (item) => String(item.type_note || "").trim().split(/\s+/)[0] || "";
      const isStatTrakItem = (item) => /StatTrak/i.test(String(item.market_hash_name || ""));
      const isKnifeItem = (item) => String(item.category || "") === "knives" || String(item.sub_filter || "") === "knives";
      const withoutStatTrak = (name) => String(name || "").replace(/StatTrak™?\s*/i, "").replace(/\s+/g, " ").trim().toLowerCase();
      const dropDuplicateStatTrakKnives = (items) => {
        const plain = /* @__PURE__ */ new Set();
        items.forEach((item) => {
          if (!isStatTrakItem(item) && isKnifeItem(item)) {
            plain.add(withoutStatTrak(item.market_hash_name));
          }
        });
        if (!plain.size) return items;
        return items.filter((item) => !isStatTrakItem(item) || !isKnifeItem(item) || !plain.has(withoutStatTrak(item.market_hash_name)));
      };
      const filtered = useMemo(() => {
        if (typeof filterCatalogItems !== "function") return [];
        const base = filterCatalogItems(catalog, {
          section,
          group,
          weapon,
          weapon_class: weaponClass,
          agentGroupMap: AGENT_GROUP_MAP || {},
          pinGroupMap: PIN_GROUP_MAP || {},
          patchGroupMap: PATCH_GROUP_MAP || {},
          charmGroupMap: CHARM_GROUP_MAP || {},
          graffitiGroupMap: GRAFFITI_GROUP_MAP || {},
          stickerGroupMap: STICKER_GROUP_MAP || {},
          musicGroupMap: MUSIC_GROUP_MAP || {}
        });
        const deduped = dropDuplicateStatTrakKnives(base);
        const query = search.trim().toLowerCase();
        if (!query) return deduped;
        return deduped.filter((item) => {
          const hay = `${item.display_name} ${item.market_hash_name} ${item.type_note}`.toLowerCase();
          return hay.includes(query);
        });
      }, [catalog, search]);
      const imageItems = useMemo(() => {
        if (typeof hasCatalogImage !== "function") {
          return filtered;
        }
        return filtered.filter((item) => hasCatalogImage(item));
      }, [filtered]);
      const rarityChips = useMemo(() => {
        const rankItem = typeof itemRaritySortRank === "function" ? itemRaritySortRank : typeof stickerRaritySortRank === "function" ? stickerRaritySortRank : () => 99;
        const seen = /* @__PURE__ */ new Map();
        const counts = /* @__PURE__ */ new Map();
        imageItems.forEach((item) => {
          const word = rarityWord(item);
          if (!word) return;
          counts.set(word, (counts.get(word) || 0) + 1);
          if (!seen.has(word)) seen.set(word, rankItem(item));
        });
        return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([word]) => ({ word, count: counts.get(word) || 0 }));
      }, [imageItems]);
      const statTrakCount = useMemo(() => imageItems.filter(isStatTrakItem).length, [imageItems]);
      const hasStatTrak = statTrakCount > 0;
      const visibleItems = useMemo(() => imageItems.filter((item) => (!rarityFilter || rarityWord(item) === rarityFilter) && (!statTrakOnly || isStatTrakItem(item))), [imageItems, rarityFilter, statTrakOnly]);
      const [shownCount, setShownCount] = useState(CATALOG_PAGE_SIZE);
      useEffect(() => {
        setShownCount(CATALOG_PAGE_SIZE);
      }, [search, rarityFilter, statTrakOnly, sortValue]);
      const displayed = useMemo(() => {
        const sorted = [...visibleItems];
        const compareName = (left, right) => String(left.display_name || left.market_hash_name).localeCompare(String(right.display_name || right.market_hash_name));
        const rankItem = typeof itemRaritySortRank === "function" ? itemRaritySortRank : typeof stickerRaritySortRank === "function" ? stickerRaritySortRank : () => 99;
        const releaseTime = (item) => {
          const iso = resolveItemReleaseIso(originLookup, item);
          return iso ? Date.parse(iso) : NaN;
        };
        if (sortValue === "date-desc" || sortValue === "date-asc") {
          const direction = sortValue === "date-desc" ? -1 : 1;
          sorted.sort((left, right) => {
            const leftTime = releaseTime(left);
            const rightTime = releaseTime(right);
            const leftKnown = !Number.isNaN(leftTime);
            const rightKnown = !Number.isNaN(rightTime);
            if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
            if (!leftKnown && !rightKnown) return compareName(left, right);
            return leftTime !== rightTime ? (leftTime - rightTime) * direction : compareName(left, right);
          });
        } else if (sortValue === "rarity-desc") {
          sorted.sort((left, right) => {
            const rankDiff = rankItem(left) - rankItem(right);
            return rankDiff !== 0 ? rankDiff : compareName(left, right);
          });
        } else if (sortValue === "rarity-asc") {
          sorted.sort((left, right) => {
            const rankDiff = rankItem(right) - rankItem(left);
            return rankDiff !== 0 ? rankDiff : compareName(left, right);
          });
        } else if (sortValue === "price-desc") {
          sorted.sort((left, right) => Number(right.seed_sell_price || 0) - Number(left.seed_sell_price || 0));
        } else if (sortValue === "price-asc") {
          sorted.sort((left, right) => Number(left.seed_sell_price || 0) - Number(right.seed_sell_price || 0));
        } else if (sortValue === "name-desc") {
          sorted.sort((left, right) => compareName(right, left));
        } else {
          sorted.sort((left, right) => compareName(left, right));
        }
        return sorted;
      }, [visibleItems, sortValue, originLookup]);
      const [sampleSeed] = useState(() => Math.random());
      const isBareSearch = !section && !group && !search.trim();
      const displayedOrSample = useMemo(() => {
        if (!isBareSearch || displayed.length <= CATALOG_SAMPLE_SIZE) return displayed;
        const pool = [...displayed];
        let x = sampleSeed;
        for (let i = pool.length - 1; i > 0; i -= 1) {
          x = (x * 9301 + 49297) % 233280 / 233280;
          const j = Math.floor(x * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, CATALOG_SAMPLE_SIZE);
      }, [displayed, isBareSearch, sampleSeed]);
      const pageTitle = section === "weapons" ? weapon : group;
      const sectionLabel = SECTION_LABELS[section] || "Items";
      const showRarityChips = section !== "stickers";
      const msRunSearch = (query) => {
        const q = String(query || "").trim();
        if (!q) return;
        setMsRecents(msearchRemember(q));
        setSearch(q);
        setMsSubmitted(true);
        setMsActive(-1);
        try {
          const next = new URLSearchParams(window.location.search);
          next.set("q", q);
          window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
        } catch (e) {
        }
      };
      const msBackToSearch = () => {
        setMsSubmitted(false);
        setSearch("");
        setMsQuery("");
        try {
          const next = new URLSearchParams(window.location.search);
          next.delete("q");
          const qs = next.toString();
          window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
        } catch (e) {
        }
      };
      const msRows = msSuggestions.slice(0, MSEARCH_SUGGEST_COUNT);
      const msTyping = msQuery.trim().length >= MSEARCH_MIN_CHARS;
      const msSubtitle = (item) => {
        const note = String(item.type_note || "").trim();
        if (String(item.category || "") === "skins" && item.selected_wear) {
          return note || String(item.category || "");
        }
        return note || String(item.category || "");
      };
      const msKeyDown = (event) => {
        const max = msRows.length - 1;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setMsActive((i) => i >= max ? 0 : i + 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setMsActive((i) => i <= 0 ? max : i - 1);
        } else if (event.key === "Escape") {
          event.preventDefault();
          setMsQuery("");
          setMsActive(-1);
        } else if (event.key === "Enter") {
          event.preventDefault();
          const chosen = msActive >= 0 ? msRows[msActive] : null;
          if (chosen) {
            setMsRecents(msearchRemember(msQuery.trim() || chosen.display_name));
            window.location.href = typeof buildItemHref === "function" ? buildItemHref(chosen) : "#";
          } else {
            msRunSearch(msQuery);
          }
        }
      };
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: classNames("collections-shell", msPhone && !msSubmitted && "is-msearch") }, msPhone && !msSubmitted ? /* @__PURE__ */ React.createElement("div", { className: "msearch" }, /* @__PURE__ */ React.createElement("div", { className: "msearch-bar" }, /* @__PURE__ */ React.createElement("label", { className: "msearch-sr", htmlFor: "msearch-field" }, t("msearch_label")), /* @__PURE__ */ React.createElement("div", { className: "msearch-field" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement(
        "input",
        {
          id: "msearch-field",
          ref: msInputRef,
          type: "search",
          role: "combobox",
          "aria-expanded": msRows.length > 0,
          "aria-controls": "msearch-list",
          "aria-autocomplete": "list",
          "aria-activedescendant": msActive >= 0 ? `msearch-opt-${msActive}` : void 0,
          autoComplete: "off",
          placeholder: t("msearch_placeholder"),
          value: msQuery,
          onChange: (e) => {
            setMsQuery(e.target.value);
            setMsActive(-1);
          },
          onKeyDown: msKeyDown
        }
      ), msQuery ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "msearch-clear",
          "aria-label": t("msearch_clear"),
          onClick: () => {
            setMsQuery("");
            setMsActive(-1);
            msInputRef.current?.focus();
          }
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark", "aria-hidden": "true" })
      ) : null, msBusy ? /* @__PURE__ */ React.createElement("span", { className: "msearch-progress", "aria-hidden": "true" }) : null), /* @__PURE__ */ React.createElement("button", { type: "button", className: "msearch-cancel", onClick: () => window.history.back() }, t("msearch_cancel"))), /* @__PURE__ */ React.createElement("p", { className: "msearch-label" }, t("msearch_suggestions")), /* @__PURE__ */ React.createElement("ul", { className: "msearch-list", id: "msearch-list", role: "listbox", "aria-label": t("msearch_suggestions") }, msRows.map((item, i) => /* @__PURE__ */ React.createElement("li", { key: item.market_hash_name || i, role: "presentation" }, /* @__PURE__ */ React.createElement(
        "a",
        {
          id: `msearch-opt-${i}`,
          role: "option",
          "aria-selected": msActive === i,
          className: classNames("msearch-row", msActive === i && "is-active"),
          href: typeof buildItemHref === "function" ? buildItemHref(item) : "#",
          onClick: () => msearchRemember(msQuery.trim() || item.display_name)
        },
        /* @__PURE__ */ React.createElement("span", { className: "msearch-thumb" }, /* @__PURE__ */ React.createElement("img", { src: item.image, alt: item.display_name, loading: "lazy", decoding: "async" })),
        /* @__PURE__ */ React.createElement("span", { className: "msearch-copy" }, /* @__PURE__ */ React.createElement("span", { className: "msearch-name" }, item.display_name), /* @__PURE__ */ React.createElement("span", { className: "msearch-sub" }, msSubtitle(item))),
        /* @__PURE__ */ React.createElement("span", { className: "msearch-price" }, item.selected_wear ? t("msearch_from", { price: formatEuroPrice ? formatEuroPrice(item.seed_sell_price) : "" }) : formatEuroPrice ? formatEuroPrice(item.seed_sell_price) : "")
      ))), msTyping ? /* @__PURE__ */ React.createElement("li", { role: "presentation" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "msearch-row msearch-more", onClick: () => msRunSearch(msQuery) }, /* @__PURE__ */ React.createElement("span", { className: "msearch-thumb msearch-thumb--icon" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass", "aria-hidden": "true" })), /* @__PURE__ */ React.createElement("span", { className: "msearch-copy" }, /* @__PURE__ */ React.createElement("span", { className: "msearch-name" }, msRows.length ? t("msearch_seeAll", { n: msTotalMatches || msRows.length, q: msQuery.trim() }) : t("msearch_noMatch", { q: msQuery.trim() }))))) : null), msRecents.length ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("p", { className: "msearch-label msearch-label--row" }, t("msearch_recent"), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "msearch-clear-recent",
          onClick: () => {
            msearchWriteRecents([]);
            setMsRecents([]);
          }
        },
        t("msearch_clearRecent")
      )), /* @__PURE__ */ React.createElement("ul", { className: "msearch-list" }, msRecents.slice(0, MSEARCH_RECENT_SHOWN).map((q) => /* @__PURE__ */ React.createElement("li", { key: q }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "msearch-row msearch-recent", onClick: () => msRunSearch(q) }, /* @__PURE__ */ React.createElement("span", { className: "msearch-thumb msearch-thumb--icon" }, /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-clock", "aria-hidden": "true" })), /* @__PURE__ */ React.createElement("span", { className: "msearch-copy" }, /* @__PURE__ */ React.createElement("span", { className: "msearch-name" }, q))))))) : null) : null, /* @__PURE__ */ React.createElement("header", { className: "collections-head collections-head--toolbar" }, /* @__PURE__ */ React.createElement("h1", { className: "collections-head-sr-title" }, pageTitle || sectionLabel)), /* @__PURE__ */ React.createElement("div", { className: "collections-controls is-catalog-page" }, /* @__PURE__ */ React.createElement("div", { className: "collections-search-wrap" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" }), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          placeholder: `Search ${pageTitle || "items"}...`,
          value: search,
          onChange: (event) => setSearch(event.target.value)
        }
      )), !loading && showRarityChips && (rarityChips.length > 1 || hasStatTrak) ? /* @__PURE__ */ React.createElement("div", { className: "collections-filter-chips", role: "group", "aria-label": "Filters" }, rarityChips.length > 1 ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "collections-filter-chip" + (!rarityFilter ? " is-active" : ""),
          onClick: () => setRarityFilter("")
        },
        t("cat_all"),
        /* @__PURE__ */ React.createElement("span", { className: "chip-count" }, imageItems.length)
      ) : null, rarityChips.length > 1 ? rarityChips.map(({ word, count }) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: word,
          type: "button",
          className: "collections-filter-chip" + (rarityFilter === word ? " is-active" : ""),
          onClick: () => setRarityFilter(rarityFilter === word ? "" : word)
        },
        word,
        /* @__PURE__ */ React.createElement("span", { className: "chip-count" }, count)
      )) : null, hasStatTrak ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "collections-filter-chip" + (statTrakOnly ? " is-active" : ""),
          onClick: () => setStatTrakOnly((value) => !value)
        },
        t("cat_stattrakChip"),
        /* @__PURE__ */ React.createElement("span", { className: "chip-count" }, statTrakCount)
      ) : null) : null, !loading ? /* @__PURE__ */ React.createElement("span", { className: "collections-results-count" }, t("cat_resultsCount", { count: displayedOrSample.length })) : null, /* @__PURE__ */ React.createElement(
        SortChipPicker,
        {
          value: sortValue,
          onChange: setSortValue,
          ariaLabel: "Sort catalog items",
          options: isDatedSection ? CATALOG_SORT_OPTIONS_DATED : CATALOG_SORT_OPTIONS
        }
      )), error ? /* @__PURE__ */ React.createElement("p", { className: "no-results" }, error) : null, !error && loading ? /* @__PURE__ */ React.createElement("div", { className: "collections-grid" }, Array.from({ length: 12 }).map((_, index) => /* @__PURE__ */ React.createElement("div", { className: "card catalog-skeleton", key: index }, /* @__PURE__ */ React.createElement("div", { className: "card-media" }), /* @__PURE__ */ React.createElement("div", { className: "card-body" }, /* @__PURE__ */ React.createElement("h3", null, "Loading..."))))) : null, !error && !loading ? /* @__PURE__ */ React.createElement("div", { className: "collections-grid collections-grid-animated", key: `grid-${search.trim() || "all"}-${rarityFilter || "all"}-${statTrakOnly ? "st" : "any"}` }, displayedOrSample.slice(0, shownCount).map((item, index) => /* @__PURE__ */ React.createElement(
        CatalogItemCard,
        {
          key: item.market_hash_name,
          item,
          sectionLabel,
          index,
          originLookup
        }
      ))) : null, !error && !loading && displayedOrSample.length > shownCount ? /* @__PURE__ */ React.createElement("div", { className: "catalog-more-row" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "catalog-more-btn",
          onClick: () => setShownCount((count) => count + CATALOG_PAGE_SIZE)
        },
        "Show more",
        /* @__PURE__ */ React.createElement("span", { className: "catalog-more-count" }, Math.min(CATALOG_PAGE_SIZE, displayed.length - shownCount).toLocaleString("en-US"), " of ", (displayed.length - shownCount).toLocaleString("en-US"))
      )) : null, !loading && !error && !displayed.length ? /* @__PURE__ */ React.createElement("p", { className: "no-results" }, "No items found for this group.") : null));
    }
    mountPage(/* @__PURE__ */ React.createElement(CatalogItemsPage, null));
  })();
})();
