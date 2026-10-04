(() => {
  const { useCallback, useEffect, useMemo, useRef, useState } = React;
  const { Layout, mountPage, classNames, stripMarkMarkdown, formatChatRichText, ChatForecastChart, ChatAssistantCharts, ChatAssistantMessageExtras, ChatMarketSnapshot, ChatMetricsStrip, ChatKeyFactorsStrip, ChatSentimentStrip, ChatItemCards, parseChatItems, prepareChatAssistantSections, synthesizeChatFallbackMarkdown, chatMarkdownHasVisibleBody, resolveChatAssistantBodyMarkdown, chatReplyFromPayload, isChatEmptyReplyFailure, useSteamSession, sessionDisplayName, sessionAvatarUrl, sessionProviderLabel, useI18n, CategoryNavIcon, CSIcon } = window.CS2React;
  const displaySessionName = typeof sessionDisplayName === "function"
    ? sessionDisplayName
    : (user) => String(user?.persona_name || user?.display_name || user?.name || user?.email || "").trim();
  // The greeting needs the person's actual name, never the provider fallback.
  // sessionDisplayName returns sessionProviderLabel(user) when no name is set,
  // which is right for a profile tooltip ("Steam profile") and wrong here: a
  // signed-out visitor was greeted "Good afternoon, Steam" (owner, 2026-10-03).
  // greetingForHour already drops the comma for an empty name, so this only has
  // to stop handing it a placeholder.
  const greetingName = (user) =>
    String(user?.persona_name || user?.display_name || user?.name || user?.email || "").trim();
  const avatarSessionUrl = typeof sessionAvatarUrl === "function"
    ? sessionAvatarUrl
    : (user) => String(user?.avatar || user?.picture || "").trim();
  const useAskAiSelectionComposer = typeof window.CS2React.useAskAiSelectionComposer === "function"
    ? window.CS2React.useAskAiSelectionComposer
    : function useAskAiSelectionComposer() {};

  // Phone browsers disagree about what 100dvh is: Brave/Chrome on Android can
  // report a taller box than the part of the screen you actually see, which
  // leaves the composer floating above the bottom edge. The visual viewport is
  // the only measurement that always matches what the user sees, so the phone
  // CSS uses this variable instead. It also tracks the on-screen keyboard.
  (() => {
    const viewport = window.visualViewport || null;
    const root = document.documentElement;
    let appliedHeight = 0;
    let appliedInset = -1;
    const sync = () => {
      const visual = viewport ? Math.round(viewport.height) : 0;
      const layout = Math.round(root.clientHeight || window.innerHeight || 0);
      // The page always fills the screen; the keyboard is handled separately, by
      // sliding the prompt bar instead of resizing the whole layout under it.
      const height = Math.max(visual, layout);
      if (height > 0 && height !== appliedHeight) {
        appliedHeight = height;
        root.style.setProperty("--app-height", height + "px");
      }

      // What the on-screen keyboard covers, in CSS pixels. Small differences
      // (browser chrome, rounding) are not a keyboard, so they read as zero and
      // the bar stays where it is.
      const offset = viewport ? Math.round(viewport.offsetTop) : 0;
      const covered = visual && layout ? Math.max(0, layout - visual - offset) : 0;
      const inset = covered > 120 ? covered : 0;
      if (inset !== appliedInset) {
        appliedInset = inset;
        root.style.setProperty("--keyboard-inset", inset + "px");
      }
    };
    sync();
    // One measurement at parse time is not enough: phone browsers settle their
    // chrome (and this app's own layout) over the next moment, and a tab that
    // was restored or backgrounded reports the old size until it repaints.
    window.setTimeout(sync, 250);
    window.setTimeout(sync, 1200);
    // Some phone browsers resize the viewport without firing a resize event
    // (toolbar slide-ins, tab restores). Comparing two integers once a second
    // costs nothing and writes only when the height actually changed.
    window.setInterval(sync, 1000);
    window.addEventListener("load", sync);
    window.addEventListener("pageshow", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    document.addEventListener("visibilitychange", sync);
    if (viewport) {
      viewport.addEventListener("resize", sync);
      viewport.addEventListener("scroll", sync);
    }
  })();

  // tf2.html mounts this same page as Mark for Team Fortress 2 (the page
  // declares data-game="tf2" on <html>): TF2 starters, copy and a separate
  // chat history, and every question goes to the TF2 answer path.
  const PAGE_TF2 = typeof document !== "undefined"
    && document.documentElement.getAttribute("data-game") === "tf2";
  // TF2's assistant is Dell. The shared i18n strings name Mark, so on TF2 the
  // name is swapped in place, keeping the declined endings the Slavic
  // languages attach (pl "Marka" → "Della", cs "Markovi" → "Dellovi", ru
  // "Марка" → "Делла"). JavaScript's \b is ASCII-only, so the Cyrillic form
  // uses lookarounds instead. "Market" and other words never match.
  const dellify = (text) => String(text || "")
    // pl instrumental: the "i" softens the k of Mark, Dell takes plain "em".
    .replace(/\bMarkiem\b/g, "Dellem")
    .replace(/\bMark(a|u|em|ovi|owi)?\b/g, "Dell$1")
    .replace(/(?<![Ѐ-ӿ])Марк(а|у|ом|е)?(?![Ѐ-ӿ])/g, "Делл$1");
  const SESSIONS_KEY = PAGE_TF2 ? "tf2_home_ai_sessions_v1" : "cs2_home_ai_sessions_v1";
  const ACTIVE_KEY = PAGE_TF2 ? "tf2_home_ai_active_v1" : "cs2_home_ai_active_v1";
  const PROJECTS_KEY = PAGE_TF2 ? "tf2_home_ai_projects_v1" : "cs2_home_ai_projects_v1";
  const RATINGS_KEY = "cs2_home_ai_ratings_v1";
  const STEAM_SESSION_CACHE_KEY = "cs2_steam_session_cache";
  const STEAM_SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

  function isCachedSteamAuthenticated() {
    try {
      const raw = window.sessionStorage.getItem(STEAM_SESSION_CACHE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;
      const cachedAt = Number(parsed.cached_at || 0);
      if (cachedAt > 0 && (Date.now() - cachedAt) > STEAM_SESSION_CACHE_TTL_MS) return false;
      return Boolean(parsed.authenticated);
    } catch (_error) {
      return false;
    }
  }

  function createBlankSession() {
    return { id: uid(), title: "New chat", updatedAt: Date.now(), messages: [] };
  }

  /**
   * `prompt` is what the model receives and stays English: scope detection in
   * ai_chat_helpers.php (capsules vs cases vs charms…) matches English words,
   * and the reply language is pinned separately from the site setting.
   * `promptKey` is the same sentence translated, and is what the visitor sees
   * in their own chat bubble.
   */
  const STARTER_PROMPT_POOL = [
    { set: "invest-in", labelKey: "sp_skinsInvest_label", hintKey: "sp_skinsInvest_hint", promptKey: "sp_skinsInvest_prompt", prompt: "Which CS2 skins look best to invest in right now, and why?" },
    { set: "invest-in", labelKey: "sp_casesInvest_label", hintKey: "sp_casesInvest_hint", promptKey: "sp_casesInvest_prompt", prompt: "Which CS2 cases look best to invest in right now, and chart the top pick." },
    { set: "invest-in", labelKey: "sp_stickersInvest_label", hintKey: "sp_stickersInvest_hint", promptKey: "sp_stickersInvest_prompt", prompt: "Which CS2 stickers look best to invest in right now and why?" },
    { set: "invest-in", labelKey: "sp_souvenirsInvest_label", hintKey: "sp_souvenirsInvest_hint", promptKey: "sp_souvenirsInvest_prompt", prompt: "Which CS2 souvenir items look best to invest in right now?" },
    { set: "invest-in", labelKey: "sp_capsulesInvest_label", hintKey: "sp_capsulesInvest_hint", promptKey: "sp_capsulesInvest_prompt", prompt: "Which sticker capsules look best to invest in over the next few months?" },
    { set: "invest-in", labelKey: "sp_collectionsInvest_label", hintKey: "sp_collectionsInvest_hint", promptKey: "sp_collectionsInvest_prompt", prompt: "Which CS2 collections look best to invest in right now?" },
    { set: "portfolio", labelKey: "sp_portfolio20_label", hintKey: "sp_portfolio20_hint", promptKey: "sp_portfolio20_prompt", prompt: "Build a CS2 invest portfolio with about $20 total and explain each pick." },
    { set: "portfolio", labelKey: "sp_portfolio50_label", hintKey: "sp_portfolio50_hint", promptKey: "sp_portfolio50_prompt", prompt: "Build a CS2 invest portfolio with about $50 total and chart the strongest pick." },
    { set: "portfolio", labelKey: "sp_portfolio100_label", hintKey: "sp_portfolio100_hint", promptKey: "sp_portfolio100_prompt", prompt: "Build a CS2 invest portfolio with about $100 total across skins, cases, or stickers." },
    { set: "portfolio", labelKey: "sp_portfolio250_label", hintKey: "sp_portfolio250_hint", promptKey: "sp_portfolio250_prompt", prompt: "Build a CS2 invest portfolio with about $250 total and explain the hold thesis." },
    { set: "portfolio", labelKey: "sp_portfolio500_label", hintKey: "sp_portfolio500_hint", promptKey: "sp_portfolio500_prompt", prompt: "Build a CS2 invest portfolio with about $500 total and chart the top item." },
    { set: "portfolio", labelKey: "sp_portfolio1000_label", hintKey: "sp_portfolio1000_hint", promptKey: "sp_portfolio1000_prompt", prompt: "Build a CS2 invest portfolio with about $1000 total focused on liquid investable items." },
    { set: "portfolio", labelKey: "sp_hold1m_label", hintKey: "sp_hold1m_hint", promptKey: "sp_hold1m_prompt", prompt: "Build a CS2 portfolio for a 1 month hold and explain what could move price." },
    { set: "portfolio", labelKey: "sp_hold3m_label", hintKey: "sp_hold3m_hint", promptKey: "sp_hold3m_prompt", prompt: "Build a CS2 portfolio for a 3 month hold with skins, cases, or stickers." },
    { set: "portfolio", labelKey: "sp_hold6m_label", hintKey: "sp_hold6m_hint", promptKey: "sp_hold6m_prompt", prompt: "Build a CS2 portfolio for a 6 month hold and chart the best pick." },
    { set: "portfolio", labelKey: "sp_hold12m_label", hintKey: "sp_hold12m_hint", promptKey: "sp_hold12m_prompt", prompt: "Build a CS2 portfolio for a 12 month hold and explain the thesis." },
    { set: "portfolio", labelKey: "sp_hold1y_label", hintKey: "sp_hold1y_hint", promptKey: "sp_hold1y_prompt", prompt: "Build a CS2 portfolio for a 1 year hold focused on discontinued or scarce supply." },
    { set: "portfolio", labelKey: "sp_hold3y_label", hintKey: "sp_hold3y_hint", promptKey: "sp_hold3y_prompt", prompt: "Build a CS2 portfolio for a 3 year hold and explain why those items can compound." },
    { set: "item-analysis", labelKey: "sp_itemAnalysis_label", hintKey: "sp_itemAnalysis_hint", promptKey: "sp_itemAnalysis_prompt", prompt: "Pick a random popular CS2 item and give a full invest analysis with price context." },
    { set: "breakout", labelKey: "sp_breakout_label", hintKey: "sp_breakout_hint", promptKey: "sp_breakout_prompt", prompt: "What CS2 items look most likely to go up in price, and create a chart for the top pick." },
    { set: "deals", labelKey: "sp_deals_label", hintKey: "sp_deals_hint", promptKey: "sp_deals_prompt", prompt: "How do I use Deals to find the best CS2 arbitrage opportunities?" },
    { set: "arbitrage", labelKey: "sp_arbitrage_label", hintKey: "sp_arbitrage_hint", promptKey: "sp_arbitrage_prompt", prompt: "Compare Steam Market vs third-party prices and show the best CS2 flip right now." },
    { set: "float", labelKey: "sp_float_label", hintKey: "sp_float_hint", promptKey: "sp_float_prompt", prompt: "Which popular CS2 skins have the biggest low-float premiums right now?" },
    { set: "covert", labelKey: "sp_covert_label", hintKey: "sp_covert_hint", promptKey: "sp_covert_prompt", prompt: "Which covert CS2 rifle skins look most likely to climb, and create a chart for the top pick." },
  ];

  // TF2 starters (tf2.html). English copy directly: label/hint instead of
  // i18n keys.
  const TF2_STARTER_PROMPT_POOL = [
    { set: "portfolio", label: "€20 TF2 portfolio", hint: "Keys, stranges and a cheap spec slice", prompt: "Build me a €20 TF2 portfolio and explain each pick." },
    { set: "portfolio", label: "€50 TF2 portfolio", hint: "A balanced starter backpack", prompt: "Build me a €50 TF2 portfolio and explain each pick." },
    { set: "portfolio", label: "€100 TF2 portfolio", hint: "Room for a first unusual", prompt: "Build me a €100 TF2 portfolio with an unusual and explain the hold plan." },
    { set: "portfolio", label: "20 keys portfolio", hint: "Spread 20 keys across the market", prompt: "Build a TF2 portfolio with 20 keys and explain each pick." },
    { set: "flips", label: "Best TF2 flips", hint: "Mannco buys that clear the Steam fee", prompt: "What are the best TF2 flips right now from Mannco to Steam after fees?" },
    { set: "trading", label: "TF2 trading tips", hint: "How to start trading safely", prompt: "Give me TF2 trading advice for a beginner: keys, ref, where to buy and sell, and how to avoid scams." },
    { set: "keys", label: "Keys vs ref", hint: "Today's key price and ref rate", prompt: "What is the TF2 key price right now and how many ref is a key?" },
    { set: "unusual", label: "Cheap unusual hats", hint: "Particles on a budget", prompt: "What are the best cheap unusual hats to buy in TF2 right now?" },
    { set: "australium", label: "Australium weapons", hint: "Prices of the golden guns", prompt: "Which australium weapons are worth buying in TF2 and what do they cost?" },
    { set: "killstreak", label: "Killstreak kits", hint: "Professional kit prices", prompt: "Which professional killstreak kits are good value in TF2 right now?" },
  ];

  const LANG_SUGGEST_DISMISSED_KEY = "csprice_lang_suggest_dismissed";

  function readDismissedLanguageSuggestions() {
    try {
      const raw = window.localStorage.getItem(LANG_SUGGEST_DISMISSED_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_error) {
      return [];
    }
  }

  function rememberDismissedLanguageSuggestion(code) {
    try {
      const next = readDismissedLanguageSuggestions();
      if (!next.includes(code)) next.push(code);
      window.localStorage.setItem(LANG_SUGGEST_DISMISSED_KEY, JSON.stringify(next));
    } catch (_error) { /* localStorage unavailable */ }
  }

  /**
   * The chat always opens in English. Once the visitor has actually sent
   * something, offer their own language once — never before, and never again
   * after they decline it.
   *
   * @param {boolean} armed  true once at least one prompt has been sent
   */
  function useLanguageSuggestion(armed) {
    const [suggestion, setSuggestion] = useState(null);
    const askedRef = useRef(false);

    useEffect(() => {
      if (!armed || askedRef.current) return;
      const i18n = window.I18N;
      if (!i18n || typeof i18n.suggestLanguage !== "function") return;
      askedRef.current = true;

      let cancelled = false;
      i18n.suggestLanguage().then((hit) => {
        if (cancelled || !hit || !hit.code) return;
        if (hit.code === i18n.getLanguage()) return;
        if (readDismissedLanguageSuggestions().includes(hit.code)) return;
        const meta = i18n.languageMeta(hit.code);
        if (!meta) return;
        setSuggestion({ code: hit.code, source: hit.source, meta });
      });
      return () => { cancelled = true; };
    }, [armed]);

    // Also retire the nudge when the language changes from anywhere else —
    // the navbar picker, say — so it never offers what is already active.
    useEffect(() => {
      const i18n = window.I18N;
      if (!i18n || typeof i18n.subscribe !== "function") return undefined;
      return i18n.subscribe((code) => {
        setSuggestion((current) => (current && current.code === code ? null : current));
      });
    }, []);

    const accept = useCallback(() => {
      if (!suggestion) return;
      window.I18N.setLanguage(suggestion.code);
      setSuggestion(null);
    }, [suggestion]);

    const dismiss = useCallback(() => {
      if (!suggestion) return;
      rememberDismissedLanguageSuggestion(suggestion.code);
      setSuggestion(null);
    }, [suggestion]);

    return { suggestion, accept, dismiss };
  }

  function LanguageSuggestBar({ suggestion, onAccept, onDismiss }) {
    if (!suggestion) return null;
    const tIn = window.I18N && typeof window.I18N.tIn === "function"
      ? window.I18N.tIn
      : (_code, key) => key;
    const { code, meta } = suggestion;
    return (
      <div className="home-ai-langswitch" role="status" aria-label={tIn(code, "langsw_aria")}>
        <span className={`home-ai-langswitch-flag fi fi-${meta.flagCode}`} aria-hidden="true" />
        <span className="home-ai-langswitch-text">
          <strong>{meta.name}</strong>
          <small>{tIn(code, "langsw_prompt")}</small>
        </span>
        <button type="button" className="home-ai-langswitch-accept" onClick={onAccept}>
          {tIn(code, "langsw_switch")}
        </button>
        <button type="button" className="home-ai-langswitch-dismiss" onClick={onDismiss}>
          {tIn(code, "langsw_dismiss")}
        </button>
      </div>
    );
  }

  function pickStarterPrompts(pool, count) {
    const copy = pool.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    const picked = [];
    const usedSets = new Set();
    for (const entry of copy) {
      if (picked.length >= count) break;
      const setKey = String(entry?.set || entry?.labelKey || "");
      if (setKey && usedSets.has(setKey)) continue;
      if (setKey) usedSets.add(setKey);
      picked.push(entry);
    }
    return picked;
  }

  function StarterPromptIcon() {
    return (
      <svg className="home-ai-starter-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none">
        <path
          d="M12 3.75c-4.28 0-7.75 2.95-7.75 6.6 0 2.05 1.1 3.88 2.85 5.05l-.95 3.55 3.7-1.55c.7.2 1.45.3 2.15.3 4.28 0 7.75-2.95 7.75-6.6S16.28 3.75 12 3.75Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M8.6 9.35h6.8M8.6 12.15h6.8M8.6 14.95h4.1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const WATCHLIST_KEY = "cs2_watchlist";

  function readWatchlistItems() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed.map((entry, index) => {
        const id = String(entry?.id || entry?.key || entry?.itemId || `watch-${index}`);
        const name = String(entry?.name || entry?.title || entry?.marketHashName || "CS2 Item");
        const image = String(entry?.image || entry?.img || "");
        const href = String(entry?.item_page_url || entry?.href || "");
        const price = Number(entry?.current_price ?? entry?.price ?? 0);
        return {
          id,
          name,
          image,
          href,
          price: Number.isFinite(price) && price > 0 ? price : null,
          wear: entry?.wear || "",
        };
      });
    } catch (_error) {
      return [];
    }
  }

  // ── Profile panel ─────────────────────────────────────────────────────────
  // index.html?panel=profile, the same place the watchlist and charts live, so
  // account settings sit in the page the visitor is already on rather than in
  // a page of their own.
  //
  // Email accounts only: a Steam session has no row in `users` to edit, and
  // profile_api.php refuses those with a 403.
  const STEAM_LINK_NOTICES = {
    linked: { tone: "ok", text: "Steam account connected." },
    taken: { tone: "error", text: "That Steam account is already connected to another profile." },
    error: { tone: "error", text: "Could not connect Steam. Try again." },
    not_email: { tone: "error", text: "Sign in with an email account to connect Steam." },
  };

  // discord_link.php / discord_callback.php redirect back here with the outcome.
  const DISCORD_LINK_NOTICES = {
    linked: { tone: "ok", text: "Discord account connected." },
    taken: { tone: "error", text: "That Discord account is already connected to another profile." },
    cancelled: { tone: "error", text: "Discord connection cancelled." },
    error: { tone: "error", text: "Could not connect Discord. Try again." },
    unavailable: { tone: "error", text: "Discord sign-in is not set up on this site yet." },
    not_email: { tone: "error", text: "Sign in with an email account to connect Discord." },
  };

  // verify_email_change.php redirects back here with the outcome.
  const EMAIL_CHANGE_NOTICES = {
    ok: { tone: "ok", text: "Email address changed. You sign in with the new one from now on." },
    taken: { tone: "error", text: "That address is now used by another account, so the change was dropped." },
    expired: { tone: "error", text: "That confirmation link has expired. Start the change again." },
    invalid: { tone: "error", text: "That confirmation link is not valid or has already been used." },
    error: { tone: "error", text: "Could not change the address. Try again." },
  };

  // reset_password.php redirects a signed-in visitor back here when done.
  const PASSWORD_NOTICES = {
    ok: { tone: "ok", text: "Password changed." },
  };

  // verify.php redirects back here with the outcome.
  const VERIFY_NOTICES = {
    ok: { tone: "ok", text: "Email confirmed. Thanks." },
    already: { tone: "ok", text: "That address was already confirmed." },
    expired: { tone: "error", text: "That link has expired. Send yourself a new one below." },
    invalid: { tone: "error", text: "That confirmation link is not valid or has already been used." },
    error: { tone: "error", text: "Could not confirm the address. Try again." },
    notsent: {
      tone: "error",
      text: "Your account was created, but the confirmation email could not be sent. Try Resend below.",
    },
  };

  // ── Hero background: drifting wave lines ─────────────────────────────────
  // Thirty horizontal sine lines across the hero, every fifth one brighter
  // with a soft glow, fading out toward the edges and sliding slowly left in
  // a seamless loop. The SVG is drawn at double width; both wave periods
  // divide the 1600-unit view, so the second half repeats the first and a
  // translateX(-50%) loop never shows a seam. Only `transform` animates.
  //
  // Tweak here: line count, band (top/bottom), the two amplitudes/periods,
  // colours, glow radius, and the loop duration (CSS: --home-ai-waves-speed).
  const HERO_WAVES = {
    lines: 30,
    top: -60,
    bottom: 960,
    viewWidth: 1600,
    viewHeight: 900,
    step: 20,
    amp1: 35,
    period1: 800,
    amp2: 12,
    period2: 400,
    // The phases variant 10 of the wave gallery draws with (its seeded RNG:
    // seed 1081, first two draws times 2Ď€).
    phase1: 0.053158,
    phase2: 1.208564,
    accentEvery: 5,
    // A touch under the gallery's 0.25 / 0.55: at full screen the lines read
    // brighter than in the 560px preview.
    line: { stroke: "#1f4fb8", width: 0.9, opacity: 0.19 },
    accent: { stroke: "#9fc4ff", width: 1.62, opacity: 0.4, glow: 5 },
    // Film-grain overlay (8% opacity, overlay blend). Set to false to drop it.
    grain: true,
  };

  function heroWavePath(index, cfg) {
    const base = cfg.top + ((cfg.bottom - cfg.top) * index) / Math.max(1, cfg.lines - 1);
    const width = cfg.viewWidth * 2;
    const parts = [];
    for (let x = 0; x <= width; x += cfg.step) {
      const y = base
        + cfg.amp1 * Math.sin((2 * Math.PI * x) / cfg.period1 + cfg.phase1 + index * 0.35)
        + cfg.amp2 * Math.sin((2 * Math.PI * x) / cfg.period2 + cfg.phase2 + index * 0.9);
      parts.push(`${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`);
    }
    return parts.join(" ");
  }

  function HeroWaves({ config = HERO_WAVES }) {
    const paths = useMemo(() => (
      Array.from({ length: config.lines }, (_unused, index) => ({
        index,
        d: heroWavePath(index, config),
        accent: index % config.accentEvery === 0,
      }))
    ), [config]);

    // The placement is inline as well as in home-ai.css: if a browser is still
    // holding an older stylesheet, the layer must not fall into the hero's
    // grid as a 540px block above the headline. The mask and the drift
    // animation stay in the stylesheet.
    const layerStyle = { position: "absolute", inset: 0, zIndex: -1, overflow: "hidden", pointerEvents: "none" };
    const svgStyle = { position: "absolute", top: 0, left: 0, width: "200%", height: "100%", display: "block" };

    // The drift and the edge fade ride along inline too, for the same reason:
    // the layer must animate even when home-ai.css is an older cached copy.
    const inlineCss = [
      "@keyframes homeAiWavesDrift{from{transform:translateX(0)}to{transform:translateX(-50%)}}",
      ".home-ai-waves{-webkit-mask-image:radial-gradient(ellipse 75% 70% at 50% 50%,#000 25%,transparent 82%);mask-image:radial-gradient(ellipse 75% 70% at 50% 50%,#000 25%,transparent 82%)}",
      ".home-ai-waves svg{will-change:transform;animation:homeAiWavesDrift 80s linear infinite}",
      "@media (prefers-reduced-motion:reduce){.home-ai-waves svg{animation:none}}",
    ].join("");

    return (
      <div className="home-ai-waves" aria-hidden="true" style={layerStyle}>
        <style>{inlineCss}</style>
        <svg
          viewBox={`0 0 ${config.viewWidth * 2} ${config.viewHeight}`}
          preserveAspectRatio="none"
          focusable="false"
          style={svgStyle}
        >
          <defs>
            <filter id="home-ai-wave-glow" x="-10%" y="-50%" width="120%" height="200%" colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={config.accent.glow} result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g fill="none" strokeLinecap="round">
            {paths.filter((line) => !line.accent).map((line) => (
              <path
                key={line.index}
                d={line.d}
                stroke={config.line.stroke}
                strokeWidth={config.line.width}
                strokeOpacity={config.line.opacity}
              />
            ))}
            <g filter="url(#home-ai-wave-glow)">
              {paths.filter((line) => line.accent).map((line) => (
                <path
                  key={line.index}
                  d={line.d}
                  stroke={config.accent.stroke}
                  strokeWidth={config.accent.width}
                  strokeOpacity={config.accent.opacity}
                />
              ))}
            </g>
          </g>
        </svg>
        {config.grain ? <div className="home-ai-grain" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} /> : null}
      </div>
    );
  }

  // "January 21, 2026" for the Account tile; the raw value is a MySQL datetime.
  function formatProfileDate(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";
    const parsed = new Date(text.includes("T") ? text : text.replace(" ", "T") + "Z");
    if (Number.isNaN(parsed.getTime())) return text.slice(0, 10);
    return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  const PERSONA_MAX_CHARS = 600;
  const PERSONA_EXAMPLES = [
    "Talk like a professor and explain the reasoning behind every price call.",
    "Only memes and jokes. Keep it fun, but keep the numbers right.",
    "Short answers, no fluff. Numbers first, then one sentence why.",
    "Explain everything like I'm new to CS2 trading.",
    "Be brutally honest about bad investments.",
  ];


  // Account settings (index.html?panel=profile). Layout and tokens follow the
  // account-page spec: a 380px profile column, AI personality and security
  // across the other two, connections and appearance side by side. Colours
  // are the theme tokens from styles/css/theme.css, so the page follows the
  // site theme (Light / Dark / System) like the rest of index.html.

  // The spec's stroke icons, drawn inline so they match it stroke for stroke.
  const ACCT_ICON_PATHS = {
    camera: (
      <>
        <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </>
    ),
    spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>
    ),
    check: <path d="M5 12l5 5 9-10" />,
    chevron: <path d="M6 9l6 6 6-6" />,
  };

  function AcctIcon({ name, size = 16, className }) {
    const shape = ACCT_ICON_PATHS[name];
    if (!shape) return null;
    return (
      <svg
        className={classNames("acct-icon", className)}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {shape}
      </svg>
    );
  }

  // Steam / Discord marks: the Font Awesome brand glyphs the site already
  // loads (the official logos), sized like the spec's SVGs.
  function BrandIcon({ name, size = 16 }) {
    return <i className={`fa-brands fa-${name} acct-brand`} style={{ fontSize: size }} aria-hidden="true" />;
  }

  // "d••••••@gmail.com": first letter, six dots, the domain.
  function maskEmail(email) {
    const text = String(email || "");
    const at = text.indexOf("@");
    if (at <= 0) return text;
    return text.slice(0, 1) + "••••••" + text.slice(at);
  }

  // Light / Dark / System. The choice goes through the shared theme system
  // (window.CS2React.applyThemeChoice: localStorage "csprice-theme",
  // html[data-theme], the account when signed in, one "csprice:theme-change"
  // event); the fallback below only covers a stale shared bundle.
  const THEME_OPTIONS = [
    { id: "light", icon: "sun", label: "Light" },
    { id: "dark", icon: "moon", label: "Dark" },
    { id: "system", icon: "monitor", label: "System" },
  ];

  function readThemeChoiceSafe() {
    const api = window.CS2React || {};
    if (typeof api.readThemeChoice === "function") return api.readThemeChoice();
    try {
      const stored = String(window.localStorage.getItem("csprice-theme") || "");
      if (["light", "dark", "system"].includes(stored)) return stored;
    } catch (_error) { /* private mode */ }
    return "system";
  }

  function applyThemeChoiceSafe(choice) {
    const api = window.CS2React || {};
    if (typeof api.applyThemeChoice === "function") {
      api.applyThemeChoice(choice);
      return;
    }
    const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = choice === "system" ? (dark ? "dark" : "light") : choice;
    try { window.localStorage.setItem("csprice-theme", choice); } catch (_error) { /* private mode */ }
    document.documentElement.setAttribute("data-theme", resolved);
    window.dispatchEvent(new CustomEvent("csprice:theme-change", { detail: { choice, resolved } }));
  }

  function ThemeRadioGroup({ labelledBy }) {
    const [choice, setChoice] = useState(() => (
      (window.__cspriceTheme && window.__cspriceTheme.choice) || readThemeChoiceSafe()
    ));
    const buttonRefs = useRef([]);

    useEffect(() => {
      const onChange = (event) => setChoice((event.detail && event.detail.choice) || readThemeChoiceSafe());
      window.addEventListener("csprice:theme-change", onChange);
      return () => window.removeEventListener("csprice:theme-change", onChange);
    }, []);

    const pick = (id) => {
      setChoice(id);
      applyThemeChoiceSafe(id);
    };

    // Arrow keys move the selection like a native radio group.
    const onKeyDown = (event, index) => {
      const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
      const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
      if (!forward && !back) return;
      event.preventDefault();
      const next = (index + (forward ? 1 : -1) + THEME_OPTIONS.length) % THEME_OPTIONS.length;
      pick(THEME_OPTIONS[next].id);
      const el = buttonRefs.current[next];
      if (el) el.focus();
    };

    return (
      <div className="acct-segmented" role="radiogroup" aria-labelledby={labelledBy}>
        {THEME_OPTIONS.map((option, index) => {
          const active = choice === option.id;
          return (
            <button
              key={option.id}
              ref={(el) => { buttonRefs.current[index] = el; }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              className={classNames("acct-segment", active && "is-active")}
              onClick={() => pick(option.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <AcctIcon name={option.icon} size={15} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Primary save button with its three states: idle, saving, "Saved" (brief).
  function SaveButton({ label = "Save", state = "", disabled = false, onClick, type = "button", className }) {
    return (
      <button
        type={type}
        className={classNames("acct-btn acct-btn--primary", state === "saved" && "is-saved", className)}
        disabled={disabled || state === "busy"}
        onClick={onClick}
        aria-live="polite"
      >
        {state === "busy" ? (
          <>
            <span className="acct-spinner" aria-hidden="true" />
            Saving…
          </>
        ) : state === "saved" ? (
          <>
            <AcctIcon name="check" />
            Saved
          </>
        ) : label}
      </button>
    );
  }

  // Starting points for the AI personality box. Picking one fills the box;
  // typing anything else deselects it; a saved text that equals a preset
  // shows that preset as selected.
  const PERSONA_PRESETS = [
    {
      id: "direct",
      title: "Straight to the point",
      subtitle: "Short, no fluff",
      text: "Straight to the point: short answers, no fluff. Numbers first, then one sentence why.",
    },
    {
      id: "meme",
      title: "Meme mode",
      subtitle: "Funny, full of memes",
      text: "Meme mode: be funny and use memes and jokes in every answer, but keep the numbers right.",
    },
    {
      id: "analyst",
      title: "Deep analyst",
      subtitle: "Charts and data",
      text: "Deep analyst: lead with charts and data, explain the reasoning behind every price call and quantify the risk.",
    },
    {
      id: "beginner",
      title: "Beginner friendly",
      subtitle: "Explains everything",
      text: "Beginner friendly: explain everything like I'm new to CS2 trading, define the jargon and keep it patient.",
    },
  ];

  /**
   * The profile panel while its row is on its way: avatar with a spinning
   * ring, the heading, an indeterminate bar and a status line (`status` is
   * swapped per stage by the caller). CSS-only animation; the heading and
   * status sit in a polite live region.
   */
  function ProfileLoadingState({ status = "Fetching your inventory from Steam" }) {
    return (
      <div className="profile-loading">
        <div className="profile-loading-avatar-wrap" aria-hidden="true">
          <span className="profile-loading-ring" />
          <i className="fa-regular fa-user profile-loading-icon" />
        </div>
        <div className="profile-loading-text" role="status" aria-live="polite">
          <h1 className="profile-loading-heading">Loading your profile</h1>
          <div className="profile-loading-bar" aria-hidden="true"><span className="profile-loading-bar-fill" /></div>
          <p className="profile-loading-status">{status}</p>
        </div>
      </div>
    );
  }

  /* ─── PROFILE: INVENTORY SECTION ───────────────────────────────────────
     Full-width card under the account cards that hosts the inventory
     dashboard from login.html as it is (react/auth-pages.js rendering into
     #inventory-embed; its stylesheets are loaded on demand). The user
     preferred that UI over a separate one (2026-10-03: "take this exact
     inventory UI and put it after the profile"). Steam not connected shows
     the connect state instead. */

  function invAssetFromMeta(name) {
    const meta = typeof document !== "undefined" ? document.querySelector(`meta[name="${name}"]`) : null;
    return meta ? String(meta.getAttribute("content") || "").trim() : "";
  }

  function invEnsureStylesheet(href) {
    if (!href || document.querySelector(`link[data-inv-embed="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-inv-embed", href);
    document.head.appendChild(link);
    // login.css paints html/body for its own page; the profile keeps its colours.
    if (!document.getElementById("inv-embed-override")) {
      const style = document.createElement("style");
      style.id = "inv-embed-override";
      style.textContent = "html,body{color:var(--text,#fff);scrollbar-width:auto;-ms-overflow-style:auto}html::-webkit-scrollbar,body::-webkit-scrollbar{display:block;width:auto}";
      document.head.appendChild(style);
    }
  }

  // The asset URLs come from the page's <meta name="inv-*"> tags; after a
  // soft navigation the head still belongs to the page the visit started on
  // (deals.html has no such metas), so they are read from login.html itself
  // in that case - always in step with the current tags (bug seen 2026-10-03:
  // "Inventory dashboard script is not configured on this page").
  let invAssetsPromise = null;
  function invResolveAssets() {
    const fromMeta = {
      login: invAssetFromMeta("inv-login-css"),
      collections: invAssetFromMeta("inv-collections-css"),
      dash: invAssetFromMeta("inv-dash-css"),
      js: invAssetFromMeta("inv-dash-js"),
    };
    if (fromMeta.js && fromMeta.dash && fromMeta.login) return Promise.resolve(fromMeta);
    if (!invAssetsPromise) {
      invAssetsPromise = fetch("login.html", { credentials: "same-origin", cache: "no-cache" })
        .then((response) => (response.ok ? response.text() : ""))
        .then((html) => {
          const find = (pattern) => {
            const match = html.match(pattern);
            return match ? match[1] : "";
          };
          return {
            login: fromMeta.login || find(/href="((?:[^"]*\/)?styles\/css\/login\.css[^"]*)"/),
            collections: fromMeta.collections || find(/href="((?:[^"]*\/)?styles\/css\/collections\.css[^"]*)"/),
            dash: fromMeta.dash || find(/href="((?:[^"]*\/)?styles\/css\/inventory-dashboard\.css[^"]*)"/),
            js: fromMeta.js || find(/src="((?:[^"]*\/)?react\/auth-pages\.js[^"]*)"/),
          };
        })
        .catch(() => fromMeta);
    }
    return invAssetsPromise;
  }

  let invDashboardSource = null;
  async function invRunDashboard() {
    const assets = await invResolveAssets();
    [assets.login, assets.collections, assets.dash].forEach((href) => invEnsureStylesheet(href));
    const src = assets.js;
    if (!src) throw new Error("The inventory dashboard could not be located. Refresh the page.");
    if (!invDashboardSource) {
      const response = await fetch(src, { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Inventory dashboard could not be loaded (HTTP ${response.status}).`);
      invDashboardSource = await response.text();
    }
    // A fresh instance each time the panel mounts; the script finds
    // #inventory-embed and renders into it.
    new Function(invDashboardSource)();
  }

  function ProfileInventorySection({ steamId, tf2 }) {
    const [error, setError] = useState("");
    const hostRef = useRef(null);
    const sectionRef = useRef(null);
    const game = tf2 ? "TF2" : "CS2";

    // index.html?panel=profile#inventory (the account menu's Inventory entry)
    // lands on this section: scroll to it once it is on the page, and again
    // when the dashboard has rendered and pushed it down.
    const scrollToSelf = useCallback(() => {
      try {
        if (window.location.hash !== "#inventory" || !sectionRef.current) return;
        sectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (_error) { /* ignore */ }
    }, []);
    useEffect(() => {
      const timer = window.setTimeout(scrollToSelf, 80);
      return () => window.clearTimeout(timer);
    }, [scrollToSelf]);

    useEffect(() => {
      if (!steamId) return undefined;
      let alive = true;
      invRunDashboard().then(() => { if (alive) window.setTimeout(scrollToSelf, 400); }).catch((err) => {
        if (alive) setError(err && err.message ? err.message : "Inventory could not be loaded.");
      });
      return () => {
        alive = false;
        if (hostRef.current) hostRef.current.innerHTML = "";
        document.body.classList.remove("steam-dashboard-page");
      };
    }, [steamId]);

    return (
      <section className="acct-card acct-card--inventory" id="inventory" aria-label="Inventory" ref={sectionRef}>
        {!steamId ? (
          <>
            <div className="acct-inv-head">
              <div>
                <p className="acct-label">Inventory</p>
                <p className="acct-inv-subtitle">Steam not connected</p>
              </div>
            </div>
            <div className="acct-inv-empty">
              <span className="acct-inv-empty-icon" aria-hidden="true"><i className="fa-solid fa-box-open" /></span>
              <h3>Connect Steam to see your inventory</h3>
              <p>We read your public {game} inventory and price every item. Nothing on your Steam account changes.</p>
              <a className="acct-btn acct-btn--primary" href="steam_link.php">
                <BrandIcon name="steam" />
                Connect Steam
              </a>
            </div>
          </>
        ) : (
          <>
            {error ? <p className="acct-error" role="alert">{error}</p> : null}
            <div id="inventory-embed" className="acct-inv-embed steam-dashboard-embed" ref={hostRef} />
          </>
        )}
      </section>
    );
  }

  function ProfilePanel({ user }) {
    const [profile, setProfile] = useState(null);
    const [loadError, setLoadError] = useState("");
    const [name, setName] = useState("");
    const [busy, setBusy] = useState("");
    // Which action just saved, for the brief "Saved" state on its button.
    const [saved, setSaved] = useState("");
    // Errors sit under the field they belong to, keyed by the action label.
    const [fieldErrors, setFieldErrors] = useState({});
    const [emailShown, setEmailShown] = useState(false);
    const [inboxSent, setInboxSent] = useState(false);
    // Email change (Security card): the inline form, and the address a
    // confirmation just went to.
    const [emailEditing, setEmailEditing] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [emailPassword, setEmailPassword] = useState("");
    const [emailSent, setEmailSent] = useState("");
    // Outcome of a round trip that landed back here (email verify, Steam or
    // Discord connect, password change): one line above the cards.
    const [notice] = useState(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        return VERIFY_NOTICES[params.get("verify")]
          || STEAM_LINK_NOTICES[params.get("steam")]
          || DISCORD_LINK_NOTICES[params.get("discord")]
          || EMAIL_CHANGE_NOTICES[params.get("email")]
          || PASSWORD_NOTICES[params.get("password")]
          || null;
      } catch (_error) {
        return null;
      }
    });
    const fileRef = useRef(null);
    const [editorFile, setEditorFile] = useState(null);

    // Language: "auto" until the visitor picks one (i18n keeps the pick in
    // localStorage; without one the site starts in English and offers the
    // visitor's own language after their first prompt).
    const i18nApi = typeof window !== "undefined" ? window.I18N : null;
    const [languageChoice, setLanguageChoice] = useState(() => (
      i18nApi && typeof i18nApi.hasStoredLanguage === "function" && i18nApi.hasStoredLanguage()
        ? String(i18nApi.getLanguage() || "en")
        : "auto"
    ));
    const chooseLanguage = (code) => {
      setLanguageChoice(code);
      if (!i18nApi) return;
      if (code === "auto") {
        try { window.localStorage.removeItem("csprice_lang"); } catch (_error) {}
        if (typeof i18nApi.suggestLanguage === "function") {
          i18nApi.suggestLanguage().then((suggested) => {
            if (suggested && suggested.code) i18nApi.setLanguage(suggested.code);
          }).catch(() => {});
        }
        return;
      }
      i18nApi.setLanguage(code);
    };

    const [persona, setPersona] = useState("");
    // The placeholder cycles through the example instructions every 10s while
    // the box is empty.
    const [personaExampleIndex, setPersonaExampleIndex] = useState(0);
    useEffect(() => {
      if (persona) return undefined;
      const timer = window.setInterval(() => {
        setPersonaExampleIndex((index) => (index + 1) % PERSONA_EXAMPLES.length);
      }, 10000);
      return () => window.clearInterval(timer);
    }, [persona]);

    const applyProfile = useCallback((next) => {
      setProfile(next);
      setName(String(next?.display_name || ""));
      setPersona(String(next?.ai_instructions || ""));
    }, []);

    useEffect(() => {
      let cancelled = false;
      fetch("profile_api.php", { credentials: "same-origin", headers: { Accept: "application/json" } })
        .then(async (response) => {
          const payload = await response.json().catch(() => null);
          if (cancelled) return;
          if (payload?.ok) {
            applyProfile(payload.profile);
            return;
          }
          // A non-JSON body means PHP died before it could answer; the status
          // is the only clue the visitor can pass on, so show it rather than
          // one generic sentence for every possible failure.
          setLoadError(
            payload?.error
            || `profile_api.php returned HTTP ${response.status} without JSON.`
          );
        })
        .catch(() => {
          if (!cancelled) setLoadError("Could not reach the server.");
        });
      return () => { cancelled = true; };
    }, [applyProfile]);

    const post = useCallback(async (body, label) => {
      setBusy(label);
      setFieldErrors((prev) => ({ ...prev, [label]: "" }));
      try {
        const response = await fetch("profile_api.php", {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          body,
        });
        const payload = await response.json().catch(() => null);
        if (!payload?.ok) {
          setFieldErrors((prev) => ({ ...prev, [label]: payload?.error || "That did not save." }));
          return false;
        }
        applyProfile(payload.profile);
        setSaved(label);
        window.setTimeout(() => setSaved((current) => (current === label ? "" : current)), 1800);
        return true;
      } catch (_error) {
        setFieldErrors((prev) => ({ ...prev, [label]: "Could not reach the server." }));
        return false;
      } finally {
        setBusy("");
      }
    }, [applyProfile]);

    // Both of these must stay above the early returns below: a hook that only
    // runs once `profile` has loaded changes the hook count between renders,
    // which is React error #310 and took the whole panel down with it.
    const closeEditor = useCallback(() => setEditorFile(null), []);
    const applyEditor = useCallback(async (blob) => {
      const body = new FormData();
      body.append("action", "avatar");
      body.append("avatar", blob, "avatar.png");
      setEditorFile(null);
      await post(body, "avatar");
    }, [post]);

    if (loadError) {
      return (
        <div className="home-ai-empty compact">
          <i className="fa-regular fa-user home-ai-empty-icon" aria-hidden="true" />
          <h1>Profile unavailable</h1>
          <p>{loadError}</p>
        </div>
      );
    }

    if (!profile) {
      return <ProfileLoadingState status="Fetching your inventory from Steam" />;
    }

    const avatarUrl = String(profile.avatar_url || "");
    const steamId = String(profile.steam_id || "");
    const discordId = String(profile.discord_id || "");
    const initials = String(profile.display_name || profile.email || "U").trim().slice(0, 2).toUpperCase();
    const memberSince = formatProfileDate(profile.created_at);
    const stateOf = (label) => (busy === label ? "busy" : saved === label ? "saved" : "");
    const activePreset = PERSONA_PRESETS.find((preset) => preset.text === persona.trim()) || null;
    const savedPersona = String(profile.ai_instructions || "").trim();
    const languages = i18nApi && Array.isArray(i18nApi.LANGUAGES) ? i18nApi.LANGUAGES : [];
    const avatarRules = "JPG, PNG, WEBP or GIF, up to 3 MB. Cropped to a square.";

    // The picked file opens in the crop dialog first; only the square the
    // person framed there is uploaded.
    const onPickAvatar = (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      setEditorFile(file);
    };

    const fieldError = (label) => (fieldErrors[label] ? (
      <p className="acct-error" role="alert">{fieldErrors[label]}</p>
    ) : null);

    return (
      <div className="home-ai-profile-panel">
        <div className="acct">
          {notice ? (
            <div className={classNames("acct-notice", `is-${notice.tone}`)} role="status">
              {notice.text}
            </div>
          ) : null}

          {/* Unconfirmed email accounts only. Steam accounts have no address to
              confirm, and a confirmed one has nothing left to do. */}
          {profile.email && !profile.email_verified_at ? (
            <div className="acct-verify">
              <span className="acct-iconbox acct-iconbox--tint" aria-hidden="true">
                <i className="fa-regular fa-envelope" />
              </span>
              <div className="acct-conn-text">
                <strong>Confirm your email address</strong>
                <span>We sent a link to {profile.email}. It works for 24 hours.</span>
              </div>
              <SaveButton
                label="Resend"
                state={stateOf("verify")}
                onClick={() => post(new URLSearchParams({ action: "resend_verification" }), "verify")}
              />
              {fieldError("verify")}
            </div>
          ) : null}

          {/* Card 1: profile */}
          <section className="acct-card acct-card--profile" aria-label="Profile">
            <div className="acct-avatar">
              {avatarUrl
                ? <img src={avatarUrl} alt="" />
                : <span>{initials}</span>}
            </div>
            <div className="acct-profile-id">
              <h1 className="acct-username">{profile.display_name || "Your name"}</h1>
              {memberSince ? <p className="acct-member">Member since {memberSince}</p> : null}
              <div className="acct-avatar-actions">
                <button
                  type="button"
                  className="acct-btn acct-btn--primary"
                  title={avatarRules}
                  aria-describedby="acct-avatar-rules"
                  onClick={() => fileRef.current && fileRef.current.click()}
                  disabled={busy === "avatar"}
                >
                  {busy === "avatar" ? <span className="acct-spinner" aria-hidden="true" /> : <AcctIcon name="camera" />}
                  {busy === "avatar" ? "Uploading…" : "Change picture"}
                </button>
                <button
                  type="button"
                  className="acct-btn acct-btn--secondary"
                  onClick={() => post(new URLSearchParams({ action: "avatar_clear" }), "avatar")}
                  disabled={!avatarUrl || busy === "avatar"}
                >
                  Remove
                </button>
              </div>
              <span id="acct-avatar-rules" className="acct-sr-only">{avatarRules}</span>
              {fieldError("avatar")}
            </div>

            <div className="acct-profile-body">
              <form
                className="acct-field"
                onSubmit={(event) => {
                  event.preventDefault();
                  post(new URLSearchParams({ action: "save", display_name: name }), "name");
                }}
              >
                <label className="acct-label" htmlFor="acct-username">Username</label>
                <div className="acct-row">
                  <input
                    id="acct-username"
                    type="text"
                    className="acct-input"
                    value={name}
                    maxLength={40}
                    autoComplete="nickname"
                    aria-describedby="acct-username-hint"
                    onChange={(event) => setName(event.target.value)}
                  />
                  <SaveButton
                    type="submit"
                    state={stateOf("name")}
                    disabled={!name.trim() || name === profile.display_name}
                  />
                </div>
                <p id="acct-username-hint" className="acct-hint">Shown in the navbar. Up to 40 characters.</p>
                {fieldError("name")}
              </form>

              <p className="acct-label acct-label--account">Account</p>
              <dl className="acct-info">
                <div className="acct-info-row">
                  <dt>Signed in with</dt>
                  <dd>{({ email: "Email", steam: "Steam", discord: "Discord", google: "Google" })[String(profile.signed_in_with || "")]
                    || (profile.email ? "Email" : steamId ? "Steam" : discordId ? "Discord" : "Account")}</dd>
                </div>
                <div className="acct-info-row">
                  <dt>Email</dt>
                  <dd>
                    <span className="acct-email" title={emailShown ? profile.email || "" : undefined}>
                      {profile.email ? (emailShown ? profile.email : maskEmail(profile.email)) : "None yet"}
                    </span>
                    {profile.email ? (
                      <button
                        type="button"
                        className={classNames("acct-eye", emailShown && "is-on")}
                        aria-pressed={emailShown}
                        aria-label={emailShown ? "Hide email address" : "Show email address"}
                        onClick={() => setEmailShown((value) => !value)}
                      >
                        <AcctIcon name="eye" size={15} />
                      </button>
                    ) : null}
                  </dd>
                </div>
                {memberSince ? (
                  <div className="acct-info-row">
                    <dt>Member since</dt>
                    <dd>{memberSince}</dd>
                  </div>
                ) : null}
              </dl>

            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={onPickAvatar}
            />
            {editorFile && typeof window.CS2React?.AvatarEditorModal === "function" ? (
              <window.CS2React.AvatarEditorModal
                file={editorFile}
                onCancel={closeEditor}
                onApply={applyEditor}
              />
            ) : null}
          </section>

          {/* Card 2: AI personality. Saved on the account (users.ai_instructions)
              and applied to every answer Mark gives this user. */}
          <section className="acct-card acct-card--ai" aria-label="AI personality">
            <div className="acct-card-head">
              <label className="acct-label" htmlFor="acct-persona">AI personality</label>
              <span className="acct-tag">
                <AcctIcon name="spark" size={14} />
                Mark
              </span>
            </div>
            <div className="acct-presets" role="group" aria-label="Personality presets">
              {PERSONA_PRESETS.map((preset) => {
                const selected = activePreset?.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={classNames("acct-preset", selected && "is-selected")}
                    aria-pressed={selected}
                    onClick={() => setPersona(preset.text)}
                  >
                    <span className="acct-preset-title">{preset.title}</span>
                    <span className="acct-preset-sub">{preset.subtitle}</span>
                  </button>
                );
              })}
            </div>
            <textarea
              id="acct-persona"
              className="acct-textarea"
              maxLength={PERSONA_MAX_CHARS}
              value={persona}
              placeholder={`e.g. ${PERSONA_EXAMPLES[personaExampleIndex]}`}
              aria-describedby="acct-persona-count"
              onChange={(event) => setPersona(event.target.value)}
            />
            {fieldError("persona")}
            <div className="acct-card-foot">
              <span id="acct-persona-count" className="acct-counter" aria-live="polite">
                {persona.length}/{PERSONA_MAX_CHARS}
              </span>
              <span className="acct-spacer" />
              <button
                type="button"
                className="acct-btn acct-btn--secondary"
                disabled={busy === "persona" || (!persona.trim() && !savedPersona)}
                onClick={() => {
                  setPersona("");
                  if (savedPersona) {
                    post(new URLSearchParams({ action: "save_ai", ai_instructions: "" }), "persona");
                  }
                }}
              >
                Clear
              </button>
              <SaveButton
                state={stateOf("persona")}
                disabled={persona.trim() === savedPersona}
                onClick={() => post(new URLSearchParams({ action: "save_ai", ai_instructions: persona.trim() }), "persona")}
              />
            </div>
          </section>

          {/* Card 3: connections. Both start their round trip in a plain link
              so the provider's page opens as a normal navigation. */}
          <section className="acct-card acct-card--connections" aria-label="Connections">
            <p className="acct-label">Connections</p>
            <div className="acct-conn-row">
              <span className="acct-iconbox acct-iconbox--steam" aria-hidden="true">
                <BrandIcon name="steam" size={18} />
              </span>
              <div className="acct-conn-text">
                <strong>Steam</strong>
                <span>Connect Steam to read your inventory.</span>
              </div>
              {steamId ? (
                <div className="acct-conn-state">
                  <span className="acct-tag acct-tag--ok" title={steamId}>
                    <AcctIcon name="check" size={13} />
                    {profile.steam_persona || "Connected"}
                  </span>
                  {/* No disconnect when Steam is the only way into the
                      account: the server refuses it. */}
                  {profile.email || discordId || profile.google_id ? (
                    <button
                      type="button"
                      className="acct-textbtn"
                      disabled={busy === "steam"}
                      onClick={() => post(new URLSearchParams({ action: "unlink_steam" }), "steam")}
                    >
                      {busy === "steam" ? "Working…" : "Disconnect"}
                    </button>
                  ) : null}
                </div>
              ) : (
                <a className="acct-btn acct-btn--steam" href="steam_link.php">
                  <BrandIcon name="steam" />
                  Connect Steam
                </a>
              )}
            </div>
            <div className="acct-conn-row">
              <span className="acct-iconbox acct-iconbox--discord" aria-hidden="true">
                <BrandIcon name="discord" size={18} />
              </span>
              <div className="acct-conn-text">
                <strong>Discord</strong>
                <span>Link Discord to this account.</span>
              </div>
              {discordId ? (
                <div className="acct-conn-state">
                  <span className="acct-tag acct-tag--ok" title={discordId}>
                    <AcctIcon name="check" size={13} />
                    {profile.discord_name || "Connected"}
                  </span>
                  {/* No disconnect when Discord is the only way into the
                      account: the server refuses it. */}
                  {profile.email || steamId || profile.google_id ? (
                    <button
                      type="button"
                      className="acct-textbtn"
                      disabled={busy === "discord"}
                      onClick={() => post(new URLSearchParams({ action: "unlink_discord" }), "discord")}
                    >
                      {busy === "discord" ? "Working…" : "Disconnect"}
                    </button>
                  ) : null}
                </div>
              ) : (
                <a className="acct-btn acct-btn--discord" href="discord_link.php">
                  <BrandIcon name="discord" />
                  Connect Discord
                </a>
              )}
            </div>
            {fieldError("steam")}
            {fieldError("discord")}
          </section>

          {/* Card 4: appearance */}
          <section className="acct-card acct-card--appearance" aria-label="Appearance">
            <div className="acct-appearance-block">
              <p className="acct-label" id="acct-theme-label">Appearance</p>
              <ThemeRadioGroup labelledBy="acct-theme-label" />
            </div>
            <div className="acct-appearance-block">
              <p className="acct-label" id="acct-lang-label">Language</p>
              <ProfileLanguagePicker
                value={languageChoice}
                languages={languages}
                onChange={chooseLanguage}
                labelledBy="acct-lang-label"
              />
            </div>
          </section>

          {/* Card 5: security. The password changes through a link sent to
              the account's address, so the mailbox proves the owner. */}
          <section className="acct-card acct-card--security" aria-label="Security">
            <p className="acct-label">Security</p>

            <div className="acct-sec-row">
              <span className="acct-iconbox acct-iconbox--tint" aria-hidden="true">
                <AcctIcon name="shield" size={18} />
              </span>
              <div className="acct-conn-text">
                <strong>Password</strong>
                <span>
                  {profile.has_password
                    ? "We email you a link to set a new password. It works for 2 hours and only once."
                    : profile.email
                      ? "This account signs in without a password. Set one through a link we email you."
                      : "Add an email address to the account first; the link goes there."}
                </span>
              </div>
              <div className="acct-security-action">
                {inboxSent ? (
                  <span className="acct-inline-ok" role="status">
                    <AcctIcon name="check" size={14} />
                    Check your inbox
                  </span>
                ) : null}
                <button
                  type="button"
                  className="acct-btn acct-btn--primary"
                  disabled={busy === "password" || !profile.email}
                  onClick={() => {
                    setInboxSent(false);
                    post(new URLSearchParams({ action: "password_reset_request" }), "password")
                      .then((ok) => { if (ok) setInboxSent(true); });
                  }}
                >
                  {busy === "password" ? <span className="acct-spinner" aria-hidden="true" /> : null}
                  {busy === "password" ? "Sending…" : profile.has_password ? "Change password" : "Set password"}
                </button>
              </div>
              {fieldError("password")}
            </div>

            {/* Email change with confirmation: the new address only takes
                over once the link sent to it is opened (verify_email_change.php);
                the current one keeps working until then. */}
            <div className="acct-sec-row">
              <span className="acct-iconbox acct-iconbox--tint" aria-hidden="true">
                <i className="fa-regular fa-envelope" />
              </span>
              <div className="acct-conn-text">
                <strong>Email</strong>
                <span>
                  {profile.pending_email
                    ? `Confirmation sent to ${profile.pending_email}. Open the link there to switch; it works for 24 hours.`
                    : profile.email
                      ? "Change the address you sign in with. We send a confirmation link to the new one; nothing changes until you open it."
                      : "Add an email address to sign in with and to receive the links above."}
                </span>
              </div>
              {profile.pending_email ? (
                <div className="acct-security-action">
                  <SaveButton
                    label="Resend"
                    state={stateOf("email")}
                    onClick={() => post(new URLSearchParams({ action: "change_email_resend" }), "email")}
                  />
                  <button
                    type="button"
                    className="acct-btn acct-btn--secondary"
                    disabled={busy === "email"}
                    onClick={() => post(new URLSearchParams({ action: "change_email_cancel" }), "email")}
                  >
                    Cancel change
                  </button>
                </div>
              ) : (
                <div className="acct-security-action">
                  {emailSent && !emailEditing ? (
                    <span className="acct-inline-ok" role="status">
                      <AcctIcon name="check" size={14} />
                      Check {emailSent}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={classNames("acct-btn", emailEditing ? "acct-btn--secondary" : "acct-btn--primary")}
                    aria-expanded={emailEditing}
                    aria-controls="acct-email-form"
                    disabled={busy === "email"}
                    onClick={() => {
                      setEmailSent("");
                      setNewEmail("");
                      setEmailPassword("");
                      setEmailEditing((value) => !value);
                    }}
                  >
                    {emailEditing ? "Cancel" : profile.email ? "Change email" : "Add email"}
                  </button>
                </div>
              )}

              {emailEditing && !profile.pending_email ? (
                <form
                  id="acct-email-form"
                  className="acct-email-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const address = newEmail.trim();
                    if (!address) return;
                    const ok = await post(new URLSearchParams({
                      action: "change_email",
                      new_email: address,
                      password: emailPassword,
                    }), "email");
                    if (ok) {
                      setEmailEditing(false);
                      setEmailPassword("");
                      setEmailSent(address);
                    }
                  }}
                >
                  <label className="acct-sr-only" htmlFor="acct-new-email">New email address</label>
                  <input
                    id="acct-new-email"
                    type="email"
                    className="acct-input"
                    value={newEmail}
                    autoComplete="email"
                    placeholder="New email address"
                    required
                    onChange={(event) => setNewEmail(event.target.value)}
                  />
                  {profile.has_password ? (
                    <>
                      <label className="acct-sr-only" htmlFor="acct-email-password">Current password</label>
                      <input
                        id="acct-email-password"
                        type="password"
                        className="acct-input"
                        value={emailPassword}
                        autoComplete="current-password"
                        placeholder="Current password"
                        required
                        onChange={(event) => setEmailPassword(event.target.value)}
                      />
                    </>
                  ) : null}
                  <SaveButton
                    type="submit"
                    label="Send confirmation"
                    state={stateOf("email")}
                    disabled={!newEmail.trim() || (profile.has_password && !emailPassword)}
                  />
                  <p className="acct-hint">
                    A confirmation link goes to the new address. Your current address stays until you open it.
                  </p>
                </form>
              ) : null}
              {fieldError("email")}
            </div>
          </section>

          {/* Inventory: full width under the cards (spec, 2026-10-02). */}
          <ProfileInventorySection steamId={steamId} tf2={PAGE_TF2} />
        </div>
      </div>
    );
  }

  // Flag beside a language name: the flag-icons sheet (fi fi-xx) the navbar
  // switcher uses, a globe for "Auto-detect".
  function ProfileLangFlag({ entry }) {
    if (!entry) return null;
    if (entry.auto) {
      return (
        <span className="home-ai-lang-flag is-auto" aria-hidden="true">
          <i className="fa-solid fa-globe" />
        </span>
      );
    }
    if (entry.flagCode) {
      return <span className={"home-ai-lang-flag fi fi-" + entry.flagCode} aria-hidden="true" />;
    }
    return <span className="home-ai-lang-flag" aria-hidden="true">{entry.flag || "🌐"}</span>;
  }

  // Language control. A native <select> cannot draw the flags, so it is a
  // button in the input's clothes that opens a list, like the switcher in
  // the footer. "Auto-detect" (browser + location) stays the first entry.
  function ProfileLanguagePicker({ value, languages, onChange, labelledBy }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
      if (!open) return undefined;
      const onDocClick = (event) => {
        if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
      };
      const onKey = (event) => {
        if (event.key === "Escape") setOpen(false);
      };
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDocClick);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);

    const options = [{ code: "auto", name: "Auto-detect", auto: true }].concat(
      Array.isArray(languages) ? languages : []
    );
    const current = options.find((entry) => entry.code === value) || options[0];

    return (
      <div className={classNames("home-ai-lang-picker", open && "is-open")} ref={rootRef}>
        <button
          type="button"
          className="home-ai-lang-trigger"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={labelledBy}
        >
          <span className="home-ai-lang-trigger-left">
            <ProfileLangFlag entry={current} />
            <span className="home-ai-lang-name">{current.name}</span>
          </span>
          <AcctIcon name="chevron" size={16} className="home-ai-lang-caret" />
        </button>

        {open ? (
          <ul className="home-ai-lang-menu" role="listbox" aria-labelledby={labelledBy}>
            {options.map((entry) => (
              <li key={entry.code} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={entry.code === value}
                  className={classNames("home-ai-lang-option", entry.code === value && "is-active")}
                  onClick={() => {
                    onChange(entry.code);
                    setOpen(false);
                  }}
                >
                  <ProfileLangFlag entry={entry} />
                  <span className="home-ai-lang-name">{entry.name}</span>
                  {entry.code === value ? <AcctIcon name="check" size={13} className="home-ai-lang-check" /> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  // "cs2" | "tf2": the game switcher's choice (navbar), read through the
  // shared helper when it exists, else straight from localStorage.
  function activeGame() {
    try {
      const api = window.CS2React || {};
      if (typeof api.getActiveGame === "function") return api.getActiveGame() === "tf2" ? "tf2" : "cs2";
      return window.localStorage.getItem("csprice-game") === "tf2" ? "tf2" : "cs2";
    } catch (_error) {
      return "cs2";
    }
  }

  function getComposerPlaceholders(shortOnly) {
    const t = window.I18N ? window.I18N.t : (key) => key;
    if (PAGE_TF2) {
      return shortOnly
        ? ["Ask Dell about TF2…", "Build a TF2 portfolio…", "Key price today?", "Best TF2 flips?"]
        : [
          "Ask about TF2 prices, trades or unusuals…",
          "Build me a €50 TF2 portfolio…",
          "How many ref is a key right now?",
          "Which TF2 items flip from Mannco to Steam?",
          "What is a Burning Flames Team Captain worth?",
        ];
    }
    // A phone composer is ~200px wide, so the long rotating lines were always
    // cut off mid-sentence. One short line that fits instead.
    if (shortOnly) {
      // Real questions rather than a generic prompt: the phone screen is the
      // first thing a new visitor sees, and an example they could have typed
      // explains the assistant faster than any label. Kept as one list so the
      // copy can change without touching the composer.
      return [
        t("mhome_ex1"),
        t("mhome_ex2"),
        t("mhome_ex3"),
        t("mhome_ex4", { amount: mhomeAmount(20) }),
        t("mhome_ex5"),
        t("mhome_ex6"),
      ];
    }
    return [
      t("home_composerPlaceholder1"),
      t("home_composerPlaceholder2"),
      t("home_composerPlaceholder3"),
      t("home_composerPlaceholder4"),
      t("home_composerPlaceholder5"),
    ];
  }

  // The drawer search shows real items too, so it needs the same link the
  // navbar overlay builds: the pretty /skins/... page when one exists.
  function searchItemHref(item) {
    const marketHashName = String(item?.market_hash_name || "").trim();
    if (!marketHashName) return "#";
    const pretty = typeof window.CS2ReactData?.itemPrettyHref === "function"
      ? window.CS2ReactData.itemPrettyHref(item)
      : "";
    if (pretty) return pretty;
    return "item_page.php?" + new URLSearchParams({
      lookup_name: marketHashName,
      display_name: String(item.display_name || marketHashName),
      market_hash_name: marketHashName,
      image: item.image || "",
      market_url: "https://steamcommunity.com/market/listings/730/" + encodeURIComponent(marketHashName),
      type: item.type_note || "",
      category: item.category || "",
      color: item.name_color || "B0C3D9",
    }).toString();
  }

  function looksLikeItemSearchPrompt(text) {
    return /\b(invest(?:ing|ment)?s?|undervalued|what (should|can) i (buy|invest)|which (skins?|items?|cases?|collections?)|recommend|suggest|portfolio|best (buy|skin|collections?)|to buy)\b/i.test(String(text || ""));
  }

  function isRecommendationReply(message) {
    if (!message || message.role !== "assistant") return false;
    if (parseChatItems(message.items).length > 0) return true;
    return /\b(?:why these picks|items to buy)\b/i.test(String(message.content || ""));
  }

  const FOLLOW_UP_BUDGET_TIERS = [20, 50, 100, 250, 500, 1000, 2000, 5000];

  function parseChatBudget(text) {
    const raw = String(text || "").replace(/,(?=\d{3}\b)/g, "");
    if (!raw) return null;
    const patterns = [
      /(?:budget|spend|portfolio|total)\s[^€$\d]{0,28}(€|\$|eur(?:os?)?)?\s*(\d{1,5}(?:\.\d+)?)/i,
      /(€|\$|eur(?:os?)?)\s*(\d{1,5}(?:\.\d+)?)/i,
      /(\d{1,5}(?:\.\d+)?)\s*(€|eur(?:os?)?|usd|dollars?)/i,
      /\b(?:with|around|about|under|over)\s+(€|\$)\s*(\d{1,5}(?:\.\d+)?)/i,
    ];
    for (const re of patterns) {
      const match = raw.match(re);
      if (!match) continue;
      const groups = match.slice(1).filter(Boolean);
      const numTok = groups.find((group) => /^\d/.test(group));
      const amount = Number(numTok);
      if (!Number.isFinite(amount) || amount < 8 || amount > 20000) continue;
      const symbol = /\$|usd|dollar/i.test(match[0]) ? "$" : "€";
      return { amount: Math.round(amount), symbol };
    }
    return null;
  }

  function budgetStep(amount, direction) {
    const n = Number(amount) || 0;
    if (direction > 0) {
      return FOLLOW_UP_BUDGET_TIERS.find((tier) => tier > n + 1) || Math.round(n * 2);
    }
    return [...FOLLOW_UP_BUDGET_TIERS].reverse().find((tier) => tier < n - 1)
      || Math.max(10, Math.round(n / 2));
  }

  function formatChipMoney(amount, symbol) {
    const mark = symbol === "$" ? "$" : "€";
    return `${mark}${amount}`;
  }

  function isCaseLikeChatItem(item) {
    const blob = `${item?.category || ""} ${item?.scope_type || ""} ${item?.type_note || ""} ${item?.market_hash_name || ""} ${item?.display_name || ""}`.toLowerCase();
    return /\b(case|capsule)\b/.test(blob);
  }

  function pickFollowUpKind(user, assistant, items, message) {
    const u = String(user || "").toLowerCase();
    const hasChart = Boolean(message?.forecast || message?.distribution || message?.price_history);
    const count = items.length;
    const userWantsCollections = /\bcollections?\b/.test(u);
    const userWantsSkins = /\bskins?\b/.test(u);
    const userWantsCapsules = /\bcapsules?\b/.test(u) && !/\bcases?\b/.test(u);
    const userWantsCases = /\bcases?\b/.test(u) && !/\bsticker/.test(u);
    const userWantsStickers = /\bstickers?\b/.test(u) || userWantsCapsules;
    const userWantsCharms = /\b(charms?|keychains?)\b/.test(u);
    const userWantsPremium = /\b(knives|knife|bayonet|karambit|gloves?)\b/.test(u);
    const userWantsChart = /\b(chart|forecast|outlook|predict)\b/.test(u);
    const userWantsInvest = /\b(invest(?:ing|ment)?s?|portfolio|hold)\b/.test(u);
    const caseItems = items.filter(isCaseLikeChatItem);
    const caseDominated = count > 0 && caseItems.length >= Math.max(2, Math.ceil(count * 0.6));

    // Prompt wins: collections-invest / skins-invest / case-invest over reply contents.
    if (userWantsCharms && !userWantsCases && !userWantsStickers) return "charms";
    if (userWantsCollections && !userWantsCases && !userWantsStickers) return "collections";
    if (userWantsCases && !userWantsSkins && !userWantsCollections && !userWantsCapsules) return "cases";
    if (userWantsCapsules && !userWantsSkins && !userWantsCollections) return "capsules";
    if (userWantsStickers && !userWantsSkins && !userWantsCollections) return "stickers";
    if (userWantsSkins || userWantsInvest) return "portfolio";
    if (userWantsPremium) return "premium";
    if ((userWantsChart || hasChart) && count <= 2 && !userWantsCases) return "chart";
    if (count <= 1 && !caseDominated) return "single";
    if (caseDominated) return "cases";
    return "portfolio";
  }

  function takeFollowUpChips(preferred, fallbacks) {
    const out = [];
    const seen = new Set();
    const extras = [ti("chip_differentPicks"), ti("chip_raiseBudget"), ti("chip_swapOneItem"), ti("chip_lowerBudget")];
    for (const label of preferred.concat(fallbacks || []).concat(extras)) {
      const text = String(label || "").replace(/\s+/g, " ").trim();
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      out.push(text);
      if (out.length === 3) return out;
    }
    return out;
  }

  function recommendationFollowUpChips(userText, assistantMessage) {
    const user = String(userText || "");
    const assistant = String(assistantMessage?.content || "");
    const items = parseChatItems(assistantMessage?.items);
    const budget = parseChatBudget(user)
      || (/\bbudget\b|total spend|portfolio (?:with|of)/i.test(assistant) ? parseChatBudget(assistant) : null);
    const kind = pickFollowUpKind(user, assistant, items, assistantMessage);
    const raise = budget
      ? ti("chip_tryInstead", { amount: formatChipMoney(budgetStep(budget.amount, 1), budget.symbol) })
      : ti("chip_raiseBudget");
    const cut = budget
      ? ti("chip_cutTo", { amount: formatChipMoney(budgetStep(budget.amount, -1), budget.symbol) })
      : ti("chip_lowerBudget");
    const tighter = items.length > 3 ? ti("chip_keep3Items") : ti("chip_swapOneItem");

    if (kind === "collections") {
      return takeFollowUpChips(
        [ti("chip_otherCollections"), ti("chip_cheapestInThose"), ti("chip_mostUndervaluedCollection")],
        [raise, cut, tighter]
      );
    }
    if (kind === "charms") {
      return takeFollowUpChips(
        [ti("chip_otherCharms"), ti("chip_cheaperCharms"), ti("chip_bestCharmInvest")],
        [raise, cut, tighter]
      );
    }
    if (kind === "cases") {
      return takeFollowUpChips(
        [ti("chip_otherCases"), ti("chip_cheaperCases"), ti("chip_volumePlay")],
        [raise, cut, ti("chip_swapOneCase"), ti("chip_stickOldCases")]
      );
    }
    if (kind === "capsules") {
      return takeFollowUpChips(
        [ti("chip_otherCapsules"), ti("chip_cheaperCapsules"), ti("chip_stickTournamentCapsules")],
        [raise, cut, tighter]
      );
    }
    if (kind === "stickers") {
      return takeFollowUpChips(
        [ti("chip_differentStickers"), ti("chip_cheaperStickers"), ti("chip_stickTournamentStickers")],
        [raise, cut, tighter]
      );
    }
    if (kind === "chart" || kind === "single") {
      return takeFollowUpChips(
        [
          ti("chip_compareFnMw"),
          ti("chip_anotherMarketplace"),
          ti("chip_outlook30d"),
        ],
        [raise, ti("chip_cheaperAlternative"), ti("chip_smallPortfolio")]
      );
    }
    if (kind === "premium") {
      const noun = /\bgloves?\b/i.test(`${user}\n${assistant}`) && !/\b(knives|knife|bayonet|karambit)\b/i.test(user)
        ? "gloves"
        : "knives";
      return takeFollowUpChips(
        [noun === "gloves" ? ti("chip_differentGloves") : ti("chip_differentKnives"), raise, cut],
        [ti("chip_compareFnMw"), ti("chip_cheaperAlternative"), tighter]
      );
    }
    return takeFollowUpChips(
      [ti("chip_differentSkins"), raise, tighter],
      [cut, ti("chip_cheaperAlternatives"), ti("chip_swapOneItem"), ti("chip_keep3Items"), ti("chip_saferAlternatives")]
    );
  }

  // Translation accessor for the plain helpers below, which build chip text
  // outside any component and so cannot use the useI18n() hook.
  function ti(key, vars) {
    try {
      return window.I18N ? window.I18N.t(key, vars) : key;
    } catch (_error) {
      return key;
    }
  }

  // Translation keys, not literals: the phase text is resolved through t() when
  // it is displayed, so the loader follows the language picker.
  const HOME_AI_ACTIVITY_PHASES = {
    souvenir: [
      "aiph_souvenirLookups",
      "aiph_matchingCatalog",
      "aiph_searchingDb",
      "aiph_comparingMarkets",
      "aiph_rankingPicks",
      "aiph_writingReply",
    ],
    charms: [
      "aiph_searchingCharms",
      "aiph_matchingCatalog",
      "aiph_searchingDb",
      "aiph_comparingMarkets",
      "aiph_rankingPicks",
      "aiph_writingReply",
    ],
    chart: [
      "aiph_scanningHistory",
      "aiph_checkingSteam",
      "aiph_buildingForecast",
      "aiph_comparingMarkets",
      "aiph_writingReply",
    ],
    deals: [
      "aiph_comparingMarkets",
      "aiph_checkingSteam",
      "aiph_searchingDb",
      "aiph_rankingPicks",
      "aiph_writingReply",
    ],
    stickers: [
      "aiph_searchingStickers",
      "aiph_matchingCatalog",
      "aiph_searchingDb",
      "aiph_comparingMarkets",
      "aiph_rankingPicks",
      "aiph_writingReply",
    ],
    cases: [
      "aiph_searchingCases",
      "aiph_matchingCatalog",
      "aiph_searchingDb",
      "aiph_scanningHistory",
      "aiph_rankingPicks",
      "aiph_writingReply",
    ],
    search: [
      "aiph_searchingSkins",
      "aiph_matchingCatalog",
      "aiph_searchingDb",
      "aiph_comparingMarkets",
      "aiph_checkingSteam",
      "aiph_rankingPicks",
      "aiph_writingReply",
    ],
    steam: [
      "aiph_checkingSteam",
      "aiph_searchingDb",
      "aiph_comparingMarkets",
      "aiph_scanningHistory",
      "aiph_writingReply",
    ],
    image: [
      "aiph_inspectingImage",
      "aiph_matchingCatalog",
      "aiph_searchingDb",
      "aiph_comparingMarkets",
      "aiph_writingReply",
    ],
    generic: [
      "aiph_searchingDb",
      "aiph_matchingCatalog",
      "aiph_scanningHistory",
      "aiph_comparingMarkets",
      "aiph_writingReply",
    ],
  };

  function homeAiActivityKind(prompt, media) {
    const text = String(prompt || "");
    const hasImage = Array.isArray(media) && media.some((item) => String(item?.kind || "") === "image");
    if (!text.trim() && hasImage) return "image";
    if (/\bsouvenir/i.test(text) && !/\b(charms?|keychains?)\b/i.test(text)) return "souvenir";
    if (/\b(charms?|keychains?)\b/i.test(text)) return "charms";
    if (/\b(chart|graph|forecast|predict(?:ion)?s?|arima|price history|over \d+\s*days)\b/i.test(text)) return "chart";
    if (/\b(deals?|arbitrage|flip(?:s|ping)?|spreads?|steam vs|third[- ]party)\b/i.test(text)) return "deals";
    if (/\bstickers?\b/i.test(text) || (/\bcapsules?\b/i.test(text) && !/\bcases?\b/i.test(text))) return "stickers";
    if (/\bcases?\b/i.test(text)) return "cases";
    if (looksLikeItemSearchPrompt(text) || /\b(skins?|items?|knives|knife|gloves?)\b/i.test(text)) return "search";
    if (/\b(steam|listings?|buy orders?)\b/i.test(text)) return "steam";
    if (hasImage) return "image";
    return "generic";
  }

  function homeAiActivityPhasesForPrompt(prompt, media) {
    if (PAGE_TF2) {
      return /\bportfolio\b/i.test(String(prompt || ""))
        ? ["Reading TF2 prices…", "Picking keys, stranges and cosmetics…", "Balancing the budget…", "Writing it up…"]
        : ["Reading TF2 prices…", "Checking Mannco and Steam…", "Working out the trade…", "Writing it up…"];
    }
    const kind = homeAiActivityKind(prompt, media);
    const phases = (HOME_AI_ACTIVITY_PHASES[kind] || HOME_AI_ACTIVITY_PHASES.generic).slice();
    const hasImage = Array.isArray(media) && media.some((item) => String(item?.kind || "") === "image");
    if (hasImage && kind !== "image" && phases[0] !== "Inspecting attached image…") {
      phases.unshift("Inspecting attached image…");
    }
    return phases;
  }

  function getWelcomeHeadlines() {
    const t = window.I18N ? window.I18N.t : (key) => key;
    // TF2 uses the same translated CS2 set with the game name swapped, so
    // both games read alike in every language (headline 7 stays dropped).
    const g = PAGE_TF2 ? (key) => String(t(key)).replace(/\bCS2\b/g, "TF2") : t;
    return [
      { lead: g("home_headline1_lead"), accent: g("home_headline1_accent") },
      { lead: g("home_headline2_lead"), accent: g("home_headline2_accent") },
      { lead: g("home_headline3_lead"), accent: g("home_headline3_accent") },
      { lead: g("home_headline4_lead"), accent: g("home_headline4_accent") },
      { lead: g("home_headline5_lead"), accent: g("home_headline5_accent") },
      { lead: g("home_headline6_lead"), accent: g("home_headline6_accent") },
      // headline7 ("See what the market is pricing next") dropped on request.
      { lead: g("home_headline8_lead"), accent: g("home_headline8_accent") },
      { lead: g("home_headline9_lead"), accent: g("home_headline9_accent") },
      { lead: g("home_headline10_lead"), accent: g("home_headline10_accent") },
      { lead: g("home_headline11_lead"), accent: g("home_headline11_accent") },
    ];
  }

  function formatTickerPct(n) {
    const value = Number(n);
    if (!Number.isFinite(value)) return "—";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  }

  // The strip draws from assets/data/ticker-pool.json: real items with a real
  // 30-day change, each already resolved to its generated item page by
  // scripts/build_ticker_pool.php. Re-run that script to refresh the numbers.
  // TF2 mode has its own pool (scripts/tf2_import.php writes it; see the
  // ticker block there for what its percentages mean).
  const TICKER_POOL_URL = PAGE_TF2 ? "assets/data/tf2/ticker-pool.json" : "assets/data/ticker-pool.json";
  const TICKER_VISIBLE_COUNT = 10;

  // Bars in the dictation meter. Was 36, which spaced out across the full-width
  // bar into a row of dots; this is dense enough to read as a waveform.
  const WAVE_BAR_COUNT = 120;

  function pickRandomTickerItems(items, count) {
    // Fisher-Yates over a copy, so a reload shows a different set.
    const pool = items.slice();
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  /* ==========================================================================
  /* ==========================================================================
     Phone start screen (viewport < 768px)
     --------------------------------------------------------------------------
     The prompt card sits at the top, with the visitor's recent chats and the
     suggestion pills under it. Colours come from the design tokens in
     styles/css/theme.css, so it follows the light and dark themes with the
     rest of the site; the layout lives in styles/css/home-mobile.css.
     ========================================================================== */
  // The four rows under "Suggested". Each one sends its prompt straight to Mark.
  /* The phone start screen's copy, kept in one place so another version can be
     swapped in without touching the component. Values are i18n KEYS, not text -
     t() resolves them, so an A/B variant is a one-word change here and the
     other ten languages keep falling back to English until translated. */
  const MHOME_HEADLINES = {
    a: { line1: "mhome_headlineA1", line2: "mhome_headlineA2", sub: "mhome_headlineASub" },
    b: { line1: "mhome_headlineB1", line2: "mhome_headlineB2", sub: "mhome_headlineBSub" },
    c: { line1: "mhome_headlineC1", line2: "mhome_headlineC2", sub: "mhome_headlineCSub" },
  };
  const MHOME_HEADLINE_VARIANT = "a";

  /* One place for the currency the copy quotes. The site prices everything in
     euros (roi-page.jsx and deals-page.jsx both do `€${n.toFixed(2)}`), so this
     is a constant rather than a lookup - but it is a constant with a name, so a
     real per-user currency only has to be wired in here. */
  const MHOME_CURRENCY = "€";
  const mhomeAmount = (value) => `${MHOME_CURRENCY}${value}`;

  /* The phone start screen's six cards, in order. One array so the copy can be
     edited without touching the component; `title` doubles as the button's
     accessible name and as the message that gets sent, except where a separate
     prompt reads better. Values are resolved through t() at render so a
     language switch re-renders them.

     The inventory card deliberately sends even when Steam is not connected -
     the assistant answers with the connect prompt, which is a better dead end
     than a disabled card that explains nothing. */
  const MHOME_CARDS = [
    { icon: "trend", title: "mhome_cardGrowShort", prompt: "mhome_cardGrowTitle", sub: "mhome_cardGrowSub" },
    { icon: "layers", title: "mhome_cardPortfolioShort", prompt: "mhome_cardPortfolioTitle", sub: "mhome_cardPortfolioSub", amount: 500 },
    { icon: "wallet", title: "mhome_cardInventoryShort", prompt: "mhome_cardInventoryTitle", sub: "mhome_cardInventorySub" },
    { icon: "activity", title: "mhome_cardMovingShort", prompt: "mhome_cardMovingTitle", sub: "mhome_cardMovingSub" },
    { icon: "tag", title: "mhome_cardBudgetShort", prompt: "mhome_cardBudgetTitle", sub: "mhome_cardBudgetSub", amount: 20 },
    { icon: "package", title: "mhome_cardCasesShort", prompt: "mhome_cardCasesTitle", sub: "mhome_cardCasesSub" },
  ];

  function mobileSuggestions(t) {
    if (PAGE_TF2) return MOBILE_SUGGESTIONS;
    return MHOME_CARDS.map((card) => {
      const vars = card.amount == null ? undefined : { amount: mhomeAmount(card.amount) };
      // Short label on the card, full question into the chat.
      return {
        icon: card.icon,
        title: t(card.title, vars),
        sub: t(card.sub),
        prompt: t(card.prompt, vars),
      };
    });
  }

  const MOBILE_SUGGESTIONS = PAGE_TF2 ? [
    { icon: "briefcase", title: "€50 TF2 portfolio", sub: "Keys, stranges, cosmetics", prompt: "Build me a €50 TF2 portfolio and explain each pick." },
    { icon: "tag", title: "Best TF2 flips", sub: "Mannco to Steam after fees", prompt: "What are the best TF2 flips right now from Mannco to Steam after fees?" },
    { icon: "star", title: "Cheap unusual hats", sub: "Particles on a budget", prompt: "What are the best cheap unusual hats to buy in TF2 right now?" },
    { icon: "trend", title: "TF2 trading tips", sub: "Keys, ref and staying safe", prompt: "Give me TF2 trading advice for a beginner: keys, ref, where to buy and sell, and how to avoid scams." },
  ] : [
    {
      icon: "trend",
      title: "Items that will grow",
      sub: "Skins and cases with room to appreciate",
      prompt: "Items that will grow",
    },
    {
      icon: "layers",
      title: "$500 invest portfolio",
      sub: "Serious stack with conviction",
      prompt: "$500 invest portfolio",
    },
    {
      icon: "folder",
      title: "Collections to invest in",
      sub: "Collections that look underpriced",
      prompt: "Collections to invest in",
    },
    {
      icon: "search",
      title: "Item analysis",
      sub: "Break down a random item",
      prompt: "Item analysis",
    },
  ];

  /* The four card icons, drawn from the spec's own SVG paths rather than
     CSIcon. Two reasons: CSIcon has no "layers" at all, and adding one would
     mean editing react/shared-components.jsx, which another session has
     uncommitted work in. The spec also fixes these paths exactly, so owning them
     here guarantees they match. */
  /* A value is either a path string or { d, circles } - the circle used to be a
     hard-coded special case for `search`, which did not survive the tag glyph
     needing one too. */
  const MHOME_ICON_PATHS = {
    trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
    layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
    folder: "M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    search: { d: "M20 20l-3.5-3.5", circles: [{ cx: 11, cy: 11, r: 7 }] },
    wallet: "M3 7h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 7l2.5-3h13L21 7M15.5 13.5h3",
    activity: "M3 12h4l3 8 4-16 3 8h4",
    tag: { d: "M3 12V4h8l10 10-8 8z", circles: [{ cx: 7.5, cy: 7.5, r: 1.3 }] },
    package: "M21 8l-9-5-9 5 9 5 9-5M3 8v8l9 5 9-5V8M12 13v8",
  };

  function MHomeIcon({ name }) {
    const entry = MHOME_ICON_PATHS[name];
    if (!entry) return null;
    const path = typeof entry === "string" ? entry : entry.d;
    const circles = (typeof entry === "string" ? null : entry.circles) || [];
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {circles.map((c, i) => <circle key={i} cx={c.cx} cy={c.cy} r={c.r} />)}
        <path d={path} />
      </svg>
    );
  }


  function formatChatAge(updatedAt) {
    const then = Number(updatedAt);
    if (!Number.isFinite(then) || then <= 0) return "";
    const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (minutes < 60) return `${Math.max(1, minutes)}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days === 1) return "Yesterday";
    return `${days}d`;
  }

  function greetingForHour(name) {
    const hour = new Date().getHours();
    const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const who = String(name || "").trim();
    return who ? `${part}, ${who}` : part;
  }

  // Prices in the movers card, in the form the rest of the site uses:
  // `€${n.toFixed(2)}`, exactly as roi-page.jsx and deals-page.jsx do it.
  //
  // Intl.NumberFormat with an undefined locale was the first attempt and was
  // wrong: on a Czech-locale machine it renders "15,60 Kc"-style output - comma
  // decimal, symbol trailing - so the same price read differently here than two
  // pages away.
  function mhomeMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `€${number.toFixed(2)}` : "-";
  }

  /**
   * "Moving now": the three biggest movers, from the same real pool the desktop
   * ticker uses (assets/data/ticker-pool.json, 30-day change). Biggest absolute
   * move first, so a large drop is as newsworthy as a large rise.
   *
   * Renders nothing at all when the pool is missing or unusable - the desktop
   * ticker takes the same line, and inventing percentages on a price site is
   * worse than showing less.
   */
  function MobileMovers() {
    const [items, setItems] = useState([]);

    useEffect(() => {
      let cancelled = false;

      fetch(TICKER_POOL_URL, { headers: { Accept: "application/json" } })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (cancelled) return;
          const pool = Array.isArray(payload?.items) ? payload.items : [];
          const usable = pool.filter((entry) => (
            entry && entry.name && entry.url
            && Number.isFinite(Number(entry.pct))
            && Number.isFinite(Number(entry.price))
          ));
          usable.sort((a, b) => Math.abs(Number(b.pct)) - Math.abs(Number(a.pct)));
          setItems(usable.slice(0, 3));
        })
        .catch(() => {
          // No pool, no card.
        });

      return () => {
        cancelled = true;
      };
    }, []);

    if (!items.length) return null;

    return (
      <>
        <p className="mhome-label">Moving now</p>
        <div className="mhome-movers">
          {items.map((item) => {
            const change = Number(item.pct);
            return (
              <a className="mhome-mover" href={item.url} key={item.url}>
                <span className="mhome-mover-name">{item.name}</span>
                <span className="mhome-mover-price">{mhomeMoney(item.price)}</span>
                <span className={classNames("mhome-mover-change", change >= 0 ? "is-up" : "is-down")}>
                  {formatTickerPct(change)}
                </span>
              </a>
            );
          })}
        </div>
      </>
    );
  }

  /**
   * The phone start screen (viewport < 768px): greeting, gradient headline, a
   * side-scrolling row of suggestion cards, and the movers card.
   *
   * There is no input here on purpose. The composer pinned at the bottom of the
   * page - the same one the thread uses, so dictation, attachments and send all
   * keep working - is styled to the spec's input bar in home-mobile.css. A second
   * input would have meant a second set of those behaviours to keep in step.
   */
  function MobileStartScreen({ onPrompt, userName }) {
    const { t } = useI18n();
    const variant = MHOME_HEADLINES[MHOME_HEADLINE_VARIANT] || MHOME_HEADLINES.a;
    const cards = mobileSuggestions(t);
    return (
      <div className="mhome">
        {/* The avatar makes the screen read as a conversation before a word is
            parsed. aria-hidden because the greeting beside it already carries
            the meaning - announcing a decorative sparkle twice helps nobody. */}
        <p className="mhome-greeting">
{greetingForHour(userName)}
        </p>

        <h1 className="mhome-title">
          {t(variant.line1)}
          <br />
          <span className="u-gradient-text">{t(variant.line2)}</span>
        </h1>
        <p className="mhome-subtitle">{t(variant.sub)}</p>

        {/* Bleeds off the right edge so the next card peeks, which is the only
            sideways scroll on the page. */}
        <ul className="mhome-cards">
          {cards.map((entry) => (
            <li key={entry.title}>
              <button
                type="button"
                className="mhome-card"
                aria-label={entry.title}
                onClick={() => onPrompt(entry.prompt)}
              >
                <span className="mhome-card-icon">
                  <MHomeIcon name={entry.icon} />
                </span>
                <span className="mhome-card-title">{entry.title}</span>
                <span className="mhome-card-sub">{entry.sub}</span>
              </button>
            </li>
          ))}
        </ul>

        <MobileMovers />
      </div>
    );
  }

  function MarketTicker() {
    const [items, setItems] = useState([]);

    useEffect(() => {
      let cancelled = false;

      fetch(TICKER_POOL_URL, { headers: { Accept: "application/json" } })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (cancelled) return;
          const pool = Array.isArray(payload?.items) ? payload.items : [];
          const usable = pool.filter((entry) => (
            entry && entry.name && entry.url && Number.isFinite(Number(entry.pct))
          ));
          setItems(pickRandomTickerItems(usable, TICKER_VISIBLE_COUNT));
        })
        .catch(() => {
          // No pool, no strip — better than inventing percentages.
        });

      return () => {
        cancelled = true;
      };
    }, []);

    if (!items.length) return null;

    return (
      <div className="home-ai-ticker" aria-label={PAGE_TF2 ? "TF2 market moves" : "Market moves, past 30 days"}>
        <div className="home-ai-ticker-track">
          {[...items, ...items].map((item, index) => {
            // The second pass is the seamless-loop clone: visible, still
            // clickable, but kept out of the tab order and the accessibility
            // tree so every row is announced once.
            const isClone = index >= items.length;
            const change = Number(item.pct);
            return (
              <a
                key={`${item.url}-${index}`}
                href={item.url}
                className={classNames("home-ai-ticker-item", change >= 0 ? "is-up" : "is-down")}
                aria-hidden={isClone ? "true" : undefined}
                tabIndex={isClone ? -1 : undefined}
              >
                <strong>{item.name}</strong>
                <em>{formatTickerPct(change)}</em>
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  // Phone drawer only: the navbar link row has nowhere to live once the burger
  // opens this sidebar instead of its own dropdown, so the site links ride along
  // under the chat list. Hidden on desktop, where the real navbar is visible.
  // Same order and same icons the navbar uses — the weapon rows and Cases carry
  // artwork (CategoryNavIcon / .nav-cases-icon), not Font Awesome glyphs.
  const NAV_CATEGORY_LABEL_KEYS = {
    pistols: "nav_pistols",
    smgs: "nav_smgs",
    heavy: "nav_heavy",
    rifles: "nav_rifles",
    rare: "nav_rare",
  };

  // The three section hubs the phone drawer opens with (tools.html, skins.html,
  // other.html) in place of the chat panels.
  // TF2 mode has no hub pages: the three TF2 tools sit here instead.
  const HUB_LINKS = PAGE_TF2 ? [
    { href: "tf2/deals/", label: "Deals", icon: "fa-solid fa-tags" },
    { href: "tf2/market/", label: "Market Explorer", icon: "fa-solid fa-chart-line" },
    { href: "tf2/mann-up/", label: "Mann Up calculator", icon: "fa-solid fa-gift" },
  ] : [
    { href: "tools.html", labelKey: "nav_tools", icon: "fa-solid fa-screwdriver-wrench" },
    { href: "skins.html", labelKey: "nav_skins", icon: "fa-solid fa-gun" },
    { href: "other.html", labelKey: "nav_other", icon: "fa-solid fa-shapes" },
  ];

  // Skinport's TF2 categories, each a Market Explorer filter (?cat=).
  const TF2_CATEGORY_LINKS = [
    ["cosmetic", "Cosmetic", "fa-solid fa-hat-cowboy"],
    ["melee", "Melee Weapon", "fa-solid fa-hammer"],
    ["primary", "Primary Weapon", "fa-solid fa-gun"],
    ["secondary", "Secondary Weapon", "fa-solid fa-crosshairs"],
    ["tool", "Tool", "fa-solid fa-screwdriver-wrench"],
    ["crate", "Crate", "fa-solid fa-box"],
    ["package", "Package", "fa-solid fa-box-open"],
    ["craft_item", "Craft Item", "fa-solid fa-cubes"],
    ["gift", "Gift", "fa-solid fa-gift"],
    ["war_paint", "War Paint", "fa-solid fa-paint-roller"],
    ["taunt", "Taunt", "fa-solid fa-music"],
    ["strange_part", "Strange Part", "fa-solid fa-puzzle-piece"],
    ["party_favor", "Party Favor", "fa-solid fa-champagne-glasses"],
    ["usable_item", "Usable Item", "fa-solid fa-hand-pointer"],
    ["supply_crate", "Supply Crate", "fa-solid fa-boxes-stacked"],
  ].map(([id, label, icon]) => ({ href: `tf2/${String(id).replace(/_/g, "-")}/`, label, icon }));

  // The drawer's site links, grouped the way the navbar groups them: the tools
  // first, then every weapon class, then the item sections. Each group carries
  // its own heading instead of one "Browse" label over the whole list.
  const BROWSE_GROUPS = PAGE_TF2 ? [
    { label: "Tools", links: HUB_LINKS },
    { label: "TF2 items", links: TF2_CATEGORY_LINKS },
  ] : [
    {
      labelKey: "nav_tools",
      links: [
        { href: "deals.html", labelKey: "nav_deals", icon: "fa-solid fa-tags" },
        { href: "roi.html", labelKey: "nav_market", icon: "fa-solid fa-chart-line" },
        { href: "skin-crafter.html", labelKey: "nav_skinCrafter", icon: "fa-solid fa-cube" },
        { href: "carepackage.html", labelKey: "nav_carePackage", icon: "fa-solid fa-gift" },
      ],
    },
    {
      labelKey: "nav_skins",
      links: ((window.CS2ReactData && window.CS2ReactData.weaponCategories) || []).map((category) => ({
        href: `${category.key}.html`,
        labelKey: NAV_CATEGORY_LABEL_KEYS[category.key],
        label: category.label,
        category,
      })),
    },
    {
      labelKey: "nav_other",
      links: [
        // The star is a vector (a traced one turned to mush at 20px); the
        // sticker is the NAVI mark traced from the Paris 2023 sticker.
        { href: "collections.html", labelKey: "nav_collections", drawnIcon: "collection.svg" },
        { href: "cases.html", labelKey: "nav_cases", casesIcon: true },
        { href: "stickers.html", labelKey: "nav_stickers", drawnIcon: "sticker-navi.png" },
        // These six have drawn artwork in assets/icons/sections.
        { href: "agents.html", labelKey: "icat_agents", drawnIcon: "agent.png" },
        { href: "charms.html", labelKey: "icat_charms", drawnIcon: "charm.png" },
        { href: "patches.html", labelKey: "icat_patches", drawnIcon: "patch.png" },
        { href: "graffiti.html", labelKey: "icat_graffiti", drawnIcon: "graffiti.png" },
        { href: "pins.html", labelKey: "icat_pins", drawnIcon: "pin.png" },
        { href: "music.html", labelKey: "icat_musicKits", drawnIcon: "music-kit.png" },
      ],
    },
  ];

  function uid() {
    return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function titleFromMessages(messages) {
    const firstUser = (messages || []).find((entry) => entry.role === "user");
    // Prefer the text the visitor actually saw, so chat titles match their language.
    const text = String(firstUser?.display || firstUser?.content || "").trim();
    if (!text) return "New chat";
    return text.length > 42 ? `${text.slice(0, 42)}…` : text;
  }

  function readSessions() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(SESSIONS_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((entry) => entry && typeof entry === "object" && Array.isArray(entry.messages))
        .map((entry) => ({
          id: String(entry.id || uid()),
          title: String(entry.title || "New chat"),
          updatedAt: Number(entry.updatedAt) || Date.now(),
          messages: entry.messages.slice(-40).map((msg) => (
            msg?.role === "assistant"
              ? { ...msg, content: stripMarkMarkdown(msg.content) }
              : msg
          )),
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 40);
    } catch (_error) {
      return [];
    }
  }

  function sanitizeMessageForStorage(msg) {
    if (!msg || typeof msg !== "object") return msg;
    const media = Array.isArray(msg.media)
      ? msg.media.slice(0, 2).map((item) => {
        const kind = item?.kind === "video" ? "video" : "image";
        const name = String(item?.name || kind).slice(0, 160);
        if (kind === "image" && String(item?.url || item?.data_url || "").startsWith("data:image/")) {
          const dataUrl = String(item.url || item.data_url);
          // Keep compressed image previews; drop huge payloads.
          if (dataUrl.length <= 1_200_000) {
            return { kind, name, url: dataUrl, data_url: dataUrl };
          }
          return { kind, name };
        }
        return { kind, name };
      })
      : undefined;
    const next = { ...msg };
    if (media && media.length) next.media = media;
    else delete next.media;
    return next;
  }

  function writeSessions(sessions) {
    try {
      const payload = sessions.slice(0, 40).map((session) => ({
        ...session,
        messages: (session.messages || []).slice(-40).map(sanitizeMessageForStorage),
      }));
      window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(payload));
    } catch (_error) {
      // Ignore storage failures (often quota from media).
      try {
        const slim = sessions.slice(0, 40).map((session) => ({
          ...session,
          messages: (session.messages || []).slice(-40).map((msg) => {
            const copy = { ...msg };
            delete copy.media;
            return copy;
          }),
        }));
        window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(slim));
      } catch (__error) {
        // Ignore.
      }
    }
  }

  function readProjects() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(PROJECTS_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((entry) => entry && typeof entry === "object" && entry.name)
        .map((entry) => ({
          id: String(entry.id || `project_${Date.now().toString(36)}`),
          name: String(entry.name || "Untitled").slice(0, 48),
          createdAt: Number(entry.createdAt) || Date.now(),
          sessionIds: Array.isArray(entry.sessionIds) ? entry.sessionIds.map(String) : [],
        }))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 24);
    } catch (_error) {
      return [];
    }
  }

  function writeProjects(projects) {
    try {
      window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.slice(0, 24)));
    } catch (_error) {
      // Ignore.
    }
  }

  function chartTitleFromForecast(forecast, fallback) {
    const item = String(forecast?.item || forecast?.name || forecast?.title || "").trim();
    if (item) return item;
    const model = String(forecast?.model || "ARIMA").trim();
    const outlook = String(forecast?.outlook || "").trim();
    const label = outlook ? `${model} · ${outlook}` : model;
    return String(fallback || label).trim();
  }

  function compressImageFile(file, maxDim = 1280, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read image."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not decode image."));
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
          canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Could not process image."));
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }

  function MediaThumb({ item, onRemove }) {
    const { t } = useI18n();
    if (!item) return null;
    return (
      <div className={classNames("home-ai-attach-chip", item.kind === "video" && "is-video")}>
        {item.kind === "video" ? (
          item.url ? (
            <video src={item.url} muted playsInline preload="metadata" />
          ) : (
            <div className="home-ai-attach-fallback"><i className="fa-solid fa-film" aria-hidden="true" /></div>
          )
        ) : item.url ? (
          <img src={item.url} alt={item.name || "Attachment"} />
        ) : (
          <div className="home-ai-attach-fallback"><i className="fa-solid fa-image" aria-hidden="true" /></div>
        )}
        <span>{item.name || item.kind}</span>
        {onRemove ? (
          <button type="button" className="home-ai-attach-remove" onClick={onRemove} aria-label={t("home_removeAttachment")}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  }

  function readRatings() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(RATINGS_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch (_error) {
      return {};
    }
  }

  function writeRatings(map) {
    try {
      window.localStorage.setItem(RATINGS_KEY, JSON.stringify(map));
    } catch (_error) {
      // Ignore quota errors.
    }
  }

  function AssistantActions({ text, ratingKey, rating, onRate }) {
    const { t } = useI18n();
    const [copied, setCopied] = useState(false);
    const [shared, setShared] = useState(false);
    const plain = String(text || "").trim();

    const copyAnswer = useCallback(async () => {
      if (!plain) return;
      try {
        await navigator.clipboard.writeText(plain);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch (_error) {
        // Fallback for older browsers.
        const area = document.createElement("textarea");
        area.value = plain;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        try {
          document.execCommand("copy");
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch (_err) {
          // Ignore.
        }
        document.body.removeChild(area);
      }
    }, [plain]);

    const shareAnswer = useCallback(async () => {
      if (!plain) return;
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ text: plain });
          setShared(true);
          window.setTimeout(() => setShared(false), 1600);
          return;
        } catch (error) {
          if (error?.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(plain);
        setShared(true);
        window.setTimeout(() => setShared(false), 1600);
      } catch (_error) {
        // Ignore.
      }
    }, [plain]);

    if (!plain) return null;

    return (
      <div className="home-ai-actions" role="group" aria-label="Answer actions">
        <button
          type="button"
          className={classNames("home-ai-action-btn", copied && "is-done")}
          onClick={copyAnswer}
          title={copied ? "Copied" : "Copy"}
          aria-label={copied ? "Copied" : "Copy answer"}
        >
          <i className={copied ? "fa-solid fa-check" : "fa-regular fa-copy"} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={classNames("home-ai-action-btn", shared && "is-done")}
          onClick={shareAnswer}
          title={shared ? "Shared" : "Share"}
          aria-label={shared ? "Shared" : "Share answer"}
        >
          <i className={shared ? "fa-solid fa-check" : "fa-solid fa-arrow-up-from-bracket"} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={classNames("home-ai-action-btn", rating === "up" && "is-active is-up")}
          onClick={() => onRate?.(ratingKey, rating === "up" ? "" : "up")}
          title={t("home_goodAnswer")}
          aria-label={t("home_goodAnswer")}
          aria-pressed={rating === "up"}
        >
          <i className={rating === "up" ? "fa-solid fa-thumbs-up" : "fa-regular fa-thumbs-up"} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={classNames("home-ai-action-btn", rating === "down" && "is-active is-down")}
          onClick={() => onRate?.(ratingKey, rating === "down" ? "" : "down")}
          title={t("home_badAnswer")}
          aria-label={t("home_badAnswer")}
          aria-pressed={rating === "down"}
        >
          <i className={rating === "down" ? "fa-solid fa-thumbs-down" : "fa-regular fa-thumbs-down"} aria-hidden="true" />
        </button>
      </div>
    );
  }

  function readActiveId(sessions) {
    try {
      // The drawer on the other pages links straight to a chat: ?chat=<id>.
      const wanted = String(new URLSearchParams(window.location.search).get("chat") || "");
      if (wanted && sessions.some((entry) => entry.id === wanted)) return wanted;
    } catch (_error) {
      // Ignore.
    }
    try {
      const id = String(window.localStorage.getItem(ACTIVE_KEY) || "");
      if (id && sessions.some((entry) => entry.id === id)) return id;
    } catch (_error) {
      // Ignore.
    }
    return sessions[0]?.id || "";
  }

  // Plain (explainer) answers render their Markdown directly: ### headings,
  // • / - / numbered lists, **bold** and --- rules. They bypass the pick-list
  // pipeline, which strips non-catalog bullets and synthesizes metric strips.
  function formatPlainMarkdownHtml(text) {
    const esc = (value) => String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const inline = (value) => esc(value)
      .replace(/\*\*(.+?)\*\*/gs, "<strong>$1</strong>")
      .replace(/__(.+?)__/gs, "<strong>$1</strong>");
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    const chunks = [];
    let list = null;
    let para = [];
    const flushPara = () => {
      if (!para.length) return;
      chunks.push({ type: "text", html: para.map(inline).join("\n") });
      para = [];
    };
    const flushList = () => {
      if (!list) return;
      const cls = list.tag === "ol" ? "home-ai-md-list home-ai-md-ol" : "home-ai-md-list";
      chunks.push({ type: "block", html: `<${list.tag} class="${cls}">${list.items.map((item) => `<li>${item}</li>`).join("")}</${list.tag}>` });
      list = null;
    };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      const trimmed = line.trim();
      if (!trimmed) {
        flushPara();
        flushList();
        continue;
      }
      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushPara();
        flushList();
        const tag = heading[1].length <= 3 ? "h3" : "h4";
        chunks.push({ type: "block", html: `<${tag} class="home-ai-md-${tag}">${inline(heading[2].replace(/:\s*$/, ""))}</${tag}>` });
        continue;
      }
      // Numbered bold section header on its own line: **1. Where the supply comes from**
      const numbered = trimmed.match(/^(?:[•\-*●▪◦‣]\s+)?\*\*(\d+[.)]\s+[^*]{1,90}?)\*\*:?$/);
      if (numbered) {
        flushPara();
        flushList();
        chunks.push({ type: "block", html: `<h3 class="home-ai-md-h3 home-ai-md-numbered">${esc(numbered[1].trim())}</h3>` });
        continue;
      }
      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flushPara();
        flushList();
        chunks.push({ type: "block", html: '<hr class="home-ai-md-divider">' });
        continue;
      }
      const bullet = trimmed.match(/^(?:[•\-*●▪◦‣]|\d+[.)])\s+(.+)$/);
      if (bullet) {
        flushPara();
        const tag = /^\d/.test(trimmed) ? "ol" : "ul";
        if (!list || list.tag !== tag) {
          flushList();
          list = { tag, items: [] };
        }
        list.items.push(inline(bullet[1]));
        continue;
      }
      flushList();
      para.push(line);
    }
    flushPara();
    flushList();
    // The container is white-space: pre-wrap, so text runs are separated by a
    // blank line while block elements carry their own margins.
    let html = "";
    let prevType = "";
    chunks.forEach((chunk) => {
      if (chunk.type === "text" && prevType === "text") html += "\n\n";
      html += chunk.html;
      prevType = chunk.type;
    });
    return html;
  }

  // Types out already-formatted HTML. The final markup is rendered once and
  // then revealed character by character by editing its text nodes directly:
  // no React re-render per character and no re-parsing of half-typed markdown,
  // so the answer never flashes a raw/fallback version before being "edited"
  // into the formatted one. Elements appear the moment typing reaches them.
  function TypedRichHtml({ html, active, onComplete, onProgress }) {
    const hostRef = useRef(null);
    const onCompleteRef = useRef(onComplete);
    const onProgressRef = useRef(onProgress);
    onCompleteRef.current = onComplete;
    onProgressRef.current = onProgress;

    useEffect(() => {
      const host = hostRef.current;
      if (!host) return undefined;
      host.innerHTML = html || "";
      if (!active || !html) return undefined;

      let cancelled = false;
      let raf = 0;
      let doneTimer = 0;
      const caret = document.createElement("span");
      caret.className = "home-ai-typing-caret";
      caret.setAttribute("aria-hidden", "true");

      const finishInstantly = () => {
        caret.remove();
        host.innerHTML = html;
        onProgressRef.current?.();
        onCompleteRef.current?.();
      };

      // User left the tab/page: finish silently without the animation.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        finishInstantly();
        return undefined;
      }

      // Text nodes in document order, plus the character offset at which each
      // element first becomes relevant.
      const nodes = [];
      const elements = [];
      let total = 0;
      const walk = (node) => {
        if (node.nodeType === 3) {
          const text = node.nodeValue || "";
          if (!text.length) return;
          nodes.push({ node, text, start: total });
          total += text.length;
          return;
        }
        if (node.nodeType !== 1) return;
        if (node !== host) elements.push({ el: node, start: total });
        Array.from(node.childNodes).forEach(walk);
      };
      walk(host);
      if (!total) {
        finishInstantly();
        return undefined;
      }

      nodes.forEach((entry) => { entry.node.nodeValue = ""; });
      elements.forEach((entry) => {
        if (entry.start > 0) {
          entry.el.dataset.twHidden = "1";
          entry.el.style.display = "none";
        }
      });

      // Time budget per character (ms) with short pauses at punctuation and
      // at block boundaries (paragraphs, list items, headings, table rows).
      const base = total > 900 ? 9 : total > 450 ? 13 : 20;
      const costs = new Float32Array(total);
      let cursor = 0;
      nodes.forEach((entry) => {
        for (let i = 0; i < entry.text.length; i += 1) {
          const ch = entry.text[i];
          let cost = base;
          if (ch === "\n") cost += 90;
          else if (".!?".includes(ch)) cost += 70;
          else if (",;:".includes(ch)) cost += 28;
          costs[cursor] = cost;
          cursor += 1;
        }
      });
      elements.forEach((entry) => {
        if (entry.start > 0 && entry.start < total && /^(P|LI|H[1-6]|DIV|TR|TABLE|UL|OL|BLOCKQUOTE|BR)$/.test(entry.el.tagName)) {
          costs[entry.start] += 110;
        }
      });

      let revealed = 0;
      let nodeIdx = 0;
      let elIdx = 0;
      let budget = 0;
      let last = performance.now();
      let lastProgress = 0;
      // A timer drives the reveal (not requestAnimationFrame): rAF pauses in
      // embedded/background views that still report themselves visible, which
      // would freeze the answer at zero characters. ~60 ticks per second.
      const TICK_MS = 16;
      const schedule = () => {
        raf = window.setTimeout(() => frame(performance.now()), TICK_MS);
      };

      const placeCaret = (entry) => {
        const parent = entry.node.parentNode;
        if (!parent) return;
        if (caret.previousSibling !== entry.node || caret.parentNode !== parent) {
          parent.insertBefore(caret, entry.node.nextSibling);
        }
      };

      const frame = (now) => {
        if (cancelled) return;
        if (document.visibilityState === "hidden") {
          finishInstantly();
          return;
        }
        // Cap the catch-up after a stalled/throttled frame so text never bursts out.
        budget += Math.min(now - last, 300);
        last = now;

        let next = revealed;
        while (next < total && budget >= costs[next]) {
          budget -= costs[next];
          next += 1;
        }

        if (next > revealed) {
          while (nodeIdx < nodes.length) {
            const entry = nodes[nodeIdx];
            const end = entry.start + entry.text.length;
            const count = Math.min(next, end) - entry.start;
            entry.node.nodeValue = entry.text.slice(0, Math.max(0, count));
            if (next >= end) {
              nodeIdx += 1;
              continue;
            }
            placeCaret(entry);
            break;
          }
          while (elIdx < elements.length && (elements[elIdx].start < next || next >= total)) {
            const entry = elements[elIdx];
            if (entry.el.dataset.twHidden) {
              entry.el.style.display = "";
              delete entry.el.dataset.twHidden;
            }
            elIdx += 1;
          }
          revealed = next;
          if (now - lastProgress > 80) {
            lastProgress = now;
            onProgressRef.current?.();
          }
        }

        if (revealed >= total) {
          caret.remove();
          onProgressRef.current?.();
          doneTimer = window.setTimeout(() => {
            if (!cancelled) onCompleteRef.current?.();
          }, 260);
          return;
        }
        schedule();
      };

      schedule();
      return () => {
        cancelled = true;
        if (raf) window.clearTimeout(raf);
        if (doneTimer) window.clearTimeout(doneTimer);
        caret.remove();
      };
    }, [html, active]);

    return <div className="home-ai-text is-typing" ref={hostRef} />;
  }

  function focusIfPageVisible(element) {
    if (!element || typeof document === "undefined") return;
    if (document.visibilityState === "hidden") return;
    try {
      element.focus({ preventScroll: true });
    } catch (_error) {
      try { element.focus(); } catch (_inner) { /* ignore */ }
    }
  }

  function appendAssistantToStoredSession(sessionId, message) {
    const id = String(sessionId || "").trim();
    if (!id || !message) return;
    try {
      const sessions = readSessions();
      if (!sessions.length) return;
      const next = sessions.map((session) => {
        if (session.id !== id) return session;
        const nextMessages = (session.messages || []).concat([message]).slice(-40);
        return {
          ...session,
          messages: nextMessages,
          title: titleFromMessages(nextMessages),
          updatedAt: Date.now(),
        };
      });
      writeSessions(next);
    } catch (_error) {
      // Ignore.
    }
  }

  function HomeAiPage() {
    // `language` is a memo dependency, not decoration: anything derived through
    // t() has to be recomputed when the visitor switches language mid-chat.
    const { t, language } = useI18n();
    const { authenticated, user: steamUser, loading: sessionLoading } = useSteamSession();
    // A private chat is never written to history — the navbar's mask icon flips
    // this, and the composer keeps working exactly as before.
    const [privateChat, setPrivateChat] = useState(false);
    const canPersistChat = Boolean(authenticated) && !privateChat;
    const canPersistChatRef = useRef(canPersistChat);
    canPersistChatRef.current = canPersistChat;
    const guestResetDoneRef = useRef(false);
    const mountedRef = useRef(true);
    const activeIdRef = useRef("");

    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
      };
    }, []);

    const initialSessions = useMemo(() => {
      // Guests never restore prior chats across refreshes.
      if (!isCachedSteamAuthenticated()) {
        return [createBlankSession()];
      }
      const existing = readSessions();
      if (existing.length) return existing;
      return [createBlankSession()];
    }, []);

    const [sessions, setSessions] = useState(initialSessions);
    const [activeId, setActiveId] = useState(() => readActiveId(initialSessions) || initialSessions[0].id);
    activeIdRef.current = activeId;
    const [enabled, setEnabled] = useState(null);
    const [marketSnapshot, setMarketSnapshot] = useState(null);
    // TF2's assistant is Dell (the Engineer); the status call may rename Mark
    // but never Dell. dellify() is defined above the page component.
    const [assistantName, setAssistantNameState] = useState(PAGE_TF2 ? "Dell" : "Mark");
    const setAssistantName = (value) => { if (!PAGE_TF2) setAssistantNameState(value); };
    const [ratings, setRatings] = useState(() => readRatings());
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [activityStatus, setActivityStatus] = useState("");
    const [error, setError] = useState("");
    const [streamingReply, setStreamingReply] = useState(null);
    const [nearChatBottom, setNearChatBottom] = useState(true);
    const [listening, setListening] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [attachMenuOpen, setAttachMenuOpen] = useState(false);
    const [pendingMedia, setPendingMedia] = useState([]);
    const [waveLevels, setWaveLevels] = useState(() => Array.from({ length: WAVE_BAR_COUNT }, () => 0.16));
    const [micPressed, setMicPressed] = useState(false);
    // Random first example so the screen does not always open on the same line.
    const [placeholderIndex, setPlaceholderIndex] = useState(() => Math.floor(Math.random() * 6));
    const [placeholderFading, setPlaceholderFading] = useState(false);
    const [composerFocused, setComposerFocused] = useState(false);
    const [welcomeHeadlineIndex, setWelcomeHeadlineIndex] = useState(() => Math.floor(Math.random() * getWelcomeHeadlines().length));
    const [sidebarOpen, setSidebarOpen] = useState(false);
    // Drawer sections start folded; tapping a heading opens that one.
    const [openBrowseGroups, setOpenBrowseGroups] = useState({});

    // Phone: the navbar burger is the site's only menu button and opens this
    // drawer, so there is never a second burger on screen.
    useEffect(() => {
      const toggle = () => setSidebarOpen((open) => !open);
      window.addEventListener("cs2:toggle-ai-sidebar", toggle);
      return () => window.removeEventListener("cs2:toggle-ai-sidebar", toggle);
    }, []);


    // The navbar's mask icon turns private mode on or off and opens a fresh
    // chat either way, so nothing from the previous one carries over.
    useEffect(() => {
      const toggle = () => {
        setPrivateChat((on) => {
          const next = !on;
          document.body.classList.toggle("is-private-chat", next);
          return next;
        });
        startNewChatRef.current?.();
      };
      window.addEventListener("cs2:toggle-private-chat", toggle);
      return () => window.removeEventListener("cs2:toggle-private-chat", toggle);
    }, []);

    // Same breakpoint the navbar burger uses. The site links below only belong
    // in the phone drawer — on desktop they would spill out of the icon rail.
    const [isPhoneLayout, setIsPhoneLayout] = useState(
      () => window.matchMedia("(max-width: 900px)").matches
    );
    useEffect(() => {
      const query = window.matchMedia("(max-width: 900px)");
      const sync = (event) => setIsPhoneLayout(event.matches);
      query.addEventListener("change", sync);
      setIsPhoneLayout(query.matches);
      return () => query.removeEventListener("change", sync);
    }, []);
    // Callbacks below run outside render, so they read the layout from a ref.
    const isPhoneLayoutRef = useRef(isPhoneLayout);
    isPhoneLayoutRef.current = isPhoneLayout;

    // The phone start screen is its own design with its own breakpoint (768px),
    // kept separate from the 900px drawer breakpoint above: a 820px tablet gets
    // the drawer, not the OLED screen.
    const [isMobileHome, setIsMobileHome] = useState(
      () => window.matchMedia("(max-width: 767px)").matches
    );
    useEffect(() => {
      const query = window.matchMedia("(max-width: 767px)");
      const sync = (event) => setIsMobileHome(event.matches);
      query.addEventListener("change", sync);
      setIsMobileHome(query.matches);
      return () => query.removeEventListener("change", sync);
    }, []);
    useEffect(() => {
      document.body.classList.toggle("is-mobile-home", isMobileHome);
      return () => document.body.classList.remove("is-mobile-home");
    }, [isMobileHome]);

    // The open drawer covers the navbar as well, which lives in its own stacking
    // context above the page — this class lifts the page over it.
    useEffect(() => {
      document.body.classList.toggle("is-ai-drawer-open", sidebarOpen && isPhoneLayout);
      return () => document.body.classList.remove("is-ai-drawer-open");
    }, [sidebarOpen, isPhoneLayout]);

    const [panelMode, setPanelMode] = useState(() => {
      try {
        const panel = new URLSearchParams(window.location.search).get("panel");
        if (panel === "watchlist" || panel === "charts" || panel === "profile") return panel;
      } catch (_error) {
        // Ignore.
      }
      return "chat";
    });
    const [watchlistItems, setWatchlistItems] = useState(() => readWatchlistItems());
    const [projects, setProjects] = useState(() => (isCachedSteamAuthenticated() ? readProjects() : []));
    const [activeProjectId, setActiveProjectId] = useState(null);
    const [popupMode, setPopupMode] = useState(""); // "" | "search" | "project"
    const [chatSearchQuery, setChatSearchQuery] = useState("");
    const [dictationSupported] = useState(() => (
      typeof window !== "undefined"
      && Boolean(window.MediaRecorder)
      && Boolean(navigator.mediaDevices?.getUserMedia)
    ));

    const listRef = useRef(null);
    const stickToBottomRef = useRef(true);
    // Phone only: the thread follows the visitor's own send, never the reply
    // streaming in behind it (see the scroll effect below).
    const scrollAfterSendRef = useRef(false);
    const activityPromptRef = useRef({ content: "", media: [] });
    const inputRef = useRef(null);
    const imageInputRef = useRef(null);
    const videoInputRef = useRef(null);
    const attachWrapRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const chunksRef = useRef([]);
    const skipTranscribeRef = useRef(false);
    const baseInputRef = useRef("");
    // sendMessage is declared further down, so the transcribe handler reaches
    // it through a ref rather than a stale closure.
    const sendMessageRef = useRef(null);
    const sendAfterTranscribeRef = useRef(false);
    const listenTimerRef = useRef(0);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const waveRafRef = useRef(0);
    const micPressTimerRef = useRef(0);

    useAskAiSelectionComposer("home", (text) => {
      setPanelMode("chat");
      setInput(text);
      window.setTimeout(() => focusIfPageVisible(inputRef.current), 40);
    });

    // Links to this page with a ?panel= (the account menu's "Profile", for
    // one) switch the panel in place. Left alone, the site's soft navigation
    // would fetch index.html and re-run this bundle over itself: the page
    // dimmed and the profile never appeared. A window-level capture listener
    // runs before the soft-nav handler on document, and preventDefault() is
    // what makes that handler stand down.
    useEffect(() => {
      const PANELS = ["chat", "charts", "watchlist", "profile"];
      const onClick = (event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const anchor = event.target?.closest?.("a[href]");
        if (!anchor || (anchor.target && anchor.target !== "_self")) return;
        let url;
        try {
          url = new URL(anchor.href, window.location.href);
        } catch (_error) {
          return;
        }
        if (url.origin !== window.location.origin) return;
        // The TF2 wordmark is a hard navigation to the TF2 home, i.e. this
        // page again. The shared logo handler only knows index.html, so the
        // reload came back on the open thread. Start a blank chat first and
        // pin it as the active one, so the landing view (the composer) is
        // what the reload shows (user, 2026-10-04).
        if (PAGE_TF2 && (anchor.classList.contains("logo") || anchor.classList.contains("nav-drawer-brand"))) {
          event.preventDefault();
          const next = startNewChatRef.current?.();
          try {
            const blank = Array.isArray(next) ? next[0] : null;
            if (blank?.id) window.localStorage.setItem(ACTIVE_KEY, blank.id);
          } catch (_error) { /* private window: nothing was persisted anyway */ }
          const api = window.CS2React || {};
          const target = typeof api.crossSiteHref === "function" ? api.crossSiteHref(url.href) : url.href;
          window.setTimeout(() => window.location.assign(target), 80);
          return;
        }
        const file = url.pathname.replace(/^.*\//, "");
        if (file !== "" && file.toLowerCase() !== "index.html") return;
        const panel = String(url.searchParams.get("panel") || "").toLowerCase();
        if (!PANELS.includes(panel)) return;
        event.preventDefault();
        try {
          window.history.pushState({ softNav: true, panel }, "", url.href);
        } catch (_error) {}
        setPanelMode(panel);
        setSidebarOpen(false);
        window.scrollTo(0, 0);
      };
      window.addEventListener("click", onClick, true);
      return () => window.removeEventListener("click", onClick, true);
    }, []);

    const activeSession = sessions.find((entry) => entry.id === activeId) || sessions[0];
    const messages = activeSession?.messages || [];
    const hasConversation = messages.length > 0 || Boolean(streamingReply);
    const lastAssistantEntry = useMemo(() => {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i]?.role === "assistant") {
          return { message: messages[i], index: i };
        }
      }
      return null;
    }, [messages]);
    const lastUserBeforeAssistant = useMemo(() => {
      if (!lastAssistantEntry) return "";
      for (let i = lastAssistantEntry.index - 1; i >= 0; i -= 1) {
        if (messages[i]?.role === "user") return String(messages[i].content || "");
      }
      return "";
    }, [messages, lastAssistantEntry]);
    const dynamicFollowUps = useMemo(() => {
      const list = lastAssistantEntry?.message?.followups;
      return Array.isArray(list) ? list.filter((entry) => typeof entry === "string" && entry.trim()) : [];
    }, [lastAssistantEntry]);
    // Chips show after every finished answer: the model's own follow-ups for
    // that answer, or the recommendation chips when it sent none.
    const showRecommendFollowUps = Boolean(
      panelMode === "chat"
      && !loading
      && !streamingReply
      && lastAssistantEntry
      && (dynamicFollowUps.length > 0 || isRecommendationReply(lastAssistantEntry.message))
    );
    // Always pinned to the bottom row above the composer (no scroll gate).
    const showSuggestChips = showRecommendFollowUps;
    // Armed once Mark's first reply has actually finished — never on a cold,
    // empty chat, and never while the reply is still streaming in.
    const hasFinishedFirstReply = useMemo(
      () => !loading && !streamingReply && messages.some((entry) => entry?.role === "assistant"),
      [messages, loading, streamingReply]
    );
    const {
      suggestion: languageSuggestion,
      accept: acceptLanguageSuggestion,
      dismiss: dismissLanguageSuggestion,
    } = useLanguageSuggestion(hasFinishedFirstReply);
    // Phones have no room for the "continue in <language>?" nudge above the
    // composer — the footer language picker is still there.
    const showLanguageNudge = !isPhoneLayout && Boolean(languageSuggestion) && messages.length > 0;
    const recommendFollowUps = useMemo(() => {
      if (!showRecommendFollowUps || !lastAssistantEntry) return [];
      if (dynamicFollowUps.length) return dynamicFollowUps.slice(0, 3);
      return recommendationFollowUpChips(lastUserBeforeAssistant, lastAssistantEntry.message);
    }, [showRecommendFollowUps, dynamicFollowUps, lastUserBeforeAssistant, lastAssistantEntry, language]);
    const starterPrompts = useMemo(
      // TF2 always leads with a portfolio card (the page's headline feature),
      // then three other topics.
      () => (PAGE_TF2
        ? [
          ...pickStarterPrompts(TF2_STARTER_PROMPT_POOL.filter((entry) => entry.set === "portfolio"), 1),
          ...pickStarterPrompts(TF2_STARTER_PROMPT_POOL.filter((entry) => entry.set !== "portfolio"), 3),
        ]
        : pickStarterPrompts(STARTER_PROMPT_POOL, 4)),
      [activeId]
    );
    const activeProject = projects.find((entry) => entry.id === activeProjectId) || null;
    const composerPlaceholders = useMemo(() => getComposerPlaceholders(isPhoneLayout), [language, isPhoneLayout]);
    const composerPlaceholder = composerPlaceholders[placeholderIndex % composerPlaceholders.length];

    useEffect(() => {
      // Stops on focus as well as on text: a caret in the field means the user
      // is composing, and a line changing under it is a distraction.
      if (hasConversation || listening || transcribing || input.trim() || composerFocused) return undefined;
      let reduced = false;
      try {
        reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch (e) { /* no matchMedia: treat as motion allowed */ }
      // Reduced motion means no cycling at all, not merely no fade - the
      // movement is the thing being opted out of.
      if (reduced) return undefined;
      const step = isPhoneLayout ? 4000 : 3800;
      const timer = window.setInterval(() => {
        setPlaceholderFading(true);
        window.setTimeout(() => {
          setPlaceholderIndex((prev) => (prev + 1) % composerPlaceholders.length);
          setPlaceholderFading(false);
        }, 150);
      }, step);
      return () => window.clearInterval(timer);
    }, [hasConversation, listening, transcribing, input, isPhoneLayout, composerPlaceholders.length, composerFocused]);

    // Phones type the headline out and delete it again; desktop picks one at
    // random per load and leaves it alone.
    const welcomeHeadline = useMemo(() => {
      const headlines = getWelcomeHeadlines();
      return headlines[welcomeHeadlineIndex % headlines.length] || headlines[0];
    }, [welcomeHeadlineIndex, language]);

    // How much of the current headline is on screen, and which way it is going.
    const [typedCount, setTypedCount] = useState(0);
    const [typingPhase, setTypingPhase] = useState("typing");
    const headlineText = `${welcomeHeadline.lead} ${welcomeHeadline.accent}`;

    useEffect(() => {
      if (!isPhoneLayout || hasConversation) return undefined;
      // Start the next headline from an empty line.
      setTypedCount(0);
      setTypingPhase("typing");
    }, [isPhoneLayout, hasConversation, welcomeHeadlineIndex, language]);

    useEffect(() => {
      if (!isPhoneLayout || hasConversation) return undefined;
      const total = headlineText.length;

      // Someone who asked for less motion gets the finished line, no typing.
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        if (typedCount !== total) setTypedCount(total);
        return undefined;
      }

      if (typingPhase === "typing") {
        if (typedCount >= total) {
          const timer = window.setTimeout(() => setTypingPhase("deleting"), 4000);
          return () => window.clearTimeout(timer);
        }
        // A touch of jitter reads like a person at a keyboard, not a metronome.
        const timer = window.setTimeout(() => setTypedCount((n) => n + 1), 46 + Math.random() * 44);
        return () => window.clearTimeout(timer);
      }

      if (typedCount <= 0) {
        const headlines = getWelcomeHeadlines();
        setWelcomeHeadlineIndex((prev) => (prev + 1) % headlines.length);
        return undefined;
      }
      const timer = window.setTimeout(() => setTypedCount((n) => n - 1), 26);
      return () => window.clearTimeout(timer);
    }, [isPhoneLayout, hasConversation, typingPhase, typedCount, headlineText, language]);

    // Split back into lead and accent so the second half keeps its colour.
    const leadLength = welcomeHeadline.lead.length;
    const typedLead = isPhoneLayout
      ? headlineText.slice(0, Math.min(typedCount, leadLength))
      : welcomeHeadline.lead;
    const typedAccent = isPhoneLayout
      ? headlineText.slice(leadLength + 1, Math.max(leadLength + 1, typedCount))
      : welcomeHeadline.accent;

    const savedCharts = useMemo(() => {
      const charts = [];
      sessions.forEach((session) => {
        (session.messages || []).forEach((msg, index) => {
          if (msg?.role !== "assistant" || !msg.forecast || typeof msg.forecast !== "object") return;
          charts.push({
            id: `${session.id}:${index}`,
            sessionId: session.id,
            messageIndex: index,
            title: chartTitleFromForecast(
              msg.forecast,
              (() => {
                for (let i = index - 1; i >= 0; i -= 1) {
                  const prior = session.messages[i];
                  if (prior?.role === "user") {
                    return String(prior.content || "").trim();
                  }
                }
                return session.title;
              })()
            ),
            forecast: msg.forecast,
            distribution: msg.distribution,
            price_history: msg.price_history,
            updatedAt: Number(session.updatedAt) || Date.now(),
          });
        });
      });
      return charts.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40);
    }, [sessions]);

    const historySessions = useMemo(() => {
      const withMessages = sessions.filter((entry) => (entry.messages || []).length > 0);
      if (!activeProject) return withMessages;
      const allowed = new Set(activeProject.sessionIds || []);
      return withMessages.filter((entry) => allowed.has(entry.id));
    }, [activeProject, sessions]);

    const promptSearchHits = useMemo(() => {
      const query = chatSearchQuery.trim().toLowerCase();
      if (query.length < 1) return [];
      const hits = [];
      sessions.forEach((session) => {
        const title = String(session.title || "New chat");
        (session.messages || []).forEach((msg, index) => {
          if (msg?.role !== "user") return;
          const content = String(msg.content || "").trim();
          if (!content) return;
          const haystack = `${title} ${content}`.toLowerCase();
          if (!haystack.includes(query)) return;
          hits.push({
            id: `${session.id}:${index}`,
            sessionId: session.id,
            title,
            prompt: content,
            updatedAt: Number(session.updatedAt) || 0,
          });
        });
        if (title.toLowerCase().includes(query) && !(session.messages || []).some((msg) => msg?.role === "user")) {
          hits.push({
            id: `${session.id}:title`,
            sessionId: session.id,
            title,
            prompt: title,
            updatedAt: Number(session.updatedAt) || 0,
          });
        }
      });
      return hits.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 24);
    }, [chatSearchQuery, sessions]);

    const chatSearchInputRef = useRef(null);

    // Site search, not just a chat filter: the same search_items.php endpoint
    // the navbar overlay uses, with the matching chats listed underneath.
    const [itemHits, setItemHits] = useState([]);
    const [itemSearching, setItemSearching] = useState(false);

    useEffect(() => {
      const query = chatSearchQuery.trim();
      if (popupMode !== "search" || query.length < 2) {
        setItemHits([]);
        setItemSearching(false);
        return undefined;
      }
      const controller = new AbortController();
      setItemSearching(true);
      const timer = window.setTimeout(() => {
        fetch(`search_items.php?q=${encodeURIComponent(query)}&limit=12`, { signal: controller.signal })
          .then((response) => (response.ok ? response.json() : { items: [] }))
          .then((payload) => {
            if (controller.signal.aborted) return;
            setItemHits(Array.isArray(payload?.items) ? payload.items.slice(0, 12) : []);
          })
          .catch((searchError) => {
            if (searchError?.name !== "AbortError") setItemHits([]);
          })
          .finally(() => {
            if (!controller.signal.aborted) setItemSearching(false);
          });
      }, 160);
      return () => {
        window.clearTimeout(timer);
        controller.abort();
      };
    }, [chatSearchQuery, popupMode]);

    const closePopup = useCallback(() => {
      setPopupMode("");
      setChatSearchQuery("");
    }, []);

    const openChatSearch = useCallback(() => {
      setPopupMode("search");
      setChatSearchQuery("");
      window.setTimeout(() => focusIfPageVisible(chatSearchInputRef.current), 40);
    }, []);

    const openProjectPopup = useCallback(() => {
      setPopupMode("project");
      setChatSearchQuery("");
      setSidebarOpen(true);
      window.setTimeout(() => focusIfPageVisible(chatSearchInputRef.current), 40);
    }, []);

    useEffect(() => {
      if (!popupMode) return undefined;
      const onKey = (event) => {
        if (event.key === "Escape") closePopup();
      };
      document.addEventListener("keydown", onKey);
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = previousOverflow;
      };
    }, [popupMode, closePopup]);

    const persistSessions = useCallback((next) => {
      const sorted = [...next].sort((a, b) => b.updatedAt - a.updatedAt);
      setSessions(sorted);
      if (canPersistChatRef.current) {
        writeSessions(sorted);
      }
      return sorted;
    }, []);

    const persistProjects = useCallback((next) => {
      const sorted = [...next].sort((a, b) => b.createdAt - a.createdAt).slice(0, 24);
      setProjects(sorted);
      if (canPersistChatRef.current) {
        writeProjects(sorted);
      }
      return sorted;
    }, []);

    const submitProjectName = useCallback(() => {
      const trimmed = String(chatSearchQuery || "").trim();
      if (!trimmed) return;
      const project = {
        id: `project_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: trimmed.slice(0, 48),
        createdAt: Date.now(),
        sessionIds: [],
      };
      persistProjects([project, ...projects]);
      setActiveProjectId(project.id);
      setPanelMode("chat");
      closePopup();
    }, [chatSearchQuery, closePopup, persistProjects, projects]);

    const updateActiveMessages = useCallback((updater) => {
      setSessions((prev) => {
        const next = prev.map((session) => {
          if (session.id !== activeId) return session;
          const nextMessages = typeof updater === "function" ? updater(session.messages || []) : updater;
          return {
            ...session,
            messages: nextMessages.slice(-40),
            title: titleFromMessages(nextMessages),
            updatedAt: Date.now(),
          };
        });
        if (canPersistChatRef.current) {
          writeSessions(next);
        }
        return next;
      });
    }, [activeId]);

    const finishStreaming = useCallback(() => {
      setStreamingReply((current) => {
        if (!current?.content) return null;
        updateActiveMessages((prev) => prev.concat([{
          role: "assistant",
          content: current.content,
          forecast: current.forecast || null,
          distribution: current.distribution || null,
          price_history: current.price_history || null,
          items: current.items || [],
          plain: Boolean(current.plain),
          followups: Array.isArray(current.followups) ? current.followups : [],
        }]));
        return null;
      });
    }, [updateActiveMessages]);

    // Everything about the streaming answer is derived from the FULL reply
    // once; only the reveal is animated (see TypedRichHtml).
    const streamingView = useMemo(() => {
      if (!streamingReply) return null;
      const userPrompt = (messages.slice().reverse().find((row) => row && row.role === "user") || {}).content || "";
      const content = streamingReply.content || "";
      if (streamingReply.plain) {
        return {
          prepared: { metrics: [], sentiment: null, factors: [], body: content, showStrips: false },
          html: formatPlainMarkdownHtml(content),
        };
      }
      const prepared = typeof prepareChatAssistantSections === "function"
        ? prepareChatAssistantSections(content, {
          snapshot: marketSnapshot,
          forecast: streamingReply.forecast,
          userText: userPrompt,
        })
        : { metrics: [], sentiment: null, factors: [], body: content };
      const bodyMd = typeof resolveChatAssistantBodyMarkdown === "function"
        ? resolveChatAssistantBodyMarkdown(prepared.body, content, streamingReply.items, userPrompt)
        : ((typeof chatMarkdownHasVisibleBody === "function" && !chatMarkdownHasVisibleBody(prepared.body)
          && typeof synthesizeChatFallbackMarkdown === "function")
          ? synthesizeChatFallbackMarkdown(content, streamingReply.items, userPrompt)
          : prepared.body);
      return {
        prepared,
        html: formatChatRichText(bodyMd, streamingReply.items),
      };
    }, [streamingReply, messages, marketSnapshot]);

    const scrollThreadToBottom = useCallback(() => {
      // Typewriter progress must not drag the phone viewport along.
      if (isPhoneLayout) return;
      if (!listRef.current || !stickToBottomRef.current) return;
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [isPhoneLayout]);

    useEffect(() => {
      if (sessionLoading) return;

      if (authenticated) {
        guestResetDoneRef.current = false;
        const existing = readSessions();
        if (existing.length) {
          setSessions(existing);
          setActiveId(readActiveId(existing) || existing[0].id);
        }
        setProjects(readProjects());
        return;
      }

      // Guests get a fresh chat on each page load; never restore prior history.
      if (guestResetDoneRef.current) return;
      guestResetDoneRef.current = true;
      const blank = createBlankSession();
      setSessions([blank]);
      setActiveId(blank.id);
      setProjects([]);
      setActiveProjectId(null);
      setStreamingReply(null);
      setError("");
      setInput("");
    }, [authenticated, sessionLoading]);

    useEffect(() => {
      if (!canPersistChat) return;
      try {
        window.localStorage.setItem(ACTIVE_KEY, activeId);
      } catch (_error) {
        // Ignore.
      }
    }, [activeId, canPersistChat]);

    useEffect(() => {
      let cancelled = false;
      let attempts = 0;

      const loadStatus = () => {
        attempts += 1;
        // On TF2 the status call brings the TF2 markets overview (the strip
        // hides a snapshot of the other game).
        fetch(PAGE_TF2 ? "chat.php?game=tf2" : "chat.php", { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) => {
            if (cancelled) return;
            if (!payload || typeof payload !== "object") {
              if (attempts < 3) {
                window.setTimeout(loadStatus, 400 * attempts);
                return;
              }
              setEnabled(false);
              return;
            }
            setEnabled(Boolean(payload.enabled));
            if (payload.name) setAssistantName(String(payload.name));
            if (payload.market_snapshot && typeof payload.market_snapshot === "object") {
              setMarketSnapshot(payload.market_snapshot);
            }
          })
          .catch(() => {
            if (cancelled) return;
            if (attempts < 3) {
              window.setTimeout(loadStatus, 400 * attempts);
              return;
            }
            setEnabled(false);
          });
      };

      loadStatus();
      return () => {
        cancelled = true;
      };
    }, []);

    useEffect(() => {
      let cancelled = false;

      fetch(PAGE_TF2 ? "get_market_snapshot.php?game=tf2" : "get_market_snapshot.php", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (cancelled || !payload?.success || !payload.snapshot) return;
          setMarketSnapshot(payload.snapshot);
        })
        .catch(() => {
          // Ignore — chat replies may still attach a snapshot.
        });

      return () => {
        cancelled = true;
      };
    }, []);

    useEffect(() => {
      stickToBottomRef.current = true;
    }, [activeId]);

    useEffect(() => {
      if (!loading) {
        setActivityStatus("");
        return undefined;
      }

      const phases = homeAiActivityPhasesForPrompt(
        activityPromptRef.current.content,
        activityPromptRef.current.media
      );
      let index = 0;
      setActivityStatus(phases[0] || "aiph_searchingDb");

      let timeoutId = 0;
      const scheduleNext = () => {
        if (index >= phases.length - 1) return;
        timeoutId = window.setTimeout(() => {
          index += 1;
          setActivityStatus(phases[index]);
          scheduleNext();
        }, 1400 + Math.floor(Math.random() * 801));
      };
      scheduleNext();

      return () => {
        window.clearTimeout(timeoutId);
      };
    }, [loading]);

    useEffect(() => {
      if (!listRef.current || !stickToBottomRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      // Phone: jump to the latest only for the visitor's own message. The reply
      // typing in — and the item cards landing at the end of it — must leave
      // their scroll position alone.
      if (isPhoneLayout) {
        if (!scrollAfterSendRef.current) return;
        scrollAfterSendRef.current = false;
      }
      listRef.current.scrollTop = listRef.current.scrollHeight;
      setNearChatBottom(true);
    }, [messages, loading, activityStatus, streamingReply, activeId, isPhoneLayout]);

    const handleChatScroll = useCallback(() => {
      const el = listRef.current;
      if (!el) return;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 96;
      setNearChatBottom(distanceFromBottom <= 120);
    }, []);

    useEffect(() => {
      const el = listRef.current;
      if (!el) return;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setNearChatBottom(distanceFromBottom <= 120);
    }, [showRecommendFollowUps, activeId, messages.length]);

    const stopWaveMeter = useCallback(() => {
      if (waveRafRef.current) {
        window.cancelAnimationFrame(waveRafRef.current);
        waveRafRef.current = 0;
      }
      analyserRef.current = null;
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      if (ctx) {
        try {
          ctx.close();
        } catch (_error) {
          // Ignore.
        }
      }
      setWaveLevels(Array.from({ length: WAVE_BAR_COUNT }, () => 0.16));
    }, []);

    const startWaveMeter = useCallback((stream) => {
      stopWaveMeter();
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx || !stream) return;

      try {
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        // 1024 gives 512 bins, enough to feed a fine comb of bars; 256 only
        // had 128 and the meter read as a row of dots.
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.68;
        source.connect(analyser);
        audioContextRef.current = ctx;
        analyserRef.current = analyser;
        if (ctx.state === "suspended") {
          void ctx.resume();
        }

        const data = new Uint8Array(analyser.frequencyBinCount);
        const barCount = WAVE_BAR_COUNT;
        // Every frame re-renders all the bars, so at this bar count the state
        // update is capped at ~30/s; a short CSS transition on the bars
        // carries the eye across the gap (see .home-ai-wave span).
        const minFrameGap = 33;
        let lastPush = 0;

        const tick = () => {
          const activeAnalyser = analyserRef.current;
          if (!activeAnalyser) return;
          waveRafRef.current = window.requestAnimationFrame(tick);
          const stamp = performance.now();
          if (stamp - lastPush < minFrameGap) return;
          lastPush = stamp;

          activeAnalyser.getByteFrequencyData(data);
          const now = stamp / 320;
          const usable = Math.floor(data.length * 0.55);
          const step = Math.max(1, Math.floor(usable / barCount));
          const next = [];
          for (let i = 0; i < barCount; i += 1) {
            let sum = 0;
            const start = i * step;
            for (let j = 0; j < step; j += 1) {
              sum += data[start + j] || 0;
            }
            const avg = sum / (step * 255);
            // A quiet mic should still read as a line, not a row of dots.
            const idle = 0.16 + 0.05 * Math.sin(now + i * 0.28);
            next.push(Math.min(1, Math.max(idle, avg * 2.15)));
          }
          setWaveLevels(next);
        };
        waveRafRef.current = window.requestAnimationFrame(tick);
      } catch (_error) {
        stopWaveMeter();
      }
    }, [stopWaveMeter]);

    const releaseMicStream = useCallback(() => {
      stopWaveMeter();
      const stream = mediaStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (_error) {
            // Ignore.
          }
        });
      }
      mediaStreamRef.current = null;
    }, [stopWaveMeter]);

    const stopDictation = useCallback((options = {}) => {
      const shouldTranscribe = Boolean(options.transcribe);
      skipTranscribeRef.current = !shouldTranscribe;
      if (listenTimerRef.current) {
        window.clearTimeout(listenTimerRef.current);
        listenTimerRef.current = 0;
      }

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch (_error) {
          releaseMicStream();
          mediaRecorderRef.current = null;
          setListening(false);
        }
        return;
      }

      releaseMicStream();
      mediaRecorderRef.current = null;
      setListening(false);
    }, [releaseMicStream]);

    // The recording row's X throws the take away; its blue arrow stops,
    // transcribes and sends in one go. The plain stop button between them just
    // drops the text into the composer so it can be edited first.
    const cancelDictation = useCallback(() => {
      sendAfterTranscribeRef.current = false;
      stopDictation({ transcribe: false });
    }, [stopDictation]);

    const sendDictation = useCallback(() => {
      sendAfterTranscribeRef.current = true;
      stopDictation({ transcribe: true });
    }, [stopDictation]);

    const transcribeBlob = useCallback(async (blob, mimeType) => {
      if (!blob || blob.size < 64) {
        setError("No speech captured. Click the mic, speak, then click stop.");
        return;
      }

      setTranscribing(true);
      setError("");
      try {
        const extension = mimeType.includes("mp4")
          ? "m4a"
          : mimeType.includes("ogg")
            ? "ogg"
            : "webm";
        const form = new FormData();
        form.append("audio", blob, `dictation.${extension}`);
        const response = await fetch("transcribe.php", {
          method: "POST",
          body: form,
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload || payload.success === false) {
          throw new Error(payload?.error || "Voice dictation failed. Try again.");
        }
        const text = String(payload.text || "").trim();
        if (!text) {
          throw new Error("Could not understand that. Try again.");
        }
        const merged = `${baseInputRef.current} ${text}`.replace(/\s+/g, " ").trim();
        setInput(merged.slice(0, 1200));
        if (sendAfterTranscribeRef.current) {
          // Came from the blue arrow, so do not stop at the composer.
          sendAfterTranscribeRef.current = false;
          sendMessageRef.current?.(merged.slice(0, 1200));
          return;
        }
        window.setTimeout(() => focusIfPageVisible(inputRef.current), 40);
      } catch (requestError) {
        setError(requestError?.message || "Voice dictation failed. Try again.");
      } finally {
        setTranscribing(false);
      }
    }, []);

    useEffect(() => () => stopDictation(), [stopDictation]);

    useEffect(() => {
      if (!attachMenuOpen) return undefined;
      const onPointerDown = (event) => {
        if (attachWrapRef.current && !attachWrapRef.current.contains(event.target)) {
          setAttachMenuOpen(false);
        }
      };
      const onKeyDown = (event) => {
        if (event.key === "Escape") setAttachMenuOpen(false);
      };
      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("mousedown", onPointerDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [attachMenuOpen]);

    const clearPendingMedia = useCallback(() => {
      setPendingMedia((prev) => {
        prev.forEach((item) => {
          if (item?.kind === "video" && item.url && String(item.url).startsWith("blob:")) {
            try {
              URL.revokeObjectURL(item.url);
            } catch (_error) {
              // Ignore.
            }
          }
        });
        return [];
      });
    }, []);

    const removePendingMedia = useCallback((id) => {
      setPendingMedia((prev) => {
        const target = prev.find((item) => item.id === id);
        if (target?.kind === "video" && target.url && String(target.url).startsWith("blob:")) {
          try {
            URL.revokeObjectURL(target.url);
          } catch (_error) {
            // Ignore.
          }
        }
        return prev.filter((item) => item.id !== id);
      });
    }, []);

    const rateAnswer = useCallback((ratingKey, value) => {
      if (!ratingKey) return;
      setRatings((prev) => {
        const next = { ...prev };
        if (!value) delete next[ratingKey];
        else next[ratingKey] = value;
        writeRatings(next);
        return next;
      });
    }, []);

    const handleAttachFiles = useCallback(async (kind, fileList) => {
      const file = fileList?.[0];
      setAttachMenuOpen(false);
      if (!file) return;

      try {
        if (kind === "image") {
          if (!String(file.type || "").startsWith("image/")) {
            setError("Please choose an image file.");
            return;
          }
          if (file.size > 12 * 1024 * 1024) {
            setError("Image is too large (max 12MB).");
            return;
          }
          const dataUrl = await compressImageFile(file);
          const stamp = new Date();
          const fallbackName = `screenshot-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}-${String(stamp.getHours()).padStart(2, "0")}${String(stamp.getMinutes()).padStart(2, "0")}${String(stamp.getSeconds()).padStart(2, "0")}.jpg`;
          setPendingMedia((prev) => {
            prev.forEach((item) => {
              if (item?.kind === "video" && item.url && String(item.url).startsWith("blob:")) {
                try { URL.revokeObjectURL(item.url); } catch (_error) { /* ignore */ }
              }
            });
            return [{
              id: uid(),
              kind: "image",
              name: file.name && file.name !== "image.png" ? file.name : fallbackName,
              url: dataUrl,
              data_url: dataUrl,
            }];
          });
          setError("");
          return;
        }

        if (!String(file.type || "").startsWith("video/")) {
          setError("Please choose a video file.");
          return;
        }
        if (file.size > 40 * 1024 * 1024) {
          setError("Video is too large (max 40MB).");
          return;
        }
        const url = URL.createObjectURL(file);
        setPendingMedia((prev) => {
          prev.forEach((item) => {
            if (item?.kind === "video" && item.url && String(item.url).startsWith("blob:")) {
              try { URL.revokeObjectURL(item.url); } catch (_error) { /* ignore */ }
            }
          });
          return [{
            id: uid(),
            kind: "video",
            name: file.name || "video.mp4",
            url,
          }];
        });
        setError("");
      } catch (attachError) {
        setError(attachError?.message || "Could not attach that file.");
      }
    }, []);

    const handlePasteMedia = useCallback(async (event) => {
      if (transcribing) return;
      const clipboard = event?.clipboardData;
      if (!clipboard) return;

      const active = document.activeElement;
      if (
        active
        && active.matches?.("input, textarea, [contenteditable='true']")
        && !active.closest?.(".home-ai-composer")
        && !active.closest?.(".home-ai")
      ) {
        return;
      }

      const files = [];
      const items = clipboard.items ? Array.from(clipboard.items) : [];
      items.forEach((item) => {
        if (!item || item.kind !== "file") return;
        if (!String(item.type || "").startsWith("image/")) return;
        const file = item.getAsFile?.();
        if (file) files.push(file);
      });
      if (!files.length && clipboard.files?.length) {
        Array.from(clipboard.files).forEach((file) => {
          if (file && String(file.type || "").startsWith("image/")) files.push(file);
        });
      }
      if (!files.length) return;

      event.preventDefault();
      await handleAttachFiles("image", files);
    }, [handleAttachFiles, transcribing]);

    useEffect(() => {
      if (panelMode !== "chat") return undefined;
      const onPaste = (event) => {
        void handlePasteMedia(event);
      };
      window.addEventListener("paste", onPaste);
      return () => window.removeEventListener("paste", onPaste);
    }, [handlePasteMedia, panelMode]);

    // Clicking the logo while already on the home page: the navbar dispatches
    // this instead of a no-op soft navigation, so the logo always "exits" the
    // current chat back to the landing view.
    const startNewChatRef = useRef(null);
    useEffect(() => {
      const onHomeReset = () => {
        startNewChatRef.current?.();
        window.scrollTo({ top: 0, behavior: "smooth" });
      };
      window.addEventListener("cs2:home-reset", onHomeReset);
      return () => window.removeEventListener("cs2:home-reset", onHomeReset);
    }, []);

    // The mobile More sheet's "New project" row. It cannot call
    // openProjectPopup directly - react/mobile-shell.js is plain DOM outside
    // React - so it dispatches this when it is already on the AI home, and
    // navigates to ?project=new from any other page. Both paths end here.
    useEffect(() => {
      const onNewProject = () => openProjectPopup();
      window.addEventListener("csprice:new-project", onNewProject);

      let fromQuery = false;
      try {
        fromQuery = new URLSearchParams(window.location.search).get("project") === "new";
      } catch (_error) {
        fromQuery = false;
      }
      if (fromQuery) {
        openProjectPopup();
        // Drop the parameter so a refresh does not reopen the popup.
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete("project");
          window.history.replaceState({}, "", url.pathname + url.search + url.hash);
        } catch (_error) { /* leave the URL alone */ }
      }

      return () => window.removeEventListener("csprice:new-project", onNewProject);
    }, [openProjectPopup]);

    const startNewChat = useCallback(() => {
      stopDictation();
      clearPendingMedia();
      setAttachMenuOpen(false);
      setStreamingReply(null);
      setError("");
      setInput("");
      setPanelMode("chat");
      // On a phone the sidebar is a full-screen drawer: opening it here would
      // bury the new chat behind the menu, so it closes instead.
      setSidebarOpen(!isPhoneLayoutRef.current);
      const blank = { id: uid(), title: "New chat", updatedAt: Date.now(), messages: [] };
      const next = persistSessions([blank, ...sessions.filter((entry) => (entry.messages || []).length > 0)]);
      setActiveId(blank.id);
      if (activeProjectId) {
        persistProjects(projects.map((project) => (
          project.id === activeProjectId
            ? { ...project, sessionIds: [blank.id, ...(project.sessionIds || []).filter((id) => id !== blank.id)] }
            : project
        )));
      }
      window.setTimeout(() => focusIfPageVisible(inputRef.current), 40);
      return next;
    }, [activeProjectId, clearPendingMedia, persistProjects, persistSessions, projects, sessions, stopDictation]);
    startNewChatRef.current = startNewChat;

    const openSession = useCallback((id) => {
      stopDictation();
      clearPendingMedia();
      setAttachMenuOpen(false);
      setStreamingReply(null);
      setError("");
      setInput("");
      setPanelMode("chat");
      setActiveId(id);
      setSidebarOpen(true);
      if (window.matchMedia("(max-width: 960px)").matches) {
        setSidebarOpen(false);
      }
    }, [clearPendingMedia, stopDictation]);

    const openChartsPanel = useCallback(() => {
      setPanelMode("charts");
      setSidebarOpen(true);
      if (window.matchMedia("(max-width: 960px)").matches) {
        setSidebarOpen(false);
      }
    }, []);

    const openWatchlistPanel = useCallback(() => {
      setWatchlistItems(readWatchlistItems());
      setPanelMode("watchlist");
      setSidebarOpen(true);
      if (window.matchMedia("(max-width: 960px)").matches) {
        setSidebarOpen(false);
      }
    }, []);

    const removeWatchlistItem = useCallback((id) => {
      const next = readWatchlistItems().filter((item) => item.id !== id);
      try {
        const raw = JSON.parse(window.localStorage.getItem(WATCHLIST_KEY) || "[]");
        const filtered = Array.isArray(raw)
          ? raw.filter((entry, index) => {
              const entryId = String(entry?.id || entry?.key || entry?.itemId || `watch-${index}`);
              return entryId !== id;
            })
          : [];
        window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(filtered));
      } catch (_error) {
        // Ignore.
      }
      setWatchlistItems(next);
    }, []);

    const createProject = useCallback(() => {
      openProjectPopup();
    }, [openProjectPopup]);

    const openProject = useCallback((id) => {
      setSidebarOpen(true);
      setActiveProjectId((current) => (current === id ? null : id));
      setPanelMode("chat");
      if (window.matchMedia("(max-width: 960px)").matches) {
        setSidebarOpen(false);
      }
    }, []);

    const deleteProject = useCallback((id) => {
      const next = projects.filter((project) => project.id !== id);
      persistProjects(next);
      setActiveProjectId((current) => (current === id ? null : current));
    }, [persistProjects, projects]);

    const openChart = useCallback((chart) => {
      if (!chart?.sessionId) return;
      openSession(chart.sessionId);
    }, [openSession]);

    const deleteSession = useCallback((id) => {
      stopDictation();
      clearPendingMedia();
      setAttachMenuOpen(false);
      setStreamingReply(null);
      setError("");
      setInput("");
      setPanelMode("chat");

      setSessions((prev) => {
        const remaining = prev.filter((session) => session.id !== id);
        const withHistory = remaining.filter((session) => (session.messages || []).length > 0);
        let next = remaining;

        if (!next.length || !withHistory.length) {
          const blank = { id: uid(), title: "New chat", updatedAt: Date.now(), messages: [] };
          next = [blank, ...withHistory];
          setActiveId(blank.id);
        } else if (id === activeId) {
          setActiveId(withHistory[0].id);
        }

        if (canPersistChatRef.current) {
          writeSessions(next);
        }
        return next;
      });

      persistProjects(projects.map((project) => ({
        ...project,
        sessionIds: (project.sessionIds || []).filter((sessionId) => sessionId !== id),
      })));
    }, [activeId, clearPendingMedia, persistProjects, projects, stopDictation]);

    /**
     * `options.displayText` lets a caller show the visitor one sentence while
     * the model receives another — used by the translated starter cards, whose
     * English `prompt` is what the backend's scope detection understands.
     */
    const sendMessage = useCallback(async (rawText, options) => {
      const text = String(rawText || "").trim();
      const displayText = String((options && options.displayText) || "").trim();
      const media = pendingMedia.map((item) => ({
        kind: item.kind,
        name: item.name,
        url: item.url || "",
        data_url: item.data_url || (item.kind === "image" ? item.url : "") || "",
      }));
      if ((!text && !media.length) || loading || streamingReply) return;

      const content = text || (
        media.some((item) => item.kind === "image")
          ? "What do you see in this image?"
          : "I attached a video."
      );
      const firstStatus = homeAiActivityPhasesForPrompt(content, media)[0] || "aiph_searchingDb";
      activityPromptRef.current = { content, media };
      stickToBottomRef.current = true;
      scrollAfterSendRef.current = true;
      setError("");
      setActivityStatus(firstStatus);
      setLoading(true);
      stopDictation();
      setAttachMenuOpen(false);

      const userMessage = media.length
        ? { role: "user", content, media }
        : { role: "user", content };
      if (displayText && displayText !== content) userMessage.display = displayText;
      const nextMessages = messages.concat([userMessage]);
      updateActiveMessages(nextMessages);
      setInput("");
      setPendingMedia([]);

      try {
        const response = await fetch("chat.php", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: nextMessages.map((entry) => {
              const payload = {
                role: entry.role,
                content: entry.content,
                media: Array.isArray(entry.media) ? entry.media.map((item) => ({
                  kind: item.kind,
                  name: item.name,
                  data_url: item.data_url || (item.kind === "image" ? item.url : "") || "",
                })) : undefined,
              };
              if (entry.role === "assistant") {
                const itemName = String(
                  entry.forecast?.item_name
                  || entry.forecast?.item
                  || entry.distribution?.item_name
                  || entry.price_history?.item_name
                  || ""
                ).trim();
                payload.charts = {
                  forecast: Boolean(entry.forecast),
                  distribution: Boolean(entry.distribution),
                  price_history: Boolean(entry.price_history),
                  item: itemName,
                };
              }
              return payload;
            }),
            context: {
              lang: (window.I18N ? window.I18N.getLanguage() : "en"),
              path: window.location.pathname,
              title: document.title || "",
              page_type: "mark",
              mode: "market",
              // Tapped one of Mark's own suggestions: answer it as a read on
              // what happens next, without cards or metric strips.
              follow_up: Boolean(options && options.followUp),
              // CS2 or TF2 (the game switcher next to the logo). TF2 questions
              // are answered from the TF2 catalog (tf2_ai_helpers.php).
              game: activeGame(),
            },
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (payload && typeof payload.enabled === "boolean") {
          setEnabled(Boolean(payload.enabled));
        }
        const requestFailed = !response.ok || !payload || payload.success === false;
        if (requestFailed && !(typeof isChatEmptyReplyFailure === "function" && isChatEmptyReplyFailure(payload, response))) {
          throw new Error(payload?.error || "Chat request failed.");
        }

        if (payload.market_snapshot && typeof payload.market_snapshot === "object") {
          setMarketSnapshot(payload.market_snapshot);
        }

        const items = parseChatItems(payload.items);
        // Explainer answers keep their Markdown verbatim (the pick-list cleaner
        // would flatten their bullet lists).
        const reply = payload.plain
          ? String(payload.reply || payload.message?.content || "")
            // Same tolerant marker as the server: "---\nFOLLOWUPS---", "—FOLLOWUPS—",
            // "FOLLOW-UPS:" all count. The questions only ever show as the chips.
            .replace(/(?:^|\n|-{3,})[ \t]*[-—–_*]*\s*FOLLOW[ \t_-]?UPS[ \t]*[-—–_*:]*[\s\S]*$/, "")
            .replace(/(?:\n[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*)+\s*$/, "")
            .trim()
          : (typeof chatReplyFromPayload === "function"
            ? chatReplyFromPayload(payload, items, content)
            : (stripMarkMarkdown(String(payload.reply || payload.message?.content || "").trim())
              || (typeof synthesizeChatFallbackMarkdown === "function" ? synthesizeChatFallbackMarkdown("", items, content) : "")));

        const forecast = payload.forecast && typeof payload.forecast === "object"
          ? payload.forecast
          : null;
        const distribution = payload.distribution && typeof payload.distribution === "object"
          ? payload.distribution
          : null;
        const priceHistory = payload.price_history && typeof payload.price_history === "object"
          ? payload.price_history
          : null;
        // Explainer answers ("how does X work") are prose: no overview strip.
        const plain = Boolean(payload.plain);
        // Follow-up chips come from the model for THIS answer (never a static list).
        const followups = (Array.isArray(payload.followups) ? payload.followups : [])
          .map((entry) => String(entry || "").replace(/\s+/g, " ").trim())
          .filter((entry, index, list) => entry && entry.length <= 120 && list.indexOf(entry) === index)
          .slice(0, 4);
        const assistantMessage = {
          role: "assistant",
          content: reply,
          forecast,
          distribution,
          price_history: priceHistory,
          items,
          plain,
          followups,
        };

        // User left Mark AI (soft-nav / unmount) — save the reply quietly, never pull them back.
        if (!mountedRef.current) {
          if (canPersistChatRef.current) {
            appendAssistantToStoredSession(activeIdRef.current, assistantMessage);
          }
          return;
        }

        // Tab is in the background — commit instantly (no typewriter / focus / scroll).
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          updateActiveMessages((prev) => prev.concat([assistantMessage]));
          return;
        }

        setStreamingReply({
          content: reply,
          forecast,
          distribution,
          price_history: priceHistory,
          items,
          plain,
          followups,
        });
      } catch (requestError) {
        if (!mountedRef.current) return;
        const msg = requestError?.message || "Chat request failed.";
        if (/empty reply/i.test(msg) && typeof synthesizeChatFallbackMarkdown === "function") {
          const fallback = synthesizeChatFallbackMarkdown("", [], content);
          setStreamingReply({ content: fallback, forecast: null, distribution: null, price_history: null, items: [] });
        } else {
          setError(msg);
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }, [loading, messages, pendingMedia, stopDictation, streamingReply, updateActiveMessages]);

    sendMessageRef.current = sendMessage;

    const toggleDictation = useCallback(async () => {
      if (!dictationSupported || loading || streamingReply || transcribing) return;

      if (listening) {
        stopDictation({ transcribe: true });
        return;
      }

      if (enabled === false) {
        setError("Voice dictation needs AI configured.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        mediaStreamRef.current = stream;
        chunksRef.current = [];
        skipTranscribeRef.current = false;
        baseInputRef.current = String(input || "").trim();

        const mimeCandidates = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/ogg;codecs=opus",
        ];
        const mimeType = mimeCandidates.find((type) => (
          typeof MediaRecorder.isTypeSupported === "function"
            ? MediaRecorder.isTypeSupported(type)
            : false
        )) || "";

        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onerror = () => {
          setError("Microphone recording failed. Try again.");
          releaseMicStream();
          mediaRecorderRef.current = null;
          setListening(false);
        };

        recorder.onstop = () => {
          const shouldTranscribe = !skipTranscribeRef.current;
          const usedMime = recorder.mimeType || mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: usedMime });
          chunksRef.current = [];
          releaseMicStream();
          mediaRecorderRef.current = null;
          setListening(false);
          if (shouldTranscribe) {
            void transcribeBlob(blob, usedMime);
          }
        };

        recorder.start(250);
        startWaveMeter(stream);
        setListening(true);
        setError("");
        listenTimerRef.current = window.setTimeout(() => {
          if (mediaRecorderRef.current === recorder && recorder.state === "recording") {
            stopDictation({ transcribe: true });
          }
        }, 30000);
      } catch (requestError) {
        releaseMicStream();
        mediaRecorderRef.current = null;
        setListening(false);
        const name = String(requestError?.name || "");
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setError("Microphone permission was blocked.");
        } else if (name === "NotFoundError") {
          setError("No microphone was found.");
        } else {
          setError("Could not start microphone dictation.");
        }
      }
    }, [
      dictationSupported,
      enabled,
      input,
      listening,
      loading,
      releaseMicStream,
      startWaveMeter,
      stopDictation,
      streamingReply,
      transcribeBlob,
      transcribing,
    ]);

    const handleMicClick = useCallback(() => {
      if (micPressTimerRef.current) {
        window.clearTimeout(micPressTimerRef.current);
      }
      setMicPressed(true);
      micPressTimerRef.current = window.setTimeout(() => setMicPressed(false), 340);
      void toggleDictation();
    }, [toggleDictation]);

    useEffect(() => () => {
      if (micPressTimerRef.current) {
        window.clearTimeout(micPressTimerRef.current);
      }
    }, []);

    return (
      <Layout>
        <div className={classNames(
          "home-ai",
          !sidebarOpen && "is-sidebar-collapsed",
          sidebarOpen && "is-sidebar-open",
          // The profile page stands alone: no chat rail beside it.
          panelMode === "profile" && "is-profile"
        )}>
          {/* Waves belong to the landing view only. A chat thread, the profile
              panel and the other panels sit on the plain page colour. */}
          {panelMode === "chat" && !hasConversation ? <HeroWaves /> : null}
          <button
            type="button"
            className="home-ai-sidebar-backdrop"
            aria-label={t("home_closeSidebar")}
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="home-ai-sidebar" aria-label="Mark AI sidebar">
            {/* Phone drawer header (CSS hides it on desktop): the wordmark on the
                left, search as a round button on the right. */}
            {isPhoneLayout ? (
              <div className="home-ai-drawer-head">
                <a className="home-ai-drawer-brand" href="index.html" aria-label="CSPRICE">
                  <img src="logo.png?v=20260815-csprice-restore-1" alt="CSPRICE" />
                </a>
                <button
                  type="button"
                  className="home-ai-drawer-round"
                  onClick={openChatSearch}
                  aria-label={t("home_search")}
                >
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                </button>
              </div>
            ) : null}

            <div className="home-ai-sidebar-top">
              <button
                type="button"
                className="home-ai-sidebar-btn home-ai-sidebar-toggle"
                onClick={() => setSidebarOpen((open) => !open)}
                data-tip={sidebarOpen ? "Collapse" : "Expand"}
                title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                <i className="fa-solid fa-bars" aria-hidden="true" />
                <span>{sidebarOpen ? "Collapse" : "Menu"}</span>
              </button>
              <button
                type="button"
                className="home-ai-sidebar-btn home-ai-new"
                onClick={startNewChat}
                data-tip={t("home_newChat")}
                title={t("home_newChat")}
                aria-label={t("home_newChat")}
              >
                <i className="fa-solid fa-plus" aria-hidden="true" />
                <span>{t("home_newChat")}</span>
              </button>
            </div>

            <div className="home-ai-sidebar-divider" aria-hidden="true" />

            <nav className="home-ai-nav" aria-label="Mark AI library">
              {/* The phone drawer has search as the round button in its header,
                  so this row is desktop-only (hidden in the phone block). */}
              <button
                type="button"
                className="home-ai-sidebar-btn home-ai-nav-item home-ai-nav-search"
                onClick={openChatSearch}
                data-tip={t("home_search")}
                title={t("home_search")}
              >
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <span>{t("home_search")}</span>
              </button>
              {/* Phones get the three section hubs here instead of the chat
                  panels: the drawer is their whole nav, and the panels are one
                  tap away from the chat list below. Desktop keeps the panels. */}
              {isPhoneLayout ? (
                HUB_LINKS.map((entry) => (
                  <a
                    key={entry.href}
                    className="home-ai-sidebar-btn home-ai-nav-item home-ai-nav-hub"
                    href={entry.href}
                    data-tip={entry.label || t(entry.labelKey)}
                    title={entry.label || t(entry.labelKey)}
                  >
                    <i className={entry.icon} aria-hidden="true" />
                    <span>{entry.label || t(entry.labelKey)}</span>
                  </a>
                ))
              ) : (
                <>
                  <button
                    type="button"
                    className={classNames(
                      "home-ai-sidebar-btn home-ai-nav-item",
                      panelMode === "chat" && "is-active"
                    )}
                    onClick={() => {
                      setPanelMode("chat");
                      setSidebarOpen(true);
                    }}
                    data-tip={t("home_conversations")}
                    title={t("home_conversations")}
                  >
                    <i className="fa-solid fa-comments" aria-hidden="true" />
                    <span>{t("home_conversations")}</span>
                    {historySessions.length ? (
                      <em className="home-ai-nav-badge">{Math.min(99, historySessions.length)}</em>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className={classNames(
                      "home-ai-sidebar-btn home-ai-nav-item",
                      panelMode === "charts" && "is-active"
                    )}
                    onClick={openChartsPanel}
                    data-tip={t("home_charts")}
                    title={t("home_charts")}
                  >
                    <i className="fa-solid fa-chart-line" aria-hidden="true" />
                    <span>{t("home_charts")}</span>
                    {savedCharts.length ? (
                      <em className="home-ai-nav-badge">{Math.min(99, savedCharts.length)}</em>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className={classNames(
                      "home-ai-sidebar-btn home-ai-nav-item",
                      panelMode === "watchlist" && "is-active"
                    )}
                    onClick={openWatchlistPanel}
                    data-tip={t("common_watchlist")}
                    title={t("common_watchlist")}
                  >
                    <i className="fa-solid fa-bookmark" aria-hidden="true" />
                    <span>{t("common_watchlist")}</span>
                    {watchlistItems.length ? (
                      <em className="home-ai-nav-badge">{Math.min(99, watchlistItems.length)}</em>
                    ) : null}
                  </button>
                </>
              )}
              <button
                type="button"
                className="home-ai-sidebar-btn home-ai-nav-item"
                onClick={createProject}
                data-tip={t("home_newProject")}
                title={t("home_newProject")}
              >
                <i className="fa-regular fa-folder" aria-hidden="true" />
                <span>{t("home_newProject")}</span>
              </button>
            </nav>

            {isPhoneLayout ? (
              <nav className="home-ai-browse" aria-label="Site sections">
                {BROWSE_GROUPS.map((group) => {
                  const groupKey = group.labelKey || group.label;
                  const open = Boolean(openBrowseGroups[groupKey]);
                  return (
                    <div
                      className={classNames("home-ai-browse-group", open && "is-open")}
                      key={groupKey}
                    >
                      <button
                        type="button"
                        className="home-ai-browse-toggle"
                        aria-expanded={open}
                        onClick={() => setOpenBrowseGroups((prev) => ({
                          ...prev,
                          [groupKey]: !prev[groupKey],
                        }))}
                      >
                        <span>{group.labelKey ? t(group.labelKey) : group.label}</span>
                        <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                      </button>

                      {/* The rows stay mounted so the panel can slide open and
                          shut; the CSS animates its height. */}
                      <div className="home-ai-browse-panel">
                        <div className="home-ai-browse-panel-inner">
                          {group.links.map((link) => (
                            <a
                              key={link.href}
                              className="home-ai-sidebar-btn home-ai-nav-item home-ai-browse-link"
                              href={link.href}
                              tabIndex={open ? 0 : -1}
                            >
                              {link.category ? (
                                <CategoryNavIcon category={link.category} />
                              ) : link.casesIcon ? (
                                <span className="nav-cases-icon" aria-hidden="true" />
                              ) : link.drawnIcon ? (
                                <img
                                  className="nav-category-icon"
                                  src={`assets/icons/sections/${link.drawnIcon}`}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <i className={link.icon} aria-hidden="true" />
                              )}
                              <span>{link.labelKey ? t(link.labelKey) : link.label}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </nav>
            ) : null}

            <div className="home-ai-sidebar-divider home-ai-sidebar-divider-soft" aria-hidden="true" />

            <div className="home-ai-sidebar-scroll">
              {projects.length ? (
                <div className="home-ai-section">
                  <div className="home-ai-section-label">{t("home_projects")}</div>
                  <div className="home-ai-history">
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className={classNames("home-ai-history-item", project.id === activeProjectId && "is-active")}
                      >
                        <button
                          type="button"
                          className="home-ai-history-open"
                          onClick={() => openProject(project.id)}
                          title={project.name}
                        >
                          <i className="fa-regular fa-folder" aria-hidden="true" />
                          <span>{project.name}</span>
                        </button>
                        <button
                          type="button"
                          className="home-ai-history-delete"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteProject(project.id);
                          }}
                          title={t("home_deleteProject")}
                          aria-label={`Delete project ${project.name}`}
                        >
                          <i className="fa-regular fa-trash-can" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {historySessions.length ? (
                <div className="home-ai-section">
                  <div className="home-ai-section-label">
                    {activeProject ? activeProject.name : t("home_history")}
                  </div>
                  <div className="home-ai-history">
                    {historySessions.map((session) => (
                      <div
                        key={session.id}
                        className={classNames("home-ai-history-item", session.id === activeId && panelMode === "chat" && "is-active")}
                      >
                        <button
                          type="button"
                          className="home-ai-history-open"
                          onClick={() => openSession(session.id)}
                          title={session.title}
                        >
                          <i className="fa-regular fa-message" aria-hidden="true" />
                          <span>{session.title}</span>
                        </button>
                        <button
                          type="button"
                          className="home-ai-history-delete"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteSession(session.id);
                          }}
                          title={t("home_deleteChat")}
                          aria-label={`Delete chat ${session.title}`}
                        >
                          <i className="fa-regular fa-trash-can" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="home-ai-history-empty">{t("home_noChatsYet")}</p>
              )}
            </div>

            <div className="home-ai-sidebar-divider" aria-hidden="true" />

            <div className="home-ai-sidebar-footer">
              {authenticated && steamUser ? (
                <a
                  href="login.html"
                  className="home-ai-sidebar-profile"
                  data-tip={displaySessionName(steamUser) || "Profile"}
                  title={displaySessionName(steamUser) || `${sessionProviderLabel ? sessionProviderLabel(steamUser) : "Account"} profile`}
                  aria-label={displaySessionName(steamUser) ? `${displaySessionName(steamUser)} profile` : "Profile"}
                >
                  <span className="home-ai-sidebar-profile-avatar-wrap">
                    {avatarSessionUrl(steamUser) ? (
                      <img
                        src={avatarSessionUrl(steamUser)}
                        alt=""
                        className="home-ai-sidebar-profile-avatar"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="home-ai-sidebar-profile-fallback" aria-hidden="true">
                        <i className={`fa-brands fa-${String(steamUser.provider || "steam").toLowerCase() === "google" ? "google" : String(steamUser.provider || "").toLowerCase() === "discord" ? "discord" : "steam"}`} />
                      </span>
                    )}
                    <i className="home-ai-sidebar-online" aria-hidden="true" />
                  </span>
                  <span className="home-ai-sidebar-profile-copy">
                    <span className="home-ai-sidebar-profile-name">
                      {displaySessionName(steamUser) || t("home_signedIn")}
                    </span>
                    <small>{t("home_online")}</small>
                  </span>
                </a>
              ) : (
                <a
                  href={`steam_login.php?return_to=${encodeURIComponent(window.location.href)}`}
                  className="home-ai-sidebar-profile is-guest"
                  data-tip={t("home_logIn")}
                  title={t("home_logIn")}
                  onClick={(event) => {
                    event.preventDefault();
                    window.dispatchEvent(new CustomEvent("cs2:open-login-modal"));
                  }}
                >
                  <span className="home-ai-sidebar-profile-avatar-wrap">
                    <span className="home-ai-sidebar-profile-fallback" aria-hidden="true">
                      <i className="fa-solid fa-user" />
                    </span>
                  </span>
                  <span className="home-ai-sidebar-profile-copy">
                    <span className="home-ai-sidebar-profile-name">{t("home_logIn")}</span>
                    <small>{t("home_steamAccount")}</small>
                  </span>
                </a>
              )}
            </div>

            {/* Phone drawer footer: the profile row, pinned to the bottom. New
                chat moved to the top of the drawer with the redesign. */}
            {isPhoneLayout ? (
              <div className="home-ai-drawer-bottom">
                {authenticated && steamUser ? (
                  <a
                    className="home-ai-drawer-profile"
                    href="index.html?panel=profile"
                    aria-label={displaySessionName(steamUser) || "Profile"}
                  >
                    <span className="home-ai-drawer-avatar">
                      {avatarSessionUrl(steamUser) ? (
                        <img src={avatarSessionUrl(steamUser)} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <i className="fa-solid fa-user" aria-hidden="true" />
                      )}
                    </span>
                    <span className="home-ai-drawer-profile-name">
                      {displaySessionName(steamUser) || t("home_signedIn")}
                    </span>
                    <CSIcon name="chevronDown" size={16} className="home-ai-drawer-profile-caret" />
                  </a>
                ) : (
                  <button
                    type="button"
                    className="home-ai-drawer-profile"
                    onClick={() => window.dispatchEvent(new CustomEvent("cs2:open-login-modal"))}
                  >
                    <span className="home-ai-drawer-avatar">
                      <i className="fa-solid fa-user" aria-hidden="true" />
                    </span>
                    <span className="home-ai-drawer-profile-name">{t("home_logIn")}</span>
                    <CSIcon name="chevronDown" size={16} className="home-ai-drawer-profile-caret" />
                  </button>
                )}
              </div>
            ) : null}
          </aside>

          <main className={classNames(
            "home-ai-main",
            panelMode === "chat" && !hasConversation && "is-welcome",
            showRecommendFollowUps && "has-suggest-chips"
          )}>
            <header className="home-ai-topbar">
              <button
                type="button"
                className="home-ai-mobile-sidebar"
                onClick={() => setSidebarOpen((open) => !open)}
                aria-label="Toggle sidebar"
              >
                <i className="fa-solid fa-bars" aria-hidden="true" />
              </button>
            </header>

            <div className="home-ai-stage" ref={listRef} onScroll={handleChatScroll}>
              {panelMode === "profile" ? (
                <ProfilePanel user={steamUser} />
              ) : panelMode === "charts" ? (
                <div className="home-ai-charts-panel">
                  {savedCharts.length ? (
                    <div className="home-ai-charts-grid">
                      {savedCharts.map((chart) => (
                        <button
                          key={chart.id}
                          type="button"
                          className="home-ai-chart-card"
                          onClick={() => openChart(chart)}
                          title={chart.title}
                        >
                          <div className="home-ai-chart-card-top">
                            <span>{chart.title}</span>
                          </div>
                          <ChatForecastChart forecast={chart.forecast} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="home-ai-empty compact">
                      <i className="fa-solid fa-chart-line home-ai-empty-icon" aria-hidden="true" />
                      <h1>{t("home_noChartsYetTitle")}</h1>
                      <p>{PAGE_TF2 ? dellify(t("home_noChartsYetBody")) : t("home_noChartsYetBody")}</p>
                    </div>
                  )}
                </div>
              ) : panelMode === "watchlist" ? (
                <div className="home-ai-charts-panel home-ai-watchlist-panel">
                  {watchlistItems.length ? (
                    <div className="home-ai-charts-grid">
                      {watchlistItems.map((item) => (
                        <div key={item.id} className="home-ai-chart-card home-ai-watchlist-card">
                          <a
                            className="home-ai-watchlist-card-main"
                            href={item.href || "roi.html"}
                            title={item.name}
                          >
                            <div className="home-ai-watchlist-thumb">
                              {item.image
                                ? <img src={item.image} alt="" loading="lazy" decoding="async" />
                                : <i className="fa-solid fa-bookmark" aria-hidden="true" />}
                            </div>
                            <div className="home-ai-chart-card-top">
                              <span>{item.name}</span>
                              {item.price != null ? (
                                <em className="home-ai-watchlist-price">€{item.price.toFixed(2)}</em>
                              ) : (
                                <em className="home-ai-watchlist-price is-muted">—</em>
                              )}
                            </div>
                          </a>
                          <button
                            type="button"
                            className="home-ai-watchlist-remove"
                            onClick={() => removeWatchlistItem(item.id)}
                            title={t("home_removeFromWatchlist")}
                            aria-label={`Remove ${item.name}`}
                          >
                            <i className="fa-regular fa-trash-can" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="home-ai-empty compact">
                      <i className="fa-solid fa-bookmark home-ai-empty-icon" aria-hidden="true" />
                      <h1>{t("home_noItemsYetTitle")}</h1>
                      <p>{t("home_noItemsYetBody")}</p>
                    </div>
                  )}
                </div>
              ) : !hasConversation ? (
                isMobileHome ? (
                  <MobileStartScreen
                    onPrompt={(text) => {
                      sendMessage(text);
                      // Bring the thread into view once, after the start screen
                      // is replaced. Deliberately NOT scrollThreadToBottom:
                      // that one returns early on phones by design, so the
                      // typewriter cannot drag the viewport on every token.
                      window.setTimeout(() => {
                        try {
                          listRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
                        } catch (e) { /* older WebView: leave the scroll alone */ }
                      }, 80);
                    }}
                    userName={greetingName(steamUser)}
                  />
                ) : (
                <div className="home-ai-empty">
                  {/* Mark on a phone: the logo sits above the greeting, the way
                      the assistant apps lead with their glyph. */}
                  {isPhoneLayout ? (
                    <svg
                      className="home-ai-hero-logo"
                      viewBox="0 0 64 64"
                      role="img"
                      aria-label="CSPRICE"
                    >
                      {/* All three bars share a baseline at y=56, so each one
                          can grow up from it. They come in shortest first -
                          see .home-ai-hero-bar in home-ai.css. */}
                      <g transform="skewX(-8)">
                        <rect className="home-ai-hero-bar home-ai-hero-bar-1" x="9" y="38" width="13" height="18" rx="3.5" fill="#ffffff" />
                        <rect className="home-ai-hero-bar home-ai-hero-bar-2" x="27" y="24" width="13" height="32" rx="3.5" fill="#60a5fa" />
                        <rect className="home-ai-hero-bar home-ai-hero-bar-3" x="45" y="9" width="13" height="47" rx="3.5" fill="#2563eb" />
                      </g>
                    </svg>
                  ) : null}
                  <h1
                    className={classNames("home-ai-welcome-headline", isPhoneLayout && "is-typewriter")}
                    aria-label={headlineText}
                  >
                    {/* The caret lives inside whichever span holds the last typed
                        character, so it always sits right against the text
                        instead of after an empty accent wrapper. */}
                    <span className="home-ai-empty-lead">
                      {typedLead}
                      {isPhoneLayout && !typedAccent ? (
                        <span className="home-ai-type-caret" aria-hidden="true" />
                      ) : null}
                    </span>
                    {" "}
                    <span className="home-ai-empty-accent-wrap">
                      <span className="home-ai-empty-accent">
                        {typedAccent}
                        {isPhoneLayout && typedAccent ? (
                          <span className="home-ai-type-caret" aria-hidden="true" />
                        ) : null}
                      </span>
                    </span>
                  </h1>
                  <MarketTicker />
                </div>
                )
              ) : (
                <div className="home-ai-thread">
                  {messages.map((entry, index) => (
                    entry.role === "user" ? (
                      <div key={`${entry.role}-${index}`} className="home-ai-row is-user">
                        <div className="home-ai-bubble">
                          {Array.isArray(entry.media) && entry.media.length ? (
                            <div className="home-ai-msg-media">
                              {entry.media.map((item, mediaIndex) => (
                                <div key={`${item.name || "media"}-${mediaIndex}`} className="home-ai-msg-media-item">
                                  {item.kind === "video" ? (
                                    item.url ? (
                                      <video src={item.url} controls playsInline preload="metadata" />
                                    ) : (
                                      <div className="home-ai-attach-fallback wide">
                                        <i className="fa-solid fa-film" aria-hidden="true" />
                                        <span>{item.name || "Video"}</span>
                                      </div>
                                    )
                                  ) : item.url || item.data_url ? (
                                    <img src={item.url || item.data_url} alt={item.name || "Attachment"} />
                                  ) : (
                                    <div className="home-ai-attach-fallback wide">
                                      <i className="fa-solid fa-image" aria-hidden="true" />
                                      <span>{item.name || "Image"}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <div className="home-ai-text">{entry.display || entry.content}</div>
                        </div>
                      </div>
                    ) : (
                      <div key={`${entry.role}-${index}`} className="home-ai-row is-assistant">
                        <div className="home-ai-bubble">
                          {/* CS2: the live market overview belongs on the first answer of a
                              thread. TF2: on every answer (user, 2026-09-29). */}
                          <ChatMarketSnapshot
                            snapshot={marketSnapshot}
                            forecast={entry.forecast}
                            content={entry.content}
                            hidden={Boolean(entry.plain) || (!PAGE_TF2 && messages.findIndex((row) => row && row.role === "assistant") !== index)}
                          />
                          {(() => {
                            if (entry.plain) {
                              return (
                                <div className="home-ai-text" dangerouslySetInnerHTML={{ __html: formatPlainMarkdownHtml(entry.content) }} />
                              );
                            }
                            const userPrompt = index > 0 && messages[index - 1]?.role === "user"
                              ? String(messages[index - 1].content || "")
                              : "";
                            const prepared = typeof prepareChatAssistantSections === "function"
                              ? prepareChatAssistantSections(entry.content, {
                                snapshot: marketSnapshot,
                                forecast: entry.forecast,
                                userText: userPrompt,
                              })
                              : { metrics: [], sentiment: null, factors: [], body: entry.content };
                            const bodyMd = typeof resolveChatAssistantBodyMarkdown === "function"
                              ? resolveChatAssistantBodyMarkdown(prepared.body, entry.content, entry.items, userPrompt)
                              : ((typeof chatMarkdownHasVisibleBody === "function" && !chatMarkdownHasVisibleBody(prepared.body)
                                && typeof synthesizeChatFallbackMarkdown === "function")
                                ? synthesizeChatFallbackMarkdown(entry.content, entry.items, userPrompt)
                                : prepared.body);
                            return (
                              <>
                                {prepared.showStrips !== false ? (
                                  <div className="home-ai-metrics-factors">
                                    <ChatMetricsStrip metrics={prepared.metrics} />
                                    <ChatKeyFactorsStrip factors={prepared.factors} />
                                    <ChatSentimentStrip sentiment={prepared.sentiment} factors={prepared.factors} />
                                  </div>
                                ) : null}
                                <div className="home-ai-text" dangerouslySetInnerHTML={{ __html: formatChatRichText(bodyMd, entry.items) }} />
                              </>
                            );
                          })()}
                          <ChatAssistantMessageExtras
                            items={entry.items}
                            forecast={entry.forecast}
                            distribution={entry.distribution}
                            priceHistory={entry.price_history}
                            content={entry.content}
                          />
                          <AssistantActions
                            text={stripMarkMarkdown(entry.content)}
                            ratingKey={`${activeId}:${index}`}
                            rating={ratings[`${activeId}:${index}`] || ""}
                            onRate={rateAnswer}
                          />
                        </div>
                      </div>
                    )
                  ))}

                  {streamingReply && streamingView ? (
                    <div className="home-ai-row is-assistant is-streaming">
                      <div className="home-ai-bubble">
                        <ChatMarketSnapshot
                          snapshot={marketSnapshot}
                          forecast={streamingReply.forecast}
                          content={streamingReply.content}
                          hidden={Boolean(streamingReply.plain) || (!PAGE_TF2 && messages.some((row) => row && row.role === "assistant"))}
                        />
                        {streamingView.prepared.showStrips !== false ? (
                          <div className="home-ai-metrics-factors">
                            <ChatMetricsStrip metrics={streamingView.prepared.metrics} />
                            <ChatKeyFactorsStrip factors={streamingView.prepared.factors} />
                            <ChatSentimentStrip sentiment={streamingView.prepared.sentiment} factors={streamingView.prepared.factors} />
                          </div>
                        ) : null}
                        <TypedRichHtml
                          html={streamingView.html}
                          active
                          onComplete={finishStreaming}
                          onProgress={scrollThreadToBottom}
                        />
                        <ChatItemCards items={streamingReply.items} />
                      </div>
                    </div>
                  ) : null}

                  {loading ? (
                    <div className="home-ai-row is-assistant is-typing">
                      <div className="home-ai-bubble">
                        <div className="home-ai-typing" aria-label={`${assistantName} is thinking`}>
                          <span /><span /><span />
                        </div>
                        {/* activityStatus holds a translation key, resolved here so a
                            language switch mid-request updates the loader text too. */}
                        {activityStatus ? (
                          <div className="home-ai-search-status" aria-live="polite">{t(activityStatus)}</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {panelMode === "chat" ? (
            <footer className={classNames(
              "home-ai-composer-wrap",
              showSuggestChips && "has-suggest-chips"
            )}>
              {error ? <div className="home-ai-error">{error}</div> : null}
              {enabled === false ? (
                <div className="home-ai-error soft">
                  Add an API key in <code>config.local.php</code> to enable live AI replies.
                  {" "}
                  <button
                    type="button"
                    className="home-ai-error-retry"
                    onClick={() => {
                      fetch("chat.php", {
                        credentials: "same-origin",
                        headers: { Accept: "application/json" },
                        cache: "no-store",
                      })
                        .then((response) => (response.ok ? response.json() : null))
                        .then((payload) => {
                          if (!payload) {
                            setEnabled(false);
                            return;
                          }
                          setEnabled(Boolean(payload.enabled));
                          if (payload.name) setAssistantName(String(payload.name));
                          if (payload.enabled) setError("");
                        })
                        .catch(() => setEnabled(false));
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : null}

              {pendingMedia.length ? (
                <div className="home-ai-attach-preview">
                  {pendingMedia.map((item) => (
                    <MediaThumb
                      key={item.id}
                      item={item}
                      onRemove={() => removePendingMedia(item.id)}
                    />
                  ))}
                </div>
              ) : null}

              {/* One row above the composer: follow-up chips left, language nudge right.
                  Language nudge follows the same "scrolled near the latest message" gate
                  as the follow-up chips, instead of always being visible. */}
              {/* The language nudge belongs to an active conversation only — never
                  over the landing view of index.html. */}
              {showSuggestChips || showLanguageNudge ? (
                <div className={classNames(
                  "home-ai-bottom-row",
                  showLanguageNudge && "has-lang-nudge"
                )}>
                  {showSuggestChips ? (
                    <div
                      key={`${activeId}:${lastAssistantEntry.index}`}
                      className="home-ai-suggest-chips"
                      role="group"
                      aria-label="Follow-up suggestions"
                    >
                      {recommendFollowUps.map((label, index) => (
                        <button
                          key={label}
                          type="button"
                          className="home-ai-suggest-chip"
                          style={{ "--chip-i": index }}
                          onClick={() => sendMessage(label, { followUp: true })}
                          disabled={loading || Boolean(streamingReply)}
                        >
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <LanguageSuggestBar
                    suggestion={showLanguageNudge ? languageSuggestion : null}
                    onAccept={acceptLanguageSuggestion}
                    onDismiss={dismissLanguageSuggestion}
                  />
                </div>
              ) : null}

              <form
                className={classNames(
                  "home-ai-composer",
                  listening && "is-listening",
                  transcribing && "is-transcribing",
                  attachMenuOpen && "is-attach-open"
                )}
                onSubmit={(event) => {
                  event.preventDefault();
                  sendMessage(input);
                }}
                onPaste={(event) => {
                  void handlePasteMedia(event);
                }}
              >
                {/* While the mic is live the bar is only the wave: the plus,
                    the record button and the send button are not rendered at
                    all. Two earlier attempts did not hold - collapsing their
                    widths in CSS (the composer is a grid, so the tracks are
                    sized by the template, not by the items) and the `hidden`
                    attribute (.home-ai-attach sets `display`, which beats it).
                    Not rendering them is the only version that survives both. */}
                {!listening ? (
                <div className="home-ai-attach" ref={attachWrapRef}>
                  <button
                    type="button"
                    className={classNames("home-ai-plus", attachMenuOpen && "is-open")}
                    onClick={() => setAttachMenuOpen((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={attachMenuOpen ? "true" : "false"}
                    disabled={transcribing}
                    title={t("mhome_attach")}
                    aria-label={t("mhome_attach")}
                    aria-expanded={attachMenuOpen}
                  >
                    {/* The phone screen draws its own icon set; desktop keeps FA. */}
                    {isMobileHome
                      ? <CSIcon name="plus" size={20} />
                      : <i className="fa-solid fa-plus" aria-hidden="true" />}
                  </button>
                  {attachMenuOpen ? (
                    <div className="home-ai-attach-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => imageInputRef.current?.click?.()}
                      >
                        <i className="fa-solid fa-image" aria-hidden="true" />
                        <span>
                          <strong>{t("home_uploadImage")}</strong>
                          <small>{t("home_uploadImageFormats")}</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => videoInputRef.current?.click?.()}
                      >
                        <i className="fa-solid fa-film" aria-hidden="true" />
                        <span>
                          <strong>{t("home_uploadVideo")}</strong>
                          <small>{t("home_uploadVideoFormats")}</small>
                        </span>
                      </button>
                    </div>
                  ) : null}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      void handleAttachFiles("image", event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    hidden
                    onChange={(event) => {
                      void handleAttachFiles("video", event.target.files);
                      event.target.value = "";
                    }}
                  />
                </div>
                ) : null}
                {/* Recording row, left to right: discard, meter, stop, send.
                    It reuses the composer's own four columns, so the bar keeps
                    its shape - the meter simply takes the text field's track. */}
                {listening ? (
                  <button
                    type="button"
                    className="home-ai-dict-cancel"
                    onClick={cancelDictation}
                    title={t("home_cancelDictation")}
                    aria-label={t("home_cancelDictation")}
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                ) : null}
                {listening ? (
                  <div className="home-ai-wave" aria-hidden="true">
                    {waveLevels.map((level, index) => (
                      <span
                        key={`wave-${index}`}
                        style={{ transform: `scaleY(${Math.max(0.12, Math.min(1, level))})` }}
                      />
                    ))}
                  </div>
                ) : (
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    className={classNames(placeholderFading && "is-ph-fading")}
                    onFocus={() => setComposerFocused(true)}
                    onBlur={() => setComposerFocused(false)}
                    placeholder={
                      transcribing
                        ? t("home_transcribing")
                        // The phone now rotates too (owner, 2026-10-03); it used
                        // to be pinned to one fixed line.
                        : composerPlaceholder
                    }
                    maxLength={1200}
                    disabled={transcribing}
                    aria-label={PAGE_TF2 ? dellify(t("mhome_inputLabel")) : t("mhome_inputLabel")}
                  />
                )}
                {listening ? (
                  <button
                    type="button"
                    className="home-ai-dict-stop"
                    onClick={() => stopDictation({ transcribe: true })}
                    title={t("home_stopDictation")}
                    aria-label={t("home_stopDictation")}
                  >
                    <span className="home-ai-dict-square" aria-hidden="true" />
                  </button>
                ) : null}
                {dictationSupported && !listening ? (
                  <button
                    type="button"
                    className={classNames(
                      "home-ai-mic",
                      transcribing && "is-busy",
                      micPressed && "is-press"
                    )}
                    onClick={handleMicClick}
                    disabled={transcribing}
                    title={transcribing ? t("home_transcribing") : t("mhome_voiceInput")}
                    aria-label={transcribing ? t("home_transcribing") : t("mhome_voiceInput")}
                  >
                    {isMobileHome && !transcribing ? (
                      <CSIcon name="mic" size={18} />
                    ) : (
                      <i
                        className={classNames(
                          "fa-solid",
                          transcribing ? "fa-spinner fa-spin" : "fa-microphone"
                        )}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ) : null}
                {listening ? (
                  <button
                    type="button"
                    className="home-ai-send home-ai-dict-send"
                    onClick={sendDictation}
                    title={t("home_send")}
                    aria-label={t("home_send")}
                  >
                    {isMobileHome
                      ? <CSIcon name="arrowUp" size={18} />
                      : <i className="fa-solid fa-arrow-up" aria-hidden="true" />}
                  </button>
                ) : null}
                {!listening ? (
                  <button
                    type="submit"
                    className="home-ai-send"
                    disabled={loading || Boolean(streamingReply) || (!input.trim() && !pendingMedia.length)}
                    aria-label={t("home_send")}
                  >
                    {isMobileHome
                      ? <CSIcon name="arrowUp" size={18} />
                      : <i className="fa-solid fa-arrow-up" aria-hidden="true" />}
                  </button>
                ) : null}
              </form>

              {/* The phone start screen carries its own prompt pills above the
                  bar, so the starter cards are desktop-only there. */}
              {!hasConversation && !isMobileHome ? (
                <div className="home-ai-starters-block">
                  <div className="home-ai-starters">
                    {starterPrompts.map((entry) => (
                      <button
                        key={entry.labelKey || entry.label}
                        type="button"
                        className="home-ai-starter"
                        onClick={() => sendMessage(entry.prompt, {
                          displayText: entry.promptKey ? t(entry.promptKey) : "",
                        })}
                        disabled={loading}
                      >
                        <StarterPromptIcon />
                        <span className="home-ai-starter-copy">
                          <strong>{entry.label || t(entry.labelKey)}</strong>
                          <small>{entry.hint || t(entry.hintKey)}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </footer>
            ) : null}
          </main>
        </div>

        {popupMode ? (
          <div
            className="home-ai-prompt-search-overlay"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closePopup();
            }}
          >
            <div
              className={classNames(
                "home-ai-prompt-search-box",
                (popupMode === "project" || chatSearchQuery.trim()) && "has-results"
              )}
              role="dialog"
              aria-modal="true"
              aria-label={popupMode === "project" ? t("home_createProject") : t("nav_searchPlaceholder")}
            >
              <form
                className="home-ai-prompt-search-input-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (popupMode === "project") {
                    submitProjectName();
                    return;
                  }
                  // Items win the Enter key: this is the site search first.
                  if (itemHits[0]) {
                    window.location.href = searchItemHref(itemHits[0]);
                    return;
                  }
                  if (promptSearchHits[0]) {
                    openSession(promptSearchHits[0].sessionId);
                    closePopup();
                  }
                }}
              >
                <i
                  className={classNames(
                    "fa-solid",
                    popupMode === "project" ? "fa-folder" : "fa-magnifying-glass"
                  )}
                  aria-hidden="true"
                />
                <input
                  ref={chatSearchInputRef}
                  type="text"
                  value={chatSearchQuery}
                  onChange={(event) => setChatSearchQuery(event.target.value)}
                  placeholder={popupMode === "project" ? t("home_projectNamePlaceholder") : t("nav_searchPlaceholder")}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={popupMode === "project" ? 48 : undefined}
                />
                {/* Always in the grid so the close button keeps its column. */}
                <i
                  className={classNames(
                    "fa-solid fa-spinner fa-spin home-ai-prompt-search-spin",
                    itemSearching && "is-on"
                  )}
                  aria-hidden="true"
                />
                <button type="button" onClick={closePopup} aria-label={t("home_close")}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </form>
              {popupMode === "project" || chatSearchQuery.trim() ? (
                <div className="home-ai-prompt-search-results">
                  {popupMode === "project" ? (
                    <>
                      <p className="home-ai-prompt-search-empty">
                        {chatSearchQuery.trim()
                          ? "Press Enter to create this project."
                          : "Type a project name, then press Enter."}
                      </p>
                      <button
                        type="button"
                        className="home-ai-prompt-search-hit home-ai-prompt-search-create"
                        onClick={submitProjectName}
                        disabled={!chatSearchQuery.trim()}
                      >
                        <i className="fa-regular fa-folder" aria-hidden="true" />
                        <span>
                          <strong>{t("home_createProject")}</strong>
                          <small>{chatSearchQuery.trim() || t("home_enterNameFirst")}</small>
                        </span>
                      </button>
                    </>
                  ) : itemHits.length || promptSearchHits.length ? (
                    <>
                      {itemHits.map((item) => (
                        <a
                          key={`item-${item.market_hash_name}`}
                          className="home-ai-prompt-search-hit is-item"
                          href={searchItemHref(item)}
                          onClick={closePopup}
                        >
                          {item.image ? (
                            <img src={item.image} alt="" loading="lazy" />
                          ) : (
                            <i className="fa-regular fa-gem" aria-hidden="true" />
                          )}
                          <span>
                            <strong>{item.display_name || item.market_hash_name}</strong>
                            <small>{item.type_note || item.category || ""}</small>
                          </span>
                        </a>
                      ))}
                      {promptSearchHits.length ? (
                        <>
                          {itemHits.length ? (
                            <p className="home-ai-prompt-search-head">{t("home_conversations")}</p>
                          ) : null}
                          {promptSearchHits.map((hit) => (
                            <button
                              key={hit.id}
                              type="button"
                              className="home-ai-prompt-search-hit"
                              onClick={() => {
                                openSession(hit.sessionId);
                                closePopup();
                              }}
                            >
                              <i className="fa-regular fa-message" aria-hidden="true" />
                              <span>
                                <strong>{hit.title}</strong>
                                <small>{hit.prompt}</small>
                              </span>
                            </button>
                          ))}
                        </>
                      ) : null}
                    </>
                  ) : itemSearching ? (
                    <p className="home-ai-prompt-search-empty">{t("home_search")}…</p>
                  ) : (
                    <p className="home-ai-prompt-search-empty">{t("home_noMatchingPrompts")}</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Layout>
    );
  }

  mountPage(<HomeAiPage />);
})();
