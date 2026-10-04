(() => {
  const { useState, useEffect, useMemo, useRef } = React;

  // Same catalog that powers market / item images site-wide.
  // Served gzipped + cacheable by catalog_json.php (the raw file is 28 MB).
  const CATALOG_URL = "catalog_json.php?v=20260917-gz-1";

  const WEAPON_CATEGORIES = new Set(["skins", "knives", "gloves"]);

  // Same Steam name_color → rarity mapping used site-wide (search, capsules, etc.).
  const RARITY_HEX_BY_SLUG = {
    consumer: "B0C3D9",
    industrial: "5E98D9",
    milspec: "4B69FF",
    restricted: "8847FF",
    classified: "D32CE6",
    covert: "EB4B4B",
    extraordinary: "E4AE39",
    contraband: "E4AE39",
  };

  const RARITY_SLUG_BY_HEX = {
    B0C3D9: "consumer",
    "5E98D9": "industrial",
    "4B69FF": "milspec",
    "8847FF": "restricted",
    D32CE6: "classified",
    EB4B4B: "covert",
    E4AE39: "extraordinary",
  };

  // Tiny offline seed so the first paint isn’t empty if the catalog is slow.
  // Replaced immediately once the shuffled catalog pool is ready.
  const FALLBACK_SKINS = [
    {
      name: "Desert Eagle | Code Red",
      market_hash_name: "Desert Eagle | Code Red (Factory New)",
      image: "assets/steam-market-cache/desert-eagle-code-red--25c2c0760b.png",
      name_color: "EB4B4B",
      rarity: "covert",
    },
    {
      name: "AK-47 | Redline",
      market_hash_name: "AK-47 | Redline (Field-Tested)",
      image:
        "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwlcK3wiFO0POlPPNSI_-RHGavzedxuPUnFniykEtzsWWBzoyuIiifaAchDZUjTOZe4RC_w4buM-6z7wzbgokUyzK-0H08hRGDMA",
      name_color: "D32CE6",
      rarity: "classified",
    },
    {
      name: "AWP | Redline",
      market_hash_name: "AWP | Redline (Field-Tested)",
      image:
        "https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyLwiYbf_jdk7uW-V6diIuKSMWuZxuZi_rUxHS3lzUwm5DjWy976dSiRagd1WJB1RLQP4RK-mtazM-3itQeL2INbjXKpw2eVIZ0",
      name_color: "D32CE6",
      rarity: "classified",
    },
  ];

  const HOLD_MS = 2800;
  const FADE_MS = 380;
  const PLACEHOLDER_IMAGES = new Set([
    "assets/markets/steam.png",
    "assets/markets/steam.webp",
  ]);

  function prefersReducedMotion() {
    try {
      return Boolean(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch (_) {
      return false;
    }
  }

  function stripWear(name) {
    return String(name || "")
      .replace(
        /\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i,
        ""
      )
      .trim();
  }

  function skinKey(skin) {
    return String(skin?.market_hash_name || skin?.name || "").trim();
  }

  // Reject empty, placeholder, and non-image-looking paths before they enter the pool.
  function isResolvableImageUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return false;
    if (/^(null|undefined|#)$/i.test(raw)) return false;

    const normalized = raw.replace(/^\//, "");
    if (PLACEHOLDER_IMAGES.has(normalized)) return false;
    if (/\/(null|undefined|placeholder)(\.|\/|\?|$)/i.test(normalized)) {
      return false;
    }

    if (/^https?:\/\//i.test(raw)) {
      // Remote: must have a non-empty path beyond the origin.
      try {
        const parsed = new URL(raw);
        if (!parsed.pathname || parsed.pathname === "/") return false;
        return true;
      } catch (_) {
        return false;
      }
    }

    // Local: image extension, or a real assets/ cache path (not market icons).
    if (/\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(normalized)) return true;
    if (
      /^assets\/steam-market-cache\//i.test(normalized) &&
      normalized.length > 28
    ) {
      return true;
    }
    return false;
  }

  function catalogImageSource(entry) {
    const steam = String(entry?.steam_image_url || "").trim();
    if (isResolvableImageUrl(steam)) return steam;

    const remote = String(entry?.image || "").trim();
    if (isResolvableImageUrl(remote) && /^https?:\/\//i.test(remote)) {
      return remote;
    }

    const local = String(entry?.local_path || entry?.image || "").trim();
    if (isResolvableImageUrl(local)) return local;
    return "";
  }

  function shuffleInPlace(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function normalizeRaritySlug(raw) {
    const key = String(raw || "")
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
    if (!key) return "";
    if (key === "consumergrade" || key === "basegrade" || key === "consumer") {
      return "consumer";
    }
    if (key === "industrialgrade" || key === "industrial") return "industrial";
    if (
      key === "milspecgrade" ||
      key === "milspec" ||
      key === "highgrade"
    ) {
      return "milspec";
    }
    if (key === "restricted") return "restricted";
    if (key === "classified") return "classified";
    if (key === "covert") return "covert";
    if (key === "contraband") return "contraband";
    if (key === "extraordinary" || key === "gold") return "extraordinary";
    if (RARITY_HEX_BY_SLUG[key]) return key;
    return "";
  }

  // Prefer catalog rarity slug when present; otherwise map Steam name_color.
  function resolveShowcaseRarity(skin) {
    const fromSlug = normalizeRaritySlug(skin?.rarity);
    if (fromSlug && RARITY_HEX_BY_SLUG[fromSlug]) {
      return {
        slug: fromSlug === "contraband" ? "contraband" : fromSlug,
        hex: RARITY_HEX_BY_SLUG[fromSlug],
      };
    }

    const hex = String(skin?.name_color || "B0C3D9")
      .replace(/^#/, "")
      .toUpperCase();
    const slug = RARITY_SLUG_BY_HEX[hex] || "consumer";
    return {
      slug,
      hex: RARITY_HEX_BY_SLUG[slug] || hex || RARITY_HEX_BY_SLUG.consumer,
    };
  }

  // Single pass over ~30k catalog rows → slim shuffled showcase pool.
  // Dedupe by wear-stripped name so FN/MW/FT of the same skin don’t cluster.
  function buildShowcasePool(items) {
    const seen = new Set();
    const pool = [];

    for (let i = 0; i < items.length; i += 1) {
      const entry = items[i];
      if (!WEAPON_CATEGORIES.has(String(entry?.category || ""))) continue;

      const image = catalogImageSource(entry);
      if (!image) continue;

      const marketHashName = String(entry?.market_hash_name || "").trim();
      const displayName = String(
        entry?.display_name || stripWear(marketHashName)
      ).trim();
      if (!displayName && !marketHashName) continue;

      const key = stripWear(marketHashName || displayName).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const nameColor = String(entry?.name_color || "B0C3D9").replace(/^#/, "");
      const rarity =
        normalizeRaritySlug(entry?.rarity) ||
        RARITY_SLUG_BY_HEX[nameColor.toUpperCase()] ||
        "consumer";

      pool.push({
        name: displayName || stripWear(marketHashName),
        market_hash_name: marketHashName || displayName,
        image,
        name_color: nameColor,
        rarity,
        type_note: String(entry?.type_note || ""),
        category: String(entry?.category_label || entry?.category || ""),
        type_filter: String(entry?.type_filter || entry?.category || ""),
        selected_wear: String(entry?.selected_wear || ""),
      });
    }

    return shuffleInPlace(pool);
  }

  // Resolves true on load, false on error / empty src.
  function preloadImage(src) {
    return new Promise((resolve) => {
      if (!src || !isResolvableImageUrl(src)) {
        resolve(false);
        return;
      }
      const img = new Image();
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.decoding = "async";
      img.src = src;
      if (img.complete && img.naturalWidth > 0) finish(true);
    });
  }

  // Same item_page query pattern as featured / search links site-wide.
  function buildShowcaseItemHref(skin) {
    const name = String(skin?.name || "").trim();
    if (!name) return "item_page.php";
    const marketHashName = String(skin?.market_hash_name || name).trim();
    const params = new URLSearchParams({
      lookup_name: marketHashName,
      display_name: name,
      market_hash_name: marketHashName,
      image: String(skin?.image || ""),
      market_url:
        "https://steamcommunity.com/market/listings/730/" +
        encodeURIComponent(marketHashName),
      type: String(skin?.type_note || ""),
      category: String(skin?.category || ""),
      type_filter: String(skin?.type_filter || ""),
      color: String(skin?.name_color || "B0C3D9"),
    });
    if (
      skin?.selected_wear ||
      /\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i.test(
        marketHashName
      )
    ) {
      params.set("selected_wear", "Factory New");
    }
    return "item_page.php?" + params.toString();
  }

  function InfoSkinShowcase() {
    const reduced = useMemo(() => prefersReducedMotion(), []);
    const [skins, setSkins] = useState(() =>
      shuffleInPlace(FALLBACK_SKINS.slice())
    );
    const [index, setIndex] = useState(0);
    const [visible, setVisible] = useState(true);
    // Hide <img> until onLoad so a broken icon never flashes before onError.
    const [imgReady, setImgReady] = useState(false);
    const skinsRef = useRef(skins);
    const indexRef = useRef(index);
    const failedUrlsRef = useRef(new Set());
    skinsRef.current = skins;
    indexRef.current = index;

    // Drop a bad skin from the pool. If dropCurrent, keep index so the next
    // entry slides into place (never leave a broken <img> on screen).
    function removeBadSkin(bad, { dropCurrent = false } = {}) {
      if (!bad) return;
      const key = skinKey(bad);
      const image = String(bad.image || "").trim();
      if (image) failedUrlsRef.current.add(image);

      const prev = skinsRef.current;
      const filtered = prev.filter((s) => {
        if (key && skinKey(s) === key) return false;
        if (image && s.image === image) return false;
        if (image && failedUrlsRef.current.has(s.image)) return false;
        return true;
      });
      const nextPool = filtered.length
        ? filtered
        : shuffleInPlace(
            FALLBACK_SKINS.filter(
              (s) => !failedUrlsRef.current.has(String(s.image || ""))
            ).slice()
          );
      // Absolute last resort: keep fallbacks even if marked failed so UI lives.
      const pool =
        nextPool.length > 0
          ? nextPool
          : shuffleInPlace(FALLBACK_SKINS.slice());

      skinsRef.current = pool;
      setSkins(pool);

      if (dropCurrent) {
        setIndex((i) => (pool.length <= 1 ? 0 : i % pool.length));
        setVisible(true);
      } else {
        // Removed a future entry; clamp index if pool shrank past it.
        setIndex((i) => (pool.length <= 1 ? 0 : Math.min(i, pool.length - 1)));
      }
    }

    useEffect(() => {
      let cancelled = false;
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;

      fetch(CATALOG_URL, {
        cache: "force-cache",
        signal: ctrl?.signal,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Catalog request failed (${response.status})`);
          }
          return response.json();
        })
        .then((payload) => {
          if (cancelled) return;
          const items = Array.isArray(payload?.items) ? payload.items : [];
          const pool = buildShowcasePool(items).filter(
            (s) => !failedUrlsRef.current.has(String(s.image || ""))
          );
          if (!pool.length) return;
          setSkins(pool);
          setIndex(0);
          setVisible(true);
        })
        .catch(() => {
          // Keep shuffled fallback pool on network / parse failure.
        });

      return () => {
        cancelled = true;
        try {
          ctrl?.abort();
        } catch (_) {
          /* ignore */
        }
      };
    }, []);

    const len = skins.length || 1;
    const skin = skins[index % len] || skins[0] || FALLBACK_SKINS[0];
    const nextSkin = skins[(index + 1) % len] || skin;
    const href = useMemo(() => buildShowcaseItemHref(skin), [skin]);
    const rarity = useMemo(() => resolveShowcaseRarity(skin), [skin]);

    // Preload the upcoming skin; if it fails, drop it before it is shown.
    useEffect(() => {
      let cancelled = false;
      const candidate = nextSkin;
      const src = candidate?.image;
      if (!src || candidate === skin) return undefined;

      preloadImage(src).then((ok) => {
        if (cancelled || ok) return;
        removeBadSkin(candidate, { dropCurrent: false });
      });

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check when next image changes
    }, [nextSkin?.image, skin?.image]);

    // Hold ~2.8s while breathing, then fade to next skin
    useEffect(() => {
      if (!visible) return undefined;
      const holdId = window.setTimeout(() => setVisible(false), HOLD_MS);
      return () => window.clearTimeout(holdId);
    }, [index, visible, skins]);

    // After fade-out, advance through the shuffled pool (no immediate repeat
    // while length > 1). Re-shuffle after a full pass so long sessions stay fresh.
    // Skip any entry whose image already failed preload / onError.
    useEffect(() => {
      if (visible) return undefined;
      const swapId = window.setTimeout(() => {
        const pool = skinsRef.current;
        const n = pool.length;
        if (n <= 1) {
          setIndex(0);
          setVisible(true);
          return;
        }

        let next = indexRef.current + 1;
        let wrapped = false;
        if (next >= n) {
          wrapped = true;
          next = 0;
        }

        // Walk forward past known-bad URLs (preload may still be in flight).
        let guard = 0;
        while (
          guard < n &&
          failedUrlsRef.current.has(String(pool[next]?.image || ""))
        ) {
          next += 1;
          guard += 1;
          if (next >= n) {
            wrapped = true;
            next = 0;
          }
        }

        if (wrapped) {
          setSkins((prev) => shuffleInPlace(prev.slice()));
        }
        setIndex(next);
        setVisible(true);
      }, FADE_MS);
      return () => window.clearTimeout(swapId);
    }, [visible]);

    function handleImageError() {
      setImgReady(false);
      // Never leave the broken-image icon visible — drop and show next.
      removeBadSkin(skin, { dropCurrent: true });
    }

    function handleImageLoad() {
      setImgReady(true);
    }

    // Reset readiness whenever the displayed skin changes.
    useEffect(() => {
      setImgReady(false);
    }, [skin.image, skin.market_hash_name]);

    return (
      <aside
        className="info-showcase"
        aria-label="Featured skin showcase"
        data-rarity={rarity.slug}
        style={{ "--showcase-glow": `#${rarity.hex}` }}
      >
        <div className="info-showcase-glow" aria-hidden="true" />
        <div className="info-showcase-texture" aria-hidden="true" />
        <div className={`info-showcase-fade${visible ? " is-in" : " is-out"}`}>
          <div className="info-showcase-stage">
            <a
              className="info-showcase-link"
              href={href}
              aria-label={`View ${skin.name} item page`}
            >
              <img
                key={skin.market_hash_name || skin.name}
                className={`info-showcase-skin${reduced ? "" : " is-breathing"}`}
                src={skin.image}
                alt={skin.name}
                draggable="false"
                loading="eager"
                decoding="async"
                onLoad={handleImageLoad}
                onError={handleImageError}
                style={imgReady ? undefined : { opacity: 0 }}
              />
            </a>
          </div>
          <div className="info-showcase-caption">{skin.name}</div>
        </div>
      </aside>
    );
  }

  window.CS2React = Object.assign({}, window.CS2React || {}, {
    InfoSkinShowcase,
  });
})();
