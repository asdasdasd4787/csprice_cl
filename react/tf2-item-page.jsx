(() => {
  const { useEffect, useMemo, useRef, useState } = React;
  const { Layout, mountPage, useSteamSession } = window.CS2React;

  // TF2 item page (tf2-item.html?item=<name>&e=<effect>&b=<base index>), the
  // CS2 item page's design (item_page.css) with TF2 data: header bar, the
  // image panel with the market table and CTA, the main chart on Steam's own
  // price history (get_steam_market_activity.php?app_id=440, the same feed
  // the CS2 page draws) with 24H/7D/30D/90D badges and market / range
  // toolbars, then the CS2 page's lower sections - Price history across the
  // four marketplaces, Market distribution (listings per market) and the
  // Marketplace comparison table (price, fee, cut, total, listings, vs
  // Steam) with the CS2 badges and payment / KYC icons.
  //
  // Catalog data: one shard (assets/data/tf2/items/<key>.json.gz, written by
  // scripts/tf2_import.php; shardKey() mirrors tf2ShardKey() there). Rows carry
  // today's prices (s Steam, k Skinport, m Mannco, d DMarket) with listing
  // counts (l, kq, dq), mu = the item's mannco.store page slug, h = daily
  // snapshots [[date, steam, best, skinport, mannco, dmarket], ...] since
  // 2026-09-27 (the last three columns since 2026-09-28), and sk = Skinport
  // sales averages [avg90, avg30, avg7, vol30].
  const MARKETS = [
    { id: "steam", key: "s", qty: "l", col: 1, label: "Steam", short: "Steam", image: "assets/markets/steam.png", color: "#2eb8a6", fill: ["rgba(46, 184, 166, 0.24)", "rgba(46, 184, 166, 0.02)"], distColor: "#6366f1", fee: 13, payments: [], kyc: false, url: (r) => `https://steamcommunity.com/market/listings/440/${encodeURIComponent(r.n)}` },
    { id: "skinport", key: "k", qty: "kq", col: 3, label: "Skinport", short: "Skinport", image: "assets/markets/skinport.png", color: "#4de7c4", fill: ["rgba(77, 231, 196, 0.18)", "rgba(77, 231, 196, 0.015)"], distColor: "#22d3ee", fee: 12, payments: ["card", "paypal", "bank"], kyc: true, url: (r) => `https://skinport.com/tf2/market?search=${encodeURIComponent(r.n)}` },
    // mannco.store's item pages are /item/<slug>; "/?search=" is the front page.
    { id: "mannco", key: "m", qty: "mq", col: 4, label: "Mannco.store", short: "Mannco", image: "assets/markets/mannco.ico", color: "#f43f5e", fill: ["rgba(244, 63, 94, 0.18)", "rgba(244, 63, 94, 0.01)"], distColor: "#f43f5e", fee: 5, payments: ["card", "crypto"], kyc: false, url: (r) => (r.mu ? `https://mannco.store/item/${encodeURIComponent(r.mu)}` : `https://mannco.store/tf2?search=${encodeURIComponent(r.e ? `${r.n} ${r.e.replace(/^★\s*/, "")}` : r.n)}`) },
    { id: "dmarket", key: "d", qty: "dq", col: 5, label: "DMarket", short: "DMarket", image: "assets/markets/dmarket.png", color: "#facc15", fill: ["rgba(250, 204, 21, 0.17)", "rgba(250, 204, 21, 0.01)"], distColor: "#facc15", fee: 7, payments: ["card", "paypal", "crypto", "bank"], kyc: true, url: (r) => `https://dmarket.com/ingame-items/item-list/tf2-skins?title=${encodeURIComponent(r.n)}` },
  ];
  const PAYMENT_META = {
    card: { label: "Bank card", icon: "fa-solid fa-credit-card" },
    paypal: { label: "PayPal", icon: "fa-brands fa-paypal" },
    crypto: { label: "Crypto", icon: "fa-solid fa-coins" },
    bank: { label: "Bank transfer", icon: "fa-solid fa-building-columns" },
  };
  const LABEL = {
    cosmetic: "Cosmetic", melee: "Melee Weapon", primary: "Primary Weapon", secondary: "Secondary Weapon", tool: "Tool",
    crate: "Crate", package: "Package", craft_item: "Craft Item", gift: "Gift", war_paint: "War Paint", taunt: "Taunt",
    strange_part: "Strange Part", party_favor: "Party Favor", usable_item: "Usable Item", supply_crate: "Supply Crate",
  };
  const WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle Scarred"];
  const RANGES = [["7D", 7], ["1M", 30], ["3M", 90], ["6M", 180], ["1Y", 365], ["ALL", 0]];
  const HISTORY_RANGES = [["30D", 30], ["90D", 90], ["180D", 180], ["1Y", 365]];
  const DAY = 86400000;

  const euro = (v) => (typeof v === "number" && v > 0
    ? new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(v)
    : "—");
  const count = (v) => new Intl.NumberFormat("en-US").format(v || 0);
  const has = (v) => typeof v === "number" && v > 0;
  const toneClass = (v) => (Math.abs(Number(v || 0)) < 0.01 ? "flat" : (Number(v) >= 0 ? "up" : "down"));
  const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
  const wearOf = (n) => { const m = /\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle Scarred)\)$/.exec(n); return m ? m[1] : ""; };
  const stripWear = (n) => n.replace(/\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle Scarred)\)$/, "");
  const marketOf = (id) => MARKETS.find((m) => m.id === id) || MARKETS[0];

  function shardKey(base, name) {
    if (base >= 0) return `b${base % 256}`;
    let h = 5381;
    for (let i = 0; i < name.length; i += 1) h = (Math.imul(h, 33) + name.charCodeAt(i)) >>> 0;
    return `n${h % 64}`;
  }
  // Clean TF2 URLs (scripts/tf2_url_helpers.php, same rules): every priced
  // item has a static page at tf2/<category>/<slug>/ (unusuals under
  // tf2/unusual/, the slug led by the effect); anything else keeps the query
  // URL. Keep this in step with the PHP twin.
  const TF2_URL_FOLD = { "\u00c0": "a", "\u00c1": "a", "\u00c2": "a", "\u00c3": "a", "\u00c4": "a", "\u00c5": "a", "\u00e0": "a", "\u00e1": "a", "\u00e2": "a", "\u00e3": "a", "\u00e4": "a", "\u00e5": "a", "\u00c7": "c", "\u00e7": "c", "\u00c8": "e", "\u00c9": "e", "\u00ca": "e", "\u00cb": "e", "\u00e8": "e", "\u00e9": "e", "\u00ea": "e", "\u00eb": "e", "\u00cc": "i", "\u00cd": "i", "\u00ce": "i", "\u00cf": "i", "\u00ec": "i", "\u00ed": "i", "\u00ee": "i", "\u00ef": "i", "\u00d1": "n", "\u00f1": "n", "\u00d2": "o", "\u00d3": "o", "\u00d4": "o", "\u00d5": "o", "\u00d6": "o", "\u00d8": "o", "\u00f2": "o", "\u00f3": "o", "\u00f4": "o", "\u00f5": "o", "\u00f6": "o", "\u00f8": "o", "\u00d9": "u", "\u00da": "u", "\u00db": "u", "\u00dc": "u", "\u00f9": "u", "\u00fa": "u", "\u00fb": "u", "\u00fc": "u", "\u00dd": "y", "\u00fd": "y", "\u00ff": "y" };
  function tf2Slug(name, effect) {
    const fx = String(effect || "").trim().replace(/^\u2605\s*/, "");
    let t = `${fx ? `${fx} ` : ""}${String(name || "").trim()}`;
    t = t.replace(/[\u00c0-\u00ff]/g, (c) => TF2_URL_FOLD[c] || c).replace(/[^\x00-\x7F]/g, "").toLowerCase();
    t = t.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return t || "item";
  }
  function tf2Priced(row) {
    return ["s", "k", "m", "d"].some((k) => typeof row[k] === "number" && row[k] > 0);
  }
  /** Link to an item: { n, e, g, b, s, k, m, d } catalog-row shape; priced = override. */
  function tf2ItemHref(row, priced) {
    const ok = priced === undefined ? tf2Priced(row) : priced;
    if (ok && row.n) {
      const seg = row.e ? "unusual" : String(row.g || "cosmetic").toLowerCase().replace(/_/g, "-");
      return `tf2/${seg}/${tf2Slug(row.n, row.e)}/`;
    }
    const p = new URLSearchParams({ item: row.n || "" });
    if (row.e) p.set("e", row.e);
    if (typeof row.b === "number" && row.b >= 0) p.set("b", String(row.b));
    return `tf2-item.html?${p.toString()}`;
  }
  const itemHref = (row) => tf2ItemHref(row);
  function imageFor(row, shard, size = "360fx360f") {
    if (row.i) return `${shard.icon_base}${row.i}/${size}`;
    const base = row.b >= 0 ? shard.bases[row.b] : null;
    if (base && base[1]) return String(base[1]).replace(/^http:/, "https:");
    return "";
  }
  async function loadShard(key) {
    if (typeof DecompressionStream !== "function") throw new Error("This browser cannot unpack the item data.");
    const res = await fetch(`assets/data/tf2/items/${key}.json.gz`, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return JSON.parse(await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text());
  }
  /** Steam's own price history for the item (volume-weighted daily points). */
  async function loadSteamHistory(name) {
    const params = new URLSearchParams({ market_hash_name: name, app_id: "440" });
    const res = await fetch(`get_steam_market_activity.php?${params.toString()}`, { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    const byRange = data && data.sales_history_by_range ? data.sales_history_by_range : {};
    const rows = Array.isArray(byRange.all) && byRange.all.length ? byRange.all : (Array.isArray(data?.sales_history) ? data.sales_history : []);
    return rows
      .map((p) => ({ time: String(p.date || "").slice(0, 10), value: Number(p.price), volume: Number(p.quantity) || 0, kind: "steam" }))
      .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.time) && has(p.value))
      .sort((a, b) => (a.time < b.time ? -1 : 1));
  }
  const bestOf = (row) => {
    let best = null;
    for (const m of MARKETS) if (has(row[m.key]) && (!best || row[m.key] < best.price)) best = { price: row[m.key], market: m };
    return best;
  };
  const chartTheme = () => {
    const cs = getComputedStyle(document.documentElement);
    return {
      muted: cs.getPropertyValue("--muted").trim() || "#94a3b8",
      border: cs.getPropertyValue("--border").trim() || "rgba(148,163,184,.12)",
    };
  };

  /**
   * Chart points for one market: Steam gets Steam's own history when loaded
   * (else the daily snapshots); the other markets their daily snapshot
   * column, Skinport also its three sales averages placed at the middle of
   * their windows. Sorted, one per day, today's price last.
   */
  function seriesFor(row, marketId, steamHistory) {
    const now = Date.now();
    const byDay = new Map();
    const market = marketOf(marketId);
    if (marketId === "steam" && steamHistory && steamHistory.length) {
      for (const p of steamHistory) byDay.set(p.time, { value: p.value, volume: p.volume || 0, kind: "steam", label: "Steam sale" });
    } else {
      for (const h of (Array.isArray(row.h) ? row.h : [])) {
        const v = h[market.col];
        if (has(v)) byDay.set(h[0], { value: v, kind: "snapshot", label: "Daily snapshot" });
      }
    }
    if (marketId === "skinport" && Array.isArray(row.sk)) {
      const [a90, a30, a7] = row.sk;
      if (has(a90) && !byDay.has(isoDay(now - 60 * DAY))) byDay.set(isoDay(now - 60 * DAY), { value: a90, kind: "avg", label: "90-day Skinport average" });
      if (has(a30) && !byDay.has(isoDay(now - 18 * DAY))) byDay.set(isoDay(now - 18 * DAY), { value: a30, kind: "avg", label: "30-day Skinport average" });
      if (has(a7) && !byDay.has(isoDay(now - 4 * DAY))) byDay.set(isoDay(now - 4 * DAY), { value: a7, kind: "avg", label: "7-day Skinport average" });
    }
    const current = row[market.key];
    if (has(current) && !(marketId === "steam" && steamHistory && steamHistory.length)) byDay.set(isoDay(now), { value: current, kind: "now", label: "Live" });
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([time, p]) => ({ time, ...p }));
  }

  /** % change over `days` for a market from its series (closest point at or before the cutoff). */
  function deltaFor(points, days) {
    if (!points.length) return null;
    const last = points[points.length - 1];
    const cutoff = isoDay(Date.now() - days * DAY);
    let base = null;
    for (const p of points) if (p.time <= cutoff) base = p;
    if (!base || base === last) return null;
    return { pct: ((last.value - base.value) / base.value) * 100, basis: base.kind };
  }

  /**
   * Keeps a chart sized to its box. The box's height comes from the layout
   * (flex fill beside the stats panel, CSS min-height, fullscreen min-height)
   * and the chart itself is absolutely positioned inside it (tf2.css), so
   * reading the box back can never be propped open by the chart - leaving
   * fullscreen shrinks it again, and the date axis sits at the box's bottom.
   */
  function followSize(chart, el) {
    const apply = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) chart.applyOptions({ width: w, height: h });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    document.addEventListener("fullscreenchange", apply);
    return () => { ro.disconnect(); document.removeEventListener("fullscreenchange", apply); };
  }

  /** The CS2 item chart's Steam volume shading: busier days get brighter bars. */
  function volumeBarColor(value, peak) {
    const intensity = 0.16 + (Math.max(0, value) / Math.max(1, peak)) * 0.44;
    return `rgba(74, 144, 226, ${intensity.toFixed(3)})`;
  }

  /**
   * The main chart, drawn exactly like the CS2 item page (item-page.tsx):
   * price on the left axis, horizontal grid only, a dashed crosshair, a line
   * over a soft fill - Steam's teal (#2eb8a6) or the marketplace's colour -
   * and on Steam the daily sales as blue volume bars in the lower 45%.
   */
  function PriceChart({ points, marketId, range }) {
    const ref = useRef(null);
    useEffect(() => {
      const el = ref.current;
      const LW = window.LightweightCharts;
      if (!el || !LW || points.length < 2) return undefined;
      const { muted } = chartTheme();
      const market = marketOf(marketId);
      const steam = marketId === "steam";
      const withVolume = steam && points.some((p) => p.volume > 0);
      const line = steam ? "#2eb8a6" : market.color;
      const fillTop = steam ? "rgba(46, 184, 166, 0.24)" : market.fill[0];
      const fillBottom = steam ? "rgba(46, 184, 166, 0.02)" : market.fill[1];
      const chart = LW.createChart(el, {
        width: el.clientWidth || 600,
        height: el.clientHeight || 320,
        layout: { background: { type: "solid", color: "transparent" }, textColor: muted, fontFamily: "Inter, system-ui, sans-serif" },
        localization: { priceFormatter: (v) => euro(v) },
        grid: { vertLines: { visible: false }, horzLines: { color: "rgba(71, 85, 105, 0.24)" } },
        crosshair: {
          mode: LW.CrosshairMode ? LW.CrosshairMode.Normal : 0,
          vertLine: { color: "rgba(143, 152, 160, 0.5)", width: 1, style: 2, labelVisible: false },
          horzLine: { color: "rgba(143, 152, 160, 0.5)", width: 1, style: 2, labelVisible: true, labelBackgroundColor: "#1e2330" },
        },
        leftPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.08, bottom: withVolume ? 0.02 : 0.04 } },
        rightPriceScale: { visible: false, borderVisible: false },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
        handleScroll: false,
        handleScale: false,
      });
      const data = points.map((p) => ({ time: p.time, value: Number(p.value.toFixed(4)) }));
      const area = chart.addAreaSeries({ lineColor: "transparent", topColor: fillTop, bottomColor: fillBottom, priceScaleId: "left", crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
      area.setData(data);
      // Bars before the line: series paint in the order they are added.
      if (withVolume) {
        const peak = Math.max(1, ...points.map((p) => p.volume || 0));
        const volume = chart.addHistogramSeries({ priceScaleId: "steam-volume", priceFormat: { type: "volume" }, base: 0, lastValueVisible: false, priceLineVisible: false });
        chart.priceScale("steam-volume").applyOptions({ scaleMargins: { top: 0.55, bottom: 0 }, visible: false });
        volume.setData(points.map((p) => ({ time: p.time, value: p.volume || 0, color: volumeBarColor(p.volume || 0, peak) })));
      }
      const price = chart.addLineSeries({
        color: line, lineWidth: 2, priceScaleId: "left", lastValueVisible: false, priceLineVisible: false,
        crosshairMarkerRadius: 3, crosshairMarkerBorderColor: line, crosshairMarkerBackgroundColor: "#1a1e2e",
      });
      price.setData(data);
      chart.timeScale().fitContent();
      // Hover: the CS2 page's time-axis label - the exact date, and on Steam
      // the number of items sold that day - pinned to the date axis under
      // the pointer (item-page.tsx placeTimeAxisLabel; same classes/CSS).
      const wrap = el.parentElement;
      const label = document.createElement("div");
      label.className = "tv-lw-time-axis-label";
      if (wrap) wrap.appendChild(label);
      const soldByDay = new Map(points.map((p) => [p.time, p.volume || 0]));
      const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const pad = (n) => String(n).padStart(2, "0");
      const dayKey = (t) => (typeof t === "string" ? t : (t && t.year ? `${t.year}-${pad(t.month)}-${pad(t.day)}` : ""));
      const hideLabel = () => label.classList.remove("is-visible");
      const onMove = (param) => {
        if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) { hideLabel(); return; }
        const key = dayKey(param.time);
        const [y, m, d] = key.split("-").map(Number);
        if (!y || !m || !d) { hideLabel(); return; }
        const sold = withVolume && soldByDay.has(key) ? soldByDay.get(key) : null;
        label.innerHTML = `<span class="tv-lw-time-axis-date">${d} ${MONTHS[m - 1]} ${y}</span>`
          + (sold != null ? `<span class="tv-lw-time-axis-sold">${count(sold)} sold</span>` : "");
        label.classList.add("is-visible");
        let x = param.point.x;
        try { const c = chart.timeScale().timeToCoordinate(param.time); if (c != null && Number.isFinite(Number(c))) x = Number(c); } catch (_e) { /* keep the pointer x */ }
        let leftWidth = 0;
        try { leftWidth = chart.priceScale("left").width() || 0; } catch (_e) { leftWidth = 0; }
        const w = label.offsetWidth || 60;
        const h = label.offsetHeight || 20;
        const paneLeft = el.offsetLeft + leftWidth;
        const paneRight = el.offsetLeft + el.clientWidth;
        label.style.left = `${Math.max(paneLeft + w / 2 + 2, Math.min(paneRight - w / 2 - 2, paneLeft + x))}px`;
        label.style.top = `${el.offsetTop + el.clientHeight - h - 1}px`;
      };
      chart.subscribeCrosshairMove(onMove);
      const stop = followSize(chart, el);
      return () => { stop(); chart.unsubscribeCrosshairMove(onMove); label.remove(); chart.remove(); };
    }, [points, marketId, range]);
    return <div className="tv-lw-canvas" ref={ref} />;
  }

  /** One line per visible marketplace (the CS2 page's multi-marketplace chart). */
  /** Daily points from the first to the last day, carrying the last known value forward. */
  function densifyDaily(points) {
    if (!Array.isArray(points) || points.length < 2) return points || [];
    const start = Date.parse(`${points[0].time}T00:00:00Z`);
    const end = Date.parse(`${points[points.length - 1].time}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || (end - start) / DAY > 800) return points;
    const out = [];
    let i = 0;
    let cur = points[0];
    for (let t = start; t <= end; t += DAY) {
      const day = new Date(t).toISOString().slice(0, 10);
      while (i < points.length && points[i].time <= day) { cur = points[i]; i++; }
      out.push({ time: day, value: cur.value });
    }
    return out;
  }

  // "5 Jun 2026" from a lightweight-charts time (business day object or YYYY-MM-DD).
  function chartTipDate(time) {
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let y;
    let m;
    let d;
    if (time && typeof time === "object") {
      y = time.year; m = time.month; d = time.day;
    } else if (typeof time === "string") {
      const parts = time.split("-").map(Number);
      y = parts[0]; m = parts[1]; d = parts[2];
    } else if (typeof time === "number") {
      const dt = new Date(time * 1000);
      y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
    }
    return Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) ? `${d} ${MONTHS[m - 1] || ""} ${y}` : "";
  }

  function ProvidersChart({ providers, days }) {
    const ref = useRef(null);
    const cutoff = isoDay(Date.now() - days * DAY);
    // Every line runs the whole width: from the earliest point any market has
    // in the range to the latest, a market's first price carried back to the
    // left edge and its last price forward to the right edge (flat), so none
    // starts or stops in the middle.
    const inRange = providers.map((p) => ({ ...p, points: p.points.filter((pt) => pt.time >= cutoff) })).filter((p) => p.points.length);
    const left = inRange.reduce((m, p) => (p.points[0].time < m ? p.points[0].time : m), "9999-12-31");
    const right = inRange.reduce((m, p) => (p.points[p.points.length - 1].time > m ? p.points[p.points.length - 1].time : m), "0000-01-01");
    const drawable = inRange
      .map((p) => {
        const pts = p.points.slice();
        if (pts[0].time > left) pts.unshift({ ...pts[0], time: left });
        if (pts[pts.length - 1].time < right) pts.push({ ...pts[pts.length - 1], time: right });
        return { ...p, points: pts };
      })
      .filter((p) => p.points.length >= 2);
    useEffect(() => {
      const el = ref.current;
      const LW = window.LightweightCharts;
      if (!el || !LW || !drawable.length) return undefined;
      const { muted, border } = chartTheme();
      const chart = LW.createChart(el, {
        width: el.clientWidth || 600,
        height: el.clientHeight || 320,
        layout: { background: { type: "solid", color: "transparent" }, textColor: muted, fontFamily: "Inter, system-ui, sans-serif" },
        grid: { vertLines: { color: border }, horzLines: { color: border } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
        crosshair: { mode: 0 },
        handleScroll: false,
        handleScale: false,
      });
      const drawn = [];
      for (const p of drawable) {
        const s = chart.addLineSeries({ color: p.color, lineWidth: 2, priceLineVisible: false, priceFormat: { type: "custom", formatter: (v) => euro(v) } });
        // One point per day (last price carried forward), so the hover finds
        // every marketplace on any day, not only the days it has a sale.
        s.setData(densifyDaily(p.points).map((pt) => ({ time: pt.time, value: Number(pt.value.toFixed(2)) })));
        drawn.push({ series: s, provider: p });
      }
      chart.timeScale().fitContent();
      // The CS2 hover: every marketplace's price on the hovered day, ranked
      // (user, 2026-09-30: "on price history create me this hover in tf2, cs2
      // already has it"). Same markup and classes as item-page.tsx, so
      // item_page.css styles it.
      const tip = document.createElement("div");
      tip.className = "tv-prov-chart-tooltip";
      el.appendChild(tip);
      const onMove = (param) => {
        const pt = param && param.point;
        if (!param || !param.time || !pt || pt.x < 0 || pt.y < 0 || pt.x > el.clientWidth || pt.y > el.clientHeight) {
          tip.style.opacity = "0";
          return;
        }
        const ranked = drawn
          .map(({ series, provider }) => {
            // lightweight-charts 3.x hands prices in seriesPrices (a number per
            // series); 4.x in seriesData (the data point). Read whichever exists.
            const d = param.seriesData && param.seriesData.get ? param.seriesData.get(series) : null;
            let value = d && Number.isFinite(Number(d.value)) ? Number(d.value) : NaN;
            if (!Number.isFinite(value) && param.seriesPrices && param.seriesPrices.get) {
              const p = param.seriesPrices.get(series);
              value = Number.isFinite(Number(p)) ? Number(p) : NaN;
            }
            return { provider, value };
          })
          .filter((r) => Number.isFinite(r.value) && r.value > 0)
          .sort((a, b) => b.value - a.value || a.provider.label.localeCompare(b.provider.label));
        if (!ranked.length) {
          tip.style.opacity = "0";
          return;
        }
        const rows = ranked.map((r, i) => {
          const image = r.provider.market && r.provider.market.image ? r.provider.market.image : "";
          const icon = image
            ? `<img class="tv-prov-tooltip-icon" src="${image}" alt="" />`
            : `<span class="tv-prov-tooltip-fallback" style="background:${r.provider.color}"></span>`;
          return `<div class="tv-prov-tooltip-row"><span class="tv-prov-tooltip-rank">${i + 1}</span>${icon}<span class="tv-prov-tooltip-label">${r.provider.label}</span><span class="tv-prov-tooltip-value">${euro(r.value)}</span></div>`;
        }).join("");
        tip.innerHTML = `<div class="tv-prov-tooltip-title">${chartTipDate(param.time)}</div>${rows}`;
        const width = el.clientWidth || 0;
        tip.style.left = `${Math.max(96, Math.min(Math.max(width - 96, 96), pt.x))}px`;
        tip.style.top = `${Math.max(pt.y, 118)}px`;
        tip.style.opacity = "1";
      };
      chart.subscribeCrosshairMove(onMove);
      const stop = followSize(chart, el);
      return () => { stop(); chart.unsubscribeCrosshairMove(onMove); tip.remove(); chart.remove(); };
    }, [providers, days]);
    if (!drawable.length) {
      return <div className="tv-lw-loading"><i className="fa-solid fa-chart-line" /><span>No marketplace has two days of prices in this range yet.</span></div>;
    }
    return <div className="tv-lw-canvas tf2i-history-canvas" ref={ref} />;
  }

  /**
   * Listings per marketplace as the CS2 page draws them: one row per
   * market with its badge and name, a coloured bar scaled to the busiest
   * market and the count at the bar's end - every market listed, 0 included.
   */
  /**
   * Market distribution bars. Hovering a row shows the CS2 page's pill right
   * after the bar's end: badge, marketplace, listings and share, e.g.
   * "CSFloat 1,283 (4.0%)".
   */
  function ListingsBars({ entries }) {
    const max = Math.max(1, ...entries.map((e) => e.value));
    const total = entries.reduce((n, e) => n + e.value, 0);
    const [hover, setHover] = useState(null);
    return (
      <div className="tf2i-dist" onMouseLeave={() => setHover(null)}>
        {entries.map((e) => {
          const width = Math.max(e.value > 0 ? 3 : 0, (e.value / max) * 100);
          const share = total ? ((e.value / total) * 100).toFixed(1) : "0.0";
          return (
            <div className={`tf2i-dist-row${hover === e.id ? " is-active" : ""}`} key={e.id} onMouseEnter={() => setHover(e.id)}>
              <span className="tf2i-dist-name"><Badge market={e.market} />{e.label}</span>
              <span className="tf2i-dist-track">
                <span className="tf2i-dist-bar" style={{ width: `${width}%`, background: e.color }}>
                  {e.value > 0 ? <span className="tf2i-dist-value">{count(e.value)}</span> : null}
                </span>
                {e.value > 0 ? null : <span className="tf2i-dist-zero">0</span>}
                {hover === e.id ? (
                  <span className="tf2i-dist-pill" style={width > 70 ? { right: `calc(${100 - width}% + 64px)` } : { left: `calc(${width}% + ${e.value > 0 ? 10 : 26}px)` }} role="tooltip">
                    <Badge market={e.market} />
                    <strong>{e.label}</strong>
                    <span>{count(e.value)} ({share}%)</span>
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  /** The CS2 page's marketplace badge (item_page.css .marketplace-badge). */
  function Badge({ market }) {
    return (
      <span className="marketplace-badge compact" style={{ "--badge-accent": market.color }}>
        <img src={market.image} alt="" loading="lazy" />
      </span>
    );
  }
  /** Payment methods + KYC tag, as the CS2 comparison table shows them. */
  function PaymentIcons({ market }) {
    if (!market.payments.length && !market.kyc) return null;
    return (
      <span className="tv-market-payment-icons">
        {market.payments.map((key) => <i key={key} className={PAYMENT_META[key].icon} title={PAYMENT_META[key].label} aria-label={PAYMENT_META[key].label} />)}
        {market.kyc ? <span className="tv-market-kyc-tag" title="Identity verification (KYC) required to withdraw">KYC</span> : null}
      </span>
    );
  }
  function MarketCell({ market }) {
    return (
      <span className="tv-compare-market-cell">
        <Badge market={market} />
        {market.label}
        <PaymentIcons market={market} />
      </span>
    );
  }

  /** Native fullscreen for a chart section (the CS2 page's expand button). */
  function useFullscreen() {
    const [active, setActive] = useState("");
    useEffect(() => {
      const onChange = () => { if (!document.fullscreenElement) setActive(""); };
      document.addEventListener("fullscreenchange", onChange);
      return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);
    const toggle = (key, el) => {
      if (!el) return;
      if (document.fullscreenElement === el) { document.exitFullscreen?.(); setActive(""); return; }
      const go = () => { setActive(key); };
      const req = el.requestFullscreen ? el.requestFullscreen() : null;
      if (req && typeof req.then === "function") req.then(go).catch(() => {}); else go();
    };
    return [active, toggle];
  }

  /* ─── Watchlist + Price Alert (the CS2 item page's, user 2026-10-03) ──────
     Same localStorage keys as csprice.eu's item page, so the navbar bell and
     the profile's Watchlist panel on this host pick them up unchanged. */
  const PRICE_ALERTS_KEY = "cs2_price_alerts";
  const PRICE_NOTIFICATIONS_KEY = "cs2_price_notifications";
  const ALERT_REARM_HYSTERESIS_CENTS = 1;
  const PRICE_SYMBOL = "€";
  function readStoredArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_error) {
      return [];
    }
  }
  function writeStoredArray(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_error) {}
  }
  function normalizeAlertNumber(value) {
    const parsed = Number(String(value || "").replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  function alertPriceCents(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed * 100);
  }
  function notificationPrice(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? PRICE_SYMBOL + parsed.toFixed(2) : "current price";
  }
  function upsertPriceNotification(notification) {
    const list = readStoredArray(PRICE_NOTIFICATIONS_KEY);
    const next = [notification, ...list.filter((item) => item.id !== notification.id)].slice(0, 40);
    writeStoredArray(PRICE_NOTIFICATIONS_KEY, next);
    window.dispatchEvent(new CustomEvent("cs2:price-notifications-updated"));
  }
  function promptLogin() {
    try {
      window.dispatchEvent(new CustomEvent("cs2:open-login-modal"));
    } catch (_error) {
      window.location.href = "login.html";
    }
  }
  function evaluatePriceAlert(alert, currentPrice, allowNotifications = true) {
    const price = Number(currentPrice);
    if (!Number.isFinite(price) || price <= 0 || !alert) return alert;

    const priceCents = alertPriceCents(price);
    const minCents = alert.min != null ? alertPriceCents(alert.min) : null;
    const maxCents = alert.max != null ? alertPriceCents(alert.max) : null;
    if (priceCents == null) return alert;

    let triggerType = "";
    let thresholdCents = null;
    if (maxCents != null && priceCents > maxCents) {
      triggerType = "above";
      thresholdCents = maxCents;
    } else if (minCents != null && priceCents < minCents) {
      triggerType = "below";
      thresholdCents = minCents;
    }

    if (!triggerType) {
      const prevKey = String(alert.lastTriggerKey || "");
      let stillLatched = false;
      if (prevKey.startsWith("above:") && maxCents != null) {
        stillLatched = priceCents >= (maxCents - ALERT_REARM_HYSTERESIS_CENTS);
      } else if (prevKey.startsWith("below:") && minCents != null) {
        stillLatched = priceCents <= (minCents + ALERT_REARM_HYSTERESIS_CENTS);
      }
      return {
        ...alert,
        currentPrice: price,
        lastTriggerKey: stillLatched ? prevKey : "",
      };
    }

    const threshold = thresholdCents / 100;
    const triggerKey = triggerType + ":" + threshold.toFixed(2);
    const alreadyLatched = alert.lastTriggerKey === triggerKey;
    if (allowNotifications && !alreadyLatched) {
      const direction = triggerType === "above" ? "rose above" : "dropped below";
      upsertPriceNotification({
        id: alert.key + ":" + triggerKey,
        title: alert.title || "Price alert",
        message: `${alert.sourceLabel || "Market"} price ${direction} ${notificationPrice(threshold)}. Now ${notificationPrice(price)}.`,
        href: alert.href || window.location.href,
        createdAt: Date.now(),
        read: false,
        direction: triggerType === "above" ? "up" : "down",
      });
    }

    return {
      ...alert,
      currentPrice: price,
      triggeredAt: alreadyLatched ? alert.triggeredAt : Date.now(),
      lastTriggerKey: triggerKey,
    };
  }

  function ItemPriceAlertModal({ itemName, sourceLabel, existingAlert, currentPrice, onClose, onSave }) {
    const hasCurrent = Number.isFinite(currentPrice) && currentPrice > 0;
    const currentDisplay = hasCurrent
      ? (currentPrice < 1 ? currentPrice.toFixed(4) : currentPrice.toFixed(2))
      : "";
    const [minPrice, setMinPrice] = useState(existingAlert?.min != null ? String(existingAlert.min) : "");
    const [maxPrice, setMaxPrice] = useState(existingAlert?.max != null ? String(existingAlert.max) : "");
    const [error, setError] = useState("");

    useEffect(() => {
      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          onClose();
        }
      };

      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }, [onClose]);

    const handleSave = () => {
      const min = normalizeAlertNumber(minPrice);
      const max = normalizeAlertNumber(maxPrice);

      if (min === null && max === null) {
        setError("Enter at least one price threshold.");
        return;
      }

      if (min != null && max != null && min >= max) {
        setError("Minimum must be lower than maximum.");
        return;
      }

      if (hasCurrent) {
        const currentCents = alertPriceCents(currentPrice);
        const minCents = min != null ? alertPriceCents(min) : null;
        const maxCents = max != null ? alertPriceCents(max) : null;
        if (maxCents != null && currentCents != null && currentCents > maxCents) {
          setError(`Maximum must be above the current price (${PRICE_SYMBOL}${currentDisplay}).`);
          return;
        }
        if (minCents != null && currentCents != null && currentCents < minCents) {
          setError(`Minimum must be below the current price (${PRICE_SYMBOL}${currentDisplay}).`);
          return;
        }
      }

      setError("");
      onSave({
        min,
        max,
        email: String(existingAlert?.email || "").trim(),
      });
    };

    return (
      <div className="tv-overlay" onClick={function(event){ if (event.target === event.currentTarget) onClose(); }}>
        <div className="tv-modal tv-alert-modal" onClick={function(event){ event.stopPropagation(); }}>
          <div className="tv-modal-hdr">
            <div className="tv-alert-head">
              <div>
                <h3>Price Alert</h3>
                <p className="tv-modal-item">{itemName} · {sourceLabel}</p>
              </div>
            </div>
            <button type="button" className="tv-modal-x" onClick={onClose} aria-label="Close">
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
          <div className="tv-alert-fields">
            <label className="tv-alert-label">Minimum Price (€)</label>
            <input
              className="tv-alert-input"
              type="text"
              inputMode="decimal"
              placeholder={hasCurrent ? `e.g. ${(currentPrice - 0.05).toFixed(2)} — notify when price drops below` : "Notify when price drops below this"}
              value={minPrice}
              onChange={function(event){ setMinPrice(event.target.value); }}
            />
            <label className="tv-alert-label">Maximum Price (€)</label>
            <input
              className="tv-alert-input"
              type="text"
              inputMode="decimal"
              placeholder={hasCurrent ? `e.g. ${(currentPrice + 0.05).toFixed(2)} — notify when price rises above` : "Notify when price rises above this"}
              value={maxPrice}
              onChange={function(event){ setMaxPrice(event.target.value); }}
            />
            {error && <div className="tv-chart-note"><i className="fa-solid fa-circle-info" /> {error}</div>}
          </div>
          <div className="tv-alert-actions">
            <button type="button" className="tv-alert-btn secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="tv-alert-btn primary" onClick={handleSave}>
              <i className="fa-solid fa-bell" aria-hidden="true" />
              Set Alert
            </button>
          </div>
        </div>
      </div>
    );
  }


  function Tf2ItemPage() {
    const params = useMemo(() => new URLSearchParams(window.location.search), []);
    // The clean item pages (tf2/<category>/<slug>/) carry the item in the
    // route; tf2-item.html?item=&e=&b= still works.
    const route = (typeof window !== "undefined" && window.__TF2_ROUTE__) || null;
    const name = String((route && route.n) || params.get("item") || "").trim();
    const effect = String((route && route.n ? route.e : params.get("e")) || "").trim();
    const base = route && route.n ? (Number.isFinite(Number(route.b)) ? Number(route.b) : -1) : (params.get("b") !== null && Number.isFinite(Number(params.get("b"))) ? Number(params.get("b")) : -1);
    const [shard, setShard] = useState(null);
    const [error, setError] = useState(name ? "" : "No item given.");
    // Community Ideas (the CS2 item page's social section, react/community-ideas.jsx)
    // needs the signed-in user for posting.
    const session = typeof useSteamSession === "function" ? useSteamSession() : { authenticated: false, user: null };
    const socialName = effect ? `${effect.replace(/^\u2605\s*/, "")} ${name}` : name;
    // Similar items to buy (tf2_similar.php: same category, closest price,
    // liquid first) - the CS2 page's "More … finishes" strip for TF2
    // (user, 2026-10-03).
    const [similar, setSimilar] = useState([]);
    useEffect(() => {
      if (!name) return undefined;
      let alive = true;
      // One row of four (user, 2026-10-03: "just one line").
      const q = new URLSearchParams({ item: name, e: effect, limit: "4" });
      fetch(`tf2_similar.php?${q.toString()}`, { credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => { if (alive) setSimilar(Array.isArray(json && json.items) ? json.items : []); })
        .catch(() => { if (alive) setSimilar([]); });
      return () => { alive = false; };
    }, [name, effect]);
    const [steamHistory, setSteamHistory] = useState(null);
    const [source, setSource] = useState("steam");
    const [range, setRange] = useState("ALL");
    const [historyRange, setHistoryRange] = useState("90D");
    const [hiddenProviders, setHiddenProviders] = useState(() => new Set());
    const [compareTab, setCompareTab] = useState("");
    const [copied, setCopied] = useState(false);
    const [fullscreen, toggleFullscreen] = useFullscreen();
    const mainPanelRef = useRef(null);
    const historyRef = useRef(null);

    useEffect(() => {
      if (!name) return undefined;
      let alive = true;
      // The shard is picked from the base index; a URL without one (typed
      // by hand, or a link that only carries the name) is resolved through
      // the catalog, which knows the item's base, and then its shard.
      const found = (data) => data && data.items.some((r) => r.n === name);
      loadShard(shardKey(base, name))
        .then(async (data) => {
          if (found(data)) return data;
          const res = await fetch("assets/data/tf2/catalog.json.gz", { credentials: "same-origin" });
          if (!res.ok || !res.body) return data;
          const catalog = JSON.parse(await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text());
          const hit = catalog.items.find((r) => r.n === name && (r.e || "") === effect) || catalog.items.find((r) => r.n === name);
          if (!hit) return data;
          const key = shardKey(typeof hit.b === "number" ? hit.b : -1, name);
          return key === shardKey(base, name) ? data : loadShard(key);
        })
        .then((data) => { if (alive) setShard(data); })
        .catch((err) => { if (alive) setError(err.message || "Could not load the item."); });
      return () => { alive = false; };
    }, [name, base]);

    const rawRow = useMemo(() => {
      if (!shard) return null;
      return shard.items.find((r) => r.n === name && (r.e || "") === effect) || shard.items.find((r) => r.n === name) || null;
    }, [shard, name, effect]);
    // An unusual's effect row only carries Mannco (effect-specific) data;
    // Steam, Skinport and DMarket list the item under its plain name with
    // every effect together. Those prices, counts and history are borrowed
    // from the plain row so every market shows a figure; `fromBase` says
    // which keys were borrowed (the table notes "any effect" on them).
    const row = useMemo(() => {
      if (!rawRow || !rawRow.e) return rawRow;
      const base = shard.items.find((r) => r.n === rawRow.n && !r.e);
      if (!base) return rawRow;
      const merged = { ...base, ...Object.fromEntries(Object.entries(rawRow).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== 0)) };
      merged.e = rawRow.e;
      merged.fromBase = new Set(Object.keys(base).filter((k) => ["s", "k", "d", "l", "kq", "dq", "h", "sk"].includes(k) && (rawRow[k] === undefined || rawRow[k] === null || rawRow[k] === 0)));
      return merged;
    }, [rawRow, shard]);

    // Steam's own history for the item: Steam lists effect-less names; an
    // unusual is looked up by its plain name (Steam's listing is per effect
    // only in the wider search).
    useEffect(() => {
      if (!row) return undefined;
      let alive = true;
      setSteamHistory(null);
      loadSteamHistory(row.n).then((points) => { if (alive) setSteamHistory(points); }).catch(() => { if (alive) setSteamHistory([]); });
      return () => { alive = false; };
    }, [row]);

    // Default to the cheapest market that has a price, Steam when it does.
    useEffect(() => {
      if (!row) return;
      const b = bestOf(row);
      if (has(row.s)) setSource("steam");
      else if (b) setSource(b.market.id);
      setCompareTab(b ? b.market.id : "steam");
      document.title = `${row.e ? `${row.e.replace(/^★\s*/, "")} ` : ""}${row.n} – TF2 Prices | TFPRICE`;
    }, [row]);

    const wears = useMemo(() => {
      if (!row || !wearOf(row.n)) return [];
      const stem = stripWear(row.n);
      return WEARS.map((w) => shard.items.find((r) => r.n === `${stem} (${w})` && (r.e || "") === (row.e || ""))).filter(Boolean);
    }, [shard, row]);

    const market = marketOf(source);
    // Watchlist + price alerts: keyed by the item's full name (effect first).
    const alertKey = `tf2:${socialName}`;
    const [watchlist, setWatchlist] = useState(() => readStoredArray("cs2_watchlist"));
    const onWatchlist = watchlist.some((w) => w.key === alertKey);
    const [alertModalOpen, setAlertModalOpen] = useState(false);
    const existingAlert = readStoredArray(PRICE_ALERTS_KEY).find((item) => item.key === alertKey) || null;
    const isAuthenticated = Boolean(session && session.authenticated);
    const toggleWatchlist = () => {
      if (!isAuthenticated) { promptLogin(); return; }
      setWatchlist((prev) => {
        const exists = prev.some((w) => w.key === alertKey);
        const next = exists
          ? prev.filter((w) => w.key !== alertKey)
          : prev.concat([{
            key: alertKey,
            title: socialName,
            wear: "",
            addedAt: Date.now(),
            itemId: alertKey,
            image: (row && typeof imageFor === "function" && shard) ? imageFor(row, shard) : "",
            href: window.location.href,
            marketHashName: socialName,
            game: "tf2",
          }]);
        writeStoredArray("cs2_watchlist", next);
        return next;
      });
    };
    const currentAlertPrice = row && Number(row[market.key]) > 0 ? Number(row[market.key]) : (row && Number(row.s) > 0 ? Number(row.s) : null);
    const handleSavePriceAlert = ({ min, max, email }) => {
      if (!isAuthenticated) { promptLogin(); return; }
      const current = Number(currentAlertPrice);
      const alerts = readStoredArray(PRICE_ALERTS_KEY);
      const alert = {
        key: alertKey,
        title: socialName,
        itemId: alertKey,
        wear: "",
        source: market.id,
        sourceLabel: market.short,
        min,
        max,
        email,
        currentPrice: Number.isFinite(current) && current > 0 ? current : null,
        href: window.location.href,
        image: (row && typeof imageFor === "function" && shard) ? imageFor(row, shard) : "",
        createdAt: Date.now(),
        lastTriggerKey: "",
        game: "tf2",
      };
      const checkedAlert = Number.isFinite(current) && current > 0 ? evaluatePriceAlert(alert, current, false) : alert;
      const next = [checkedAlert, ...alerts.filter((item) => item.key !== alertKey)].slice(0, 80);
      writeStoredArray(PRICE_ALERTS_KEY, next);
      window.dispatchEvent(new CustomEvent("cs2:price-alerts-updated"));
      setAlertModalOpen(false);
    };
    // An existing alert is checked against today's price when the page opens.
    useEffect(() => {
      if (!isAuthenticated || !(Number(currentAlertPrice) > 0)) return undefined;
      const alerts = readStoredArray(PRICE_ALERTS_KEY);
      let changed = false;
      const next = alerts.map((alert) => {
        if (alert.key !== alertKey) return alert;
        const evaluated = evaluatePriceAlert(alert, currentAlertPrice, true);
        if (evaluated.lastTriggerKey !== alert.lastTriggerKey || evaluated.triggeredAt !== alert.triggeredAt || evaluated.currentPrice !== alert.currentPrice) changed = true;
        return evaluated;
      });
      if (changed) {
        writeStoredArray(PRICE_ALERTS_KEY, next);
        window.dispatchEvent(new CustomEvent("cs2:price-alerts-updated"));
      }
      return undefined;
    }, [isAuthenticated, currentAlertPrice, alertKey]);
    const allPoints = useMemo(() => (row ? seriesFor(row, source, steamHistory) : []), [row, source, steamHistory]);
    const rangeDays = (RANGES.find((r) => r[0] === range) || RANGES[2])[1];
    const points = useMemo(() => (rangeDays ? allPoints.filter((p) => p.time >= isoDay(Date.now() - rangeDays * DAY)) : allPoints), [allPoints, rangeDays]);
    const rangeDelta = points.length >= 2 ? ((points[points.length - 1].value - points[0].value) / points[0].value) * 100 : 0;
    const badges = [["24H", 1], ["7D", 7], ["30D", 30], ["90D", 90]].map(([label, days]) => ({ label, d: deltaFor(allPoints, days) }));
    // Every market is a provider; one without a listing today has no
    // points and shows muted in the legend.
    const providers = useMemo(() => (row
      ? MARKETS.map((m) => ({ id: m.id, label: m.label, color: m.color, market: m, points: seriesFor(row, m.id, steamHistory) }))
      : []), [row, steamHistory]);
    const visibleProviders = providers.filter((p) => !hiddenProviders.has(p.id));
    const historyDays = (HISTORY_RANGES.find((r) => r[0] === historyRange) || HISTORY_RANGES[1])[1];
    const historyPoints = providers.reduce((n, p) => n + p.points.length, 0);
    const listingEntries = row
      ? MARKETS.map((m) => ({ id: m.id, label: m.label, value: m.qty && has(row[m.qty]) ? row[m.qty] : 0, price: has(row[m.key]) ? row[m.key] : 0, color: m.distColor || m.color, market: m })).sort((a, b) => b.value - a.value)
      : [];
    const listingTotal = listingEntries.reduce((n, e) => n + e.value, 0);
    const compareRows = row ? MARKETS.map((m) => {
      const ask = has(row[m.key]) ? row[m.key] : 0;
      const feeCut = ask * (m.fee / 100);
      return {
        market: m, id: m.id, label: m.label, ask, feePct: ask ? m.fee : 0, feeCut, net: ask ? ask - feeCut : 0,
        listings: m.qty && has(row[m.qty]) ? row[m.qty] : 0,
        vsSteam: ask && has(row.s) && m.id !== "steam" ? ((ask / row.s) - 1) * 100 : (m.id === "steam" && ask ? 0 : null),
        url: m.url(row),
      };
    }) : [];
    const cheapestCompare = compareRows.filter((r) => r.ask > 0).sort((a, b) => a.ask - b.ask)[0] || null;
    const activeCompare = compareRows.find((r) => r.id === compareTab) || cheapestCompare;

    if (error || (shard && !row)) {
      return <Layout><div className="tf2-shell"><p className="tf2-empty">{error || "This item is not in the TF2 catalog."} <a href="tf2/market/">Back to the Market Explorer</a></p></div></Layout>;
    }
    if (!row) return <Layout><div className="tf2-shell"><p className="tf2-empty">Loading…</p></div></Layout>;

    const img = imageFor(row, shard);
    const best = bestOf(row);
    const cta = has(row.s) ? { market: MARKETS[0], price: row.s } : (best ? { market: best.market, price: best.price } : { market: MARKETS[0], price: null });
    const baseInfo = row.b >= 0 ? shard.bases[row.b] : null;
    const current = row[market.key];
    const steamLoaded = Array.isArray(steamHistory);
    const steamDays = steamLoaded ? steamHistory.length : 0;
    const share = () => {
      try { navigator.clipboard.writeText(window.location.href); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch (_e) { /* ignore */ }
    };
    const toggleProvider = (id) => setHiddenProviders((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    const chartNote = source === "steam"
      ? (!steamLoaded ? "Loading Steam's price history…" : (steamDays >= 2 ? `Steam Community Market sales, ${count(steamDays)} days of history.` : "Steam has no sales history for this item yet; the chart uses the daily snapshots recorded since 2026-09-27."))
      : `${market.label} prices are recorded daily since 2026-09-28${source === "skinport" ? ", with Skinport's 90 / 30 / 7-day sales averages behind them" : ""}.`;

    return (
      <Layout>
        <div className="tv-page tf2i-page">
          <div className="tv-header-bar">
            <div className="tv-header-identity">
              <div className="tv-header-collection">
                <span>{LABEL[row.g] || "Item"}{baseInfo && baseInfo[2] ? ` · ${baseInfo[2]}` : ""}{row.e ? ` · ${row.e.replace(/^★\s*/, "")}` : ""}</span>
              </div>
              {/* The unusual effect is part of the name, as Mannco writes it. */}
              <h1 className="tv-header-title">{row.e ? `${row.e.replace(/^★\s*/, "")} ${row.n}` : row.n}</h1>
            </div>
            <div className="tv-header-actions">
              <button type="button" className={`tv-hdr-btn${onWatchlist ? " active" : ""}`} onClick={toggleWatchlist}>
                <i className={onWatchlist ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark"} /> {onWatchlist ? "Added" : "Watchlist"}
              </button>
              <button type="button" className="tv-hdr-btn" onClick={() => { if (!isAuthenticated) { promptLogin(); return; } setAlertModalOpen(true); }}>
                <i className="fa-solid fa-bell" /> Price Alert
              </button>
              <a className="tv-hdr-btn" href={`tf2.html?ask=${encodeURIComponent(`Is ${row.n} a good buy right now?`)}`}><i className="fa-solid fa-robot" /> Ask Dell</a>
              <button type="button" className="tv-hdr-btn" onClick={share}><i className="fa-solid fa-share-nodes" /> {copied ? "Copied" : "Share"}</button>
              {/* No Steam button here: the market table and the CTA below already link
                  to the listing (user, 2026-10-03). */}
            </div>
          </div>

          <div className="tv-hero">
            <div className="tv-skin-panel">
              <div className={`tv-skin-viewer-wrap type-tf2${row.e || /^Unusual\b/.test(row.n) ? " is-unusual" : ""}`}>
                {img ? <img className="tv-skin-img" src={img} alt={row.n} decoding="async" referrerPolicy="no-referrer" /> : null}
              </div>

              {wears.length > 1 ? (
                <div className="tv-quality-table tv-quality-table--tabbed tv-quality-table--no-st tv-quality-table--no-sv">
                  <div className="tv-quality-hdr">
                    <span>Wear</span>
                    <span className={`tv-qr-market source-${market.id}`}>{market.short}</span>
                  </div>
                  {wears.map((r) => (
                    <div key={r.n} className={`tv-quality-row tv-quality-row--tabbed${r.n === row.n ? " active" : ""}`}>
                      <a className="tv-qr-wear-btn" href={itemHref(r)}>{wearOf(r.n)}</a>
                      <a className={`tv-qr-market-price source-${market.id}${has(r[market.key]) ? "" : " is-empty"}`} href={has(r[market.key]) ? market.url(r) : itemHref(r)} target={has(r[market.key]) ? "_blank" : undefined} rel="noopener noreferrer">{euro(r[market.key])}</a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tv-quality-table tv-quality-table--tabbed tv-quality-table--no-st tv-quality-table--no-sv">
                  <div className="tv-quality-hdr">
                    <span>Market</span>
                    <span className="tv-qr-market">Price</span>
                  </div>
                  {MARKETS.map((m) => {
                    const p = row[m.key];
                    const q = m.qty ? row[m.qty] : null;
                    return (
                      <div key={m.id} className={`tv-quality-row tv-quality-row--tabbed${source === m.id ? " active" : ""}`}>
                        <button type="button" className="tv-qr-wear-btn" onClick={() => setSource(m.id)}>{m.label}{has(q) ? <span className="tf2i-qty"> · {count(q)} listed</span> : null}{row.fromBase && row.fromBase.has(m.key) && has(p) ? <span className="tf2i-qty"> · any effect</span> : null}</button>
                        <a className={`tv-qr-market-price${has(p) ? "" : " is-empty"}`} href={m.url(row)} target="_blank" rel="noopener noreferrer">{euro(p)}</a>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="tv-skin-ctas">
                {/* Steam by default (the reference market); the cheapest
                    other market only when Steam has no listing. */}
                <a className={`tv-cta market-source source-${cta.market.id}`} href={cta.market.url(row)} target="_blank" rel="noopener noreferrer">
                  Buy on {cta.market.label}{cta.price ? ` (${euro(cta.price)})` : ""}
                </a>
              </div>
              <div className="tv-skin-meta">
                <div className="tv-meta-row"><span className="tv-meta-label">Category</span><span className="tv-meta-val">{LABEL[row.g] || "—"}</span></div>
                {baseInfo && baseInfo[2] ? <div className="tv-meta-row"><span className="tv-meta-label">Type</span><span className="tv-meta-val">{baseInfo[2]}</span></div> : null}
                {row.e ? <div className="tv-meta-row"><span className="tv-meta-label">Effect</span><span className="tv-meta-val">{row.e.replace(/^★\s*/, "")}</span></div> : null}
                <div className="tv-meta-row"><span className="tv-meta-label">Steam listings</span><span className="tv-meta-val">{row.l ? count(row.l) : "—"}</span></div>
              </div>
            </div>

            <div className="tv-chart-slot">
              <div className={`tv-chart-panel tv-chart-panel--${source}${fullscreen === "main" ? " is-native-fullscreen" : ""}`} ref={mainPanelRef}>
                <div className="tv-chart-hdr">
                  <div className="tv-chart-price-block">
                    <div className="tv-chart-price">{euro(points.length ? points[points.length - 1].value : current)}</div>
                    <div className={`tv-chart-delta ${toneClass(rangeDelta)}`}>
                      {points.length >= 2 ? `${rangeDelta >= 0 ? "+" : ""}${rangeDelta.toFixed(2)}%` : "—"}
                      <span className="tv-chart-range-label">({range === "ALL" ? "Max" : range})</span>
                    </div>
                  </div>
                  <div className="tv-trend-badges">
                    {badges.map((b) => (
                      <span key={b.label} className={`tv-trend-badge ${b.d ? toneClass(b.d.pct) : "flat"}`} title={b.d && b.d.basis === "avg" ? `Against Skinport's ${b.label.toLowerCase()} sales average` : undefined}>
                        <span className="tv-tbadge-label">{b.label}</span>
                        {b.d ? `${b.d.pct >= 0 ? "+" : ""}${b.d.pct.toFixed(2)}%` : "—"}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="tv-toolbar">
                  <div className="tv-toolbar-group tv-toolbar-group--sources">
                    {MARKETS.map((m) => (
                      <button key={m.id} type="button" className={`tv-tb-btn source-${m.id}${source === m.id ? " active" : ""}`} onClick={() => setSource(m.id)}>{m.short}</button>
                    ))}
                  </div>
                  <div className="tv-toolbar-sep" />
                  <div className="tv-toolbar-group-range">
                    <div className="tv-toolbar-group">
                      {RANGES.map(([r]) => (
                        <button key={r} type="button" className={`tv-tb-btn${range === r ? " active" : ""}`} onClick={() => setRange(r)}>{r === "ALL" ? "Max" : r}</button>
                      ))}
                    </div>
                    <button type="button" className={`tv-fullscreen-btn${fullscreen === "main" ? " active" : ""}`} onClick={() => toggleFullscreen("main", mainPanelRef.current)} title="Toggle fullscreen" aria-label="Toggle fullscreen">
                      <i className={`fa-solid ${fullscreen === "main" ? "fa-compress" : "fa-expand"}`} />
                    </button>
                  </div>
                </div>
                <div className="tv-lw-stage">
                  <div className={`tv-lw-wrap tv-lw-wrap--${source}`}>
                    {points.length < 2 ? (
                      <div className="tv-lw-loading"><i className="fa-solid fa-chart-line" /><span>{source === "steam" && !steamLoaded ? "Loading Steam's price history…" : (has(current) ? `${market.label}: ${euro(current)} today. More points arrive daily.` : `No ${market.label} listing for this item.`)}</span></div>
                    ) : null}
                    {points.length >= 2 ? <PriceChart points={points} marketId={source} range={range} /> : <div className="tv-lw-canvas" style={{ minHeight: 320 }} />}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`tv-chart-section tv-full-section tv-price-history-section tv-anim-up${fullscreen === "history" ? " is-native-fullscreen" : ""}`} ref={historyRef}>
            <div className="tv-section-row">
              <div>
                <h2 className="tv-section-title">Price history</h2>
                <p className="tv-section-subtitle">Historical market data for {row.n} across marketplaces.</p>
              </div>
              <div className="tv-section-actions">
                <div className="tv-data-pill"><i className="fa-solid fa-circle-info" /> {providers.filter((p) => p.points.length).length} provider{providers.filter((p) => p.points.length).length === 1 ? "" : "s"} · {count(historyPoints)} data point{historyPoints === 1 ? "" : "s"}</div>
                <button type="button" className={`tv-fullscreen-btn${fullscreen === "history" ? " active" : ""}`} onClick={() => toggleFullscreen("history", historyRef.current)} title="Toggle fullscreen" aria-label="Toggle fullscreen">
                  <i className={`fa-solid ${fullscreen === "history" ? "fa-compress" : "fa-expand"}`} />
                </button>
              </div>
            </div>
            <div className="tv-chart-control-row">
              <div className="tv-price-history-controls">
                <div className="tv-range-pills">
                  {HISTORY_RANGES.map(([r]) => (
                    <button key={r} type="button" className={`tv-range-pill${historyRange === r ? " active" : ""}`} onClick={() => setHistoryRange(r)}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="tv-prov-legend">
              {providers.map((p) => (
                <button type="button" key={p.id} className={`tv-prov-pill${hiddenProviders.has(p.id) || !p.points.length ? " muted" : ""}`} onClick={() => toggleProvider(p.id)} title={p.points.length ? undefined : `No ${p.label} listing today`}>
                  <span className="tv-prov-dot" style={{ background: p.color }} aria-hidden="true" />
                  <Badge market={p.market} />
                  {p.label}
                </button>
              ))}
            </div>
            <div className="tv-big-canvas tv-provider-canvas">
              <ProvidersChart providers={visibleProviders} days={historyDays} />
            </div>
          </div>

          <div className="tv-chart-section tv-full-section tv-market-dist-card tv-market-dist-card--horizontal tv-anim-up">
            <div className="tv-section-row">
              <div>
                <h2 className="tv-section-title">Market distribution for {row.n}</h2>
              </div>
              <div className="tv-data-pill"><i className="fa-solid fa-circle-info" /> {count(listingTotal)} listings · {listingEntries.filter((e) => e.value > 0).length} market{listingEntries.filter((e) => e.value > 0).length === 1 ? "" : "s"}</div>
            </div>
            <div className="tv-market-dist-row tv-market-dist-row--hbar">
              <div className="tv-dist-hbar-wrap" aria-label="Listings per marketplace">
                <ListingsBars entries={listingEntries} />
              </div>
            </div>
          </div>

          <div className="tv-chart-section tv-full-section tv-market-compare-section tv-anim-up">
            <div className="tv-section-row">
              <div>
                <h2 className="tv-section-title">Marketplace comparison</h2>
                <p className="tv-section-subtitle">Live asks and seller fee cuts for {row.n}.</p>
              </div>
            </div>
            <div className="tv-chart-control-row">
              <div className="tv-range-pills">
                {compareRows.map((r) => (
                  <button key={r.id} type="button" className={`tv-range-pill${compareTab === r.id ? " active" : ""}`} onClick={() => setCompareTab(r.id)}>{r.market.short}</button>
                ))}
              </div>
            </div>
            {activeCompare ? (
              <div className="tv-compare-hero">
                <div className="tv-compare-hero-market">
                  <span className="tv-compare-market-cell">
                    <Badge market={activeCompare.market} />
                    <span className="tv-compare-hero-name"><strong>{activeCompare.label}</strong></span>
                    <PaymentIcons market={activeCompare.market} />
                  </span>
                </div>
                <div><strong>{activeCompare.ask > 0 ? euro(activeCompare.ask) : "—"}</strong><span>Price</span></div>
                <div><strong>{activeCompare.feePct > 0 ? `${activeCompare.feePct.toFixed(1)}%` : "—"}</strong><span>Fee</span></div>
                <div><strong>{activeCompare.feeCut > 0 ? euro(activeCompare.feeCut) : "—"}</strong><span>Cut</span></div>
                <div><strong>{activeCompare.net > 0 ? euro(activeCompare.net) : "—"}</strong><span>Total</span></div>
                <div><strong>{activeCompare.listings > 0 ? count(activeCompare.listings) : "—"}</strong><span>Listings</span></div>
                <div className="tv-compare-hero-vs">
                  <strong className={activeCompare.vsSteam == null ? "" : (activeCompare.vsSteam <= 0 ? "is-down" : "is-up")}>
                    {activeCompare.vsSteam == null ? "—" : `${activeCompare.vsSteam > 0 ? "+" : ""}${activeCompare.vsSteam.toFixed(1)}%`}
                  </strong>
                  <span>vs Steam</span>
                </div>
              </div>
            ) : null}
            <div className="tv-compare-table" role="table">
              <div className="tv-compare-table-head" role="row">
                <span>Market</span><span>Price</span><span>Fee</span><span>Cut</span><span>Total</span><span>Listings</span><span>vs Steam</span>
              </div>
              {compareRows.map((r) => {
                const isBest = cheapestCompare && r.id === cheapestCompare.id && r.ask > 0;
                return (
                  <button type="button" key={r.id} role="row" title={`Open ${r.label}`}
                    className={`tv-compare-table-row${compareTab === r.id ? " active" : ""}${isBest ? " is-best" : ""}${r.ask > 0 ? "" : " is-unlisted"}`}
                    onClick={() => { setCompareTab(r.id); window.open(r.url, "_blank", "noopener,noreferrer"); }}>
                    <MarketCell market={r.market} />
                    <span data-label="Price">{r.ask > 0 ? euro(r.ask) : <span className="tv-compare-unlisted">Not listed</span>}</span>
                    <span data-label="Fee">{r.feePct > 0 ? `${r.feePct.toFixed(1)}%` : "—"}</span>
                    <span data-label="Cut">{r.feeCut > 0 ? euro(r.feeCut) : "—"}</span>
                    <span data-label="Total">{r.net > 0 ? euro(r.net) : "—"}</span>
                    <span data-label="Listings">{r.listings > 0 ? count(r.listings) : "—"}</span>
                    <span data-label="vs Steam" className={`tv-compare-vs-cell${r.vsSteam == null ? "" : (r.vsSteam <= 0 ? " is-down" : " is-up")}`}>
                      {r.vsSteam == null ? "—" : `${r.vsSteam > 0 ? "+" : ""}${r.vsSteam.toFixed(1)}%`}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="tf2i-section-note">Fee = the seller's cut on that market (Steam 5% + 10% TF2, Skinport 12%, Mannco.store 5%, DMarket 7%, rounded); Total is what a seller keeps at the listed ask.</p>
          </div>

          {similar.length ? (
            <div className="tv-chart-section tv-full-section tv-related-finishes-section tv-anim-up">
              <div className="tv-section-row">
                <div>
                  <h2 className="tv-section-title">Similar items</h2>
                  <p className="tv-section-subtitle">{effect ? "Other unusual hats around this price." : `Other ${(row && LABEL[row.g]) ? LABEL[row.g].toLowerCase() + "s" : "items"} around this price.`}</p>
                </div>
                <a className="tv-related-finishes-all" href={row && row.g ? `tf2-market.html?cat=${encodeURIComponent(row.g)}` : "tf2-market.html"}>
                  All <i className="fa-solid fa-arrow-right" />
                </a>
              </div>
              <div className="tv-related-finishes-grid">
                {similar.map((item, index) => (
                  <a
                    key={`${item.name}|${item.effect}`}
                    className="tv-contents-card"
                    href={item.href}
                    style={{ "--rarity-accent": `#${item.color || "94A3B8"}`, "--card-delay": `${Math.min(index, 24) * 35}ms` }}
                    title={`Open ${item.display_name}`}
                  >
                    <div className="tv-contents-card-media">
                      {item.image ? <img src={item.image} alt={item.display_name} loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <span className="tf2-card-noimg" aria-hidden="true">TF2</span>}
                    </div>
                    <div className="tv-contents-card-copy">
                      <h3>{item.display_name}</h3>
                      <p className="tv-contents-card-sub">{item.listings > 0 ? `${item.listings.toLocaleString("en-US")} listed on Steam` : ""}</p>
                      <div className="tv-contents-card-price-line">
                        <strong>{item.price > 0 ? euro(item.price) : "\u2014"}</strong>
                      </div>
                      <div className="tv-contents-card-foot">
                        <span>{LABEL[item.group] || ""}</span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {/* Community Ideas, the same section as on the CS2 item page
              (user, 2026-10-03: "add the community ideas to the tf2 items"). */}
          {name && window.CS2React && window.CS2React.CommunityIdeas ? (
            <window.CS2React.CommunityIdeas
              itemName={socialName}
              itemTitle={socialName}
              steamSession={session && session.authenticated ? session.user : null}
              priceSymbol="€"
            />
          ) : null}

          {alertModalOpen ? (
            <ItemPriceAlertModal
              itemName={socialName}
              sourceLabel={market.short}
              existingAlert={existingAlert}
              currentPrice={currentAlertPrice}
              onClose={() => setAlertModalOpen(false)}
              onSave={handleSavePriceAlert}
            />
          ) : null}
        </div>
      </Layout>
    );
  }

  mountPage(<Tf2ItemPage />);
})();
