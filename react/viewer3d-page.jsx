(() => {
  const { useEffect, useMemo, useRef, useState } = React;
  const { createPortal } = ReactDOM;
  const { Layout, mountPage, classNames } = window.CS2React;
  const viewer = window.CS2SkinViewer || {};

  const WEAR_OPTIONS = viewer.WEAR_OPTIONS || [
    "Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred",
  ];

  const WEAR_SHORT = {
    "Factory New": "FN",
    "Minimal Wear": "MW",
    "Field-Tested": "FT",
    "Well-Worn": "WW",
    "Battle-Scarred": "BS",
  };

  const WEAR_FLOAT = viewer.WEAR_FLOAT_DEFAULTS || {
    "Factory New": 0.03,
    "Minimal Wear": 0.11,
    "Field-Tested": 0.25,
    "Well-Worn": 0.41,
    "Battle-Scarred": 0.75,
  };

  const STICKER_SLOTS = 5;
  const STICKER_DRAG_TYPE = "application/x-cs2-sticker";
  const CHARM_DRAG_TYPE = "application/x-cs2-charm";
  const SLAB_DRAG_TYPE = "application/x-cs2-sticker-slab";
  const DEFAULT_STICKER_WEAR = 0;
  const DEFAULT_SKIN_NAME = "Glock-18 | Wasteland Rebel";
  const CRAFT_INSPECT_SEED = 42;
  const CRAFTER_SKIN_ALIASES = {
    "M4A4 | Royal Paladin": "M4A1-S | Party Animal",
  };
  let charmModelManifestPromise = null;
  let charmModelManifest = null;

  function normalizeCrafterSkinName(value) {
    return String(value || "")
      .trim()
      .replace(/^[\s★*]+/u, "")
      .replace(/^(souvenir|stattrak™|stattrak)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function splitCrafterSkinWear(value) {
    const trimmed = String(value || "").trim();
    const match = trimmed.match(/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/i);
    if (!match) {
      return { name: trimmed, wear: "" };
    }
    return { name: String(match[1] || "").trim(), wear: String(match[2] || "").trim() };
  }

  function resolveCrafterWearLabel(value) {
    const raw = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    if (!raw) return "";
    const map = {
      "factory new": "Factory New",
      fn: "Factory New",
      "minimal wear": "Minimal Wear",
      mw: "Minimal Wear",
      "field tested": "Field-Tested",
      "field-tested": "Field-Tested",
      ft: "Field-Tested",
      "well worn": "Well-Worn",
      "well-worn": "Well-Worn",
      ww: "Well-Worn",
      "battle scarred": "Battle-Scarred",
      "battle-scarred": "Battle-Scarred",
      bs: "Battle-Scarred",
    };
    if (map[raw]) return map[raw];
    return WEAR_OPTIONS.find((wear) => wear.toLowerCase() === raw) || "";
  }

  // A generated crafter page (/skin-crafter/ak-47-ice-coaled/field-tested/)
  // carries what to load in __CRAFTER_ROUTE__ and has no query string;
  // scripts/build_crafter_urls.php writes it. The query still wins when it is
  // present, so older links and ?charm= / ?sticker= keep working.
  function crafterRoute() {
    const route = window.__CRAFTER_ROUTE__;
    return route && typeof route === "object" ? route : null;
  }

  function parseCrafterLaunchQuery() {
    const params = new URLSearchParams(window.location.search);
    const route = crafterRoute();
    const rawSkin = String(
      params.get("skin") || params.get("hash") || params.get("name") || route?.skin || ""
    ).trim();
    const parsed = splitCrafterSkinWear(rawSkin);
    const wear = resolveCrafterWearLabel(params.get("wear") || parsed.wear || route?.wear || "");
    return {
      skinName: parsed.name,
      wear,
      charmName: String(params.get("charm") || "").trim(),
      stickerName: String(params.get("sticker") || "").trim(),
    };
  }

  /** "AK-47 | Ice Coaled" -> "ak-47-ice-coaled" (PHP twin: catalogGroupSlug). */
  function crafterSkinSlug(name) {
    return String(name || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");
  }

  /**
   * The address for a crafted skin: /skin-crafter/<skin>/<wear>/. Only skins
   * with a 3D model have a generated page, and every entry in the crafter's
   * library has one by definition, so this never points at a 404.
   */
  function crafterPrettyPath(skinName, wear) {
    const slug = crafterSkinSlug(skinName);
    if (!slug) return "";
    const wearSlug = crafterSkinSlug(wear);
    return `skin-crafter/${slug}/${wearSlug ? `${wearSlug}/` : ""}`;
  }

  function siteBasePathForCrafter() {
    try {
      const shared = window.CS2React;
      if (shared && typeof shared.siteBasePath === "function") return shared.siteBasePath();
      const baseEl = document.querySelector("base[href]");
      if (baseEl) return new URL(baseEl.getAttribute("href"), window.location.href).pathname;
    } catch (_error) {}
    return "/";
  }

  function findCraftCatalogEntry(rows, name) {
    const needle = String(name || "").trim().toLowerCase();
    if (!needle || !Array.isArray(rows) || !rows.length) return null;
    const exact = rows.find((row) => String(row.market_hash_name || "").trim().toLowerCase() === needle);
    if (exact) return exact;
    return rows.find((row) => {
      const rowName = String(row.market_hash_name || "").trim().toLowerCase();
      return rowName && (rowName.includes(needle) || needle.includes(rowName));
    }) || null;
  }

  function findCrafterLibrarySkin(libraryItems, preferredRaw) {
    const aliased = CRAFTER_SKIN_ALIASES[preferredRaw] || preferredRaw;
    const needle = normalizeCrafterSkinName(aliased);
    if (!needle || !Array.isArray(libraryItems) || !libraryItems.length) {
      return null;
    }
    const exact = libraryItems.find((entry) => (
      normalizeCrafterSkinName(entry.market_name) === needle
    ));
    if (exact) return exact;
    return libraryItems.find((entry) => {
      const name = normalizeCrafterSkinName(entry.market_name);
      return name.includes(needle) || needle.includes(name);
    }) || null;
  }

  function loadCharmModelManifest() {
    if (charmModelManifest) return Promise.resolve(charmModelManifest);
    if (charmModelManifestPromise) return charmModelManifestPromise;
    charmModelManifestPromise = fetch("assets/models/keychains/manifest.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        charmModelManifest = payload && typeof payload === "object" ? payload.items || {} : {};
        return charmModelManifest;
      })
      .catch(() => {
        charmModelManifest = {};
        return charmModelManifest;
      });
    return charmModelManifestPromise;
  }

  function enrichCharmWithModelUrl(entry, manifest = charmModelManifest) {
    if (!entry || typeof entry !== "object") return entry;
    if (String(entry.model_url || "").trim()) return entry;
    const name = String(entry.market_hash_name || entry.display_name || "").trim();
    if (!name || !manifest || typeof manifest !== "object") return entry;

    let mapped = manifest[name];
    if (!mapped && name.startsWith("Sticker Slab |")) {
      mapped = manifest["Sticker Slab"] || manifest.__sticker_slab__;
    }
    // Souvenir highlight moments: "Souvenir Charm | Austin 2025 Highlight | Ace Unleashed"
    if (!mapped) {
      if (/\bAustin 2025 Highlight\b/i.test(name)) {
        mapped = manifest["Charm | Austin 2025 Highlight"]
          || manifest["Souvenir Charm | Austin 2025 Highlight"];
      } else if (/\bBudapest 2025 Highlight\b/i.test(name)) {
        mapped = manifest["Charm | Budapest 2025 Highlight"]
          || manifest["Souvenir Charm | Budapest 2025 Highlight"];
      } else if (/\bCologne 2026 Highlight\b/i.test(name)) {
        mapped = manifest["Charm | Cologne 2026 Highlight"]
          || manifest["Souvenir Charm | Cologne 2026 Highlight"];
      }
    }
    if (!mapped) {
      const needle = name.toLowerCase()
        .replace(/^souvenir\s+charm\s*\|\s*/i, "")
        .replace(/^charm\s*\|\s*/i, "")
        .trim();
      const keys = Object.keys(manifest);
      mapped = keys
        .map((key) => {
          const row = manifest[key];
          const keyTail = String(key || "").toLowerCase()
            .replace(/^souvenir\s+charm\s*\|\s*/i, "")
            .replace(/^charm\s*\|\s*/i, "")
            .trim();
          const display = String(row?.display_name || "").toLowerCase().trim();
          const token = String(row?.token || "").toLowerCase().trim();
          let score = 0;
          if (keyTail === needle || display === needle) score = 100;
          else if (keyTail.includes(needle) || needle.includes(keyTail)) score = 80;
          else if (display && (display.includes(needle) || needle.includes(display))) score = 70;
          else if (token && (
            needle.replace(/\s+/g, "").includes(token.replace(/^kc_missinglink_/, "").replace(/_/g, ""))
            || token.replace(/^kc_/, "").replace(/_/g, "").includes(needle.replace(/\s+/g, "").replace(/highlight/g, ""))
          )) {
            score = 60;
          }
          return { row, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)[0]?.row || null;
    }

    const modelUrl = String(mapped?.model_url || "").trim();
    if (!modelUrl) return entry;
    const localIcon = String(mapped?.image || mapped?.icon || "").trim();
    const catalogIcon = String(entry.image || entry.icon || "").trim();
    const token = String(mapped?.token || entry.model_token || "").toLowerCase();
    const preferLocalIcon = Boolean(mapped?.preferLocalIcon)
      || (
        Boolean(mapped?.nativeHoldPin || mapped?.native_hold_pin)
        && token.startsWith("kc_db_")
      );
    const image = (preferLocalIcon && localIcon) || catalogIcon || localIcon;
      return {
        ...entry,
        model_url: modelUrl,
        model_token: mapped?.token || entry.model_token,
        ...(image ? { image } : {}),
        ...(mapped?.nativeHoldPin || mapped?.native_hold_pin || entry.nativeHoldPin
          ? { nativeHoldPin: true }
          : {}),
      };
  }

  function collectManifestLocalCharms(manifest) {
    if (!manifest || typeof manifest !== "object") return [];
    const extras = [];
    Object.entries(manifest).forEach(([name, row]) => {
      if (!row || typeof row !== "object") return;
      if (String(name).startsWith("__") || name === "Sticker Slab") return;
      const image = String(row.image || row.icon || "").trim();
      const modelUrl = String(row.model_url || "").trim();
      if (!image || !modelUrl) return;
        extras.push({
          market_hash_name: name,
          display_name: row.display_name || name,
          image,
          model_url: modelUrl,
          model_token: row.token || "",
          category: "charms",
          type_note: "Charm",
          def_index: null,
          sticker_id: null,
          seed_sell_price: null,
          ...(row.nativeHoldPin || row.native_hold_pin ? { nativeHoldPin: true } : {}),
        });
    });
    return extras;
  }

  function isCrafterBatchEntry(entry) {
    const url = String(entry?.model_url || "");
    return url.includes("assets/models/crafter/") && Boolean(entry?.market_name);
  }

  function resolveCraftViewerAssets(entry) {
    if (!entry) return null;
    const modelUrl = String(entry.model_url || "").trim();
    if (!entry.has_baked_model || !modelUrl) return null;

    return {
      skinModelUrl: modelUrl,
      texturePack: null,
      baseModelUrl: String(entry.base_model_url || viewer.resolveLocalModelUrl?.(entry.market_name) || "").trim(),
      forceRuntimeTextures: false,
    };
  }

  const STICKER_WEAR_PRESETS = [
    { label: "Fresh", value: 0 },
    { label: "Light", value: 0.25 },
    { label: "Worn", value: 0.5 },
    { label: "Heavy", value: 0.75 },
    { label: "Scraped", value: 1 },
  ];

  function normalizeStickerWear(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return DEFAULT_STICKER_WEAR;
    return Math.min(1, Math.max(0, parsed));
  }

  function craftInspectNameKey(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function isPaperStickerName(name) {
    const label = String(name || "").trim();
    return /^sticker\s*\|/i.test(label) && !/^sticker\s+slab\s*\|/i.test(label);
  }

  // Kit IDs only — never commodity type 1209 (standalone paper sticker item).
  // Weapon defindex / paint index live on the skin object and are never candidates.
  function isUsableStickerKitId(id) {
    const parsed = Number(id);
    return Number.isFinite(parsed) && parsed > 0 && parsed !== 1209;
  }

  function stickerKitIdFromEntry(sticker) {
    if (!sticker || typeof sticker !== "object") return 0;
    const direct = Number(sticker.sticker_id ?? sticker.stickerId ?? 0);
    if (isUsableStickerKitId(direct)) return direct;
    const name = sticker.market_hash_name || sticker.display_name || "";
    if (isPaperStickerName(name)) {
      const defIndex = Number(sticker.def_index ?? sticker.defIndex ?? 0);
      if (isUsableStickerKitId(defIndex)) return defIndex;
    }
    return 0;
  }

  function rememberStickerKitId(map, name, stickerId) {
    const key = craftInspectNameKey(name);
    if (!key || !stickerId || map[key]) return;
    map[key] = stickerId;
    if (!key.startsWith("sticker |") && !key.startsWith("sticker slab")) {
      map[`sticker | ${key}`] = stickerId;
    }
  }

  function buildStickerKitIdMap(rows) {
    const map = Object.create(null);
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const id = stickerKitIdFromEntry(row);
      if (!id) return;
      rememberStickerKitId(map, row.market_hash_name, id);
      rememberStickerKitId(map, row.display_name, id);
    });
    return map;
  }

  function lookupStickerKitIdFromMap(map, entry) {
    if (!entry || !map) return 0;
    const names = [entry.market_hash_name, entry.display_name];
    for (const name of names) {
      const key = craftInspectNameKey(name);
      if (key && map[key] > 0) return map[key];
    }
    return 0;
  }

  function lookupStickerKitIdFromEcon(data, entry) {
    const stickers = data?.stickers;
    if (!stickers || typeof stickers !== "object") return 0;
    const names = [entry?.market_hash_name, entry?.display_name].filter(Boolean);
    for (const name of names) {
      const direct = Number(stickers[name]?.sticker_id || 0);
      if (direct > 0) return direct;
      const key = craftInspectNameKey(name);
      const folded = Number(stickers[key]?.sticker_id || 0);
      if (folded > 0) return folded;
    }
    const wanted = new Set(names.map(craftInspectNameKey).filter(Boolean));
    if (!wanted.size) return 0;
    for (const [key, value] of Object.entries(stickers)) {
      if (!wanted.has(craftInspectNameKey(key))) continue;
      const id = Number(value?.sticker_id || 0);
      if (id > 0) return id;
    }
    return 0;
  }

  function resolveCraftInspectStickerId(entry, data, catalogMap) {
    if (!entry) return 0;
    const candidates = [
      lookupStickerKitIdFromMap(catalogMap, entry),
      lookupStickerKitIdFromEcon(data, entry),
      stickerKitIdFromEntry(entry),
    ];
    for (const id of candidates) {
      if (isUsableStickerKitId(id)) return id;
    }
    return 0;
  }

  function stickerWearLabel(wear) {
    const value = normalizeStickerWear(wear);
    if (value <= 0.05) return "Fresh";
    if (value <= 0.3) return "Light wear";
    if (value <= 0.55) return "Worn";
    if (value <= 0.8) return "Heavy wear";
    return "Scraped";
  }

  function stickerWearStyle(wear) {
    const value = normalizeStickerWear(wear);
    return {
      "--sticker-wear": value,
      opacity: String(Math.max(0.28, 1 - value * 0.62)),
      filter: `saturate(${Math.max(0.35, 1 - value * 0.55)}) brightness(${Math.max(0.72, 1 - value * 0.18)})`,
    };
  }

  function normalizeStickerEntry(sticker) {
    if (!sticker || typeof sticker !== "object") return null;
    const stickerId = stickerKitIdFromEntry(sticker);
    return {
      market_hash_name: sticker.market_hash_name,
      display_name: sticker.display_name,
      image: sticker.image,
      seed_sell_price: sticker.seed_sell_price,
      price: sticker.price,
      sticker_id: stickerId > 0 ? stickerId : null,
      wear: normalizeStickerWear(sticker.wear ?? DEFAULT_STICKER_WEAR),
      placement: sticker.placement || null,
    };
  }

  function formatPrice(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return "—";
    return `€${parsed.toFixed(2)}`;
  }

  const WEAPON_IMAGE_FOLDERS = {
    "ak-47": ["ak47"],
    "m4a1-s": ["m4a1_silencer"],
    "m4a4": ["m4a1", "m4a4"],
    "awp": ["awp"],
    "usp-s": ["usp_silencer"],
    "glock-18": ["glock", "glock18"],
    "desert eagle": ["deagle"],
    "p250": ["p250"],
    "cz75-auto": ["cz75a"],
    "famas": ["famas"],
    "galil ar": ["galilar"],
    "ssg 08": ["ssg08"],
    "scar-20": ["scar20"],
    "aug": ["aug"],
    "sg 553": ["sg556"],
    "mp7": ["mp7"],
    "mp9": ["mp9"],
    "p90": ["p90"],
    "ump-45": ["ump45"],
    "mac-10": ["mac10"],
    "mp5-sd": ["mp5sd"],
    "nova": ["nova"],
    "xm1014": ["xm1014"],
    "mag-7": ["mag7"],
    "sawed-off": ["sawedoff"],
    "negev": ["negev"],
    "m249": ["m249"],
    "g3sg1": ["g3sg1"],
    "p2000": ["hkp2000", "p2000"],
    "tec-9": ["tec9"],
    "five-seven": ["fiveseven"],
    "dual berettas": ["elite"],
    "r8 revolver": ["revolver"],
    "pp-bizon": ["bizon"],
  };

  function resolveWeaponImageFolders(marketName) {
    const weapon = String(marketName || "").split("|")[0].trim().toLowerCase();
    for (const [needle, folders] of Object.entries(WEAPON_IMAGE_FOLDERS)) {
      if (weapon.includes(needle)) return folders;
    }
    const slug = weapon.replace(/[^a-z0-9]+/g, "");
    return slug ? [slug] : [];
  }

  function csroiPreviewUrl(marketName, finishToken, folderIndex = 0) {
    const token = String(finishToken || "").trim();
    const folders = resolveWeaponImageFolders(marketName);
    const folder = folders[folderIndex];
    if (!folder || !token) return "";
    return `https://cdn.csroi.com/default_generated/weapon_${encodeURIComponent(folder)}_${encodeURIComponent(token)}_light_png.png`;
  }

  // Only the item's own real image belongs in a card — no generic weapon
  // silhouette standing in for it. When there's no real render to show,
  // just hide the broken <img> instead of substituting a fake one.
  function hideUnusableImage(img) {
    img.dataset.hiddenNoImage = "1";
    img.style.display = "none";
  }

  function handleLibraryImageError(event, entry) {
    const img = event.currentTarget;

    // Loading 50+ cards at once can hit the CDN's per-host connection limit
    // or a transient rate-limit — retry the exact same URL a couple of times
    // (with a short backoff) before assuming it's genuinely unavailable.
    const retries = Number(img.dataset.retryCount || "0");
    if (retries < 2) {
      const baseSrc = img.dataset.originalSrc || img.src.split("?")[0];
      img.dataset.originalSrc = baseSrc;
      img.dataset.retryCount = String(retries + 1);
      window.setTimeout(() => {
        img.src = `${baseSrc}?retry=${retries + 1}`;
      }, 500 * (retries + 1));
      return;
    }

    const tried = Number(img.dataset.fallbackIndex || "0");
    const next = tried + 1;
    const folders = resolveWeaponImageFolders(entry.market_name);
    if (next < folders.length) {
      img.dataset.fallbackIndex = String(next);
      img.dataset.retryCount = "0";
      delete img.dataset.originalSrc;
      img.src = csroiPreviewUrl(entry.market_name, entry.finish_token, next);
      return;
    }
    // A few ROI catalog rows point at dead CDN paths. Before giving up, fall
    // back to the workshop render the batch map ships — it is this item, just
    // not the official artwork, which beats a card with no picture at all.
    const renderFallback = String(entry?.fallback_image || "").trim();
    if (renderFallback && img.dataset.usedRenderFallback !== "1") {
      img.dataset.usedRenderFallback = "1";
      img.dataset.retryCount = "0";
      delete img.dataset.originalSrc;
      img.src = renderFallback;
      return;
    }

    // Skin-specific texture render isn't hosted anywhere we know of —
    // hide the image rather than show something that isn't this item.
    hideUnusableImage(img);
  }

  // Some locally-rendered preview PNGs were exported before their skin
  // texture was baked in, or as an over-exposed near-blank plate — those read
  // as "nothing here" to a viewer even though the file technically loaded.
  // Sample same-origin images after they load and hide only the ones with no
  // visible shape. Cross-origin (Steam CDN) images can't be sampled this way
  // (canvas taint) — that's fine, those are always real product photos, never
  // one of these broken exports.
  function handleLibraryImageLoad(event) {
    const img = event.currentTarget;
    if (img.dataset.hiddenNoImage || img.dataset.checkedTexture) {
      return;
    }
    img.dataset.checkedTexture = "1";
    try {
      const size = 24;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);

      // This used to test colour saturation and hide anything monochrome, which
      // was the wrong question: plenty of real finishes are grey or white by
      // design (MP9 | Chevron, MP9 | Prototype Extended), so their perfectly
      // good renders were being hidden and the cards showed nothing at all.
      // What actually makes a preview useless is having no discernible shape —
      // a blank plate. Measure luminance spread instead.
      let minLuma = 255;
      let maxLuma = 0;
      let opaquePixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 16) continue;
        opaquePixels += 1;
        const luma = (0.2126 * data[i]) + (0.7152 * data[i + 1]) + (0.0722 * data[i + 2]);
        if (luma < minLuma) minLuma = luma;
        if (luma > maxLuma) maxLuma = luma;
      }

      // Nothing drawn, or a flat fill with no gun visible in it.
      if (opaquePixels === 0 || (maxLuma - minLuma) < 12) {
        hideUnusableImage(img);
      }
    } catch (_error) {
      // Cross-origin image — can't read pixels, nothing to do.
    }
  }

  function catalogEntryPrice(entry) {
    const parsed = Number(entry?.seed_sell_price ?? entry?.price ?? 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function stickerPrice(sticker) {
    return catalogEntryPrice(sticker);
  }

  function charmPrice(charm) {
    return catalogEntryPrice(charm);
  }

  function stickerNameFromSlabName(name) {
    const raw = String(name || "").trim();
    if (!raw.startsWith("Sticker Slab |")) return "";
    return raw.replace(/^Sticker Slab\s*\|/i, "Sticker |").replace(/\s+/g, " ").trim();
  }

  function liveMarketRecordPrice(record) {
    return parseCraftEuroPrice(
      record?.current_price
        ?? record?.seed_sell_price
        ?? record?.lowest_price
        ?? record?.current_price_display
    );
  }

  function matchingStickerCatalogPrice(entry, stickerRows) {
    const stickerName = stickerNameFromSlabName(entry?.market_hash_name || entry?.display_name || "");
    if (!stickerName || !Array.isArray(stickerRows) || !stickerRows.length) return 0;
    const needle = stickerName.toLowerCase();
    const match = stickerRows.find((row) => (
      String(row?.market_hash_name || "").replace(/\s+/g, " ").trim().toLowerCase() === needle
    ));
    return match ? catalogEntryPrice(match) : 0;
  }

  function resolveCraftAddonPrice(entry, livePrices, stickerRows) {
    if (!entry) return 0;
    const name = String(entry.market_hash_name || "").trim();
    const live = Number(livePrices?.[name] || 0);
    if (Number.isFinite(live) && live > 0) return live;
    const catalog = catalogEntryPrice(entry);
    if (catalog > 0) return catalog;
    const stickerName = stickerNameFromSlabName(name);
    const liveSticker = Number(livePrices?.[stickerName] || 0);
    if (Number.isFinite(liveSticker) && liveSticker > 0) return liveSticker;
    return matchingStickerCatalogPrice(entry, stickerRows);
  }

  function isStickerSlabName(name) {
    return String(name || "").trim().startsWith("Sticker Slab |");
  }

  function isStickerSlabRow(row) {
    return isStickerSlabName(row?.market_hash_name || row?.display_name || "");
  }

  const CRAFT_SPOTLIGHT_SEEDS = [
    "holo", "foil", "gold", "dragon", "skull", "wolf",
    "katow", "paris", "charm", "slab", "panda", "koi",
    "anubis", "inferno", "zeus", "titan", "liquid", "faze",
  ];

  function shuffleArray(list) {
    const next = list.slice();
    for (let index = next.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    }
    return next;
  }

  function pickCraftSpotlightSeeds(count = 6) {
    return shuffleArray(CRAFT_SPOTLIGHT_SEEDS).slice(0, count);
  }

  function classifyCraftSearchRow(row) {
    if (!row || typeof row !== "object") return null;
    const name = String(row.market_hash_name || row.display_name || "").trim();
    const image = String(row.image || row.icon || row.local_path || "").trim();
    if (!image) return null;
    if (isStickerSlabRow(row) || name.startsWith("Sticker Slab |")) {
      return { kind: "slab", row: { ...row, image } };
    }
    if (name.startsWith("Souvenir Charm |") || name.startsWith("Charm |")) {
      return { kind: "charm", row: { ...row, image } };
    }
    if (name.startsWith("Sticker |")) {
      return { kind: "sticker", row: { ...row, image } };
    }
    const haystack = String(
      row.type_note || row.category || row.market_hash_name || row.display_name || ""
    );
    if (/charm/i.test(haystack)) {
      return { kind: "charm", row: { ...row, image } };
    }
    if (/sticker/i.test(haystack)) {
      return { kind: "sticker", row: { ...row, image } };
    }
    return null;
  }

  // Six rows of five. Was 25 (five rows); the panel has the height for another
  // row at 1080p, and a sixth row fills it without the grid needing to scroll.
  const STICKER_BROWSER_SPOTLIGHT_COUNT = 30;
  // The browser is picked once at this size and only sliced down for display,
  // so resizing the window changes how many are shown without another fetch.
  const STICKER_BROWSER_SPOTLIGHT_MAX = 90;
  const STICKER_ROTATION_STEP = 15;

  /**
   * How many stickers/charms the browser shows at once. The panel is as tall
   * as the 3D canvas beside it, so a 1440p screen has room for roughly twice
   * the rows a 1080p one does and the grid used to stop at 25 with the rest of
   * the panel empty. Width AND height are checked: an ultrawide at 1080 has no
   * spare rows, and 1080p keeps exactly the 25 it was designed around.
   */
  function resolveSpotlightCount() {
    if (typeof window === "undefined") return STICKER_BROWSER_SPOTLIGHT_COUNT;
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (width >= 2400 && height >= 1700) return STICKER_BROWSER_SPOTLIGHT_MAX;
    if (width >= 1921 && height >= 1150) return 60;
    return STICKER_BROWSER_SPOTLIGHT_COUNT;
  }

  function shuffleLibraryOrder(items) {
    const next = Array.isArray(items) ? items.slice() : [];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function skinNameMatchRank(entry, q) {
    const name = String(entry.market_name || "").toLowerCase();
    const finish = String(entry.finish_token || "").toLowerCase();
    const shortName = (name.split("|").pop() || name).trim();
    if (shortName === q || name === q || finish === q) return 0;
    if (shortName.startsWith(q) || finish.startsWith(q)) return 1;
    if (name.startsWith(q)) return 2;
    if (shortName.includes(q) || finish.includes(q)) return 3;
    return 4;
  }

  function normalizeStickerRotation(rotation) {
    const parsed = Number(rotation) || 0;
    return ((parsed % 360) + 360) % 360;
  }

  function withCustomPlacement(placement) {
    if (!placement) return null;
    return { ...placement, custom: true };
  }

  function applyStickerRotationToPlacement(placement, rotation) {
    if (!placement) return null;
    return {
      ...placement,
      rotation: normalizeStickerRotation(rotation),
    };
  }

  function filterStickerCatalogRows(rows, query) {
    let needle = String(query || "").trim().toLowerCase();
    if (!needle) return rows;
    // Texas Major souvenir charms are catalogued as Austin 2025 Highlight.
    if (/\btexas\b/.test(needle) && !/\baustin\b/.test(needle)) {
      needle = needle.replace(/\btexas\b/g, "austin");
    }
    return rows.filter((sticker) => {
      const name = String(sticker.market_hash_name || sticker.display_name || "").toLowerCase();
      return name.includes(needle);
    });
  }

  function isTournamentHighlightCharmRow(row) {
    const name = String(row?.market_hash_name || row?.display_name || "").trim();
    return /Souvenir Charm \|\s*(Austin 2025|Budapest 2025|Cologne 2026) Highlight\b/i.test(name);
  }

  function isSouvenirCharmRow(row) {
    const name = String(row?.market_hash_name || row?.display_name || "").trim();
    return name.startsWith("Souvenir Charm |");
  }

  function isCollectionCharmRow(row) {
    const name = String(row?.market_hash_name || row?.display_name || "").trim();
    return name.startsWith("Charm |") && !name.startsWith("Souvenir Charm |");
  }

  function pickPendantSpotlight(rows, count = STICKER_BROWSER_SPOTLIGHT_COUNT) {
    const collectionCharms = rows.filter(isCollectionCharmRow);
    const slabs = rows.filter(isStickerSlabRow);
    const highlights = rows.filter(isTournamentHighlightCharmRow);
    const highlightPickCount = Math.min(6, Math.max(3, Math.floor(count * 0.2)));
    const slabPickCount = Math.min(5, Math.max(2, Math.floor(count * 0.16)));
    const charmPickCount = Math.max(0, count - slabPickCount - highlightPickCount);
    const picked = [
      ...shuffleArray(highlights).slice(0, highlightPickCount),
      ...shuffleArray(collectionCharms).slice(0, charmPickCount),
      ...shuffleArray(slabs).slice(0, slabPickCount),
    ];
    if (picked.length >= count) {
      return shuffleArray(picked).slice(0, count);
    }
    const fallback = rows.filter((row) => !isSouvenirCharmRow(row) || isTournamentHighlightCharmRow(row));
    return shuffleArray(fallback).slice(0, count);
  }

  function pickStickerSpotlight(rows, count = STICKER_BROWSER_SPOTLIGHT_COUNT) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length <= count) return list;
    return shuffleArray(list).slice(0, count);
  }

  function normalizeStickerSlabEntry(slab) {
    if (!slab || typeof slab !== "object") return null;
    const enriched = enrichCharmWithModelUrl(slab);
    const image = String(enriched.image || enriched.icon || "").trim();
    if (!image) return null;
    const defIndex = Number(enriched.def_index ?? enriched.defIndex ?? enriched.sticker_id ?? enriched.stickerId ?? 0);
    const paintKit = Number(enriched.paint_kit ?? enriched.paintKit ?? enriched.wrapped_sticker ?? 0);
    const entry = {
      market_hash_name: enriched.market_hash_name,
      display_name: enriched.display_name || enriched.market_hash_name,
      image,
      seed_sell_price: enriched.seed_sell_price,
      price: enriched.price,
      def_index: Number.isFinite(defIndex) && defIndex > 0 ? defIndex : null,
      sticker_id: Number.isFinite(defIndex) && defIndex > 0 ? defIndex : null,
    };
    if (Number.isFinite(paintKit) && paintKit > 0) entry.paint_kit = paintKit;
    const modelUrl = String(enriched.model_url || enriched.model3d || enriched.gltf || "").trim();
    if (modelUrl) entry.model_url = modelUrl;
    if (enriched.placement && Array.isArray(enriched.placement.point)) {
      entry.placement = enriched.placement;
    }
    return entry;
  }

  function serializeStickerSlab(slab) {
    const entry = normalizeStickerSlabEntry(slab);
    if (!entry) return "";
    return JSON.stringify(entry);
  }

  function parseStickerSlabPayload(raw) {
    if (!raw) return null;
    try {
      return normalizeStickerSlabEntry(JSON.parse(raw));
    } catch (_error) {
      return null;
    }
  }

  function parseCraftEuroPrice(value) {
    if (value == null || value === "") return NaN;
    if (typeof value === "number") return value;
    const text = String(value).trim();
    if (!text || text === "—" || text === "-") return NaN;
    const cleaned = text.replace(/[^\d.-]+/g, "");
    return Number(cleaned);
  }

  // Local copy of splitSteamWearName — returns [baseName, wear], not an object.
  function splitCraftWearName(value) {
    const trimmed = String(value || "").trim();
    const match = trimmed.match(/^(.*)\s+\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/);
    if (!match) return [trimmed, ""];
    return [String(match[1] || "").trim(), String(match[2] || "").trim()];
  }

  function mergeWearPrices(priceRecords, baseName) {
    const baseNorm = String(baseName || "").toLowerCase().replace(/\s+/g, " ").trim();
    const byWear = {};
    (Array.isArray(priceRecords) ? priceRecords : []).forEach((record) => {
      const name = String(record?.market_hash_name || record?.name || "").trim();
      if (!name) return;
      // Prefer viewer helper when present; always treat result as [base, wear].
      const parsed = viewer.splitSteamWearName?.(name) ?? splitCraftWearName(name);
      const wear = Array.isArray(parsed)
        ? String(parsed[1] || "").trim()
        : String(parsed?.wear || "").trim();
      const recordBaseRaw = Array.isArray(parsed)
        ? String(parsed[0] || name).trim()
        : String(parsed?.baseName || name).trim();
      const price = parseCraftEuroPrice(
        record?.current_price
          ?? record?.seed_sell_price
          ?? record?.lowest_price
          ?? record?.current_price_display
      );
      if (!wear || !Number.isFinite(price) || price <= 0) return;
      const recordBase = recordBaseRaw.toLowerCase().replace(/\s+/g, " ").trim();
      if (recordBase !== baseNorm) return;
      byWear[wear] = price;
    });
    return byWear;
  }

  function serializeSticker(sticker) {
    const entry = normalizeStickerEntry(sticker);
    if (!entry) return "";
    return JSON.stringify(entry);
  }

  function parseStickerPayload(raw) {
    if (!raw) return null;
    try {
      return normalizeStickerEntry(JSON.parse(raw));
    } catch (_error) {
      return null;
    }
  }

  function serializeCharm(charm) {
    const entry = normalizeCharmEntry(charm);
    if (!entry) return "";
    return JSON.stringify(entry);
  }

  function parseCharmPayload(raw) {
    if (!raw) return null;
    try {
      return normalizeCharmEntry(JSON.parse(raw));
    } catch (_error) {
      return null;
    }
  }

  function normalizeCharmEntry(charm) {
    if (!charm || typeof charm !== "object") return null;
    const enriched = enrichCharmWithModelUrl(charm);
    const image = String(enriched.image || enriched.icon || enriched.local_path || "").trim();
    if (!image) return null;
    const defIndex = Number(enriched.def_index ?? enriched.defIndex ?? enriched.sticker_id ?? enriched.stickerId ?? 0);
    const entry = {
      market_hash_name: enriched.market_hash_name,
      display_name: enriched.display_name || enriched.market_hash_name,
      image,
      seed_sell_price: enriched.seed_sell_price,
      price: enriched.price,
      def_index: Number.isFinite(defIndex) && defIndex > 0 ? defIndex : null,
      sticker_id: Number.isFinite(defIndex) && defIndex > 0 ? defIndex : null,
    };
    const pattern = Number(enriched.pattern ?? enriched.seed);
    if (Number.isFinite(pattern) && pattern > 0) entry.pattern = pattern;
    const highlightReel = Number(enriched.highlight_reel ?? enriched.highlightReel);
    if (Number.isFinite(highlightReel) && highlightReel > 0) entry.highlight_reel = highlightReel;
    const modelUrl = String(enriched.model_url || enriched.model3d || enriched.gltf || "").trim();
    if (modelUrl) entry.model_url = modelUrl;
    if (enriched.placement && Array.isArray(enriched.placement.point)) {
      entry.placement = enriched.placement;
    }
    return entry;
  }

  function SkinCrafterPage() {
    const [library, setLibrary] = useState([]);
    const [libraryLoading, setLibraryLoading] = useState(true);
    const [libraryQuery, setLibraryQuery] = useState("");
    const [selectedSkin, setSelectedSkin] = useState(null);
    const [wearFloat, setWearFloat] = useState(WEAR_FLOAT["Field-Tested"]);
    const [selectedWear, setSelectedWear] = useState("Factory New");
    const [wearPrices, setWearPrices] = useState({});
    const [liveCraftPrices, setLiveCraftPrices] = useState({});
    const liveCraftPricesRef = useRef({});
    const [stickers, setStickers] = useState(() => Array(STICKER_SLOTS).fill(null));
    const [charm, setCharm] = useState(null);
    const [stickerSlab, setStickerSlab] = useState(null);
    const [dragOverSlot, setDragOverSlot] = useState(null);
    const [dragOverPendant, setDragOverPendant] = useState(false);
    const [pendingSticker, setPendingSticker] = useState(null);
    const [pendingCharm, setPendingCharm] = useState(null);
    const [pendingSlab, setPendingSlab] = useState(null);
    const [cursorStickerPos, setCursorStickerPos] = useState(null);
    const [cursorCharmPos, setCursorCharmPos] = useState(null);
    const [cursorSlabPos, setCursorSlabPos] = useState(null);
    const [stickerHoverValid, setStickerHoverValid] = useState(false);
    const [charmHoverValid, setCharmHoverValid] = useState(false);
    const [slabHoverValid, setSlabHoverValid] = useState(false);
    const [canvasDragOver, setCanvasDragOver] = useState(false);
    const canvasPanelRef = useRef(null);
    const canvasPointerRef = useRef({ downX: 0, downY: 0, moved: false });
    const pendingStickerRef = useRef(null);
    const cursorStickerPosRef = useRef(null);
    const pendingCharmRef = useRef(null);
    const pendingSlabRef = useRef(null);
    const cursorCharmPosRef = useRef(null);
    const cursorSlabPosRef = useRef(null);
    const charmMoveRafRef = useRef(0);
    const lastValidCharmPlacementRef = useRef(null);
    const lastValidSlabPlacementRef = useRef(null);
    const [craftQuery, setCraftQuery] = useState("");
    const [spotlightCount, setSpotlightCount] = useState(resolveSpotlightCount);
    useEffect(() => {
      const onResize = () => setSpotlightCount(resolveSpotlightCount());
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, []);
    const [stickerCatalog, setStickerCatalog] = useState([]);
    const [stickerSpotlight, setStickerSpotlight] = useState([]);
    const [stickerSearchRows, setStickerSearchRows] = useState([]);
    const [stickerSearchTotal, setStickerSearchTotal] = useState(0);
    const [stickerBrowserLoading, setStickerBrowserLoading] = useState(true);
    const [pendantCatalog, setPendantCatalog] = useState([]);
    const [pendantSpotlight, setPendantSpotlight] = useState([]);
    const [pendantBrowserLoading, setPendantBrowserLoading] = useState(true);
    const [craftBrowserMode, setCraftBrowserMode] = useState("stickers");
    const [inspectLoading, setInspectLoading] = useState(false);
    const [inspectError, setInspectError] = useState("");
    const [viewerStatus, setViewerStatus] = useState("idle");
    const viewerContainerRef = useRef(null);
    const viewerApiRef = useRef(null);
    const placingCharmRef = useRef(false);
    const placingSlabRef = useRef(false);
    const craftSearchInputRef = useRef(null);
    const stickerIdByNameRef = useRef(Object.create(null));

    const stickerIdByName = useMemo(
      () => buildStickerKitIdMap([
        ...stickerCatalog,
        ...stickerSearchRows,
        ...stickerSpotlight,
        ...stickers,
      ]),
      [stickerCatalog, stickerSearchRows, stickerSpotlight, stickers]
    );
    stickerIdByNameRef.current = stickerIdByName;

    const baseName = String(selectedSkin?.market_name || "").trim();

    useEffect(() => {
      setInspectError("");
    }, [selectedSkin, selectedWear, stickers, charm, stickerSlab]);

    const rarityStyle = useMemo(() => (
      viewer.buildSkinViewerRarityStyle?.(selectedSkin?.name_color || "4b69ff") || {}
    ), [selectedSkin]);

    const visualType = useMemo(() => (
      viewer.resolveVisualType?.(selectedSkin?.category, selectedSkin?.type_note, baseName) || "items"
    ), [selectedSkin, baseName]);

    const craftAssets = useMemo(
      () => resolveCraftViewerAssets(selectedSkin),
      [selectedSkin]
    );

    const texturePack = craftAssets?.texturePack || null;
    const baseModelUrl = craftAssets?.baseModelUrl || "";
    const skinModelUrl = useMemo(() => {
      const url = String(craftAssets?.skinModelUrl || "").trim();
      if (!url) return "";
      const stamp = String(selectedSkin?.updated_at || "").trim();
      return stamp ? `${url.split("?")[0]}?v=${encodeURIComponent(stamp)}` : url;
    }, [craftAssets?.skinModelUrl, selectedSkin?.updated_at]);

    const modelAvailable = Boolean(
      (texturePack?.albedo && baseModelUrl) || skinModelUrl || baseModelUrl
    );

    const filteredLibrary = useMemo(() => {
      const q = libraryQuery.trim().toLowerCase();
      if (!q) return library;
      return library
        .filter((entry) => (
          String(entry.market_name || "").toLowerCase().includes(q)
          || String(entry.finish_token || "").toLowerCase().includes(q)
        ))
        .slice()
        .sort((a, b) => {
          const rankDelta = skinNameMatchRank(a, q) - skinNameMatchRank(b, q);
          if (rankDelta !== 0) return rankDelta;
          return String(a.market_name || "").localeCompare(String(b.market_name || ""));
        });
    }, [library, libraryQuery]);

    const skinSearchActive = libraryQuery.trim().length > 0;
    const displaySkinLibrary = filteredLibrary;

    const displayStickerCatalog = useMemo(() => {
      const q = craftQuery.trim();
      const rows = q ? stickerSearchRows : stickerSpotlight;
      return rows.slice(0, spotlightCount);
    }, [craftQuery, stickerSearchRows, stickerSpotlight, spotlightCount]);

    const stickerBrowserTotal = useMemo(() => {
      const q = craftQuery.trim();
      if (!q) return stickerSpotlight.length;
      return stickerSearchTotal;
    }, [craftQuery, stickerSearchTotal, stickerSpotlight]);

    const stickerSearchActive = craftQuery.trim().length > 0;
    const stickerBrowserCapped = stickerBrowserTotal > spotlightCount;

    const displayPendantCatalog = useMemo(() => {
      const q = craftQuery.trim();
      const rows = q
        ? filterStickerCatalogRows(pendantCatalog, q)
        : pendantSpotlight;
      return rows.slice(0, spotlightCount);
    }, [craftQuery, pendantCatalog, pendantSpotlight, spotlightCount]);

    const pendantBrowserTotal = useMemo(() => {
      const q = craftQuery.trim();
      if (!q) {
        return pendantCatalog.filter((row) => !isSouvenirCharmRow(row)).length;
      }
      return filterStickerCatalogRows(pendantCatalog, q).length;
    }, [craftQuery, pendantCatalog]);

    const pendantSearchActive = craftQuery.trim().length > 0;
    const pendantBrowserCapped = pendantBrowserTotal > spotlightCount;
    const isCharmMode = craftBrowserMode === "charms";
    const browserLoading = isCharmMode ? pendantBrowserLoading : stickerBrowserLoading;
    const browserSearchActive = isCharmMode ? pendantSearchActive : stickerSearchActive;
    const browserCapped = isCharmMode ? pendantBrowserCapped : stickerBrowserCapped;
    const browserTotal = isCharmMode ? pendantBrowserTotal : stickerBrowserTotal;
    const browserDisplayCount = isCharmMode ? displayPendantCatalog.length : displayStickerCatalog.length;
    const pendantSlotItem = charm || stickerSlab;
    const hasPendingPendant = Boolean(pendingCharm || pendingSlab);

    const craftCost = useMemo(() => {
      const skinRaw = Number(wearPrices[selectedWear] || 0);
      const skinCost = Number.isFinite(skinRaw) && skinRaw > 0 ? skinRaw : null;
      const stickerPriceRows = stickerSearchRows.length ? stickerCatalog.concat(stickerSearchRows) : stickerCatalog;
      const stickerRaw = stickers.reduce((sum, sticker) => (
        sum + resolveCraftAddonPrice(sticker, liveCraftPrices, stickerPriceRows)
      ), 0);
      const stickerTotal = stickerRaw > 0 ? stickerRaw : null;
      const pendant = charm || stickerSlab;
      const charmCount = pendant ? 1 : 0;
      const charmRaw = pendant ? resolveCraftAddonPrice(pendant, liveCraftPrices, stickerPriceRows) : 0;
      const charmTotal = charmRaw > 0 ? charmRaw : null;
      const totalRaw = (skinCost || 0) + (charmTotal || 0) + (stickerTotal || 0);
      return {
        skinCost,
        charmCount,
        charmTotal,
        stickerTotal,
        total: totalRaw > 0 ? totalRaw : null,
      };
    }, [wearPrices, selectedWear, stickers, charm, stickerSlab, liveCraftPrices, stickerCatalog, stickerSearchRows]);

    const selectSkinEntry = (entry, options = {}) => {
      if (!entry) return;
      const nextWear = resolveCrafterWearLabel(options.wear) || "Field-Tested";
      setSelectedSkin(entry);
      setWearFloat(WEAR_FLOAT[nextWear] || WEAR_FLOAT["Field-Tested"]);
      setSelectedWear(nextWear);
      setStickers(Array(STICKER_SLOTS).fill(null));
      setCharm(null);
      setStickerSlab(null);
      setCraftQuery("");
      if (options.syncUrl === false) return;
      // Address bar shows /skin-crafter/ak-47-ice-coaled/field-tested/ - a real
      // folder on the server (scripts/build_crafter_urls.php), so the link can
      // be shared and reloaded. Falls back to the query form for a skin with no
      // generated page rather than pointing at a 404.
      const pretty = crafterPrettyPath(entry.market_name, nextWear);
      if (pretty) {
        window.history.replaceState({}, "", siteBasePathForCrafter() + pretty);
        return;
      }
      const params = new URLSearchParams({ skin: String(entry.market_name || "") });
      if (nextWear) params.set("wear", nextWear);
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    };

    const findFirstEmptyStickerSlot = (list = stickers) => (
      list.findIndex((entry) => !entry)
    );

    const findNearestEmptyStickerSlot = (placement, list = stickers) => {
      const occupied = [];
      list.forEach((entry, index) => {
        if (entry) occupied.push(index);
      });
      if (placement && viewerApiRef.current?.resolveNearestEmptyStickerSlot) {
        const nearest = viewerApiRef.current.resolveNearestEmptyStickerSlot(placement, occupied);
        if (Number.isInteger(nearest) && nearest >= 0) return nearest;
      }
      return findFirstEmptyStickerSlot(list);
    };

    const placeStickerInSlot = (slotIndex, sticker, placement = null) => {
      if (slotIndex == null || slotIndex < 0 || slotIndex >= STICKER_SLOTS || !sticker) return false;
      const entry = normalizeStickerEntry(sticker);
      if (!entry) return false;
      const catalogId = lookupStickerKitIdFromMap(stickerIdByNameRef.current, entry);
      if (!entry.sticker_id && catalogId > 0) {
        entry.sticker_id = catalogId;
      }
      if (placement?.custom) {
        // Always recompute slot-relative inspect offsets at place time.
        const inspect = viewerApiRef.current?.computeInspectStickerPlacement?.(
          slotIndex,
          { ...entry, placement }
        );
        entry.placement = inspect
          ? { ...placement, inspect: { ...inspect, custom: true }, custom: true }
          : withCustomPlacement(placement);
      }
      setStickers((prev) => {
        const next = prev.slice();
        next[slotIndex] = entry;
        return next;
      });
      return true;
    };

    const placeStickerOnWeapon = (sticker, placement) => {
      if (!sticker || !placement) return false;
      const slotIndex = findNearestEmptyStickerSlot(placement);
      if (slotIndex < 0) return false;
      const placed = placeStickerInSlot(slotIndex, sticker, withCustomPlacement(placement));
      if (placed) dismissCraftSearch();
      return placed;
    };

    const dismissCraftSearch = () => {
      setCraftQuery("");
    };

    const craftEconCacheRef = useRef({ key: "", data: null });

    const buildCraftEconRequest = () => {
      if (!baseName) return null;
      const skinMarketHashName = viewer.buildWearMarketHashName?.(baseName, selectedWear)
        || `${baseName} (${selectedWear})`;
      const stickerNames = stickers
        .filter(Boolean)
        .map((entry) => String(entry.market_hash_name || "").trim())
        .filter(Boolean);
      const keychainNames = [];
      const pendant = charm || stickerSlab;
      if (pendant?.market_hash_name) keychainNames.push(pendant.market_hash_name);
      return { skinMarketHashName, stickerNames, keychainNames };
    };

    const fetchCraftEconBundle = async (request) => {
      const response = await fetch("get_craft_econ_lookup.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skin_market_hash_name: request.skinMarketHashName,
          sticker_market_hash_names: request.stickerNames,
          keychain_market_hash_names: request.keychainNames || [],
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.success || !data?.skin) {
        throw new Error(data?.error || "Could not resolve this skin for in-game inspect.");
      }
      return data;
    };

    useEffect(() => {
      const request = buildCraftEconRequest();
      if (!request) {
        craftEconCacheRef.current = { key: "", data: null };
        return undefined;
      }

      const cacheKey = JSON.stringify(request);
      let cancelled = false;
      fetchCraftEconBundle(request)
        .then((data) => {
          if (!cancelled) {
            craftEconCacheRef.current = { key: cacheKey, data };
          }
        })
        .catch(() => {
          if (!cancelled) {
            craftEconCacheRef.current = { key: cacheKey, data: null };
          }
        });

      return () => {
        cancelled = true;
      };
    }, [baseName, selectedWear, stickers, charm, stickerSlab]);

    const launchInspectUrl = (inspectUrl) => {
      const url = String(inspectUrl || "").trim();
      if (!url) return false;
      if (window.CS2InspectLaunch?.launchSteamInspectUrl?.(url)) {
        return true;
      }
      try {
        window.location.assign(url);
        return true;
      } catch (_error) {
        return false;
      }
    };

    const openCraftInGame = async () => {
      if (!selectedSkin || !baseName) return;
      if (!window.CS2CraftInspect?.buildCraftInspectUrl) {
        setInspectError("Inspect builder is not loaded yet.");
        return;
      }
      setInspectLoading(true);
      setInspectError("");
      try {
        const request = buildCraftEconRequest();
        if (!request) {
          throw new Error("Select a skin before opening in CS2.");
        }

        const cacheKey = JSON.stringify(request);
        let data = craftEconCacheRef.current.key === cacheKey
          ? craftEconCacheRef.current.data
          : null;
        if (!data) {
          data = await fetchCraftEconBundle(request);
          craftEconCacheRef.current = { key: cacheKey, data };
        }

        const missingStickers = Array.isArray(data.missing_stickers) ? data.missing_stickers : [];
        const unresolvedNames = [];
        // CS2 inspect supports 5 slots (sticker0–4). Map crafter slots 1:1; empty stays empty.
        const craftStickers = Array.from({ length: STICKER_SLOTS }, (_, slotIndex) => {
            const entry = stickers[slotIndex] || null;
            if (!entry) return null;
            const name = String(entry.market_hash_name || entry.display_name || "").trim();
            const stickerId = resolveCraftInspectStickerId(entry, data, stickerIdByNameRef.current);
            if (!isUsableStickerKitId(stickerId)) {
              if (name) unresolvedNames.push(name);
              return null;
            }

            // CS2 only renders stickers sitting in a weapon's real, fixed slot
            // positions — custom offset_x/offset_y (unlike keychain offsets,
            // which Valve's charm hanger genuinely supports) isn't something
            // the live game honors, so a stuck-on-own custom placement here
            // silently fails to render. Send plain slot + id + wear only,
            // same shape as a base (uncustomized) keychain — that's the form
            // that actually shows up in game.
            return {
              slot: slotIndex,
              stickerId,
              // Fresh stickers omit wear in the inspect protobuf (0 scrapes hides nothing,
              // but null matches working inventory-style links).
              wear: normalizeStickerWear(entry.wear) > 0.001 ? normalizeStickerWear(entry.wear) : null,
              inspect: null,
              placement: null,
              rotation: null,
            };
          });

        const resolvedStickers = craftStickers.filter(Boolean);
        const placedCount = stickers.filter(Boolean).length;
        if (placedCount > 0 && resolvedStickers.length < placedCount) {
          throw new Error(
            `Could not resolve sticker for in-game inspect: ${unresolvedNames[0] || missingStickers[0] || "sticker"}`
          );
        }

        const craftKeychains = [];
        const pendant = charm || stickerSlab;
        if (pendant?.market_hash_name) {
          const charmName = String(pendant.market_hash_name).trim();
          const keychainEntry = data.keychains?.[charmName] || null;
          const fromLookup = Number(keychainEntry?.def_index || 0);
          const fromEntry = Number(pendant.def_index || pendant.sticker_id || pendant.stickerId || 0);
          const keychainId = fromLookup > 0 ? fromLookup : fromEntry;
          if (!Number.isFinite(keychainId) || keychainId <= 0) {
            const hasLocalModel = Boolean(String(pendant.model_url || "").trim());
            if (!hasLocalModel) {
              const missing = Array.isArray(data.missing_keychains) ? data.missing_keychains : [];
              throw new Error(
                `Could not resolve charm for in-game inspect: ${charmName || missing[0] || "charm"}`
              );
            }
            // Custom / unreleased charm: keep it in the 3D picker, omit a fake inspect id.
          } else {
          const keychainPayload = { slot: 0, stickerId: keychainId };
          const pattern = Number(pendant.pattern);
          if (Number.isFinite(pattern) && pattern > 0) keychainPayload.pattern = pattern;
          const highlightReel = Number(
            keychainEntry?.highlight_reel
            ?? pendant.highlight_reel
            ?? pendant.highlightReel
          );
          if (Number.isFinite(highlightReel) && highlightReel > 0) {
            keychainPayload.highlightReel = highlightReel;
          }
          const paintKit = Number(
            keychainEntry?.paint_kit
            ?? pendant.paint_kit
            ?? pendant.paintKit
          );
          if (Number.isFinite(paintKit) && paintKit > 0) {
            keychainPayload.paintKit = paintKit;
          }
          let inspect = null;
          try {
            inspect = pendant.placement?.custom
              ? (
                viewerApiRef.current?.computeInspectCharmPlacement?.(pendant)
                || pendant.placement?.inspect
                || null
              )
              : (pendant.placement?.inspect || null);
          } catch (_error) {
            inspect = pendant.placement?.inspect || null;
          }
          if (inspect && !inspect.nearDefault) {
            keychainPayload.inspect = inspect;
            if (Number.isFinite(Number(inspect.offsetX))) keychainPayload.offsetX = Number(inspect.offsetX);
            if (Number.isFinite(Number(inspect.offsetY))) keychainPayload.offsetY = Number(inspect.offsetY);
            if (Number.isFinite(Number(inspect.offsetZ))) keychainPayload.offsetZ = Number(inspect.offsetZ);
          }
          craftKeychains.push(keychainPayload);
          }
        }

        // Always encode stickers + charm together in one masked inspect URL.
        const inspectUrl = window.CS2CraftInspect.buildCraftInspectUrl({
          defIndex: data.skin.def_index,
          paintIndex: data.skin.paint_index,
          paintSeed: CRAFT_INSPECT_SEED,
          paintWear: wearFloat,
          rarity: data.skin.rarity,
          quality: 4,
          stickers: craftStickers,
          keychains: craftKeychains,
        });
        if (!launchInspectUrl(inspectUrl)) {
          throw new Error("Generated inspect link was empty.");
        }
      } catch (error) {
        setInspectError(String(error?.message || "Could not open craft in CS2."));
      } finally {
        setInspectLoading(false);
      }
    };

    const canInspectInGame = Boolean(selectedSkin && baseName && viewerStatus === "ready");

    const raycastWeaponPlacement = (clientX, clientY, kind = "sticker", entry = null) => (
      viewerApiRef.current?.raycastCraftPlacement?.(clientX, clientY, kind, entry)
      || viewerApiRef.current?.raycastCraftSurface?.(clientX, clientY)
      || null
    );

    pendingStickerRef.current = pendingSticker;
    pendingCharmRef.current = pendingCharm;
    pendingSlabRef.current = pendingSlab;

    const clearPendingCharm = () => {
      setPendingCharm(null);
      setCursorCharmPos(null);
      cursorCharmPosRef.current = null;
      lastValidCharmPlacementRef.current = null;
      setCharmHoverValid(false);
      if (charmMoveRafRef.current) {
        window.cancelAnimationFrame(charmMoveRafRef.current);
        charmMoveRafRef.current = 0;
      }
      viewerApiRef.current?.clearCraftPreview?.();
      viewerApiRef.current?.setCraftPlacementMode?.(false);
      viewerApiRef.current?.setCharmPlacementMode?.(false);
    };

    const clearPendingSlab = () => {
      setPendingSlab(null);
      setCursorSlabPos(null);
      cursorSlabPosRef.current = null;
      lastValidSlabPlacementRef.current = null;
      setSlabHoverValid(false);
      viewerApiRef.current?.clearCraftPreview?.();
      viewerApiRef.current?.setCraftPlacementMode?.(false);
      viewerApiRef.current?.setStickerSlabPlacementMode?.(false);
    };

    const toggleCraftBrowserMode = () => {
      setCraftBrowserMode((mode) => {
        const next = mode === "stickers" ? "charms" : "stickers";
        if (next === "charms") {
          clearPendingSticker();
        } else {
          clearPendingCharm();
          clearPendingSlab();
        }
        setCraftQuery("");
        return next;
      });
    };

    const shuffleBrowserSpotlight = () => {
      if (browserLoading || browserSearchActive) return;
      if (isCharmMode) {
        setPendantSpotlight(pickPendantSpotlight(pendantCatalog, STICKER_BROWSER_SPOTLIGHT_MAX));
      } else {
        setStickerSpotlight(pickStickerSpotlight(stickerCatalog, STICKER_BROWSER_SPOTLIGHT_MAX));
      }
    };

    const clearPendingSticker = () => {
      setPendingSticker(null);
      setCursorStickerPos(null);
      cursorStickerPosRef.current = null;
      setStickerHoverValid(false);
      viewerApiRef.current?.clearCraftPreview?.();
      viewerApiRef.current?.setCraftPlacementMode?.(false);
    };

    const pushStickerPreview = (clientX, clientY) => {
      const pending = pendingStickerRef.current;
      if (!pending?.entry) return;
      const placement = applyStickerRotationToPlacement(
        raycastWeaponPlacement(clientX, clientY, "sticker", pending.entry),
        pending.rotation
      );
      setStickerHoverValid(Boolean(placement));
      viewerApiRef.current?.updateCraftPreview?.({
        kind: "sticker",
        entry: { ...pending.entry, placement },
        slotIndex: pending.slotIndex,
        placement,
      });
    };

    const pushCharmPreview = (clientX, clientY) => {
      const pending = pendingCharmRef.current;
      if (!pending?.entry) return;
      const rawPlacement = raycastWeaponPlacement(clientX, clientY, "charm", pending.entry);
      const placement = rawPlacement ? withCustomPlacement(rawPlacement) : null;
      setCharmHoverValid(Boolean(placement));
      if (!placement) {
        viewerApiRef.current?.clearCraftPreview?.();
        return;
      }
      lastValidCharmPlacementRef.current = placement;
      viewerApiRef.current?.updateCraftPreview?.({
        kind: "charm",
        entry: { ...pending.entry, placement },
        placement,
      });
    };

    const pushSlabPreview = (clientX, clientY) => {
      const pending = pendingSlabRef.current;
      if (!pending?.entry) return;
      const rawPlacement = raycastWeaponPlacement(clientX, clientY, "slab", pending.entry);
      const placement = rawPlacement ? withCustomPlacement(rawPlacement) : null;
      setSlabHoverValid(Boolean(placement));
      if (!placement) {
        viewerApiRef.current?.clearCraftPreview?.();
        return;
      }
      lastValidSlabPlacementRef.current = placement;
      viewerApiRef.current?.updateCraftPreview?.({
        kind: "slab",
        entry: { ...pending.entry, placement },
        placement,
      });
    };

    const updatePendingCharmAt = (clientX, clientY) => {
      const pos = { x: clientX, y: clientY };
      cursorCharmPosRef.current = pos;
      setCursorCharmPos(pos);
      const panel = canvasPanelRef.current;
      if (!panel || !pendingCharmRef.current) return;
      const rect = panel.getBoundingClientRect();
      const inside = (
        clientX >= rect.left
        && clientX <= rect.right
        && clientY >= rect.top
        && clientY <= rect.bottom
      );
      if (inside) {
        pushCharmPreview(clientX, clientY);
      } else {
        setCharmHoverValid(false);
        viewerApiRef.current?.clearCraftPreview?.();
      }
    };

    const updatePendingSlabAt = (clientX, clientY) => {
      const pos = { x: clientX, y: clientY };
      cursorSlabPosRef.current = pos;
      setCursorSlabPos(pos);
      const panel = canvasPanelRef.current;
      if (!panel || !pendingSlabRef.current) return;
      const rect = panel.getBoundingClientRect();
      const inside = (
        clientX >= rect.left
        && clientX <= rect.right
        && clientY >= rect.top
        && clientY <= rect.bottom
      );
      if (inside) {
        pushSlabPreview(clientX, clientY);
      } else {
        setSlabHoverValid(false);
        viewerApiRef.current?.clearCraftPreview?.();
      }
    };

    const updatePendingStickerAt = (clientX, clientY) => {
      const pos = { x: clientX, y: clientY };
      cursorStickerPosRef.current = pos;
      setCursorStickerPos(pos);
      const panel = canvasPanelRef.current;
      if (!panel || !pendingStickerRef.current) return;
      const rect = panel.getBoundingClientRect();
      const inside = (
        clientX >= rect.left
        && clientX <= rect.right
        && clientY >= rect.top
        && clientY <= rect.bottom
      );
      if (inside) {
        pushStickerPreview(clientX, clientY);
      } else {
        setStickerHoverValid(false);
        viewerApiRef.current?.clearCraftPreview?.();
      }
    };

    const clearStickerPlacementMode = () => {
      clearPendingSticker();
    };

    const clearCharmPlacementMode = () => {
      clearPendingCharm();
    };

    const clearSlabPlacementMode = () => {
      clearPendingSlab();
    };

    const updateStickerWear = (slotIndex, wear) => {
      if (slotIndex == null || slotIndex < 0 || slotIndex >= STICKER_SLOTS) return;
      const nextWear = normalizeStickerWear(wear);
      setStickers((prev) => {
        if (!prev[slotIndex]) return prev;
        const next = prev.slice();
        next[slotIndex] = { ...next[slotIndex], wear: nextWear };
        return next;
      });
    };

    const selectStickerSlot = (slotIndex) => {
      if (!stickers[slotIndex]) {
        clearPendingSticker();
        return;
      }
      const pick = {
        entry: stickers[slotIndex],
        slotIndex,
        reposition: true,
        rotation: normalizeStickerRotation(stickers[slotIndex]?.placement?.rotation),
      };
      pendingStickerRef.current = pick;
      setPendingSticker(pick);
      viewerApiRef.current?.setCraftPlacementMode?.(true);
    };

    const clearStickerSlot = (slotIndex, event) => {
      event?.stopPropagation();
      event?.preventDefault();
      setStickers((prev) => {
        const next = prev.slice();
        next[slotIndex] = null;
        return next;
      });
      if (pendingSticker?.slotIndex === slotIndex) {
        clearPendingSticker();
      }
    };

    const handleStickerDragStart = (event, sticker) => {
      event.dataTransfer.setData(STICKER_DRAG_TYPE, serializeSticker(sticker));
      event.dataTransfer.effectAllowed = "copyMove";
    };

    // Phones have no cursor to carry a sticker around with, so a tap drops it
    // straight into the first free slot; moving it afterwards is the existing
    // "tap the slot, then tap the gun" flow.
    const isPhoneCraft = () => (
      typeof window.matchMedia === "function" && window.matchMedia("(max-width: 900px)").matches
    );

    const pickStickerForPlacement = (sticker, event) => {
      const entry = normalizeStickerEntry(sticker);
      if (!entry) return;
      const slotIndex = findFirstEmptyStickerSlot();
      if (slotIndex < 0) return;
      if (isPhoneCraft()) {
        // Each slot has a canonical spot on the weapon (the same ones CS2 uses),
        // so a tapped sticker lands there instead of the generic fallback.
        const placement = withCustomPlacement(
          viewerApiRef.current?.resolvePresetPlacement?.("sticker", slotIndex, entry)
        ) || null;
        placeStickerInSlot(slotIndex, entry, placement);
        dismissCraftSearch();
        return;
      }
      clearPendingCharm();
      clearPendingSlab();
      const pick = { entry, slotIndex, rotation: 0 };
      pendingStickerRef.current = pick;
      setPendingSticker(pick);
      viewerApiRef.current?.setCraftPlacementMode?.(true);
      if (event?.clientX != null && event?.clientY != null) {
        setCursorStickerPos({ x: event.clientX, y: event.clientY });
        pushStickerPreview(event.clientX, event.clientY);
      }
    };

    const handleCanvasPointerDown = (event) => {
      canvasPointerRef.current = {
        downX: event.clientX,
        downY: event.clientY,
        moved: false,
      };
    };

    const handleCanvasPointerMove = (event) => {
      const pointer = canvasPointerRef.current;
      const dx = event.clientX - pointer.downX;
      const dy = event.clientY - pointer.downY;
      if ((dx * dx + dy * dy) > 36) {
        pointer.moved = true;
      }
      if (pendingStickerRef.current) {
        updatePendingStickerAt(event.clientX, event.clientY);
      }
      if (pendingCharmRef.current) {
        updatePendingCharmAt(event.clientX, event.clientY);
      }
      if (pendingSlabRef.current) {
        updatePendingSlabAt(event.clientX, event.clientY);
      }
    };

    const handleCanvasPointerUp = (event) => {
      const hasPending = Boolean(
        pendingStickerRef.current || pendingCharmRef.current || pendingSlabRef.current
      );
      if (!hasPending && canvasPointerRef.current.moved) return;

      const panel = canvasPanelRef.current;
      if (panel && hasPending) {
        const rect = panel.getBoundingClientRect();
        const inside = (
          event.clientX >= rect.left
          && event.clientX <= rect.right
          && event.clientY >= rect.top
          && event.clientY <= rect.bottom
        );
        if (!inside) return;
      }

      const pendingCharmEntry = pendingCharmRef.current;
      if (pendingCharmEntry) {
        const placement = withCustomPlacement(
          raycastWeaponPlacement(
            event.clientX,
            event.clientY,
            "charm",
            pendingCharmEntry.entry
          )
        )
          || lastValidCharmPlacementRef.current
          || withCustomPlacement(
            viewerApiRef.current?.resolvePresetPlacement?.(
              "charm",
              2,
              pendingCharmEntry.entry
            )
          );
        if (!placement) return;
        placeCharm(pendingCharmEntry.entry, placement);
        return;
      }

      const pendingSlabEntry = pendingSlabRef.current;
      if (pendingSlabEntry) {
        const placement = withCustomPlacement(
          raycastWeaponPlacement(
            event.clientX,
            event.clientY,
            "slab",
            pendingSlabEntry.entry
          )
        ) || lastValidSlabPlacementRef.current;
        if (!placement) return;
        placeStickerSlab(pendingSlabEntry.entry, placement);
        return;
      }

      const pending = pendingStickerRef.current;
      if (!pending) return;
      const placement = applyStickerRotationToPlacement(
        withCustomPlacement(
          raycastWeaponPlacement(event.clientX, event.clientY, "sticker", pending.entry)
        ),
        pending.rotation
      );
      if (!placement) return;
      placeStickerInSlot(pending.slotIndex, pending.entry, placement);
      clearPendingSticker();
      dismissCraftSearch();
    };

    const handleCanvasDragOver = (event) => {
      const types = Array.from(event.dataTransfer?.types || []);
      if (!types.includes(STICKER_DRAG_TYPE) && !types.includes(CHARM_DRAG_TYPE) && !types.includes(SLAB_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setCanvasDragOver(true);
    };

    const handleCanvasDrop = (event) => {
      event.preventDefault();
      setCanvasDragOver(false);
      const sticker = parseStickerPayload(event.dataTransfer.getData(STICKER_DRAG_TYPE));
      if (sticker) {
        const entry = normalizeStickerEntry(sticker);
        if (!entry) return;
        placeStickerOnWeapon(entry, raycastWeaponPlacement(event.clientX, event.clientY, "sticker", entry));
        return;
      }
      const nextCharm = parseCharmPayload(event.dataTransfer.getData(CHARM_DRAG_TYPE));
      if (nextCharm) {
        const placement = withCustomPlacement(
          raycastWeaponPlacement(event.clientX, event.clientY, "charm", nextCharm)
        );
        if (!placement) return;
        placeCharm(nextCharm, placement);
        return;
      }
      const nextSlab = parseStickerSlabPayload(event.dataTransfer.getData(SLAB_DRAG_TYPE));
      if (nextSlab) {
        const placement = withCustomPlacement(
          raycastWeaponPlacement(event.clientX, event.clientY, "slab", nextSlab)
        );
        if (!placement) return;
        placeStickerSlab(nextSlab, placement);
      }
    };

    const placeCharm = (nextCharm, placement = null) => {
      if (placingCharmRef.current) return;
      const entry = normalizeCharmEntry(nextCharm);
      if (!entry) return;
      placingCharmRef.current = true;
      if (placement) {
        const basePlacement = placement.custom ? placement : withCustomPlacement(placement);
        const inspect = viewerApiRef.current?.computeInspectCharmPlacement?.({
          ...entry,
          placement: basePlacement,
        }) || null;
        entry.placement = inspect
          ? { ...basePlacement, inspect: { ...inspect, custom: true }, custom: true }
          : basePlacement;
      }
      setCharm(entry);
      setStickerSlab(null);
      clearCharmPlacementMode();
      dismissCraftSearch();
      window.requestAnimationFrame(() => {
        placingCharmRef.current = false;
      });
    };

    const placeStickerSlab = (nextSlab, placement = null) => {
      if (placingSlabRef.current) return;
      const entry = normalizeStickerSlabEntry(nextSlab);
      if (!entry) return;
      placingSlabRef.current = true;
      if (placement) {
        const basePlacement = placement.custom ? placement : withCustomPlacement(placement);
        const inspect = viewerApiRef.current?.computeInspectCharmPlacement?.({
          ...entry,
          placement: basePlacement,
        }) || null;
        entry.placement = inspect
          ? { ...basePlacement, inspect: { ...inspect, custom: true }, custom: true }
          : basePlacement;
      }
      setStickerSlab(entry);
      setCharm(null);
      clearSlabPlacementMode();
      dismissCraftSearch();
      window.requestAnimationFrame(() => {
        placingSlabRef.current = false;
      });
    };

    const beginCharmPlacement = (entry, event = null) => {
      const normalized = normalizeCharmEntry(entry);
      if (!normalized) return;
      clearPendingSticker();
      clearPendingSlab();
      const pick = { entry: normalized, rotation: 0 };
      pendingCharmRef.current = pick;
      setPendingCharm(pick);
      // Match stickers: craft placement mode (cursor-follow via React handlers).
      viewerApiRef.current?.setCraftPlacementMode?.(true);
      viewerApiRef.current?.setCharmPlacementMode?.(false);
      const x = event?.clientX ?? cursorCharmPosRef.current?.x ?? window.innerWidth * 0.4;
      const y = event?.clientY ?? cursorCharmPosRef.current?.y ?? window.innerHeight * 0.45;
      setCursorCharmPos({ x, y });
      cursorCharmPosRef.current = { x, y };
      updatePendingCharmAt(x, y);
    };

    const beginSlabPlacement = (entry, event = null) => {
      const normalized = normalizeStickerSlabEntry(entry);
      if (!normalized) return;
      clearPendingSticker();
      clearPendingCharm();
      const pick = { entry: normalized, rotation: 0 };
      pendingSlabRef.current = pick;
      setPendingSlab(pick);
      viewerApiRef.current?.setCraftPlacementMode?.(true);
      viewerApiRef.current?.setStickerSlabPlacementMode?.(true);
      const x = event?.clientX ?? cursorSlabPosRef.current?.x;
      const y = event?.clientY ?? cursorSlabPosRef.current?.y;
      if (x != null && y != null) {
        setCursorSlabPos({ x, y });
        cursorSlabPosRef.current = { x, y };
        updatePendingSlabAt(x, y);
      }
    };

    const handleSlotDragOver = (event, slotIndex) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDragOverSlot(slotIndex);
    };

    const handleSlotDrop = (event, slotIndex) => {
      event.preventDefault();
      setDragOverSlot(null);
      const sticker = parseStickerPayload(event.dataTransfer.getData(STICKER_DRAG_TYPE));
      if (!sticker) return;
      const entry = normalizeStickerEntry(sticker);
      if (!entry) return;
      placeStickerInSlot(slotIndex, entry, null);
      dismissCraftSearch();
    };

    const pickCharmForPlacement = (entry, event) => {
      // Same on a phone: the tap attaches the charm at its default spot instead
      // of starting a cursor-follow placement.
      if (isPhoneCraft()) {
        const normalized = normalizeCharmEntry(entry);
        if (!normalized) return;
        // A null placement is fine — the charm then hangs at its default spot.
        const placement = withCustomPlacement(
          viewerApiRef.current?.resolvePresetPlacement?.("charm", 2, normalized)
        ) || null;
        placeCharm(normalized, placement);
        dismissCraftSearch();
        return;
      }
      beginCharmPlacement(entry, event);
      if (event?.clientX != null && event?.clientY != null) {
        updatePendingCharmAt(event.clientX, event.clientY);
      }
    };

    const clearCharm = (event) => {
      event?.stopPropagation();
      event?.preventDefault();
      setCharm(null);
      clearCharmPlacementMode();
    };

    const selectCharmForReposition = () => {
      if (!charm) {
        craftSearchInputRef.current?.focus();
        return;
      }
      clearPendingSticker();
      clearPendingSlab();
      const pick = { entry: charm, reposition: true };
      pendingCharmRef.current = pick;
      setPendingCharm(pick);
      viewerApiRef.current?.setCraftPlacementMode?.(true);
      viewerApiRef.current?.setCharmPlacementMode?.(false);
      const cursor = cursorCharmPosRef.current;
      if (cursor) {
        setCursorCharmPos(cursor);
        updatePendingCharmAt(cursor.x, cursor.y);
      }
    };

    const handleCharmDragStart = (event, nextCharm) => {
      const payload = serializeCharm(nextCharm);
      if (!payload) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData(CHARM_DRAG_TYPE, payload);
      event.dataTransfer.effectAllowed = "copyMove";
    };

    const handlePendantDragOver = (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDragOverPendant(true);
    };

    const handlePendantDrop = (event) => {
      event.preventDefault();
      setDragOverPendant(false);
      const nextCharm = parseCharmPayload(event.dataTransfer.getData(CHARM_DRAG_TYPE));
      if (nextCharm) {
        beginCharmPlacement(nextCharm);
        return;
      }
      const nextSlab = parseStickerSlabPayload(event.dataTransfer.getData(SLAB_DRAG_TYPE));
      if (nextSlab) {
        beginSlabPlacement(nextSlab);
      }
    };

    const selectPendantForReposition = () => {
      if (charm) {
        selectCharmForReposition();
        return;
      }
      if (stickerSlab) {
        selectStickerSlabForReposition();
        return;
      }
      craftSearchInputRef.current?.focus();
    };

    const clearPendant = (event) => {
      if (charm) {
        clearCharm(event);
        return;
      }
      if (stickerSlab) {
        clearStickerSlab(event);
      }
    };

    const handleCharmDragOver = (event) => {
      handlePendantDragOver(event);
    };

    const pickStickerSlabForPlacement = (entry, event) => {
      if (isPhoneCraft()) {
        const normalized = normalizeStickerSlabEntry(entry);
        if (!normalized) return;
        placeStickerSlab(normalized, null);
        dismissCraftSearch();
        return;
      }
      beginSlabPlacement(entry, event);
    };

    const clearStickerSlab = (event) => {
      event?.stopPropagation();
      event?.preventDefault();
      setStickerSlab(null);
      clearSlabPlacementMode();
    };

    const selectStickerSlabForReposition = () => {
      if (!stickerSlab) {
        craftSearchInputRef.current?.focus();
        return;
      }
      clearPendingSticker();
      clearPendingCharm();
      const pick = { entry: stickerSlab, reposition: true };
      pendingSlabRef.current = pick;
      setPendingSlab(pick);
      viewerApiRef.current?.setCraftPlacementMode?.(true);
      viewerApiRef.current?.setStickerSlabPlacementMode?.(true);
    };

    const handleSlabDragStart = (event, nextSlab) => {
      const payload = serializeStickerSlab(nextSlab);
      if (!payload) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData(SLAB_DRAG_TYPE, payload);
      event.dataTransfer.effectAllowed = "copyMove";
    };

    const loadStickerBrowser = () => {
      setStickerBrowserLoading(true);
      // Popular spotlight only — full tournament coverage comes from server ?q= search.
      fetch("get_crafter_sticker_catalog.php?limit=900", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          const rows = Array.isArray(payload?.items) ? payload.items : [];
          setStickerCatalog(rows);
          setStickerSpotlight(pickStickerSpotlight(rows, STICKER_BROWSER_SPOTLIGHT_MAX));
        })
        .catch(() => {
          setStickerCatalog([]);
          setStickerSpotlight([]);
        })
        .finally(() => setStickerBrowserLoading(false));
    };

    const loadPendantBrowser = () => {
      setPendantBrowserLoading(true);
      Promise.all([
        fetch("get_crafter_sticker_catalog.php?kind=pendants&limit=900", { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null)),
        loadCharmModelManifest(),
      ])
        .then(([payload, manifest]) => {
          const rows = Array.isArray(payload?.items) ? payload.items : [];
          const localCharms = collectManifestLocalCharms(manifest);
          // Catalog first so official Steam tiles (Hot Wurst, Lil' Boo, …) win over local renders.
          const merged = [...rows.map((row) => enrichCharmWithModelUrl(row, manifest)), ...localCharms];
          const seen = new Set();
          const enriched = [];
          merged.forEach((row) => {
            const key = String(row?.market_hash_name || "").trim().toLowerCase();
            if (!key || seen.has(key)) return;
            seen.add(key);
            enriched.push(row);
          });
          setPendantCatalog(enriched);
          const spotlight = pickPendantSpotlight(enriched, STICKER_BROWSER_SPOTLIGHT_MAX);
          const pinnedNames = new Set(localCharms.map((row) => String(row.market_hash_name || "").trim()));
          const pinned = enriched.filter((row) => pinnedNames.has(String(row.market_hash_name || "").trim()));
          setPendantSpotlight([
            ...pinned,
            ...spotlight.filter((row) => !pinnedNames.has(String(row.market_hash_name || "").trim())),
          ].slice(0, STICKER_BROWSER_SPOTLIGHT_MAX));
        })
        .catch(() => {
          setPendantCatalog([]);
          setPendantSpotlight([]);
        })
        .finally(() => setPendantBrowserLoading(false));
    };

    const handleCharmDrop = (event) => {
      handlePendantDrop(event);
    };

    const handleSlabDragOver = (event) => {
      handlePendantDragOver(event);
    };

    const handleSlabDrop = (event) => {
      handlePendantDrop(event);
    };

    useEffect(() => {
      let alive = true;
      setLibraryLoading(true);
      fetch("get_crafter_batch_library.php", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (!alive) return;
          const items = Array.isArray(payload?.items) ? payload.items : [];
          const libraryItems = shuffleLibraryOrder(
            items.filter((entry) => entry.craftable && resolveCraftViewerAssets(entry))
          );
          setLibrary(libraryItems);
          const launch = parseCrafterLaunchQuery();
          const preferredRaw = launch.skinName || DEFAULT_SKIN_NAME;
          const requested = findCrafterLibrarySkin(libraryItems, preferredRaw);
          const fallback = libraryItems.find((entry) => entry.craftable) || libraryItems[0] || null;
          if (requested) {
            selectSkinEntry(requested, {
              wear: launch.wear,
              syncUrl: Boolean(launch.skinName),
            });
          } else if (fallback) {
            selectSkinEntry(fallback, {
              wear: launch.skinName ? launch.wear : "",
              syncUrl: false,
            });
            if (launch.skinName) setLibraryQuery(launch.skinName);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (alive) setLibraryLoading(false);
        });
      return () => { alive = false; };
    }, []);

    useEffect(() => {
      if (!baseName) {
        setWearPrices({});
        return undefined;
      }
      setWearPrices({});
      const names = WEAR_OPTIONS.map((wear) => (
        viewer.buildWearMarketHashName?.(baseName, wear) || `${baseName} (${wear})`
      )).filter(Boolean);
      const controller = new AbortController();
      // Do NOT set steam_catalog_only: that forces cache-only after catalog seed,
      // so wears missing from roi_catalog (e.g. Wasteland Rebel FT) stay blank.
      // Catalog still seeds available wears; live Steam fills the rest.
      fetch("get_roi_prices_cached.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "steam",
          range: "30d",
          market_hash_names: names,
          allow_live_refresh: true,
          steam_listing_fallback: true,
          steam_listing_fallback_limit: names.length,
        }),
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          const records = Array.isArray(payload?.items)
            ? payload.items
            : (Array.isArray(payload?.cases) ? payload.cases : []);
          setWearPrices(mergeWearPrices(records, baseName));
        })
        .catch(() => undefined);
      return () => controller.abort();
    }, [baseName]);

    useEffect(() => {
      const wanted = [];
      const addName = (name) => {
        const label = String(name || "").trim();
        if (label) wanted.push(label);
      };
      const pendant = charm || stickerSlab;
      if (pendant) {
        const pendantName = String(pendant.market_hash_name || "").trim();
        if (isStickerSlabName(pendantName) || catalogEntryPrice(pendant) <= 0) {
          addName(pendantName);
        }
        if (catalogEntryPrice(pendant) <= 0) {
          addName(stickerNameFromSlabName(pendantName));
        }
      }
      stickers.forEach((sticker) => {
        if (!sticker || catalogEntryPrice(sticker) > 0) return;
        addName(sticker.market_hash_name);
        addName(stickerNameFromSlabName(sticker.market_hash_name));
      });
      const missing = Array.from(new Set(wanted)).filter((name) => (
        liveCraftPricesRef.current[name] == null
      ));
      if (!missing.length) return undefined;

      const controller = new AbortController();
      fetch("get_roi_prices_cached.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "steam",
          range: "30d",
          market_hash_names: missing,
          allow_live_refresh: true,
          steam_listing_fallback: true,
          steam_listing_fallback_limit: missing.length,
        }),
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          const records = Array.isArray(payload?.items)
            ? payload.items
            : (Array.isArray(payload?.cases) ? payload.cases : []);
          const next = { ...liveCraftPricesRef.current };
          records.forEach((record) => {
            const name = String(record?.market_hash_name || record?.name || "").trim();
            const price = liveMarketRecordPrice(record);
            if (name && Number.isFinite(price) && price > 0) {
              next[name] = price;
            }
          });
          missing.forEach((name) => {
            if (next[name] == null) next[name] = 0;
          });
          liveCraftPricesRef.current = next;
          setLiveCraftPrices(next);
        })
        .catch((error) => {
          if (error?.name === "AbortError") return;
          const next = { ...liveCraftPricesRef.current };
          missing.forEach((name) => {
            if (next[name] == null) next[name] = 0;
          });
          liveCraftPricesRef.current = next;
          setLiveCraftPrices(next);
        });

      return () => controller.abort();
    }, [charm, stickerSlab, stickers]);

    useEffect(() => {
      loadStickerBrowser();
      loadPendantBrowser();
    }, []);

    const autoCraftAppliedRef = useRef(false);
    useEffect(() => {
      if (autoCraftAppliedRef.current || !selectedSkin || viewerStatus !== "ready") return;
      const launch = parseCrafterLaunchQuery();
      if (!launch.charmName && !launch.stickerName) return;

      const container = viewerContainerRef.current;
      const raycastCraftPlacement = viewerApiRef.current?.raycastCraftPlacement;
      if (!container || typeof raycastCraftPlacement !== "function") return;
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      // A handful of default screen-space spots to try, roughly aimed at the
      // trigger guard / mag well area where a hanging charm naturally sits —
      // mimics a real pointer click instead of the geometric fallback anchor
      // (which can miss the mesh entirely and leave the charm floating).
      const CHARM_CANDIDATES = [
        { x: 0.46, y: 0.6 },
        { x: 0.5, y: 0.5 },
        { x: 0.4, y: 0.68 },
        { x: 0.55, y: 0.55 },
        { x: 0.5, y: 0.4 },
      ];
      // Default stickers land on the grip/handle rather than the slide.
      const STICKER_CANDIDATES = [
        { x: 0.78, y: 0.65 },
        { x: 0.8, y: 0.68 },
        { x: 0.75, y: 0.6 },
        { x: 0.82, y: 0.6 },
        { x: 0.72, y: 0.65 },
      ];
      const resolvePlacement = (kind, entry) => {
        const candidates = kind === "sticker" ? STICKER_CANDIDATES : CHARM_CANDIDATES;
        for (const point of candidates) {
          const clientX = rect.left + rect.width * point.x;
          const clientY = rect.top + rect.height * point.y;
          const placement = raycastCraftPlacement(clientX, clientY, kind, entry);
          if (placement) return placement;
        }
        return null;
      };

      const isCharm = Boolean(launch.charmName);
      const wantedName = isCharm ? launch.charmName : launch.stickerName;
      const localRows = isCharm ? pendantCatalog : stickerCatalog;
      if (!localRows.length) return;
      autoCraftAppliedRef.current = true;

      const apply = (match) => {
        if (!match) return;
        if (isCharm) {
          const placement = resolvePlacement("charm", match);
          placeCharm(match, placement ? withCustomPlacement(placement) : null);
        } else {
          const placement = resolvePlacement("sticker", match);
          placeStickerInSlot(0, match, placement ? withCustomPlacement(placement) : null);
        }
      };

      const localMatch = findCraftCatalogEntry(localRows, wantedName);
      if (localMatch) {
        apply(localMatch);
        return;
      }
      // The spotlight only carries the popular ~900 rows; tournament stickers
      // and the long tail live behind the server-side ?q= search.
      const query = new URLSearchParams({ q: wantedName, limit: "20" });
      if (isCharm) query.set("kind", "pendants");
      fetch(`get_crafter_sticker_catalog.php?${query.toString()}`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          const rows = Array.isArray(payload?.items) ? payload.items : [];
          const enriched = isCharm ? rows.map((row) => enrichCharmWithModelUrl(row)) : rows;
          apply(findCraftCatalogEntry(enriched, wantedName));
        })
        .catch(() => undefined);
    }, [pendantCatalog, stickerCatalog, selectedSkin, viewerStatus]);

    // Search the full sticker dump server-side (prebuilt catalog), not the 900-item spotlight.
    useEffect(() => {
      const q = craftQuery.trim();
      if (!q || craftBrowserMode !== "stickers") {
        setStickerSearchRows([]);
        setStickerSearchTotal(0);
        return undefined;
      }

      let alive = true;
      const controller = new AbortController();
      const timer = window.setTimeout(() => {
        setStickerBrowserLoading(true);
        const url = `get_crafter_sticker_catalog.php?q=${encodeURIComponent(q)}&limit=500`;
        fetch(url, { cache: "no-store", signal: controller.signal })
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) => {
            if (!alive) return;
            const rows = Array.isArray(payload?.items) ? payload.items : [];
            setStickerSearchRows(rows);
            setStickerSearchTotal(Number(payload?.total) || rows.length);
          })
          .catch((error) => {
            if (!alive || error?.name === "AbortError") return;
            setStickerSearchRows([]);
            setStickerSearchTotal(0);
          })
          .finally(() => {
            if (alive) setStickerBrowserLoading(false);
          });
      }, 180);

      return () => {
        alive = false;
        controller.abort();
        window.clearTimeout(timer);
      };
    }, [craftQuery, craftBrowserMode]);

    const hasPendingPlacement = Boolean(pendingSticker || pendingCharm || pendingSlab);

    useEffect(() => {
      if (!hasPendingPlacement) return undefined;

      const onPointerMove = (event) => {
        cursorCharmPosRef.current = { x: event.clientX, y: event.clientY };
        cursorSlabPosRef.current = { x: event.clientX, y: event.clientY };
        if (pendingStickerRef.current) updatePendingStickerAt(event.clientX, event.clientY);
        if (pendingCharmRef.current) updatePendingCharmAt(event.clientX, event.clientY);
        if (pendingSlabRef.current) updatePendingSlabAt(event.clientX, event.clientY);
      };
      const onKeyDown = (event) => {
        if (event.target?.matches?.("input, textarea, select, [contenteditable='true']")) return;

        if (event.key === "r" || event.key === "R") {
          if (!pendingStickerRef.current) return;
          event.preventDefault();
          const prev = pendingStickerRef.current;
          const next = {
            ...prev,
            rotation: normalizeStickerRotation((Number(prev.rotation) || 0) + STICKER_ROTATION_STEP),
          };
          pendingStickerRef.current = next;
          setPendingSticker(next);
          const cursor = cursorStickerPosRef.current;
          if (cursor) {
            pushStickerPreview(cursor.x, cursor.y);
          }
          return;
        }

        if (event.key !== "Escape") return;
        if (pendingStickerRef.current) clearPendingSticker();
        if (pendingCharmRef.current) clearPendingCharm();
        if (pendingSlabRef.current) clearPendingSlab();
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("keydown", onKeyDown);
      return () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("keydown", onKeyDown);
      };
    }, [hasPendingPlacement]);

    useEffect(() => {
      const container = viewerContainerRef.current;
      if (!container || !selectedSkin || !baseName || !modelAvailable) {
        if (!modelAvailable && selectedSkin) setViewerStatus("error");
        return undefined;
      }

      const api = viewer.mountSkinViewer?.(container, {
        itemTitle: baseName,
        skinModelUrl,
        baseModelUrl,
        skinModelMeta: selectedSkin,
        texturePack,
        forceRuntimeTextures: Boolean(craftAssets?.forceRuntimeTextures),
        wearFloat,
        visualType,
        stickers,
        charm,
        stickerSlab,
        onStatus: setViewerStatus,
        onCharmPlacement: ({ placement }) => {
          if (!placement) return;
          const pending = pendingCharmRef.current;
          if (pending?.entry) {
            placeCharm(pending.entry, withCustomPlacement(placement));
            return;
          }
          setCharm((prev) => (
            prev ? { ...prev, placement: withCustomPlacement(placement) } : prev
          ));
          clearPendingCharm();
        },
        onStickerSlabPlacement: ({ placement }) => {
          if (!placement) return;
          const pending = pendingSlabRef.current;
          if (pending?.entry) {
            placeStickerSlab(pending.entry, withCustomPlacement(placement));
            return;
          }
          setStickerSlab((prev) => (
            prev ? { ...prev, placement: withCustomPlacement(placement) } : prev
          ));
          clearPendingSlab();
        },
      });

      viewerApiRef.current = api;

      const layoutFrame = window.requestAnimationFrame(() => {
        api?.resize?.();
        window.setTimeout(() => api?.resize?.(), 120);
      });

      return () => {
        window.cancelAnimationFrame(layoutFrame);
        if (typeof api === "function") {
          api();
        } else if (api?.dispose) {
          api.dispose();
        }
        viewerApiRef.current = null;
      };
    }, [selectedSkin, baseName, skinModelUrl, baseModelUrl, texturePack, craftAssets, visualType, modelAvailable]);

    useEffect(() => {
      viewerApiRef.current?.updateWearFloat?.(wearFloat);
    }, [wearFloat]);

    useEffect(() => {
      if (viewerStatus !== "ready") return;
      viewerApiRef.current?.updateCraftAttachments?.(stickers, charm, stickerSlab);
    }, [stickers, charm, stickerSlab, viewerStatus]);

    return (
      <Layout>
        <div className="deals-shell crafter-shell">
          <div className={classNames("crafter-stage", selectedSkin && "is-ready")}>
            <div className="crafter-view-column">
            <section
              ref={canvasPanelRef}
              className={classNames(
                "crafter-canvas-panel",
                canvasDragOver && "is-sticker-drop",
                pendingSticker && "is-sticker-pick",
                pendingCharm && "is-charm-pick",
                pendingSlab && "is-slab-pick",
                stickerHoverValid && "is-sticker-hover",
                charmHoverValid && "is-charm-hover",
                slabHoverValid && "is-slab-hover"
              )}
              style={rarityStyle}
              onDragOver={handleCanvasDragOver}
              onDragLeave={() => setCanvasDragOver(false)}
              onDrop={handleCanvasDrop}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
            >
              <div className="viewer3d-canvas-grid" aria-hidden="true" />
              <div ref={viewerContainerRef} className="viewer3d-canvas-host" />
              {(libraryLoading || viewerStatus === "loading") ? (
                <div className="viewer3d-canvas-loader" aria-hidden="true">
                  <span className="tv-spinner" />
                  <span>Building skin…</span>
                </div>
              ) : null}
              {viewerStatus === "error" && selectedSkin?.image ? (
                <img
                  className={classNames(
                    "viewer3d-canvas-fallback-img",
                    /xm[\s-]?1014/i.test(String(selectedSkin.market_name || baseName || "")) && "xm-hide-shell"
                  )}
                  src={selectedSkin.image}
                  alt={baseName}
                />
              ) : null}
              {viewerStatus === "ready" && hasPendingPlacement ? (
                <div className="viewer3d-canvas-hint viewer3d-canvas-hint--placement" aria-hidden="true">
                  <i className={hasPendingPendant ? "fa-solid fa-gem" : "fa-solid fa-crosshairs"} />
                  {hasPendingPendant
                    ? "Move over the gun · Click to attach · Drag to rotate · Esc to cancel"
                    : "Hover the weapon to preview · Click to place · R to rotate · Esc to cancel"}
                </div>
              ) : null}
              {pendingSticker?.entry?.image && cursorStickerPos ? createPortal(
                <div
                  className={classNames(
                    "crafter-cursor-sticker",
                    stickerHoverValid && "is-over-weapon"
                  )}
                  style={{
                    left: `${cursorStickerPos.x}px`,
                    top: `${cursorStickerPos.y}px`,
                  }}
                >
                  <img
                    src={pendingSticker.entry.image}
                    alt=""
                    draggable={false}
                    style={{ transform: `rotate(${pendingSticker.rotation || 0}deg)` }}
                  />
                </div>,
                document.body
              ) : null}
              {pendingCharm?.entry?.image && cursorCharmPos ? createPortal(
                <div
                  className={classNames(
                    "crafter-cursor-sticker",
                    "crafter-cursor-charm",
                    charmHoverValid && "is-over-weapon"
                  )}
                  style={{
                    left: `${cursorCharmPos.x}px`,
                    top: `${cursorCharmPos.y}px`,
                  }}
                >
                  <img
                    src={pendingCharm.entry.image}
                    alt=""
                    draggable={false}
                  />
                </div>,
                document.body
              ) : null}
              {pendingSlab?.entry?.image && cursorSlabPos ? createPortal(
                <div
                  className={classNames(
                    "crafter-cursor-sticker",
                    "crafter-cursor-slab",
                    slabHoverValid && "is-over-weapon"
                  )}
                  style={{
                    left: `${cursorSlabPos.x}px`,
                    top: `${cursorSlabPos.y}px`,
                  }}
                >
                  <img
                    src={pendingSlab.entry.image}
                    alt=""
                    draggable={false}
                  />
                </div>,
                document.body
              ) : null}
            </section>

            {selectedSkin ? (
              <div className="crafter-library-bar crafter-skin-picker">
                <input
                  type="text"
                  className="crafter-library-search"
                  value={libraryQuery}
                  onChange={(event) => setLibraryQuery(event.target.value)}
                  placeholder="Search skins…"
                  spellCheck={false}
                />
                <div className={classNames("crafter-library-grid", skinSearchActive && "is-expanded")}>
                  {displaySkinLibrary.map((entry) => (
                    <button
                      key={entry.market_name}
                      type="button"
                      className={classNames(
                        "crafter-library-item",
                        /xm[\s-]?1014/i.test(String(entry.market_name || "")) && "xm-hide-shell",
                        selectedSkin?.market_name === entry.market_name && "active",
                        !entry.craftable && "disabled"
                      )}
                      style={viewer.buildSkinViewerRarityStyle?.(entry.name_color || "4b69ff") || undefined}
                      onClick={() => selectSkinEntry(entry)}
                      title={entry.market_name}
                    >
                      {entry.image ? (
                        <img
                          src={entry.image}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={(event) => handleLibraryImageError(event, entry)}
                          onLoad={handleLibraryImageLoad}
                        />
                      ) : (
                        <i className="fa-solid fa-cube" />
                      )}
                      <span>{String(entry.market_name || "").split("|").pop()?.trim()}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            </div>

            <aside className="crafter-panel tv-skin-panel">
              {selectedSkin ? (
                <>
                  <div className="crafter-panel-head" style={rarityStyle}>
                    <div className="crafter-panel-title">
                      <span className="crafter-panel-kicker">Skin Crafter</span>
                      <h2>{baseName}</h2>
                    </div>
                  </div>

                  <div className="crafter-panel-body">
                  <div className={classNames("crafter-mode-flip-stage crafter-mode-flip-stage--slots", isCharmMode && "is-charm-mode")}>
                    <div className="crafter-mode-flip-stage__inner">
                      <div
                        className="crafter-mode-flip-stage__face crafter-mode-flip-stage__face--stickers"
                        aria-hidden={isCharmMode}
                      >
                        <div className="crafter-section">
                          <div className="crafter-section-head">
                            <span>Stickers</span>
                            <span className="viewer3d-stickers-note">click slot to move</span>
                          </div>
                          <div className="viewer3d-sticker-slots">
                            {stickers.map((sticker, slot) => (
                              <div
                                key={slot}
                                className={classNames(
                                  "viewer3d-sticker-slot",
                                  dragOverSlot === slot && "drag-over",
                                  sticker && "filled",
                                  pendingSticker?.slotIndex === slot && "is-pending-target",
                                  pendingSticker?.slotIndex === slot && sticker && "active"
                                )}
                                onClick={() => selectStickerSlot(slot)}
                                onDragOver={(event) => handleSlotDragOver(event, slot)}
                                onDragLeave={() => setDragOverSlot(null)}
                                onDrop={(event) => handleSlotDrop(event, slot)}
                                title={sticker ? String(sticker.display_name || sticker.market_hash_name) : `Sticker slot ${slot + 1}`}
                              >
                                {sticker?.image ? (
                                  <>
                                    <img
                                      src={sticker.image}
                                      alt=""
                                      draggable
                                      style={stickerWearStyle(sticker.wear)}
                                      className="crafter-sticker-slot-img"
                                      onDragStart={(event) => handleStickerDragStart(event, sticker)}
                                    />
                                    <button
                                      type="button"
                                      className="crafter-sticker-clear"
                                      onClick={(event) => clearStickerSlot(slot, event)}
                                      aria-label="Remove sticker"
                                    >
                                      <i className="fa-solid fa-xmark" />
                                    </button>
                                  </>
                                ) : (
                                  <i className="fa-solid fa-plus" aria-hidden="true" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div
                        className="crafter-mode-flip-stage__face crafter-mode-flip-stage__face--charms"
                        aria-hidden={!isCharmMode}
                      >
                        <div className="crafter-section">
                          <div className="crafter-section-head">
                            <span>Charms</span>
                            <span className="viewer3d-stickers-note">click slot to move</span>
                          </div>
                          <div className="crafter-pendant-slots">
                            <div
                              className={classNames(
                                "viewer3d-sticker-slot crafter-charm-slot crafter-pendant-slot",
                                dragOverPendant && "drag-over",
                                pendantSlotItem && "filled",
                                hasPendingPendant && "is-pending-target",
                                hasPendingPendant && pendantSlotItem && "active"
                              )}
                              onClick={selectPendantForReposition}
                              onDragOver={handlePendantDragOver}
                              onDragLeave={() => setDragOverPendant(false)}
                              onDrop={handlePendantDrop}
                              title={pendantSlotItem
                                ? String(pendantSlotItem.display_name || pendantSlotItem.market_hash_name)
                                : "Charm or slab slot"}
                            >
                              {pendantSlotItem?.image ? (
                                <>
                                  <img
                                    src={pendantSlotItem.image}
                                    alt=""
                                    draggable
                                    className="crafter-sticker-slot-img"
                                    onDragStart={(event) => {
                                      if (charm) handleCharmDragStart(event, charm);
                                      else if (stickerSlab) handleSlabDragStart(event, stickerSlab);
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="crafter-sticker-clear"
                                    onClick={clearPendant}
                                    aria-label={charm ? "Remove charm" : "Remove sticker slab"}
                                  >
                                    <i className="fa-solid fa-xmark" />
                                  </button>
                                </>
                              ) : (
                                <i className="fa-solid fa-plus" aria-hidden="true" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="crafter-inspect-wrap">
                    <button
                      type="button"
                      className={classNames("crafter-inspect-btn", inspectLoading && "loading")}
                      onClick={openCraftInGame}
                      disabled={!canInspectInGame || inspectLoading}
                      title={canInspectInGame
                        ? "View in Game"
                        : "Load a skin in the crafter first"}
                    >
                      <i className="fa-solid fa-gamepad" aria-hidden="true" />
                      <span>view in game</span>
                    </button>
                    {inspectError ? (
                      <p className="crafter-inspect-error" role="alert">{inspectError}</p>
                    ) : null}
                  </div>

                  <div className={classNames("crafter-section crafter-sticker-library", isCharmMode && "is-charm-mode")}>
                    <div className="crafter-section-head crafter-mode-head">
                      <div className="crafter-mode-tabs" role="tablist" aria-label="Browse stickers or charms">
                        <button
                          type="button"
                          role="tab"
                          className={classNames("crafter-mode-tab", !isCharmMode && "is-active")}
                          aria-selected={!isCharmMode}
                          onClick={() => isCharmMode && toggleCraftBrowserMode()}
                        >
                          Stickers
                        </button>
                        <button
                          type="button"
                          role="tab"
                          className={classNames("crafter-mode-tab", isCharmMode && "is-active")}
                          aria-selected={isCharmMode}
                          onClick={() => !isCharmMode && toggleCraftBrowserMode()}
                        >
                          Charms
                        </button>
                      </div>
                      <div className="crafter-mode-head__actions">
                        {browserLoading ? (
                          <span className="viewer3d-stickers-note">Loading…</span>
                        ) : browserSearchActive ? (
                          <span className="viewer3d-stickers-note">
                            {browserCapped
                              ? `${browserDisplayCount} of ${browserTotal}`
                              : `${browserDisplayCount} shown`}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="crafter-random-btn"
                            onClick={shuffleBrowserSpotlight}
                            title={isCharmMode ? "Shuffle random charms" : "Shuffle random stickers"}
                          >
                            <i className="fa-solid fa-shuffle" aria-hidden="true" />
                            <span>{browserDisplayCount} random</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="crafter-sticker-library-shell">
                      <input
                        ref={craftSearchInputRef}
                        type="text"
                        className="crafter-sticker-search-input"
                        value={craftQuery}
                        onChange={(event) => setCraftQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            dismissCraftSearch();
                          }
                        }}
                        placeholder={isCharmMode ? "Search charms & slabs…" : "Search stickers…"}
                        spellCheck={false}
                      />

                      <div className="crafter-sticker-browser-wrap">
                        <div className={classNames("crafter-mode-browser-stage", isCharmMode && "is-charm-mode")}>
                          <div
                            className={classNames(
                              "crafter-sticker-browser crafter-mode-browser-face",
                              !isCharmMode && "is-active"
                            )}
                            aria-label="Sticker browser"
                            aria-hidden={isCharmMode}
                          >
                            {stickerBrowserLoading ? (
                              Array.from({ length: spotlightCount }).map((_, index) => (
                                <div key={`sticker-browser-skel-${index}`} className="crafter-sticker-browser-card is-skeleton" aria-hidden="true" />
                              ))
                            ) : null}
                            {!stickerBrowserLoading && !displayStickerCatalog.length ? (
                              <div className="crafter-sticker-empty">No stickers found.</div>
                            ) : null}
                            {!stickerBrowserLoading && displayStickerCatalog.map((sticker) => (
                              <button
                                key={String(sticker.market_hash_name || sticker.display_name)}
                                type="button"
                                className={classNames(
                                  "crafter-sticker-browser-card",
                                  pendingSticker?.entry?.market_hash_name === sticker.market_hash_name && "is-picked"
                                )}
                                draggable
                                onDragStart={(event) => handleStickerDragStart(event, sticker)}
                                onClick={(event) => pickStickerForPlacement(sticker, event)}
                                title={String(sticker.display_name || sticker.market_hash_name || "")}
                              >
                                {sticker.image ? (
                                  <img src={sticker.image} alt="" draggable={false} />
                                ) : null}
                              </button>
                            ))}
                          </div>
                          <div
                            className={classNames(
                              "crafter-sticker-browser crafter-mode-browser-face crafter-mode-browser-face--charms",
                              isCharmMode && "is-active"
                            )}
                            aria-label="Charm browser"
                            aria-hidden={!isCharmMode}
                          >
                            {pendantBrowserLoading ? (
                              Array.from({ length: spotlightCount }).map((_, index) => (
                                <div key={`pendant-browser-skel-${index}`} className="crafter-sticker-browser-card is-skeleton" aria-hidden="true" />
                              ))
                            ) : null}
                            {!pendantBrowserLoading && !displayPendantCatalog.length ? (
                              <div className="crafter-sticker-empty">No charms or slabs found.</div>
                            ) : null}
                            {!pendantBrowserLoading && displayPendantCatalog.map((row) => {
                              const classified = classifyCraftSearchRow(row);
                              if (!classified) return null;
                              const isCharm = classified.kind === "charm";
                              const isSlab = classified.kind === "slab";
                              const isPicked = isCharm
                                ? pendingCharm?.entry?.market_hash_name === row.market_hash_name
                                : isSlab
                                  ? pendingSlab?.entry?.market_hash_name === row.market_hash_name
                                  : false;
                              return (
                                <button
                                  key={String(row.market_hash_name || row.display_name)}
                                  type="button"
                                  className={classNames(
                                    "crafter-sticker-browser-card",
                                    isPicked && "is-picked",
                                    isCharm && "kind-charm",
                                    isSlab && "kind-slab"
                                  )}
                                  draggable
                                  onDragStart={(event) => {
                                    if (isCharm) handleCharmDragStart(event, row);
                                    else if (isSlab) handleSlabDragStart(event, row);
                                  }}
                                  onClick={(event) => {
                                    if (isCharm) pickCharmForPlacement(classified.row, event);
                                    else if (isSlab) pickStickerSlabForPlacement(classified.row, event);
                                  }}
                                  title={String(row.display_name || row.market_hash_name || "")}
                                >
                                  {row.image ? (
                                    <img src={row.image} alt="" draggable={false} />
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>

                  <div className="crafter-panel-foot">
                    <div className="crafter-cost crafter-cost--compact">
                      <div className="crafter-cost-head">
                        <span>Craft cost</span>
                        <strong>{formatPrice(craftCost.total)}</strong>
                      </div>
                      <div className="crafter-cost-rows">
                        <div>
                          <span>Skin ({WEAR_SHORT[selectedWear]})</span>
                          <span>{formatPrice(craftCost.skinCost)}</span>
                        </div>
                        <div>
                          <span>Charms ({craftCost.charmCount})</span>
                          <span>{formatPrice(craftCost.charmTotal)}</span>
                        </div>
                        <div>
                          <span>Stickers ({stickers.filter(Boolean).length})</span>
                          <span>{formatPrice(craftCost.stickerTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="viewer3d-skeleton" aria-hidden="true">
                  <span className="viewer3d-skeleton-line wide" />
                  <span className="viewer3d-skeleton-line" />
                  <span className="viewer3d-skeleton-block" />
                </div>
              )}
            </aside>
          </div>
        </div>
      </Layout>
    );
  }

  mountPage(<SkinCrafterPage />);
})();
