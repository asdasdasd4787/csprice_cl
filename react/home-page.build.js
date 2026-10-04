(() => {
  (() => {
    const { useCallback, useEffect, useMemo, useRef, useState } = React;
    const { Layout, mountPage, classNames, stripMarkMarkdown, formatChatRichText, ChatForecastChart, ChatAssistantCharts, ChatAssistantMessageExtras, ChatMarketSnapshot, ChatMetricsStrip, ChatKeyFactorsStrip, ChatSentimentStrip, ChatItemCards, parseChatItems, prepareChatAssistantSections, synthesizeChatFallbackMarkdown, chatMarkdownHasVisibleBody, resolveChatAssistantBodyMarkdown, chatReplyFromPayload, isChatEmptyReplyFailure, useSteamSession, sessionDisplayName, sessionAvatarUrl, sessionProviderLabel, useI18n, CategoryNavIcon, CSIcon } = window.CS2React;
    const displaySessionName = typeof sessionDisplayName === "function" ? sessionDisplayName : (user) => String(user?.persona_name || user?.display_name || user?.name || user?.email || "").trim();
    const greetingName = (user) => String(user?.persona_name || user?.display_name || user?.name || user?.email || "").trim();
    const avatarSessionUrl = typeof sessionAvatarUrl === "function" ? sessionAvatarUrl : (user) => String(user?.avatar || user?.picture || "").trim();
    const useAskAiSelectionComposer = typeof window.CS2React.useAskAiSelectionComposer === "function" ? window.CS2React.useAskAiSelectionComposer : function useAskAiSelectionComposer2() {
    };
    (() => {
      const viewport = window.visualViewport || null;
      const root = document.documentElement;
      let appliedHeight = 0;
      let appliedInset = -1;
      const sync = () => {
        const visual = viewport ? Math.round(viewport.height) : 0;
        const layout = Math.round(root.clientHeight || window.innerHeight || 0);
        const height = Math.max(visual, layout);
        if (height > 0 && height !== appliedHeight) {
          appliedHeight = height;
          root.style.setProperty("--app-height", height + "px");
        }
        const offset = viewport ? Math.round(viewport.offsetTop) : 0;
        const covered = visual && layout ? Math.max(0, layout - visual - offset) : 0;
        const inset = covered > 120 ? covered : 0;
        if (inset !== appliedInset) {
          appliedInset = inset;
          root.style.setProperty("--keyboard-inset", inset + "px");
        }
      };
      sync();
      window.setTimeout(sync, 250);
      window.setTimeout(sync, 1200);
      window.setInterval(sync, 1e3);
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
    const PAGE_TF2 = typeof document !== "undefined" && document.documentElement.getAttribute("data-game") === "tf2";
    const dellify = (text) => String(text || "").replace(/\bMarkiem\b/g, "Dellem").replace(/\bMark(a|u|em|ovi|owi)?\b/g, "Dell$1").replace(/(?<![Ѐ-ӿ])Марк(а|у|ом|е)?(?![Ѐ-ӿ])/g, "Делл$1");
    const SESSIONS_KEY = PAGE_TF2 ? "tf2_home_ai_sessions_v1" : "cs2_home_ai_sessions_v1";
    const ACTIVE_KEY = PAGE_TF2 ? "tf2_home_ai_active_v1" : "cs2_home_ai_active_v1";
    const PROJECTS_KEY = PAGE_TF2 ? "tf2_home_ai_projects_v1" : "cs2_home_ai_projects_v1";
    const RATINGS_KEY = "cs2_home_ai_ratings_v1";
    const STEAM_SESSION_CACHE_KEY = "cs2_steam_session_cache";
    const STEAM_SESSION_CACHE_TTL_MS = 5 * 60 * 1e3;
    function isCachedSteamAuthenticated() {
      try {
        const raw = window.sessionStorage.getItem(STEAM_SESSION_CACHE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return false;
        const cachedAt = Number(parsed.cached_at || 0);
        if (cachedAt > 0 && Date.now() - cachedAt > STEAM_SESSION_CACHE_TTL_MS) return false;
        return Boolean(parsed.authenticated);
      } catch (_error) {
        return false;
      }
    }
    function createBlankSession() {
      return { id: uid(), title: "New chat", updatedAt: Date.now(), messages: [] };
    }
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
      { set: "covert", labelKey: "sp_covert_label", hintKey: "sp_covert_hint", promptKey: "sp_covert_prompt", prompt: "Which covert CS2 rifle skins look most likely to climb, and create a chart for the top pick." }
    ];
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
      { set: "killstreak", label: "Killstreak kits", hint: "Professional kit prices", prompt: "Which professional killstreak kits are good value in TF2 right now?" }
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
      } catch (_error) {
      }
    }
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
        return () => {
          cancelled = true;
        };
      }, [armed]);
      useEffect(() => {
        const i18n = window.I18N;
        if (!i18n || typeof i18n.subscribe !== "function") return void 0;
        return i18n.subscribe((code) => {
          setSuggestion((current) => current && current.code === code ? null : current);
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
      const tIn = window.I18N && typeof window.I18N.tIn === "function" ? window.I18N.tIn : (_code, key) => key;
      const { code, meta } = suggestion;
      return /* @__PURE__ */ React.createElement("div", { className: "home-ai-langswitch", role: "status", "aria-label": tIn(code, "langsw_aria") }, /* @__PURE__ */ React.createElement("span", { className: `home-ai-langswitch-flag fi fi-${meta.flagCode}`, "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", { className: "home-ai-langswitch-text" }, /* @__PURE__ */ React.createElement("strong", null, meta.name), /* @__PURE__ */ React.createElement("small", null, tIn(code, "langsw_prompt"))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "home-ai-langswitch-accept", onClick: onAccept }, tIn(code, "langsw_switch")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "home-ai-langswitch-dismiss", onClick: onDismiss }, tIn(code, "langsw_dismiss")));
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
      const usedSets = /* @__PURE__ */ new Set();
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
      return /* @__PURE__ */ React.createElement("svg", { className: "home-ai-starter-icon", viewBox: "0 0 24 24", "aria-hidden": "true", fill: "none" }, /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M12 3.75c-4.28 0-7.75 2.95-7.75 6.6 0 2.05 1.1 3.88 2.85 5.05l-.95 3.55 3.7-1.55c.7.2 1.45.3 2.15.3 4.28 0 7.75-2.95 7.75-6.6S16.28 3.75 12 3.75Z",
          stroke: "currentColor",
          strokeWidth: "1.5",
          strokeLinejoin: "round"
        }
      ), /* @__PURE__ */ React.createElement(
        "path",
        {
          d: "M8.6 9.35h6.8M8.6 12.15h6.8M8.6 14.95h4.1",
          stroke: "currentColor",
          strokeWidth: "1.5",
          strokeLinecap: "round"
        }
      ));
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
            wear: entry?.wear || ""
          };
        });
      } catch (_error) {
        return [];
      }
    }
    const STEAM_LINK_NOTICES = {
      linked: { tone: "ok", text: "Steam account connected." },
      taken: { tone: "error", text: "That Steam account is already connected to another profile." },
      error: { tone: "error", text: "Could not connect Steam. Try again." },
      not_email: { tone: "error", text: "Sign in with an email account to connect Steam." }
    };
    const DISCORD_LINK_NOTICES = {
      linked: { tone: "ok", text: "Discord account connected." },
      taken: { tone: "error", text: "That Discord account is already connected to another profile." },
      cancelled: { tone: "error", text: "Discord connection cancelled." },
      error: { tone: "error", text: "Could not connect Discord. Try again." },
      unavailable: { tone: "error", text: "Discord sign-in is not set up on this site yet." },
      not_email: { tone: "error", text: "Sign in with an email account to connect Discord." }
    };
    const EMAIL_CHANGE_NOTICES = {
      ok: { tone: "ok", text: "Email address changed. You sign in with the new one from now on." },
      taken: { tone: "error", text: "That address is now used by another account, so the change was dropped." },
      expired: { tone: "error", text: "That confirmation link has expired. Start the change again." },
      invalid: { tone: "error", text: "That confirmation link is not valid or has already been used." },
      error: { tone: "error", text: "Could not change the address. Try again." }
    };
    const PASSWORD_NOTICES = {
      ok: { tone: "ok", text: "Password changed." }
    };
    const VERIFY_NOTICES = {
      ok: { tone: "ok", text: "Email confirmed. Thanks." },
      already: { tone: "ok", text: "That address was already confirmed." },
      expired: { tone: "error", text: "That link has expired. Send yourself a new one below." },
      invalid: { tone: "error", text: "That confirmation link is not valid or has already been used." },
      error: { tone: "error", text: "Could not confirm the address. Try again." },
      notsent: {
        tone: "error",
        text: "Your account was created, but the confirmation email could not be sent. Try Resend below."
      }
    };
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
      grain: true
    };
    function heroWavePath(index, cfg) {
      const base = cfg.top + (cfg.bottom - cfg.top) * index / Math.max(1, cfg.lines - 1);
      const width = cfg.viewWidth * 2;
      const parts = [];
      for (let x = 0; x <= width; x += cfg.step) {
        const y = base + cfg.amp1 * Math.sin(2 * Math.PI * x / cfg.period1 + cfg.phase1 + index * 0.35) + cfg.amp2 * Math.sin(2 * Math.PI * x / cfg.period2 + cfg.phase2 + index * 0.9);
        parts.push(`${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`);
      }
      return parts.join(" ");
    }
    function HeroWaves({ config = HERO_WAVES }) {
      const paths = useMemo(() => Array.from({ length: config.lines }, (_unused, index) => ({
        index,
        d: heroWavePath(index, config),
        accent: index % config.accentEvery === 0
      })), [config]);
      const layerStyle = { position: "absolute", inset: 0, zIndex: -1, overflow: "hidden", pointerEvents: "none" };
      const svgStyle = { position: "absolute", top: 0, left: 0, width: "200%", height: "100%", display: "block" };
      const inlineCss = [
        "@keyframes homeAiWavesDrift{from{transform:translateX(0)}to{transform:translateX(-50%)}}",
        ".home-ai-waves{-webkit-mask-image:radial-gradient(ellipse 75% 70% at 50% 50%,#000 25%,transparent 82%);mask-image:radial-gradient(ellipse 75% 70% at 50% 50%,#000 25%,transparent 82%)}",
        ".home-ai-waves svg{will-change:transform;animation:homeAiWavesDrift 80s linear infinite}",
        "@media (prefers-reduced-motion:reduce){.home-ai-waves svg{animation:none}}"
      ].join("");
      return /* @__PURE__ */ React.createElement("div", { className: "home-ai-waves", "aria-hidden": "true", style: layerStyle }, /* @__PURE__ */ React.createElement("style", null, inlineCss), /* @__PURE__ */ React.createElement(
        "svg",
        {
          viewBox: `0 0 ${config.viewWidth * 2} ${config.viewHeight}`,
          preserveAspectRatio: "none",
          focusable: "false",
          style: svgStyle
        },
        /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("filter", { id: "home-ai-wave-glow", x: "-10%", y: "-50%", width: "120%", height: "200%", colorInterpolationFilters: "sRGB" }, /* @__PURE__ */ React.createElement("feGaussianBlur", { stdDeviation: config.accent.glow, result: "blur" }), /* @__PURE__ */ React.createElement("feMerge", null, /* @__PURE__ */ React.createElement("feMergeNode", { in: "blur" }), /* @__PURE__ */ React.createElement("feMergeNode", { in: "SourceGraphic" })))),
        /* @__PURE__ */ React.createElement("g", { fill: "none", strokeLinecap: "round" }, paths.filter((line) => !line.accent).map((line) => /* @__PURE__ */ React.createElement(
          "path",
          {
            key: line.index,
            d: line.d,
            stroke: config.line.stroke,
            strokeWidth: config.line.width,
            strokeOpacity: config.line.opacity
          }
        )), /* @__PURE__ */ React.createElement("g", { filter: "url(#home-ai-wave-glow)" }, paths.filter((line) => line.accent).map((line) => /* @__PURE__ */ React.createElement(
          "path",
          {
            key: line.index,
            d: line.d,
            stroke: config.accent.stroke,
            strokeWidth: config.accent.width,
            strokeOpacity: config.accent.opacity
          }
        ))))
      ), config.grain ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-grain", style: { position: "absolute", inset: 0, pointerEvents: "none" } }) : null);
    }
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
      "Be brutally honest about bad investments."
    ];
    const ACCT_ICON_PATHS = {
      camera: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M4 8h3l2-3h6l2 3h3v11H4z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "13", r: "3.5" })),
      spark: /* @__PURE__ */ React.createElement("path", { d: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" }),
      eye: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" })),
      shield: /* @__PURE__ */ React.createElement("path", { d: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" }),
      sun: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "4" }), /* @__PURE__ */ React.createElement("path", { d: "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" })),
      moon: /* @__PURE__ */ React.createElement("path", { d: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" }),
      monitor: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "4", width: "18", height: "12", rx: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M8 20h8M12 16v4" })),
      check: /* @__PURE__ */ React.createElement("path", { d: "M5 12l5 5 9-10" }),
      chevron: /* @__PURE__ */ React.createElement("path", { d: "M6 9l6 6 6-6" })
    };
    function AcctIcon({ name, size = 16, className }) {
      const shape = ACCT_ICON_PATHS[name];
      if (!shape) return null;
      return /* @__PURE__ */ React.createElement(
        "svg",
        {
          className: classNames("acct-icon", className),
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "1.8",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
          focusable: "false"
        },
        shape
      );
    }
    function BrandIcon({ name, size = 16 }) {
      return /* @__PURE__ */ React.createElement("i", { className: `fa-brands fa-${name} acct-brand`, style: { fontSize: size }, "aria-hidden": "true" });
    }
    function maskEmail(email) {
      const text = String(email || "");
      const at = text.indexOf("@");
      if (at <= 0) return text;
      return text.slice(0, 1) + "••••••" + text.slice(at);
    }
    const THEME_OPTIONS = [
      { id: "light", icon: "sun", label: "Light" },
      { id: "dark", icon: "moon", label: "Dark" },
      { id: "system", icon: "monitor", label: "System" }
    ];
    function readThemeChoiceSafe() {
      const api = window.CS2React || {};
      if (typeof api.readThemeChoice === "function") return api.readThemeChoice();
      try {
        const stored = String(window.localStorage.getItem("csprice-theme") || "");
        if (["light", "dark", "system"].includes(stored)) return stored;
      } catch (_error) {
      }
      return "system";
    }
    function applyThemeChoiceSafe(choice) {
      const api = window.CS2React || {};
      if (typeof api.applyThemeChoice === "function") {
        api.applyThemeChoice(choice);
        return;
      }
      const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      const resolved = choice === "system" ? dark ? "dark" : "light" : choice;
      try {
        window.localStorage.setItem("csprice-theme", choice);
      } catch (_error) {
      }
      document.documentElement.setAttribute("data-theme", resolved);
      window.dispatchEvent(new CustomEvent("csprice:theme-change", { detail: { choice, resolved } }));
    }
    function ThemeRadioGroup({ labelledBy }) {
      const [choice, setChoice] = useState(() => window.__cspriceTheme && window.__cspriceTheme.choice || readThemeChoiceSafe());
      const buttonRefs = useRef([]);
      useEffect(() => {
        const onChange = (event) => setChoice(event.detail && event.detail.choice || readThemeChoiceSafe());
        window.addEventListener("csprice:theme-change", onChange);
        return () => window.removeEventListener("csprice:theme-change", onChange);
      }, []);
      const pick = (id) => {
        setChoice(id);
        applyThemeChoiceSafe(id);
      };
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
      return /* @__PURE__ */ React.createElement("div", { className: "acct-segmented", role: "radiogroup", "aria-labelledby": labelledBy }, THEME_OPTIONS.map((option, index) => {
        const active = choice === option.id;
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: option.id,
            ref: (el) => {
              buttonRefs.current[index] = el;
            },
            type: "button",
            role: "radio",
            "aria-checked": active,
            tabIndex: active ? 0 : -1,
            className: classNames("acct-segment", active && "is-active"),
            onClick: () => pick(option.id),
            onKeyDown: (event) => onKeyDown(event, index)
          },
          /* @__PURE__ */ React.createElement(AcctIcon, { name: option.icon, size: 15 }),
          /* @__PURE__ */ React.createElement("span", null, option.label)
        );
      }));
    }
    function SaveButton({ label = "Save", state = "", disabled = false, onClick, type = "button", className }) {
      return /* @__PURE__ */ React.createElement(
        "button",
        {
          type,
          className: classNames("acct-btn acct-btn--primary", state === "saved" && "is-saved", className),
          disabled: disabled || state === "busy",
          onClick,
          "aria-live": "polite"
        },
        state === "busy" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { className: "acct-spinner", "aria-hidden": "true" }), "Saving…") : state === "saved" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(AcctIcon, { name: "check" }), "Saved") : label
      );
    }
    const PERSONA_PRESETS = [
      {
        id: "direct",
        title: "Straight to the point",
        subtitle: "Short, no fluff",
        text: "Straight to the point: short answers, no fluff. Numbers first, then one sentence why."
      },
      {
        id: "meme",
        title: "Meme mode",
        subtitle: "Funny, full of memes",
        text: "Meme mode: be funny and use memes and jokes in every answer, but keep the numbers right."
      },
      {
        id: "analyst",
        title: "Deep analyst",
        subtitle: "Charts and data",
        text: "Deep analyst: lead with charts and data, explain the reasoning behind every price call and quantify the risk."
      },
      {
        id: "beginner",
        title: "Beginner friendly",
        subtitle: "Explains everything",
        text: "Beginner friendly: explain everything like I'm new to CS2 trading, define the jargon and keep it patient."
      }
    ];
    function ProfileLoadingState({ status = "Fetching your inventory from Steam" }) {
      return /* @__PURE__ */ React.createElement("div", { className: "profile-loading" }, /* @__PURE__ */ React.createElement("div", { className: "profile-loading-avatar-wrap", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", { className: "profile-loading-ring" }), /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-user profile-loading-icon" })), /* @__PURE__ */ React.createElement("div", { className: "profile-loading-text", role: "status", "aria-live": "polite" }, /* @__PURE__ */ React.createElement("h1", { className: "profile-loading-heading" }, "Loading your profile"), /* @__PURE__ */ React.createElement("div", { className: "profile-loading-bar", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", { className: "profile-loading-bar-fill" })), /* @__PURE__ */ React.createElement("p", { className: "profile-loading-status" }, status)));
    }
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
      if (!document.getElementById("inv-embed-override")) {
        const style = document.createElement("style");
        style.id = "inv-embed-override";
        style.textContent = "html,body{color:var(--text,#fff);scrollbar-width:auto;-ms-overflow-style:auto}html::-webkit-scrollbar,body::-webkit-scrollbar{display:block;width:auto}";
        document.head.appendChild(style);
      }
    }
    let invAssetsPromise = null;
    function invResolveAssets() {
      const fromMeta = {
        login: invAssetFromMeta("inv-login-css"),
        collections: invAssetFromMeta("inv-collections-css"),
        dash: invAssetFromMeta("inv-dash-css"),
        js: invAssetFromMeta("inv-dash-js")
      };
      if (fromMeta.js && fromMeta.dash && fromMeta.login) return Promise.resolve(fromMeta);
      if (!invAssetsPromise) {
        invAssetsPromise = fetch("login.html", { credentials: "same-origin", cache: "no-cache" }).then((response) => response.ok ? response.text() : "").then((html) => {
          const find = (pattern) => {
            const match = html.match(pattern);
            return match ? match[1] : "";
          };
          return {
            login: fromMeta.login || find(/href="((?:[^"]*\/)?styles\/css\/login\.css[^"]*)"/),
            collections: fromMeta.collections || find(/href="((?:[^"]*\/)?styles\/css\/collections\.css[^"]*)"/),
            dash: fromMeta.dash || find(/href="((?:[^"]*\/)?styles\/css\/inventory-dashboard\.css[^"]*)"/),
            js: fromMeta.js || find(/src="((?:[^"]*\/)?react\/auth-pages\.js[^"]*)"/)
          };
        }).catch(() => fromMeta);
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
      new Function(invDashboardSource)();
    }
    function ProfileInventorySection({ steamId, tf2 }) {
      const [error, setError] = useState("");
      const hostRef = useRef(null);
      const sectionRef = useRef(null);
      const game = tf2 ? "TF2" : "CS2";
      const scrollToSelf = useCallback(() => {
        try {
          if (window.location.hash !== "#inventory" || !sectionRef.current) return;
          sectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (_error) {
        }
      }, []);
      useEffect(() => {
        const timer = window.setTimeout(scrollToSelf, 80);
        return () => window.clearTimeout(timer);
      }, [scrollToSelf]);
      useEffect(() => {
        if (!steamId) return void 0;
        let alive = true;
        invRunDashboard().then(() => {
          if (alive) window.setTimeout(scrollToSelf, 400);
        }).catch((err) => {
          if (alive) setError(err && err.message ? err.message : "Inventory could not be loaded.");
        });
        return () => {
          alive = false;
          if (hostRef.current) hostRef.current.innerHTML = "";
          document.body.classList.remove("steam-dashboard-page");
        };
      }, [steamId]);
      return /* @__PURE__ */ React.createElement("section", { className: "acct-card acct-card--inventory", id: "inventory", "aria-label": "Inventory", ref: sectionRef }, !steamId ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "acct-inv-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "acct-label" }, "Inventory"), /* @__PURE__ */ React.createElement("p", { className: "acct-inv-subtitle" }, "Steam not connected"))), /* @__PURE__ */ React.createElement("div", { className: "acct-inv-empty" }, /* @__PURE__ */ React.createElement("span", { className: "acct-inv-empty-icon", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-box-open" })), /* @__PURE__ */ React.createElement("h3", null, "Connect Steam to see your inventory"), /* @__PURE__ */ React.createElement("p", null, "We read your public ", game, " inventory and price every item. Nothing on your Steam account changes."), /* @__PURE__ */ React.createElement("a", { className: "acct-btn acct-btn--primary", href: "steam_link.php" }, /* @__PURE__ */ React.createElement(BrandIcon, { name: "steam" }), "Connect Steam"))) : /* @__PURE__ */ React.createElement(React.Fragment, null, error ? /* @__PURE__ */ React.createElement("p", { className: "acct-error", role: "alert" }, error) : null, /* @__PURE__ */ React.createElement("div", { id: "inventory-embed", className: "acct-inv-embed steam-dashboard-embed", ref: hostRef })));
    }
    function ProfilePanel({ user }) {
      const [profile, setProfile] = useState(null);
      const [loadError, setLoadError] = useState("");
      const [name, setName] = useState("");
      const [busy, setBusy] = useState("");
      const [saved, setSaved] = useState("");
      const [fieldErrors, setFieldErrors] = useState({});
      const [emailShown, setEmailShown] = useState(false);
      const [inboxSent, setInboxSent] = useState(false);
      const [emailEditing, setEmailEditing] = useState(false);
      const [newEmail, setNewEmail] = useState("");
      const [emailPassword, setEmailPassword] = useState("");
      const [emailSent, setEmailSent] = useState("");
      const [notice] = useState(() => {
        try {
          const params = new URLSearchParams(window.location.search);
          return VERIFY_NOTICES[params.get("verify")] || STEAM_LINK_NOTICES[params.get("steam")] || DISCORD_LINK_NOTICES[params.get("discord")] || EMAIL_CHANGE_NOTICES[params.get("email")] || PASSWORD_NOTICES[params.get("password")] || null;
        } catch (_error) {
          return null;
        }
      });
      const fileRef = useRef(null);
      const [editorFile, setEditorFile] = useState(null);
      const i18nApi = typeof window !== "undefined" ? window.I18N : null;
      const [languageChoice, setLanguageChoice] = useState(() => i18nApi && typeof i18nApi.hasStoredLanguage === "function" && i18nApi.hasStoredLanguage() ? String(i18nApi.getLanguage() || "en") : "auto");
      const chooseLanguage = (code) => {
        setLanguageChoice(code);
        if (!i18nApi) return;
        if (code === "auto") {
          try {
            window.localStorage.removeItem("csprice_lang");
          } catch (_error) {
          }
          if (typeof i18nApi.suggestLanguage === "function") {
            i18nApi.suggestLanguage().then((suggested) => {
              if (suggested && suggested.code) i18nApi.setLanguage(suggested.code);
            }).catch(() => {
            });
          }
          return;
        }
        i18nApi.setLanguage(code);
      };
      const [persona, setPersona] = useState("");
      const [personaExampleIndex, setPersonaExampleIndex] = useState(0);
      useEffect(() => {
        if (persona) return void 0;
        const timer = window.setInterval(() => {
          setPersonaExampleIndex((index) => (index + 1) % PERSONA_EXAMPLES.length);
        }, 1e4);
        return () => window.clearInterval(timer);
      }, [persona]);
      const applyProfile = useCallback((next) => {
        setProfile(next);
        setName(String(next?.display_name || ""));
        setPersona(String(next?.ai_instructions || ""));
      }, []);
      useEffect(() => {
        let cancelled = false;
        fetch("profile_api.php", { credentials: "same-origin", headers: { Accept: "application/json" } }).then(async (response) => {
          const payload = await response.json().catch(() => null);
          if (cancelled) return;
          if (payload?.ok) {
            applyProfile(payload.profile);
            return;
          }
          setLoadError(
            payload?.error || `profile_api.php returned HTTP ${response.status} without JSON.`
          );
        }).catch(() => {
          if (!cancelled) setLoadError("Could not reach the server.");
        });
        return () => {
          cancelled = true;
        };
      }, [applyProfile]);
      const post = useCallback(async (body, label) => {
        setBusy(label);
        setFieldErrors((prev) => ({ ...prev, [label]: "" }));
        try {
          const response = await fetch("profile_api.php", {
            method: "POST",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            body
          });
          const payload = await response.json().catch(() => null);
          if (!payload?.ok) {
            setFieldErrors((prev) => ({ ...prev, [label]: payload?.error || "That did not save." }));
            return false;
          }
          applyProfile(payload.profile);
          setSaved(label);
          window.setTimeout(() => setSaved((current) => current === label ? "" : current), 1800);
          return true;
        } catch (_error) {
          setFieldErrors((prev) => ({ ...prev, [label]: "Could not reach the server." }));
          return false;
        } finally {
          setBusy("");
        }
      }, [applyProfile]);
      const closeEditor = useCallback(() => setEditorFile(null), []);
      const applyEditor = useCallback(async (blob) => {
        const body = new FormData();
        body.append("action", "avatar");
        body.append("avatar", blob, "avatar.png");
        setEditorFile(null);
        await post(body, "avatar");
      }, [post]);
      if (loadError) {
        return /* @__PURE__ */ React.createElement("div", { className: "home-ai-empty compact" }, /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-user home-ai-empty-icon", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("h1", null, "Profile unavailable"), /* @__PURE__ */ React.createElement("p", null, loadError));
      }
      if (!profile) {
        return /* @__PURE__ */ React.createElement(ProfileLoadingState, { status: "Fetching your inventory from Steam" });
      }
      const avatarUrl = String(profile.avatar_url || "");
      const steamId = String(profile.steam_id || "");
      const discordId = String(profile.discord_id || "");
      const initials = String(profile.display_name || profile.email || "U").trim().slice(0, 2).toUpperCase();
      const memberSince = formatProfileDate(profile.created_at);
      const stateOf = (label) => busy === label ? "busy" : saved === label ? "saved" : "";
      const activePreset = PERSONA_PRESETS.find((preset) => preset.text === persona.trim()) || null;
      const savedPersona = String(profile.ai_instructions || "").trim();
      const languages = i18nApi && Array.isArray(i18nApi.LANGUAGES) ? i18nApi.LANGUAGES : [];
      const avatarRules = "JPG, PNG, WEBP or GIF, up to 3 MB. Cropped to a square.";
      const onPickAvatar = (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file) return;
        setEditorFile(file);
      };
      const fieldError = (label) => fieldErrors[label] ? /* @__PURE__ */ React.createElement("p", { className: "acct-error", role: "alert" }, fieldErrors[label]) : null;
      return /* @__PURE__ */ React.createElement("div", { className: "home-ai-profile-panel" }, /* @__PURE__ */ React.createElement("div", { className: "acct" }, notice ? /* @__PURE__ */ React.createElement("div", { className: classNames("acct-notice", `is-${notice.tone}`), role: "status" }, notice.text) : null, profile.email && !profile.email_verified_at ? /* @__PURE__ */ React.createElement("div", { className: "acct-verify" }, /* @__PURE__ */ React.createElement("span", { className: "acct-iconbox acct-iconbox--tint", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-envelope" })), /* @__PURE__ */ React.createElement("div", { className: "acct-conn-text" }, /* @__PURE__ */ React.createElement("strong", null, "Confirm your email address"), /* @__PURE__ */ React.createElement("span", null, "We sent a link to ", profile.email, ". It works for 24 hours.")), /* @__PURE__ */ React.createElement(
        SaveButton,
        {
          label: "Resend",
          state: stateOf("verify"),
          onClick: () => post(new URLSearchParams({ action: "resend_verification" }), "verify")
        }
      ), fieldError("verify")) : null, /* @__PURE__ */ React.createElement("section", { className: "acct-card acct-card--profile", "aria-label": "Profile" }, /* @__PURE__ */ React.createElement("div", { className: "acct-avatar" }, avatarUrl ? /* @__PURE__ */ React.createElement("img", { src: avatarUrl, alt: "" }) : /* @__PURE__ */ React.createElement("span", null, initials)), /* @__PURE__ */ React.createElement("div", { className: "acct-profile-id" }, /* @__PURE__ */ React.createElement("h1", { className: "acct-username" }, profile.display_name || "Your name"), memberSince ? /* @__PURE__ */ React.createElement("p", { className: "acct-member" }, "Member since ", memberSince) : null, /* @__PURE__ */ React.createElement("div", { className: "acct-avatar-actions" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "acct-btn acct-btn--primary",
          title: avatarRules,
          "aria-describedby": "acct-avatar-rules",
          onClick: () => fileRef.current && fileRef.current.click(),
          disabled: busy === "avatar"
        },
        busy === "avatar" ? /* @__PURE__ */ React.createElement("span", { className: "acct-spinner", "aria-hidden": "true" }) : /* @__PURE__ */ React.createElement(AcctIcon, { name: "camera" }),
        busy === "avatar" ? "Uploading…" : "Change picture"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "acct-btn acct-btn--secondary",
          onClick: () => post(new URLSearchParams({ action: "avatar_clear" }), "avatar"),
          disabled: !avatarUrl || busy === "avatar"
        },
        "Remove"
      )), /* @__PURE__ */ React.createElement("span", { id: "acct-avatar-rules", className: "acct-sr-only" }, avatarRules), fieldError("avatar")), /* @__PURE__ */ React.createElement("div", { className: "acct-profile-body" }, /* @__PURE__ */ React.createElement(
        "form",
        {
          className: "acct-field",
          onSubmit: (event) => {
            event.preventDefault();
            post(new URLSearchParams({ action: "save", display_name: name }), "name");
          }
        },
        /* @__PURE__ */ React.createElement("label", { className: "acct-label", htmlFor: "acct-username" }, "Username"),
        /* @__PURE__ */ React.createElement("div", { className: "acct-row" }, /* @__PURE__ */ React.createElement(
          "input",
          {
            id: "acct-username",
            type: "text",
            className: "acct-input",
            value: name,
            maxLength: 40,
            autoComplete: "nickname",
            "aria-describedby": "acct-username-hint",
            onChange: (event) => setName(event.target.value)
          }
        ), /* @__PURE__ */ React.createElement(
          SaveButton,
          {
            type: "submit",
            state: stateOf("name"),
            disabled: !name.trim() || name === profile.display_name
          }
        )),
        /* @__PURE__ */ React.createElement("p", { id: "acct-username-hint", className: "acct-hint" }, "Shown in the navbar. Up to 40 characters."),
        fieldError("name")
      ), /* @__PURE__ */ React.createElement("p", { className: "acct-label acct-label--account" }, "Account"), /* @__PURE__ */ React.createElement("dl", { className: "acct-info" }, /* @__PURE__ */ React.createElement("div", { className: "acct-info-row" }, /* @__PURE__ */ React.createElement("dt", null, "Signed in with"), /* @__PURE__ */ React.createElement("dd", null, { email: "Email", steam: "Steam", discord: "Discord", google: "Google" }[String(profile.signed_in_with || "")] || (profile.email ? "Email" : steamId ? "Steam" : discordId ? "Discord" : "Account"))), /* @__PURE__ */ React.createElement("div", { className: "acct-info-row" }, /* @__PURE__ */ React.createElement("dt", null, "Email"), /* @__PURE__ */ React.createElement("dd", null, /* @__PURE__ */ React.createElement("span", { className: "acct-email", title: emailShown ? profile.email || "" : void 0 }, profile.email ? emailShown ? profile.email : maskEmail(profile.email) : "None yet"), profile.email ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: classNames("acct-eye", emailShown && "is-on"),
          "aria-pressed": emailShown,
          "aria-label": emailShown ? "Hide email address" : "Show email address",
          onClick: () => setEmailShown((value) => !value)
        },
        /* @__PURE__ */ React.createElement(AcctIcon, { name: "eye", size: 15 })
      ) : null)), memberSince ? /* @__PURE__ */ React.createElement("div", { className: "acct-info-row" }, /* @__PURE__ */ React.createElement("dt", null, "Member since"), /* @__PURE__ */ React.createElement("dd", null, memberSince)) : null)), /* @__PURE__ */ React.createElement(
        "input",
        {
          ref: fileRef,
          type: "file",
          accept: "image/png,image/jpeg,image/webp,image/gif",
          hidden: true,
          onChange: onPickAvatar
        }
      ), editorFile && typeof window.CS2React?.AvatarEditorModal === "function" ? /* @__PURE__ */ React.createElement(
        window.CS2React.AvatarEditorModal,
        {
          file: editorFile,
          onCancel: closeEditor,
          onApply: applyEditor
        }
      ) : null), /* @__PURE__ */ React.createElement("section", { className: "acct-card acct-card--ai", "aria-label": "AI personality" }, /* @__PURE__ */ React.createElement("div", { className: "acct-card-head" }, /* @__PURE__ */ React.createElement("label", { className: "acct-label", htmlFor: "acct-persona" }, "AI personality"), /* @__PURE__ */ React.createElement("span", { className: "acct-tag" }, /* @__PURE__ */ React.createElement(AcctIcon, { name: "spark", size: 14 }), "Mark")), /* @__PURE__ */ React.createElement("div", { className: "acct-presets", role: "group", "aria-label": "Personality presets" }, PERSONA_PRESETS.map((preset) => {
        const selected = activePreset?.id === preset.id;
        return /* @__PURE__ */ React.createElement(
          "button",
          {
            key: preset.id,
            type: "button",
            className: classNames("acct-preset", selected && "is-selected"),
            "aria-pressed": selected,
            onClick: () => setPersona(preset.text)
          },
          /* @__PURE__ */ React.createElement("span", { className: "acct-preset-title" }, preset.title),
          /* @__PURE__ */ React.createElement("span", { className: "acct-preset-sub" }, preset.subtitle)
        );
      })), /* @__PURE__ */ React.createElement(
        "textarea",
        {
          id: "acct-persona",
          className: "acct-textarea",
          maxLength: PERSONA_MAX_CHARS,
          value: persona,
          placeholder: `e.g. ${PERSONA_EXAMPLES[personaExampleIndex]}`,
          "aria-describedby": "acct-persona-count",
          onChange: (event) => setPersona(event.target.value)
        }
      ), fieldError("persona"), /* @__PURE__ */ React.createElement("div", { className: "acct-card-foot" }, /* @__PURE__ */ React.createElement("span", { id: "acct-persona-count", className: "acct-counter", "aria-live": "polite" }, persona.length, "/", PERSONA_MAX_CHARS), /* @__PURE__ */ React.createElement("span", { className: "acct-spacer" }), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "acct-btn acct-btn--secondary",
          disabled: busy === "persona" || !persona.trim() && !savedPersona,
          onClick: () => {
            setPersona("");
            if (savedPersona) {
              post(new URLSearchParams({ action: "save_ai", ai_instructions: "" }), "persona");
            }
          }
        },
        "Clear"
      ), /* @__PURE__ */ React.createElement(
        SaveButton,
        {
          state: stateOf("persona"),
          disabled: persona.trim() === savedPersona,
          onClick: () => post(new URLSearchParams({ action: "save_ai", ai_instructions: persona.trim() }), "persona")
        }
      ))), /* @__PURE__ */ React.createElement("section", { className: "acct-card acct-card--connections", "aria-label": "Connections" }, /* @__PURE__ */ React.createElement("p", { className: "acct-label" }, "Connections"), /* @__PURE__ */ React.createElement("div", { className: "acct-conn-row" }, /* @__PURE__ */ React.createElement("span", { className: "acct-iconbox acct-iconbox--steam", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(BrandIcon, { name: "steam", size: 18 })), /* @__PURE__ */ React.createElement("div", { className: "acct-conn-text" }, /* @__PURE__ */ React.createElement("strong", null, "Steam"), /* @__PURE__ */ React.createElement("span", null, "Connect Steam to read your inventory.")), steamId ? /* @__PURE__ */ React.createElement("div", { className: "acct-conn-state" }, /* @__PURE__ */ React.createElement("span", { className: "acct-tag acct-tag--ok", title: steamId }, /* @__PURE__ */ React.createElement(AcctIcon, { name: "check", size: 13 }), profile.steam_persona || "Connected"), profile.email || discordId || profile.google_id ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "acct-textbtn",
          disabled: busy === "steam",
          onClick: () => post(new URLSearchParams({ action: "unlink_steam" }), "steam")
        },
        busy === "steam" ? "Working…" : "Disconnect"
      ) : null) : /* @__PURE__ */ React.createElement("a", { className: "acct-btn acct-btn--steam", href: "steam_link.php" }, /* @__PURE__ */ React.createElement(BrandIcon, { name: "steam" }), "Connect Steam")), /* @__PURE__ */ React.createElement("div", { className: "acct-conn-row" }, /* @__PURE__ */ React.createElement("span", { className: "acct-iconbox acct-iconbox--discord", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(BrandIcon, { name: "discord", size: 18 })), /* @__PURE__ */ React.createElement("div", { className: "acct-conn-text" }, /* @__PURE__ */ React.createElement("strong", null, "Discord"), /* @__PURE__ */ React.createElement("span", null, "Link Discord to this account.")), discordId ? /* @__PURE__ */ React.createElement("div", { className: "acct-conn-state" }, /* @__PURE__ */ React.createElement("span", { className: "acct-tag acct-tag--ok", title: discordId }, /* @__PURE__ */ React.createElement(AcctIcon, { name: "check", size: 13 }), profile.discord_name || "Connected"), profile.email || steamId || profile.google_id ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "acct-textbtn",
          disabled: busy === "discord",
          onClick: () => post(new URLSearchParams({ action: "unlink_discord" }), "discord")
        },
        busy === "discord" ? "Working…" : "Disconnect"
      ) : null) : /* @__PURE__ */ React.createElement("a", { className: "acct-btn acct-btn--discord", href: "discord_link.php" }, /* @__PURE__ */ React.createElement(BrandIcon, { name: "discord" }), "Connect Discord")), fieldError("steam"), fieldError("discord")), /* @__PURE__ */ React.createElement("section", { className: "acct-card acct-card--appearance", "aria-label": "Appearance" }, /* @__PURE__ */ React.createElement("div", { className: "acct-appearance-block" }, /* @__PURE__ */ React.createElement("p", { className: "acct-label", id: "acct-theme-label" }, "Appearance"), /* @__PURE__ */ React.createElement(ThemeRadioGroup, { labelledBy: "acct-theme-label" })), /* @__PURE__ */ React.createElement("div", { className: "acct-appearance-block" }, /* @__PURE__ */ React.createElement("p", { className: "acct-label", id: "acct-lang-label" }, "Language"), /* @__PURE__ */ React.createElement(
        ProfileLanguagePicker,
        {
          value: languageChoice,
          languages,
          onChange: chooseLanguage,
          labelledBy: "acct-lang-label"
        }
      ))), /* @__PURE__ */ React.createElement("section", { className: "acct-card acct-card--security", "aria-label": "Security" }, /* @__PURE__ */ React.createElement("p", { className: "acct-label" }, "Security"), /* @__PURE__ */ React.createElement("div", { className: "acct-sec-row" }, /* @__PURE__ */ React.createElement("span", { className: "acct-iconbox acct-iconbox--tint", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement(AcctIcon, { name: "shield", size: 18 })), /* @__PURE__ */ React.createElement("div", { className: "acct-conn-text" }, /* @__PURE__ */ React.createElement("strong", null, "Password"), /* @__PURE__ */ React.createElement("span", null, profile.has_password ? "We email you a link to set a new password. It works for 2 hours and only once." : profile.email ? "This account signs in without a password. Set one through a link we email you." : "Add an email address to the account first; the link goes there.")), /* @__PURE__ */ React.createElement("div", { className: "acct-security-action" }, inboxSent ? /* @__PURE__ */ React.createElement("span", { className: "acct-inline-ok", role: "status" }, /* @__PURE__ */ React.createElement(AcctIcon, { name: "check", size: 14 }), "Check your inbox") : null, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "acct-btn acct-btn--primary",
          disabled: busy === "password" || !profile.email,
          onClick: () => {
            setInboxSent(false);
            post(new URLSearchParams({ action: "password_reset_request" }), "password").then((ok) => {
              if (ok) setInboxSent(true);
            });
          }
        },
        busy === "password" ? /* @__PURE__ */ React.createElement("span", { className: "acct-spinner", "aria-hidden": "true" }) : null,
        busy === "password" ? "Sending…" : profile.has_password ? "Change password" : "Set password"
      )), fieldError("password")), /* @__PURE__ */ React.createElement("div", { className: "acct-sec-row" }, /* @__PURE__ */ React.createElement("span", { className: "acct-iconbox acct-iconbox--tint", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-envelope" })), /* @__PURE__ */ React.createElement("div", { className: "acct-conn-text" }, /* @__PURE__ */ React.createElement("strong", null, "Email"), /* @__PURE__ */ React.createElement("span", null, profile.pending_email ? `Confirmation sent to ${profile.pending_email}. Open the link there to switch; it works for 24 hours.` : profile.email ? "Change the address you sign in with. We send a confirmation link to the new one; nothing changes until you open it." : "Add an email address to sign in with and to receive the links above.")), profile.pending_email ? /* @__PURE__ */ React.createElement("div", { className: "acct-security-action" }, /* @__PURE__ */ React.createElement(
        SaveButton,
        {
          label: "Resend",
          state: stateOf("email"),
          onClick: () => post(new URLSearchParams({ action: "change_email_resend" }), "email")
        }
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "acct-btn acct-btn--secondary",
          disabled: busy === "email",
          onClick: () => post(new URLSearchParams({ action: "change_email_cancel" }), "email")
        },
        "Cancel change"
      )) : /* @__PURE__ */ React.createElement("div", { className: "acct-security-action" }, emailSent && !emailEditing ? /* @__PURE__ */ React.createElement("span", { className: "acct-inline-ok", role: "status" }, /* @__PURE__ */ React.createElement(AcctIcon, { name: "check", size: 14 }), "Check ", emailSent) : null, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: classNames("acct-btn", emailEditing ? "acct-btn--secondary" : "acct-btn--primary"),
          "aria-expanded": emailEditing,
          "aria-controls": "acct-email-form",
          disabled: busy === "email",
          onClick: () => {
            setEmailSent("");
            setNewEmail("");
            setEmailPassword("");
            setEmailEditing((value) => !value);
          }
        },
        emailEditing ? "Cancel" : profile.email ? "Change email" : "Add email"
      )), emailEditing && !profile.pending_email ? /* @__PURE__ */ React.createElement(
        "form",
        {
          id: "acct-email-form",
          className: "acct-email-form",
          onSubmit: async (event) => {
            event.preventDefault();
            const address = newEmail.trim();
            if (!address) return;
            const ok = await post(new URLSearchParams({
              action: "change_email",
              new_email: address,
              password: emailPassword
            }), "email");
            if (ok) {
              setEmailEditing(false);
              setEmailPassword("");
              setEmailSent(address);
            }
          }
        },
        /* @__PURE__ */ React.createElement("label", { className: "acct-sr-only", htmlFor: "acct-new-email" }, "New email address"),
        /* @__PURE__ */ React.createElement(
          "input",
          {
            id: "acct-new-email",
            type: "email",
            className: "acct-input",
            value: newEmail,
            autoComplete: "email",
            placeholder: "New email address",
            required: true,
            onChange: (event) => setNewEmail(event.target.value)
          }
        ),
        profile.has_password ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("label", { className: "acct-sr-only", htmlFor: "acct-email-password" }, "Current password"), /* @__PURE__ */ React.createElement(
          "input",
          {
            id: "acct-email-password",
            type: "password",
            className: "acct-input",
            value: emailPassword,
            autoComplete: "current-password",
            placeholder: "Current password",
            required: true,
            onChange: (event) => setEmailPassword(event.target.value)
          }
        )) : null,
        /* @__PURE__ */ React.createElement(
          SaveButton,
          {
            type: "submit",
            label: "Send confirmation",
            state: stateOf("email"),
            disabled: !newEmail.trim() || profile.has_password && !emailPassword
          }
        ),
        /* @__PURE__ */ React.createElement("p", { className: "acct-hint" }, "A confirmation link goes to the new address. Your current address stays until you open it.")
      ) : null, fieldError("email"))), /* @__PURE__ */ React.createElement(ProfileInventorySection, { steamId, tf2: PAGE_TF2 })));
    }
    function ProfileLangFlag({ entry }) {
      if (!entry) return null;
      if (entry.auto) {
        return /* @__PURE__ */ React.createElement("span", { className: "home-ai-lang-flag is-auto", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-globe" }));
      }
      if (entry.flagCode) {
        return /* @__PURE__ */ React.createElement("span", { className: "home-ai-lang-flag fi fi-" + entry.flagCode, "aria-hidden": "true" });
      }
      return /* @__PURE__ */ React.createElement("span", { className: "home-ai-lang-flag", "aria-hidden": "true" }, entry.flag || "🌐");
    }
    function ProfileLanguagePicker({ value, languages, onChange, labelledBy }) {
      const [open, setOpen] = useState(false);
      const rootRef = useRef(null);
      useEffect(() => {
        if (!open) return void 0;
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
      return /* @__PURE__ */ React.createElement("div", { className: classNames("home-ai-lang-picker", open && "is-open"), ref: rootRef }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "home-ai-lang-trigger",
          onClick: () => setOpen((v) => !v),
          "aria-haspopup": "listbox",
          "aria-expanded": open,
          "aria-labelledby": labelledBy
        },
        /* @__PURE__ */ React.createElement("span", { className: "home-ai-lang-trigger-left" }, /* @__PURE__ */ React.createElement(ProfileLangFlag, { entry: current }), /* @__PURE__ */ React.createElement("span", { className: "home-ai-lang-name" }, current.name)),
        /* @__PURE__ */ React.createElement(AcctIcon, { name: "chevron", size: 16, className: "home-ai-lang-caret" })
      ), open ? /* @__PURE__ */ React.createElement("ul", { className: "home-ai-lang-menu", role: "listbox", "aria-labelledby": labelledBy }, options.map((entry) => /* @__PURE__ */ React.createElement("li", { key: entry.code, role: "presentation" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          role: "option",
          "aria-selected": entry.code === value,
          className: classNames("home-ai-lang-option", entry.code === value && "is-active"),
          onClick: () => {
            onChange(entry.code);
            setOpen(false);
          }
        },
        /* @__PURE__ */ React.createElement(ProfileLangFlag, { entry }),
        /* @__PURE__ */ React.createElement("span", { className: "home-ai-lang-name" }, entry.name),
        entry.code === value ? /* @__PURE__ */ React.createElement(AcctIcon, { name: "check", size: 13, className: "home-ai-lang-check" }) : null
      )))) : null);
    }
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
        return shortOnly ? ["Ask Dell about TF2…", "Build a TF2 portfolio…", "Key price today?", "Best TF2 flips?"] : [
          "Ask about TF2 prices, trades or unusuals…",
          "Build me a €50 TF2 portfolio…",
          "How many ref is a key right now?",
          "Which TF2 items flip from Mannco to Steam?",
          "What is a Burning Flames Team Captain worth?"
        ];
      }
      if (shortOnly) {
        return [
          t("mhome_ex1"),
          t("mhome_ex2"),
          t("mhome_ex3"),
          t("mhome_ex4", { amount: mhomeAmount(20) }),
          t("mhome_ex5"),
          t("mhome_ex6")
        ];
      }
      return [
        t("home_composerPlaceholder1"),
        t("home_composerPlaceholder2"),
        t("home_composerPlaceholder3"),
        t("home_composerPlaceholder4"),
        t("home_composerPlaceholder5")
      ];
    }
    function searchItemHref(item) {
      const marketHashName = String(item?.market_hash_name || "").trim();
      if (!marketHashName) return "#";
      const pretty = typeof window.CS2ReactData?.itemPrettyHref === "function" ? window.CS2ReactData.itemPrettyHref(item) : "";
      if (pretty) return pretty;
      return "item_page.php?" + new URLSearchParams({
        lookup_name: marketHashName,
        display_name: String(item.display_name || marketHashName),
        market_hash_name: marketHashName,
        image: item.image || "",
        market_url: "https://steamcommunity.com/market/listings/730/" + encodeURIComponent(marketHashName),
        type: item.type_note || "",
        category: item.category || "",
        color: item.name_color || "B0C3D9"
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
    const FOLLOW_UP_BUDGET_TIERS = [20, 50, 100, 250, 500, 1e3, 2e3, 5e3];
    function parseChatBudget(text) {
      const raw = String(text || "").replace(/,(?=\d{3}\b)/g, "");
      if (!raw) return null;
      const patterns = [
        /(?:budget|spend|portfolio|total)\s[^€$\d]{0,28}(€|\$|eur(?:os?)?)?\s*(\d{1,5}(?:\.\d+)?)/i,
        /(€|\$|eur(?:os?)?)\s*(\d{1,5}(?:\.\d+)?)/i,
        /(\d{1,5}(?:\.\d+)?)\s*(€|eur(?:os?)?|usd|dollars?)/i,
        /\b(?:with|around|about|under|over)\s+(€|\$)\s*(\d{1,5}(?:\.\d+)?)/i
      ];
      for (const re of patterns) {
        const match = raw.match(re);
        if (!match) continue;
        const groups = match.slice(1).filter(Boolean);
        const numTok = groups.find((group) => /^\d/.test(group));
        const amount = Number(numTok);
        if (!Number.isFinite(amount) || amount < 8 || amount > 2e4) continue;
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
      return [...FOLLOW_UP_BUDGET_TIERS].reverse().find((tier) => tier < n - 1) || Math.max(10, Math.round(n / 2));
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
      const seen = /* @__PURE__ */ new Set();
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
      const budget = parseChatBudget(user) || (/\bbudget\b|total spend|portfolio (?:with|of)/i.test(assistant) ? parseChatBudget(assistant) : null);
      const kind = pickFollowUpKind(user, assistant, items, assistantMessage);
      const raise = budget ? ti("chip_tryInstead", { amount: formatChipMoney(budgetStep(budget.amount, 1), budget.symbol) }) : ti("chip_raiseBudget");
      const cut = budget ? ti("chip_cutTo", { amount: formatChipMoney(budgetStep(budget.amount, -1), budget.symbol) }) : ti("chip_lowerBudget");
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
            ti("chip_outlook30d")
          ],
          [raise, ti("chip_cheaperAlternative"), ti("chip_smallPortfolio")]
        );
      }
      if (kind === "premium") {
        const noun = /\bgloves?\b/i.test(`${user}
${assistant}`) && !/\b(knives|knife|bayonet|karambit)\b/i.test(user) ? "gloves" : "knives";
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
    function ti(key, vars) {
      try {
        return window.I18N ? window.I18N.t(key, vars) : key;
      } catch (_error) {
        return key;
      }
    }
    const HOME_AI_ACTIVITY_PHASES = {
      souvenir: [
        "aiph_souvenirLookups",
        "aiph_matchingCatalog",
        "aiph_searchingDb",
        "aiph_comparingMarkets",
        "aiph_rankingPicks",
        "aiph_writingReply"
      ],
      charms: [
        "aiph_searchingCharms",
        "aiph_matchingCatalog",
        "aiph_searchingDb",
        "aiph_comparingMarkets",
        "aiph_rankingPicks",
        "aiph_writingReply"
      ],
      chart: [
        "aiph_scanningHistory",
        "aiph_checkingSteam",
        "aiph_buildingForecast",
        "aiph_comparingMarkets",
        "aiph_writingReply"
      ],
      deals: [
        "aiph_comparingMarkets",
        "aiph_checkingSteam",
        "aiph_searchingDb",
        "aiph_rankingPicks",
        "aiph_writingReply"
      ],
      stickers: [
        "aiph_searchingStickers",
        "aiph_matchingCatalog",
        "aiph_searchingDb",
        "aiph_comparingMarkets",
        "aiph_rankingPicks",
        "aiph_writingReply"
      ],
      cases: [
        "aiph_searchingCases",
        "aiph_matchingCatalog",
        "aiph_searchingDb",
        "aiph_scanningHistory",
        "aiph_rankingPicks",
        "aiph_writingReply"
      ],
      search: [
        "aiph_searchingSkins",
        "aiph_matchingCatalog",
        "aiph_searchingDb",
        "aiph_comparingMarkets",
        "aiph_checkingSteam",
        "aiph_rankingPicks",
        "aiph_writingReply"
      ],
      steam: [
        "aiph_checkingSteam",
        "aiph_searchingDb",
        "aiph_comparingMarkets",
        "aiph_scanningHistory",
        "aiph_writingReply"
      ],
      image: [
        "aiph_inspectingImage",
        "aiph_matchingCatalog",
        "aiph_searchingDb",
        "aiph_comparingMarkets",
        "aiph_writingReply"
      ],
      generic: [
        "aiph_searchingDb",
        "aiph_matchingCatalog",
        "aiph_scanningHistory",
        "aiph_comparingMarkets",
        "aiph_writingReply"
      ]
    };
    function homeAiActivityKind(prompt, media) {
      const text = String(prompt || "");
      const hasImage = Array.isArray(media) && media.some((item) => String(item?.kind || "") === "image");
      if (!text.trim() && hasImage) return "image";
      if (/\bsouvenir/i.test(text) && !/\b(charms?|keychains?)\b/i.test(text)) return "souvenir";
      if (/\b(charms?|keychains?)\b/i.test(text)) return "charms";
      if (/\b(chart|graph|forecast|predict(?:ion)?s?|arima|price history|over \d+\s*days)\b/i.test(text)) return "chart";
      if (/\b(deals?|arbitrage|flip(?:s|ping)?|spreads?|steam vs|third[- ]party)\b/i.test(text)) return "deals";
      if (/\bstickers?\b/i.test(text) || /\bcapsules?\b/i.test(text) && !/\bcases?\b/i.test(text)) return "stickers";
      if (/\bcases?\b/i.test(text)) return "cases";
      if (looksLikeItemSearchPrompt(text) || /\b(skins?|items?|knives|knife|gloves?)\b/i.test(text)) return "search";
      if (/\b(steam|listings?|buy orders?)\b/i.test(text)) return "steam";
      if (hasImage) return "image";
      return "generic";
    }
    function homeAiActivityPhasesForPrompt(prompt, media) {
      if (PAGE_TF2) {
        return /\bportfolio\b/i.test(String(prompt || "")) ? ["Reading TF2 prices…", "Picking keys, stranges and cosmetics…", "Balancing the budget…", "Writing it up…"] : ["Reading TF2 prices…", "Checking Mannco and Steam…", "Working out the trade…", "Writing it up…"];
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
        { lead: g("home_headline11_lead"), accent: g("home_headline11_accent") }
      ];
    }
    function formatTickerPct(n) {
      const value = Number(n);
      if (!Number.isFinite(value)) return "—";
      const sign = value > 0 ? "+" : "";
      return `${sign}${value.toFixed(2)}%`;
    }
    const TICKER_POOL_URL = PAGE_TF2 ? "assets/data/tf2/ticker-pool.json" : "assets/data/ticker-pool.json";
    const TICKER_VISIBLE_COUNT = 10;
    const WAVE_BAR_COUNT = 120;
    function pickRandomTickerItems(items, count) {
      const pool = items.slice();
      for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      return pool.slice(0, count);
    }
    const MHOME_HEADLINES = {
      a: { line1: "mhome_headlineA1", line2: "mhome_headlineA2", sub: "mhome_headlineASub" },
      b: { line1: "mhome_headlineB1", line2: "mhome_headlineB2", sub: "mhome_headlineBSub" },
      c: { line1: "mhome_headlineC1", line2: "mhome_headlineC2", sub: "mhome_headlineCSub" }
    };
    const MHOME_HEADLINE_VARIANT = "a";
    const MHOME_CURRENCY = "€";
    const mhomeAmount = (value) => `${MHOME_CURRENCY}${value}`;
    const MHOME_CARDS = [
      { icon: "trend", title: "mhome_cardGrowShort", prompt: "mhome_cardGrowTitle", sub: "mhome_cardGrowSub" },
      { icon: "layers", title: "mhome_cardPortfolioShort", prompt: "mhome_cardPortfolioTitle", sub: "mhome_cardPortfolioSub", amount: 500 },
      { icon: "wallet", title: "mhome_cardInventoryShort", prompt: "mhome_cardInventoryTitle", sub: "mhome_cardInventorySub" },
      { icon: "activity", title: "mhome_cardMovingShort", prompt: "mhome_cardMovingTitle", sub: "mhome_cardMovingSub" },
      { icon: "tag", title: "mhome_cardBudgetShort", prompt: "mhome_cardBudgetTitle", sub: "mhome_cardBudgetSub", amount: 20 },
      { icon: "package", title: "mhome_cardCasesShort", prompt: "mhome_cardCasesTitle", sub: "mhome_cardCasesSub" }
    ];
    function mobileSuggestions(t) {
      if (PAGE_TF2) return MOBILE_SUGGESTIONS;
      return MHOME_CARDS.map((card) => {
        const vars = card.amount == null ? void 0 : { amount: mhomeAmount(card.amount) };
        return {
          icon: card.icon,
          title: t(card.title, vars),
          sub: t(card.sub),
          prompt: t(card.prompt, vars)
        };
      });
    }
    const MOBILE_SUGGESTIONS = PAGE_TF2 ? [
      { icon: "briefcase", title: "€50 TF2 portfolio", sub: "Keys, stranges, cosmetics", prompt: "Build me a €50 TF2 portfolio and explain each pick." },
      { icon: "tag", title: "Best TF2 flips", sub: "Mannco to Steam after fees", prompt: "What are the best TF2 flips right now from Mannco to Steam after fees?" },
      { icon: "star", title: "Cheap unusual hats", sub: "Particles on a budget", prompt: "What are the best cheap unusual hats to buy in TF2 right now?" },
      { icon: "trend", title: "TF2 trading tips", sub: "Keys, ref and staying safe", prompt: "Give me TF2 trading advice for a beginner: keys, ref, where to buy and sell, and how to avoid scams." }
    ] : [
      {
        icon: "trend",
        title: "Items that will grow",
        sub: "Skins and cases with room to appreciate",
        prompt: "Items that will grow"
      },
      {
        icon: "layers",
        title: "$500 invest portfolio",
        sub: "Serious stack with conviction",
        prompt: "$500 invest portfolio"
      },
      {
        icon: "folder",
        title: "Collections to invest in",
        sub: "Collections that look underpriced",
        prompt: "Collections to invest in"
      },
      {
        icon: "search",
        title: "Item analysis",
        sub: "Break down a random item",
        prompt: "Item analysis"
      }
    ];
    const MHOME_ICON_PATHS = {
      trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
      layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
      folder: "M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
      search: { d: "M20 20l-3.5-3.5", circles: [{ cx: 11, cy: 11, r: 7 }] },
      wallet: "M3 7h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 7l2.5-3h13L21 7M15.5 13.5h3",
      activity: "M3 12h4l3 8 4-16 3 8h4",
      tag: { d: "M3 12V4h8l10 10-8 8z", circles: [{ cx: 7.5, cy: 7.5, r: 1.3 }] },
      package: "M21 8l-9-5-9 5 9 5 9-5M3 8v8l9 5 9-5V8M12 13v8"
    };
    function MHomeIcon({ name }) {
      const entry = MHOME_ICON_PATHS[name];
      if (!entry) return null;
      const path = typeof entry === "string" ? entry : entry.d;
      const circles = (typeof entry === "string" ? null : entry.circles) || [];
      return /* @__PURE__ */ React.createElement(
        "svg",
        {
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "1.8",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true"
        },
        circles.map((c, i) => /* @__PURE__ */ React.createElement("circle", { key: i, cx: c.cx, cy: c.cy, r: c.r })),
        /* @__PURE__ */ React.createElement("path", { d: path })
      );
    }
    function formatChatAge(updatedAt) {
      const then = Number(updatedAt);
      if (!Number.isFinite(then) || then <= 0) return "";
      const minutes = Math.max(0, Math.round((Date.now() - then) / 6e4));
      if (minutes < 60) return `${Math.max(1, minutes)}m`;
      const hours = Math.round(minutes / 60);
      if (hours < 24) return `${hours}h`;
      const days = Math.round(hours / 24);
      if (days === 1) return "Yesterday";
      return `${days}d`;
    }
    function greetingForHour(name) {
      const hour = (/* @__PURE__ */ new Date()).getHours();
      const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
      const who = String(name || "").trim();
      return who ? `${part}, ${who}` : part;
    }
    function mhomeMoney(value) {
      const number = Number(value);
      return Number.isFinite(number) ? `€${number.toFixed(2)}` : "-";
    }
    function MobileMovers() {
      const [items, setItems] = useState([]);
      useEffect(() => {
        let cancelled = false;
        fetch(TICKER_POOL_URL, { headers: { Accept: "application/json" } }).then((response) => response.ok ? response.json() : null).then((payload) => {
          if (cancelled) return;
          const pool = Array.isArray(payload?.items) ? payload.items : [];
          const usable = pool.filter((entry) => entry && entry.name && entry.url && Number.isFinite(Number(entry.pct)) && Number.isFinite(Number(entry.price)));
          usable.sort((a, b) => Math.abs(Number(b.pct)) - Math.abs(Number(a.pct)));
          setItems(usable.slice(0, 3));
        }).catch(() => {
        });
        return () => {
          cancelled = true;
        };
      }, []);
      if (!items.length) return null;
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("p", { className: "mhome-label" }, "Moving now"), /* @__PURE__ */ React.createElement("div", { className: "mhome-movers" }, items.map((item) => {
        const change = Number(item.pct);
        return /* @__PURE__ */ React.createElement("a", { className: "mhome-mover", href: item.url, key: item.url }, /* @__PURE__ */ React.createElement("span", { className: "mhome-mover-name" }, item.name), /* @__PURE__ */ React.createElement("span", { className: "mhome-mover-price" }, mhomeMoney(item.price)), /* @__PURE__ */ React.createElement("span", { className: classNames("mhome-mover-change", change >= 0 ? "is-up" : "is-down") }, formatTickerPct(change)));
      })));
    }
    function MobileStartScreen({ onPrompt, userName }) {
      const { t } = useI18n();
      const variant = MHOME_HEADLINES[MHOME_HEADLINE_VARIANT] || MHOME_HEADLINES.a;
      const cards = mobileSuggestions(t);
      return /* @__PURE__ */ React.createElement("div", { className: "mhome" }, /* @__PURE__ */ React.createElement("p", { className: "mhome-greeting" }, greetingForHour(userName)), /* @__PURE__ */ React.createElement("h1", { className: "mhome-title" }, t(variant.line1), /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { className: "u-gradient-text" }, t(variant.line2))), /* @__PURE__ */ React.createElement("p", { className: "mhome-subtitle" }, t(variant.sub)), /* @__PURE__ */ React.createElement("ul", { className: "mhome-cards" }, cards.map((entry) => /* @__PURE__ */ React.createElement("li", { key: entry.title }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "mhome-card",
          "aria-label": entry.title,
          onClick: () => onPrompt(entry.prompt)
        },
        /* @__PURE__ */ React.createElement("span", { className: "mhome-card-icon" }, /* @__PURE__ */ React.createElement(MHomeIcon, { name: entry.icon })),
        /* @__PURE__ */ React.createElement("span", { className: "mhome-card-title" }, entry.title),
        /* @__PURE__ */ React.createElement("span", { className: "mhome-card-sub" }, entry.sub)
      )))), /* @__PURE__ */ React.createElement(MobileMovers, null));
    }
    function MarketTicker() {
      const [items, setItems] = useState([]);
      useEffect(() => {
        let cancelled = false;
        fetch(TICKER_POOL_URL, { headers: { Accept: "application/json" } }).then((response) => response.ok ? response.json() : null).then((payload) => {
          if (cancelled) return;
          const pool = Array.isArray(payload?.items) ? payload.items : [];
          const usable = pool.filter((entry) => entry && entry.name && entry.url && Number.isFinite(Number(entry.pct)));
          setItems(pickRandomTickerItems(usable, TICKER_VISIBLE_COUNT));
        }).catch(() => {
        });
        return () => {
          cancelled = true;
        };
      }, []);
      if (!items.length) return null;
      return /* @__PURE__ */ React.createElement("div", { className: "home-ai-ticker", "aria-label": PAGE_TF2 ? "TF2 market moves" : "Market moves, past 30 days" }, /* @__PURE__ */ React.createElement("div", { className: "home-ai-ticker-track" }, [...items, ...items].map((item, index) => {
        const isClone = index >= items.length;
        const change = Number(item.pct);
        return /* @__PURE__ */ React.createElement(
          "a",
          {
            key: `${item.url}-${index}`,
            href: item.url,
            className: classNames("home-ai-ticker-item", change >= 0 ? "is-up" : "is-down"),
            "aria-hidden": isClone ? "true" : void 0,
            tabIndex: isClone ? -1 : void 0
          },
          /* @__PURE__ */ React.createElement("strong", null, item.name),
          /* @__PURE__ */ React.createElement("em", null, formatTickerPct(change))
        );
      })));
    }
    const NAV_CATEGORY_LABEL_KEYS = {
      pistols: "nav_pistols",
      smgs: "nav_smgs",
      heavy: "nav_heavy",
      rifles: "nav_rifles",
      rare: "nav_rare"
    };
    const HUB_LINKS = PAGE_TF2 ? [
      { href: "tf2/deals/", label: "Deals", icon: "fa-solid fa-tags" },
      { href: "tf2/market/", label: "Market Explorer", icon: "fa-solid fa-chart-line" },
      { href: "tf2/mann-up/", label: "Mann Up calculator", icon: "fa-solid fa-gift" }
    ] : [
      { href: "tools.html", labelKey: "nav_tools", icon: "fa-solid fa-screwdriver-wrench" },
      { href: "skins.html", labelKey: "nav_skins", icon: "fa-solid fa-gun" },
      { href: "other.html", labelKey: "nav_other", icon: "fa-solid fa-shapes" }
    ];
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
      ["supply_crate", "Supply Crate", "fa-solid fa-boxes-stacked"]
    ].map(([id, label, icon]) => ({ href: `tf2/${String(id).replace(/_/g, "-")}/`, label, icon }));
    const BROWSE_GROUPS = PAGE_TF2 ? [
      { label: "Tools", links: HUB_LINKS },
      { label: "TF2 items", links: TF2_CATEGORY_LINKS }
    ] : [
      {
        labelKey: "nav_tools",
        links: [
          { href: "deals.html", labelKey: "nav_deals", icon: "fa-solid fa-tags" },
          { href: "roi.html", labelKey: "nav_market", icon: "fa-solid fa-chart-line" },
          { href: "skin-crafter.html", labelKey: "nav_skinCrafter", icon: "fa-solid fa-cube" },
          { href: "carepackage.html", labelKey: "nav_carePackage", icon: "fa-solid fa-gift" }
        ]
      },
      {
        labelKey: "nav_skins",
        links: (window.CS2ReactData && window.CS2ReactData.weaponCategories || []).map((category) => ({
          href: `${category.key}.html`,
          labelKey: NAV_CATEGORY_LABEL_KEYS[category.key],
          label: category.label,
          category
        }))
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
          { href: "music.html", labelKey: "icat_musicKits", drawnIcon: "music-kit.png" }
        ]
      }
    ];
    function uid() {
      return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }
    function titleFromMessages(messages) {
      const firstUser = (messages || []).find((entry) => entry.role === "user");
      const text = String(firstUser?.display || firstUser?.content || "").trim();
      if (!text) return "New chat";
      return text.length > 42 ? `${text.slice(0, 42)}…` : text;
    }
    function readSessions() {
      try {
        const raw = JSON.parse(window.localStorage.getItem(SESSIONS_KEY) || "[]");
        if (!Array.isArray(raw)) return [];
        return raw.filter((entry) => entry && typeof entry === "object" && Array.isArray(entry.messages)).map((entry) => ({
          id: String(entry.id || uid()),
          title: String(entry.title || "New chat"),
          updatedAt: Number(entry.updatedAt) || Date.now(),
          messages: entry.messages.slice(-40).map((msg) => msg?.role === "assistant" ? { ...msg, content: stripMarkMarkdown(msg.content) } : msg)
        })).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40);
      } catch (_error) {
        return [];
      }
    }
    function sanitizeMessageForStorage(msg) {
      if (!msg || typeof msg !== "object") return msg;
      const media = Array.isArray(msg.media) ? msg.media.slice(0, 2).map((item) => {
        const kind = item?.kind === "video" ? "video" : "image";
        const name = String(item?.name || kind).slice(0, 160);
        if (kind === "image" && String(item?.url || item?.data_url || "").startsWith("data:image/")) {
          const dataUrl = String(item.url || item.data_url);
          if (dataUrl.length <= 12e5) {
            return { kind, name, url: dataUrl, data_url: dataUrl };
          }
          return { kind, name };
        }
        return { kind, name };
      }) : void 0;
      const next = { ...msg };
      if (media && media.length) next.media = media;
      else delete next.media;
      return next;
    }
    function writeSessions(sessions) {
      try {
        const payload = sessions.slice(0, 40).map((session) => ({
          ...session,
          messages: (session.messages || []).slice(-40).map(sanitizeMessageForStorage)
        }));
        window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(payload));
      } catch (_error) {
        try {
          const slim = sessions.slice(0, 40).map((session) => ({
            ...session,
            messages: (session.messages || []).slice(-40).map((msg) => {
              const copy = { ...msg };
              delete copy.media;
              return copy;
            })
          }));
          window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(slim));
        } catch (__error) {
        }
      }
    }
    function readProjects() {
      try {
        const raw = JSON.parse(window.localStorage.getItem(PROJECTS_KEY) || "[]");
        if (!Array.isArray(raw)) return [];
        return raw.filter((entry) => entry && typeof entry === "object" && entry.name).map((entry) => ({
          id: String(entry.id || `project_${Date.now().toString(36)}`),
          name: String(entry.name || "Untitled").slice(0, 48),
          createdAt: Number(entry.createdAt) || Date.now(),
          sessionIds: Array.isArray(entry.sessionIds) ? entry.sessionIds.map(String) : []
        })).sort((a, b) => b.createdAt - a.createdAt).slice(0, 24);
      } catch (_error) {
        return [];
      }
    }
    function writeProjects(projects) {
      try {
        window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects.slice(0, 24)));
      } catch (_error) {
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
      return /* @__PURE__ */ React.createElement("div", { className: classNames("home-ai-attach-chip", item.kind === "video" && "is-video") }, item.kind === "video" ? item.url ? /* @__PURE__ */ React.createElement("video", { src: item.url, muted: true, playsInline: true, preload: "metadata" }) : /* @__PURE__ */ React.createElement("div", { className: "home-ai-attach-fallback" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-film", "aria-hidden": "true" })) : item.url ? /* @__PURE__ */ React.createElement("img", { src: item.url, alt: item.name || "Attachment" }) : /* @__PURE__ */ React.createElement("div", { className: "home-ai-attach-fallback" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-image", "aria-hidden": "true" })), /* @__PURE__ */ React.createElement("span", null, item.name || item.kind), onRemove ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "home-ai-attach-remove", onClick: onRemove, "aria-label": t("home_removeAttachment") }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark", "aria-hidden": "true" })) : null);
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
        }
      }, [plain]);
      if (!plain) return null;
      return /* @__PURE__ */ React.createElement("div", { className: "home-ai-actions", role: "group", "aria-label": "Answer actions" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: classNames("home-ai-action-btn", copied && "is-done"),
          onClick: copyAnswer,
          title: copied ? "Copied" : "Copy",
          "aria-label": copied ? "Copied" : "Copy answer"
        },
        /* @__PURE__ */ React.createElement("i", { className: copied ? "fa-solid fa-check" : "fa-regular fa-copy", "aria-hidden": "true" })
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: classNames("home-ai-action-btn", shared && "is-done"),
          onClick: shareAnswer,
          title: shared ? "Shared" : "Share",
          "aria-label": shared ? "Shared" : "Share answer"
        },
        /* @__PURE__ */ React.createElement("i", { className: shared ? "fa-solid fa-check" : "fa-solid fa-arrow-up-from-bracket", "aria-hidden": "true" })
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: classNames("home-ai-action-btn", rating === "up" && "is-active is-up"),
          onClick: () => onRate?.(ratingKey, rating === "up" ? "" : "up"),
          title: t("home_goodAnswer"),
          "aria-label": t("home_goodAnswer"),
          "aria-pressed": rating === "up"
        },
        /* @__PURE__ */ React.createElement("i", { className: rating === "up" ? "fa-solid fa-thumbs-up" : "fa-regular fa-thumbs-up", "aria-hidden": "true" })
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: classNames("home-ai-action-btn", rating === "down" && "is-active is-down"),
          onClick: () => onRate?.(ratingKey, rating === "down" ? "" : "down"),
          title: t("home_badAnswer"),
          "aria-label": t("home_badAnswer"),
          "aria-pressed": rating === "down"
        },
        /* @__PURE__ */ React.createElement("i", { className: rating === "down" ? "fa-solid fa-thumbs-down" : "fa-regular fa-thumbs-down", "aria-hidden": "true" })
      ));
    }
    function readActiveId(sessions) {
      try {
        const wanted = String(new URLSearchParams(window.location.search).get("chat") || "");
        if (wanted && sessions.some((entry) => entry.id === wanted)) return wanted;
      } catch (_error) {
      }
      try {
        const id = String(window.localStorage.getItem(ACTIVE_KEY) || "");
        if (id && sessions.some((entry) => entry.id === id)) return id;
      } catch (_error) {
      }
      return sessions[0]?.id || "";
    }
    function formatPlainMarkdownHtml(text) {
      const esc = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const inline = (value) => esc(value).replace(/\*\*(.+?)\*\*/gs, "<strong>$1</strong>").replace(/__(.+?)__/gs, "<strong>$1</strong>");
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
      let html = "";
      let prevType = "";
      chunks.forEach((chunk) => {
        if (chunk.type === "text" && prevType === "text") html += "\n\n";
        html += chunk.html;
        prevType = chunk.type;
      });
      return html;
    }
    function TypedRichHtml({ html, active, onComplete, onProgress }) {
      const hostRef = useRef(null);
      const onCompleteRef = useRef(onComplete);
      const onProgressRef = useRef(onProgress);
      onCompleteRef.current = onComplete;
      onProgressRef.current = onProgress;
      useEffect(() => {
        const host = hostRef.current;
        if (!host) return void 0;
        host.innerHTML = html || "";
        if (!active || !html) return void 0;
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
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          finishInstantly();
          return void 0;
        }
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
          return void 0;
        }
        nodes.forEach((entry) => {
          entry.node.nodeValue = "";
        });
        elements.forEach((entry) => {
          if (entry.start > 0) {
            entry.el.dataset.twHidden = "1";
            entry.el.style.display = "none";
          }
        });
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
      return /* @__PURE__ */ React.createElement("div", { className: "home-ai-text is-typing", ref: hostRef });
    }
    function focusIfPageVisible(element) {
      if (!element || typeof document === "undefined") return;
      if (document.visibilityState === "hidden") return;
      try {
        element.focus({ preventScroll: true });
      } catch (_error) {
        try {
          element.focus();
        } catch (_inner) {
        }
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
            updatedAt: Date.now()
          };
        });
        writeSessions(next);
      } catch (_error) {
      }
    }
    function HomeAiPage() {
      const { t, language } = useI18n();
      const { authenticated, user: steamUser, loading: sessionLoading } = useSteamSession();
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
      const [assistantName, setAssistantNameState] = useState(PAGE_TF2 ? "Dell" : "Mark");
      const setAssistantName = (value) => {
        if (!PAGE_TF2) setAssistantNameState(value);
      };
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
      const [placeholderIndex, setPlaceholderIndex] = useState(() => Math.floor(Math.random() * 6));
      const [placeholderFading, setPlaceholderFading] = useState(false);
      const [composerFocused, setComposerFocused] = useState(false);
      const [welcomeHeadlineIndex, setWelcomeHeadlineIndex] = useState(() => Math.floor(Math.random() * getWelcomeHeadlines().length));
      const [sidebarOpen, setSidebarOpen] = useState(false);
      const [openBrowseGroups, setOpenBrowseGroups] = useState({});
      useEffect(() => {
        const toggle = () => setSidebarOpen((open) => !open);
        window.addEventListener("cs2:toggle-ai-sidebar", toggle);
        return () => window.removeEventListener("cs2:toggle-ai-sidebar", toggle);
      }, []);
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
      const isPhoneLayoutRef = useRef(isPhoneLayout);
      isPhoneLayoutRef.current = isPhoneLayout;
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
      useEffect(() => {
        document.body.classList.toggle("is-ai-drawer-open", sidebarOpen && isPhoneLayout);
        return () => document.body.classList.remove("is-ai-drawer-open");
      }, [sidebarOpen, isPhoneLayout]);
      const [panelMode, setPanelMode] = useState(() => {
        try {
          const panel = new URLSearchParams(window.location.search).get("panel");
          if (panel === "watchlist" || panel === "charts" || panel === "profile") return panel;
        } catch (_error) {
        }
        return "chat";
      });
      const [watchlistItems, setWatchlistItems] = useState(() => readWatchlistItems());
      const [projects, setProjects] = useState(() => isCachedSteamAuthenticated() ? readProjects() : []);
      const [activeProjectId, setActiveProjectId] = useState(null);
      const [popupMode, setPopupMode] = useState("");
      const [chatSearchQuery, setChatSearchQuery] = useState("");
      const [dictationSupported] = useState(() => typeof window !== "undefined" && Boolean(window.MediaRecorder) && Boolean(navigator.mediaDevices?.getUserMedia));
      const listRef = useRef(null);
      const stickToBottomRef = useRef(true);
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
      useEffect(() => {
        const PANELS = ["chat", "charts", "watchlist", "profile"];
        const onClick = (event) => {
          if (event.defaultPrevented || event.button !== 0) return;
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          const anchor = event.target?.closest?.("a[href]");
          if (!anchor || anchor.target && anchor.target !== "_self") return;
          let url;
          try {
            url = new URL(anchor.href, window.location.href);
          } catch (_error) {
            return;
          }
          if (url.origin !== window.location.origin) return;
          if (PAGE_TF2 && (anchor.classList.contains("logo") || anchor.classList.contains("nav-drawer-brand"))) {
            event.preventDefault();
            const next = startNewChatRef.current?.();
            try {
              const blank = Array.isArray(next) ? next[0] : null;
              if (blank?.id) window.localStorage.setItem(ACTIVE_KEY, blank.id);
            } catch (_error) {
            }
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
          } catch (_error) {
          }
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
      const showRecommendFollowUps = Boolean(
        panelMode === "chat" && !loading && !streamingReply && lastAssistantEntry && (dynamicFollowUps.length > 0 || isRecommendationReply(lastAssistantEntry.message))
      );
      const showSuggestChips = showRecommendFollowUps;
      const hasFinishedFirstReply = useMemo(
        () => !loading && !streamingReply && messages.some((entry) => entry?.role === "assistant"),
        [messages, loading, streamingReply]
      );
      const {
        suggestion: languageSuggestion,
        accept: acceptLanguageSuggestion,
        dismiss: dismissLanguageSuggestion
      } = useLanguageSuggestion(hasFinishedFirstReply);
      const showLanguageNudge = !isPhoneLayout && Boolean(languageSuggestion) && messages.length > 0;
      const recommendFollowUps = useMemo(() => {
        if (!showRecommendFollowUps || !lastAssistantEntry) return [];
        if (dynamicFollowUps.length) return dynamicFollowUps.slice(0, 3);
        return recommendationFollowUpChips(lastUserBeforeAssistant, lastAssistantEntry.message);
      }, [showRecommendFollowUps, dynamicFollowUps, lastUserBeforeAssistant, lastAssistantEntry, language]);
      const starterPrompts = useMemo(
        // TF2 always leads with a portfolio card (the page's headline feature),
        // then three other topics.
        () => PAGE_TF2 ? [
          ...pickStarterPrompts(TF2_STARTER_PROMPT_POOL.filter((entry) => entry.set === "portfolio"), 1),
          ...pickStarterPrompts(TF2_STARTER_PROMPT_POOL.filter((entry) => entry.set !== "portfolio"), 3)
        ] : pickStarterPrompts(STARTER_PROMPT_POOL, 4),
        [activeId]
      );
      const activeProject = projects.find((entry) => entry.id === activeProjectId) || null;
      const composerPlaceholders = useMemo(() => getComposerPlaceholders(isPhoneLayout), [language, isPhoneLayout]);
      const composerPlaceholder = composerPlaceholders[placeholderIndex % composerPlaceholders.length];
      useEffect(() => {
        if (hasConversation || listening || transcribing || input.trim() || composerFocused) return void 0;
        let reduced = false;
        try {
          reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        } catch (e) {
        }
        if (reduced) return void 0;
        const step = isPhoneLayout ? 4e3 : 3800;
        const timer = window.setInterval(() => {
          setPlaceholderFading(true);
          window.setTimeout(() => {
            setPlaceholderIndex((prev) => (prev + 1) % composerPlaceholders.length);
            setPlaceholderFading(false);
          }, 150);
        }, step);
        return () => window.clearInterval(timer);
      }, [hasConversation, listening, transcribing, input, isPhoneLayout, composerPlaceholders.length, composerFocused]);
      const welcomeHeadline = useMemo(() => {
        const headlines = getWelcomeHeadlines();
        return headlines[welcomeHeadlineIndex % headlines.length] || headlines[0];
      }, [welcomeHeadlineIndex, language]);
      const [typedCount, setTypedCount] = useState(0);
      const [typingPhase, setTypingPhase] = useState("typing");
      const headlineText = `${welcomeHeadline.lead} ${welcomeHeadline.accent}`;
      useEffect(() => {
        if (!isPhoneLayout || hasConversation) return void 0;
        setTypedCount(0);
        setTypingPhase("typing");
      }, [isPhoneLayout, hasConversation, welcomeHeadlineIndex, language]);
      useEffect(() => {
        if (!isPhoneLayout || hasConversation) return void 0;
        const total = headlineText.length;
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          if (typedCount !== total) setTypedCount(total);
          return void 0;
        }
        if (typingPhase === "typing") {
          if (typedCount >= total) {
            const timer3 = window.setTimeout(() => setTypingPhase("deleting"), 4e3);
            return () => window.clearTimeout(timer3);
          }
          const timer2 = window.setTimeout(() => setTypedCount((n) => n + 1), 46 + Math.random() * 44);
          return () => window.clearTimeout(timer2);
        }
        if (typedCount <= 0) {
          const headlines = getWelcomeHeadlines();
          setWelcomeHeadlineIndex((prev) => (prev + 1) % headlines.length);
          return void 0;
        }
        const timer = window.setTimeout(() => setTypedCount((n) => n - 1), 26);
        return () => window.clearTimeout(timer);
      }, [isPhoneLayout, hasConversation, typingPhase, typedCount, headlineText, language]);
      const leadLength = welcomeHeadline.lead.length;
      const typedLead = isPhoneLayout ? headlineText.slice(0, Math.min(typedCount, leadLength)) : welcomeHeadline.lead;
      const typedAccent = isPhoneLayout ? headlineText.slice(leadLength + 1, Math.max(leadLength + 1, typedCount)) : welcomeHeadline.accent;
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
              updatedAt: Number(session.updatedAt) || Date.now()
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
              updatedAt: Number(session.updatedAt) || 0
            });
          });
          if (title.toLowerCase().includes(query) && !(session.messages || []).some((msg) => msg?.role === "user")) {
            hits.push({
              id: `${session.id}:title`,
              sessionId: session.id,
              title,
              prompt: title,
              updatedAt: Number(session.updatedAt) || 0
            });
          }
        });
        return hits.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 24);
      }, [chatSearchQuery, sessions]);
      const chatSearchInputRef = useRef(null);
      const [itemHits, setItemHits] = useState([]);
      const [itemSearching, setItemSearching] = useState(false);
      useEffect(() => {
        const query = chatSearchQuery.trim();
        if (popupMode !== "search" || query.length < 2) {
          setItemHits([]);
          setItemSearching(false);
          return void 0;
        }
        const controller = new AbortController();
        setItemSearching(true);
        const timer = window.setTimeout(() => {
          fetch(`search_items.php?q=${encodeURIComponent(query)}&limit=12`, { signal: controller.signal }).then((response) => response.ok ? response.json() : { items: [] }).then((payload) => {
            if (controller.signal.aborted) return;
            setItemHits(Array.isArray(payload?.items) ? payload.items.slice(0, 12) : []);
          }).catch((searchError) => {
            if (searchError?.name !== "AbortError") setItemHits([]);
          }).finally(() => {
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
        if (!popupMode) return void 0;
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
          sessionIds: []
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
              updatedAt: Date.now()
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
            followups: Array.isArray(current.followups) ? current.followups : []
          }]));
          return null;
        });
      }, [updateActiveMessages]);
      const streamingView = useMemo(() => {
        if (!streamingReply) return null;
        const userPrompt = (messages.slice().reverse().find((row) => row && row.role === "user") || {}).content || "";
        const content = streamingReply.content || "";
        if (streamingReply.plain) {
          return {
            prepared: { metrics: [], sentiment: null, factors: [], body: content, showStrips: false },
            html: formatPlainMarkdownHtml(content)
          };
        }
        const prepared = typeof prepareChatAssistantSections === "function" ? prepareChatAssistantSections(content, {
          snapshot: marketSnapshot,
          forecast: streamingReply.forecast,
          userText: userPrompt
        }) : { metrics: [], sentiment: null, factors: [], body: content };
        const bodyMd = typeof resolveChatAssistantBodyMarkdown === "function" ? resolveChatAssistantBodyMarkdown(prepared.body, content, streamingReply.items, userPrompt) : typeof chatMarkdownHasVisibleBody === "function" && !chatMarkdownHasVisibleBody(prepared.body) && typeof synthesizeChatFallbackMarkdown === "function" ? synthesizeChatFallbackMarkdown(content, streamingReply.items, userPrompt) : prepared.body;
        return {
          prepared,
          html: formatChatRichText(bodyMd, streamingReply.items)
        };
      }, [streamingReply, messages, marketSnapshot]);
      const scrollThreadToBottom = useCallback(() => {
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
        }
      }, [activeId, canPersistChat]);
      useEffect(() => {
        let cancelled = false;
        let attempts = 0;
        const loadStatus = () => {
          attempts += 1;
          fetch(PAGE_TF2 ? "chat.php?game=tf2" : "chat.php", { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((payload) => {
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
          }).catch(() => {
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
          cache: "no-store"
        }).then((response) => response.ok ? response.json() : null).then((payload) => {
          if (cancelled || !payload?.success || !payload.snapshot) return;
          setMarketSnapshot(payload.snapshot);
        }).catch(() => {
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
          return void 0;
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
          const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
          const form = new FormData();
          form.append("audio", blob, `dictation.${extension}`);
          const response = await fetch("transcribe.php", {
            method: "POST",
            body: form,
            credentials: "same-origin"
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
        if (!attachMenuOpen) return void 0;
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
            const stamp = /* @__PURE__ */ new Date();
            const fallbackName = `screenshot-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}-${String(stamp.getHours()).padStart(2, "0")}${String(stamp.getMinutes()).padStart(2, "0")}${String(stamp.getSeconds()).padStart(2, "0")}.jpg`;
            setPendingMedia((prev) => {
              prev.forEach((item) => {
                if (item?.kind === "video" && item.url && String(item.url).startsWith("blob:")) {
                  try {
                    URL.revokeObjectURL(item.url);
                  } catch (_error) {
                  }
                }
              });
              return [{
                id: uid(),
                kind: "image",
                name: file.name && file.name !== "image.png" ? file.name : fallbackName,
                url: dataUrl,
                data_url: dataUrl
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
                try {
                  URL.revokeObjectURL(item.url);
                } catch (_error) {
                }
              }
            });
            return [{
              id: uid(),
              kind: "video",
              name: file.name || "video.mp4",
              url
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
        if (active && active.matches?.("input, textarea, [contenteditable='true']") && !active.closest?.(".home-ai-composer") && !active.closest?.(".home-ai")) {
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
        if (panelMode !== "chat") return void 0;
        const onPaste = (event) => {
          void handlePasteMedia(event);
        };
        window.addEventListener("paste", onPaste);
        return () => window.removeEventListener("paste", onPaste);
      }, [handlePasteMedia, panelMode]);
      const startNewChatRef = useRef(null);
      useEffect(() => {
        const onHomeReset = () => {
          startNewChatRef.current?.();
          window.scrollTo({ top: 0, behavior: "smooth" });
        };
        window.addEventListener("cs2:home-reset", onHomeReset);
        return () => window.removeEventListener("cs2:home-reset", onHomeReset);
      }, []);
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
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete("project");
            window.history.replaceState({}, "", url.pathname + url.search + url.hash);
          } catch (_error) {
          }
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
        setSidebarOpen(!isPhoneLayoutRef.current);
        const blank = { id: uid(), title: "New chat", updatedAt: Date.now(), messages: [] };
        const next = persistSessions([blank, ...sessions.filter((entry) => (entry.messages || []).length > 0)]);
        setActiveId(blank.id);
        if (activeProjectId) {
          persistProjects(projects.map((project) => project.id === activeProjectId ? { ...project, sessionIds: [blank.id, ...(project.sessionIds || []).filter((id) => id !== blank.id)] } : project));
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
          const filtered = Array.isArray(raw) ? raw.filter((entry, index) => {
            const entryId = String(entry?.id || entry?.key || entry?.itemId || `watch-${index}`);
            return entryId !== id;
          }) : [];
          window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(filtered));
        } catch (_error) {
        }
        setWatchlistItems(next);
      }, []);
      const createProject = useCallback(() => {
        openProjectPopup();
      }, [openProjectPopup]);
      const openProject = useCallback((id) => {
        setSidebarOpen(true);
        setActiveProjectId((current) => current === id ? null : id);
        setPanelMode("chat");
        if (window.matchMedia("(max-width: 960px)").matches) {
          setSidebarOpen(false);
        }
      }, []);
      const deleteProject = useCallback((id) => {
        const next = projects.filter((project) => project.id !== id);
        persistProjects(next);
        setActiveProjectId((current) => current === id ? null : current);
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
          sessionIds: (project.sessionIds || []).filter((sessionId) => sessionId !== id)
        })));
      }, [activeId, clearPendingMedia, persistProjects, projects, stopDictation]);
      const sendMessage = useCallback(async (rawText, options) => {
        const text = String(rawText || "").trim();
        const displayText = String(options && options.displayText || "").trim();
        const media = pendingMedia.map((item) => ({
          kind: item.kind,
          name: item.name,
          url: item.url || "",
          data_url: item.data_url || (item.kind === "image" ? item.url : "") || ""
        }));
        if (!text && !media.length || loading || streamingReply) return;
        const content = text || (media.some((item) => item.kind === "image") ? "What do you see in this image?" : "I attached a video.");
        const firstStatus = homeAiActivityPhasesForPrompt(content, media)[0] || "aiph_searchingDb";
        activityPromptRef.current = { content, media };
        stickToBottomRef.current = true;
        scrollAfterSendRef.current = true;
        setError("");
        setActivityStatus(firstStatus);
        setLoading(true);
        stopDictation();
        setAttachMenuOpen(false);
        const userMessage = media.length ? { role: "user", content, media } : { role: "user", content };
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
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              messages: nextMessages.map((entry) => {
                const payload2 = {
                  role: entry.role,
                  content: entry.content,
                  media: Array.isArray(entry.media) ? entry.media.map((item) => ({
                    kind: item.kind,
                    name: item.name,
                    data_url: item.data_url || (item.kind === "image" ? item.url : "") || ""
                  })) : void 0
                };
                if (entry.role === "assistant") {
                  const itemName = String(
                    entry.forecast?.item_name || entry.forecast?.item || entry.distribution?.item_name || entry.price_history?.item_name || ""
                  ).trim();
                  payload2.charts = {
                    forecast: Boolean(entry.forecast),
                    distribution: Boolean(entry.distribution),
                    price_history: Boolean(entry.price_history),
                    item: itemName
                  };
                }
                return payload2;
              }),
              context: {
                lang: window.I18N ? window.I18N.getLanguage() : "en",
                path: window.location.pathname,
                title: document.title || "",
                page_type: "mark",
                mode: "market",
                // Tapped one of Mark's own suggestions: answer it as a read on
                // what happens next, without cards or metric strips.
                follow_up: Boolean(options && options.followUp),
                // CS2 or TF2 (the game switcher next to the logo). TF2 questions
                // are answered from the TF2 catalog (tf2_ai_helpers.php).
                game: activeGame()
              }
            })
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
          const reply = payload.plain ? String(payload.reply || payload.message?.content || "").replace(/(?:^|\n|-{3,})[ \t]*[-—–_*]*\s*FOLLOW[ \t_-]?UPS[ \t]*[-—–_*:]*[\s\S]*$/, "").replace(/(?:\n[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*)+\s*$/, "").trim() : typeof chatReplyFromPayload === "function" ? chatReplyFromPayload(payload, items, content) : stripMarkMarkdown(String(payload.reply || payload.message?.content || "").trim()) || (typeof synthesizeChatFallbackMarkdown === "function" ? synthesizeChatFallbackMarkdown("", items, content) : "");
          const forecast = payload.forecast && typeof payload.forecast === "object" ? payload.forecast : null;
          const distribution = payload.distribution && typeof payload.distribution === "object" ? payload.distribution : null;
          const priceHistory = payload.price_history && typeof payload.price_history === "object" ? payload.price_history : null;
          const plain = Boolean(payload.plain);
          const followups = (Array.isArray(payload.followups) ? payload.followups : []).map((entry) => String(entry || "").replace(/\s+/g, " ").trim()).filter((entry, index, list) => entry && entry.length <= 120 && list.indexOf(entry) === index).slice(0, 4);
          const assistantMessage = {
            role: "assistant",
            content: reply,
            forecast,
            distribution,
            price_history: priceHistory,
            items,
            plain,
            followups
          };
          if (!mountedRef.current) {
            if (canPersistChatRef.current) {
              appendAssistantToStoredSession(activeIdRef.current, assistantMessage);
            }
            return;
          }
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
            followups
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
              noiseSuppression: true
            }
          });
          mediaStreamRef.current = stream;
          chunksRef.current = [];
          skipTranscribeRef.current = false;
          baseInputRef.current = String(input || "").trim();
          const mimeCandidates = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/mp4",
            "audio/ogg;codecs=opus"
          ];
          const mimeType = mimeCandidates.find((type) => typeof MediaRecorder.isTypeSupported === "function" ? MediaRecorder.isTypeSupported(type) : false) || "";
          const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
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
          }, 3e4);
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
        transcribing
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
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: classNames(
        "home-ai",
        !sidebarOpen && "is-sidebar-collapsed",
        sidebarOpen && "is-sidebar-open",
        // The profile page stands alone: no chat rail beside it.
        panelMode === "profile" && "is-profile"
      ) }, panelMode === "chat" && !hasConversation ? /* @__PURE__ */ React.createElement(HeroWaves, null) : null, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "home-ai-sidebar-backdrop",
          "aria-label": t("home_closeSidebar"),
          onClick: () => setSidebarOpen(false)
        }
      ), /* @__PURE__ */ React.createElement("aside", { className: "home-ai-sidebar", "aria-label": "Mark AI sidebar" }, isPhoneLayout ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-drawer-head" }, /* @__PURE__ */ React.createElement("a", { className: "home-ai-drawer-brand", href: "index.html", "aria-label": "CSPRICE" }, /* @__PURE__ */ React.createElement("img", { src: "logo.png?v=20260815-csprice-restore-1", alt: "CSPRICE" })), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "home-ai-drawer-round",
          onClick: openChatSearch,
          "aria-label": t("home_search")
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass", "aria-hidden": "true" })
      )) : null, /* @__PURE__ */ React.createElement("div", { className: "home-ai-sidebar-top" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "home-ai-sidebar-btn home-ai-sidebar-toggle",
          onClick: () => setSidebarOpen((open) => !open),
          "data-tip": sidebarOpen ? "Collapse" : "Expand",
          title: sidebarOpen ? "Collapse sidebar" : "Expand sidebar",
          "aria-label": sidebarOpen ? "Collapse sidebar" : "Expand sidebar"
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-bars", "aria-hidden": "true" }),
        /* @__PURE__ */ React.createElement("span", null, sidebarOpen ? "Collapse" : "Menu")
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "home-ai-sidebar-btn home-ai-new",
          onClick: startNewChat,
          "data-tip": t("home_newChat"),
          title: t("home_newChat"),
          "aria-label": t("home_newChat")
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus", "aria-hidden": "true" }),
        /* @__PURE__ */ React.createElement("span", null, t("home_newChat"))
      )), /* @__PURE__ */ React.createElement("div", { className: "home-ai-sidebar-divider", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("nav", { className: "home-ai-nav", "aria-label": "Mark AI library" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "home-ai-sidebar-btn home-ai-nav-item home-ai-nav-search",
          onClick: openChatSearch,
          "data-tip": t("home_search"),
          title: t("home_search")
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass", "aria-hidden": "true" }),
        /* @__PURE__ */ React.createElement("span", null, t("home_search"))
      ), isPhoneLayout ? HUB_LINKS.map((entry) => /* @__PURE__ */ React.createElement(
        "a",
        {
          key: entry.href,
          className: "home-ai-sidebar-btn home-ai-nav-item home-ai-nav-hub",
          href: entry.href,
          "data-tip": entry.label || t(entry.labelKey),
          title: entry.label || t(entry.labelKey)
        },
        /* @__PURE__ */ React.createElement("i", { className: entry.icon, "aria-hidden": "true" }),
        /* @__PURE__ */ React.createElement("span", null, entry.label || t(entry.labelKey))
      )) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: classNames(
            "home-ai-sidebar-btn home-ai-nav-item",
            panelMode === "chat" && "is-active"
          ),
          onClick: () => {
            setPanelMode("chat");
            setSidebarOpen(true);
          },
          "data-tip": t("home_conversations"),
          title: t("home_conversations")
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-comments", "aria-hidden": "true" }),
        /* @__PURE__ */ React.createElement("span", null, t("home_conversations")),
        historySessions.length ? /* @__PURE__ */ React.createElement("em", { className: "home-ai-nav-badge" }, Math.min(99, historySessions.length)) : null
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: classNames(
            "home-ai-sidebar-btn home-ai-nav-item",
            panelMode === "charts" && "is-active"
          ),
          onClick: openChartsPanel,
          "data-tip": t("home_charts"),
          title: t("home_charts")
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chart-line", "aria-hidden": "true" }),
        /* @__PURE__ */ React.createElement("span", null, t("home_charts")),
        savedCharts.length ? /* @__PURE__ */ React.createElement("em", { className: "home-ai-nav-badge" }, Math.min(99, savedCharts.length)) : null
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: classNames(
            "home-ai-sidebar-btn home-ai-nav-item",
            panelMode === "watchlist" && "is-active"
          ),
          onClick: openWatchlistPanel,
          "data-tip": t("common_watchlist"),
          title: t("common_watchlist")
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-bookmark", "aria-hidden": "true" }),
        /* @__PURE__ */ React.createElement("span", null, t("common_watchlist")),
        watchlistItems.length ? /* @__PURE__ */ React.createElement("em", { className: "home-ai-nav-badge" }, Math.min(99, watchlistItems.length)) : null
      )), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "home-ai-sidebar-btn home-ai-nav-item",
          onClick: createProject,
          "data-tip": t("home_newProject"),
          title: t("home_newProject")
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-folder", "aria-hidden": "true" }),
        /* @__PURE__ */ React.createElement("span", null, t("home_newProject"))
      )), isPhoneLayout ? /* @__PURE__ */ React.createElement("nav", { className: "home-ai-browse", "aria-label": "Site sections" }, BROWSE_GROUPS.map((group) => {
        const groupKey = group.labelKey || group.label;
        const open = Boolean(openBrowseGroups[groupKey]);
        return /* @__PURE__ */ React.createElement(
          "div",
          {
            className: classNames("home-ai-browse-group", open && "is-open"),
            key: groupKey
          },
          /* @__PURE__ */ React.createElement(
            "button",
            {
              type: "button",
              className: "home-ai-browse-toggle",
              "aria-expanded": open,
              onClick: () => setOpenBrowseGroups((prev) => ({
                ...prev,
                [groupKey]: !prev[groupKey]
              }))
            },
            /* @__PURE__ */ React.createElement("span", null, group.labelKey ? t(group.labelKey) : group.label),
            /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-down", "aria-hidden": "true" })
          ),
          /* @__PURE__ */ React.createElement("div", { className: "home-ai-browse-panel" }, /* @__PURE__ */ React.createElement("div", { className: "home-ai-browse-panel-inner" }, group.links.map((link) => /* @__PURE__ */ React.createElement(
            "a",
            {
              key: link.href,
              className: "home-ai-sidebar-btn home-ai-nav-item home-ai-browse-link",
              href: link.href,
              tabIndex: open ? 0 : -1
            },
            link.category ? /* @__PURE__ */ React.createElement(CategoryNavIcon, { category: link.category }) : link.casesIcon ? /* @__PURE__ */ React.createElement("span", { className: "nav-cases-icon", "aria-hidden": "true" }) : link.drawnIcon ? /* @__PURE__ */ React.createElement(
              "img",
              {
                className: "nav-category-icon",
                src: `assets/icons/sections/${link.drawnIcon}`,
                alt: "",
                loading: "lazy",
                decoding: "async"
              }
            ) : /* @__PURE__ */ React.createElement("i", { className: link.icon, "aria-hidden": "true" }),
            /* @__PURE__ */ React.createElement("span", null, link.labelKey ? t(link.labelKey) : link.label)
          ))))
        );
      })) : null, /* @__PURE__ */ React.createElement("div", { className: "home-ai-sidebar-divider home-ai-sidebar-divider-soft", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("div", { className: "home-ai-sidebar-scroll" }, projects.length ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-section" }, /* @__PURE__ */ React.createElement("div", { className: "home-ai-section-label" }, t("home_projects")), /* @__PURE__ */ React.createElement("div", { className: "home-ai-history" }, projects.map((project) => /* @__PURE__ */ React.createElement(
        "div",
        {
          key: project.id,
          className: classNames("home-ai-history-item", project.id === activeProjectId && "is-active")
        },
        /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "home-ai-history-open",
            onClick: () => openProject(project.id),
            title: project.name
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-folder", "aria-hidden": "true" }),
          /* @__PURE__ */ React.createElement("span", null, project.name)
        ),
        /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "home-ai-history-delete",
            onClick: (event) => {
              event.stopPropagation();
              deleteProject(project.id);
            },
            title: t("home_deleteProject"),
            "aria-label": `Delete project ${project.name}`
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-trash-can", "aria-hidden": "true" })
        )
      )))) : null, historySessions.length ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-section" }, /* @__PURE__ */ React.createElement("div", { className: "home-ai-section-label" }, activeProject ? activeProject.name : t("home_history")), /* @__PURE__ */ React.createElement("div", { className: "home-ai-history" }, historySessions.map((session) => /* @__PURE__ */ React.createElement(
        "div",
        {
          key: session.id,
          className: classNames("home-ai-history-item", session.id === activeId && panelMode === "chat" && "is-active")
        },
        /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "home-ai-history-open",
            onClick: () => openSession(session.id),
            title: session.title
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-message", "aria-hidden": "true" }),
          /* @__PURE__ */ React.createElement("span", null, session.title)
        ),
        /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "home-ai-history-delete",
            onClick: (event) => {
              event.stopPropagation();
              deleteSession(session.id);
            },
            title: t("home_deleteChat"),
            "aria-label": `Delete chat ${session.title}`
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-trash-can", "aria-hidden": "true" })
        )
      )))) : /* @__PURE__ */ React.createElement("p", { className: "home-ai-history-empty" }, t("home_noChatsYet"))), /* @__PURE__ */ React.createElement("div", { className: "home-ai-sidebar-divider", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("div", { className: "home-ai-sidebar-footer" }, authenticated && steamUser ? /* @__PURE__ */ React.createElement(
        "a",
        {
          href: "login.html",
          className: "home-ai-sidebar-profile",
          "data-tip": displaySessionName(steamUser) || "Profile",
          title: displaySessionName(steamUser) || `${sessionProviderLabel ? sessionProviderLabel(steamUser) : "Account"} profile`,
          "aria-label": displaySessionName(steamUser) ? `${displaySessionName(steamUser)} profile` : "Profile"
        },
        /* @__PURE__ */ React.createElement("span", { className: "home-ai-sidebar-profile-avatar-wrap" }, avatarSessionUrl(steamUser) ? /* @__PURE__ */ React.createElement(
          "img",
          {
            src: avatarSessionUrl(steamUser),
            alt: "",
            className: "home-ai-sidebar-profile-avatar",
            referrerPolicy: "no-referrer"
          }
        ) : /* @__PURE__ */ React.createElement("span", { className: "home-ai-sidebar-profile-fallback", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("i", { className: `fa-brands fa-${String(steamUser.provider || "steam").toLowerCase() === "google" ? "google" : String(steamUser.provider || "").toLowerCase() === "discord" ? "discord" : "steam"}` })), /* @__PURE__ */ React.createElement("i", { className: "home-ai-sidebar-online", "aria-hidden": "true" })),
        /* @__PURE__ */ React.createElement("span", { className: "home-ai-sidebar-profile-copy" }, /* @__PURE__ */ React.createElement("span", { className: "home-ai-sidebar-profile-name" }, displaySessionName(steamUser) || t("home_signedIn")), /* @__PURE__ */ React.createElement("small", null, t("home_online")))
      ) : /* @__PURE__ */ React.createElement(
        "a",
        {
          href: `steam_login.php?return_to=${encodeURIComponent(window.location.href)}`,
          className: "home-ai-sidebar-profile is-guest",
          "data-tip": t("home_logIn"),
          title: t("home_logIn"),
          onClick: (event) => {
            event.preventDefault();
            window.dispatchEvent(new CustomEvent("cs2:open-login-modal"));
          }
        },
        /* @__PURE__ */ React.createElement("span", { className: "home-ai-sidebar-profile-avatar-wrap" }, /* @__PURE__ */ React.createElement("span", { className: "home-ai-sidebar-profile-fallback", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-user" }))),
        /* @__PURE__ */ React.createElement("span", { className: "home-ai-sidebar-profile-copy" }, /* @__PURE__ */ React.createElement("span", { className: "home-ai-sidebar-profile-name" }, t("home_logIn")), /* @__PURE__ */ React.createElement("small", null, t("home_steamAccount")))
      )), isPhoneLayout ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-drawer-bottom" }, authenticated && steamUser ? /* @__PURE__ */ React.createElement(
        "a",
        {
          className: "home-ai-drawer-profile",
          href: "index.html?panel=profile",
          "aria-label": displaySessionName(steamUser) || "Profile"
        },
        /* @__PURE__ */ React.createElement("span", { className: "home-ai-drawer-avatar" }, avatarSessionUrl(steamUser) ? /* @__PURE__ */ React.createElement("img", { src: avatarSessionUrl(steamUser), alt: "", referrerPolicy: "no-referrer" }) : /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-user", "aria-hidden": "true" })),
        /* @__PURE__ */ React.createElement("span", { className: "home-ai-drawer-profile-name" }, displaySessionName(steamUser) || t("home_signedIn")),
        /* @__PURE__ */ React.createElement(CSIcon, { name: "chevronDown", size: 16, className: "home-ai-drawer-profile-caret" })
      ) : /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "home-ai-drawer-profile",
          onClick: () => window.dispatchEvent(new CustomEvent("cs2:open-login-modal"))
        },
        /* @__PURE__ */ React.createElement("span", { className: "home-ai-drawer-avatar" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-user", "aria-hidden": "true" })),
        /* @__PURE__ */ React.createElement("span", { className: "home-ai-drawer-profile-name" }, t("home_logIn")),
        /* @__PURE__ */ React.createElement(CSIcon, { name: "chevronDown", size: 16, className: "home-ai-drawer-profile-caret" })
      )) : null), /* @__PURE__ */ React.createElement("main", { className: classNames(
        "home-ai-main",
        panelMode === "chat" && !hasConversation && "is-welcome",
        showRecommendFollowUps && "has-suggest-chips"
      ) }, /* @__PURE__ */ React.createElement("header", { className: "home-ai-topbar" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "home-ai-mobile-sidebar",
          onClick: () => setSidebarOpen((open) => !open),
          "aria-label": "Toggle sidebar"
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-bars", "aria-hidden": "true" })
      )), /* @__PURE__ */ React.createElement("div", { className: "home-ai-stage", ref: listRef, onScroll: handleChatScroll }, panelMode === "profile" ? /* @__PURE__ */ React.createElement(ProfilePanel, { user: steamUser }) : panelMode === "charts" ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-charts-panel" }, savedCharts.length ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-charts-grid" }, savedCharts.map((chart) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: chart.id,
          type: "button",
          className: "home-ai-chart-card",
          onClick: () => openChart(chart),
          title: chart.title
        },
        /* @__PURE__ */ React.createElement("div", { className: "home-ai-chart-card-top" }, /* @__PURE__ */ React.createElement("span", null, chart.title)),
        /* @__PURE__ */ React.createElement(ChatForecastChart, { forecast: chart.forecast })
      ))) : /* @__PURE__ */ React.createElement("div", { className: "home-ai-empty compact" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chart-line home-ai-empty-icon", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("h1", null, t("home_noChartsYetTitle")), /* @__PURE__ */ React.createElement("p", null, PAGE_TF2 ? dellify(t("home_noChartsYetBody")) : t("home_noChartsYetBody")))) : panelMode === "watchlist" ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-charts-panel home-ai-watchlist-panel" }, watchlistItems.length ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-charts-grid" }, watchlistItems.map((item) => /* @__PURE__ */ React.createElement("div", { key: item.id, className: "home-ai-chart-card home-ai-watchlist-card" }, /* @__PURE__ */ React.createElement(
        "a",
        {
          className: "home-ai-watchlist-card-main",
          href: item.href || "roi.html",
          title: item.name
        },
        /* @__PURE__ */ React.createElement("div", { className: "home-ai-watchlist-thumb" }, item.image ? /* @__PURE__ */ React.createElement("img", { src: item.image, alt: "", loading: "lazy", decoding: "async" }) : /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-bookmark", "aria-hidden": "true" })),
        /* @__PURE__ */ React.createElement("div", { className: "home-ai-chart-card-top" }, /* @__PURE__ */ React.createElement("span", null, item.name), item.price != null ? /* @__PURE__ */ React.createElement("em", { className: "home-ai-watchlist-price" }, "€", item.price.toFixed(2)) : /* @__PURE__ */ React.createElement("em", { className: "home-ai-watchlist-price is-muted" }, "—"))
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "home-ai-watchlist-remove",
          onClick: () => removeWatchlistItem(item.id),
          title: t("home_removeFromWatchlist"),
          "aria-label": `Remove ${item.name}`
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-trash-can", "aria-hidden": "true" })
      )))) : /* @__PURE__ */ React.createElement("div", { className: "home-ai-empty compact" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-bookmark home-ai-empty-icon", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("h1", null, t("home_noItemsYetTitle")), /* @__PURE__ */ React.createElement("p", null, t("home_noItemsYetBody")))) : !hasConversation ? isMobileHome ? /* @__PURE__ */ React.createElement(
        MobileStartScreen,
        {
          onPrompt: (text) => {
            sendMessage(text);
            window.setTimeout(() => {
              try {
                listRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
              } catch (e) {
              }
            }, 80);
          },
          userName: greetingName(steamUser)
        }
      ) : /* @__PURE__ */ React.createElement("div", { className: "home-ai-empty" }, isPhoneLayout ? /* @__PURE__ */ React.createElement(
        "svg",
        {
          className: "home-ai-hero-logo",
          viewBox: "0 0 64 64",
          role: "img",
          "aria-label": "CSPRICE"
        },
        /* @__PURE__ */ React.createElement("g", { transform: "skewX(-8)" }, /* @__PURE__ */ React.createElement("rect", { className: "home-ai-hero-bar home-ai-hero-bar-1", x: "9", y: "38", width: "13", height: "18", rx: "3.5", fill: "#ffffff" }), /* @__PURE__ */ React.createElement("rect", { className: "home-ai-hero-bar home-ai-hero-bar-2", x: "27", y: "24", width: "13", height: "32", rx: "3.5", fill: "#60a5fa" }), /* @__PURE__ */ React.createElement("rect", { className: "home-ai-hero-bar home-ai-hero-bar-3", x: "45", y: "9", width: "13", height: "47", rx: "3.5", fill: "#2563eb" }))
      ) : null, /* @__PURE__ */ React.createElement(
        "h1",
        {
          className: classNames("home-ai-welcome-headline", isPhoneLayout && "is-typewriter"),
          "aria-label": headlineText
        },
        /* @__PURE__ */ React.createElement("span", { className: "home-ai-empty-lead" }, typedLead, isPhoneLayout && !typedAccent ? /* @__PURE__ */ React.createElement("span", { className: "home-ai-type-caret", "aria-hidden": "true" }) : null),
        " ",
        /* @__PURE__ */ React.createElement("span", { className: "home-ai-empty-accent-wrap" }, /* @__PURE__ */ React.createElement("span", { className: "home-ai-empty-accent" }, typedAccent, isPhoneLayout && typedAccent ? /* @__PURE__ */ React.createElement("span", { className: "home-ai-type-caret", "aria-hidden": "true" }) : null))
      ), /* @__PURE__ */ React.createElement(MarketTicker, null)) : /* @__PURE__ */ React.createElement("div", { className: "home-ai-thread" }, messages.map((entry, index) => entry.role === "user" ? /* @__PURE__ */ React.createElement("div", { key: `${entry.role}-${index}`, className: "home-ai-row is-user" }, /* @__PURE__ */ React.createElement("div", { className: "home-ai-bubble" }, Array.isArray(entry.media) && entry.media.length ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-msg-media" }, entry.media.map((item, mediaIndex) => /* @__PURE__ */ React.createElement("div", { key: `${item.name || "media"}-${mediaIndex}`, className: "home-ai-msg-media-item" }, item.kind === "video" ? item.url ? /* @__PURE__ */ React.createElement("video", { src: item.url, controls: true, playsInline: true, preload: "metadata" }) : /* @__PURE__ */ React.createElement("div", { className: "home-ai-attach-fallback wide" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-film", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, item.name || "Video")) : item.url || item.data_url ? /* @__PURE__ */ React.createElement("img", { src: item.url || item.data_url, alt: item.name || "Attachment" }) : /* @__PURE__ */ React.createElement("div", { className: "home-ai-attach-fallback wide" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-image", "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("span", null, item.name || "Image"))))) : null, /* @__PURE__ */ React.createElement("div", { className: "home-ai-text" }, entry.display || entry.content))) : /* @__PURE__ */ React.createElement("div", { key: `${entry.role}-${index}`, className: "home-ai-row is-assistant" }, /* @__PURE__ */ React.createElement("div", { className: "home-ai-bubble" }, /* @__PURE__ */ React.createElement(
        ChatMarketSnapshot,
        {
          snapshot: marketSnapshot,
          forecast: entry.forecast,
          content: entry.content,
          hidden: Boolean(entry.plain) || !PAGE_TF2 && messages.findIndex((row) => row && row.role === "assistant") !== index
        }
      ), (() => {
        if (entry.plain) {
          return /* @__PURE__ */ React.createElement("div", { className: "home-ai-text", dangerouslySetInnerHTML: { __html: formatPlainMarkdownHtml(entry.content) } });
        }
        const userPrompt = index > 0 && messages[index - 1]?.role === "user" ? String(messages[index - 1].content || "") : "";
        const prepared = typeof prepareChatAssistantSections === "function" ? prepareChatAssistantSections(entry.content, {
          snapshot: marketSnapshot,
          forecast: entry.forecast,
          userText: userPrompt
        }) : { metrics: [], sentiment: null, factors: [], body: entry.content };
        const bodyMd = typeof resolveChatAssistantBodyMarkdown === "function" ? resolveChatAssistantBodyMarkdown(prepared.body, entry.content, entry.items, userPrompt) : typeof chatMarkdownHasVisibleBody === "function" && !chatMarkdownHasVisibleBody(prepared.body) && typeof synthesizeChatFallbackMarkdown === "function" ? synthesizeChatFallbackMarkdown(entry.content, entry.items, userPrompt) : prepared.body;
        return /* @__PURE__ */ React.createElement(React.Fragment, null, prepared.showStrips !== false ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-metrics-factors" }, /* @__PURE__ */ React.createElement(ChatMetricsStrip, { metrics: prepared.metrics }), /* @__PURE__ */ React.createElement(ChatKeyFactorsStrip, { factors: prepared.factors }), /* @__PURE__ */ React.createElement(ChatSentimentStrip, { sentiment: prepared.sentiment, factors: prepared.factors })) : null, /* @__PURE__ */ React.createElement("div", { className: "home-ai-text", dangerouslySetInnerHTML: { __html: formatChatRichText(bodyMd, entry.items) } }));
      })(), /* @__PURE__ */ React.createElement(
        ChatAssistantMessageExtras,
        {
          items: entry.items,
          forecast: entry.forecast,
          distribution: entry.distribution,
          priceHistory: entry.price_history,
          content: entry.content
        }
      ), /* @__PURE__ */ React.createElement(
        AssistantActions,
        {
          text: stripMarkMarkdown(entry.content),
          ratingKey: `${activeId}:${index}`,
          rating: ratings[`${activeId}:${index}`] || "",
          onRate: rateAnswer
        }
      )))), streamingReply && streamingView ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-row is-assistant is-streaming" }, /* @__PURE__ */ React.createElement("div", { className: "home-ai-bubble" }, /* @__PURE__ */ React.createElement(
        ChatMarketSnapshot,
        {
          snapshot: marketSnapshot,
          forecast: streamingReply.forecast,
          content: streamingReply.content,
          hidden: Boolean(streamingReply.plain) || !PAGE_TF2 && messages.some((row) => row && row.role === "assistant")
        }
      ), streamingView.prepared.showStrips !== false ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-metrics-factors" }, /* @__PURE__ */ React.createElement(ChatMetricsStrip, { metrics: streamingView.prepared.metrics }), /* @__PURE__ */ React.createElement(ChatKeyFactorsStrip, { factors: streamingView.prepared.factors }), /* @__PURE__ */ React.createElement(ChatSentimentStrip, { sentiment: streamingView.prepared.sentiment, factors: streamingView.prepared.factors })) : null, /* @__PURE__ */ React.createElement(
        TypedRichHtml,
        {
          html: streamingView.html,
          active: true,
          onComplete: finishStreaming,
          onProgress: scrollThreadToBottom
        }
      ), /* @__PURE__ */ React.createElement(ChatItemCards, { items: streamingReply.items }))) : null, loading ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-row is-assistant is-typing" }, /* @__PURE__ */ React.createElement("div", { className: "home-ai-bubble" }, /* @__PURE__ */ React.createElement("div", { className: "home-ai-typing", "aria-label": `${assistantName} is thinking` }, /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null)), activityStatus ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-search-status", "aria-live": "polite" }, t(activityStatus)) : null)) : null)), panelMode === "chat" ? /* @__PURE__ */ React.createElement("footer", { className: classNames(
        "home-ai-composer-wrap",
        showSuggestChips && "has-suggest-chips"
      ) }, error ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-error" }, error) : null, enabled === false ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-error soft" }, "Add an API key in ", /* @__PURE__ */ React.createElement("code", null, "config.local.php"), " to enable live AI replies.", " ", /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "home-ai-error-retry",
          onClick: () => {
            fetch("chat.php", {
              credentials: "same-origin",
              headers: { Accept: "application/json" },
              cache: "no-store"
            }).then((response) => response.ok ? response.json() : null).then((payload) => {
              if (!payload) {
                setEnabled(false);
                return;
              }
              setEnabled(Boolean(payload.enabled));
              if (payload.name) setAssistantName(String(payload.name));
              if (payload.enabled) setError("");
            }).catch(() => setEnabled(false));
          }
        },
        "Retry"
      )) : null, pendingMedia.length ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-attach-preview" }, pendingMedia.map((item) => /* @__PURE__ */ React.createElement(
        MediaThumb,
        {
          key: item.id,
          item,
          onRemove: () => removePendingMedia(item.id)
        }
      ))) : null, showSuggestChips || showLanguageNudge ? /* @__PURE__ */ React.createElement("div", { className: classNames(
        "home-ai-bottom-row",
        showLanguageNudge && "has-lang-nudge"
      ) }, showSuggestChips ? /* @__PURE__ */ React.createElement(
        "div",
        {
          key: `${activeId}:${lastAssistantEntry.index}`,
          className: "home-ai-suggest-chips",
          role: "group",
          "aria-label": "Follow-up suggestions"
        },
        recommendFollowUps.map((label, index) => /* @__PURE__ */ React.createElement(
          "button",
          {
            key: label,
            type: "button",
            className: "home-ai-suggest-chip",
            style: { "--chip-i": index },
            onClick: () => sendMessage(label, { followUp: true }),
            disabled: loading || Boolean(streamingReply)
          },
          /* @__PURE__ */ React.createElement("span", null, label)
        ))
      ) : null, /* @__PURE__ */ React.createElement(
        LanguageSuggestBar,
        {
          suggestion: showLanguageNudge ? languageSuggestion : null,
          onAccept: acceptLanguageSuggestion,
          onDismiss: dismissLanguageSuggestion
        }
      )) : null, /* @__PURE__ */ React.createElement(
        "form",
        {
          className: classNames(
            "home-ai-composer",
            listening && "is-listening",
            transcribing && "is-transcribing",
            attachMenuOpen && "is-attach-open"
          ),
          onSubmit: (event) => {
            event.preventDefault();
            sendMessage(input);
          },
          onPaste: (event) => {
            void handlePasteMedia(event);
          }
        },
        !listening ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-attach", ref: attachWrapRef }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: classNames("home-ai-plus", attachMenuOpen && "is-open"),
            onClick: () => setAttachMenuOpen((open) => !open),
            "aria-haspopup": "menu",
            "aria-expanded": attachMenuOpen ? "true" : "false",
            disabled: transcribing,
            title: t("mhome_attach"),
            "aria-label": t("mhome_attach"),
            "aria-expanded": attachMenuOpen
          },
          isMobileHome ? /* @__PURE__ */ React.createElement(CSIcon, { name: "plus", size: 20 }) : /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus", "aria-hidden": "true" })
        ), attachMenuOpen ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-attach-menu", role: "menu" }, /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            role: "menuitem",
            onClick: () => imageInputRef.current?.click?.()
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-image", "aria-hidden": "true" }),
          /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, t("home_uploadImage")), /* @__PURE__ */ React.createElement("small", null, t("home_uploadImageFormats")))
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            role: "menuitem",
            onClick: () => videoInputRef.current?.click?.()
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-film", "aria-hidden": "true" }),
          /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, t("home_uploadVideo")), /* @__PURE__ */ React.createElement("small", null, t("home_uploadVideoFormats")))
        )) : null, /* @__PURE__ */ React.createElement(
          "input",
          {
            ref: imageInputRef,
            type: "file",
            accept: "image/*",
            hidden: true,
            onChange: (event) => {
              void handleAttachFiles("image", event.target.files);
              event.target.value = "";
            }
          }
        ), /* @__PURE__ */ React.createElement(
          "input",
          {
            ref: videoInputRef,
            type: "file",
            accept: "video/*",
            hidden: true,
            onChange: (event) => {
              void handleAttachFiles("video", event.target.files);
              event.target.value = "";
            }
          }
        )) : null,
        listening ? /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "home-ai-dict-cancel",
            onClick: cancelDictation,
            title: t("home_cancelDictation"),
            "aria-label": t("home_cancelDictation")
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark", "aria-hidden": "true" })
        ) : null,
        listening ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-wave", "aria-hidden": "true" }, waveLevels.map((level, index) => /* @__PURE__ */ React.createElement(
          "span",
          {
            key: `wave-${index}`,
            style: { transform: `scaleY(${Math.max(0.12, Math.min(1, level))})` }
          }
        ))) : /* @__PURE__ */ React.createElement(
          "input",
          {
            ref: inputRef,
            type: "text",
            value: input,
            onChange: (event) => setInput(event.target.value),
            className: classNames(placeholderFading && "is-ph-fading"),
            onFocus: () => setComposerFocused(true),
            onBlur: () => setComposerFocused(false),
            placeholder: transcribing ? t("home_transcribing") : composerPlaceholder,
            maxLength: 1200,
            disabled: transcribing,
            "aria-label": PAGE_TF2 ? dellify(t("mhome_inputLabel")) : t("mhome_inputLabel")
          }
        ),
        listening ? /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "home-ai-dict-stop",
            onClick: () => stopDictation({ transcribe: true }),
            title: t("home_stopDictation"),
            "aria-label": t("home_stopDictation")
          },
          /* @__PURE__ */ React.createElement("span", { className: "home-ai-dict-square", "aria-hidden": "true" })
        ) : null,
        dictationSupported && !listening ? /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: classNames(
              "home-ai-mic",
              transcribing && "is-busy",
              micPressed && "is-press"
            ),
            onClick: handleMicClick,
            disabled: transcribing,
            title: transcribing ? t("home_transcribing") : t("mhome_voiceInput"),
            "aria-label": transcribing ? t("home_transcribing") : t("mhome_voiceInput")
          },
          isMobileHome && !transcribing ? /* @__PURE__ */ React.createElement(CSIcon, { name: "mic", size: 18 }) : /* @__PURE__ */ React.createElement(
            "i",
            {
              className: classNames(
                "fa-solid",
                transcribing ? "fa-spinner fa-spin" : "fa-microphone"
              ),
              "aria-hidden": "true"
            }
          )
        ) : null,
        listening ? /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "home-ai-send home-ai-dict-send",
            onClick: sendDictation,
            title: t("home_send"),
            "aria-label": t("home_send")
          },
          isMobileHome ? /* @__PURE__ */ React.createElement(CSIcon, { name: "arrowUp", size: 18 }) : /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-up", "aria-hidden": "true" })
        ) : null,
        !listening ? /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "submit",
            className: "home-ai-send",
            disabled: loading || Boolean(streamingReply) || !input.trim() && !pendingMedia.length,
            "aria-label": t("home_send")
          },
          isMobileHome ? /* @__PURE__ */ React.createElement(CSIcon, { name: "arrowUp", size: 18 }) : /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-up", "aria-hidden": "true" })
        ) : null
      ), !hasConversation && !isMobileHome ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-starters-block" }, /* @__PURE__ */ React.createElement("div", { className: "home-ai-starters" }, starterPrompts.map((entry) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: entry.labelKey || entry.label,
          type: "button",
          className: "home-ai-starter",
          onClick: () => sendMessage(entry.prompt, {
            displayText: entry.promptKey ? t(entry.promptKey) : ""
          }),
          disabled: loading
        },
        /* @__PURE__ */ React.createElement(StarterPromptIcon, null),
        /* @__PURE__ */ React.createElement("span", { className: "home-ai-starter-copy" }, /* @__PURE__ */ React.createElement("strong", null, entry.label || t(entry.labelKey)), /* @__PURE__ */ React.createElement("small", null, entry.hint || t(entry.hintKey)))
      )))) : null) : null)), popupMode ? /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "home-ai-prompt-search-overlay",
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) closePopup();
          }
        },
        /* @__PURE__ */ React.createElement(
          "div",
          {
            className: classNames(
              "home-ai-prompt-search-box",
              (popupMode === "project" || chatSearchQuery.trim()) && "has-results"
            ),
            role: "dialog",
            "aria-modal": "true",
            "aria-label": popupMode === "project" ? t("home_createProject") : t("nav_searchPlaceholder")
          },
          /* @__PURE__ */ React.createElement(
            "form",
            {
              className: "home-ai-prompt-search-input-row",
              onSubmit: (event) => {
                event.preventDefault();
                if (popupMode === "project") {
                  submitProjectName();
                  return;
                }
                if (itemHits[0]) {
                  window.location.href = searchItemHref(itemHits[0]);
                  return;
                }
                if (promptSearchHits[0]) {
                  openSession(promptSearchHits[0].sessionId);
                  closePopup();
                }
              }
            },
            /* @__PURE__ */ React.createElement(
              "i",
              {
                className: classNames(
                  "fa-solid",
                  popupMode === "project" ? "fa-folder" : "fa-magnifying-glass"
                ),
                "aria-hidden": "true"
              }
            ),
            /* @__PURE__ */ React.createElement(
              "input",
              {
                ref: chatSearchInputRef,
                type: "text",
                value: chatSearchQuery,
                onChange: (event) => setChatSearchQuery(event.target.value),
                placeholder: popupMode === "project" ? t("home_projectNamePlaceholder") : t("nav_searchPlaceholder"),
                autoComplete: "off",
                spellCheck: false,
                maxLength: popupMode === "project" ? 48 : void 0
              }
            ),
            /* @__PURE__ */ React.createElement(
              "i",
              {
                className: classNames(
                  "fa-solid fa-spinner fa-spin home-ai-prompt-search-spin",
                  itemSearching && "is-on"
                ),
                "aria-hidden": "true"
              }
            ),
            /* @__PURE__ */ React.createElement("button", { type: "button", onClick: closePopup, "aria-label": t("home_close") }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark", "aria-hidden": "true" }))
          ),
          popupMode === "project" || chatSearchQuery.trim() ? /* @__PURE__ */ React.createElement("div", { className: "home-ai-prompt-search-results" }, popupMode === "project" ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("p", { className: "home-ai-prompt-search-empty" }, chatSearchQuery.trim() ? "Press Enter to create this project." : "Type a project name, then press Enter."), /* @__PURE__ */ React.createElement(
            "button",
            {
              type: "button",
              className: "home-ai-prompt-search-hit home-ai-prompt-search-create",
              onClick: submitProjectName,
              disabled: !chatSearchQuery.trim()
            },
            /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-folder", "aria-hidden": "true" }),
            /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, t("home_createProject")), /* @__PURE__ */ React.createElement("small", null, chatSearchQuery.trim() || t("home_enterNameFirst")))
          )) : itemHits.length || promptSearchHits.length ? /* @__PURE__ */ React.createElement(React.Fragment, null, itemHits.map((item) => /* @__PURE__ */ React.createElement(
            "a",
            {
              key: `item-${item.market_hash_name}`,
              className: "home-ai-prompt-search-hit is-item",
              href: searchItemHref(item),
              onClick: closePopup
            },
            item.image ? /* @__PURE__ */ React.createElement("img", { src: item.image, alt: "", loading: "lazy" }) : /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-gem", "aria-hidden": "true" }),
            /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, item.display_name || item.market_hash_name), /* @__PURE__ */ React.createElement("small", null, item.type_note || item.category || ""))
          )), promptSearchHits.length ? /* @__PURE__ */ React.createElement(React.Fragment, null, itemHits.length ? /* @__PURE__ */ React.createElement("p", { className: "home-ai-prompt-search-head" }, t("home_conversations")) : null, promptSearchHits.map((hit) => /* @__PURE__ */ React.createElement(
            "button",
            {
              key: hit.id,
              type: "button",
              className: "home-ai-prompt-search-hit",
              onClick: () => {
                openSession(hit.sessionId);
                closePopup();
              }
            },
            /* @__PURE__ */ React.createElement("i", { className: "fa-regular fa-message", "aria-hidden": "true" }),
            /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("strong", null, hit.title), /* @__PURE__ */ React.createElement("small", null, hit.prompt))
          ))) : null) : itemSearching ? /* @__PURE__ */ React.createElement("p", { className: "home-ai-prompt-search-empty" }, t("home_search"), "…") : /* @__PURE__ */ React.createElement("p", { className: "home-ai-prompt-search-empty" }, t("home_noMatchingPrompts"))) : null
        )
      ) : null);
    }
    mountPage(/* @__PURE__ */ React.createElement(HomeAiPage, null));
  })();
})();
