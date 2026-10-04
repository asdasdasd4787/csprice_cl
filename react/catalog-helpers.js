(() => {
  // Served gzipped + cacheable by catalog_json.php (the raw file is 28 MB).
  const CATALOG_URL = "catalog_json.php?v=20260917-gz-1";

  const SECTION_CATEGORY_MAP = {
    stickers: ["stickers"],
    music: ["music"],
    agents: ["agents"],
    charms: ["charms", "slabs"],
    patches: ["patches"],
    pins: ["collectibles"],
    graffiti: ["graffiti"],
    weapons: ["skins", "knives", "gloves"],
  };

  const STICKER_SLABS_GROUP = "Sticker Slabs";
  const STICKER_SLABS_ROSTER = "__ALL_SLABS__";

  const AGENT_GROUP_ALIASES = {
    "All Agents": null,
    "Operation Riptide Agents": "Operation Riptide Agents",
    "Broken Fang Agents": "Broken Fang Agents",
    "Shattered Web Agents": "Shattered Web Agents",
  };

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isOperationStarEntry(entry) {
    const name = String(entry?.market_hash_name || entry?.display_name || "").trim();
    if (/\d+\s+stars?\s+for\s+operation/i.test(name)) {
      return true;
    }
    return normalize(entry?.type_note) === "operation star";
  }

  function isStickerSlabName(name) {
    return String(name || "").trim().startsWith("Sticker Slab |");
  }

  function isRegularStickerName(name) {
    const value = String(name || "").trim();
    return value.startsWith("Sticker |") && !isStickerSlabName(value);
  }

  function isStickerSlabEntry(entry) {
    return isStickerSlabName(entry?.market_hash_name || "");
  }

  function isStickerSlabGroup(groupName, roster) {
    if (roster === STICKER_SLABS_ROSTER) {
      return true;
    }
    const group = normalize(groupName);
    return group === "sticker slabs" || group === "sticker slab" || group === "slabs";
  }

  function toCompanionStickerName(name) {
    const value = String(name || "").trim();
    if (isStickerSlabName(value)) {
      return value.replace(/^Sticker Slab\s+\|\s+/i, "Sticker | ");
    }
    if (isRegularStickerName(value)) {
      return value.replace(/^Sticker\s+\|\s+/i, "Sticker Slab | ");
    }
    return "";
  }

  function isCaseKeyEntry(entry) {
    return /\skey$/i.test(String(entry?.market_hash_name || "").trim());
  }

  function isNonMarketableTrophyEntry(entry) {
    const name = String(entry?.market_hash_name || entry?.display_name || "");
    return /pick'em trophy|fantasy trophy|premier season (one|two|three|four) medal|\d{4} service medal|global offensive badge|loyalty badge/i.test(name);
  }

  const SOUVENIR_MAP_NAMES = [
    "Ancient", "Anubis", "Dust II", "Inferno", "Mirage", "Nuke", "Overpass", "Train", "Vertigo",
    "Cobblestone", "Cache", "Office", "Italy", "Aztec", "Canals", "Biome", "Black Gold", "Season",
    "Sugarcane", "Lake", "Safehouse", "Bazaar", "Shortdust", "Engage", "Basalt", "Insert", "Thrill",
    "Thera", "Palacio", "Memento", "Assembly", "Agency", "Ali", "Alpine", "Abbey", "Apollo",
    "Blacksite", "Breach", "Climb", "Edin", "Ember", "Farm", "Gulag", "Jungle", "Marquis", "Mocha",
    "Museum", "Ravine", "Rialto", "Rooster", "Sanctum", "Scar", "Shoots", "Stadium", "Studio", "Subzero", "Zoo",
  ];
  const SOUVENIR_MAP_PACKAGE_PATTERN = new RegExp(
    `\\b(${SOUVENIR_MAP_NAMES.map((map) => map.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s+Souvenir Package$`,
    "i"
  );

  function isSouvenirTokenEntry(entry) {
    return /\bSouvenir Token$/i.test(String(entry?.market_hash_name || entry?.display_name || "").trim());
  }

  function isGenericSouvenirPackageEntry(entry) {
    const name = String(entry?.market_hash_name || entry?.display_name || "").trim();
    if (!/\sSouvenir Package$/i.test(name)) {
      return false;
    }
    if (/\bHighlight\s+Souvenir Package$/i.test(name)) {
      return false;
    }
    return !SOUVENIR_MAP_PACKAGE_PATTERN.test(name);
  }

  function isCatalogTokenEntry(entry) {
    return isSouvenirTokenEntry(entry) || isGenericSouvenirPackageEntry(entry);
  }

  function isMarketableCatalogEntry(entry) {
    const listings = Number(entry?.seed_sell_listings);
    const price = Number(entry?.seed_sell_price);
    return listings > 0 || price > 0;
  }

  function normalizeCatalogEntry(entry) {
    if (!entry || typeof entry !== "object") {
      return entry;
    }

    if (isStickerSlabEntry(entry)) {
      return {
        ...entry,
        category: "charms",
        category_label: "Charms",
        type_filter: "charms",
        scope_filter: "armory",
        sub_filter: "charms",
        type_note: "Sticker Slab",
      };
    }

    if (isCaseKeyEntry(entry)) {
      return {
        ...entry,
        category: "tools",
        category_label: "Tools",
        type_filter: "tools",
        scope_filter: "cases",
        sub_filter: "other",
        type_note: entry.type_note || "Case Key",
      };
    }

    return entry;
  }

  function prepareCatalogItems(items) {
    return (Array.isArray(items) ? items : [])
      .map(normalizeCatalogEntry)
      .filter((item) => !isOperationStarEntry(item) && !isNonMarketableTrophyEntry(item) && !isCatalogTokenEntry(item));
  }

  function stripWear(name) {
    return String(name || "").replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, "").trim();
  }

  const SOUVENIR_SKIN_LOOKUP_URL = "assets/data/souvenir-skin-lookup.json?v=20260713-souvenir-1";
  let souvenirSkinLookupPromise = null;
  let souvenirSkinLookupSet = null;

  function normalizeSouvenirBaseKey(baseName) {
    return String(baseName || "")
      .normalize("NFKC")
      .replace(/^Souvenir\s+/i, "")
      .replace(/^StatTrak\u2122\s+/i, "")
      .replace(/^★\s*/u, "")
      .replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, "")
      .trim()
      .toLowerCase();
  }

  function loadSouvenirSkinLookup() {
    if (souvenirSkinLookupSet) {
      return Promise.resolve(souvenirSkinLookupSet);
    }
    if (souvenirSkinLookupPromise) {
      return souvenirSkinLookupPromise;
    }
    souvenirSkinLookupPromise = fetch(SOUVENIR_SKIN_LOOKUP_URL)
      .then((response) => (response.ok ? response.json() : { bases: [] }))
      .then((data) => {
        souvenirSkinLookupSet = new Set(Array.isArray(data?.bases) ? data.bases : []);
        return souvenirSkinLookupSet;
      })
      .catch(() => {
        souvenirSkinLookupSet = new Set();
        return souvenirSkinLookupSet;
      });
    return souvenirSkinLookupPromise;
  }

  function itemSupportsSouvenirSkin(baseName, originName = "") {
    const origin = String(originName || "").trim();
    if (!origin) {
      return false;
    }
    if (/\b(case|capsule|terminal)\b/i.test(origin)) {
      return false;
    }
    const catalogHint = window.CS2ReactData?.catalogWearVariantHint?.(origin);
    if (catalogHint === "stattrak") {
      return false;
    }
    const catalog = window.CS2ReactData?.lookupCollectionCatalog?.(origin);
    const category = String(catalog?.category || "");
    // Armory collections are NOT excluded: their skins have real Souvenir
    // listings on Steam (e.g. Souvenir AWP | Crakow!). The lookup below — which
    // is generated from the Steam market — is the authority.
    if (/classic case|active prime drop/i.test(category)) {
      return false;
    }
    const isCollection = /\bcollection\b/i.test(origin)
      || /^limited edition item$/i.test(origin)
      || catalogHint === 'souvenir-eligible'
      || Boolean(catalog);
    if (!isCollection) {
      return false;
    }
    const key = normalizeSouvenirBaseKey(baseName);
    if (!key || /\bgloves?\b/i.test(key)) {
      return false;
    }
    // Collection skins are Souvenir by definition, so a confirmed collection
    // origin is enough. The generated lookup is only a fallback signal for when
    // no origin is known — requiring it here would leave every collection
    // released after the lookup was last generated without Souvenir prices.
    return true;
  }

  function buildSouvenirMarketHashName(baseName, wear) {
    const cleanBase = stripWear(String(baseName || "")
      .replace(/^Souvenir\s+/i, "")
      .replace(/^StatTrak\u2122\s+/i, "")
      .trim());
    const cleanWear = String(wear || "").trim();
    if (!cleanBase || !cleanWear) {
      return "";
    }
    return `Souvenir ${cleanBase} (${cleanWear})`;
  }

  function buildSteamUrl(marketHashName) {
    return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
  }

  // Pretty item URLs. Twin of scripts/item_url_slug.php — the two must agree,
  // because that script generates the static page each of these links opens.
  const ITEM_URL_SECTIONS = {
    skins: "skins",
    knives: "skins",
    gloves: "skins",
    stickers: "stickers",
    cases: "cases",
    charms: "charms",
    agents: "agents",
    patches: "patches",
    music: "music-kits",
    graffiti: "graffiti",
    collectibles: "collectibles",
    // Not "tools": that name is taken by the local Blender folder.
    tools: "misc",
  };

  function itemUrlSection(category) {
    return ITEM_URL_SECTIONS[String(category || "").toLowerCase()] || "items";
  }

  function itemUrlSlug(marketHashName) {
    let name = String(marketHashName || "").trim()
      .replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i, "");
    let prefix = "";
    if (/\bStatTrak\b/i.test(name)) prefix += "stattrak-";
    if (/^\s*Souvenir\b/i.test(name)) prefix += "souvenir-";
    if (name.indexOf("★") !== -1) prefix += "star-";

    let body = name
      .replace(/\bStatTrak™?\b/gi, "")
      .replace(/^\s*Souvenir\b/i, "")
      .replace(/[★™|]/g, " ")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");

    const slug = (prefix + body.replace(/^-+|-+$/g, "")).replace(/^-+|-+$/g, "").replace(/-+/g, "-");
    return slug || "item";
  }

  /** "/skins/awp-dragon-lore/" for an item, or "" when it cannot be resolved. */
  function itemPrettyHref(entry) {
    const marketHashName = String(entry?.market_hash_name || "").trim();
    if (!marketHashName) return "";
    const section = itemUrlSection(entry?.category);
    const slug = itemUrlSlug(marketHashName);
    if (!section || !slug) return "";
    const href = `${section}/${slug}/`;
    // Remembered so a hover on the link can fetch that page's data ahead of
    // the click (shared-components.jsx, item prefetch); the page itself only
    // knows the item by name, not by slug.
    try {
      const names = window.CS2ItemNames || (window.CS2ItemNames = new Map());
      if (!names.has(href)) names.set(href, stripWear(marketHashName));
    } catch (_error) {}
    return href;
  }

  function buildItemHref(entry) {
    const marketHashName = String(entry?.market_hash_name || "").trim();
    const displayName = String(entry?.display_name || stripWear(marketHashName)).trim();
    if (!marketHashName) return "";

    const pretty = itemPrettyHref(entry);
    if (pretty) return pretty;

    const params = new URLSearchParams({
      lookup_name: marketHashName,
      display_name: displayName,
      market_hash_name: marketHashName,
      image: String(entry.image || ""),
      market_url: buildSteamUrl(marketHashName),
      type: String(entry.type_note || ""),
      category: String(entry.category_label || entry.category || ""),
      type_filter: String(entry.type_filter || entry.category || ""),
      color: String(entry.name_color || "B0C3D9"),
    });

    const hasWearVariant = Boolean(entry.selected_wear)
      || /\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i.test(marketHashName);
    if (hasWearVariant) {
      params.set("selected_wear", "Factory New");
    }

    return `item_page.php?${params.toString()}`;
  }

  // Weapon classes with generated listing folders (scripts/build_catalog_urls.php).
  // The PHP twin is catalogUrlWeapons() in scripts/item_url_slug.php.
  const CATALOG_URL_CLASSES = new Set([
    "pistols", "smgs", "shotguns", "lmgs", "rifles", "knives", "gloves",
  ]);

  /** "MAC-10" -> "mac-10". Same rules as catalogGroupSlug() in PHP. */
  function catalogGroupSlug(name) {
    return String(name || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");
  }

  /** "smgs/mac-10/" for a weapon listing, "" when there is no generated page. */
  function catalogPrettyHref(section, group, extra = {}) {
    if (String(section || "") !== "weapons") return "";
    const weaponClass = String(extra?.weapon_class || "").toLowerCase();
    if (!CATALOG_URL_CLASSES.has(weaponClass)) return "";
    const slug = catalogGroupSlug(group);
    if (!slug) return "";
    return `${weaponClass}/${slug}/`;
  }

  function buildCatalogItemsHref(section, group, extra = {}) {
    const pretty = catalogPrettyHref(section, group, extra);
    if (pretty) return pretty;

    const params = new URLSearchParams({
      section: String(section || ""),
      group: String(group || ""),
    });
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        params.set(key, String(value));
      }
    });
    return `catalog-items.html?${params.toString()}`;
  }

  function isAllGroup(groupName) {
    return /^all\b/i.test(String(groupName || "").trim());
  }

  function matchesStickerGroup(item, groupName, stickerGroupMap) {
    if (isStickerSlabEntry(item)) {
      return false;
    }
    const roster = stickerGroupMap?.[groupName];
    if (Array.isArray(roster) && roster.length) {
      return roster.includes(String(item.market_hash_name || "").trim());
    }
    if (isAllGroup(groupName)) return true;
    const hay = normalize(item.market_hash_name || item.display_name);
    const group = normalize(groupName);
    return hay.includes(group);
  }

  function matchesLooseGroup(item, groupName) {
    if (isAllGroup(groupName)) return true;
    const hay = normalize(`${item.market_hash_name} ${item.display_name}`);
    const cleaned = normalize(groupName)
      .replace(/\b(all|agent|agents|patch|patches|collection|capsule|box|kit|kits|graffiti|pins?|charms?)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return true;
    return cleaned.split(" ").filter(Boolean).every((token) => hay.includes(token));
  }

  function matchesAgentGroup(item, groupName, agentGroupMap) {
    const collectionKey = AGENT_GROUP_ALIASES[groupName] || groupName;
    const roster = agentGroupMap?.[collectionKey];
    if (Array.isArray(roster) && roster.length) {
      return roster.includes(String(item.market_hash_name || "").trim());
    }
    if (isAllGroup(groupName)) return true;
    return matchesLooseGroup(item, groupName);
  }

  function matchesPinGroup(item, groupName, pinGroupMap) {
    const roster = pinGroupMap?.[groupName];
    if (Array.isArray(roster) && roster.length) {
      return roster.includes(String(item.market_hash_name || "").trim());
    }
    if (isAllGroup(groupName)) return true;
    return matchesLooseGroup(item, groupName);
  }

  function matchesPatchGroup(item, groupName, patchGroupMap) {
    const roster = patchGroupMap?.[groupName];
    if (Array.isArray(roster) && roster.length) {
      return roster.includes(String(item.market_hash_name || "").trim());
    }
    if (isAllGroup(groupName)) return true;
    return matchesLooseGroup(item, groupName);
  }

  function matchesCharmGroup(item, groupName, charmGroupMap) {
    const roster = charmGroupMap?.[groupName];
    if (isStickerSlabGroup(groupName, roster)) {
      return isStickerSlabEntry(item);
    }
    if (isStickerSlabEntry(item)) {
      return isAllGroup(groupName);
    }
    if (Array.isArray(roster) && roster.length) {
      return roster.includes(String(item.market_hash_name || "").trim());
    }
    if (isAllGroup(groupName)) return true;
    return matchesLooseGroup(item, groupName);
  }

  function matchesMusicGroup(item, groupName, musicGroupMap) {
    const roster = musicGroupMap?.[groupName];
    if (Array.isArray(roster) && roster.length) {
      return roster.includes(String(item.market_hash_name || "").trim());
    }
    if (isAllGroup(groupName)) return true;
    return matchesLooseGroup(item, groupName);
  }

  function extractGraffitiDesign(name) {
    const text = String(name || "").trim();
    const sealedWithColor = text.match(/^Sealed Graffiti \| (.+?) \([^)]+\)$/i);
    if (sealedWithColor) {
      return sealedWithColor[1].trim();
    }
    const sealedPlain = text.match(/^Sealed Graffiti \| (.+)$/i);
    if (sealedPlain) {
      return sealedPlain[1].trim();
    }
    const plainWithColor = text.match(/^Graffiti \| (.+?) \([^)]+\)$/i);
    if (plainWithColor) {
      return plainWithColor[1].trim();
    }
    const plain = text.match(/^Graffiti \| (.+)$/i);
    if (plain) {
      return plain[1].trim();
    }
    return "";
  }

  function dedupeGraffitiDesigns(items) {
    const map = new Map();

    items.forEach((item) => {
      const design = extractGraffitiDesign(item.market_hash_name || item.display_name);
      const key = design || String(item.market_hash_name || item.display_name || "").trim();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        return;
      }

      const existingListings = Number(existing.seed_sell_listings || 0);
      const nextListings = Number(item.seed_sell_listings || 0);
      if (nextListings > existingListings) {
        map.set(key, item);
      }
    });

    return Array.from(map.values());
  }

  function matchesGraffitiGroup(item, groupName, graffitiGroupMap) {
    const group = String(groupName || "").trim();
    if (!group || group === "Graffiti" || isAllGroup(group)) {
      return String(item.category || "") === "graffiti";
    }

    const roster = graffitiGroupMap?.[group];
    if (roster === "__ALL__") {
      return String(item.category || "") === "graffiti";
    }

    if (Array.isArray(roster) && roster.length) {
      const marketName = String(item.market_hash_name || "").trim();
      if (roster.includes(marketName)) {
        return true;
      }
      const design = extractGraffitiDesign(marketName);
      return Boolean(design && roster.includes(design));
    }

    if (isAllGroup(groupName)) {
      return String(item.category || "") === "graffiti";
    }

    return matchesLooseGroup(item, groupName);
  }

  function normalizeWeaponBase(name) {
    return stripWear(String(name || ""))
      .replace(/^★\s*/u, "")
      .replace(/^StatTrak™\s*/i, "")
      .replace(/^Souvenir\s*/i, "")
      .trim();
  }

  function matchesWeapon(item, weaponName) {
    const base = normalizeWeaponBase(item.market_hash_name || item.display_name || "");
    const weapon = String(weaponName || "").trim();
    // No weapon named means "every weapon", the way matchesWeaponClass above
    // already treats an empty class. This is what lets the navbar's Skins entry
    // open catalog-items.html?section=weapons as one list of every finish;
    // returning false here used to make that page come back empty.
    if (!weapon) return true;
    return base === weapon || base.startsWith(`${weapon} |`);
  }

  function dedupeWearVariants(items) {
    const wearOrder = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"];
    const map = new Map();

    items.forEach((item) => {
      const key = stripWear(item.market_hash_name || item.display_name || "");
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        return;
      }

      const existingWear = String(existing.selected_wear || "");
      const nextWear = String(item.selected_wear || "");
      const existingIndex = wearOrder.indexOf(existingWear);
      const nextIndex = wearOrder.indexOf(nextWear);
      if (nextIndex >= 0 && (existingIndex < 0 || nextIndex < existingIndex)) {
        map.set(key, item);
      }
    });

    return Array.from(map.values());
  }

  function filterCatalogItems(items, options) {
    const section = String(options?.section || "");
    const group = String(options?.group || "");
    const weapon = String(options?.weapon || "");
    const weaponClass = String(options?.weapon_class || "");
    const categories = SECTION_CATEGORY_MAP[section] || [];
    const agentGroupMap = options?.agentGroupMap || {};
    const pinGroupMap = options?.pinGroupMap || {};
    const patchGroupMap = options?.patchGroupMap || {};
    const charmGroupMap = options?.charmGroupMap || {};
    const graffitiGroupMap = options?.graffitiGroupMap || {};
    const stickerGroupMap = options?.stickerGroupMap || {};
    const musicGroupMap = options?.musicGroupMap || {};

    let filtered = items.filter((item) => categories.includes(String(item.category || "")));

    if (section === "stickers") {
      filtered = filtered.filter((item) => !isStickerSlabEntry(item) && matchesStickerGroup(item, group, stickerGroupMap));
    } else if (section === "agents") {
      filtered = filtered.filter((item) => matchesAgentGroup(item, group, agentGroupMap));
    } else if (section === "pins") {
      filtered = filtered.filter((item) => matchesPinGroup(item, group, pinGroupMap));
    } else if (section === "patches") {
      filtered = filtered.filter((item) => matchesPatchGroup(item, group, patchGroupMap));
    } else if (section === "charms") {
      filtered = filtered.filter((item) => matchesCharmGroup(item, group, charmGroupMap));
    } else if (section === "graffiti") {
      filtered = filtered.filter((item) => matchesGraffitiGroup(item, group, graffitiGroupMap));
      filtered = dedupeGraffitiDesigns(filtered);
    } else if (section === "music") {
      filtered = filtered.filter((item) => matchesMusicGroup(item, group, musicGroupMap));
    } else if (section === "weapons") {
      filtered = filtered.filter((item) => {
        if (!matchesWeaponClass(item, weaponClass)) {
          return false;
        }
        return matchesWeapon(item, weapon);
      });
      filtered = dedupeWearVariants(filtered);
    } else {
      filtered = filtered.filter((item) => matchesLooseGroup(item, group));
    }

    return filtered.sort((left, right) => {
      const leftName = String(left.display_name || left.market_hash_name || "");
      const rightName = String(right.display_name || right.market_hash_name || "");
      return leftName.localeCompare(rightName);
    });
  }

  let catalogCache = null;
  let catalogPromise = null;

  function loadCatalog() {
    if (catalogCache) {
      return Promise.resolve(catalogCache);
    }
    if (catalogPromise) {
      return catalogPromise;
    }

    catalogPromise = fetch(CATALOG_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Catalog request failed (${response.status})`);
        }
        return response.json();
      })
      .then((payload) => {
        const items = Array.isArray(payload?.items) ? payload.items : [];
        catalogCache = prepareCatalogItems(items);
        return catalogCache;
      })
      .catch((error) => {
        catalogPromise = null;
        throw error;
      });

    return catalogPromise;
  }

  function formatEuroPrice(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return "—";
    return `€${amount.toFixed(2)}`;
  }

  const PLACEHOLDER_IMAGES = new Set([
    "assets/markets/steam.png",
    "assets/markets/steam.webp",
  ]);

  function isXm1014ItemName(name) {
    return /xm[\s-]?1014/i.test(String(name || ""));
  }

  const XM1014_PREVIEW_VER = "20260912-xm-fullgun-1";
  const XM1014_LOCAL_PREVIEWS = {
    entombed: "assets/weapons/shotguns/Entombed.webp",
    tranquility: "assets/weapons/shotguns/Tranquility.webp",
    watchdog: "assets/weapons/shotguns/Watchdog.webp",
    mockingbird: "assets/weapons/shotguns/Mockingbird.webp",
    "heaven guard": "assets/weapons/shotguns/heaven-guard.webp",
    "heaven-guard": "assets/weapons/shotguns/heaven-guard.webp",
  };

  function xm1014SkinKey(name) {
    const stripped = String(name || "")
      .replace(/^(?:★\s*)?(?:StatTrak™|StatTrak|Souvenir)\s+/i, "")
      .replace(/\s+\((?:Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i, "")
      .trim();
    const skin = stripped.includes("|") ? stripped.split("|").slice(1).join("|").trim() : stripped;
    return skin.toLowerCase();
  }

  function withXm1014PreviewVersion(path) {
    const clean = String(path || "").trim();
    if (!clean) return "";
    return clean.includes("?") ? clean : `${clean}?v=${XM1014_PREVIEW_VER}`;
  }

  function resolveXm1014LocalPreview(name) {
    const raw = String(name || "").trim();
    if (!raw) return "";
    const key = xm1014SkinKey(raw);
    if (XM1014_LOCAL_PREVIEWS[key]) {
      return withXm1014PreviewVersion(XM1014_LOCAL_PREVIEWS[key]);
    }
    const lower = raw.toLowerCase();
    const looksXm = isXm1014ItemName(raw);
    for (const [skin, path] of Object.entries(XM1014_LOCAL_PREVIEWS)) {
      if (!looksXm && !lower.includes(skin)) continue;
      if (lower.includes(skin)) {
        return withXm1014PreviewVersion(path);
      }
    }
    return "";
  }

  function catalogImageSource(entry) {
    // Local XM webps were tight-cropped to hide shells and cut muzzle/stock
    // on catalog cards. Prefer official Steam / remote icons so the full gun fits.
    const steam = String(entry?.steam_image_url || "").trim();
    if (steam.startsWith("http")) {
      return steam;
    }

    const remote = String(entry?.image || "").trim();
    if (remote.startsWith("http")) {
      return remote;
    }

    const local = String(entry?.local_path || entry?.image || "").trim();
    const localClean = local.replace(/^\//, "").split("?")[0];
    const isXm = isXm1014ItemName(entry?.market_hash_name || entry?.display_name || "");
    if (
      local
      && !PLACEHOLDER_IMAGES.has(localClean)
      && !(isXm && /^assets\/weapons\/shotguns\//i.test(localClean))
    ) {
      return local;
    }

    return "";
  }

  function hasCatalogImage(entry) {
    return Boolean(catalogImageSource(entry));
  }

  function resolveCatalogImage(entry) {
    return catalogImageSource(entry) || "assets/markets/steam.png";
  }

  function slugifyAssetName(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  const WEAPON_ASSET_FOLDERS = {
    "mag-7": "shotguns",
    nova: "shotguns",
    "sawed-off": "shotguns",
    xm1014: "shotguns",
    m249: "lmgs",
    negev: "lmgs",
  };

  function resolveWeaponAssetFolder(weaponName, categoryFolder) {
    const slug = slugifyAssetName(weaponName);
    return WEAPON_ASSET_FOLDERS[slug] || String(categoryFolder || "rifles").trim() || "rifles";
  }

  function matchesWeaponClass(item, weaponClass) {
    if (!weaponClass) return true;
    const sub = String(item?.sub_filter || "");
    if (weaponClass === "shotguns") {
      return sub === "shotguns";
    }
    if (weaponClass === "lmgs") {
      return sub === "heavy";
    }
    if (weaponClass === "heavy") {
      return sub === "shotguns" || sub === "heavy";
    }
    if (weaponClass === "rare") {
      return sub === "knives" || sub === "gloves";
    }
    return sub === weaponClass;
  }

  function buildDefaultWeaponImage(weaponName, folder) {
    const safeFolder = resolveWeaponAssetFolder(weaponName, folder);
    return `assets/weapons/${safeFolder}/${slugifyAssetName(weaponName)}.png`;
  }

  function findWeaponCatalogImage(items, weaponName, weaponClass) {
    if (!Array.isArray(items) || !weaponName) {
      return "";
    }

    const matches = items.filter((item) => {
      if (!matchesWeaponClass(item, weaponClass)) {
        return false;
      }
      return matchesWeapon(item, weaponName);
    });

    if (!matches.length) {
      return "";
    }

    matches.sort((left, right) => Number(right.seed_sell_listings || 0) - Number(left.seed_sell_listings || 0));
    return resolveCatalogImage(matches[0]);
  }

  // Steam rarity colors, highest first. Same scale for every catalog section
  // (agents, charms, patches, pins, stickers, graffiti, music, weapons).
  const ITEM_RARITY_RANK_BY_COLOR = {
    E4AE39: 0, // Contraband / gold / ★
    EB4B4B: 1, // Covert / Extraordinary / Master
    D32CE6: 2, // Classified / Exotic / Superior
    "8847FF": 3, // Restricted / Remarkable / Exceptional
    "4B69FF": 4, // Mil-Spec / High Grade / Distinguished
    "5E98D9": 5, // Industrial Grade
    CFB97F: 6,
    FAFAFA: 6,
    DED6CC: 6, // Default / off-white
    B0C3D9: 7, // Consumer / Base Grade
  };

  // Fallback when name_color is missing. Longer tokens win (see sort below).
  const ITEM_RARITY_NOTE_RANKS = [
    ["contraband", 0],
    ["extraordinary", 1],
    ["covert", 1],
    ["master", 1],
    ["classified", 2],
    ["exotic", 2],
    ["superior", 2],
    ["restricted", 3],
    ["remarkable", 3],
    ["exceptional", 3],
    ["mil-spec", 4],
    ["mil spec", 4],
    ["high grade", 4],
    ["distinguished", 4],
    ["industrial", 5],
    ["consumer", 6],
    ["base grade", 7],
    ["default", 8],
  ].sort((left, right) => right[0].length - left[0].length);

  function itemRaritySortRank(item) {
    const color = String(item?.name_color || "").replace(/^#/, "").toUpperCase();
    if (Object.prototype.hasOwnProperty.call(ITEM_RARITY_RANK_BY_COLOR, color)) {
      return ITEM_RARITY_RANK_BY_COLOR[color];
    }

    const note = String(item?.type_note || "").trim().toLowerCase();
    for (const [token, rank] of ITEM_RARITY_NOTE_RANKS) {
      if (note.includes(token)) {
        return rank;
      }
    }

    return 99;
  }

  function stickerRaritySortRank(item) {
    return itemRaritySortRank(item);
  }

  Object.assign(window.CS2ReactData || (window.CS2ReactData = {}), {
    CATALOG_URL,
    AGENT_GROUP_ALIASES,
    buildCatalogItemsHref,
    catalogGroupSlug,
    catalogPrettyHref,
    buildDefaultWeaponImage,
    buildItemHref,
    itemPrettyHref,
    itemUrlSection,
    itemUrlSlug,
    catalogImageSource,
    isXm1014ItemName,
    resolveXm1014LocalPreview,
    dedupeGraffitiDesigns,
    dedupeWearVariants,
    filterCatalogItems,
    findWeaponCatalogImage,
    formatEuroPrice,
    hasCatalogImage,
    isAllGroup,
    isCatalogTokenEntry,
    isGenericSouvenirPackageEntry,
    isSouvenirTokenEntry,
    isMarketableCatalogEntry,
    isNonMarketableTrophyEntry,
    isOperationStarEntry,
    isRegularStickerName,
    isStickerSlabEntry,
    isStickerSlabGroup,
    isStickerSlabName,
    STICKER_SLABS_GROUP,
    STICKER_SLABS_ROSTER,
    toCompanionStickerName,
    loadCatalog,
    loadSouvenirSkinLookup,
    itemSupportsSouvenirSkin,
    buildSouvenirMarketHashName,
    normalizeCatalogEntry,
    prepareCatalogItems,
    matchesWeapon,
    matchesWeaponClass,
    itemRaritySortRank,
    resolveCatalogImage,
    resolveWeaponAssetFolder,
    stickerRaritySortRank,
    stripWear,
  });
})();
