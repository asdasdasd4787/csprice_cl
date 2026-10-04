(() => {
  const { useEffect, useMemo, useRef, useState } = React;
  const { Layout, SortChipPicker, ShowcaseCard, resolveWeaponMediaClass, mountPage, useI18n, classNames } = window.CS2React;
  const data = window.CS2ReactData || {};

  // Cards rendered per page. Big enough that every group route still arrives
  // complete, small enough that an unfiltered section does not lock the tab up
  // laying out twenty thousand of them.
  // Half of the former 240: a full slab of 240 cards took too long to paint
  // on the 10,000-sticker list (user, 2026-10-02: "load only a half").
  /* ---- phone search screen (owner, 2026-10-03) --------------------------
     On a phone the Search tab opens this page as a search SCREEN rather than a
     catalogue grid: a field, five suggestions and the recent searches. The grid
     is still the results - submitting a query switches to it - so there is one
     page, one URL and the back button behaves. Desktop is untouched. */
  const MSEARCH_SUGGEST_COUNT = 5;
  const MSEARCH_RECENT_MAX = 10;
  const MSEARCH_RECENT_SHOWN = 5;
  const MSEARCH_DEBOUNCE_MS = 150;
  const MSEARCH_MIN_CHARS = 2;
  const MSEARCH_RECENT_KEY = "csprice-recent-searches";
  // Remembers the previous random set so the screen never opens on it twice.
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
    } catch (e) { /* private mode: recents simply do not persist */ }
  }

  function msearchRemember(query) {
    const q = String(query || "").trim();
    if (!q) return msearchReadRecents();
    const next = [q, ...msearchReadRecents().filter((v) => v.toLowerCase() !== q.toLowerCase())];
    msearchWriteRecents(next);
    return next;
  }

  const CATALOG_PAGE_SIZE = 120;
  // How many random items the bare Search view showcases.
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
    formatCollectionReleaseDate,
  } = data;

  const params = new URLSearchParams(window.location.search);
  // A generated weapon page (/smgs/mac-10/) has no query string and carries
  // what to list in __CATALOG_ROUTE__ instead; scripts/build_catalog_urls.php
  // writes it. The query still wins so a hand-typed link keeps working.
  const CATALOG_ROUTE = (window.__CATALOG_ROUTE__ && typeof window.__CATALOG_ROUTE__ === "object")
    ? window.__CATALOG_ROUTE__
    : null;
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

  // Tidy the address bar: "weapon" repeats "group" and "folder" is unused, so
  // the link keeps only what identifies the list. Done after the values above
  // are read, and the short link loads the same page.
  (() => {
    try {
      // The generated page's own URL is already the clean one - rewriting it
      // with a query string would put the ugly form back.
      if (CATALOG_ROUTE) return;
      if (!window.history || typeof window.history.replaceState !== "function") return;
      if (!section || !group) return;
      const keep = new URLSearchParams();
      keep.set("section", section);
      keep.set("group", group);
      if (weaponClass) keep.set("weapon_class", weaponClass);
      const q = params.get("q");
      if (q) keep.set("q", q);
      // This list has a generated page of its own, so show that address
      // instead of the query string - the same list, at a URL worth sharing.
      const pretty = typeof data.catalogPrettyHref === "function"
        ? data.catalogPrettyHref(section, group, { weapon_class: weaponClass })
        : "";
      if (pretty) {
        // Moving the URL into a folder moves the document's base directory, so
        // every relative asset would resolve under /smgs/mac-10/ from here on.
        if (!document.querySelector("base[href]")) {
          const baseEl = document.createElement("base");
          const basePath = window.CS2React && typeof window.CS2React.siteBasePath === "function"
            ? window.CS2React.siteBasePath()
            : "/";
          baseEl.setAttribute("href", basePath);
          document.head.insertBefore(baseEl, document.head.firstChild);
        }
        const base = document.querySelector("base[href]").getAttribute("href");
        const q = params.get("q");
        const target = base + pretty + (q ? `?q=${encodeURIComponent(q)}` : "");
        window.history.replaceState(window.history.state, "", target);
        return;
      }

      const tidy = window.location.pathname + "?" + keep.toString();
      if (tidy !== window.location.pathname + window.location.search) {
        window.history.replaceState(window.history.state, "", tidy);
      }
    } catch (_error) {
      // Never block rendering over a cosmetic URL change.
    }
  })();

  // Sections whose grey card subtitle is a collection/operation name (as
  // opposed to weapon skins, whose subtitle is a case/collection the skin
  // drops from and isn't covered by collection-release-dates.js).
  const DATED_ORIGIN_SECTIONS = new Set(["agents", "charms", "patches", "pins", "graffiti", "music"]);

  const CATALOG_SORT_OPTIONS = [
    { value: "rarity-desc", label: "Rarity" },
    { value: "rarity-asc", label: "Common" },
    { value: "name-asc", label: "A → Z" },
    { value: "name-desc", label: "Z → A" },
    { value: "price-desc", label: "High $" },
    { value: "price-asc", label: "Low $" },
  ];

  const CATALOG_SORT_OPTIONS_DATED = [
    { value: "date-desc", label: "Newest" },
    { value: "date-asc", label: "Oldest" },
    ...CATALOG_SORT_OPTIONS,
  ];

  const SECTION_LABELS = {
    stickers: "Stickers",
    music: "Music Kits",
    agents: "Agents",
    charms: "Charms",
    patches: "Patches",
    pins: "Collectible Pins",
    graffiti: "Graffiti",
    weapons: "Weapon Skins",
  };

  // Same static reverse lookup item-page.tsx uses for its "CASE" / "COLLECTION"
  // breadcrumb (skin name -> the case/collection it drops from) — reused here
  // so these cards can show the real source instead of a generic "Weapon Skins".
  const SKIN_ORIGIN_LOOKUP_URL = "assets/steam-market-cache/skin_origin_lookup.json?v=20260710-collection-origin-fix-1";
  let skinOriginLookupPromise = null;

  function loadSkinOriginLookup() {
    if (!skinOriginLookupPromise) {
      skinOriginLookupPromise = fetch(SKIN_ORIGIN_LOOKUP_URL, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`Skin origin lookup failed (${response.status})`);
          return response.json();
        })
        .then((payload) => (payload?.items && typeof payload.items === "object" ? payload.items : {}))
        .catch(() => ({}));
    }
    return skinOriginLookupPromise;
  }

  function normalizeOriginLookupKey(name) {
    return String(name || "")
      .replace(/^Souvenir\s+/i, "")
      .replace(/^StatTrak™\s+/i, "")
      .replace(/\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "")
      .trim()
      .toLowerCase();
  }

  function resolveItemOrigin(originLookup, item) {
    if (!originLookup) return "";
    const key = normalizeOriginLookupKey(item.market_hash_name);
    return key ? String(originLookup[key] || "").trim() : "";
  }

  // The collection/operation an item's grey subtitle would otherwise name —
  // used both to render that subtitle and, when it has a known release date
  // in collection-release-dates.js, to sort by that date.
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
    const subtitle = (releaseIso && typeof formatCollectionReleaseDate === "function")
      ? formatCollectionReleaseDate(releaseIso)
      : (originName || sectionLabel);

    if (!image || hidden) {
      return null;
    }

    return (
      <ShowcaseCard
        href={href}
        image={image}
        imageAlt={title}
        accent={accent}
        labelLeft={item.type_note || sectionLabel}
        labelRight={price}
        title={title}
        subtitle={subtitle}
        animated
        staggerIndex={index}
        mediaClassName={section === "weapons" ? resolveWeaponMediaClass(title) : ""}
        onImageError={() => setHidden(true)}
      />
    );
  }

  function CatalogItemsPage() {
    const { t } = useI18n();
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");

    /* ---- phone search screen state ------------------------------------ */
    /* Everything is declared here, above every use: a const read before its
       declaration is a TDZ ReferenceError that esbuild compiles silently, and
       it takes the whole page out rather than just this feature. */
    const msearchInitialPhone = (() => {
      try { return window.matchMedia("(max-width: 767px)").matches; } catch (e) { return false; }
    })();
    const [msPhone, setMsPhone] = useState(msearchInitialPhone);
    const [msQuery, setMsQuery] = useState("");
    // The grid only appears once a query has been submitted.
    /* The search screen is for the bare Search tab only. Any URL that names
       what to show - ?section=stickers from the More sheet, ?group=, ?weapon=,
       or a submitted ?q= - is a request for the LISTING, and showing the search
       field instead swallowed it: tapping Stickers landed on an empty search
       box (owner, 2026-10-03). */
    const [msSubmitted, setMsSubmitted] = useState(() => {
      try {
        const p = new URLSearchParams(window.location.search);
        return Boolean(p.get("q") || p.get("section") || p.get("group") || p.get("weapon") || p.get("weapon_class"));
      } catch (e) { return false; }
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
    const [sortValue, setSortValue] = useState((isDatedSection && section !== "charms" && section !== "agents") ? "date-desc" : "rarity-desc");
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
        return undefined;
      }

      loadCatalog()
        .then((items) => {
          if (!alive) return;
          setCatalog(items);
          setLoading(false);
        })
        .catch((fetchError) => {
          if (!alive) return;
          setCatalog([]);
          setLoading(false);
          setError(fetchError?.message || "Unable to load catalog.");
        });

      return () => {
        alive = false;
      };
    }, []);

    // Toolbar chips: one per rarity present in this list plus a StatTrak™ toggle.
    /* Track the breakpoint so the screen appears and disappears with it. */
    useEffect(() => {
      let mq;
      try { mq = window.matchMedia("(max-width: 767px)"); } catch (e) { return undefined; }
      const sync = () => setMsPhone(mq.matches);
      sync();
      if (mq.addEventListener) { mq.addEventListener("change", sync); return () => mq.removeEventListener("change", sync); }
      if (mq.addListener) { mq.addListener(sync); return () => mq.removeListener(sync); }
      return undefined;
    }, []);

    useEffect(() => { setMsRecents(msearchReadRecents()); }, []);

    /* The screen marks the BODY while it is up, and the footer/nav rules hang
       off that class.

       This used to be scoped to html[data-page="catalog-items.html"], set once
       by the shell at start-up - and that attribute was observed holding the
       PREVIOUS page's value ("roi.html") after a real navigation, so the rule
       silently stopped matching and 700px of footer came back under the search
       field. A class owned by the component that renders the screen cannot go
       stale that way: it is added when the screen mounts and removed when it
       does not. */
    useEffect(() => {
      const on = msPhone && !msSubmitted;
      try {
        document.body.classList.toggle("msearch-active", on);
      } catch (e) { /* no body yet: nothing to scope */ }
      return () => {
        try { document.body.classList.remove("msearch-active"); } catch (e) { /* ignore */ }
      };
    }, [msPhone, msSubmitted]);

    /* A fresh random set every time the screen opens, never the same one twice
       running. The previous set's keys live in sessionStorage, so a reload gets
       something new but a new tab is not penalised. */
    useEffect(() => {
      if (!msPhone || msSubmitted || msQuery.trim()) return undefined;
      let cancelled = false;
      let previous = [];
      try { previous = JSON.parse(window.sessionStorage.getItem(MSEARCH_LAST_SET_KEY) || "[]"); } catch (e) { previous = []; }

      const draw = (attempt) => {
        fetch(`search_items.php?random=${MSEARCH_SUGGEST_COUNT}`, { headers: { Accept: "application/json" } })
          .then((r) => (r.ok ? r.json() : null))
          .then((payload) => {
            if (cancelled) return;
            const items = Array.isArray(payload?.items) ? payload.items : [];
            const keys = items.map((i) => String(i.market_hash_name || ""));
            const same = keys.length > 0 && previous.length === keys.length
              && keys.every((k, i) => k === previous[i]);
            // One retry is enough: a second identical draw out of thousands of
            // eligible items means the pool is tiny, and looping would hammer
            // the endpoint for a cosmetic win.
            if (same && attempt < 1) { draw(attempt + 1); return; }
            setMsSuggestions(items);
            try { window.sessionStorage.setItem(MSEARCH_LAST_SET_KEY, JSON.stringify(keys)); } catch (e) { /* ignore */ }
          })
          .catch(() => { /* offline or gated: the section simply stays empty */ });
      };
      draw(0);
      return () => { cancelled = true; };
    }, [msPhone, msSubmitted, msQuery]);

    /* Typed search: debounced, and the previous request is aborted rather than
       left to land out of order on a slow connection. */
    useEffect(() => {
      if (!msPhone || msSubmitted) return undefined;
      const q = msQuery.trim();
      if (q.length < MSEARCH_MIN_CHARS) { setMsBusy(false); return undefined; }

      window.clearTimeout(msTimerRef.current);
      msTimerRef.current = window.setTimeout(() => {
        try { msAbortRef.current?.abort(); } catch (e) { /* already settled */ }
        const controller = new AbortController();
        msAbortRef.current = controller;
        setMsBusy(true);
        fetch(`search_items.php?q=${encodeURIComponent(q)}&limit=${MSEARCH_SUGGEST_COUNT}`,
          { headers: { Accept: "application/json" }, signal: controller.signal })
          .then((r) => (r.ok ? r.json() : null))
          .then((payload) => {
            const items = Array.isArray(payload?.items) ? payload.items : [];
            // Rows are replaced only when the answer arrives, so the previous
            // list stays on screen while a request is in flight.
            setMsSuggestions(items);
            setMsTotalMatches(Number(payload?.total) || items.length);
            setMsActive(-1);
            setMsBusy(false);
          })
          .catch((error) => { if (error?.name !== "AbortError") setMsBusy(false); });
      }, MSEARCH_DEBOUNCE_MS);

      return () => window.clearTimeout(msTimerRef.current);
    }, [msQuery, msPhone, msSubmitted]);

    /* Autofocus on open - but never steal the caret from someone already typing
       or from a visitor who arrived with a query in the URL. */
    useEffect(() => {
      if (!msPhone || msSubmitted) return;
      const node = msInputRef.current;
      if (!node) return;
      try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
    }, [msPhone, msSubmitted]);

    const [rarityFilter, setRarityFilter] = useState("");
    const [statTrakOnly, setStatTrakOnly] = useState(false);
    const rarityWord = (item) => String(item.type_note || "").trim().split(/\s+/)[0] || "";
    const isStatTrakItem = (item) => /StatTrak/i.test(String(item.market_hash_name || ""));
    const isKnifeItem = (item) => String(item.category || "") === "knives"
      || String(item.sub_filter || "") === "knives";
    const withoutStatTrak = (name) => String(name || "")
      .replace(/StatTrak™?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    /**
     * Knife pages listed every finish twice, once plain and once StatTrak™.
     * Keep the plain card and drop its StatTrak twin; a finish that only exists
     * as StatTrak still gets its own card.
     */
    const dropDuplicateStatTrakKnives = (items) => {
      const plain = new Set();
      items.forEach((item) => {
        if (!isStatTrakItem(item) && isKnifeItem(item)) {
          plain.add(withoutStatTrak(item.market_hash_name));
        }
      });
      if (!plain.size) return items;
      return items.filter((item) => (
        !isStatTrakItem(item)
        || !isKnifeItem(item)
        || !plain.has(withoutStatTrak(item.market_hash_name))
      ));
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
        musicGroupMap: MUSIC_GROUP_MAP || {},
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
      const rankItem = typeof itemRaritySortRank === "function"
        ? itemRaritySortRank
        : (typeof stickerRaritySortRank === "function" ? stickerRaritySortRank : () => 99);
      const seen = new Map();
      const counts = new Map();
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

    const visibleItems = useMemo(() => imageItems.filter((item) => (
      (!rarityFilter || rarityWord(item) === rarityFilter)
      && (!statTrakOnly || isStatTrakItem(item))
    )), [imageItems, rarityFilter, statTrakOnly]);

    // Every card was rendered at once, which was fine while every route was a
    // single group of a few dozen. The navbar's Skins entry opens
    // section=weapons with no group - about twenty thousand finishes - so the
    // grid grows in pages instead. Resets whenever the filters change.
    const [shownCount, setShownCount] = useState(CATALOG_PAGE_SIZE);
    useEffect(() => {
      setShownCount(CATALOG_PAGE_SIZE);
    }, [search, rarityFilter, statTrakOnly, sortValue]);

    const displayed = useMemo(() => {
      const sorted = [...visibleItems];
      const compareName = (left, right) => (
        String(left.display_name || left.market_hash_name).localeCompare(String(right.display_name || right.market_hash_name))
      );
      const rankItem = typeof itemRaritySortRank === "function"
        ? itemRaritySortRank
        : (typeof stickerRaritySortRank === "function" ? stickerRaritySortRank : () => 99);

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
          // Undated items (no known release day) always sort after dated
          // ones, regardless of direction — an unknown date isn't "oldest".
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

    /* The Search tab opens this page bare - no section, no group, nothing typed
       - and an alphabetical wall of the whole catalogue is a poor answer to an
       empty search box. Show a small random sample instead, so there is
       something to look at and tapping through is the obvious next move
       (owner, 2026-10-03).

       Scoped hard on purpose: only with no section AND no group AND an empty
       query, so every real catalogue route - section=stickers, the weapon
       pages, anything the navbar links - keeps its deterministic order. The
       seed is fixed per mount via useState, so re-renders (typing, filters,
       sort) do not reshuffle under the user; a fresh visit re-rolls. */
    const [sampleSeed] = useState(() => Math.random());
    const isBareSearch = !section && !group && !search.trim();
    const displayedOrSample = useMemo(() => {
      if (!isBareSearch || displayed.length <= CATALOG_SAMPLE_SIZE) return displayed;
      const pool = [...displayed];
      // Deterministic shuffle from the one seed, so the order is stable for the
      // life of the mount rather than different on every render.
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
      } catch (e) { /* history blocked: the results still show */ }
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
      } catch (e) { /* ignore */ }
    };

    const msRows = msSuggestions.slice(0, MSEARCH_SUGGEST_COUNT);
    const msTyping = msQuery.trim().length >= MSEARCH_MIN_CHARS;

    // "Classified rifle, 5 wears" for skins; the plain type for everything else.
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
        setMsActive((i) => (i >= max ? 0 : i + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setMsActive((i) => (i <= 0 ? max : i - 1));
      } else if (event.key === "Escape") {
        event.preventDefault();
        setMsQuery("");
        setMsActive(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const chosen = msActive >= 0 ? msRows[msActive] : null;
        if (chosen) {
          setMsRecents(msearchRemember(msQuery.trim() || chosen.display_name));
          // Same builder the grid cards use, so a suggestion lands on the
          // pretty /skins/... page wherever one exists.
          window.location.href = typeof buildItemHref === "function" ? buildItemHref(chosen) : "#";
        } else {
          msRunSearch(msQuery);
        }
      }
    };

    return (
      <Layout>
        <div className={classNames("collections-shell", msPhone && !msSubmitted && "is-msearch")}>

          {/* ── Phone search screen ──
              Shown instead of the grid until a query is submitted. The grid is
              still the results view, so there is one page and one URL. */}
          {msPhone && !msSubmitted ? (
            <div className="msearch">
              <div className="msearch-bar">
                <label className="msearch-sr" htmlFor="msearch-field">{t("msearch_label")}</label>
                <div className="msearch-field">
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                  <input
                    id="msearch-field"
                    ref={msInputRef}
                    type="search"
                    role="combobox"
                    aria-expanded={msRows.length > 0}
                    aria-controls="msearch-list"
                    aria-autocomplete="list"
                    aria-activedescendant={msActive >= 0 ? `msearch-opt-${msActive}` : undefined}
                    autoComplete="off"
                    placeholder={t("msearch_placeholder")}
                    value={msQuery}
                    onChange={(e) => { setMsQuery(e.target.value); setMsActive(-1); }}
                    onKeyDown={msKeyDown}
                  />
                  {msQuery ? (
                    <button
                      type="button"
                      className="msearch-clear"
                      aria-label={t("msearch_clear")}
                      onClick={() => { setMsQuery(""); setMsActive(-1); msInputRef.current?.focus(); }}
                    >
                      <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                  ) : null}
                  {/* A thin bar under the field, not a spinner: the rows below
                      stay put while a request is in flight. */}
                  {msBusy ? <span className="msearch-progress" aria-hidden="true" /> : null}
                </div>
                <button type="button" className="msearch-cancel" onClick={() => window.history.back()}>
                  {t("msearch_cancel")}
                </button>
              </div>

              <p className="msearch-label">{t("msearch_suggestions")}</p>
              <ul className="msearch-list" id="msearch-list" role="listbox" aria-label={t("msearch_suggestions")}>
                {msRows.map((item, i) => (
                  <li key={item.market_hash_name || i} role="presentation">
                    <a
                      id={`msearch-opt-${i}`}
                      role="option"
                      aria-selected={msActive === i}
                      className={classNames("msearch-row", msActive === i && "is-active")}
                      href={typeof buildItemHref === "function" ? buildItemHref(item) : "#"}
                      onClick={() => msearchRemember(msQuery.trim() || item.display_name)}
                    >
                      <span className="msearch-thumb">
                        <img src={item.image} alt={item.display_name} loading="lazy" decoding="async" />
                      </span>
                      <span className="msearch-copy">
                        <span className="msearch-name">{item.display_name}</span>
                        <span className="msearch-sub">{msSubtitle(item)}</span>
                      </span>
                      <span className="msearch-price">
                        {item.selected_wear
                          ? t("msearch_from", { price: formatEuroPrice ? formatEuroPrice(item.seed_sell_price) : "" })
                          : (formatEuroPrice ? formatEuroPrice(item.seed_sell_price) : "")}
                      </span>
                    </a>
                  </li>
                ))}

                {msTyping ? (
                  <li role="presentation">
                    <button type="button" className="msearch-row msearch-more" onClick={() => msRunSearch(msQuery)}>
                      <span className="msearch-thumb msearch-thumb--icon">
                        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                      </span>
                      <span className="msearch-copy">
                        <span className="msearch-name">
                          {msRows.length
                            ? t("msearch_seeAll", { n: msTotalMatches || msRows.length, q: msQuery.trim() })
                            : t("msearch_noMatch", { q: msQuery.trim() })}
                        </span>
                      </span>
                    </button>
                  </li>
                ) : null}
              </ul>

              {/* No recents, no section - and never an empty-state message. */}
              {msRecents.length ? (
                <>
                  <p className="msearch-label msearch-label--row">
                    {t("msearch_recent")}
                    <button
                      type="button"
                      className="msearch-clear-recent"
                      onClick={() => { msearchWriteRecents([]); setMsRecents([]); }}
                    >
                      {t("msearch_clearRecent")}
                    </button>
                  </p>
                  <ul className="msearch-list">
                    {msRecents.slice(0, MSEARCH_RECENT_SHOWN).map((q) => (
                      <li key={q}>
                        <button type="button" className="msearch-row msearch-recent" onClick={() => msRunSearch(q)}>
                          <span className="msearch-thumb msearch-thumb--icon">
                            <i className="fa-regular fa-clock" aria-hidden="true" />
                          </span>
                          <span className="msearch-copy">
                            <span className="msearch-name">{q}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          ) : null}

          <header className="collections-head collections-head--toolbar">
            {/* Title kept for screen readers / SEO only; the toolbar is the header. */}
            <h1 className="collections-head-sr-title">{pageTitle || sectionLabel}</h1>
          </header>

          {/* is-catalog-page marks a single section/weapon listing, where the
              phone layout drops the sort control (the rarity chips above cover
              it). Category landing pages keep theirs. */}
          <div className="collections-controls is-catalog-page">
            <div className="collections-search-wrap">
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="text"
                placeholder={`Search ${pageTitle || "items"}...`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {/* Stickers: no rarity chip row. Ten thousand stickers spread over
                seven grades made a strip of eight chips that swamped the
                toolbar; the sort control still orders by rarity, and the page
                now reads like the other listings - search, count, sort. */}
            {!loading && showRarityChips && (rarityChips.length > 1 || hasStatTrak) ? (
              <div className="collections-filter-chips" role="group" aria-label="Filters">
                {rarityChips.length > 1 ? (
                  <button
                    type="button"
                    className={"collections-filter-chip" + (!rarityFilter ? " is-active" : "")}
                    onClick={() => setRarityFilter("")}
                  >
                    {t("cat_all")}
                    <span className="chip-count">{imageItems.length}</span>
                  </button>
                ) : null}
                {rarityChips.length > 1 ? rarityChips.map(({ word, count }) => (
                  <button
                    key={word}
                    type="button"
                    className={"collections-filter-chip" + (rarityFilter === word ? " is-active" : "")}
                    onClick={() => setRarityFilter(rarityFilter === word ? "" : word)}
                  >
                    {word}
                    <span className="chip-count">{count}</span>
                  </button>
                )) : null}
                {hasStatTrak ? (
                  <button
                    type="button"
                    className={"collections-filter-chip" + (statTrakOnly ? " is-active" : "")}
                    onClick={() => setStatTrakOnly((value) => !value)}
                  >
                    {t("cat_stattrakChip")}
                    <span className="chip-count">{statTrakCount}</span>
                  </button>
                ) : null}
              </div>
            ) : null}
            {!loading ? (
              <span className="collections-results-count">{t("cat_resultsCount", { count: displayedOrSample.length })}</span>
            ) : null}
            <SortChipPicker
              value={sortValue}
              onChange={setSortValue}
              ariaLabel="Sort catalog items"
              options={isDatedSection ? CATALOG_SORT_OPTIONS_DATED : CATALOG_SORT_OPTIONS}
            />
          </div>

          {error ? <p className="no-results">{error}</p> : null}

          {!error && loading ? (
            <div className="collections-grid">
              {Array.from({ length: 12 }).map((_, index) => (
                <div className="card catalog-skeleton" key={index}>
                  <div className="card-media" />
                  <div className="card-body"><h3>Loading...</h3></div>
                </div>
              ))}
            </div>
          ) : null}

          {!error && !loading ? (
            <div className="collections-grid collections-grid-animated" key={`grid-${search.trim() || "all"}-${rarityFilter || "all"}-${statTrakOnly ? "st" : "any"}`}>
              {displayedOrSample.slice(0, shownCount).map((item, index) => (
                <CatalogItemCard
                  key={item.market_hash_name}
                  item={item}
                  sectionLabel={sectionLabel}
                  index={index}
                  originLookup={originLookup}
                />
              ))}
            </div>
          ) : null}

          {!error && !loading && displayedOrSample.length > shownCount ? (
            <div className="catalog-more-row">
              <button
                type="button"
                className="catalog-more-btn"
                onClick={() => setShownCount((count) => count + CATALOG_PAGE_SIZE)}
              >
                Show more
                <span className="catalog-more-count">
                  {Math.min(CATALOG_PAGE_SIZE, displayed.length - shownCount).toLocaleString("en-US")}
                  {" of "}
                  {(displayed.length - shownCount).toLocaleString("en-US")}
                </span>
              </button>
            </div>
          ) : null}

          {!loading && !error && !displayed.length ? (
            <p className="no-results">No items found for this group.</p>
          ) : null}
        </div>
      </Layout>
    );
  }

  mountPage(<CatalogItemsPage />);
})();
