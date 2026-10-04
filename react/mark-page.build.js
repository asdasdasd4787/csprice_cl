(() => {
  (() => {
    const { useCallback, useEffect, useMemo, useRef, useState } = React;
    const { Layout, mountPage, classNames, stripMarkMarkdown, formatChatRichText, ChatForecastChart } = window.CS2React;
    const MARK_AVATAR_SRC = "assets/ai/mark-avatar.png?v=20260626-mark-transparent-1";
    const CHAT_STORAGE_KEY = "cs2_mark_page_messages_v1";
    const MODES = [
      {
        id: "market",
        label: "Market Analysis",
        prompts: [
          "What CS2 skins are trending right now on CS Price?",
          "Which cases look strongest for 30D ROI?",
          "Explain today's market news and what it means for traders.",
          "What should I watch before buying a high-tier skin?"
        ]
      },
      {
        id: "portfolio",
        label: "Portfolio Insights",
        prompts: [
          "Analyze my Steam inventory and highlight concentration risk.",
          "Which of my top holdings look overexposed?",
          "What items in my inventory are easiest to liquidate?",
          "Give me a hold vs sell framework for my portfolio."
        ]
      },
      {
        id: "site",
        label: "Site & Tools",
        prompts: [
          "How do I use the Deals page to find arbitrage?",
          "What is Skin Crafter and how does float wear work?",
          "How does the Market Explorer compare marketplaces?",
          "How do watchlists and price alerts work?"
        ]
      }
    ];
    function readStoredMessages(allowRestore) {
      if (!allowRestore) return [];
      try {
        const saved = JSON.parse(window.localStorage.getItem(CHAT_STORAGE_KEY) || "[]");
        if (!Array.isArray(saved)) {
          return [];
        }
        return saved.slice(-30).map((entry) => entry?.role === "assistant" ? { ...entry, content: stripMarkMarkdown(entry.content) } : entry);
      } catch (_error) {
        return [];
      }
    }
    function extractMentionedItems(text) {
      const items = [];
      const source = String(text || "");
      source.split(/\n+/).forEach((line) => {
        let cleaned = line.replace(/^[-•*]\s*/, "").trim().replace(/\*\*/g, "");
        if (!cleaned) return;
        const splitMatch = cleaned.match(/^(.+?)(?:\s*(?:—|–|-|:)\s*(?:€|\$|EUR|USD|\d))/);
        const name = (splitMatch ? splitMatch[1] : cleaned.split(/[,:]/)[0]).trim();
        if (name.length < 4 || name.length > 72) return;
        if (/^(concentration|liquidity|hold|sell|risk|summary|note|overview)/i.test(name)) return;
        if (/^\d/.test(name)) return;
        items.push(name);
      });
      (source.match(/(?:★\s*)?[A-Za-z0-9][A-Za-z0-9\s\-|]+(?:\|[^\n,]+)/g) || []).forEach((match) => {
        const name = match.trim();
        if (name.length >= 4 && name.length <= 72) items.push(name);
      });
      return [...new Set(items.map((entry) => entry.replace(/\s+/g, " ").trim()))].slice(0, 4);
    }
    function buildFollowUpPrompts({ mode, messages }) {
      const lastUser = [...messages].reverse().find((entry) => entry.role === "user");
      const lastAssistant = [...messages].reverse().find((entry) => entry.role === "assistant");
      const userText = String(lastUser?.content || "").toLowerCase();
      const assistantText = String(lastAssistant?.content || "");
      const combined = `${userText} ${assistantText.toLowerCase()}`;
      const items = extractMentionedItems(assistantText);
      const topItem = items[0];
      const secondItem = items[1];
      const prompts = [];
      const pushUnique = (prompt) => {
        const next = String(prompt || "").trim();
        if (!next || prompts.includes(next)) return;
        prompts.push(next);
      };
      if (/go up|rise|rising|gain|gainer|bullish|upside|invest|buy|pump|moon|appreciat|will increase|price up/i.test(combined)) {
        pushUnique("Which of these picks has the best liquidity if I want to sell quickly?");
        pushUnique("What could make these prices drop instead?");
        pushUnique("Should I buy now or wait for a dip?");
        if (topItem) {
          pushUnique(`What's the 30D ROI outlook for ${topItem}?`);
          pushUnique(`Compare ${topItem} to similar items at the same price tier.`);
        } else {
          pushUnique("Show me cheaper alternatives with similar upside potential.");
        }
      }
      if (/drop|fall|declin|bearish|sell|dump|lose value|go down/i.test(combined)) {
        pushUnique("Is this a short-term dip or a longer trend?");
        pushUnique("When would be a smarter exit point?");
        if (topItem) pushUnique(`Should I hold or sell ${topItem} right now?`);
        pushUnique("Which items look safest if the market keeps falling?");
      }
      if (/case|capsule|container|key/i.test(combined)) {
        pushUnique("Which cases have the strongest 30D ROI right now?");
        pushUnique("How do case prices tie to key skin demand?");
        pushUnique("Are any cases undervalued versus recent supply?");
      }
      if (/trend|trending|hot|momentum|volume/i.test(combined)) {
        pushUnique("What's driving this trend right now?");
        pushUnique("Which marketplace shows the strongest momentum?");
        pushUnique("What should I watch over the next 7 days?");
      }
      if (/roi|return|profit|yield/i.test(combined)) {
        pushUnique("What timeframe makes the most sense for these picks?");
        pushUnique("Which marketplace offers the best entry price?");
      }
      if (/portfolio|inventory|holdings|concentration|my steam/i.test(combined)) {
        pushUnique("Which holdings should I trim first?");
        pushUnique("What's my biggest concentration risk?");
        pushUnique("Which items are easiest to liquidate?");
      }
      if (/deal|arbitrage|discount|spread|underpriced/i.test(combined)) {
        pushUnique("Where is the spread widest right now?");
        pushUnique("What fees should I factor into this trade?");
      }
      if (topItem && secondItem) {
        pushUnique(`Between ${topItem} and ${secondItem}, which is the better hold?`);
      }
      const genericByMode = {
        market: [
          "Break down the risks for these picks.",
          "Are there better value alternatives?",
          "Explain the trend behind these prices.",
          "What should I watch before buying a high-tier skin?"
        ],
        portfolio: [
          "What would you trim vs hold?",
          "How liquid are my top holdings?",
          "Give me a hold vs sell framework for my portfolio."
        ],
        site: [
          "Where on CS Price should I check these items?",
          "How do I set a watchlist for these picks?"
        ]
      };
      const pool = genericByMode[mode] || genericByMode.market;
      pool.forEach((prompt) => pushUnique(prompt));
      return prompts.slice(0, 4);
    }
    function normalizeFollowUps(raw) {
      if (!Array.isArray(raw)) return [];
      return raw.map((entry) => String(entry || "").trim()).filter((entry) => entry.length > 0 && entry.length <= 120).slice(0, 4);
    }
    function MarkQuickPrompts({ prompts, onSelect, disabled, modeId, fast = false, aiGenerated = false }) {
      return /* @__PURE__ */ React.createElement("div", { className: classNames("mark-quick-prompts", fast && "is-fast"), "aria-label": "Suggested questions" }, /* @__PURE__ */ React.createElement("span", { className: "mark-quick-prompts-label" }, aiGenerated ? "Keep asking" : "Try asking"), /* @__PURE__ */ React.createElement("div", { className: "mark-quick-prompts-scroll", key: modeId }, prompts.map((prompt, index) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: prompt,
          type: "button",
          className: "mark-quick-prompt-chip",
          style: { animationDelay: `${index * (fast ? 24 : 55)}ms` },
          onClick: () => onSelect(prompt),
          disabled
        },
        prompt
      ))));
    }
    function MarkAssistantRow({ name, avatarSrc, children, className, style }) {
      return /* @__PURE__ */ React.createElement("article", { className: classNames("mark-assistant-row", className), style }, /* @__PURE__ */ React.createElement("img", { src: avatarSrc, alt: "", className: "mark-assistant-avatar" }), /* @__PURE__ */ React.createElement("div", { className: "mark-assistant-copy" }, /* @__PURE__ */ React.createElement("div", { className: "mark-msg-label" }, name), children));
    }
    function useTypewriter(text, active, onComplete) {
      const [displayed, setDisplayed] = useState("");
      const onCompleteRef = useRef(onComplete);
      onCompleteRef.current = onComplete;
      useEffect(() => {
        if (!active || !text) {
          setDisplayed("");
          return void 0;
        }
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          setDisplayed(text);
          onCompleteRef.current?.();
          return void 0;
        }
        setDisplayed("");
        let index = 0;
        let cancelled = false;
        let timeoutId = null;
        const schedule = (fn, ms) => {
          timeoutId = window.setTimeout(fn, ms);
        };
        const tick = () => {
          if (cancelled) return;
          if (typeof document !== "undefined" && document.visibilityState === "hidden") {
            setDisplayed(text);
            onCompleteRef.current?.();
            return;
          }
          let step = 1;
          if (text.length > 900) step = 3;
          else if (text.length > 450) step = 2;
          index = Math.min(text.length, index + step);
          setDisplayed(text.slice(0, index));
          if (index >= text.length) {
            schedule(() => {
              if (!cancelled) onCompleteRef.current?.();
            }, 260);
            return;
          }
          const justTyped = text[index - 1] || "";
          let delay = text.length > 900 ? 12 : text.length > 450 ? 16 : 24;
          if (justTyped === "\n") delay += 110;
          else if (".!?".includes(justTyped)) delay += 85;
          else if (",;:".includes(justTyped)) delay += 35;
          schedule(tick, delay);
        };
        schedule(tick, 60);
        return () => {
          cancelled = true;
          if (timeoutId) window.clearTimeout(timeoutId);
        };
      }, [active, text]);
      return displayed;
    }
    function MarkPage() {
      const [mode, setMode] = useState("market");
      const [enabled, setEnabled] = useState(null);
      const [assistantName, setAssistantName] = useState("Mark");
      const [session, setSession] = useState(() => {
        try {
          const raw = window.sessionStorage.getItem("cs2_steam_session_cache");
          const parsed = raw ? JSON.parse(raw) : null;
          return {
            authenticated: Boolean(parsed?.authenticated),
            user: parsed?.user || null
          };
        } catch (_error) {
          return { authenticated: false, user: null };
        }
      });
      const [messages, setMessages] = useState(() => readStoredMessages(Boolean(session.authenticated)));
      const [input, setInput] = useState("");
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState("");
      const [inventorySnapshot, setInventorySnapshot] = useState(null);
      const [streamingReply, setStreamingReply] = useState(null);
      const [aiFollowUps, setAiFollowUps] = useState([]);
      const [listening, setListening] = useState(false);
      const [dictationSupported] = useState(() => typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
      const guestResetDoneRef = useRef(false);
      const canPersistChatRef = useRef(Boolean(session.authenticated));
      canPersistChatRef.current = Boolean(session.authenticated);
      const listRef = useRef(null);
      const stickToBottomRef = useRef(true);
      const inputRef = useRef(null);
      const recognitionRef = useRef(null);
      const baseInputRef = useRef("");
      const activeMode = MODES.find((entry) => entry.id === mode) || MODES[0];
      const hasConversation = messages.length > 0 || Boolean(streamingReply);
      const followUpPrompts = useMemo(() => {
        if (aiFollowUps.length >= 2) {
          return aiFollowUps;
        }
        const draftMessages = streamingReply?.content ? messages.concat([{ role: "assistant", content: streamingReply.content }]) : messages;
        const hasAssistant = draftMessages.some((entry) => entry.role === "assistant");
        if (!hasAssistant) return null;
        return buildFollowUpPrompts({ mode, messages: draftMessages });
      }, [aiFollowUps, messages, mode, streamingReply]);
      const displayPrompts = followUpPrompts || activeMode.prompts;
      const isDynamicFollowUp = Boolean(followUpPrompts && hasConversation);
      const isAiFollowUp = aiFollowUps.length >= 2 && isDynamicFollowUp;
      const promptsKey = isDynamicFollowUp ? `followup-${messages.length}-${aiFollowUps.length}-${streamingReply ? "stream" : "done"}` : mode;
      const showPrompts = !loading;
      const finishStreaming = useCallback(() => {
        setStreamingReply((current) => {
          if (!current?.content) return null;
          setMessages((prev) => prev.concat([{
            role: "assistant",
            content: current.content,
            forecast: current.forecast || null
          }]).slice(-30));
          return null;
        });
      }, []);
      const typedReply = useTypewriter(
        streamingReply?.content || "",
        Boolean(streamingReply),
        finishStreaming
      );
      const readPageContext = useCallback((overrideMode = mode) => ({
        lang: window.I18N ? window.I18N.getLanguage() : "en",
        path: window.location.pathname,
        title: document.title || "",
        page_type: "mark",
        mode: overrideMode,
        inventory: inventorySnapshot || void 0
      }), [inventorySnapshot, mode]);
      useEffect(() => {
        let cancelled = false;
        let attempts = 0;
        const loadStatus = () => {
          attempts += 1;
          fetch("chat.php", {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            cache: "no-store"
          }).then((response) => response.ok ? response.json() : null).then((payload) => {
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
        fetch("get_steam_session.php", { credentials: "same-origin", headers: { Accept: "application/json" } }).then((response) => response.ok ? response.json() : null).then((payload) => {
          setSession({
            authenticated: Boolean(payload?.authenticated),
            user: payload?.user || null
          });
        }).catch(() => setSession({ authenticated: false, user: null }));
      }, []);
      useEffect(() => {
        if (!canPersistChatRef.current) return;
        try {
          window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-30)));
        } catch (_error) {
        }
      }, [messages]);
      useEffect(() => {
        if (session.authenticated) {
          guestResetDoneRef.current = false;
          const saved = readStoredMessages(true);
          if (saved.length) setMessages(saved);
          return;
        }
        if (guestResetDoneRef.current) return;
        guestResetDoneRef.current = true;
        setMessages([]);
        setStreamingReply(null);
        setError("");
        setInput("");
      }, [session.authenticated]);
      useEffect(() => {
        if (!listRef.current || !stickToBottomRef.current) return;
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }, [messages, loading, typedReply, streamingReply]);
      const handleChatScroll = useCallback(() => {
        const el = listRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        stickToBottomRef.current = distanceFromBottom < 96;
      }, []);
      const loadInventorySnapshot = useCallback(() => {
        if (!session.authenticated) {
          return Promise.resolve(null);
        }
        return fetch("get_steam_inventory.php", {
          credentials: "same-origin",
          headers: { Accept: "application/json" }
        }).then((response) => response.ok ? response.json() : null).then((payload) => {
          const items = Array.isArray(payload?.inventory?.items) ? payload.inventory.items : [];
          const grouped = {};
          items.forEach((item) => {
            const key = String(item.market_hash_name || item.display_name || "").trim();
            if (!key) return;
            if (!grouped[key]) {
              grouped[key] = {
                name: String(item.display_name || item.market_hash_name || key),
                quantity: 0,
                unit_value: null,
                total_value: null
              };
            }
            grouped[key].quantity += Math.max(1, Number(item.amount) || 1);
          });
          const holdings = Object.values(grouped).sort((a, b) => b.quantity - a.quantity).slice(0, 12);
          const snapshot = {
            total_value: null,
            item_count: items.length,
            priced_count: holdings.length,
            valuation_mode: "Steam inventory snapshot",
            top_holdings: holdings
          };
          setInventorySnapshot(snapshot);
          return snapshot;
        }).catch(() => null);
      }, [session.authenticated]);
      useEffect(() => {
        if (mode === "portfolio" && session.authenticated) {
          loadInventorySnapshot();
        }
      }, [loadInventorySnapshot, mode, session.authenticated]);
      const sendMessage = useCallback(async (rawText, options = {}) => {
        const text = String(rawText || "").trim();
        if (!text || loading || streamingReply) return;
        stickToBottomRef.current = true;
        const nextMode = options.mode || mode;
        if (nextMode !== mode) setMode(nextMode);
        setError("");
        setLoading(true);
        setAiFollowUps([]);
        let context = readPageContext(nextMode);
        if (nextMode === "portfolio" && session.authenticated && !inventorySnapshot) {
          const snapshot = await loadInventorySnapshot();
          if (snapshot) {
            context = {
              ...context,
              mode: nextMode,
              inventory: snapshot
            };
          }
        }
        const nextMessages = messages.concat([{ role: "user", content: text }]);
        setMessages(nextMessages);
        setInput("");
        try {
          const response = await fetch("chat.php", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              messages: nextMessages,
              context
            })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload || payload.success === false) {
            throw new Error(payload?.error || "Chat request failed.");
          }
          const reply = stripMarkMarkdown(String(payload.reply || payload.message?.content || "").trim());
          if (!reply) throw new Error("The assistant returned an empty reply.");
          setAiFollowUps(normalizeFollowUps(payload.followups));
          const forecast = payload.forecast && typeof payload.forecast === "object" ? payload.forecast : null;
          setStreamingReply({ content: reply, forecast });
        } catch (requestError) {
          setError(requestError?.message || "Chat request failed.");
        } finally {
          setLoading(false);
        }
      }, [inventorySnapshot, loading, loadInventorySnapshot, messages, mode, readPageContext, session.authenticated, streamingReply]);
      const clearChat = useCallback(() => {
        setMessages([]);
        setStreamingReply(null);
        setAiFollowUps([]);
        setError("");
        try {
          window.localStorage.removeItem(CHAT_STORAGE_KEY);
        } catch (_error) {
        }
      }, []);
      const stopDictation = useCallback(() => {
        const recognition = recognitionRef.current;
        if (recognition) {
          try {
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            recognition.stop();
          } catch (_error) {
          }
        }
        recognitionRef.current = null;
        setListening(false);
      }, []);
      useEffect(() => () => {
        stopDictation();
      }, [stopDictation]);
      const toggleDictation = useCallback(() => {
        if (!dictationSupported || loading) return;
        if (listening) {
          stopDictation();
          return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          setError("Voice dictation is not supported in this browser.");
          return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.maxAlternatives = 1;
        baseInputRef.current = String(input || "").trim();
        recognitionRef.current = recognition;
        setListening(true);
        setError("");
        recognition.onresult = (event) => {
          let interim = "";
          let finalText = "";
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            const transcript = String(result?.[0]?.transcript || "");
            if (result.isFinal) finalText += transcript;
            else interim += transcript;
          }
          if (finalText) {
            const merged = `${baseInputRef.current} ${finalText}`.replace(/\s+/g, " ").trim();
            baseInputRef.current = merged;
            setInput(merged.slice(0, 1200));
            return;
          }
          const live = `${baseInputRef.current} ${interim}`.replace(/\s+/g, " ").trim();
          setInput(live.slice(0, 1200));
        };
        recognition.onerror = (event) => {
          const code = String(event?.error || "");
          if (code === "not-allowed" || code === "service-not-allowed") {
            setError("Microphone permission was blocked. Allow mic access to dictate prompts.");
          } else if (code !== "aborted" && code !== "no-speech") {
            setError("Voice dictation failed. Try again.");
          }
          stopDictation();
        };
        recognition.onend = () => {
          setListening(false);
          recognitionRef.current = null;
          inputRef.current?.focus?.();
        };
        try {
          recognition.start();
        } catch (_error) {
          setError("Could not start microphone dictation.");
          stopDictation();
        }
      }, [dictationSupported, input, listening, loading, stopDictation]);
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: "mark-shell" }, /* @__PURE__ */ React.createElement("main", { className: "mark-main" }, /* @__PURE__ */ React.createElement("section", { className: classNames("mark-chat-shell", hasConversation && "is-active") }, !hasConversation ? /* @__PURE__ */ React.createElement("header", { className: "mark-chat-hero" }, /* @__PURE__ */ React.createElement("img", { src: MARK_AVATAR_SRC, alt: "", className: "mark-chat-logo" }), /* @__PURE__ */ React.createElement("h1", null, assistantName), /* @__PURE__ */ React.createElement("p", null, "Chill CS2 market buddy — prices, slang lore, deals, and portfolio vibes.")) : null, /* @__PURE__ */ React.createElement("div", { className: "mark-mode-tabs", role: "tablist", "aria-label": "Mark AI modes" }, MODES.map((entry, index) => /* @__PURE__ */ React.createElement(
        "button",
        {
          key: entry.id,
          type: "button",
          role: "tab",
          className: classNames("mark-mode-tab", mode === entry.id && "active"),
          "aria-selected": mode === entry.id ? "true" : "false",
          style: { animationDelay: `${index * 60}ms` },
          onClick: () => setMode(entry.id)
        },
        entry.label
      ))), /* @__PURE__ */ React.createElement("div", { className: "mark-chat-body", ref: listRef, onScroll: handleChatScroll }, messages.length || streamingReply ? /* @__PURE__ */ React.createElement("div", { className: "mark-thread" }, messages.map((entry, index) => entry.role === "user" ? /* @__PURE__ */ React.createElement(
        "div",
        {
          key: `${entry.role}-${index}`,
          className: "mark-user-row mark-animate-in",
          style: { animationDelay: `${Math.min(index, 6) * 40}ms` }
        },
        /* @__PURE__ */ React.createElement("div", { className: "mark-msg-label" }, "You"),
        /* @__PURE__ */ React.createElement("div", { className: "mark-msg-text" }, entry.content)
      ) : /* @__PURE__ */ React.createElement(
        MarkAssistantRow,
        {
          key: `${entry.role}-${index}`,
          name: assistantName,
          avatarSrc: MARK_AVATAR_SRC,
          className: "mark-animate-in",
          style: { animationDelay: `${Math.min(index, 6) * 40}ms` }
        },
        /* @__PURE__ */ React.createElement("div", { className: "mark-msg-text", dangerouslySetInnerHTML: { __html: formatChatRichText(entry.content, entry.items) } }),
        entry.forecast ? /* @__PURE__ */ React.createElement(ChatForecastChart, { forecast: entry.forecast }) : null
      )), streamingReply ? /* @__PURE__ */ React.createElement(MarkAssistantRow, { name: assistantName, avatarSrc: MARK_AVATAR_SRC, className: "is-streaming mark-animate-in" }, /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "mark-msg-text mark-msg-text--live",
          dangerouslySetInnerHTML: {
            __html: `${formatChatRichText(typedReply, streamingReply.items)}<span class="mark-type-cursor" aria-hidden="true"></span>`
          }
        }
      )) : null, loading ? /* @__PURE__ */ React.createElement(MarkAssistantRow, { name: assistantName, avatarSrc: MARK_AVATAR_SRC, className: "is-typing" }, /* @__PURE__ */ React.createElement("div", { className: "mark-typing" }, /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null))) : null) : null), error ? /* @__PURE__ */ React.createElement("div", { className: "mark-chat-error" }, error) : null, enabled === false ? /* @__PURE__ */ React.createElement("div", { className: "mark-chat-error soft" }, "Add an API key in ", /* @__PURE__ */ React.createElement("code", null, "config.local.php"), " to enable live AI replies.") : null, /* @__PURE__ */ React.createElement("footer", { className: "mark-chat-footer" }, showPrompts ? /* @__PURE__ */ React.createElement(
        MarkQuickPrompts,
        {
          modeId: promptsKey,
          prompts: displayPrompts,
          onSelect: (prompt) => sendMessage(prompt, { mode }),
          disabled: loading,
          fast: isDynamicFollowUp,
          aiGenerated: isAiFollowUp
        }
      ) : null, /* @__PURE__ */ React.createElement(
        "form",
        {
          className: classNames("mark-chat-form", listening && "is-listening"),
          onSubmit: (event) => {
            event.preventDefault();
            stopDictation();
            sendMessage(input);
          }
        },
        /* @__PURE__ */ React.createElement(
          "input",
          {
            ref: inputRef,
            type: "text",
            value: input,
            onChange: (event) => setInput(event.target.value),
            placeholder: listening ? "Listening… speak your prompt" : "Ask Mark about CS2 markets, skins, deals, or your portfolio…",
            maxLength: 1200,
            disabled: loading
          }
        ),
        dictationSupported ? /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: classNames("mark-chat-mic", listening && "is-active"),
            onClick: toggleDictation,
            disabled: loading,
            title: listening ? "Stop dictation" : "Dictate prompt",
            "aria-label": listening ? "Stop dictation" : "Dictate prompt",
            "aria-pressed": listening ? "true" : "false"
          },
          /* @__PURE__ */ React.createElement("i", { className: classNames("fa-solid", listening ? "fa-stop" : "fa-microphone"), "aria-hidden": "true" })
        ) : null,
        /* @__PURE__ */ React.createElement("button", { type: "submit", disabled: loading || !input.trim() }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-paper-plane" }))
      ), /* @__PURE__ */ React.createElement("div", { className: "mark-chat-tools" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "mark-tool-btn", onClick: clearChat, disabled: loading || !messages.length }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus", "aria-hidden": "true" }), "New chat"), mode === "portfolio" && session.authenticated ? /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "mark-tool-btn",
          onClick: () => sendMessage("Analyze my Steam inventory and give me a concise portfolio breakdown.", { mode: "portfolio" }),
          disabled: loading
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-briefcase", "aria-hidden": "true" }),
        "Analyze inventory"
      ) : null))))));
    }
    mountPage(/* @__PURE__ */ React.createElement(MarkPage, null));
  })();
})();
