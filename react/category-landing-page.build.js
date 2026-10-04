(() => {
  (() => {
    const { useEffect, useMemo, useRef, useState } = React;
    const { Layout, SortChipPicker, ShowcaseCard, CategoryCountBadge, mountPage, useI18n } = window.CS2React;
    const data = window.CS2ReactData || {};
    const CATALOG_COUNTS_URL = "assets/data/catalog-counts.json?v=20260919-counts-2";
    let catalogCountsPromise = null;
    function loadCatalogCounts() {
      if (!catalogCountsPromise) {
        catalogCountsPromise = fetch(CATALOG_COUNTS_URL).then((response) => response.ok ? response.json() : null).catch(() => null);
      }
      return catalogCountsPromise;
    }
    function formatCount(value) {
      const n = Number(value) || 0;
      return n.toLocaleString("en-US");
    }
    function CategoryDataLine({ groups, counts, t, hrefFor }) {
      const nodes = Array.isArray(groups) ? groups : [];
      if (!nodes.length) return null;
      const weapons = counts && counts.weapons || {};
      const topSkins = counts && counts.top_skins || {};
      const dense = nodes.length > 12;
      const total = nodes.reduce((sum, entry) => sum + (Number(weapons[normalizeGroupLabel(entry)]) || 0), 0);
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          className: classNames("collections-head-line", dense && "is-dense"),
          role: "list",
          "aria-label": total > 0 ? t("cat_countSkins", { count: formatCount(total) }) : void 0
        },
        /* @__PURE__ */ React.createElement("span", { className: "collections-head-line-track", "aria-hidden": "true" }),
        nodes.map((entry, index) => {
          const name = normalizeGroupLabel(entry);
          const count = Number(weapons[name]) || 0;
          const left = nodes.length === 1 ? 50 : 3 + index * 94 / (nodes.length - 1);
          const tip = count > 0 ? `${name} · ${t("cat_countSkins", { count: formatCount(count) })}` : name;
          const top = topSkins[name] && topSkins[name].image ? topSkins[name] : null;
          const image = top ? top.image : entry.img;
          return /* @__PURE__ */ React.createElement(
            "a",
            {
              key: name,
              role: "listitem",
              className: "collections-head-node",
              href: hrefFor(entry, name),
              style: { left: `${left}%`, "--node-i": index },
              "aria-label": tip
            },
            /* @__PURE__ */ React.createElement("span", { className: "collections-head-node-dot", "aria-hidden": "true" }),
            image ? /* @__PURE__ */ React.createElement(
              "img",
              {
                className: classNames("collections-head-node-img", top && "is-skin"),
                src: image,
                alt: "",
                loading: "eager",
                decoding: "async",
                referrerPolicy: "no-referrer"
              }
            ) : /* @__PURE__ */ React.createElement("span", { className: "collections-head-node-label", "aria-hidden": "true" }, name),
            /* @__PURE__ */ React.createElement("span", { className: "collections-head-node-tip", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("strong", null, name), count > 0 ? /* @__PURE__ */ React.createElement("em", null, t("cat_countSkins", { count: formatCount(count) })) : null)
          );
        })
      );
    }
    const {
      buildCatalogItemsHref,
      resolveWeaponAssetFolder,
      buildDefaultWeaponImage,
      resolveCollectionReleaseDate,
      formatCollectionReleaseDate: formatKnownCollectionDate
    } = data;
    const DATED_OTHER_SECTIONS = /* @__PURE__ */ new Set(["agents", "charms", "patches", "pins", "graffiti", "music"]);
    const currentPage = (() => {
      const shared = window.CS2React && typeof window.CS2React.getCurrentPageName === "function" ? window.CS2React.getCurrentPageName() : "";
      if (shared) return shared;
      const raw = window.location.pathname.split("/").filter(Boolean).pop() || "index.html";
      return /\.[A-Za-z0-9]{1,8}$/.test(raw) ? raw : `${raw}.html`;
    })();
    const STICKER_GROUPS = Array.isArray(data.navStickers) ? data.navStickers : [];
    const STICKER_IMAGE_VERSION = "20260704-capsules";
    const STICKER_GROUP_CAPSULES = {
      // Tournament sets: the card shows the Legends capsule, so that is the
      // capsule the card opens (the Challengers / Contenders / autograph
      // capsules of the same event are one search away on the Capsules page).
      "Katowice 2014": "EMS Katowice 2014 Legends",
      "Cologne 2014": "ESL One Cologne 2014 Legends",
      "DreamHack 2014": "DreamHack 2014 Legends (Holo-Foil)",
      "Katowice 2015": "ESL One Katowice 2015 Legends (Holo-Foil)",
      "Cologne 2015": "ESL One Cologne 2015 Legends (Foil)",
      "Cluj-Napoca 2015": "DreamHack Cluj-Napoca 2015 Legends (Foil)",
      "MLG Columbus 2016": "MLG Columbus 2016 Legends (Holo-Foil)",
      "Cologne 2016": "Cologne 2016 Legends (Holo-Foil)",
      "Atlanta 2017": "Atlanta 2017 Legends (Holo-Foil)",
      "Krakow 2017": "Krakow 2017 Legends (Holo-Foil)",
      "Boston 2018": "Boston 2018 Legends (Holo-Foil)",
      "London 2018": "London 2018 Legends (Holo-Foil)",
      "Katowice 2019": "Katowice 2019 Legends (Holo-Foil)",
      "Berlin 2019": "Berlin 2019 Legends (Holo-Foil)",
      "2020 RMR": "2020 RMR Legends",
      "Stockholm 2021": "Stockholm 2021 Legends Sticker Capsule",
      "Antwerp 2022": "Antwerp 2022 Legends Sticker Capsule",
      "Rio 2022": "Rio 2022 Legends Sticker Capsule",
      "Paris 2023": "Paris 2023 Legends Sticker Capsule",
      "Copenhagen 2024": "Copenhagen 2024 Legends Sticker Capsule",
      "Shanghai 2024": "Shanghai 2024 Legends Sticker Capsule",
      "Austin 2025": "Austin 2025 Legends Sticker Capsule",
      "Budapest 2025": "Budapest 2025 Legends Sticker Capsule",
      // No Cologne 2026 entry, and this time the capsules are gone from the
      // catalogue entirely. Verified against Steam: none of the three (Sticker,
      // Team Sticker, Autograph) has a market listing at all — the listing page
      // returns the generic "Market Item" shell, where a control that does trade
      // returns the real item. No listing means no price history, and no
      // published artwork either: the upstream community index serves one shared
      // placeholder for every Cologne 2026 crate entry, which is why all three
      // showed the same wrong picture. Removed on the user's instruction; the
      // event's ~1,690 stickers stay and this card opens them.
      // Single capsules.
      "Community Capsule 1": "Community Sticker Capsule 1",
      "Community Series 2": "Sticker Capsule 2",
      "Community 2018": "Community Capsule 2018",
      "Community 2021": "2021 Community Sticker Capsule",
      "CS20 Capsule": "CS20 Sticker Capsule",
      "10 Year Birthday": "10 Year Birthday Sticker Capsule",
      "Poorly Drawn": "Poorly Drawn Capsule",
      "Chicken Capsule": "Chicken Capsule",
      "Half-Life: Alyx": "Half-Life: Alyx Sticker Capsule",
      "Halo Capsule": "Halo Capsule",
      "Warhammer 40K": "Warhammer 40,000 Sticker Capsule",
      "Pinups Capsule": "Pinups Capsule",
      "Enfu Capsule": "Enfu Sticker Capsule",
      "Sugarface Capsule": "Sugarface Capsule",
      "Team Roles Capsule": "Team Roles Capsule",
      "Bestiary Capsule": "Bestiary Capsule"
    };
    function stickerGroupCapsuleName(name) {
      return STICKER_GROUP_CAPSULES[String(name || "").trim()] || "";
    }
    function stickerGroupHref(entry, name) {
      const capsule = stickerGroupCapsuleName(name);
      if (!capsule) {
        return typeof buildCatalogItemsHref === "function" ? buildCatalogItemsHref("stickers", name) : "#";
      }
      const pretty = typeof data.itemPrettyHref === "function" ? data.itemPrettyHref({ market_hash_name: capsule, category: "cases" }) : "";
      if (pretty) return pretty;
      const params = new URLSearchParams({
        lookup_name: capsule,
        display_name: capsule,
        market_hash_name: capsule,
        image: entry.img || "",
        type: "Capsule",
        category: "cases",
        type_filter: "cases"
      });
      return `item_page.php?${params.toString()}`;
    }
    function formatCapsuleDate(isoDate) {
      const date = /* @__PURE__ */ new Date(`${isoDate}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    }
    function withStickerImageVersion(src) {
      if (!src) return "";
      const joiner = src.includes("?") ? "&" : "?";
      return `${src}${joiner}v=${STICKER_IMAGE_VERSION}`;
    }
    const WEAPON_DESCRIPTION_KEYS = {
      pistols: "desc_pistols",
      smgs: "desc_smgs",
      shotguns: "desc_shotguns",
      lmgs: "desc_lmgs",
      heavy: "desc_heavy",
      rifles: "desc_rifles",
      knives: "desc_knives",
      gloves: "desc_gloves",
      rare: "desc_rare"
    };
    const OTHER_SECTION_PAGES = {
      "music.html": {
        section: "music",
        kickerKey: "cat_otherItems",
        titleKey: "cat_title_music",
        descKey: "cat_desc_music",
        matchTitle: "Music Kits"
      },
      "agents.html": {
        section: "agents",
        kickerKey: "cat_otherItems",
        titleKey: "cat_title_agents",
        descKey: "cat_desc_agents",
        matchTitle: "Agents"
      },
      "charms.html": {
        section: "charms",
        kickerKey: "cat_otherItems",
        titleKey: "cat_title_charms",
        descKey: "cat_desc_charms",
        matchTitle: "Charms"
      },
      "patches.html": {
        section: "patches",
        kickerKey: "cat_otherItems",
        titleKey: "cat_title_patches",
        descKey: "cat_desc_patches",
        matchTitle: "Patches"
      },
      "pins.html": {
        section: "pins",
        kickerKey: "cat_otherItems",
        titleKey: "cat_title_pins",
        descKey: "cat_desc_pins",
        matchTitle: "Pins"
      },
      "graffiti.html": {
        section: "graffiti",
        kickerKey: "cat_otherItems",
        titleKey: "cat_title_graffiti",
        descKey: "cat_desc_graffiti",
        matchTitle: "Graffiti"
      }
    };
    const WEAPON_PAGES = {
      "pistols.html": "pistols",
      "smgs.html": "smgs",
      "shotguns.html": "shotguns",
      "lmgs.html": "lmgs",
      "heavy.html": "heavy",
      "rifles.html": "rifles",
      // rare.html is the combined knives-and-gloves hub; the two dedicated pages
      // each show only their own half.
      "rare.html": "rare",
      "knives.html": "knives",
      "gloves.html": "gloves"
    };
    const NAME_SORT_OPTION_KEYS = [
      { value: "name-asc", labelKey: "sort_azAsc" },
      { value: "name-desc", labelKey: "sort_azDesc" }
    ];
    const STICKER_SORT_OPTION_KEYS = [
      { value: "year-asc", labelKey: "sort_oldest" },
      { value: "year-desc", labelKey: "sort_newest" },
      ...NAME_SORT_OPTION_KEYS
    ];
    function resolveOtherGroups(matchTitle) {
      const section = (Array.isArray(data.navOtherSections) ? data.navOtherSections : []).find((entry) => entry.title === matchTitle);
      return section ? section.items : [];
    }
    function buildWeaponImage(category, weaponName) {
      const folder = typeof resolveWeaponAssetFolder === "function" ? resolveWeaponAssetFolder(weaponName, category.folder) : category.folder;
      if (typeof buildDefaultWeaponImage === "function") {
        return buildDefaultWeaponImage(weaponName, folder);
      }
      const fileName = String(weaponName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      return `assets/weapons/${folder}/${fileName}.png`;
    }
    function sortGroups(groups, sortValue, section) {
      const sorted = [...groups];
      if (section === "stickers") {
        const capsuleTime = (entry) => Date.parse(entry.date || `${entry.year || 0}-01-01`);
        if (sortValue === "year-desc") {
          sorted.sort((left, right) => capsuleTime(right) - capsuleTime(left));
        } else if (sortValue === "year-asc") {
          sorted.sort((left, right) => capsuleTime(left) - capsuleTime(right));
        } else if (sortValue === "name-desc") {
          sorted.sort((left, right) => normalizeGroupLabel(right).localeCompare(normalizeGroupLabel(left)));
        } else {
          sorted.sort((left, right) => normalizeGroupLabel(left).localeCompare(normalizeGroupLabel(right)));
        }
        return sorted;
      }
      if (DATED_OTHER_SECTIONS.has(section) && (sortValue === "year-desc" || sortValue === "year-asc")) {
        const direction = sortValue === "year-desc" ? -1 : 1;
        sorted.sort((left, right) => {
          const leftTime = left.date ? Date.parse(left.date) : NaN;
          const rightTime = right.date ? Date.parse(right.date) : NaN;
          const leftKnown = !Number.isNaN(leftTime);
          const rightKnown = !Number.isNaN(rightTime);
          if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
          if (!leftKnown && !rightKnown) return normalizeGroupLabel(left).localeCompare(normalizeGroupLabel(right));
          return leftTime !== rightTime ? (leftTime - rightTime) * direction : normalizeGroupLabel(left).localeCompare(normalizeGroupLabel(right));
        });
        return sorted;
      }
      if (sortValue === "name-desc") {
        sorted.sort((left, right) => normalizeGroupLabel(right).localeCompare(normalizeGroupLabel(left)));
      } else {
        sorted.sort((left, right) => normalizeGroupLabel(left).localeCompare(normalizeGroupLabel(right)));
      }
      return sorted;
    }
    function CategoryLandingPage({ config, groups, section, weaponClass }) {
      const { t } = useI18n();
      const defaultSort = section === "stickers" || DATED_OTHER_SECTIONS.has(section) ? "year-desc" : "name-asc";
      const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
      const [sortValue, setSortValue] = useState(defaultSort);
      const subtypeChips = useMemo(() => {
        const classes = [];
        groups.forEach((entry) => {
          const cls = String(entry.weaponClass || "");
          if (cls && !classes.includes(cls)) classes.push(cls);
        });
        if (classes.length < 2) return [];
        const labelKeys = { shotguns: "nav_shotguns", lmgs: "nav_lmgs", knives: "cat_knife", gloves: "cat_gloves" };
        return classes.map((cls) => ({
          value: cls,
          label: t(labelKeys[cls] || cls),
          count: groups.filter((entry) => String(entry.weaponClass || "") === cls).length
        }));
      }, [groups, t]);
      const [subtype, setSubtype] = useState("");
      const query = search.trim().toLowerCase();
      const filtered = groups.filter((entry) => normalizeGroupLabel(entry).toLowerCase().includes(query) && (!subtype || String(entry.weaponClass || "") === subtype));
      const displayed = useMemo(
        () => sortGroups(filtered, sortValue, section),
        [filtered, sortValue, section]
      );
      const PAGE_SLICE = 42;
      const [visibleCount, setVisibleCount] = useState(PAGE_SLICE);
      useEffect(() => {
        setVisibleCount(PAGE_SLICE);
      }, [query, subtype, sortValue, section]);
      const sentinelRef = useRef(null);
      useEffect(() => {
        const el = sentinelRef.current;
        if (!el || visibleCount >= displayed.length || typeof IntersectionObserver !== "function") return void 0;
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setVisibleCount((count) => Math.min(displayed.length, count + PAGE_SLICE));
          }
        }, { rootMargin: "1200px 0px" });
        observer.observe(el);
        return () => observer.disconnect();
      }, [visibleCount, displayed.length]);
      const visible = displayed.length > visibleCount ? displayed.slice(0, visibleCount) : displayed;
      const sortOptionKeys = section === "stickers" || DATED_OTHER_SECTIONS.has(section) ? STICKER_SORT_OPTION_KEYS : NAME_SORT_OPTION_KEYS;
      const sortOptions = sortOptionKeys.map((opt) => ({ value: opt.value, label: t(opt.labelKey) }));
      const kicker = t(config.kickerKey || "cat_itemDatabase");
      const title = config.title || t(config.titleKey);
      const [catalogCounts, setCatalogCounts] = useState(null);
      useEffect(() => {
        let alive = true;
        loadCatalogCounts().then((counts) => {
          if (alive && counts) setCatalogCounts(counts);
        });
        return () => {
          alive = false;
        };
      }, []);
      const totalLabel = useMemo(() => {
        if (!catalogCounts) return "";
        if (section === "weapons") {
          const weapons = catalogCounts.weapons || {};
          const total2 = groups.reduce((sum, entry) => sum + (Number(weapons[normalizeGroupLabel(entry)]) || 0), 0);
          return total2 > 0 ? t("cat_countSkins", { count: formatCount(total2) }) : "";
        }
        const sections = catalogCounts.sections || {};
        if (section === "stickers") {
          const total2 = Number(sections.stickers) || 0;
          return total2 > 0 ? t("cat_countStickers", { count: formatCount(total2) }) : "";
        }
        const total = Number(sections[section]) || 0;
        return total > 0 ? t("cat_countItems", { count: formatCount(total) }) : "";
      }, [catalogCounts, section, groups, t]);
      const description = config.description || t(config.descKey, { label: title.toLowerCase() });
      const cardSubtitleFallback = config.cardSubtitleKey ? t(config.cardSubtitleKey) : t("cat_browseListings");
      const stickersLabel = t("nav_stickers");
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: "collections-shell" }, /* @__PURE__ */ React.createElement("header", { className: "collections-head collections-head-animated collections-head--toolbar" }, /* @__PURE__ */ React.createElement("div", { className: classNames("collections-head-title", section === "weapons" && "has-data-line") }, /* @__PURE__ */ React.createElement("h1", { className: "collections-head-sr-title" }, title), section === "stickers" ? null : section === "weapons" ? /* @__PURE__ */ React.createElement(
        CategoryDataLine,
        {
          groups,
          counts: catalogCounts,
          t,
          hrefFor: (entry, name) => typeof buildCatalogItemsHref === "function" ? buildCatalogItemsHref(section, name, {
            weapon_class: entry.weaponClass || weaponClass,
            weapon: name,
            folder: entry.folder || entry.weaponClass || weaponClass
          }) : "#"
        }
      ) : null)), /* @__PURE__ */ React.createElement("div", { className: "collections-controls" }, /* @__PURE__ */ React.createElement("div", { className: "collections-search-wrap" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" }), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          placeholder: t("cat_searchPlaceholder", { title: title.toLowerCase() }),
          value: search,
          onChange: (event) => setSearch(event.target.value)
        }
      )), subtypeChips.length ? /* @__PURE__ */ React.createElement("div", { className: "collections-filter-chips", role: "group", "aria-label": title }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "collections-filter-chip" + (!subtype ? " is-active" : ""),
          onClick: () => setSubtype("")
        },
        t("cat_all"),
        /* @__PURE__ */ React.createElement("span", { className: "chip-count" }, groups.length)
      ), subtypeChips.map((chip) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: chip.value,
          type: "button",
          className: "collections-filter-chip" + (subtype === chip.value ? " is-active" : ""),
          onClick: () => setSubtype(subtype === chip.value ? "" : chip.value)
        },
        chip.label,
        /* @__PURE__ */ React.createElement("span", { className: "chip-count" }, chip.count)
      ))) : null, /* @__PURE__ */ React.createElement("span", { className: "collections-results-count" }, t("cat_resultsCount", { count: displayed.length })), /* @__PURE__ */ React.createElement(
        SortChipPicker,
        {
          value: sortValue,
          options: sortOptions,
          onChange: setSortValue,
          ariaLabel: t("cat_sortAriaLabel", { title })
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "collections-grid collections-grid-animated", key: `grid-${query || "all"}-${subtype || "all"}` }, visible.map((entry, index) => {
        const name = normalizeGroupLabel(entry);
        const isCapsuleCard = section === "stickers" && Boolean(stickerGroupCapsuleName(name));
        const href = section === "stickers" ? stickerGroupHref(entry, name) : typeof buildCatalogItemsHref === "function" ? section === "weapons" ? buildCatalogItemsHref(section, name, {
          weapon_class: entry.weaponClass || weaponClass,
          weapon: name,
          folder: entry.folder || entry.weaponClass || weaponClass
        }) : buildCatalogItemsHref(section, name) : "#";
        const imageRaw = entry.img || entry.image || "";
        const image = section === "stickers" ? withStickerImageVersion(imageRaw) : imageRaw;
        const accent = section === "stickers" ? "#34d399" : entry.accent || "#60a5fa";
        const labelLeft = section === "stickers" ? isCapsuleCard ? t("cat_stickerCapsule") : stickersLabel : title;
        const subtitle = entry.subtitleKey ? t(entry.subtitleKey, entry.subtitleVars) : entry.subtitle || cardSubtitleFallback;
        return /* @__PURE__ */ React.createElement(
          ShowcaseCard,
          {
            key: `${section}-${name}`,
            href,
            image,
            imageAlt: name,
            accent,
            labelLeft,
            title: name,
            subtitle,
            animated: true,
            staggerIndex: index % PAGE_SLICE,
            showAccentFoot: false,
            footer: /* @__PURE__ */ React.createElement("span", { className: "card-intro" }, /* @__PURE__ */ React.createElement("span", { className: "card-intro-dot" }), isCapsuleCard ? t("common_openCapsule") : t("common_viewAllItems"))
          }
        );
      })), visibleCount < displayed.length ? /* @__PURE__ */ React.createElement("div", { ref: sentinelRef, className: "collections-load-sentinel", "aria-hidden": "true", style: { height: 1 } }) : null, !displayed.length ? /* @__PURE__ */ React.createElement("p", { className: "no-results" }, t("cat_noEntriesFound")) : null));
    }
    function classNames(...parts) {
      return parts.filter(Boolean).join(" ");
    }
    function normalizeGroupLabel(entry) {
      return String(entry?.name || entry?.label || "").trim();
    }
    const WEAPON_TITLE_KEYS = {
      pistols: "nav_pistols",
      smgs: "nav_smgs",
      shotguns: "nav_shotguns",
      lmgs: "nav_lmgs",
      rifles: "nav_rifles",
      knives: "cat_knife",
      gloves: "cat_gloves"
    };
    function resolvePageConfig() {
      if (currentPage === "stickers.html") {
        return {
          config: {
            kickerKey: "cat_itemDatabase",
            titleKey: "cat_title_stickers",
            descKey: "cat_desc_stickers",
            cardSubtitleKey: "cat_stickerCapsule"
          },
          section: "stickers",
          groups: STICKER_GROUPS.map((entry) => ({
            ...entry,
            accent: "#34d399",
            subtitleKey: entry.date ? void 0 : entry.year ? "cat_yearCapsule" : "cat_stickerCapsule",
            subtitleVars: entry.date || !entry.year ? void 0 : { year: entry.year },
            subtitle: entry.date ? formatCapsuleDate(entry.date) : void 0
          }))
        };
      }
      const otherConfig = OTHER_SECTION_PAGES[currentPage];
      if (otherConfig) {
        const isDated = DATED_OTHER_SECTIONS.has(otherConfig.section);
        return {
          config: otherConfig,
          section: otherConfig.section,
          groups: resolveOtherGroups(otherConfig.matchTitle).map((entry) => {
            const releaseDate = isDated && typeof resolveCollectionReleaseDate === "function" ? resolveCollectionReleaseDate(entry.name) : "";
            return {
              ...entry,
              date: releaseDate || void 0,
              accent: "#34d399",
              subtitleKey: releaseDate ? void 0 : otherConfig.titleKey,
              subtitle: releaseDate && typeof formatKnownCollectionDate === "function" ? formatKnownCollectionDate(releaseDate) : void 0
            };
          })
        };
      }
      const HEAVY_LMG_WEAPONS = /* @__PURE__ */ new Set(["M249", "Negev"]);
      const weaponClass = WEAPON_PAGES[currentPage];
      if (weaponClass === "heavy") {
        const heavy = (Array.isArray(data.weaponCategories) ? data.weaponCategories : []).find((entry) => entry.key === "heavy");
        if (!heavy) return null;
        const groups = (heavy.items || []).map((name) => {
          const itemClass = HEAVY_LMG_WEAPONS.has(name) ? "lmgs" : "shotguns";
          const folder = typeof resolveWeaponAssetFolder === "function" ? resolveWeaponAssetFolder(name, itemClass) : itemClass;
          return {
            name,
            weaponClass: itemClass,
            img: buildWeaponImage({ ...heavy, folder: itemClass }, name),
            folder,
            accent: "#34d399",
            subtitleKey: itemClass === "lmgs" ? "cat_lmg" : "cat_shotgun"
          };
        });
        return {
          config: {
            kickerKey: "cat_itemDatabase",
            titleKey: "nav_heavy",
            descKey: WEAPON_DESCRIPTION_KEYS.heavy,
            cardSubtitleKey: "cat_weaponSkins"
          },
          section: "weapons",
          weaponClass: "heavy",
          groups
        };
      }
      if (weaponClass === "rare") {
        const categories = Array.isArray(data.weaponCategories) ? data.weaponCategories : [];
        const rare = categories.find((entry) => entry.key === "rare");
        const knives = rare ? { ...rare || {}, folder: "knives", items: rare.knifeItems || (rare.items || []).filter((name) => !/\bgloves?\b|hand wraps/i.test(name)) } : categories.find((entry) => entry.key === "knives");
        const gloves = rare ? { ...rare || {}, folder: "gloves", items: rare.gloveItems || (rare.items || []).filter((name) => /\bgloves?\b|hand wraps/i.test(name)) } : categories.find((entry) => entry.key === "gloves");
        if (!knives && !gloves) return null;
        const mapRareItems = (category, itemClass) => (category?.items || []).map((name) => {
          const folder = typeof resolveWeaponAssetFolder === "function" ? resolveWeaponAssetFolder(name, itemClass) : itemClass;
          return {
            name,
            weaponClass: itemClass,
            img: buildWeaponImage({ ...category || {}, folder: itemClass }, name),
            folder,
            accent: "#34d399",
            subtitleKey: itemClass === "gloves" ? "cat_gloves" : "cat_knife"
          };
        });
        return {
          config: {
            kickerKey: "cat_itemDatabase",
            titleKey: "nav_rare",
            descKey: WEAPON_DESCRIPTION_KEYS.rare,
            cardSubtitleKey: "cat_rareItems"
          },
          section: "weapons",
          weaponClass: "rare",
          groups: [...mapRareItems(knives, "knives"), ...mapRareItems(gloves, "gloves")]
        };
      }
      if (weaponClass === "knives" || weaponClass === "gloves") {
        const categories = Array.isArray(data.weaponCategories) ? data.weaponCategories : [];
        const own = categories.find((entry) => entry.key === weaponClass);
        const rare = categories.find((entry) => entry.key === "rare");
        const isGlove = (name) => /\bgloves?\b|hand wraps/i.test(name);
        const names = own ? own.items || [] : weaponClass === "gloves" ? rare?.gloveItems || (rare?.items || []).filter(isGlove) : rare?.knifeItems || (rare?.items || []).filter((name) => !isGlove(name));
        if (!names || !names.length) return null;
        const source = own || rare || {};
        return {
          config: {
            kickerKey: "cat_itemDatabase",
            titleKey: WEAPON_TITLE_KEYS[weaponClass],
            descKey: WEAPON_DESCRIPTION_KEYS[weaponClass],
            cardSubtitleKey: "cat_rareItems"
          },
          section: "weapons",
          weaponClass,
          groups: names.map((name) => ({
            name,
            weaponClass,
            img: buildWeaponImage({ ...source, folder: weaponClass }, name),
            folder: typeof resolveWeaponAssetFolder === "function" ? resolveWeaponAssetFolder(name, weaponClass) : weaponClass,
            accent: "#34d399",
            // The card's top label is the page title, which on these two pages is
            // already "Gloves" / "Knife" — so the subtitle says the tier instead
            // of repeating it, the way Pistols reads "Pistols / … / Weapon Skins".
            subtitleKey: "cat_rareItems"
          }))
        };
      }
      if (weaponClass) {
        const category = (Array.isArray(data.weaponCategories) ? data.weaponCategories : []).find((entry) => entry.key === weaponClass);
        if (!category) return null;
        const cardSubtitleKey = weaponClass === "knives" ? "cat_knife" : weaponClass === "gloves" ? "cat_gloves" : "cat_weaponSkins";
        return {
          config: {
            kickerKey: "cat_itemDatabase",
            titleKey: WEAPON_TITLE_KEYS[weaponClass] || null,
            title: WEAPON_TITLE_KEYS[weaponClass] ? null : category.label,
            descKey: WEAPON_DESCRIPTION_KEYS[weaponClass] || "cat_genericDesc",
            cardSubtitleKey: weaponClass === "knives" || weaponClass === "gloves" ? "cat_rareItems" : "cat_weaponFamily"
          },
          section: "weapons",
          weaponClass,
          groups: category.items.map((name) => ({
            name,
            weaponClass,
            img: buildWeaponImage(category, name),
            folder: typeof resolveWeaponAssetFolder === "function" ? resolveWeaponAssetFolder(name, category.folder) : category.folder,
            accent: "#34d399",
            subtitleKey: cardSubtitleKey
          }))
        };
      }
      return null;
    }
    const page = resolvePageConfig();
    if (!page) {
      const fallbackT = window.I18N ? window.I18N.t : (key) => key;
      mountPage(
        /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: "collections-shell" }, /* @__PURE__ */ React.createElement("header", { className: "collections-head" }, /* @__PURE__ */ React.createElement("h1", null, fallbackT("cat_notFound")), /* @__PURE__ */ React.createElement("p", null, fallbackT("cat_notConfigured")))))
      );
      return;
    }
    mountPage(
      /* @__PURE__ */ React.createElement(
        CategoryLandingPage,
        {
          config: page.config,
          groups: page.groups,
          section: page.section,
          weaponClass: page.weaponClass || ""
        }
      )
    );
  })();
})();
