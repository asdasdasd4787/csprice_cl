(() => {
  const COLLECTION_CATALOG = [
    { name: "The Achroma Collection", intro: "2026-01-21", category: "Weapon Skins" },
    { name: "The Ascent Collection", intro: "2025-03-31", category: "Weapon Skins" },
    { name: "The Boreal Collection", intro: "2025-03-31", category: "Weapon Skins" },
    { name: "The Genesis Collection", intro: "2025-09-17", category: "Weapon Skins" },
    { name: "The Harlequin Collection", intro: "2026-01-21", category: "Weapon Skins" },
    { name: "The Radiant Collection", intro: "2025-03-31", category: "Weapon Skins" },
    { name: "Limited Edition Item", intro: "2024-10-02", category: "Armory Exclusive" },
    { name: "The Graphic Design Collection", intro: "2024-10-02", category: "Armory Exclusive" },
    { name: "The Overpass 2024 Collection", intro: "2024-10-02", category: "Armory Exclusive" },
    { name: "The Sport & Field Collection", intro: "2024-10-02", category: "Armory Exclusive" },
    { name: "The Train 2025 Collection", intro: "2025-03-31", category: "Armory Exclusive" },
    { name: "The 2021 Dust 2 Collection", intro: "2021-09-22", category: "Operation Riptide" },
    { name: "The 2021 Mirage Collection", intro: "2021-09-22", category: "Operation Riptide" },
    { name: "The 2021 Train Collection", intro: "2021-09-22", category: "Operation Riptide" },
    { name: "The 2021 Vertigo Collection", intro: "2021-09-22", category: "Operation Riptide" },
    { name: "The Ancient Collection", intro: "2020-12-03", category: "Operation Broken Fang" },
    { name: "The Control Collection", intro: "2020-12-03", category: "Operation Broken Fang" },
    { name: "The Havoc Collection", intro: "2020-12-03", category: "Operation Broken Fang" },
    { name: "The Canals Collection", intro: "2019-11-18", category: "Operation Shattered Web" },
    { name: "The Norse Collection", intro: "2019-11-18", category: "Operation Shattered Web" },
    { name: "The St. Marc Collection", intro: "2019-11-18", category: "Operation Shattered Web" },
    { name: "The Cache Collection", intro: "2014-08-08", category: "Legacy Operation" },
    { name: "The Chop Shop Collection", intro: "2015-05-26", category: "Legacy Operation" },
    { name: "The Cobblestone Collection", intro: "2014-07-01", category: "Legacy Operation" },
    { name: "The Gods and Monsters Collection", intro: "2015-05-26", category: "Legacy Operation" },
    { name: "The Overpass Collection", intro: "2014-07-01", category: "Legacy Operation" },
    { name: "The Rising Sun Collection", intro: "2015-05-26", category: "Legacy Operation" },
    { name: "The Anubis Collection", intro: "2023-04-24", category: "Discontinued" },
    { name: "The Assault Collection", intro: "2013-08-14", category: "Discontinued" },
    { name: "The Aztec Collection", intro: "2013-08-14", category: "Discontinued" },
    { name: "The Baggage Collection", intro: "2014-07-01", category: "Discontinued" },
    { name: "The Bank Collection", intro: "2014-05-01", category: "Discontinued" },
    { name: "The Dust Collection", intro: "2013-08-14", category: "Discontinued" },
    { name: "The Inferno Collection", intro: "2013-08-14", category: "Discontinued" },
    { name: "The Italy Collection", intro: "2013-11-27", category: "Discontinued" },
    { name: "The Lake Collection", intro: "2013-11-27", category: "Discontinued" },
    { name: "The Militia Collection", intro: "2013-08-14", category: "Discontinued" },
    { name: "The Mirage Collection", intro: "2013-11-27", category: "Discontinued" },
    { name: "The Nuke Collection", intro: "2013-08-14", category: "Discontinued" },
    { name: "The Office Collection", intro: "2013-08-14", category: "Discontinued" },
    { name: "The Train Collection", intro: "2013-11-27", category: "Discontinued" },
    { name: "The Vertigo Collection", intro: "2013-08-14", category: "Discontinued" },
    { name: "The 2018 Inferno Collection", intro: "2018-09-01", category: "Discontinued" },
    { name: "The 2018 Nuke Collection", intro: "2018-09-01", category: "Discontinued" },
    { name: "The Alpha Collection", intro: "2013-09-19", category: "Discontinued" },
    { name: "The Blacksite Collection", intro: "2018-12-06", category: "Discontinued" },
    { name: "The Dust 2 Collection", intro: "2013-11-27", category: "Discontinued" },
    { name: "The Safehouse Collection", intro: "2013-11-27", category: "Discontinued" },
    { name: "The Fracture Collection", intro: "2020-08-07", category: "Classic Case" },
    { name: "Fracture Collection", intro: "2020-08-07", category: "Classic Case" },
    { name: "The Revolution Collection", intro: "2023-02-10", category: "Classic Case" },
    { name: "Revolution Collection", intro: "2023-02-10", category: "Classic Case" },
  ];

  // Operation groups share Ancient / Broken Fang orange (#f97316)
  const OPERATION_MEDIA_ACCENT = "#f97316";

  const COLLECTION_CATEGORY_COLORS = {
    "Weapon Skins": "#60a5fa",
    "Active Prime Drop": "#60a5fa", // legacy alias
    "Armory Exclusive": "#f472b6",
    "Operation Riptide": OPERATION_MEDIA_ACCENT,
    "Operation Broken Fang": OPERATION_MEDIA_ACCENT,
    "Operation Shattered Web": OPERATION_MEDIA_ACCENT,
    "Legacy Operation": OPERATION_MEDIA_ACCENT,
    Discontinued: "#f87171",
    "Classic Case": "#7dd3fc",
  };

  function normalizeCollectionName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^the\s+/, "")
      .replace(/\s+collection$/, "")
      .replace(/\s+/g, " ");
  }

  // Cases, capsules, and terminals are StatTrak drop sources — not souvenir collections.
  // Do not fuzzy-match "Sealed Genesis Terminal" onto "The Genesis Collection".
  function originLooksLikeDropContainer(name) {
    const raw = String(name || "").trim();
    if (!raw || /\bcollection\b/i.test(raw)) {
      return false;
    }
    return /\b(case|capsule|terminal|package|parcel|pack)\b/i.test(raw);
  }

  function lookupCollectionCatalog(name) {
    const raw = String(name || "").trim();
    if (!raw) return null;
    if (originLooksLikeDropContainer(raw)) {
      return null;
    }

    const variants = new Set([raw]);
    if (!/\bcollection\b/i.test(raw)) {
      variants.add(`The ${raw} Collection`);
      variants.add(`${raw} Collection`);
    }
    if (/^the\s+/i.test(raw) && !/\bcollection$/i.test(raw)) {
      variants.add(`${raw} Collection`);
    }

    for (const variant of variants) {
      const key = normalizeCollectionName(variant);
      const exact = COLLECTION_CATALOG.find((entry) => normalizeCollectionName(entry.name) === key);
      if (exact) return exact;
    }

    const key = normalizeCollectionName(raw);
    return COLLECTION_CATALOG.find((entry) => {
      const entryKey = normalizeCollectionName(entry.name);
      return key.includes(entryKey) || entryKey.includes(key);
    }) || null;
  }

  function resolveCollectionCatalogEntry(...names) {
    const seen = new Set();
    for (const name of names) {
      const clean = String(name || "").trim();
      if (!clean) continue;
      const dedupeKey = clean.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const hit = lookupCollectionCatalog(clean);
      if (hit) return hit;
    }
    return null;
  }

  // One-way item sources: some weapon-skin collections are tracked in the
  // cases catalog only as their StatTrak drop container (terminal/case).
  // Collection detail pages fetch skins from that container. This does not
  // make lookupCollectionCatalog("Sealed Genesis Terminal") return the collection.
  const COLLECTION_ITEM_SOURCES = {
    "The Genesis Collection": "Sealed Genesis Terminal",
  };

  function resolveCollectionItemSource(name) {
    const raw = String(name || "").trim();
    if (!raw) return "";

    const catalog = lookupCollectionCatalog(raw);
    const candidates = [];
    if (catalog && catalog.name) candidates.push(catalog.name);
    candidates.push(raw);

    for (const candidate of candidates) {
      const key = normalizeCollectionName(candidate);
      for (const [collectionName, source] of Object.entries(COLLECTION_ITEM_SOURCES)) {
        if (normalizeCollectionName(collectionName) === key) {
          return source;
        }
      }
    }

    return raw;
  }

  function catalogWearVariantHint(originName) {
    const origin = String(originName || "").trim();
    if (!origin) {
      return null;
    }
    if (originLooksLikeDropContainer(origin) || /\b(case|capsule|terminal)\b/i.test(origin)) {
      return "stattrak";
    }
    const catalog = lookupCollectionCatalog(origin);
    if (!catalog) {
      return null;
    }
    const category = String(catalog.category || "");
    // Collections never carry StatTrak — their special variant is Souvenir.
    // That holds for Armory collections (Overpass 2024 / Train 2025 / Sport &
    // Field) and for plain "Weapon Skins" collections alike: Steam lists
    // Souvenir AK-47 | Breakthrough but no StatTrak™ AK-47 | Breakthrough.
    // Only container drops (cases / capsules / terminals) yield StatTrak, and
    // those are caught by the container check above.
    if (/classic case|active prime drop/i.test(category) || /\bcase\b/i.test(category)) {
      return "stattrak";
    }
    return "souvenir-eligible";
  }

  Object.assign(window.CS2ReactData || (window.CS2ReactData = {}), {
    COLLECTION_CATALOG,
    COLLECTION_CATEGORY_COLORS,
    lookupCollectionCatalog,
    resolveCollectionCatalogEntry,
    resolveCollectionItemSource,
    originLooksLikeDropContainer,
    catalogWearVariantHint,
  });
})();
