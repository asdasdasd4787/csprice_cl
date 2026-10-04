(() => {
  const { useEffect, useMemo, useState } = React;
  const { Layout, mountPage } = window.CS2React;

  // Mann Up tour simulator (tf2-drops.html), in the Care Package page's UI
  // (carepackage.css). Pick a Tour of Duty and how many tours to run. The
  // rules follow the Official TF2 Wiki ("Mann Up", "Tour of Duty", "Operation
  // Two Cities", "Botkiller weapons"):
  //   - every completed mission consumes a Tour of Duty Ticket and pays "a
  //     random item from the random drop pool" (a regular weapon or
  //     cosmetic; the nine Mann Up-only class cosmetics with a small slice);
  //   - a Two Cities mission also pays "at least 5 Robot Parts" (Pristine
  //     rare) and has a "chance to obtain a Specialized Killstreak Kit
  //     Fabricator";
  //   - finishing a tour pays its Botkiller weapon (Strange; Rust / Silver
  //     Mk.I / Silver Mk.II / Carbonado, "small chance" of Blood / Gold /
  //     Diamond), or on Two Cities "a regular Killstreak Kit and a
  //     Specialized Killstreak Kit Fabricator" with a small chance of a
  //     Professional one instead. At most two fabricators per tour: one
  //     from the missions (the first lucky mission; no more after it) and
  //     the guaranteed one at the end (user, 2026-09-29).
  //     Advanced and Expert tours can add an Australium
  //     weapon, and very rarely the Golden Frying Pan.
  // The wiki publishes no odds; the percentages in mvm.json are community
  // estimates (scripts/tf2_mvm_import.php). Values are today's cheapest
  // market price.
  const RUN_OPTIONS = [1, 3, 5, 10, 25, 50, 75, 100];
  const euro = (v) => (typeof v === "number" ? new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(v) : "—");
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const has = (pools, key) => Boolean(key && pools[key] && pools[key].length);
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
  // Mann Up loot entries carry { n, p, i, b, g }; a priced one with its
  // category has a clean page.
  const itemHref = (item) => {
    if (!item || !item.n || item.synthetic) return "";
    return tf2ItemHref({ n: item.n, e: "", g: item.g, b: typeof item.b === "number" ? item.b : -1 }, typeof item.p === "number" && item.p > 0 && Boolean(item.g));
  };
  const tierLabel = (poolKey) => String(poolKey || "")
    .replace(/_mk(i+)$/i, (m, x) => ` Mk.${x.toUpperCase()}`)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const KIND_LABEL = { mission_weapon: "Weapon", mission_cosmetic: "Cosmetic", mvm_item: "Mann Up cosmetic" };

  /** One roll on the random drop pool (weapon / cosmetic, small Mann Up-only slice). */
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

  /**
   * surplus: true when this mission is played on a Squad Surplus Voucher (one
   * extra item). fabricatorLeft: false once an earlier mission of this tour
   * paid its fabricator - a tour's missions pay at most one.
   */
  function rollMission(data, tour, surplus, fabricatorLeft = true) {
    const pools = data.pools;
    const { item: dropItem, kind } = rollDrop(data);
    // Extras are their own cards (Two Cities): "at least 5 random common
    // Robot Parts" - five rolls over the Battle-Worn and Reinforced parts,
    // identical parts folded into one card with a count - a Pristine part as
    // the "Rare Robot Part", and the "chance to obtain a Specialized
    // Killstreak Kit Fabricator" as rare loot.
    const extras = [];
    if (tour.loot.mission_parts) {
      const rolled = new Map();
      const common = [...(pools.battle_worn_part || []), ...(pools.reinforced_part || [])];
      for (let i = 0; i < 5; i += 1) {
        if (!common.length) break;
        const part = pick(common);
        const cur = rolled.get(part.n) || { part, count: 0, pristine: false };
        cur.count += 1;
        rolled.set(part.n, cur);
      }
      // The wiki's "Rare loot" row: a Pristine part is its own per-mission
      // chance on top of the five commons, like the fabricator below.
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
    // Squad Surplus Vouchers (wiki): "You and every person on your team will
    // receive an extra item drop when you complete a mission" - one per
    // voucher used in the squad, "from the item drop pool, except for a small
    // chance of an exclusive Mann vs. Machine cosmetic item instead".
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
      // A rarer fabricator REPLACES the guaranteed one (Two Cities pays one
      // fabricator at the end, sometimes Professional), never a second.
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
      // A single player: `surplus` vouchers per tour, each replacing the
      // ticket of one mission (the first ones) and adding one item there;
      // the other missions are played on tickets.
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

  const value = (item) => (item && typeof item.p === "number" ? item.p : 0);
  function summarize(data, tours, surplus = 0) {
    let loot = 0;
    let missionsDone = 0;
    let voucherMissions = 0;
    let australiums = 0;
    let pans = 0;
    let rare = 0;
    let best = null;
    const consider = (it) => { if (it && (!best || value(it) > value(best))) best = it; };
    for (const t of tours) {
      missionsDone += t.missions.length;
      for (const m of t.missions) {
        if (m.voucher) voucherMissions += 1;
        loot += value(m.item);
        consider(m.item);
        for (const x of m.extras) { loot += value(x.item); consider(x.item); }
      }
      for (const r of t.rewards) {
        loot += value(r.item);
        consider(r.item);
        if (r.rarity === "australium") australiums += 1;
        if (r.rarity === "legendary") pans += 1;
        if (r.rarity === "rare") rare += 1;
      }
    }
    // Costs for a single player: a mission played on a voucher costs the
    // voucher instead of a ticket (and pays one extra item); every other
    // mission costs a Tour of Duty Ticket.
    const vouchers = voucherMissions;
    const tickets = missionsDone - voucherMissions;
    const voucherCost = vouchers && typeof data.voucher_eur === "number" ? vouchers * data.voucher_eur : 0;
    const cost = typeof data.ticket_eur === "number" ? tickets * data.ticket_eur + voucherCost : null;
    return { loot, missions: missionsDone, tickets, vouchers, voucherCost, cost, net: cost === null ? null : loot - cost, australiums, pans, rare, best };
  }

  function LootCard({ item, subtitle, footnote, best, index }) {
    const href = itemHref(item);
    const body = (
      <>
        <div className="care-card-media">
          {item && item.i ? <img src={String(item.i).replace(/^http:/, "https:")} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <div className="care-media-fallback">{(item ? item.n : "?").slice(0, 2)}</div>}
        </div>
        <div className="care-card-body">
          <div className="care-card-copy care-sim-copy">
            <h3>{item ? item.n : "—"}</h3>
            <p>{subtitle}</p>
          </div>
          <div className="care-card-value-stack">
            <strong className="care-card-value">{item && typeof item.p === "number" ? euro(item.p) : "—"}</strong>
            <span className="care-card-footnote">{footnote}</span>
          </div>
        </div>
      </>
    );
    const cls = `care-market-card care-sim-card${best ? " best" : ""}${href ? " interactive" : ""}`;
    const style = { "--card-delay": `${Math.min(index, 12) * 60}ms` };
    return href ? <a className={cls} style={style} href={href}>{body}</a> : <div className={cls} style={style}>{body}</div>;
  }

  /** The tour's Robot Parts grouped by part across every mission. */
  function stackParts(missions) {
    const byName = new Map();
    for (const m of missions) {
      for (const x of m.extras) {
        if (!x.part) continue;
        const cur = byName.get(x.item.n) || { item: { ...x.item, p: 0 }, count: 0, rare: Boolean(x.rare), unit: x.unit };
        cur.count += x.count;
        cur.item.p = typeof x.unit === "number" ? Math.round(x.unit * cur.count * 100) / 100 : null;
        byName.set(x.item.n, cur);
      }
    }
    return [...byName.values()]
      .sort((a, b) => Number(b.rare) - Number(a.rare) || b.count - a.count)
      .map((g) => ({ item: g.item, rare: g.rare, kind: g.rare ? `Rare Robot Part${g.count > 1 ? ` ×${g.count}` : ""}` : `Robot Part ×${g.count}` }));
  }

  function Tf2MvmPage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");
    // Oil Spill is the default operation; it runs once as soon as the data
    // is in, so the page opens with a tour on screen.
    const [tourId, setTourId] = useState("oil_spill");
    const [runs, setRuns] = useState(1);
    // Squad Surplus: off, or 1-6 vouchers used in the squad (yours + mates').
    const [surplus, setSurplus] = useState(0);
    const [tours, setTours] = useState([]);
    const [runCount, setRunCount] = useState(0);

    useEffect(() => {
      document.title = "TF2 Mann Up Calculator – MvM Loot & Tour Rewards | TFPRICE";
      fetch("assets/data/tf2/mvm.json", { credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then(setData)
        .catch((err) => setError(err.message || "Could not load the Mann Up data."));
    }, []);

    const tour = useMemo(() => (data ? data.tours.find((t) => t.id === tourId) || data.tours[0] : null), [data, tourId]);
    const summary = useMemo(() => (data && tours.length ? summarize(data, tours, surplus) : null), [data, tours, surplus]);

    // Picking a tour card runs it straight away; the Run button repeats it.
    const runTour = (t, count = surplus) => {
      if (!data || !t) return;
      setTours(simulate(data, t, runs, count));
      setRunCount((n) => n + 1);
    };
    const setSurplusAndRun = (count) => { setSurplus(count); if (tours.length) runTour(tour, count); };
    const run = () => runTour(tour);
    useEffect(() => {
      if (!data) return;
      const first = data.tours.find((t) => t.id === "oil_spill") || data.tours[0];
      if (first) runTour(first);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    return (
      <Layout>
        <div className="care-page tf2-mvm">
          <div className="care-shell">
            <h1 className="collections-head-sr-title">Mann Up calculator</h1>
            {error ? <div className="care-error care-panel"><strong>Mann Up data unavailable.</strong><p>{error}</p></div> : null}

            <section className="care-panel tf2-mvm-controls">
              <div className="tf2-mvm-tours" role="tablist" aria-label="Tour of Duty">
                {(data ? data.tours : []).map((t) => (
                  <button key={t.id} type="button" className={`tf2-mvm-tour${tourId === t.id ? " is-active" : ""}`} aria-pressed={tourId === t.id} onClick={() => { setTourId(t.id); runTour(t); }}>
                    {t.badge ? <img src={t.badge} alt="" loading="lazy" decoding="async" /> : null}
                    <strong>{t.name.replace(/^Operation /, "")}</strong>
                    <span>{t.missions.length} missions</span>
                  </button>
                ))}
              </div>
              <div className="care-roll-footer">
                <div className="care-roll-actions">
                  <div className="tf2-mvm-runs" role="group" aria-label="Tours to run">
                    {RUN_OPTIONS.map((n) => (
                      <button key={n} type="button" className={`tf2-mvm-run${runs === n ? " is-active" : ""}`} aria-pressed={runs === n} onClick={() => setRuns(n)}>{n} tour{n === 1 ? "" : "s"}</button>
                    ))}
                  </div>
                  <button type="button" className="care-button care-button-primary" onClick={run} disabled={!data}>
                    {runCount ? "Run again" : "Run the tour"}{runs > 1 ? ` ×${runs}` : ""}
                  </button>
                </div>
                <div className="care-roll-worth">
                  <strong>{summary ? euro(summary.loot) : "—"}</strong>
                </div>
              </div>
              <div className="tf2-mvm-surplus" role="group" aria-label="Squad Surplus Voucher">
                <button type="button" className={`tf2-mvm-toggle${surplus ? " is-active" : ""}`} aria-pressed={surplus > 0} onClick={() => setSurplusAndRun(surplus ? 0 : 1)}>
                  <span className="tf2-mvm-toggle-knob" aria-hidden="true" />
                  Squad Surplus Voucher{typeof data?.voucher_eur === "number" ? ` (${euro(data.voucher_eur)} per mission)` : ""}
                </button>
                {surplus ? (
                  <div className="tf2-mvm-runs" role="group" aria-label="Vouchers in the squad">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <button key={n} type="button" className={`tf2-mvm-run${surplus === n ? " is-active" : ""}`} aria-pressed={surplus === n} onClick={() => setSurplusAndRun(n)}>{n} voucher{n === 1 ? "" : "s"}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            {summary ? (
              <div className="tf2p-stats">
                <div><span>Loot value</span><strong>{euro(summary.loot)}</strong><small>{tours.length} tour{tours.length === 1 ? "" : "s"}, {summary.missions} missions</small></div>
                <div><span>{summary.vouchers ? "Tickets + vouchers" : "Tickets spent"}</span><strong>{summary.cost === null ? "—" : euro(summary.cost)}</strong><small>{`${summary.tickets} ticket${summary.tickets === 1 ? "" : "s"}${typeof data.ticket_eur === "number" ? ` (${euro(data.ticket_eur)} each)` : ""}`}{summary.vouchers ? ` · ${summary.vouchers} voucher${summary.vouchers === 1 ? "" : "s"}${typeof data.voucher_eur === "number" ? ` (${euro(data.voucher_eur)} each)` : ""}` : ""}</small></div>
                <div><span>Best drop</span><strong>{summary.best ? euro(summary.best.p) : "—"}</strong><small>{summary.best ? summary.best.n : "—"}</small></div>
                <div><span>Rare pulls</span><strong>{summary.australiums + summary.pans + summary.rare}</strong><small>{summary.australiums} Australium · {summary.pans} Golden Pan · {summary.rare} rare variant{summary.rare === 1 ? "" : "s"}</small></div>
              </div>
            ) : null}

            {(() => {
              // Cards of one tour in order: missions, the tour's stacked Robot
              // Parts, rare per-mission extras, then the tour rewards.
              const cardsOf = (t, prefix) => [
                ...t.missions.map((m, i) => (
                  <LootCard key={`${t.index}-${i}`} index={i} item={m.item} subtitle={`${prefix}Mission ${i + 1}: ${m.name}${m.map ? ` (${m.map})` : ""}`} footnote={m.kind} />
                )),
                ...stackParts(t.missions).map((x, j) => (
                  <LootCard key={`${t.index}-p${j}`} index={t.missions.length + j} item={x.item} best={Boolean(x.rare)} subtitle={`${prefix}All missions`} footnote={x.kind} />
                )),
                ...t.missions.flatMap((m, i) => m.extras.filter((x) => !x.part).map((x, j) => (
                  <LootCard key={`${t.index}-${i}-x${j}`} index={t.missions.length + j} item={x.item} best={Boolean(x.rare)} subtitle={`${prefix}Mission ${i + 1}: ${m.name}`} footnote={x.kind} />
                ))),
                ...t.rewards.map((r, i) => (
                  <LootCard key={`${t.index}-r${i}`} index={t.missions.length + i} item={r.item} best subtitle={`${prefix}Tour complete`}
                    footnote={`Tour reward · ${r.tier}${r.rarity === "common" ? "" : ` (${r.rarity})`}`} />
                )),
              ];
              // Several runs of a short tour (Mecha Engine, Gear Grinder: three
              // missions + reward) flow into one six-column grid instead of a
              // stretched four-card row per tour.
              if (tours.length > 1 && tour.missions.length <= 3 && !tour.loot.mission_parts) {
                return (
                  <section className="care-panel tf2-mvm-tourblock" key={`${runCount}-all`} aria-label={`${tour.name} · ${tours.length} tours`}>
                    <div className="care-sim-grid tf2-mvm-grid" style={{ gridTemplateColumns: "repeat(6, minmax(150px, 1fr))" }}>
                      {tours.flatMap((t) => cardsOf(t, `Tour ${t.index} · `))}
                    </div>
                  </section>
                );
              }
              return tours.map((t) => (
                <section className="care-panel tf2-mvm-tourblock" key={`${runCount}-${t.index}`} aria-label={`${tour.name} · tour ${t.index}`}>
                  {/* One row per tour, as many columns as cards; Two Cities has
                      the biggest pool (item + Robot Parts + fabricators per
                      mission) and wraps instead, in seven columns so its cards
                      are the size of a six-mission tour's. */}
                  <div className="care-sim-grid tf2-mvm-grid" style={{ gridTemplateColumns: `repeat(${tour.loot.mission_parts ? 7 : t.missions.length + t.rewards.length}, minmax(150px, 1fr))` }}>
                    {cardsOf(t, "")}
                  </div>
                </section>
              ));
            })()}
          </div>
        </div>
      </Layout>
    );
  }

  mountPage(<Tf2MvmPage />);
})();
