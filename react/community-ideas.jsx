/* Community Ideas: the item page's social section (posts, comments, reactions,
   image / GIF attachments) as a standalone component, so the TF2 item page
   carries the same feature as the CS2 one (user, 2026-10-03). The code is
   extracted from react/item-page.tsx by scratchpad/extract_social.php — edit
   the source there and re-run, do not hand-edit the generated parts. */
(function () {
  const { useState, useEffect, useRef } = React;
  const { useI18n } = window.CS2React || {};
  const PAGE_QUERY = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const ITEM_PAGE_AUTH_FLAG = String(PAGE_QUERY.get("auth") || "").toLowerCase();
  // Set per mount from the props, read by initialSocialIdeaDraft() below.
  let QUERY_ITEM_ID = 0;
  let QUERY_MARKET_HASH_NAME = "";
  let QUERY_LOOKUP_NAME = "";
  function socialAvatarUrl(author) {
    const seed = String(author || "steam-user").trim() || "steam-user";
    return "https://api.dicebear.com/7.x/thumbs/svg?seed=" + encodeURIComponent(seed);
  }

  function socialStorageKey(itemId) {
    return `cs2_social_v1_${itemId}`;
  }

  function socialReactionsKey(itemId) {
    return `cs2_social_reactions_v1_${itemId}`;
  }

  function socialReactionCountsKey(itemId) {
    return `cs2_social_counts_v1_${itemId}`;
  }

  function socialProfileKey() {
    return "cs2_social_profile_v1";
  }

  const SOCIAL_IDEA_DRAFT_PREFIX = "cs2_idea_draft_v1_";

  function socialIdeaDraftStorageKeys(itemId, marketHash) {
    const keys = [];
    const hash = String(marketHash || QUERY_MARKET_HASH_NAME || QUERY_LOOKUP_NAME || "").trim().toLowerCase();
    if (hash) keys.push(SOCIAL_IDEA_DRAFT_PREFIX + "name_" + hash);
    const id = Number(itemId);
    if (Number.isFinite(id) && id > 0) keys.push(SOCIAL_IDEA_DRAFT_PREFIX + "id_" + id);
    if (!keys.length) keys.push(SOCIAL_IDEA_DRAFT_PREFIX + "id_1");
    return keys;
  }

  function normalizeSocialIdeaDraft(raw) {
    if (!raw || typeof raw !== "object") return null;
    const sentiment = raw.sentiment === "bullish" || raw.sentiment === "bearish" ? raw.sentiment : null;
    return {
      text: String(raw.text || ""),
      sentiment,
      target: String(raw.target || ""),
      giphyUrl: String(raw.giphyUrl || raw.giphy_url || ""),
      publishAfterLogin: Boolean(raw.publishAfterLogin),
      savedAt: Number(raw.savedAt) || Date.now(),
    };
  }

  function socialIdeaDraftHasContent(draft) {
    if (!draft) return false;
    return Boolean(
      String(draft.text || "").trim()
      || String(draft.giphyUrl || "").trim()
      || String(draft.target || "").trim()
      || draft.sentiment
    );
  }

  function persistSocialIdeaDraft(itemId, marketHash, draft) {
    const normalized = normalizeSocialIdeaDraft(draft);
    if (!normalized) return;
    const payload = JSON.stringify(normalized);
    socialIdeaDraftStorageKeys(itemId, marketHash).forEach(function(key) {
      try { sessionStorage.setItem(key, payload); } catch (_e) {}
      try { localStorage.setItem(key, payload); } catch (_e) {}
    });
  }

  function loadSocialIdeaDraft(itemId, marketHash) {
    const stores = [];
    try { stores.push(sessionStorage); } catch (_e) {}
    try { stores.push(localStorage); } catch (_e) {}
    const keys = socialIdeaDraftStorageKeys(itemId, marketHash);
    for (let i = 0; i < keys.length; i += 1) {
      for (let s = 0; s < stores.length; s += 1) {
        try {
          const raw = stores[s].getItem(keys[i]);
          if (!raw) continue;
          const parsed = normalizeSocialIdeaDraft(JSON.parse(raw));
          if (parsed) return parsed;
        } catch (_e) {}
      }
    }
    return null;
  }

  function clearSocialIdeaDraft(itemId, marketHash) {
    const keys = socialIdeaDraftStorageKeys(itemId, marketHash);
    keys.forEach(function(key) {
      try { sessionStorage.removeItem(key); } catch (_e) {}
      try { localStorage.removeItem(key); } catch (_e) {}
    });
  }

  function initialSocialIdeaDraft() {
    return loadSocialIdeaDraft(
      Number.isFinite(QUERY_ITEM_ID) && QUERY_ITEM_ID > 0 ? QUERY_ITEM_ID : 1,
      QUERY_MARKET_HASH_NAME || QUERY_LOOKUP_NAME
    );
  }

  function socialSessionActorId(session) {
    if (!session) return "";
    const steamId = String(session.steamid || session.steam_id || "").replace(/\D+/g, "");
    if (steamId.length >= 17) return steamId.slice(0, 32);
    const provider = String(session.provider || "").toLowerCase();
    const providerId = String(session.provider_id || session.email || "").replace(/[^a-zA-Z0-9_\-]/g, "");
    if (provider && providerId) return (provider.charAt(0) + providerId).slice(0, 32);
    return steamId;
  }

  function loadSocialProfile() {
    try {
      const stored = JSON.parse(localStorage.getItem(socialProfileKey()) || "{}");
      const author = String(stored.author || "You").trim() || "You";
      return {
        author,
        avatar: String(stored.avatar || "").trim(),
      };
    } catch (_error) {
      return { author: "You", avatar: "" };
    }
  }

  function saveSocialProfile(profile) {
    try {
      localStorage.setItem(socialProfileKey(), JSON.stringify({
        author: String(profile?.author || "You").trim() || "You",
        avatar: String(profile?.avatar || "").trim(),
      }));
    } catch (_error) {
      // ignore storage errors
    }
  }

  function steamLoginHref() {
    try {
      return "steam_login.php?return_to=" + encodeURIComponent(window.location.href);
    } catch (_error) {
      return "steam_login.php";
    }
  }

  function promptSocialLogin() {
    try {
      window.dispatchEvent(new CustomEvent("cs2:open-login-modal"));
    } catch (_error) {
      try {
        window.location.href = steamLoginHref();
      } catch (_e2) {
        // ignore navigation errors
      }
    }
  }

  const GUEST_SOCIAL_AVATAR_SEED = "guest";

  function resolveSocialIdentity(steamSession, profile) {
    if (steamSession) {
      const author = String(steamSession.persona_name || profile?.author || "Steam User").trim() || "Steam User";
      const avatar = String(steamSession.avatar || profile?.avatar || "").trim();
      return {
        author,
        avatar: avatar || socialAvatarUrl(author),
        steamId: socialSessionActorId(steamSession),
        isLoggedIn: true,
      };
    }

    const author = String(profile?.author || "You").trim() || "You";
    return {
      author,
      avatar: String(profile?.avatar || "").trim() || socialAvatarUrl(author),
      steamId: "",
      isLoggedIn: false,
    };
  }

  function loadSocialReactions(itemId) {
    try {
      const stored = JSON.parse(localStorage.getItem(socialReactionsKey(itemId)) || "{}");
      return stored && typeof stored === "object" ? stored : {};
    } catch (_error) {
      return {};
    }
  }

  function persistSocialReactions(itemId, reactions) {
    try {
      localStorage.setItem(socialReactionsKey(itemId), JSON.stringify(reactions));
    } catch (_error) {
      // ignore storage errors
    }
  }

  function applySocialReactionCounts(posts, itemId) {
    try {
      const map = JSON.parse(localStorage.getItem(socialReactionCountsKey(itemId)) || "{}");
      if (!map || typeof map !== "object") return posts;
      return posts.map((post) => {
        const override = map[String(post.id)];
        if (!override) return post;
        return Object.assign({}, post, {
          likes: Number(override.likes ?? post.likes ?? 0),
          dislikes: Number(override.dislikes ?? post.dislikes ?? 0),
        });
      });
    } catch (_error) {
      return posts;
    }
  }

  function persistSocialReactionCounts(itemId, postId, likes, dislikes) {
    try {
      const key = socialReactionCountsKey(itemId);
      const map = JSON.parse(localStorage.getItem(key) || "{}");
      map[String(postId)] = { likes, dislikes };
      localStorage.setItem(key, JSON.stringify(map));
    } catch (_error) {
      // ignore storage errors
    }
  }

  function stableSocialItemId(seed) {
    const value = String(seed || "item");
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) || 1;
  }

  const SOCIAL_FEED_VISIBLE = 3;
  const SOCIAL_THREAD_VISIBLE = 3;
  const SOCIAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
  const SOCIAL_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
  const GIPHY_FAVS_KEY = "cs2_giphy_favs_v1";
  const GIPHY_CAT_PREVIEWS_KEY = "cs2_giphy_cat_previews_v2";
  const GIPHY_CAT_PREVIEWS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const GIPHY_LIVE_SEARCH_MS = 300;
  // `q` is the query sent to Giphy and must stay English; `labelKey` is what the
  // user sees and is translated at render time.
  const GIPHY_CATEGORIES = [
    { id: "favourites", labelKey: "giphy_favourites", kind: "favourites" },
    { id: "trending", labelKey: "giphy_trending", kind: "trending", icon: "fa-solid fa-arrow-trend-up" },
    { id: "hello", labelKey: "giphyCat_hello", kind: "search", q: "hello" },
    { id: "lol", labelKey: "giphyCat_lol", kind: "search", q: "lol" },
    { id: "love", labelKey: "giphyCat_love", kind: "search", q: "love" },
    { id: "happy-birthday", labelKey: "giphyCat_happyBirthday", kind: "search", q: "happy birthday" },
    { id: "thank-you", labelKey: "giphyCat_thankYou", kind: "search", q: "thank you" },
    { id: "excited", labelKey: "giphyCat_excited", kind: "search", q: "excited" },
    { id: "yes", labelKey: "giphyCat_yes", kind: "search", q: "yes" },
    { id: "no", labelKey: "giphyCat_no", kind: "search", q: "no" },
    { id: "sorry", labelKey: "giphyCat_sorry", kind: "search", q: "sorry" },
    { id: "happy", labelKey: "giphyCat_happy", kind: "search", q: "happy" },
    { id: "sad", labelKey: "giphyCat_sad", kind: "search", q: "sad" },
    { id: "thumbs-up", labelKey: "giphyCat_thumbsUp", kind: "search", q: "thumbs up" },
    { id: "scared", labelKey: "giphyCat_scared", kind: "search", q: "scared" },
    { id: "bye", labelKey: "giphyCat_bye", kind: "search", q: "bye" },
    { id: "confused", labelKey: "giphyCat_confused", kind: "search", q: "confused" },
    { id: "angry", labelKey: "giphyCat_angry", kind: "search", q: "angry" },
  ];

  function loadGiphyFavourites() {
    try {
      const raw = JSON.parse(localStorage.getItem(GIPHY_FAVS_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .map(function(row) {
          if (!row || typeof row !== "object") return null;
          const id = String(row.id || "").trim();
          const url = String(row.url || "").trim();
          const preview = String(row.preview || url).trim();
          if (!id || !url) return null;
          return {
            id,
            title: String(row.title || ""),
            preview,
            url,
            width: Number(row.width) || 0,
            height: Number(row.height) || 0,
          };
        })
        .filter(Boolean)
        .slice(0, 48);
    } catch (_e) {
      return [];
    }
  }

  function saveGiphyFavourites(list) {
    try {
      localStorage.setItem(GIPHY_FAVS_KEY, JSON.stringify((list || []).slice(0, 48)));
    } catch (_e) {}
  }

  // Newest favourite is prepended on save, so index 0 is last saved.
  function lastSavedGiphyFavouriteUrl(list) {
    if (!Array.isArray(list) || !list.length) return "";
    const last = list[0];
    if (!last || typeof last !== "object") return "";
    const url = String(last.url || last.preview || "").trim();
    return /^https:\/\//i.test(url) ? url : "";
  }

  function loadCachedGiphyCategoryPreviews() {
    try {
      // Drop legacy empty/bad v1 cache so Discord-style tiles can refill.
      try { localStorage.removeItem("cs2_giphy_cat_previews_v1"); } catch (_drop) {}
      const raw = JSON.parse(localStorage.getItem(GIPHY_CAT_PREVIEWS_KEY) || "null");
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      const savedAt = Number(raw.savedAt) || 0;
      if (!savedAt || (Date.now() - savedAt) > GIPHY_CAT_PREVIEWS_TTL_MS) return {};
      const map = raw.map && typeof raw.map === "object" && !Array.isArray(raw.map) ? raw.map : {};
      const out = {};
      Object.keys(map).forEach(function(key) {
        if (key === "favourites") return;
        const url = String(map[key] || "").trim();
        if (url && /^https:\/\//i.test(url)) out[key] = url;
      });
      // Treat a fully empty cached map as miss so we refetch instead of
      // trusting a prior silent failure (API down / empty responses).
      if (!Object.keys(out).length) return {};
      return out;
    } catch (_e) {
      return {};
    }
  }

  function saveCachedGiphyCategoryPreviews(map) {
    try {
      const cleaned = {};
      Object.keys(map || {}).forEach(function(key) {
        if (key === "favourites") return;
        const url = String(map[key] || "").trim();
        if (url && /^https:\/\//i.test(url)) cleaned[key] = url;
      });
      if (!Object.keys(cleaned).length) {
        localStorage.removeItem(GIPHY_CAT_PREVIEWS_KEY);
        return;
      }
      localStorage.setItem(GIPHY_CAT_PREVIEWS_KEY, JSON.stringify({
        savedAt: Date.now(),
        map: cleaned,
      }));
    } catch (_e) {}
  }

  function socialPublicImageSrc(url) {
    const value = String(url || "").trim();
    if (/^uploads\/community\/[a-f0-9]{16,64}\.(jpe?g|png|webp|gif)$/i.test(value)) {
      return value;
    }
    return "";
  }

  function formatSocialCommentFromApi(row) {
    const createdAt = row?.created_at ? Date.parse(String(row.created_at)) : Date.now();
    const author = String(row?.author || "Steam User");
    const avatar = String(row?.avatar_url || "").trim();
    return {
      id: String(row?.id ?? ""),
      steamId: String(row?.steam_id || ""),
      avatar: avatar || socialAvatarUrl(author),
      author,
      body: String(row?.body || ""),
      image: socialPublicImageSrc(row?.image_url),
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    };
  }

  function formatSocialPostFromApi(row) {
    const createdAt = row?.created_at ? Date.parse(String(row.created_at)) : Date.now();
    const author = String(row?.author || "Steam User");
    const avatar = String(row?.avatar_url || "").trim();
    const comments = Array.isArray(row?.comments) ? row.comments.map(formatSocialCommentFromApi) : [];
    return {
      id: String(row?.id ?? `local-${Date.now()}`),
      steamId: String(row?.steam_id || ""),
      avatar: avatar || socialAvatarUrl(author),
      author,
      sentiment: row?.sentiment || null,
      target: row?.target_price != null ? Number(row.target_price) : null,
      body: String(row?.body || ""),
      image: socialPublicImageSrc(row?.image_url),
      likes: Number(row?.likes || 0),
      dislikes: Number(row?.dislikes || 0),
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      comments,
    };
  }

  function loadSocialPosts(itemId) {
    try {
      const stored = localStorage.getItem(socialStorageKey(itemId));
      return stored ? JSON.parse(stored) : [];
    } catch (_e) {
      return [];
    }
  }

  function mergeSocialFeeds(apiPosts, localPosts) {
    const merged = Array.isArray(apiPosts) ? [...apiPosts] : [];
    const seen = new Set(merged.map((post) => String(post?.id || "")));

    (Array.isArray(localPosts) ? localPosts : []).forEach((post) => {
      const id = String(post?.id || "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      merged.push(post);
    });

    return merged.sort((left, right) => Number(right?.createdAt || 0) - Number(left?.createdAt || 0));
  }

  function persistSocialPost(itemId, post) {
    try {
      const stored = localStorage.getItem(socialStorageKey(itemId));
      const userPosts = stored ? JSON.parse(stored) : [];
      userPosts.unshift(post);
      localStorage.setItem(socialStorageKey(itemId), JSON.stringify(userPosts.slice(0, 100)));
    } catch (_e) {
      // ignore storage errors
    }
  }

  function updateStoredSocialPost(itemId, post) {
    try {
      const stored = localStorage.getItem(socialStorageKey(itemId));
      const userPosts = stored ? JSON.parse(stored) : [];
      const index = userPosts.findIndex((entry) => String(entry?.id) === String(post?.id));
      if (index < 0) return;
      userPosts[index] = post;
      localStorage.setItem(socialStorageKey(itemId), JSON.stringify(userPosts.slice(0, 100)));
    } catch (_error) {
      // ignore storage errors
    }
  }

  function removeStoredSocialPost(itemId, postId) {
    try {
      const stored = localStorage.getItem(socialStorageKey(itemId));
      const userPosts = stored ? JSON.parse(stored) : [];
      const nextPosts = userPosts.filter((entry) => String(entry?.id) !== String(postId));
      localStorage.setItem(socialStorageKey(itemId), JSON.stringify(nextPosts.slice(0, 100)));
    } catch (_error) {
      // ignore storage errors
    }
  }

  function canManageSocialPost(post, identity) {
    if (!post || !identity) return false;
    const id = String(post.id || "");
    if (id.startsWith("local-")) return true;
    if (identity.isLoggedIn && identity.steamId && post.steamId) {
      return String(post.steamId) === String(identity.steamId);
    }
    if (!identity.isLoggedIn && !post.steamId) {
      return String(post.author || "").trim().toLowerCase() === String(identity.author || "").trim().toLowerCase();
    }
    return false;
  }

  function loadLocalSocialFeed(itemId) {
    const posts = applySocialReactionCounts(loadSocialPosts(itemId), itemId);
    return {
      posts,
      reactions: loadSocialReactions(itemId),
    };
  }

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  function CommunityIdeas({ itemId, itemName, itemTitle, steamSession, priceSymbol, deferReady = true }) {
    const trackedItemId = Number(itemId) > 0 ? Number(itemId) : stableSocialItemId(String(itemName || "item"));
    const effectiveMarketHashName = String(itemName || "");
    const ITEM_DETAILS = { title: String(itemTitle || itemName || "") };
    const PRICE_SYMBOL = priceSymbol || "€";
    const itemLookupResolved = true;
    QUERY_ITEM_ID = trackedItemId;
    QUERY_MARKET_HASH_NAME = effectiveMarketHashName;
    QUERY_LOOKUP_NAME = effectiveMarketHashName;
    const i18n = typeof useI18n === "function" ? useI18n() : null;
    const t = i18n && typeof i18n.t === "function" ? i18n.t : (key, vars) => String(key).replace(/^social_|^giphy_/, "");
    const tp = i18n && typeof i18n.tp === "function" ? i18n.tp : (key, count) => `${count} ${String(key).replace(/^social_/, "")}`;
    const [socialPosts, setSocialPosts] = useState([]);
    const [socialText, setSocialText] = useState(function() {
      return String(initialSocialIdeaDraft()?.text || "");
    });
    const [socialSentiment, setSocialSentiment] = useState(function() {
      const sentiment = initialSocialIdeaDraft()?.sentiment;
      return sentiment === "bullish" || sentiment === "bearish" ? sentiment : null;
    });
    const [socialTarget, setSocialTarget] = useState(function() {
      return String(initialSocialIdeaDraft()?.target || "");
    });
    const [socialLoading, setSocialLoading] = useState(true);
    const [socialSubmitting, setSocialSubmitting] = useState(false);
    const [socialReactions, setSocialReactions] = useState({});
    const [editingPostId, setEditingPostId] = useState(null);
    const [editingDraft, setEditingDraft] = useState({ body: "", sentiment: null, target: "" });
    const [socialActionId, setSocialActionId] = useState("");
    const [socialAuthor, setSocialAuthor] = useState(() => loadSocialProfile().author);
    const [socialAvatar, setSocialAvatar] = useState(() => loadSocialProfile().avatar);
    const [socialFeedExpanded, setSocialFeedExpanded] = useState(false);
    const [socialImageFile, setSocialImageFile] = useState(null);
    const [socialImagePreview, setSocialImagePreview] = useState(function() {
      return String(initialSocialIdeaDraft()?.giphyUrl || "");
    });
    const [socialGiphyUrl, setSocialGiphyUrl] = useState(function() {
      return String(initialSocialIdeaDraft()?.giphyUrl || "");
    });
    const [socialError, setSocialError] = useState("");
    const [commentDrafts, setCommentDrafts] = useState({});
    const [commentImages, setCommentImages] = useState({});
    const [commentPreviews, setCommentPreviews] = useState({});
    const [commentBusyId, setCommentBusyId] = useState("");
    const [expandedCommentPosts, setExpandedCommentPosts] = useState({});
    const socialImageInputRef = useRef(null);
    const [giphyOpen, setGiphyOpen] = useState(false);
    const [giphyQuery, setGiphyQuery] = useState("");
    const [giphyView, setGiphyView] = useState("categories");
    // Structured, not a display string: the label is derived through t() at
    // render time, and the favourites check below must not depend on English.
    const [giphyHeading, setGiphyHeading] = useState({ kind: "categories", query: "" });
    const [giphyResults, setGiphyResults] = useState([]);
    const [giphyLoading, setGiphyLoading] = useState(false);
    const [giphyError, setGiphyError] = useState("");
    const [giphyFavs, setGiphyFavs] = useState(function() { return loadGiphyFavourites(); });
    const [giphyCatPreviews, setGiphyCatPreviews] = useState(function() { return loadCachedGiphyCategoryPreviews(); });
    const giphyCatPreviewInflightRef = useRef(false);
    const giphyCatPreviewsRef = useRef(giphyCatPreviews);
    giphyCatPreviewsRef.current = giphyCatPreviews;
    const giphySearchTimerRef = useRef(null);
    const giphySearchSeqRef = useRef(0);
    const giphyTypedQueryRef = useRef(false);
    const socialDraftPersistReadyRef = useRef(false);
    const socialAutoPublishRef = useRef(false);

    useEffect(() => {
      const socialItemId = trackedItemId || stableSocialItemId(effectiveMarketHashName || String(trackedItemId || 1));
      const localFeed = loadLocalSocialFeed(socialItemId);

      if (!trackedItemId) {
        setSocialPosts(localFeed.posts);
        setSocialReactions(localFeed.reactions);
        setSocialLoading(false);
        return undefined;
      }
      if (!deferReady) {
        return undefined;
      }

      let cancelled = false;
      setSocialLoading(true);

      const params = new URLSearchParams({
        item_id: String(trackedItemId),
        item_name: effectiveMarketHashName || "",
        limit: "50",
      });

      fetch(`get_social_posts.php?${params.toString()}`, { credentials: "same-origin" })
        .then((response) => (response.ok ? response.json() : null))
        .then((json) => {
          if (cancelled) return;
          const apiPosts = Array.isArray(json?.posts)
            ? json.posts.map(formatSocialPostFromApi)
            : [];
          const merged = mergeSocialFeeds(apiPosts, localFeed.posts);
          setSocialPosts(applySocialReactionCounts(merged, socialItemId));
          setSocialReactions(localFeed.reactions);
        })
        .catch(() => {
          if (cancelled) return;
          setSocialPosts(localFeed.posts);
          setSocialReactions(localFeed.reactions);
        })
        .finally(() => {
          if (!cancelled) setSocialLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [trackedItemId, effectiveMarketHashName, deferReady]);

    const socialItemId = trackedItemId || stableSocialItemId(effectiveMarketHashName || String(trackedItemId || 1));
    const socialIdentity = resolveSocialIdentity(steamSession, {
      author: socialAuthor,
      avatar: socialAvatar,
    });

    function clearSocialImage() {
      if (socialImagePreview && String(socialImagePreview).startsWith("blob:")) {
        try { URL.revokeObjectURL(socialImagePreview); } catch (_e) {}
      }
      setSocialImageFile(null);
      setSocialImagePreview("");
      setSocialGiphyUrl("");
      if (socialImageInputRef.current) socialImageInputRef.current.value = "";
    }

    function pickSocialImage(file) {
      if (!file) return;
      if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
        setSocialError(t("social_errImageType"));
        return;
      }
      if (file.size > SOCIAL_IMAGE_MAX_BYTES) {
        setSocialError(t("social_errImageSize"));
        return;
      }
      setSocialError("");
      clearSocialImage();
      setSocialImageFile(file);
      setSocialGiphyUrl("");
      try {
        setSocialImagePreview(URL.createObjectURL(file));
      } catch (_e) {
        setSocialImagePreview("");
      }
    }

    function rememberGiphyFavourite(gif) {
      if (!gif || !gif.id || !gif.url) return;
      setGiphyFavs(function(prev) {
        const next = [gif].concat((prev || []).filter(function(row) { return row.id !== gif.id; })).slice(0, 48);
        saveGiphyFavourites(next);
        return next;
      });
    }

    function isGiphyFavourite(gifId) {
      const id = String(gifId || "").trim();
      if (!id) return false;
      return (giphyFavs || []).some(function(row) { return row && row.id === id; });
    }

    function toggleGiphyFavourite(gif, event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (!gif || !gif.id || !gif.url) return;
      const id = String(gif.id);
      const wasFav = isGiphyFavourite(id);
      setGiphyFavs(function(prev) {
        const list = prev || [];
        const next = wasFav
          ? list.filter(function(row) { return row && row.id !== id; })
          : [gif].concat(list.filter(function(row) { return row && row.id !== id; })).slice(0, 48);
        saveGiphyFavourites(next);
        return next;
      });
      if (wasFav && giphyView === "results" && giphyHeading?.kind === "favourites") {
        setGiphyResults(function(prev) {
          return (prev || []).filter(function(row) { return row && row.id !== id; });
        });
      }
    }

    async function fetchGiphyCategoryPreviewUrl(cat) {
      if (!cat) return "";
      // Favourites uses the last locally saved GIF, not a Giphy category preview.
      if (cat.kind === "favourites") return "";
      try {
        // limit=1 → Giphy's top/most relevant (search) or #1 trending result.
        const endpoint = cat.kind === "trending"
          ? "giphy_trending.php?limit=1"
          : ("giphy_search.php?q=" + encodeURIComponent(cat.q || cat.label || "") + "&limit=1");
        const response = await fetch(endpoint, { credentials: "same-origin" });
        if (!response.ok) return "";
        const json = await response.json();
        if (!json?.success || !Array.isArray(json.gifs) || !json.gifs.length) return "";
        const gif = json.gifs[0];
        // Prefer animated fixed_height (`url`) so category tiles loop like Discord.
        const url = String(gif?.url || gif?.preview || "").trim();
        return /^https:\/\//i.test(url) ? url : "";
      } catch (_e) {
        return "";
      }
    }

    async function ensureGiphyCategoryPreviews() {
      if (giphyCatPreviewInflightRef.current) return;
      giphyCatPreviewInflightRef.current = true;
      try {
        const current = Object.assign({}, giphyCatPreviewsRef.current || {});
        delete current.favourites;
        Object.keys(current).forEach(function(key) {
          const url = String(current[key] || "").trim();
          if (!url || !/^https:\/\//i.test(url)) delete current[key];
        });
        const missing = GIPHY_CATEGORIES.filter(function(cat) {
          if (cat.kind === "favourites") return false;
          return !current[cat.id];
        });
        if (!missing.length) {
          giphyCatPreviewsRef.current = current;
          setGiphyCatPreviews(current);
          saveCachedGiphyCategoryPreviews(current);
          return;
        }
        // Prefetch in parallel chunks so tiles fill quickly when the modal opens.
        const chunkSize = 6;
        for (let i = 0; i < missing.length; i += chunkSize) {
          const chunk = missing.slice(i, i + chunkSize);
          const urls = await Promise.all(chunk.map(function(cat) {
            return fetchGiphyCategoryPreviewUrl(cat);
          }));
          chunk.forEach(function(cat, idx) {
            const url = String(urls[idx] || "").trim();
            if (url) current[cat.id] = url;
          });
          giphyCatPreviewsRef.current = Object.assign({}, current);
          setGiphyCatPreviews(Object.assign({}, current));
        }
        saveCachedGiphyCategoryPreviews(current);
      } finally {
        giphyCatPreviewInflightRef.current = false;
      }
    }

    function closeGiphyPicker() {
      if (giphySearchTimerRef.current) {
        clearTimeout(giphySearchTimerRef.current);
        giphySearchTimerRef.current = null;
      }
      giphySearchSeqRef.current += 1;
      giphyTypedQueryRef.current = false;
      setGiphyOpen(false);
      setGiphyError("");
      setGiphyLoading(false);
    }

    function openGiphyPicker() {
      if (giphySearchTimerRef.current) {
        clearTimeout(giphySearchTimerRef.current);
        giphySearchTimerRef.current = null;
      }
      giphyTypedQueryRef.current = false;
      setGiphyOpen(true);
      setGiphyQuery("");
      setGiphyView("categories");
      setGiphyHeading({ kind: "categories", query: "" });
      setGiphyResults([]);
      setGiphyError("");
      setGiphyLoading(false);
    }

    function applySocialIdeaDraft(draft) {
      const next = normalizeSocialIdeaDraft(draft);
      if (!next) return;
      setSocialText(next.text);
      setSocialSentiment(next.sentiment);
      setSocialTarget(next.target);
      setSocialGiphyUrl(next.giphyUrl);
      if (next.giphyUrl) {
        if (socialImagePreview && String(socialImagePreview).startsWith("blob:")) {
          try { URL.revokeObjectURL(socialImagePreview); } catch (_e) {}
        }
        setSocialImageFile(null);
        if (socialImageInputRef.current) socialImageInputRef.current.value = "";
        setSocialImagePreview(next.giphyUrl);
      }
    }

    function collectSocialComposerDraft(publishAfterLogin) {
      const existing = loadSocialIdeaDraft(trackedItemId, effectiveMarketHashName);
      return {
        text: String(socialText || ""),
        sentiment: socialSentiment === "bullish" || socialSentiment === "bearish" ? socialSentiment : null,
        target: String(socialTarget || ""),
        giphyUrl: String(socialGiphyUrl || ""),
        publishAfterLogin: publishAfterLogin === true || Boolean(existing?.publishAfterLogin),
        savedAt: Date.now(),
      };
    }

    function saveSocialComposerDraft(publishAfterLogin) {
      const draft = collectSocialComposerDraft(publishAfterLogin);
      if (!socialIdeaDraftHasContent(draft) && !draft.publishAfterLogin) {
        clearSocialIdeaDraft(trackedItemId, effectiveMarketHashName);
        return draft;
      }
      persistSocialIdeaDraft(trackedItemId, effectiveMarketHashName, draft);
      return draft;
    }

    async function loadGiphyResults(mode, query) {
      const seq = ++giphySearchSeqRef.current;
      setGiphyLoading(true);
      setGiphyError("");
      setGiphyView("results");
      try {
        if (mode === "favourites") {
          if (seq !== giphySearchSeqRef.current) return;
          setGiphyHeading({ kind: "favourites", query: "" });
          setGiphyResults(giphyFavs.slice());
          setGiphyLoading(false);
          return;
        }
        const endpoint = mode === "trending"
          ? "giphy_trending.php?limit=24"
          : ("giphy_search.php?q=" + encodeURIComponent(query || "") + "&limit=24");
        setGiphyHeading(mode === "trending"
          ? { kind: "trending", query: "" }
          : { kind: "search", query: String(query || "") });
        const response = await fetch(endpoint, { credentials: "same-origin" });
        const json = await response.json();
        if (seq !== giphySearchSeqRef.current) return;
        if (!json?.success) {
          setGiphyResults([]);
          setGiphyError(json?.error || "Could not load GIFs.");
          setGiphyLoading(false);
          return;
        }
        setGiphyResults(Array.isArray(json.gifs) ? json.gifs : []);
        setGiphyLoading(false);
      } catch (_e) {
        if (seq !== giphySearchSeqRef.current) return;
        setGiphyResults([]);
        setGiphyError(t("giphy_errLoad"));
        setGiphyLoading(false);
      }
    }

    // Prefetch Discord-style category GIF covers whenever the picker opens.
    useEffect(function() {
      if (!giphyOpen) return undefined;
      ensureGiphyCategoryPreviews();
      return undefined;
    }, [giphyOpen]);

    // Live search as you type (debounced). Empty query returns to categories only when
    // the user cleared typed text / opened empty — not when browsing via category tiles.
    useEffect(function() {
      if (!giphyOpen) return undefined;
      const q = String(giphyQuery || "").trim();
      if (giphySearchTimerRef.current) {
        clearTimeout(giphySearchTimerRef.current);
        giphySearchTimerRef.current = null;
      }
      if (!q) {
        if (giphyTypedQueryRef.current) {
          giphyTypedQueryRef.current = false;
          giphySearchSeqRef.current += 1;
          setGiphyView("categories");
          setGiphyHeading({ kind: "categories", query: "" });
          setGiphyResults([]);
          setGiphyError("");
          setGiphyLoading(false);
        }
        return undefined;
      }
      giphyTypedQueryRef.current = true;
      setGiphyLoading(true);
      setGiphyView("results");
      setGiphyError("");
      giphySearchTimerRef.current = setTimeout(function() {
        giphySearchTimerRef.current = null;
        loadGiphyResults("search", q);
      }, GIPHY_LIVE_SEARCH_MS);
      return function() {
        if (giphySearchTimerRef.current) {
          clearTimeout(giphySearchTimerRef.current);
          giphySearchTimerRef.current = null;
        }
      };
    }, [giphyQuery, giphyOpen]);

    function pickSocialGiphy(gif) {
      const url = String(gif?.url || "").trim();
      const preview = String(gif?.preview || url).trim();
      if (!url) {
        setGiphyError(t("giphy_errAttach"));
        return;
      }
      setSocialError("");
      if (socialImagePreview && String(socialImagePreview).startsWith("blob:")) {
        try { URL.revokeObjectURL(socialImagePreview); } catch (_e) {}
      }
      setSocialImageFile(null);
      if (socialImageInputRef.current) socialImageInputRef.current.value = "";
      setSocialGiphyUrl(url);
      setSocialImagePreview(preview || url);
      closeGiphyPicker();
    }

    function resetSocialComposer() {
      setSocialText("");
      setSocialSentiment(null);
      setSocialTarget("");
      clearSocialImage();
      clearSocialIdeaDraft(trackedItemId, effectiveMarketHashName);
    }

    async function publishSocialIdeaFromDraft(draft, identity) {
      const text = String(draft?.text || "").trim();
      const giphyUrl = String(draft?.giphyUrl || "").trim();
      const sentiment = draft?.sentiment === "bullish" || draft?.sentiment === "bearish" ? draft.sentiment : null;
      const target = String(draft?.target || "").trim();
      const publishBody = text || (giphyUrl ? " " : "");
      if (!publishBody || socialSubmitting) return false;
      if (!trackedItemId) {
        setSocialError(t("social_errPublishPost"));
        return false;
      }

      const authorIdentity = identity || socialIdentity;
      setSocialSubmitting(true);
      setSocialError("");
      saveSocialProfile({
        author: authorIdentity.author,
        avatar: authorIdentity.avatar,
      });

      try {
        const payload = socialImageFile && !giphyUrl
          ? (function() {
              const form = new FormData();
              form.append("item_id", String(trackedItemId));
              form.append("item_name", effectiveMarketHashName || "");
              form.append("body", publishBody);
              if (sentiment) form.append("sentiment", sentiment);
              if (target !== "") form.append("target_price", String(Number(target)));
              form.append("image", socialImageFile);
              return form;
            })()
          : JSON.stringify({
              item_id: trackedItemId,
              item_name: effectiveMarketHashName || "",
              body: publishBody,
              sentiment,
              target_price: target !== "" ? Number(target) : null,
              giphy_url: giphyUrl || null,
            });
        const response = await fetch("save_social_post.php", {
          method: "POST",
          credentials: "same-origin",
          headers: socialImageFile && !giphyUrl ? undefined : { "Content-Type": "application/json" },
          body: payload,
        });
        const json = await response.json();
        if (response.status === 401 || json?.error?.toLowerCase?.().includes("not logged in")) {
          persistSocialIdeaDraft(trackedItemId, effectiveMarketHashName, Object.assign({}, draft, {
            publishAfterLogin: true,
            savedAt: Date.now(),
          }));
          setSocialError("");
          setSocialSubmitting(false);
          promptSocialLogin();
          return false;
        }
        if (json?.success && json.post) {
          const nextPost = formatSocialPostFromApi(json.post);
          setSocialPosts(function(prev) { return [nextPost].concat(prev); });
          resetSocialComposer();
          setSocialSubmitting(false);
          return true;
        }
        setSocialError(json?.error || "Could not publish this post.");
        setSocialSubmitting(false);
        return false;
      } catch (_error) {
        setSocialError(t("social_errPublishPost"));
        setSocialSubmitting(false);
        return false;
      }
    }

    async function handleSocialSubmit() {
      const draft = saveSocialComposerDraft(!socialIdentity.isLoggedIn);
      if (!socialIdeaDraftHasContent(draft) && !String(draft.giphyUrl || "").trim() && !String(draft.text || "").trim()) {
        return;
      }
      if (!String(draft.text || "").trim() && !String(draft.giphyUrl || "").trim()) {
        setSocialError(t("social_errWriteSomething"));
        return;
      }
      if (socialSubmitting) return;
      if (!socialIdentity.isLoggedIn) {
        persistSocialIdeaDraft(trackedItemId, effectiveMarketHashName, Object.assign({}, draft, {
          publishAfterLogin: true,
          savedAt: Date.now(),
        }));
        promptSocialLogin();
        return;
      }
      await publishSocialIdeaFromDraft(draft, socialIdentity);
    }

    useEffect(function() {
      if (!socialDraftPersistReadyRef.current) {
        socialDraftPersistReadyRef.current = true;
        return undefined;
      }
      saveSocialComposerDraft(false);
      return undefined;
    }, [socialText, socialSentiment, socialTarget, socialGiphyUrl, trackedItemId, effectiveMarketHashName]);

    useEffect(function() {
      if (ITEM_PAGE_AUTH_FLAG !== "success") return undefined;
      if (!socialIdentity.isLoggedIn || socialSubmitting) return undefined;
      if (!itemLookupResolved || !trackedItemId) return undefined;
      if (socialAutoPublishRef.current) return undefined;
      const draft = loadSocialIdeaDraft(trackedItemId, effectiveMarketHashName);
      if (!draft || !draft.publishAfterLogin) return undefined;
      if (!String(draft.text || "").trim() && !String(draft.giphyUrl || "").trim()) return undefined;
      socialAutoPublishRef.current = true;
      applySocialIdeaDraft(draft);
      publishSocialIdeaFromDraft(draft, socialIdentity);
      return undefined;
    }, [socialIdentity.isLoggedIn, itemLookupResolved, trackedItemId, effectiveMarketHashName, steamSession]);

    async function handleSocialCommentSubmit(post) {
      const postId = String(post?.id || "");
      if (!postId || postId.startsWith("local-") || commentBusyId) return;
      const body = String(commentDrafts[postId] || "").trim();
      if (!body) return;
      if (!socialIdentity.isLoggedIn) {
        setSocialError(t("social_signInToComment"));
        return;
      }

      setCommentBusyId(postId);
      setSocialError("");
      try {
        const imageFile = commentImages[postId] || null;
        const payload = imageFile
          ? (function() {
              const form = new FormData();
              form.append("post_id", postId);
              form.append("body", body);
              form.append("image", imageFile);
              return form;
            })()
          : JSON.stringify({ post_id: Number(postId), body });
        const response = await fetch("save_social_comment.php", {
          method: "POST",
          credentials: "same-origin",
          headers: imageFile ? undefined : { "Content-Type": "application/json" },
          body: payload,
        });
        const json = await response.json();
        if (response.status === 401 || json?.error?.toLowerCase?.().includes("not logged in")) {
          setSocialError(t("social_signInToComment"));
          return;
        }
        if (!json?.success || !json.comment) {
          setSocialError(json?.error || "Could not publish this comment.");
          return;
        }
        const nextComment = formatSocialCommentFromApi(json.comment);
        setSocialPosts(function(prev) {
          return prev.map(function(entry) {
            if (String(entry.id) !== postId) return entry;
            const comments = Array.isArray(entry.comments) ? entry.comments.concat([nextComment]) : [nextComment];
            return Object.assign({}, entry, { comments });
          });
        });
        setCommentDrafts(function(prev) { return Object.assign({}, prev, { [postId]: "" }); });
        const preview = commentPreviews[postId];
        if (preview && String(preview).startsWith("blob:")) {
          try { URL.revokeObjectURL(preview); } catch (_e) {}
        }
        setCommentImages(function(prev) {
          const next = Object.assign({}, prev);
          delete next[postId];
          return next;
        });
        setCommentPreviews(function(prev) {
          const next = Object.assign({}, prev);
          delete next[postId];
          return next;
        });
      } catch (_error) {
        setSocialError(t("social_errPublishComment"));
      } finally {
        setCommentBusyId("");
      }
    }

    function handleSocialReaction(postId, reaction) {
      const id = String(postId);
      const previousReaction = socialReactions[id] || "";
      const nextReaction = previousReaction === reaction ? "" : reaction;

      setSocialReactions(function(prev) {
        const updated = Object.assign({}, prev, { [id]: nextReaction });
        persistSocialReactions(socialItemId, updated);
        return updated;
      });

      setSocialPosts(function(prev) {
        return prev.map(function(post) {
          if (String(post.id) !== id) return post;

          let likes = Number(post.likes || 0);
          let dislikes = Number(post.dislikes || 0);

          if (previousReaction === "like") likes -= 1;
          if (previousReaction === "dislike") dislikes -= 1;
          if (nextReaction === "like") likes += 1;
          if (nextReaction === "dislike") dislikes += 1;

          const updated = Object.assign({}, post, {
            likes: Math.max(0, likes),
            dislikes: Math.max(0, dislikes),
          });

          persistSocialReactionCounts(socialItemId, id, updated.likes, updated.dislikes);
          if (String(id).startsWith("local-")) {
            updateStoredSocialPost(socialItemId, updated);
          }

          return updated;
        });
      });
    }

    function handleSocialEditCancel() {
      setEditingPostId(null);
      setEditingDraft({ body: "", sentiment: null, target: "" });
    }

    function handleSocialEditStart(post) {
      setEditingPostId(String(post.id));
      setEditingDraft({
        body: String(post.body || ""),
        sentiment: post.sentiment || null,
        target: post.target != null && Number.isFinite(Number(post.target)) ? String(post.target) : "",
      });
    }

    async function handleSocialEditSave(post) {
      const id = String(post.id);
      const body = String(editingDraft.body || "").trim();
      if (!body || socialActionId) return;

      const sentiment = editingDraft.sentiment || null;
      const target = editingDraft.target !== "" ? Number(editingDraft.target) : null;
      setSocialActionId(id);

      try {
        if (id.startsWith("local-")) {
          const updated = Object.assign({}, post, {
            body,
            sentiment,
            target: Number.isFinite(target) ? target : null,
          });
          updateStoredSocialPost(socialItemId, updated);
          setSocialPosts(function(prev) {
            return prev.map(function(entry) {
              return String(entry.id) === id ? updated : entry;
            });
          });
          handleSocialEditCancel();
          return;
        }

        if (!socialIdentity.isLoggedIn) {
          window.alert("Sign in with Steam to edit this post.");
          return;
        }

        const response = await fetch("manage_social_post.php", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            post_id: Number(post.id),
            body,
            sentiment,
            target_price: Number.isFinite(target) ? target : null,
          }),
        });
        const json = await response.json();
        if (!json?.success || !json.post) {
          setSocialError(json?.error || "Could not update post.");
          window.alert(json?.error || "Could not update post.");
          return;
        }

        const updated = formatSocialPostFromApi(json.post);
        setSocialPosts(function(prev) {
          return prev.map(function(entry) {
            return String(entry.id) === id ? updated : entry;
          });
        });
        handleSocialEditCancel();
      } catch (_error) {
        window.alert("Could not update post.");
      } finally {
        setSocialActionId("");
      }
    }

    async function handleSocialDelete(post) {
      const id = String(post.id);
      if (socialActionId) return;

      setSocialActionId(id);
      try {
        if (id.startsWith("local-")) {
          removeStoredSocialPost(socialItemId, id);
        } else {
          if (!socialIdentity.isLoggedIn) {
            window.alert("Sign in with Steam to delete this post.");
            return;
          }
          const response = await fetch("manage_social_post.php", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "delete",
              post_id: Number(post.id),
            }),
          });
          const json = await response.json();
          if (!json?.success) {
            window.alert(json?.error || "Could not delete post.");
            return;
          }
        }

        setSocialPosts(function(prev) {
          return prev.filter(function(entry) { return String(entry.id) !== id; });
        });
        if (editingPostId === id) handleSocialEditCancel();
      } catch (_error) {
        window.alert("Could not delete post.");
      } finally {
        setSocialActionId("");
      }
    }

    const visibleSocialPosts = socialFeedExpanded || socialPosts.length < SOCIAL_FEED_VISIBLE
      ? socialPosts
      : socialPosts.slice(0, SOCIAL_FEED_VISIBLE);
    const hiddenSocialCount = Math.max(0, socialPosts.length - SOCIAL_FEED_VISIBLE);

    return (
      <>
          <section className="tv-social tv-anim-up">
            <div className="tv-social-hdr">
              <div>
                <h2 className="tv-section-title">{t("social_title")}</h2>
                <p className="tv-social-sub">{t("social_sub")}</p>
              </div>
              <span className="tv-social-count">{tp("social_postCount", socialPosts.length)}</span>
            </div>

            <div className="tv-post-form-wrap">
              <div className="tv-post-form">
                <div className={"tv-post-form-identity" + (socialIdentity.isLoggedIn ? "" : " tv-post-form-identity--guest")}>
                  {socialIdentity.isLoggedIn ? (
                    <div className="tv-post-author-label">{socialIdentity.author}</div>
                  ) : null}
                  <img
                    className="tv-post-avatar tv-post-avatar--identity"
                    src={socialIdentity.isLoggedIn ? socialIdentity.avatar : socialAvatarUrl(GUEST_SOCIAL_AVATAR_SEED)}
                    alt={socialIdentity.isLoggedIn ? socialIdentity.author : t("social_guest")}
                  />
                </div>
                <div className={"tv-post-form-compose" + (socialIdentity.isLoggedIn ? "" : " tv-post-form-compose--guest")}>
                  <textarea
                    className="tv-post-input"
                    rows={3}
                    placeholder={t("social_placeholder", { item: ITEM_DETAILS.title })}
                    value={socialText}
                    onChange={function(e) { setSocialText(e.target.value); setSocialError(""); }}
                  />
                  {socialImagePreview ? (
                    <div className="tv-post-image-preview">
                      <img src={socialImagePreview} alt="" />
                      <button type="button" className="tv-post-image-preview-x" onClick={clearSocialImage} aria-label={t("social_removeImage")}>
                        <i className="fa-solid fa-xmark" />
                      </button>
                    </div>
                  ) : null}
                  <div className="tv-post-form-actions">
                    <div className="tv-sentiment-row">
                      <button
                        type="button"
                        className={"tv-sent-btn bullish" + (socialSentiment === "bullish" ? " active" : "")}
                        onClick={function() { setSocialSentiment(socialSentiment === "bullish" ? null : "bullish"); }}
                      >
                        <i className="fa-solid fa-arrow-trend-up" /> {t("social_bullish")}
                      </button>
                      <button
                        type="button"
                        className={"tv-sent-btn bearish" + (socialSentiment === "bearish" ? " active" : "")}
                        onClick={function() { setSocialSentiment(socialSentiment === "bearish" ? null : "bearish"); }}
                      >
                        <i className="fa-solid fa-arrow-trend-down" /> {t("social_bearish")}
                      </button>
                      <input
                        className="tv-target-input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={t("social_target", { currency: PRICE_SYMBOL })}
                        value={socialTarget}
                        onChange={function(e) { setSocialTarget(e.target.value); }}
                      />
                      <button
                        type="button"
                        className={"tv-sent-btn tv-post-attach" + (socialImageFile ? " has-file" : "")}
                        title={t("social_attachImage")}
                        onClick={function() {
                          if (socialImageInputRef.current) socialImageInputRef.current.click();
                        }}
                      >
                        <i className="fa-regular fa-image" />
                      </button>
                      <button
                        type="button"
                        className={"tv-sent-btn tv-post-attach" + (socialGiphyUrl ? " has-file" : "")}
                        title={t("social_attachGif")}
                        onClick={openGiphyPicker}
                      >
                        <span className="tv-post-gif-label">GIF</span>
                      </button>
                      <input
                        ref={socialImageInputRef}
                        type="file"
                        accept={SOCIAL_IMAGE_ACCEPT}
                        hidden
                        onChange={function(e) {
                          const file = e.target.files && e.target.files[0];
                          pickSocialImage(file || null);
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      className="tv-post-submit tv-post-submit--compact"
                      disabled={(!socialText.trim() && !socialGiphyUrl) || socialSubmitting}
                      onClick={handleSocialSubmit}
                    >
                      {socialSubmitting ? t("social_posting") : t("social_publishIdea")}
                    </button>
                  </div>
                </div>
              </div>
              {socialError ? <p className="tv-social-error">{socialError}</p> : null}
            </div>

            <div className="tv-feed">
              {socialLoading ? (
                <p className="tv-social-sub">{t("social_loadingPosts")}</p>
              ) : null}
              {!socialLoading && !socialPosts.length ? (
                <p className="tv-social-sub">{t("social_empty")}</p>
              ) : null}
              {visibleSocialPosts.map(function(post) {
                const reaction = socialReactions[post.id] || "";
                const canManage = canManageSocialPost(post, socialIdentity);
                const isEditing = editingPostId === String(post.id);
                const isBusy = socialActionId === String(post.id);
                const comments = Array.isArray(post.comments) ? post.comments : [];
                const threadExpanded = Boolean(expandedCommentPosts[post.id]);
                const visibleComments = threadExpanded || comments.length < SOCIAL_THREAD_VISIBLE
                  ? comments
                  : comments.slice(0, SOCIAL_THREAD_VISIBLE);
                const hiddenCommentCount = Math.max(0, comments.length - SOCIAL_THREAD_VISIBLE);
                const isServerPost = !String(post.id).startsWith("local-");
                return (
                  <article className="tv-post" key={post.id}>
                    <div className="tv-post-hdr">
                      <img className="tv-post-avatar" src={post.avatar || socialAvatarUrl(post.author)} alt="" />
                      <div className="tv-post-meta">
                        <div className="tv-post-meta-row">
                          <span className="tv-post-author">{post.author}</span>
                          {post.sentiment && !isEditing ? (
                            <span className={"tv-post-sent " + post.sentiment}>
                              <i className={"fa-solid fa-arrow-trend-" + (post.sentiment === "bullish" ? "up" : "down")} />
                              {post.sentiment === "bullish" ? t("social_bullish") : t("social_bearish")}
                              {post.target ? <span className="tv-post-target"> · {t("social_targetLabel")} {PRICE_SYMBOL}{Number(post.target).toFixed(2)}</span> : null}
                            </span>
                          ) : null}
                        </div>
                        <span className="tv-post-time">{timeAgo(post.createdAt)}</span>
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="tv-post-edit">
                        <textarea
                          className="tv-post-edit-input"
                          rows={3}
                          value={editingDraft.body}
                          onChange={function(e) {
                            setEditingDraft(function(prev) {
                              return Object.assign({}, prev, { body: e.target.value });
                            });
                          }}
                        />
                        <div className="tv-post-edit-meta">
                          <button
                            type="button"
                            className={"tv-sent-btn bullish" + (editingDraft.sentiment === "bullish" ? " active" : "")}
                            onClick={function() {
                              setEditingDraft(function(prev) {
                                return Object.assign({}, prev, {
                                  sentiment: prev.sentiment === "bullish" ? null : "bullish",
                                });
                              });
                            }}
                          >
                            <i className="fa-solid fa-arrow-trend-up" /> {t("social_bullish")}
                          </button>
                          <button
                            type="button"
                            className={"tv-sent-btn bearish" + (editingDraft.sentiment === "bearish" ? " active" : "")}
                            onClick={function() {
                              setEditingDraft(function(prev) {
                                return Object.assign({}, prev, {
                                  sentiment: prev.sentiment === "bearish" ? null : "bearish",
                                });
                              });
                            }}
                          >
                            <i className="fa-solid fa-arrow-trend-down" /> {t("social_bearish")}
                          </button>
                          <input
                            className="tv-target-input"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={t("social_target", { currency: PRICE_SYMBOL })}
                            value={editingDraft.target}
                            onChange={function(e) {
                              setEditingDraft(function(prev) {
                                return Object.assign({}, prev, { target: e.target.value });
                              });
                            }}
                          />
                        </div>
                        <div className="tv-post-edit-actions">
                          <button
                            type="button"
                            className="tv-post-edit-cancel"
                            disabled={isBusy}
                            onClick={handleSocialEditCancel}
                          >
                            {t("social_cancel")}
                          </button>
                          <button
                            type="button"
                            className="tv-post-submit"
                            disabled={!editingDraft.body.trim() || isBusy}
                            onClick={function() { handleSocialEditSave(post); }}
                          >
                            {isBusy ? t("social_saving") : t("social_save")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="tv-post-body">{post.body}</p>
                        {post.image ? (
                          <figure className="tv-post-photo">
                            <img src={post.image} alt="" />
                          </figure>
                        ) : null}
                      </>
                    )}
                    {!isEditing ? (
                    <div className="tv-post-actions">
                      <button
                        type="button"
                        className={"tv-react-btn" + (reaction === "like" ? " active-like" : "")}
                        onClick={function() { handleSocialReaction(post.id, "like"); }}
                      >
                        <i className="fa-solid fa-thumbs-up" /> {post.likes || 0}
                      </button>
                      <button
                        type="button"
                        className={"tv-react-btn" + (reaction === "dislike" ? " active-dislike" : "")}
                        onClick={function() { handleSocialReaction(post.id, "dislike"); }}
                      >
                        <i className="fa-solid fa-thumbs-down" /> {post.dislikes || 0}
                      </button>
                      {isServerPost && socialIdentity.isLoggedIn ? (
                        <span className="tv-post-attach-wrap">
                          <button
                            type="button"
                            className={"tv-react-btn tv-post-attach" + (commentImages[post.id] ? " has-file" : "")}
                            title={t("social_attachImage")}
                            aria-label={t("social_attachImageToComment")}
                            onClick={function() {
                              const input = document.getElementById("tv-comment-file-" + post.id);
                              if (input) input.click();
                            }}
                          >
                            <i className="fa-regular fa-image" />
                          </button>
                          <input
                            id={"tv-comment-file-" + post.id}
                            className="tv-post-file-input"
                            type="file"
                            accept={SOCIAL_IMAGE_ACCEPT}
                            hidden
                            onChange={function(e) {
                              const file = e.target.files && e.target.files[0];
                              if (!file) return;
                              if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
                                setSocialError(t("social_errImageType"));
                                return;
                              }
                              if (file.size > SOCIAL_IMAGE_MAX_BYTES) {
                                setSocialError(t("social_errImageSize"));
                                return;
                              }
                              const preview = commentPreviews[post.id];
                              if (preview && String(preview).startsWith("blob:")) {
                                try { URL.revokeObjectURL(preview); } catch (_err) {}
                              }
                              setCommentImages(function(prev) {
                                return Object.assign({}, prev, { [post.id]: file });
                              });
                              try {
                                const url = URL.createObjectURL(file);
                                setCommentPreviews(function(prev) {
                                  return Object.assign({}, prev, { [post.id]: url });
                                });
                              } catch (_err) {}
                            }}
                          />
                        </span>
                      ) : null}
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            className="tv-react-btn tv-post-manage-btn"
                            title={t("social_editPost")}
                            disabled={Boolean(socialActionId)}
                            onClick={function() { handleSocialEditStart(post); }}
                          >
                            <i className="fa-solid fa-pen" />
                          </button>
                          <button
                            type="button"
                            className="tv-react-btn tv-post-manage-btn danger"
                            title={t("social_deletePost")}
                            disabled={Boolean(socialActionId)}
                            onClick={function() { handleSocialDelete(post); }}
                          >
                            <i className="fa-solid fa-trash" />
                          </button>
                        </>
                      ) : null}
                      {isServerPost && socialIdentity.isLoggedIn ? (
                        <button
                          type="button"
                          className="tv-post-submit tv-comment-submit"
                          disabled={!String(commentDrafts[post.id] || "").trim() || commentBusyId === String(post.id)}
                          onClick={function() { handleSocialCommentSubmit(post); }}
                        >
                          {commentBusyId === String(post.id) ? t("social_posting") : t("social_comment")}
                        </button>
                      ) : null}
                    </div>
                    ) : null}
                    {!isEditing && isServerPost && comments.length > 0 ? (
                      <div className="tv-post-comments">
                        {visibleComments.map(function(comment) {
                          return (
                            <div className="tv-post-comment" key={comment.id}>
                              <div className="tv-post-comment-hdr">
                                <img className="tv-post-avatar" src={comment.avatar || socialAvatarUrl(comment.author)} alt="" />
                                <div className="tv-post-meta">
                                  <span className="tv-post-author">{comment.author}</span>
                                  <span className="tv-post-time">{timeAgo(comment.createdAt)}</span>
                                </div>
                              </div>
                              <p className="tv-post-comment-body">{comment.body}</p>
                              {comment.image ? (
                                <figure className="tv-post-photo">
                                  <img src={comment.image} alt="" />
                                </figure>
                              ) : null}
                            </div>
                          );
                        })}
                        {hiddenCommentCount > 0 ? (
                          <div className="tv-feed-more">
                            <button
                              type="button"
                              className="tv-feed-more-btn"
                              onClick={function() {
                                setExpandedCommentPosts(function(prev) {
                                  const next = Object.assign({}, prev);
                                  if (threadExpanded) delete next[post.id];
                                  else next[post.id] = true;
                                  return next;
                                });
                              }}
                            >
                              {threadExpanded
                                ? t("social_showFewerComments")
                                : tp("social_showMoreComments", hiddenCommentCount)}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {!isEditing && isServerPost ? (
                      socialIdentity.isLoggedIn ? (
                          <div className="tv-comment-form">
                            <textarea
                              className="tv-post-input"
                              rows={2}
                              placeholder={t("social_addComment")}
                              value={commentDrafts[post.id] || ""}
                              onChange={function(e) {
                                const value = e.target.value;
                                setCommentDrafts(function(prev) {
                                  return Object.assign({}, prev, { [post.id]: value });
                                });
                                setSocialError("");
                              }}
                            />
                            {commentPreviews[post.id] ? (
                              <div className="tv-post-image-preview">
                                <img src={commentPreviews[post.id]} alt="" />
                                <button
                                  type="button"
                                  className="tv-post-image-preview-x"
                                  aria-label={t("social_removeImage")}
                                  onClick={function() {
                                    const preview = commentPreviews[post.id];
                                    if (preview && String(preview).startsWith("blob:")) {
                                      try { URL.revokeObjectURL(preview); } catch (_e) {}
                                    }
                                    setCommentImages(function(prev) {
                                      const next = Object.assign({}, prev);
                                      delete next[post.id];
                                      return next;
                                    });
                                    setCommentPreviews(function(prev) {
                                      const next = Object.assign({}, prev);
                                      delete next[post.id];
                                      return next;
                                    });
                                  }}
                                >
                                  <i className="fa-solid fa-xmark" />
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <p className="tv-social-sub tv-comment-login-prompt">
                            {/* Whole sentence lives inside the link: splitting it around the
                                anchor cannot be word-ordered correctly in every language. */}
                            <a className="tv-steam-login-btn tv-steam-login-btn--inline" href={steamLoginHref()}>
                              {t("social_signInToComment")}
                            </a>
                          </p>
                        )
                    ) : null}
                  </article>
                );
              })}
              {!socialLoading && hiddenSocialCount > 0 ? (
                <div className="tv-feed-more">
                  <button
                    type="button"
                    className="tv-feed-more-btn"
                    onClick={function() { setSocialFeedExpanded(!socialFeedExpanded); }}
                  >
                    {socialFeedExpanded
                      ? t("social_showFewerPosts")
                      : tp("social_showMorePosts", hiddenSocialCount)}
                  </button>
                </div>
              ) : null}
            </div>
          </section>
        {giphyOpen ? (
          <div
            className="tv-overlay tv-giphy-overlay"
            onMouseDown={function(event) {
              if (event.target === event.currentTarget) closeGiphyPicker();
            }}
          >
            <div
              className="tv-modal tv-giphy-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="tv-giphy-title"
              onMouseDown={function(event) { event.stopPropagation(); }}
            >
              <div className="tv-modal-hdr">
                <h3 id="tv-giphy-title">{t("giphy_title")}</h3>
                <button type="button" className="tv-modal-x" onClick={closeGiphyPicker} aria-label={t("giphy_close")}>
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
              <form
                className="tv-giphy-search"
                onSubmit={function(event) {
                  event.preventDefault();
                  const q = giphyQuery.trim();
                  if (!q) return;
                  if (giphySearchTimerRef.current) {
                    clearTimeout(giphySearchTimerRef.current);
                    giphySearchTimerRef.current = null;
                  }
                  loadGiphyResults("search", q);
                }}
              >
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <input
                  type="search"
                  value={giphyQuery}
                  placeholder={t("giphy_searchPlaceholder")}
                  onChange={function(e) { setGiphyQuery(e.target.value); }}
                  autoFocus
                />
              </form>
              {giphyView === "results" ? (
                <div className="tv-giphy-results-bar">
                  <button
                    type="button"
                    className="tv-giphy-back"
                    onClick={function() {
                      if (giphySearchTimerRef.current) {
                        clearTimeout(giphySearchTimerRef.current);
                        giphySearchTimerRef.current = null;
                      }
                      giphySearchSeqRef.current += 1;
                      giphyTypedQueryRef.current = false;
                      setGiphyQuery("");
                      setGiphyView("categories");
                      setGiphyHeading({ kind: "categories", query: "" });
                      setGiphyResults([]);
                      setGiphyError("");
                      setGiphyLoading(false);
                    }}
                  >
                    <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                    {t("giphy_categories")}
                  </button>
                  <span className="tv-giphy-heading">
                    {giphyHeading?.kind === "favourites" ? t("giphy_favourites")
                      : giphyHeading?.kind === "trending" ? t("giphy_trending")
                      : giphyHeading?.kind === "search" ? (giphyHeading.query || t("giphy_results"))
                      : t("giphy_categories")}
                  </span>
                </div>
              ) : null}
              <div className="tv-giphy-body">
                {giphyLoading ? <p className="tv-giphy-status">{t("giphy_loading")}</p> : null}
                {!giphyLoading && giphyError ? <p className="tv-giphy-status is-error">{giphyError}</p> : null}
                {!giphyLoading && !giphyError && giphyView === "categories" ? (
                  <div className="tv-giphy-cats">
                    {GIPHY_CATEGORIES.map(function(cat) {
                      const isFav = cat.kind === "favourites";
                      const previewUrl = isFav
                        ? lastSavedGiphyFavouriteUrl(giphyFavs)
                        : String(giphyCatPreviews?.[cat.id] || "").trim();
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          className={
                            "tv-giphy-cat"
                            + (isFav ? " is-fav" : "")
                            + (previewUrl ? " has-preview" : "")
                          }
                          onClick={function() {
                            if (cat.kind === "favourites") loadGiphyResults("favourites");
                            else if (cat.kind === "trending") loadGiphyResults("trending");
                            else loadGiphyResults("search", cat.q);
                          }}
                        >
                          {previewUrl ? (
                            <span
                              className="tv-giphy-cat-bg"
                              style={{ backgroundImage: 'url("' + previewUrl.replace(/\\/g, "\\\\").replace(/"/g, "%22") + '")' }}
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className="tv-giphy-cat-shade" aria-hidden="true" />
                          <span className="tv-giphy-cat-label">
                            {cat.icon ? <i className={cat.icon} aria-hidden="true" /> : null}
                            <span>{t(cat.labelKey)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {!giphyLoading && !giphyError && giphyView === "results" ? (
                  giphyResults.length ? (
                    <div className="tv-giphy-grid">
                      {giphyResults.map(function(gif) {
                        const favOn = isGiphyFavourite(gif.id);
                        return (
                          <div key={gif.id} className="tv-giphy-cell">
                            <button
                              type="button"
                              className="tv-giphy-cell-pick"
                              title={gif.title || "GIF"}
                              onClick={function() { pickSocialGiphy(gif); }}
                            >
                              <img src={gif.preview || gif.url} alt={gif.title || ""} loading="lazy" />
                            </button>
                            <button
                              type="button"
                              className={"tv-giphy-fav-btn" + (favOn ? " is-on" : "")}
                              aria-label={favOn ? t("giphy_removeFav") : t("giphy_saveFav")}
                              aria-pressed={favOn ? "true" : "false"}
                              onClick={function(event) { toggleGiphyFavourite(gif, event); }}
                            >
                              <i className={favOn ? "fa-solid fa-heart" : "fa-regular fa-heart"} aria-hidden="true" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="tv-giphy-status">{t("giphy_noResults")}</p>
                  )
                ) : null}
              </div>
              <div className="tv-giphy-foot">
                <span>{t("giphy_poweredBy")}</span>
              </div>
            </div>
          </div>

        ) : null}
      </>
    );
  }

  window.CS2React = window.CS2React || {};
  window.CS2React.CommunityIdeas = CommunityIdeas;
})();
