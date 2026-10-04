(() => {
  (() => {
    const { useEffect, useMemo, useState } = React;
    const { Layout, mountPage } = window.CS2React;
    const RUN_OPTIONS = [1, 3, 5, 10, 25, 50, 75, 100];
    const euro = (v) => typeof v === "number" ? new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(v) : "—";
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const has = (pools, key) => Boolean(key && pools[key] && pools[key].length);
    const TF2_URL_FOLD = { "À": "a", "Á": "a", "Â": "a", "Ã": "a", "Ä": "a", "Å": "a", "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a", "Ç": "c", "ç": "c", "È": "e", "É": "e", "Ê": "e", "Ë": "e", "è": "e", "é": "e", "ê": "e", "ë": "e", "Ì": "i", "Í": "i", "Î": "i", "Ï": "i", "ì": "i", "í": "i", "î": "i", "ï": "i", "Ñ": "n", "ñ": "n", "Ò": "o", "Ó": "o", "Ô": "o", "Õ": "o", "Ö": "o", "Ø": "o", "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o", "ø": "o", "Ù": "u", "Ú": "u", "Û": "u", "Ü": "u", "ù": "u", "ú": "u", "û": "u", "ü": "u", "Ý": "y", "ý": "y", "ÿ": "y" };
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
    function tf2ItemHref(row, priced) {
      const ok = priced === void 0 ? tf2Priced(row) : priced;
      if (ok && row.n) {
        const seg = row.e ? "unusual" : String(row.g || "cosmetic").toLowerCase().replace(/_/g, "-");
        return `tf2/${seg}/${tf2Slug(row.n, row.e)}/`;
      }
      const p = new URLSearchParams({ item: row.n || "" });
      if (row.e) p.set("e", row.e);
      if (typeof row.b === "number" && row.b >= 0) p.set("b", String(row.b));
      return `tf2-item.html?${p.toString()}`;
    }
    const itemHref = (item) => {
      if (!item || !item.n || item.synthetic) return "";
      return tf2ItemHref({ n: item.n, e: "", g: item.g, b: typeof item.b === "number" ? item.b : -1 }, typeof item.p === "number" && item.p > 0 && Boolean(item.g));
    };
    const tierLabel = (poolKey) => String(poolKey || "").replace(/_mk(i+)$/i, (m, x) => ` Mk.${x.toUpperCase()}`).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const KIND_LABEL = { mission_weapon: "Weapon", mission_cosmetic: "Cosmetic", mvm_item: "Mann Up cosmetic" };
    function rollDrop(data) {
      const o = data.odds.mission;
      const pools = data.pools;
      const r = Math.random();
      let kind = "mission_weapon";
      if (r < o.weapon) kind = "mission_weapon";
      else if (r < o.weapon + o.cosmetic) kind = "mission_cosmetic";
      else if (o.mvm && r < o.weapon + o.cosmetic + o.mvm) kind = "mvm_item";
      else if (o.strange && pools.strange_weapon?.length) kind = "strange_weapon";
      if (!pools[kind] || !pools[kind].length) kind = pools.mission_weapon?.length ? "mission_weapon" : "mvm_item";
      return { item: pick(pools[kind]), kind };
    }
    function rollMission(data, tour, surplus, fabricatorLeft = true) {
      const pools = data.pools;
      const { item: dropItem, kind } = rollDrop(data);
      const extras = [];
      if (tour.loot.mission_parts) {
        const rolled = /* @__PURE__ */ new Map();
        const common = [...pools.battle_worn_part || [], ...pools.reinforced_part || []];
        for (let i = 0; i < 5; i += 1) {
          if (!common.length) break;
          const part = pick(common);
          const cur = rolled.get(part.n) || { part, count: 0, pristine: false };
          cur.count += 1;
          rolled.set(part.n, cur);
        }
        if (has(pools, "pristine_part") && Math.random() < (data.odds.pristine_part || 0)) {
          const part = pick(pools.pristine_part);
          const cur = rolled.get(part.n) || { part, count: 0, pristine: true };
          cur.count += 1;
          rolled.set(part.n, cur);
        }
        for (const { part, count, pristine } of rolled.values()) {
          extras.push({ item: { ...part, p: typeof part.p === "number" ? Math.round(part.p * count * 100) / 100 : part.p }, kind: pristine ? "Rare Robot Part" : `Robot Part${count > 1 ? ` ×${count}` : ""}`, rare: pristine, part: true, count, unit: typeof part.p === "number" ? part.p : null });
        }
      }
      if (fabricatorLeft && tour.loot.mission_fabricator && has(pools, tour.loot.mission_fabricator) && Math.random() < (data.odds.mission_fabricator || 0)) {
        extras.push({ item: pick(pools[tour.loot.mission_fabricator]), kind: `Rare loot · ${tierLabel(tour.loot.mission_fabricator)}`, rare: true });
      }
      if (surplus) {
        const d = rollDrop(data);
        extras.push({ item: d.item, kind: `Squad Surplus · ${KIND_LABEL[d.kind] || "Item"}`, surplus: true });
      }
      return { item: dropItem, kind: KIND_LABEL[kind] || "Item", extras };
    }
    function rollTour(data, tour) {
      const odds = data.odds;
      const pools = data.pools;
      const loot = tour.loot;
      const rewards = [];
      for (const key of loot.guaranteed || []) {
        if (has(pools, key)) rewards.push({ item: pick(pools[key]), tier: tierLabel(key), rarity: "common" });
      }
      if (loot.common && has(pools, loot.common)) {
        const rare = loot.rare && has(pools, loot.rare) && Math.random() < odds.rare_variant;
        const key = rare ? loot.rare : loot.common;
        rewards.push({ item: pick(pools[key]), tier: tierLabel(key), rarity: rare ? "rare" : "common" });
      }
      if (loot.rare_extra && has(pools, loot.rare_extra) && Math.random() < (odds.rare_extra || 0)) {
        const extra = { item: pick(pools[loot.rare_extra]), tier: tierLabel(loot.rare_extra), rarity: "rare" };
        const at = (loot.guaranteed || []).filter((key) => has(pools, key)).findIndex((key) => /_fabricator$/.test(key));
        if (/_fabricator$/.test(loot.rare_extra) && at !== -1) rewards[at] = extra;
        else rewards.push(extra);
      }
      if (loot.australium && has(pools, "australium") && Math.random() < odds.australium) {
        rewards.push({ item: pick(pools.australium), tier: "Australium", rarity: "australium" });
      }
      if (loot.pan && has(pools, "golden_pan") && Math.random() < odds.golden_pan) {
        rewards.push({ item: pick(pools.golden_pan), tier: "Golden Frying Pan", rarity: "legendary" });
      }
      return rewards;
    }
    function simulate(data, tour, runs, surplus = 0) {
      const tours = [];
      for (let t = 0; t < runs; t += 1) {
        let fabricatorLeft = true;
        const missions = tour.missions.map((name, i) => {
          const rolled = rollMission(data, tour, i < surplus, fabricatorLeft);
          if (rolled.extras.some((x) => x.rare && !x.part)) fabricatorLeft = false;
          return { name, map: Array.isArray(tour.maps) ? tour.maps[i] || "" : "", voucher: i < surplus, ...rolled };
        });
        tours.push({ index: t + 1, missions, rewards: rollTour(data, tour) });
      }
      return tours;
    }
    const value = (item) => item && typeof item.p === "number" ? item.p : 0;
    function summarize(data, tours, surplus = 0) {
      let loot = 0;
      let missionsDone = 0;
      let voucherMissions = 0;
      let australiums = 0;
      let pans = 0;
      let rare = 0;
      let best = null;
      const consider = (it) => {
        if (it && (!best || value(it) > value(best))) best = it;
      };
      for (const t of tours) {
        missionsDone += t.missions.length;
        for (const m of t.missions) {
          if (m.voucher) voucherMissions += 1;
          loot += value(m.item);
          consider(m.item);
          for (const x of m.extras) {
            loot += value(x.item);
            consider(x.item);
          }
        }
        for (const r of t.rewards) {
          loot += value(r.item);
          consider(r.item);
          if (r.rarity === "australium") australiums += 1;
          if (r.rarity === "legendary") pans += 1;
          if (r.rarity === "rare") rare += 1;
        }
      }
      const vouchers = voucherMissions;
      const tickets = missionsDone - voucherMissions;
      const voucherCost = vouchers && typeof data.voucher_eur === "number" ? vouchers * data.voucher_eur : 0;
      const cost = typeof data.ticket_eur === "number" ? tickets * data.ticket_eur + voucherCost : null;
      return { loot, missions: missionsDone, tickets, vouchers, voucherCost, cost, net: cost === null ? null : loot - cost, australiums, pans, rare, best };
    }
    function LootCard({ item, subtitle, footnote, best, index }) {
      const href = itemHref(item);
      const body = /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "care-card-media" }, item && item.i ? /* @__PURE__ */ React.createElement("img", { src: String(item.i).replace(/^http:/, "https:"), alt: "", loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" }) : /* @__PURE__ */ React.createElement("div", { className: "care-media-fallback" }, (item ? item.n : "?").slice(0, 2))), /* @__PURE__ */ React.createElement("div", { className: "care-card-body" }, /* @__PURE__ */ React.createElement("div", { className: "care-card-copy care-sim-copy" }, /* @__PURE__ */ React.createElement("h3", null, item ? item.n : "—"), /* @__PURE__ */ React.createElement("p", null, subtitle)), /* @__PURE__ */ React.createElement("div", { className: "care-card-value-stack" }, /* @__PURE__ */ React.createElement("strong", { className: "care-card-value" }, item && typeof item.p === "number" ? euro(item.p) : "—"), /* @__PURE__ */ React.createElement("span", { className: "care-card-footnote" }, footnote))));
      const cls = `care-market-card care-sim-card${best ? " best" : ""}${href ? " interactive" : ""}`;
      const style = { "--card-delay": `${Math.min(index, 12) * 60}ms` };
      return href ? /* @__PURE__ */ React.createElement("a", { className: cls, style, href }, body) : /* @__PURE__ */ React.createElement("div", { className: cls, style }, body);
    }
    function stackParts(missions) {
      const byName = /* @__PURE__ */ new Map();
      for (const m of missions) {
        for (const x of m.extras) {
          if (!x.part) continue;
          const cur = byName.get(x.item.n) || { item: { ...x.item, p: 0 }, count: 0, rare: Boolean(x.rare), unit: x.unit };
          cur.count += x.count;
          cur.item.p = typeof x.unit === "number" ? Math.round(x.unit * cur.count * 100) / 100 : null;
          byName.set(x.item.n, cur);
        }
      }
      return [...byName.values()].sort((a, b) => Number(b.rare) - Number(a.rare) || b.count - a.count).map((g) => ({ item: g.item, rare: g.rare, kind: g.rare ? `Rare Robot Part${g.count > 1 ? ` ×${g.count}` : ""}` : `Robot Part ×${g.count}` }));
    }
    function Tf2MvmPage() {
      const [data, setData] = useState(null);
      const [error, setError] = useState("");
      const [tourId, setTourId] = useState("oil_spill");
      const [runs, setRuns] = useState(1);
      const [surplus, setSurplus] = useState(0);
      const [tours, setTours] = useState([]);
      const [runCount, setRunCount] = useState(0);
      useEffect(() => {
        document.title = "TF2 Mann Up Calculator – MvM Loot & Tour Rewards | TFPRICE";
        fetch("assets/data/tf2/mvm.json", { credentials: "same-origin" }).then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))).then(setData).catch((err) => setError(err.message || "Could not load the Mann Up data."));
      }, []);
      const tour = useMemo(() => data ? data.tours.find((t) => t.id === tourId) || data.tours[0] : null, [data, tourId]);
      const summary = useMemo(() => data && tours.length ? summarize(data, tours, surplus) : null, [data, tours, surplus]);
      const runTour = (t, count = surplus) => {
        if (!data || !t) return;
        setTours(simulate(data, t, runs, count));
        setRunCount((n) => n + 1);
      };
      const setSurplusAndRun = (count) => {
        setSurplus(count);
        if (tours.length) runTour(tour, count);
      };
      const run = () => runTour(tour);
      useEffect(() => {
        if (!data) return;
        const first = data.tours.find((t) => t.id === "oil_spill") || data.tours[0];
        if (first) runTour(first);
      }, [data]);
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: "care-page tf2-mvm" }, /* @__PURE__ */ React.createElement("div", { className: "care-shell" }, /* @__PURE__ */ React.createElement("h1", { className: "collections-head-sr-title" }, "Mann Up calculator"), error ? /* @__PURE__ */ React.createElement("div", { className: "care-error care-panel" }, /* @__PURE__ */ React.createElement("strong", null, "Mann Up data unavailable."), /* @__PURE__ */ React.createElement("p", null, error)) : null, /* @__PURE__ */ React.createElement("section", { className: "care-panel tf2-mvm-controls" }, /* @__PURE__ */ React.createElement("div", { className: "tf2-mvm-tours", role: "tablist", "aria-label": "Tour of Duty" }, (data ? data.tours : []).map((t) => /* @__PURE__ */ React.createElement("button", { key: t.id, type: "button", className: `tf2-mvm-tour${tourId === t.id ? " is-active" : ""}`, "aria-pressed": tourId === t.id, onClick: () => {
        setTourId(t.id);
        runTour(t);
      } }, t.badge ? /* @__PURE__ */ React.createElement("img", { src: t.badge, alt: "", loading: "lazy", decoding: "async" }) : null, /* @__PURE__ */ React.createElement("strong", null, t.name.replace(/^Operation /, "")), /* @__PURE__ */ React.createElement("span", null, t.missions.length, " missions")))), /* @__PURE__ */ React.createElement("div", { className: "care-roll-footer" }, /* @__PURE__ */ React.createElement("div", { className: "care-roll-actions" }, /* @__PURE__ */ React.createElement("div", { className: "tf2-mvm-runs", role: "group", "aria-label": "Tours to run" }, RUN_OPTIONS.map((n) => /* @__PURE__ */ React.createElement("button", { key: n, type: "button", className: `tf2-mvm-run${runs === n ? " is-active" : ""}`, "aria-pressed": runs === n, onClick: () => setRuns(n) }, n, " tour", n === 1 ? "" : "s"))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "care-button care-button-primary", onClick: run, disabled: !data }, runCount ? "Run again" : "Run the tour", runs > 1 ? ` ×${runs}` : "")), /* @__PURE__ */ React.createElement("div", { className: "care-roll-worth" }, /* @__PURE__ */ React.createElement("strong", null, summary ? euro(summary.loot) : "—"))), /* @__PURE__ */ React.createElement("div", { className: "tf2-mvm-surplus", role: "group", "aria-label": "Squad Surplus Voucher" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: `tf2-mvm-toggle${surplus ? " is-active" : ""}`, "aria-pressed": surplus > 0, onClick: () => setSurplusAndRun(surplus ? 0 : 1) }, /* @__PURE__ */ React.createElement("span", { className: "tf2-mvm-toggle-knob", "aria-hidden": "true" }), "Squad Surplus Voucher", typeof data?.voucher_eur === "number" ? ` (${euro(data.voucher_eur)} per mission)` : ""), surplus ? /* @__PURE__ */ React.createElement("div", { className: "tf2-mvm-runs", role: "group", "aria-label": "Vouchers in the squad" }, [1, 2, 3, 4, 5, 6].map((n) => /* @__PURE__ */ React.createElement("button", { key: n, type: "button", className: `tf2-mvm-run${surplus === n ? " is-active" : ""}`, "aria-pressed": surplus === n, onClick: () => setSurplusAndRun(n) }, n, " voucher", n === 1 ? "" : "s"))) : null)), summary ? /* @__PURE__ */ React.createElement("div", { className: "tf2p-stats" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", null, "Loot value"), /* @__PURE__ */ React.createElement("strong", null, euro(summary.loot)), /* @__PURE__ */ React.createElement("small", null, tours.length, " tour", tours.length === 1 ? "" : "s", ", ", summary.missions, " missions")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", null, summary.vouchers ? "Tickets + vouchers" : "Tickets spent"), /* @__PURE__ */ React.createElement("strong", null, summary.cost === null ? "—" : euro(summary.cost)), /* @__PURE__ */ React.createElement("small", null, `${summary.tickets} ticket${summary.tickets === 1 ? "" : "s"}${typeof data.ticket_eur === "number" ? ` (${euro(data.ticket_eur)} each)` : ""}`, summary.vouchers ? ` · ${summary.vouchers} voucher${summary.vouchers === 1 ? "" : "s"}${typeof data.voucher_eur === "number" ? ` (${euro(data.voucher_eur)} each)` : ""}` : "")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", null, "Best drop"), /* @__PURE__ */ React.createElement("strong", null, summary.best ? euro(summary.best.p) : "—"), /* @__PURE__ */ React.createElement("small", null, summary.best ? summary.best.n : "—")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", null, "Rare pulls"), /* @__PURE__ */ React.createElement("strong", null, summary.australiums + summary.pans + summary.rare), /* @__PURE__ */ React.createElement("small", null, summary.australiums, " Australium · ", summary.pans, " Golden Pan · ", summary.rare, " rare variant", summary.rare === 1 ? "" : "s"))) : null, (() => {
        const cardsOf = (t, prefix) => [
          ...t.missions.map((m, i) => /* @__PURE__ */ React.createElement(LootCard, { key: `${t.index}-${i}`, index: i, item: m.item, subtitle: `${prefix}Mission ${i + 1}: ${m.name}${m.map ? ` (${m.map})` : ""}`, footnote: m.kind })),
          ...stackParts(t.missions).map((x, j) => /* @__PURE__ */ React.createElement(LootCard, { key: `${t.index}-p${j}`, index: t.missions.length + j, item: x.item, best: Boolean(x.rare), subtitle: `${prefix}All missions`, footnote: x.kind })),
          ...t.missions.flatMap((m, i) => m.extras.filter((x) => !x.part).map((x, j) => /* @__PURE__ */ React.createElement(LootCard, { key: `${t.index}-${i}-x${j}`, index: t.missions.length + j, item: x.item, best: Boolean(x.rare), subtitle: `${prefix}Mission ${i + 1}: ${m.name}`, footnote: x.kind }))),
          ...t.rewards.map((r, i) => /* @__PURE__ */ React.createElement(
            LootCard,
            {
              key: `${t.index}-r${i}`,
              index: t.missions.length + i,
              item: r.item,
              best: true,
              subtitle: `${prefix}Tour complete`,
              footnote: `Tour reward · ${r.tier}${r.rarity === "common" ? "" : ` (${r.rarity})`}`
            }
          ))
        ];
        if (tours.length > 1 && tour.missions.length <= 3 && !tour.loot.mission_parts) {
          return /* @__PURE__ */ React.createElement("section", { className: "care-panel tf2-mvm-tourblock", key: `${runCount}-all`, "aria-label": `${tour.name} · ${tours.length} tours` }, /* @__PURE__ */ React.createElement("div", { className: "care-sim-grid tf2-mvm-grid", style: { gridTemplateColumns: "repeat(6, minmax(150px, 1fr))" } }, tours.flatMap((t) => cardsOf(t, `Tour ${t.index} · `))));
        }
        return tours.map((t) => /* @__PURE__ */ React.createElement("section", { className: "care-panel tf2-mvm-tourblock", key: `${runCount}-${t.index}`, "aria-label": `${tour.name} · tour ${t.index}` }, /* @__PURE__ */ React.createElement("div", { className: "care-sim-grid tf2-mvm-grid", style: { gridTemplateColumns: `repeat(${tour.loot.mission_parts ? 7 : t.missions.length + t.rewards.length}, minmax(150px, 1fr))` } }, cardsOf(t, ""))));
      })())));
    }
    mountPage(/* @__PURE__ */ React.createElement(Tf2MvmPage, null));
  })();
})();
