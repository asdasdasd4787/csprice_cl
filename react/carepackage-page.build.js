(() => {
  (() => {
    const { useEffect, useMemo, useRef, useState } = React;
    const { Layout, mountPage, classNames, ensureChartJs } = window.CS2React;
    const sharedData = window.CS2ReactData || {};
    const FILTER_OPTIONS = [
      { id: "skins", label: "Skins" },
      { id: "case", label: "Cases" },
      { id: "terminal", label: "Terminals" },
      { id: "graffiti", label: "Graffiti" },
      { id: "tool", label: "Tools" }
    ];
    const CATALOG_SORT_OPTIONS = [
      { id: "rarity_desc", label: "Highest rarity" },
      { id: "price_desc", label: "Highest price" },
      { id: "price_asc", label: "Lowest price" },
      { id: "name_asc", label: "Name A-Z" }
    ];
    const BOARD_SLOT_COUNT = 4;
    const DROP_CHART_SLOT_COUNT = 8;
    const DROP_CHART_COLORS = [
      "#38bdf8",
      "#22c55e",
      "#f59e0b",
      "#a78bfa",
      "#f472b6",
      "#34d399",
      "#60a5fa",
      "#fb7185",
      "#fbbf24",
      "#2dd4bf",
      "#818cf8",
      "#e879f9",
      "#4ade80",
      "#f97316"
    ];
    const EMPTY_REWARDS = [];
    const EMPTY_CATALOG = Object.freeze({});
    const WEAR_LABELS = [
      "Factory New",
      "Minimal Wear",
      "Field-Tested",
      "Well-Worn",
      "Battle-Scarred"
    ];
    const SPIN_BUTTON_VARIANTS = [
      "Spin the drop deck",
      "Crack the weekly draw",
      "Shuffle the reward stack",
      "Roll the care package",
      "Light up the next pull",
      "Send the drop live",
      "Kick off a fresh roll",
      "Pull the next four",
      "Run the weekly spin",
      "Deal the next reward set",
      "Open the next lineup",
      "Queue the next package",
      "Fire off another roll",
      "Launch a new drop round",
      "Spin up the next pick",
      "Trigger another reward pull",
      "Roll into the next drop",
      "Start the next reward wave",
      "Drop another four",
      "Run it back",
      "Spin for another stack",
      "Deal a new package",
      "Show the next reward mix",
      "Pull a fresh drop hand",
      "Queue up the next rewards",
      "Spin the next weekly hand",
      "Roll a new reward combo",
      "Trigger the next lineup",
      "Mix up another drop set",
      "Take another shot"
    ];
    const VISUAL_TONES = {
      case: {
        accent: "#67A6FF",
        start: "rgba(90, 140, 198, 0.96)",
        end: "rgba(25, 34, 48, 0.96)",
        glow: "rgba(103, 166, 255, 0.42)"
      },
      terminal: {
        accent: "#96B8E5",
        start: "rgba(108, 133, 172, 0.96)",
        end: "rgba(21, 31, 44, 0.96)",
        glow: "rgba(150, 184, 229, 0.4)"
      },
      graffiti: {
        accent: "#63DCB3",
        start: "rgba(76, 150, 128, 0.94)",
        end: "rgba(20, 33, 35, 0.96)",
        glow: "rgba(99, 220, 179, 0.38)"
      },
      tool: {
        accent: "#9AA7FF",
        start: "rgba(108, 115, 154, 0.94)",
        end: "rgba(24, 26, 42, 0.96)",
        glow: "rgba(154, 167, 255, 0.38)"
      },
      Covert: {
        accent: "#EB4B4B",
        start: "rgba(146, 53, 74, 0.96)",
        end: "rgba(33, 17, 30, 0.97)",
        glow: "rgba(255, 85, 119, 0.48)"
      },
      Classified: {
        accent: "#D32CE6",
        start: "rgba(124, 61, 161, 0.96)",
        end: "rgba(29, 18, 42, 0.97)",
        glow: "rgba(211, 98, 255, 0.46)"
      },
      Restricted: {
        accent: "#8847FF",
        start: "rgba(89, 83, 186, 0.96)",
        end: "rgba(22, 22, 45, 0.97)",
        glow: "rgba(134, 121, 255, 0.44)"
      },
      Mil_Spec: {
        accent: "#4B69FF",
        start: "rgba(72, 126, 198, 0.96)",
        end: "rgba(18, 31, 49, 0.97)",
        glow: "rgba(92, 166, 255, 0.42)"
      },
      Industrial: {
        accent: "#5E98D9",
        start: "rgba(72, 151, 184, 0.94)",
        end: "rgba(18, 35, 46, 0.97)",
        glow: "rgba(109, 211, 255, 0.4)"
      },
      Consumer: {
        accent: "#B0C3D9",
        start: "rgba(109, 129, 153, 0.94)",
        end: "rgba(23, 29, 38, 0.97)",
        glow: "rgba(170, 188, 211, 0.34)"
      }
    };
    const COLLECTION_LOGO_MAP = {
      harlequin: "assets/collections/source2/harlequin-source2.svg",
      ascent: "assets/collections/source2/ascent-source2.svg",
      achroma: "assets/collections/source2/achroma-source2.svg",
      radiant: "assets/collections/source2/radiant-source2.svg",
      boreal: "assets/collections/source2/boreal-source2.svg"
    };
    function formatEuro(value) {
      const amount = Number(value);
      if (!Number.isFinite(amount)) return "—";
      return `€${amount.toFixed(2)}`;
    }
    function formatInt(value) {
      const amount = Number(value);
      if (!Number.isFinite(amount)) return "—";
      return amount.toLocaleString("en-US");
    }
    function formatPercent(value, digits = 2) {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount <= 0) return "—";
      return `${amount.toFixed(digits)}%`;
    }
    function formatUpdated(value) {
      if (!value) return "Live data ready";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "Live data ready";
      const diffSeconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1e3));
      if (diffSeconds < 60) return `Updated ${diffSeconds}s ago`;
      const diffMinutes = Math.round(diffSeconds / 60);
      if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;
      const diffHours = Math.round(diffMinutes / 60);
      if (diffHours < 24) return `Updated ${diffHours}h ago`;
      return `Updated ${Math.round(diffHours / 24)}d ago`;
    }
    function kindLabel(kind) {
      switch (kind) {
        case "collection":
          return "Collection";
        case "case":
          return "Case";
        case "terminal":
          return "Terminal";
        case "graffiti":
          return "Graffiti";
        case "tool":
          return "Tool";
        default:
          return "Reward";
      }
    }
    function initials(label) {
      return String(label || "CS").split(/[\s|]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "CS";
    }
    function collectionKeyFromName(name) {
      return String(name || "").toLowerCase().replace(/^the\s+/, "").replace(/\s+collection$/, "").trim();
    }
    function collectionLogoForReward(reward) {
      if (!reward || reward.kind !== "collection") {
        return String(reward?.image || "").trim();
      }
      const collectionKey = collectionKeyFromName(reward.name);
      if (COLLECTION_LOGO_MAP[collectionKey]) {
        return COLLECTION_LOGO_MAP[collectionKey];
      }
      const navMatch = Array.isArray(sharedData.navCollections) ? sharedData.navCollections.find((entry) => collectionKeyFromName(entry.name) === collectionKey) : null;
      return String(navMatch?.img || reward.image || "").trim();
    }
    function normalizeFloatRange(value) {
      const amount = Number(value);
      if (!Number.isFinite(amount)) return null;
      return amount > 1 ? amount / 100 : amount;
    }
    function wearFromFloat(value) {
      if (!Number.isFinite(value)) return null;
      if (value <= 0.07) return "Factory New";
      if (value <= 0.15) return "Minimal Wear";
      if (value <= 0.38) return "Field-Tested";
      if (value <= 0.45) return "Well-Worn";
      return "Battle-Scarred";
    }
    function preferredValue(item) {
      const fields = [
        item.price_total,
        item.price_factory_new,
        item.price_minimal_wear,
        item.price_field_tested,
        item.price_well_worn,
        item.price_battle_scarred
      ];
      for (const field of fields) {
        const amount = Number(field);
        if (Number.isFinite(amount) && amount > 0) {
          return amount;
        }
      }
      return null;
    }
    function preferredWearForItem(item) {
      const entries = [
        ["Factory New", item.price_factory_new],
        ["Minimal Wear", item.price_minimal_wear],
        ["Field-Tested", item.price_field_tested],
        ["Well-Worn", item.price_well_worn],
        ["Battle-Scarred", item.price_battle_scarred]
      ];
      for (const [wear, value] of entries) {
        const amount = Number(value);
        if (Number.isFinite(amount) && amount > 0) {
          return wear;
        }
      }
      return null;
    }
    function pickWearPrice(item, wear) {
      const values = {
        "Factory New": Number(item.price_factory_new),
        "Minimal Wear": Number(item.price_minimal_wear),
        "Field-Tested": Number(item.price_field_tested),
        "Well-Worn": Number(item.price_well_worn),
        "Battle-Scarred": Number(item.price_battle_scarred)
      };
      const direct = values[wear];
      if (Number.isFinite(direct) && direct > 0) return direct;
      return preferredValue(item);
    }
    function sampleFloat(item) {
      const min = normalizeFloatRange(item.float_min);
      const max = normalizeFloatRange(item.float_max);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      const from = Math.max(0, Math.min(min, max));
      const to = Math.min(1, Math.max(min, max));
      return from + Math.random() * (to - from);
    }
    function weightedPick(items) {
      const valid = Array.isArray(items) ? items.filter((item) => Number(item.drop_chance) > 0) : [];
      if (!valid.length) return null;
      const totalWeight = valid.reduce((sum, item) => sum + Math.max(0, Number(item.drop_chance) || 0), 0);
      if (totalWeight <= 0) {
        return valid[Math.floor(Math.random() * valid.length)] || null;
      }
      let cursor = Math.random() * totalWeight;
      for (const item of valid) {
        cursor -= Math.max(0, Number(item.drop_chance) || 0);
        if (cursor <= 0) return item;
      }
      return valid[valid.length - 1] || null;
    }
    function uniqueSample(items, count) {
      const pool = [...items];
      const picked = [];
      while (pool.length > 0 && picked.length < count) {
        const index = Math.floor(Math.random() * pool.length);
        picked.push(pool[index]);
        pool.splice(index, 1);
      }
      return picked;
    }
    function marketHashFromOffer(offer) {
      if (!offer || typeof offer !== "object") return "";
      if (offer.market_hash_name) return String(offer.market_hash_name).trim();
      const href = String(offer.href || "");
      try {
        const query = href.includes("?") ? href.slice(href.indexOf("?") + 1) : "";
        const params = new URLSearchParams(query);
        const fromHref = String(params.get("market_hash_name") || "").trim();
        if (fromHref) return fromHref;
      } catch (_error) {
      }
      const title = String(offer.title || "").trim();
      if (!title) return "";
      if (offer.kind === "collection") {
        const wear = String(offer.subtitle || "").split(" - ")[0].trim();
        if (WEAR_LABELS.includes(wear)) {
          return `${title} (${wear})`;
        }
      }
      return title;
    }
    function normalizeDropIdentity(value) {
      return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
    }
    function baseDropIdentity(marketHashName) {
      return normalizeDropIdentity(marketHashName).replace(/\s*\([^)]*\)\s*$/, "").trim();
    }
    function downsampleHistoryPoints(points, maxPoints = 90) {
      const list = Array.isArray(points) ? points.filter((point) => {
        const price = Number(point?.price);
        const date = String(point?.date || "");
        return Number.isFinite(price) && price > 0 && date;
      }) : [];
      if (list.length <= maxPoints) return list;
      const step = Math.ceil(list.length / maxPoints);
      const out = [];
      for (let i = 0; i < list.length; i += step) out.push(list[i]);
      const last = list[list.length - 1];
      if (out[out.length - 1] !== last) out.push(last);
      return out;
    }
    function sanitizeHistoryOutliers(points) {
      const list = Array.isArray(points) ? points.filter((point) => {
        const price = Number(point?.price);
        return Number.isFinite(price) && price > 0;
      }) : [];
      if (list.length < 4) return list;
      const sorted = list.map((point) => Number(point.price)).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] || 0;
      if (!(median > 0)) return list;
      const maxAllowed = median * 2.8;
      const minAllowed = Math.max(0.01, median * 0.25);
      return list.filter((point) => {
        const price = Number(point.price);
        return price >= minAllowed && price <= maxAllowed;
      });
    }
    function collectDropChartItems(offers, recentRolls, limit = DROP_CHART_SLOT_COUNT) {
      const ordered = [];
      const seenExact = /* @__PURE__ */ new Set();
      const seenBase = /* @__PURE__ */ new Set();
      const push = (entry) => {
        const hash = marketHashFromOffer(entry);
        if (!hash) return;
        const exactKey = normalizeDropIdentity(hash);
        const baseKey = baseDropIdentity(hash);
        if (!exactKey || seenExact.has(exactKey) || seenBase.has(baseKey)) return;
        seenExact.add(exactKey);
        if (baseKey) seenBase.add(baseKey);
        ordered.push({
          market_hash_name: hash,
          title: String(entry.title || hash),
          image: entry.image || "",
          value: Number(entry.value) || 0,
          kind: entry.kind || "",
          rolled_at: Number(entry.rolled_at) || 0
        });
      };
      (Array.isArray(offers) ? offers : []).forEach((offer) => {
        push({ ...offer, rolled_at: Date.now() });
      });
      (Array.isArray(recentRolls) ? recentRolls : []).forEach(push);
      return ordered.slice(0, Math.max(1, Number(limit) || DROP_CHART_SLOT_COUNT));
    }
    function buildMarketItemHref(entry) {
      const marketHash = String(entry?.market_hash_name || entry?.name || entry?.title || "").trim();
      if (!marketHash) return "";
      const pretty = typeof sharedData.itemPrettyHref === "function" ? sharedData.itemPrettyHref({ market_hash_name: marketHash, category: entry?.category }) : "";
      if (pretty) return pretty;
      const displayName = String(entry?.display_name || entry?.name || entry?.title || marketHash).trim();
      const params = new URLSearchParams({
        lookup_name: marketHash,
        display_name: displayName,
        market_hash_name: marketHash,
        image: String(entry?.image || ""),
        market_url: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHash)}`,
        type: String(entry?.type_note || entry?.catalog_subtitle || entry?.rarity || kindLabel(entry?.kind) || "Item"),
        color: "B0C3D9"
      });
      const wear = entry?.selected_wear || entry?.display_wear || entry?.link_wear;
      if (wear) {
        params.set("selected_wear", wear);
      }
      return `item_page.php?${params.toString()}`;
    }
    function buildItemHref(item, wear) {
      const lookupName = wear ? `${item.name} (${wear})` : item.name;
      return buildMarketItemHref({
        market_hash_name: lookupName,
        name: item.name,
        image: item.image,
        rarity: item.rarity,
        selected_wear: wear
      });
    }
    function buildRewardHref(reward) {
      if (!reward || typeof reward !== "object") return "";
      if (reward.href) return String(reward.href).trim();
      if (reward.kind === "collection") return "";
      return buildMarketItemHref(reward);
    }
    function buildOfferHref(offer) {
      if (!offer || typeof offer !== "object") return "";
      if (offer.href) return String(offer.href).trim();
      return buildMarketItemHref(offer);
    }
    function rewardPoolChance(rewardCount) {
      if (!Number.isFinite(Number(rewardCount)) || Number(rewardCount) <= 0) {
        return null;
      }
      return 100 / Number(rewardCount);
    }
    function nextSpinVariant(currentLabel) {
      if (SPIN_BUTTON_VARIANTS.length <= 1) {
        return SPIN_BUTTON_VARIANTS[0] || "Spin";
      }
      let next = currentLabel;
      while (next === currentLabel) {
        next = SPIN_BUTTON_VARIANTS[Math.floor(Math.random() * SPIN_BUTTON_VARIANTS.length)];
      }
      return next;
    }
    function formatRollOdds(chancePercent) {
      const amount = Number(chancePercent);
      if (!Number.isFinite(amount) || amount <= 0) return "";
      const ratio = 100 / amount;
      return `1 in ${ratio.toLocaleString("de-DE", {
        minimumFractionDigits: ratio < 10 ? 2 : 0,
        maximumFractionDigits: 2
      })}`;
    }
    function bestPickValue(offers, maxPicks = 2) {
      if (!Array.isArray(offers) || !offers.length) return 0;
      return [...offers].map((offer) => Number(offer.value) || 0).sort((left, right) => right - left).slice(0, maxPicks).reduce((sum, value) => sum + value, 0);
    }
    function recordRoll(history, offers, spinNumber) {
      const safeHistory = Array.isArray(history) ? history : [];
      const safeOffers = Array.isArray(offers) ? offers : [];
      const nextEntries = safeOffers.map((offer, index) => ({
        ...offer,
        roll_id: `${spinNumber}-${offer.reward_id || offer.title}-${index}`,
        spin_number: spinNumber,
        rolled_index: index,
        rolled_at: Date.now()
      }));
      return [...nextEntries, ...safeHistory].slice(0, 48);
    }
    function buildRollRanking(items, limit = 12) {
      return [...Array.isArray(items) ? items : []].sort((left, right) => {
        const valueDiff = (Number(right.value) || 0) - (Number(left.value) || 0);
        if (valueDiff !== 0) return valueDiff;
        return (Number(right.spin_number) || 0) - (Number(left.spin_number) || 0);
      }).slice(0, limit).map((item, index) => ({
        ...item,
        ranking_position: index + 1
      }));
    }
    function visualToneForOffer(offer) {
      return VISUAL_TONES[offer?.rarity] || VISUAL_TONES[offer?.kind] || VISUAL_TONES.Mil_Spec;
    }
    function visualToneForReward(reward) {
      if (reward?.kind === "collection") {
        const topDrop = mostExpensiveDrops(reward, 1)[0];
        if (topDrop?.rarity && VISUAL_TONES[topDrop.rarity]) {
          return VISUAL_TONES[topDrop.rarity];
        }
      }
      return VISUAL_TONES[reward?.kind] || VISUAL_TONES.Mil_Spec;
    }
    function mostExpensiveDrops(reward, limit = 8) {
      const items = Array.isArray(reward?.items) ? reward.items : [];
      return [...items].map((item) => ({
        ...item,
        display_price: preferredValue(item),
        display_wear: preferredWearForItem(item)
      })).filter((item) => Number.isFinite(Number(item.display_price))).sort((left, right) => Number(right.display_price) - Number(left.display_price)).slice(0, limit);
    }
    function collectTopDrops(rewards, overallRewardCount, limit = 12) {
      const rewardList = Array.isArray(rewards) ? rewards : [];
      const entries = [];
      rewardList.forEach((reward) => {
        const poolShare = rewardPoolChance(overallRewardCount || rewardList.length);
        if (reward.kind === "collection" && Array.isArray(reward.items) && reward.items.length) {
          reward.items.forEach((item) => {
            const displayPrice = preferredValue(item);
            if (!Number.isFinite(Number(displayPrice)) || Number(displayPrice) <= 0) {
              return;
            }
            const displayWear = preferredWearForItem(item);
            const itemShare = Number(item.drop_chance_pct) || 0;
            entries.push({
              ...item,
              key: `${reward.id}-${item.name}-${displayWear || "tracked"}`,
              reward_kind: reward.kind,
              reward_name: reward.name,
              display_price: displayPrice,
              display_wear: displayWear,
              link_wear: displayWear,
              total_share_pct: poolShare != null ? poolShare * itemShare / 100 : itemShare
            });
          });
          return;
        }
        const liveValue = Number(reward.live_value);
        if (!Number.isFinite(liveValue) || liveValue <= 0) {
          return;
        }
        entries.push({
          key: `${reward.id}-reward`,
          name: reward.name,
          image: reward.image,
          reward_kind: reward.kind,
          reward_name: reward.name,
          display_price: liveValue,
          display_wear: kindLabel(reward.kind),
          link_wear: null,
          total_share_pct: poolShare || 0,
          href: buildMarketItemHref({
            market_hash_name: reward.market_hash_name || reward.name,
            name: reward.name,
            image: reward.image,
            kind: reward.kind
          })
        });
      });
      return entries.sort((left, right) => Number(right.display_price) - Number(left.display_price)).slice(0, limit);
    }
    function collectionItemsForReward(reward, overallRewardCount) {
      if (!reward || reward.kind !== "collection" || !Array.isArray(reward.items)) {
        return [];
      }
      const poolShare = rewardPoolChance(overallRewardCount);
      return reward.items.map((item) => {
        const displayPrice = preferredValue(item);
        const displayWear = preferredWearForItem(item);
        const inCollectionChance = Number(item.drop_chance_pct) || 0;
        const totalSharePct = poolShare != null ? poolShare * inCollectionChance / 100 : inCollectionChance;
        return {
          ...item,
          display_price: displayPrice,
          display_wear: displayWear,
          href: buildItemHref(item, displayWear),
          reward_name: reward.name,
          in_collection_chance_pct: inCollectionChance,
          total_share_pct: totalSharePct
        };
      }).filter((item) => Number.isFinite(Number(item.display_price))).sort((left, right) => Number(right.display_price) - Number(left.display_price));
    }
    function allSkinItemsFromRewards(rewards, overallRewardCount) {
      const rows = [];
      (Array.isArray(rewards) ? rewards : []).forEach((reward) => {
        collectionItemsForReward(reward, overallRewardCount).forEach((item) => {
          rows.push({
            ...item,
            key: `${reward.id}-${item.name}-${item.display_wear || "tracked"}`
          });
        });
      });
      return rows;
    }
    function careMediaToneStyle(tone) {
      const safe = tone || VISUAL_TONES.Mil_Spec;
      return {
        "--care-media-start": safe.start,
        "--care-media-end": safe.end,
        "--care-glow": safe.glow,
        "--care-accent": safe.accent || "#4B69FF",
        "--card-accent": safe.accent || "#4B69FF"
      };
    }
    function raritySortValue(item) {
      const rank = Number(item?.rarity_rank);
      if (Number.isFinite(rank)) return rank;
      const labels = ["Contraband", "Covert", "Classified", "Restricted", "Mil_Spec", "Industrial", "Consumer"];
      const index = labels.indexOf(String(item?.rarity || ""));
      return index >= 0 ? index : 99;
    }
    function simulateOffer(reward, rewardCount, sourceCatalog) {
      if (!reward) return null;
      const baseChance = rewardPoolChance(rewardCount);
      if (reward.kind === "collection" && Array.isArray(reward.items) && reward.items.length > 0) {
        const chosen = weightedPick(reward.items);
        if (chosen) {
          const sampledFloat = sampleFloat(chosen);
          const wear = wearFromFloat(sampledFloat);
          const price = pickWearPrice(chosen, wear) ?? preferredValue(chosen) ?? Number(reward.live_value);
          const itemChance = Number(chosen.drop_chance_pct) || 0;
          const totalChance = baseChance != null ? baseChance * itemChance / 100 : itemChance;
          const marketHash = wear ? `${chosen.name} (${wear})` : chosen.name;
          return {
            reward_id: reward.id,
            kind: reward.kind,
            rarity: chosen.rarity,
            reward_name: reward.name,
            title: chosen.name,
            subtitle: [wear, reward.name].filter(Boolean).join(" - "),
            image: chosen.image || reward.image,
            value: price,
            chance_pct: totalChance,
            is_best: false,
            market_hash_name: marketHash,
            href: buildItemHref(chosen, wear)
          };
        }
      }
      if (reward.kind === "graffiti" && Array.isArray(sourceCatalog?.graffiti) && sourceCatalog.graffiti.length > 0) {
        const chosen = sourceCatalog.graffiti[Math.floor(Math.random() * sourceCatalog.graffiti.length)];
        const graffitiHash = chosen.market_hash_name || chosen.name;
        return {
          reward_id: reward.id,
          kind: reward.kind,
          rarity: reward.kind,
          reward_name: reward.name,
          title: chosen.name,
          subtitle: chosen.catalog_subtitle || "Sealed Graffiti",
          image: chosen.image || reward.image,
          value: Number(chosen.live_value ?? chosen.market_price ?? reward.live_value),
          chance_pct: baseChance,
          is_best: false,
          market_hash_name: graffitiHash,
          href: buildMarketItemHref({
            market_hash_name: graffitiHash,
            name: chosen.name,
            image: chosen.image || reward.image,
            catalog_subtitle: chosen.catalog_subtitle || "Sealed Graffiti"
          })
        };
      }
      const fallbackHash = reward.market_hash_name || reward.name;
      return {
        reward_id: reward.id,
        kind: reward.kind,
        rarity: reward.kind,
        reward_name: reward.name,
        title: reward.name,
        subtitle: reward.kind === "graffiti" ? "One random graffiti spray from the active weekly pool" : reward.kind === "tool" ? "Weekly charm tool reward" : `${formatInt(reward.listings)} listings`,
        image: reward.image,
        value: Number(reward.live_value),
        chance_pct: baseChance,
        is_best: false,
        market_hash_name: fallbackHash,
        href: buildMarketItemHref({
          market_hash_name: fallbackHash,
          name: reward.name,
          image: reward.image,
          kind: reward.kind,
          catalog_subtitle: reward.catalog_subtitle
        })
      };
    }
    function simulateBoard(rewards, sourceCatalog) {
      if (!Array.isArray(rewards) || !rewards.length) {
        return { offers: [], chartOffers: [] };
      }
      const pool = [...rewards];
      const chartOffers = [];
      const seenExact = /* @__PURE__ */ new Set();
      const seenBase = /* @__PURE__ */ new Set();
      while (pool.length > 0 && chartOffers.length < DROP_CHART_SLOT_COUNT) {
        const index = Math.floor(Math.random() * pool.length);
        const reward = pool.splice(index, 1)[0];
        const offer = simulateOffer(reward, rewards.length, sourceCatalog);
        if (!offer) continue;
        const hash = marketHashFromOffer(offer);
        const exactKey = normalizeDropIdentity(hash);
        const baseKey = baseDropIdentity(hash);
        if (!exactKey || seenExact.has(exactKey) || seenBase.has(baseKey)) continue;
        seenExact.add(exactKey);
        if (baseKey) seenBase.add(baseKey);
        chartOffers.push(offer);
      }
      if (chartOffers.length < DROP_CHART_SLOT_COUNT) {
        const collections = rewards.filter((reward) => reward.kind === "collection" && Array.isArray(reward.items) && reward.items.length);
        let guard = 0;
        while (chartOffers.length < DROP_CHART_SLOT_COUNT && collections.length && guard < 48) {
          guard += 1;
          const reward = collections[guard % collections.length];
          const extra = simulateOffer(reward, rewards.length, sourceCatalog);
          if (!extra) continue;
          const hash = marketHashFromOffer(extra);
          const exactKey = normalizeDropIdentity(hash);
          const baseKey = baseDropIdentity(hash);
          if (!exactKey || seenExact.has(exactKey) || seenBase.has(baseKey)) continue;
          seenExact.add(exactKey);
          if (baseKey) seenBase.add(baseKey);
          chartOffers.push(extra);
        }
        const graffitiPool = Array.isArray(sourceCatalog?.graffiti) ? [...sourceCatalog.graffiti] : [];
        while (chartOffers.length < DROP_CHART_SLOT_COUNT && graffitiPool.length) {
          const chosen = graffitiPool.splice(Math.floor(Math.random() * graffitiPool.length), 1)[0];
          const extra = simulateOffer(
            { ...chosen, kind: "graffiti", id: chosen.id || chosen.market_hash_name || chosen.name },
            rewards.length,
            { graffiti: [chosen] }
          );
          if (!extra) continue;
          const hash = marketHashFromOffer(extra);
          const exactKey = normalizeDropIdentity(hash);
          const baseKey = baseDropIdentity(hash);
          if (!exactKey || seenExact.has(exactKey) || seenBase.has(baseKey)) continue;
          seenExact.add(exactKey);
          if (baseKey) seenBase.add(baseKey);
          chartOffers.push(extra);
        }
      }
      const offers = chartOffers.slice(0, BOARD_SLOT_COUNT);
      const topPickIndexes = new Set(
        [...offers].map((offer, index) => ({ index, value: Number(offer.value) || 0 })).sort((left, right) => right.value - left.value).slice(0, Math.min(2, offers.length)).map((entry) => entry.index)
      );
      return {
        offers: offers.map((offer, index) => ({
          ...offer,
          is_best: topPickIndexes.has(index) && (Number(offer.value) || 0) > 0
        })),
        chartOffers
      };
    }
    function cardSubtitleForReward(reward) {
      const topDrop = mostExpensiveDrops(reward, 1)[0];
      if (topDrop) {
        return topDrop.display_wear ? `${topDrop.name} - ${topDrop.display_wear}` : topDrop.name;
      }
      return `${reward.items_count || 0} tracked drops`;
    }
    function rewardSubtitle(reward) {
      if (reward?.catalog_subtitle) {
        return reward.catalog_subtitle;
      }
      switch (reward?.kind) {
        case "collection":
          return `${reward?.items_count || 0} possible skins`;
        case "case":
          return "Active weekly case reward";
        case "terminal":
          return "Weekly terminal reward";
        case "graffiti":
          return "One random graffiti spray from the active weekly care package pool";
        case "tool":
          return "Weekly charm tool reward";
        default:
          return cardSubtitleForReward(reward);
      }
    }
    function catalogRewardsForFilter(filterId, baseRewards, sourceCatalog) {
      const rewardList = Array.isArray(baseRewards) ? baseRewards : [];
      const graffitiCatalog = Array.isArray(sourceCatalog?.graffiti) ? sourceCatalog.graffiti : [];
      if (filterId === "graffiti") {
        return graffitiCatalog;
      }
      return rewardList.filter((reward) => filterId === "all" ? true : reward.kind === filterId);
    }
    function LoadingState() {
      return /* @__PURE__ */ React.createElement("div", { className: "care-loading care-panel" }, /* @__PURE__ */ React.createElement("strong", null, "Loading live care package data..."), /* @__PURE__ */ React.createElement("p", { style: { marginTop: 10, color: "#93a8c8", lineHeight: 1.6 } }, "Pulling the current active reward pool and fresh Steam market values."), /* @__PURE__ */ React.createElement("div", { className: "care-loading-grid" }, Array.from({ length: BOARD_SLOT_COUNT }).map((_, index) => /* @__PURE__ */ React.createElement("div", { key: index, className: "care-skeleton" }))));
    }
    function ImageOrPlaceholder({ src, alt, label }) {
      const [failed, setFailed] = useState(false);
      useEffect(() => {
        setFailed(false);
      }, [src]);
      return src && !failed ? /* @__PURE__ */ React.createElement("img", { src, alt, loading: "lazy", onError: () => setFailed(true) }) : /* @__PURE__ */ React.createElement("div", { className: "care-media-fallback", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("span", null, initials(label)));
    }
    function chartColorAt(index) {
      return DROP_CHART_COLORS[index % DROP_CHART_COLORS.length];
    }
    function chartColorForOffer(offer, chartItems, fallbackIndex) {
      const hash = normalizeDropIdentity(marketHashFromOffer(offer));
      const baseKey = baseDropIdentity(hash);
      const matchIndex = (Array.isArray(chartItems) ? chartItems : []).findIndex((item) => {
        const itemHash = normalizeDropIdentity(item.market_hash_name);
        return itemHash === hash || baseKey && baseDropIdentity(item.market_hash_name) === baseKey;
      });
      return chartColorAt(matchIndex >= 0 ? matchIndex : fallbackIndex);
    }
    function SimulatorCard({ offer, index, chartColor }) {
      if (!offer) return null;
      const tone = visualToneForOffer(offer);
      const subtitle = offer.subtitle || kindLabel(offer.kind);
      const footnote = formatRollOdds(offer.chance_pct) || kindLabel(offer.kind);
      const href = buildOfferHref(offer);
      const cardClass = classNames("care-market-card", "care-sim-card", offer.is_best && "best", href && "interactive");
      const cardStyle = {
        "--card-delay": `${index * 60}ms`,
        ...careMediaToneStyle(tone)
      };
      const cardBody = /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "care-card-media" }, chartColor ? /* @__PURE__ */ React.createElement("span", { className: "care-sim-chart-swatch", style: { background: chartColor }, "aria-hidden": "true" }) : null, /* @__PURE__ */ React.createElement(ImageOrPlaceholder, { src: offer.image, alt: offer.title, label: offer.title })), /* @__PURE__ */ React.createElement("div", { className: "care-card-body" }, /* @__PURE__ */ React.createElement("div", { className: "care-card-copy care-sim-copy" }, /* @__PURE__ */ React.createElement("h3", null, offer.title), /* @__PURE__ */ React.createElement("p", null, subtitle)), /* @__PURE__ */ React.createElement("div", { className: "care-card-value-stack" }, /* @__PURE__ */ React.createElement("strong", { className: "care-card-value" }, formatEuro(offer.value)), /* @__PURE__ */ React.createElement("span", { className: "care-card-footnote" }, footnote))));
      if (href) {
        return /* @__PURE__ */ React.createElement("a", { className: cardClass, style: cardStyle, href }, cardBody);
      }
      return /* @__PURE__ */ React.createElement("article", { className: cardClass, style: cardStyle }, cardBody);
    }
    function EmptySimulatorCard({ index }) {
      return /* @__PURE__ */ React.createElement(
        "article",
        {
          className: "care-market-card care-sim-card care-sim-card-empty",
          style: { "--card-delay": `${index * 60}ms` },
          "aria-hidden": "true"
        },
        /* @__PURE__ */ React.createElement("div", { className: "care-card-media" }, /* @__PURE__ */ React.createElement("span", { className: "care-sim-chart-swatch is-empty" })),
        /* @__PURE__ */ React.createElement("div", { className: "care-card-body" }, /* @__PURE__ */ React.createElement("div", { className: "care-card-copy care-sim-copy" }, /* @__PURE__ */ React.createElement("h3", null, "Empty slot"), /* @__PURE__ */ React.createElement("p", null, "Spin to fill")))
      );
    }
    function RewardCard({ reward, active = false, onClick = null }) {
      const tone = visualToneForReward(reward);
      const imageSrc = reward.kind === "collection" ? collectionLogoForReward(reward) : reward.image;
      const noteText = reward.catalog_only ? reward.kind === "graffiti" ? "Weekly spray reward" : `${formatInt(reward.listings || 0)} listings` : reward.kind === "graffiti" ? "1 random spray reward" : reward.kind === "tool" ? "1 charm remover tool" : reward.items_count ? `${reward.items_count} tracked` : reward.listings ? `${formatInt(reward.listings)} listings` : kindLabel(reward.kind);
      const interactive = typeof onClick === "function";
      const href = interactive ? "" : buildRewardHref(reward);
      const CardTag = interactive ? "button" : href ? "a" : "article";
      return /* @__PURE__ */ React.createElement(
        CardTag,
        {
          type: interactive ? "button" : void 0,
          href: !interactive && href ? href : void 0,
          className: classNames(
            "care-market-card",
            "care-reward-card",
            `kind-${reward.kind || "reward"}`,
            active && "active",
            (interactive || href) && "interactive"
          ),
          style: careMediaToneStyle(tone),
          onClick: onClick || void 0
        },
        /* @__PURE__ */ React.createElement("div", { className: "care-card-media" }, /* @__PURE__ */ React.createElement(ImageOrPlaceholder, { src: imageSrc, alt: reward.name, label: reward.name })),
        /* @__PURE__ */ React.createElement("div", { className: "care-card-body" }, /* @__PURE__ */ React.createElement("div", { className: "care-card-copy" }, /* @__PURE__ */ React.createElement("h3", null, reward.name), /* @__PURE__ */ React.createElement("p", null, rewardSubtitle(reward))), /* @__PURE__ */ React.createElement("div", { className: "care-card-value-stack" }, /* @__PURE__ */ React.createElement("strong", { className: "care-card-value" }, reward.live_value_display || "—"), /* @__PURE__ */ React.createElement("span", { className: "care-card-footnote" }, noteText)))
      );
    }
    function CollectionItemCard({ item }) {
      const tone = VISUAL_TONES[item?.rarity] || VISUAL_TONES.Mil_Spec;
      const detailText = [item.display_wear, item.rarity, item.reward_name].filter(Boolean).join(" - ");
      return /* @__PURE__ */ React.createElement(
        "a",
        {
          className: "care-topdrop-card",
          href: item.href || buildItemHref(item, item.display_wear),
          style: careMediaToneStyle(tone)
        },
        /* @__PURE__ */ React.createElement("div", { className: "care-topdrop-image" }, /* @__PURE__ */ React.createElement(ImageOrPlaceholder, { src: item.image, alt: item.name, label: item.name })),
        /* @__PURE__ */ React.createElement("div", { className: "care-card-body" }, /* @__PURE__ */ React.createElement("div", { className: "care-topdrop-copy" }, /* @__PURE__ */ React.createElement("h3", null, item.name), /* @__PURE__ */ React.createElement("p", null, detailText)), /* @__PURE__ */ React.createElement("div", { className: "care-card-value-stack" }, /* @__PURE__ */ React.createElement("strong", { className: "care-card-value" }, formatEuro(item.display_price))))
      );
    }
    const dropHistoryCache = /* @__PURE__ */ new Map();
    const DROP_CHART_HISTORY_DAYS = 365;
    function filterHistoryToRecentYear(points) {
      const list = Array.isArray(points) ? points : [];
      const cutoff = Date.now() - DROP_CHART_HISTORY_DAYS * 24 * 60 * 60 * 1e3;
      return list.filter((point) => Number(point?.x) >= cutoff);
    }
    function activityHistoryPoints(activity) {
      const byRange = activity?.sales_history_by_range || {};
      const raw = Array.isArray(byRange["1y"]) && byRange["1y"].length ? byRange["1y"] : Array.isArray(byRange.all) && byRange.all.length ? byRange.all : Array.isArray(activity?.sales_history) ? activity.sales_history : [];
      const cleaned = sanitizeHistoryOutliers(raw);
      const points = downsampleHistoryPoints(cleaned, 90).map((point) => {
        const date = String(point.date || "").slice(0, 10);
        const price = Number(point.price);
        const x = Date.parse(date);
        return Number.isFinite(x) && Number.isFinite(price) && price > 0 ? { x, y: price, date } : null;
      }).filter(Boolean);
      return filterHistoryToRecentYear(points);
    }
    const WEAR_SUFFIX_RE = /\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/i;
    async function fetchDropHistoryPoints(marketHashName, externalSignal, timeoutMs = 45e3) {
      const cacheKey = `${marketHashName}::1y`;
      const cached = dropHistoryCache.get(cacheKey);
      if (Array.isArray(cached)) return cached;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onExternalAbort = () => controller.abort();
      if (externalSignal) {
        if (externalSignal.aborted) controller.abort();
        else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      }
      try {
        const name = String(marketHashName || "").trim();
        const wearMatch = name.match(WEAR_SUFFIX_RE);
        const params = new URLSearchParams({
          lookup_name: name.replace(WEAR_SUFFIX_RE, "").trim(),
          display_name: name.replace(WEAR_SUFFIX_RE, "").trim(),
          wear: wearMatch ? wearMatch[1] : "",
          range: "1Y",
          source: "steam"
        });
        const response = await fetch(`get_market_chart_bundle.php?${params.toString()}`, {
          headers: { Accept: "application/json" },
          signal: controller.signal
        });
        if (!response.ok) throw new Error("history failed");
        const bundle = await response.json();
        const steamRows = Array.isArray(bundle?.series?.steam?.points) ? bundle.series.steam.points : [];
        const points = steamRows.length > 1 ? activityHistoryPoints({ sales_history: steamRows }) : [];
        dropHistoryCache.set(cacheKey, points);
        return points;
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        dropHistoryCache.set(cacheKey, []);
        return [];
      } finally {
        clearTimeout(timer);
        if (externalSignal) externalSignal.removeEventListener("abort", onExternalAbort);
      }
    }
    async function mapPool(items, concurrency, worker) {
      const list = Array.isArray(items) ? items : [];
      const limit = Math.max(1, Math.min(concurrency, list.length || 1));
      let cursor = 0;
      const runners = Array.from({ length: limit }, async () => {
        while (cursor < list.length) {
          const index = cursor;
          cursor += 1;
          await worker(list[index], index);
        }
      });
      await Promise.all(runners);
    }
    function getFullscreenElement() {
      return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
    }
    function requestElementFullscreen(el) {
      const fn = el?.requestFullscreen || el?.webkitRequestFullscreen || el?.msRequestFullscreen;
      if (typeof fn !== "function") return Promise.reject(new Error("Fullscreen API unavailable"));
      return Promise.resolve(fn.call(el));
    }
    function exitDocumentFullscreen() {
      const fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if (typeof fn !== "function") return Promise.resolve();
      return Promise.resolve(fn.call(document));
    }
    const CARE_DROP_INTERACTION_MODE = "careDropX";
    function registerDropChartInteraction(ChartCtor) {
      const modes = ChartCtor?.Interaction?.modes;
      if (!modes || modes[CARE_DROP_INTERACTION_MODE]) return;
      modes[CARE_DROP_INTERACTION_MODE] = (chart, event, _options, useFinalPosition) => {
        const helpers = ChartCtor.helpers || {};
        const position = Number.isFinite(event?.x) ? { x: event.x, y: event.y } : typeof helpers.getRelativePosition === "function" ? helpers.getRelativePosition(event, chart) : null;
        if (!position) return [];
        const items = [];
        chart.getSortedVisibleDatasetMetas().forEach((meta) => {
          let best = null;
          let bestDistance = Infinity;
          meta.data.forEach((element, index) => {
            const { x } = element.getProps(["x"], useFinalPosition);
            const distance = Math.abs(x - position.x);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = { element, datasetIndex: meta.index, index };
            }
          });
          if (best) items.push(best);
        });
        return items;
      };
    }
    const careDropCrosshairPlugin = {
      id: "careDropCrosshair",
      afterEvent(chart, args) {
        const event = args.event;
        const inside = event && event.type !== "mouseout" && Number.isFinite(event.x) && event.x >= chart.chartArea.left && event.x <= chart.chartArea.right;
        const next = inside ? event.x : null;
        if (chart.$careCrosshairX !== next) {
          chart.$careCrosshairX = next;
          args.changed = true;
        }
      },
      afterDatasetsDraw(chart) {
        const x = chart.$careCrosshairX;
        if (!Number.isFinite(x)) return;
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.strokeStyle = "rgba(148, 163, 184, 0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      }
    };
    function DropComparisonChart({ items = [] }) {
      const hostRef = useRef(null);
      const chartRef = useRef(null);
      const panelRef = useRef(null);
      const unlockRef = useRef(null);
      const requestIdRef = useRef(0);
      const [series, setSeries] = useState([]);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState("");
      const [fullscreen, setFullscreen] = useState(false);
      const [cssFullscreen, setCssFullscreen] = useState(false);
      const itemKey = useMemo(
        () => items.map((item) => item.market_hash_name).join("|"),
        [items]
      );
      useEffect(() => {
        if (!items.length) {
          setSeries([]);
          setError("");
          setLoading(false);
          return void 0;
        }
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        const controller = new AbortController();
        const isActive = () => requestIdRef.current === requestId;
        const seed = items.map((item, index) => ({
          ...item,
          color: chartColorAt(index),
          points: Array.isArray(dropHistoryCache.get(`${item.market_hash_name}::1y`)) ? dropHistoryCache.get(`${item.market_hash_name}::1y`) : []
        }));
        setSeries(seed);
        setError("");
        const hasCachedSeries = seed.some((row) => row.points.length > 1);
        setLoading(!hasCachedSeries);
        (async () => {
          const next = seed.map((row) => ({ ...row, points: row.points.slice() }));
          let settled = 0;
          try {
            await mapPool(items, 3, async (item, index) => {
              if (!isActive()) return;
              if (!(Number(item.value) > 0)) {
                settled += 1;
                return;
              }
              try {
                const points = await fetchDropHistoryPoints(item.market_hash_name, controller.signal);
                if (!isActive()) return;
                next[index] = {
                  ...next[index],
                  points
                };
              } catch (fetchError) {
                if (fetchError?.name === "AbortError" || !isActive()) return;
                next[index] = {
                  ...next[index],
                  points: Array.isArray(dropHistoryCache.get(`${item.market_hash_name}::1y`)) ? dropHistoryCache.get(`${item.market_hash_name}::1y`) : []
                };
              }
              settled += 1;
              if (!isActive()) return;
              setSeries(next.map((row) => ({ ...row, points: row.points.slice() })));
              if (next.some((row) => row.points.length > 1) || settled >= items.length) {
                setLoading(false);
              }
            });
          } catch (_error) {
          }
          if (!isActive()) return;
          setSeries(next.map((row) => ({ ...row, points: row.points.slice() })));
          setLoading(false);
          if (!next.some((row) => row.points.length > 1)) {
            setError("Steam price history is not available for these drops yet.");
          } else {
            setError("");
          }
        })();
        return () => {
          if (requestIdRef.current === requestId) {
            requestIdRef.current += 1;
          }
          controller.abort();
        };
      }, [itemKey]);
      useEffect(() => {
        const host = hostRef.current;
        if (!host) return void 0;
        let cancelled = false;
        const destroyChart = () => {
          if (chartRef.current) {
            try {
              chartRef.current.destroy();
            } catch (_error) {
            }
            chartRef.current = null;
          }
          host.innerHTML = "";
        };
        const drawable = series.filter((row) => row.points.length > 1);
        if (!drawable.length) {
          destroyChart();
          return void 0;
        }
        const ensure = typeof ensureChartJs === "function" ? ensureChartJs() : typeof window.Chart === "function" ? Promise.resolve(window.Chart) : Promise.reject(new Error("Chart.js loader unavailable"));
        ensure.then((ChartCtor) => {
          if (cancelled || !hostRef.current || typeof ChartCtor !== "function") {
            throw new Error("Chart.js unavailable");
          }
          destroyChart();
          registerDropChartInteraction(ChartCtor);
          const startXs = drawable.map((row) => Number(row.points[0]?.x)).filter(Number.isFinite);
          const endXs = drawable.map((row) => Number(row.points[row.points.length - 1]?.x)).filter(Number.isFinite);
          const axisMinX = startXs.length ? Math.min(...startXs) : void 0;
          const axisMaxX = endXs.length ? Math.max(...endXs) : void 0;
          const alignedPoints = (points) => {
            if (!Number.isFinite(axisMinX) || !points.length) return points;
            const first = points[0];
            if (Number(first.x) <= axisMinX) return points;
            return [{ x: axisMinX, y: first.y, date: first.date, carried: true }, ...points];
          };
          const datasets = drawable.map((row) => ({
            label: row.title,
            data: alignedPoints(row.points),
            borderColor: row.color,
            backgroundColor: row.color,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBorderWidth: 2,
            tension: 0.25,
            spanGaps: false
          }));
          const axisPrices = drawable.flatMap((row) => row.points.map((point) => Number(point.y))).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
          let yMin;
          let yMax;
          if (axisPrices.length) {
            const min = axisPrices[0];
            const max = axisPrices[axisPrices.length - 1];
            const p90 = axisPrices[Math.min(axisPrices.length - 1, Math.floor(axisPrices.length * 0.9))];
            if (p90 <= 3 && max <= 3) {
              yMin = Math.max(0, min * 0.92);
              yMax = 3;
            } else {
              const pad = Math.max((max - min) * 0.08, max * 0.05, 0.15);
              yMin = Math.max(0, min - pad * 0.35);
              yMax = Math.max(3, max + pad);
            }
          }
          const canvas = document.createElement("canvas");
          host.appendChild(canvas);
          try {
            chartRef.current = new ChartCtor(canvas, {
              type: "line",
              data: { datasets },
              plugins: [careDropCrosshairPlugin],
              options: {
                responsive: true,
                maintainAspectRatio: false,
                parsing: false,
                animation: false,
                interaction: {
                  mode: CARE_DROP_INTERACTION_MODE,
                  intersect: false,
                  axis: "x"
                },
                layout: {
                  padding: { top: 8, right: 8, bottom: 4, left: 4 }
                },
                plugins: {
                  legend: {
                    display: false
                  },
                  tooltip: {
                    enabled: false,
                    external(context) {
                      const { chart, tooltip } = context;
                      const parent = chart.canvas?.parentNode;
                      if (!parent) return;
                      let tip = parent.querySelector(".care-drop-chart-tooltip");
                      if (!tip) {
                        tip = document.createElement("div");
                        tip.className = "care-drop-chart-tooltip";
                        tip.setAttribute("role", "tooltip");
                        parent.appendChild(tip);
                      }
                      if (!tooltip || tooltip.opacity === 0 || !Array.isArray(tooltip.dataPoints) || !tooltip.dataPoints.length) {
                        tip.classList.remove("is-visible");
                        return;
                      }
                      const cursorX = chart.$careCrosshairX;
                      const xValue = Number.isFinite(cursorX) && chart.scales?.x ? chart.scales.x.getValueForPixel(cursorX) : tooltip.dataPoints[0]?.parsed?.x;
                      const title = Number.isFinite(xValue) ? new Date(xValue).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                      }) : "";
                      tip.innerHTML = "";
                      const titleEl = document.createElement("div");
                      titleEl.className = "care-drop-chart-tooltip-title";
                      titleEl.textContent = title;
                      tip.appendChild(titleEl);
                      const listEl = document.createElement("div");
                      listEl.className = "care-drop-chart-tooltip-list";
                      const ranked = tooltip.dataPoints.map((point) => ({
                        point,
                        value: Number(point.parsed?.y),
                        label: String(point.dataset?.label || "Drop")
                      })).sort((left2, right) => (Number.isFinite(right.value) ? right.value : -Infinity) - (Number.isFinite(left2.value) ? left2.value : -Infinity) || left2.label.localeCompare(right.label));
                      ranked.forEach(({ point, value, label }, index) => {
                        const row = document.createElement("div");
                        row.className = "care-drop-chart-tooltip-row";
                        const rank = document.createElement("span");
                        rank.className = "care-drop-chart-tooltip-rank";
                        rank.textContent = String(index + 1);
                        const swatch = document.createElement("span");
                        swatch.className = "care-drop-chart-tooltip-swatch";
                        const color = point.dataset?.borderColor || point.dataset?.backgroundColor || "#60a5fa";
                        swatch.style.background = String(color);
                        const name = document.createElement("span");
                        name.className = "care-drop-chart-tooltip-name";
                        name.textContent = label;
                        const price = document.createElement("strong");
                        price.className = "care-drop-chart-tooltip-price";
                        price.textContent = formatEuro(value);
                        row.appendChild(rank);
                        row.appendChild(swatch);
                        row.appendChild(name);
                        row.appendChild(price);
                        listEl.appendChild(row);
                      });
                      tip.appendChild(listEl);
                      tip.classList.add("is-visible");
                      const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas;
                      const tipWidth = tip.offsetWidth || 220;
                      const tipHeight = tip.offsetHeight || 120;
                      const canvasWidth = chart.canvas.clientWidth || 0;
                      const canvasHeight = chart.canvas.clientHeight || 0;
                      const anchorX = Number.isFinite(cursorX) ? cursorX : tooltip.caretX;
                      let left = positionX + anchorX + 14;
                      let top = positionY + tooltip.caretY - tipHeight / 2;
                      if (left + tipWidth > canvasWidth - 8) {
                        left = positionX + anchorX - tipWidth - 14;
                      }
                      if (left < 8) left = 8;
                      if (top < 8) top = 8;
                      if (top + tipHeight > canvasHeight - 8) {
                        top = Math.max(8, canvasHeight - tipHeight - 8);
                      }
                      tip.style.left = `${left}px`;
                      tip.style.top = `${top}px`;
                    }
                  }
                },
                scales: {
                  x: {
                    type: "linear",
                    ...Number.isFinite(axisMinX) ? { min: axisMinX } : {},
                    ...Number.isFinite(axisMaxX) ? { max: axisMaxX } : {},
                    ticks: {
                      color: "rgba(148, 163, 184, 0.82)",
                      maxTicksLimit: 8,
                      callback(value) {
                        const ms = Number(value);
                        if (!Number.isFinite(ms)) return "";
                        return new Date(ms).toLocaleDateString("en-GB", {
                          month: "short",
                          year: "2-digit"
                        });
                      }
                    },
                    grid: {
                      color: "rgba(148, 163, 184, 0.08)"
                    },
                    border: { display: false }
                  },
                  y: {
                    ...Number.isFinite(yMin) ? { min: yMin } : {},
                    ...Number.isFinite(yMax) ? { max: yMax } : {},
                    ticks: {
                      color: "rgba(148, 163, 184, 0.82)",
                      maxTicksLimit: 7,
                      callback(value) {
                        return formatEuro(value);
                      }
                    },
                    grid: {
                      color: "rgba(148, 163, 184, 0.08)"
                    },
                    border: { display: false }
                  }
                }
              }
            });
            if (!cancelled) setError("");
          } catch (chartError) {
            destroyChart();
            throw chartError;
          }
        }).catch((chartError) => {
          if (!cancelled) {
            setError(chartError?.message || "Unable to load chart library.");
          }
        });
        return () => {
          cancelled = true;
          destroyChart();
        };
      }, [series]);
      useEffect(() => {
        const chart = chartRef.current;
        if (!chart || typeof chart.resize !== "function") return void 0;
        const resize = () => {
          try {
            chart.resize();
          } catch (_error) {
          }
        };
        const frame = window.requestAnimationFrame(resize);
        const timer = window.setTimeout(resize, 80);
        window.addEventListener("resize", resize);
        return () => {
          window.cancelAnimationFrame(frame);
          window.clearTimeout(timer);
          window.removeEventListener("resize", resize);
        };
      }, [fullscreen, series]);
      useEffect(() => {
        const restoreAncestors = () => {
          const unlock = unlockRef.current;
          unlockRef.current = null;
          if (typeof unlock === "function") unlock();
          setCssFullscreen(false);
        };
        const syncFullscreen = () => {
          const panel = panelRef.current;
          const active = getFullscreenElement();
          if (panel && active === panel) {
            setFullscreen(true);
            return;
          }
          if (!active) {
            restoreAncestors();
            setFullscreen(false);
          }
        };
        const onKeyDown = (event) => {
          if (event.key !== "Escape") return;
          if (!unlockRef.current) return;
          restoreAncestors();
          setFullscreen(false);
        };
        document.addEventListener("fullscreenchange", syncFullscreen);
        document.addEventListener("webkitfullscreenchange", syncFullscreen);
        document.addEventListener("keydown", onKeyDown);
        return () => {
          document.removeEventListener("fullscreenchange", syncFullscreen);
          document.removeEventListener("webkitfullscreenchange", syncFullscreen);
          document.removeEventListener("keydown", onKeyDown);
          const active = getFullscreenElement();
          if (active && active === panelRef.current) {
            exitDocumentFullscreen().catch(() => void 0);
          }
          restoreAncestors();
        };
      }, []);
      const unlockOverflowAncestors = (node) => {
        const restored = [];
        let el = node?.parentElement || null;
        while (el && el !== document.documentElement) {
          if (el.style) {
            restored.push({
              el,
              overflow: el.style.getPropertyValue("overflow"),
              overflowX: el.style.getPropertyValue("overflow-x"),
              transform: el.style.getPropertyValue("transform")
            });
            el.style.setProperty("overflow", "visible", "important");
            el.style.setProperty("overflow-x", "visible", "important");
            el.style.setProperty("transform", "none", "important");
          }
          el = el.parentElement;
        }
        return () => {
          restored.forEach((entry) => {
            if (!entry.el?.style) return;
            if (entry.overflow) entry.el.style.setProperty("overflow", entry.overflow);
            else entry.el.style.removeProperty("overflow");
            if (entry.overflowX) entry.el.style.setProperty("overflow-x", entry.overflowX);
            else entry.el.style.removeProperty("overflow-x");
            if (entry.transform) entry.el.style.setProperty("transform", entry.transform);
            else entry.el.style.removeProperty("transform");
          });
        };
      };
      const applyCssFullscreen = (panel) => {
        if (!panel) return;
        if (typeof unlockRef.current === "function") unlockRef.current();
        unlockRef.current = unlockOverflowAncestors(panel);
        setCssFullscreen(true);
        setFullscreen(true);
      };
      const exitCssFullscreen = () => {
        const unlock = unlockRef.current;
        unlockRef.current = null;
        if (typeof unlock === "function") unlock();
        setCssFullscreen(false);
        setFullscreen(false);
      };
      const toggleFullscreen = () => {
        const panel = panelRef.current;
        if (!panel) return;
        const active = getFullscreenElement();
        if (active === panel) {
          exitDocumentFullscreen().catch(() => exitCssFullscreen());
          return;
        }
        if (cssFullscreen) {
          exitCssFullscreen();
          return;
        }
        requestElementFullscreen(panel).then(() => {
          setFullscreen(true);
        }).catch(() => {
          applyCssFullscreen(panel);
        });
      };
      if (!items.length) return null;
      const tracked = series.filter((row) => row.points.length > 1).length;
      const emptySlotCount = Math.max(0, DROP_CHART_SLOT_COUNT - items.length);
      return /* @__PURE__ */ React.createElement(
        "section",
        {
          className: classNames("care-details", "care-panel", "care-drop-chart-panel", cssFullscreen && "is-native-fullscreen"),
          ref: panelRef
        },
        /* @__PURE__ */ React.createElement("div", { className: "care-section-title-row care-section-title-row-inside" }, /* @__PURE__ */ React.createElement("h2", { className: "care-section-title" }, "Price drop comparison"), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: classNames("care-chart-fullscreen-btn", fullscreen && "active"),
            "aria-label": fullscreen ? "Exit fullscreen for Price drop comparison" : "Open Price drop comparison in fullscreen",
            title: fullscreen ? "Exit fullscreen" : "Open fullscreen",
            onClick: toggleFullscreen
          },
          /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${fullscreen ? "fa-compress" : "fa-expand"}`, "aria-hidden": "true" })
        )),
        /* @__PURE__ */ React.createElement("div", { className: "care-drop-chart-shell" }, loading && !tracked && /* @__PURE__ */ React.createElement("div", { className: "care-drop-chart-status" }, "Loading price history…"), !loading && error && /* @__PURE__ */ React.createElement("div", { className: "care-drop-chart-status care-drop-chart-error" }, error), /* @__PURE__ */ React.createElement("div", { className: "care-drop-chart-canvas-wrap", ref: hostRef })),
        /* @__PURE__ */ React.createElement("div", { className: "care-drop-chart-legend-list" }, items.map((item, index) => {
          const href = buildMarketItemHref(item);
          const chipClass = "care-drop-chart-chip";
          const chipContent = /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
            "span",
            {
              className: "care-drop-chart-swatch",
              style: { background: chartColorAt(index) }
            }
          ), item.image ? /* @__PURE__ */ React.createElement("img", { src: item.image, alt: "", loading: "lazy" }) : null, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, item.title), /* @__PURE__ */ React.createElement("span", null, formatEuro(item.value))));
          return href ? /* @__PURE__ */ React.createElement("a", { key: item.market_hash_name, className: chipClass, href }, chipContent) : /* @__PURE__ */ React.createElement("div", { key: item.market_hash_name, className: chipClass }, chipContent);
        }), Array.from({ length: emptySlotCount }).map((_, index) => /* @__PURE__ */ React.createElement(
          "div",
          {
            key: `empty-slot-${index}`,
            className: "care-drop-chart-chip care-drop-chart-chip-empty",
            "aria-hidden": "true"
          },
          /* @__PURE__ */ React.createElement("span", { className: "care-drop-chart-swatch" }),
          /* @__PURE__ */ React.createElement("div", { className: "care-drop-chart-empty-thumb" }),
          /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("strong", null, "Empty slot"), /* @__PURE__ */ React.createElement("span", null, "Spin to fill"))
        )))
      );
    }
    function CareMenu({ label, options, value, onChange }) {
      const [open, setOpen] = useState(false);
      const menuRef = useRef(null);
      useEffect(() => {
        if (!open) return void 0;
        const onOutside = (event) => {
          if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onOutside);
        return () => document.removeEventListener("mousedown", onOutside);
      }, [open]);
      const currentLabel = (options.find((option) => option.id === value) || options[0])?.label || "";
      return /* @__PURE__ */ React.createElement("div", { className: "roi-select-shell compact care-menu-shell", "aria-label": label || void 0 }, /* @__PURE__ */ React.createElement("div", { className: "roi-type-menu", ref: menuRef }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: classNames("roi-type-trigger", open && "open"),
          onClick: () => setOpen((current) => !current),
          "aria-label": label || currentLabel
        },
        /* @__PURE__ */ React.createElement("span", null, currentLabel),
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-down" })
      ), /* @__PURE__ */ React.createElement("div", { className: classNames("roi-type-dropdown", open && "open") }, options.map((option) => /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          key: option.id,
          className: classNames("roi-type-option", value === option.id && "active"),
          onClick: () => {
            onChange(option.id);
            setOpen(false);
          }
        },
        option.label
      )))));
    }
    function sortCatalogEntries(list, sortId, priceOf) {
      const rows = [...Array.isArray(list) ? list : []];
      rows.sort((left, right) => {
        if (sortId === "name_asc") {
          return String(left.name || left.title || "").localeCompare(String(right.name || right.title || ""));
        }
        if (sortId === "rarity_desc") {
          const rarityDiff = raritySortValue(left) - raritySortValue(right);
          if (rarityDiff !== 0) return rarityDiff;
        }
        const leftPrice = Number(priceOf(left)) || 0;
        const rightPrice = Number(priceOf(right)) || 0;
        if (sortId === "price_asc") return leftPrice - rightPrice;
        return rightPrice - leftPrice;
      });
      return rows;
    }
    function matchesCatalogQuery(entry, query) {
      const needle = String(query || "").trim().toLowerCase();
      if (!needle) return true;
      const haystack = [
        entry?.name,
        entry?.title,
        entry?.subtitle,
        entry?.catalog_subtitle,
        entry?.display_wear,
        entry?.rarity,
        entry?.reward_name,
        entry?.kind
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    }
    function SkinItemsGrid({ items }) {
      if (!Array.isArray(items) || !items.length) return null;
      return /* @__PURE__ */ React.createElement("div", { className: "care-topdrops-grid care-collection-grid care-skins-grid" }, items.map((item) => /* @__PURE__ */ React.createElement(CollectionItemCard, { key: item.key || `${item.name}-${item.display_wear || "tracked"}`, item })));
    }
    function CarePackagePage() {
      const [payload, setPayload] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState("");
      const [offers, setOffers] = useState([]);
      const [chartOffers, setChartOffers] = useState([]);
      const [rollHistory, setRollHistory] = useState([]);
      const [spinCount, setSpinCount] = useState(0);
      const [spinButtonLabel, setSpinButtonLabel] = useState(() => nextSpinVariant(""));
      const [isPhone, setIsPhone] = useState(
        () => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches
      );
      const [mDealtAt, setMDealtAt] = useState(() => Date.now());
      const [mFading, setMFading] = useState(false);
      const [mShowAllDrop, setMShowAllDrop] = useState(false);
      useEffect(() => {
        if (typeof window.matchMedia !== "function") return void 0;
        const query = window.matchMedia("(max-width: 767px)");
        const sync = (event) => setIsPhone(event.matches);
        query.addEventListener("change", sync);
        return () => query.removeEventListener("change", sync);
      }, []);
      const [catalogFilter, setCatalogFilter] = useState("skins");
      const [catalogQuery, setCatalogQuery] = useState("");
      const [catalogSort, setCatalogSort] = useState("rarity_desc");
      useEffect(() => {
        let alive = true;
        setLoading(true);
        fetch("get_carepackage_data.php", { headers: { Accept: "application/json" } }).then((response) => response.ok ? response.json() : Promise.reject(new Error("Failed to load care package data."))).then((data) => {
          if (!alive) return;
          setPayload(data);
          setError("");
        }).catch((fetchError) => {
          if (!alive) return;
          setError(fetchError.message || "Unable to load care package data.");
        }).finally(() => {
          if (alive) setLoading(false);
        });
        return () => {
          alive = false;
        };
      }, []);
      const sourcePayload = payload?.sources?.steam || null;
      const rewards = sourcePayload?.rewards || EMPTY_REWARDS;
      const sourceCatalog = sourcePayload?.catalog || EMPTY_CATALOG;
      const simRewards = useMemo(
        () => rewards.filter((reward) => !reward.catalog_only),
        [rewards]
      );
      const collectionRewards = useMemo(
        () => rewards.filter((reward) => !reward.sim_only && !reward.catalog_only && reward.kind === "collection" && Array.isArray(reward.items) && reward.items.length > 0),
        [rewards]
      );
      useEffect(() => {
        if (!simRewards.length) {
          setOffers([]);
          setChartOffers([]);
          setRollHistory([]);
          setSpinCount(0);
          return;
        }
        const initialRoll = simulateBoard(simRewards, sourceCatalog);
        setOffers(initialRoll.offers);
        setChartOffers(initialRoll.chartOffers);
        setSpinCount(1);
        setRollHistory(recordRoll([], initialRoll.offers, 1));
      }, [simRewards, sourceCatalog]);
      const boardValue = useMemo(
        () => bestPickValue(offers, 2),
        [offers]
      );
      const recentRolls = useMemo(
        () => [...rollHistory].sort((left, right) => (Number(right.rolled_at) || 0) - (Number(left.rolled_at) || 0)),
        [rollHistory]
      );
      const dropChartItems = useMemo(
        () => collectDropChartItems(
          chartOffers.length ? chartOffers : offers,
          recentRolls,
          DROP_CHART_SLOT_COUNT
        ),
        [chartOffers, offers, recentRolls]
      );
      const catalogRewards = useMemo(
        () => catalogRewardsForFilter(catalogFilter, simRewards, sourceCatalog),
        [simRewards, sourceCatalog, catalogFilter]
      );
      const visibleCatalogRewards = useMemo(() => {
        if (catalogFilter === "skins") return [];
        const filtered = catalogRewards.filter((reward) => matchesCatalogQuery(reward, catalogQuery));
        return sortCatalogEntries(filtered, catalogSort, (reward) => reward.live_value);
      }, [catalogRewards, catalogQuery, catalogSort, catalogFilter]);
      const allSkinItems = useMemo(
        () => allSkinItemsFromRewards(collectionRewards, simRewards.length),
        [collectionRewards, simRewards.length]
      );
      const visibleSkinItems = useMemo(() => {
        if (catalogFilter !== "skins") return [];
        const filtered = allSkinItems.filter((item) => matchesCatalogQuery(item, catalogQuery));
        return sortCatalogEntries(filtered, catalogSort, (item) => item.display_price);
      }, [allSkinItems, catalogFilter, catalogQuery, catalogSort]);
      const catalogEmpty = catalogFilter === "skins" ? !visibleSkinItems.length : !visibleCatalogRewards.length;
      function dealPackage() {
        const nextSpin = spinCount + 1;
        const nextRoll = simulateBoard(simRewards, sourceCatalog);
        setOffers(nextRoll.offers);
        setChartOffers(nextRoll.chartOffers);
        setSpinCount(nextSpin);
        setRollHistory((current) => recordRoll(current, nextRoll.offers, nextSpin));
        setSpinButtonLabel((currentLabel) => nextSpinVariant(currentLabel));
        setMDealtAt(Date.now());
      }
      function mRelative(ts) {
        const secs = Math.max(0, Math.round((Date.now() - ts) / 1e3));
        if (secs < 45) return "just now";
        const mins = Math.round(secs / 60);
        if (mins < 60) return mins + (mins === 1 ? " minute ago" : " minutes ago");
        const hours = Math.round(mins / 60);
        return hours + (hours === 1 ? " hour ago" : " hours ago");
      }
      function mOdds(pct) {
        const value = Number(pct);
        if (!Number.isFinite(value) || value <= 0) return null;
        return Math.max(1, Math.round(100 / value));
      }
      function mPrice(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return "—";
        try {
          return n.toLocaleString(void 0, { style: "currency", currency: "EUR" });
        } catch (e) {
          return "€" + n.toFixed(2);
        }
      }
      if (isPhone && !loading && !error) {
        const dealt = (offers || []).slice(0, 4);
        const ranked = dealt.slice().sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
        const keepKeys = new Set(ranked.slice(0, 2).map((o) => o.market_hash_name || o.title));
        const keepTotal = ranked.slice(0, 2).reduce((sum, o) => sum + (Number(o.value) || 0), 0);
        const wholeTotal = dealt.reduce((sum, o) => sum + (Number(o.value) || 0), 0);
        const dropRows = catalogFilter === "skins" ? visibleCatalogSkins : visibleCatalogRewards;
        const shownDrop = mShowAllDrop ? dropRows : dropRows.slice(0, 8);
        return /* @__PURE__ */ React.createElement("div", { className: "care-page mcare" }, /* @__PURE__ */ React.createElement("header", { className: "mcare-head" }, /* @__PURE__ */ React.createElement("h1", null, "Care Package"), /* @__PURE__ */ React.createElement("p", null, "Simulate this week's drop from the active pool. You get 4 items and keep 2.")), /* @__PURE__ */ React.createElement("section", { className: "mcare-card" }, /* @__PURE__ */ React.createElement("div", { className: "mcare-cardtop" }, /* @__PURE__ */ React.createElement("span", { className: "u-label mcare-label" }, "Your package"), /* @__PURE__ */ React.createElement("span", { className: "mcare-when" }, "Dealt ", mRelative(mDealtAt))), /* @__PURE__ */ React.createElement("div", { className: classNames("mcare-tiles", mFading && "is-fading") }, dealt.map((offer) => {
          const keep = keepKeys.has(offer.market_hash_name || offer.title);
          const odds = mOdds(offer.chance_pct);
          return /* @__PURE__ */ React.createElement(
            "a",
            {
              className: classNames("mcare-tile", keep && "is-keep"),
              key: (offer.market_hash_name || offer.title) + String(offer.value),
              href: offer.href || "#"
            },
            keep ? /* @__PURE__ */ React.createElement("span", { className: "mcare-keep" }, "Keep") : null,
            /* @__PURE__ */ React.createElement("span", { className: "mcare-tileshot" }, offer.image ? /* @__PURE__ */ React.createElement("img", { src: offer.image, alt: "", loading: "lazy" }) : null),
            /* @__PURE__ */ React.createElement("span", { className: "mcare-tiletype" }, offer.subtitle || offer.reward_name || ""),
            /* @__PURE__ */ React.createElement("span", { className: "mcare-tilename" }, offer.title),
            /* @__PURE__ */ React.createElement("span", { className: "mcare-tilefoot" }, /* @__PURE__ */ React.createElement("span", { className: "mcare-tileprice" }, mPrice(offer.value)), odds ? /* @__PURE__ */ React.createElement("span", { className: "mcare-tileodds" }, "1 in ", odds) : null)
          );
        })), /* @__PURE__ */ React.createElement("div", { className: "mcare-summary" }, /* @__PURE__ */ React.createElement("span", { className: "mcare-sumcopy" }, /* @__PURE__ */ React.createElement("strong", null, "Best 2 picks"), /* @__PURE__ */ React.createElement("small", null, "Whole package ", mPrice(wholeTotal))), /* @__PURE__ */ React.createElement("span", { className: "mcare-sumtotal" }, mPrice(keepTotal))), /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            className: "mcare-deal",
            onClick: () => {
              let reduced = false;
              try {
                reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              } catch (e) {
              }
              if (reduced) {
                dealPackage();
                return;
              }
              setMFading(true);
              window.setTimeout(() => {
                dealPackage();
                setMFading(false);
              }, 150);
            }
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-rotate-right", "aria-hidden": "true" }),
          " Deal a new package"
        )), /* @__PURE__ */ React.createElement("section", { className: "mcare-card" }, /* @__PURE__ */ React.createElement("div", { className: "mcare-cardtop" }, /* @__PURE__ */ React.createElement("h2", { className: "mcare-title" }, "Price trend, 30 days"), /* @__PURE__ */ React.createElement("span", { className: "mcare-when" }, "Dealt items")), /* @__PURE__ */ React.createElement(DropComparisonChart, { items: chartOffers })), /* @__PURE__ */ React.createElement("section", { className: "mcare-sec" }, /* @__PURE__ */ React.createElement("div", { className: "mcare-cardtop" }, /* @__PURE__ */ React.createElement("h2", { className: "mcare-title" }, "Active drop"), /* @__PURE__ */ React.createElement("span", { className: "mcare-when" }, dropRows.length, " items")), /* @__PURE__ */ React.createElement("div", { className: "mcare-chips", role: "group", "aria-label": "Active drop filter" }, [
          { id: "skins", label: "Skins" },
          { id: "all", label: "All" },
          { id: "stickers", label: "Stickers" },
          { id: "cases", label: "Cases" },
          { id: "charms", label: "Charms" }
        ].map((chip) => /* @__PURE__ */ React.createElement(
          "button",
          {
            key: chip.id,
            type: "button",
            className: classNames("mcare-chip", catalogFilter === chip.id && "is-active"),
            "aria-pressed": catalogFilter === chip.id,
            onClick: () => {
              setCatalogFilter(chip.id);
              setMShowAllDrop(false);
            }
          },
          chip.label
        ))), /* @__PURE__ */ React.createElement("div", { className: "mcare-oddsrow" }, /* @__PURE__ */ React.createElement("span", null, "Odds are per item in the pool"), /* @__PURE__ */ React.createElement(
          "select",
          {
            className: "mcare-sort",
            "aria-label": "Sort the active drop",
            value: catalogSort,
            onChange: (event) => setCatalogSort(event.target.value)
          },
          /* @__PURE__ */ React.createElement("option", { value: "price_desc" }, "Highest price"),
          /* @__PURE__ */ React.createElement("option", { value: "price_asc" }, "Lowest price"),
          /* @__PURE__ */ React.createElement("option", { value: "rarity_desc" }, "Best odds"),
          /* @__PURE__ */ React.createElement("option", { value: "name_asc" }, "Name")
        )), /* @__PURE__ */ React.createElement("div", { className: "mcare-list" }, shownDrop.map((row, index) => {
          const name = row.display_name || row.name || row.title || "";
          const price = row.display_price != null ? row.display_price : row.live_value;
          const odds = mOdds(row.total_share_pct != null ? row.total_share_pct : row.chance_pct);
          return /* @__PURE__ */ React.createElement("a", { className: "mcare-row", key: name + index, href: row.href || "#" }, /* @__PURE__ */ React.createElement("span", { className: "mcare-rowshot" }, row.image ? /* @__PURE__ */ React.createElement("img", { src: row.image, alt: "", loading: "lazy" }) : null), /* @__PURE__ */ React.createElement("span", { className: "mcare-rowbody" }, /* @__PURE__ */ React.createElement("span", { className: "mcare-rowname" }, name), /* @__PURE__ */ React.createElement("span", { className: "mcare-rowtype" }, row.subtitle || row.rarity || "")), /* @__PURE__ */ React.createElement("span", { className: "mcare-rowprice" }, /* @__PURE__ */ React.createElement("span", { className: "mcare-rowval" }, mPrice(price)), odds ? /* @__PURE__ */ React.createElement("span", { className: "mcare-rowodds" }, "1 in ", odds) : null));
        }), !shownDrop.length ? /* @__PURE__ */ React.createElement("p", { className: "mcare-empty" }, "No items in this part of the pool.") : null), dropRows.length > 8 ? /* @__PURE__ */ React.createElement("button", { type: "button", className: "mcare-more", onClick: () => setMShowAllDrop((v) => !v) }, mShowAllDrop ? "Show fewer items" : "Show all " + dropRows.length + " items") : null));
      }
      return /* @__PURE__ */ React.createElement("div", { className: "care-page" }, /* @__PURE__ */ React.createElement("div", { className: "care-shell" }, loading ? /* @__PURE__ */ React.createElement(LoadingState, null) : error ? /* @__PURE__ */ React.createElement("div", { className: "care-error care-panel" }, /* @__PURE__ */ React.createElement("strong", null, "Care package feed unavailable."), /* @__PURE__ */ React.createElement("p", { style: { marginTop: 10, color: "#98aecf", lineHeight: 1.6 } }, error)) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("section", { className: "care-roll-board care-panel" }, /* @__PURE__ */ React.createElement("div", { className: "care-sim-grid care-roll-grid" }, Array.from({ length: BOARD_SLOT_COUNT }).map((_, index) => {
        const offer = offers[index];
        if (!offer) {
          return /* @__PURE__ */ React.createElement(EmptySimulatorCard, { key: `empty-board-${index}`, index });
        }
        return /* @__PURE__ */ React.createElement(
          SimulatorCard,
          {
            key: `${offer.reward_id}-${offer.title}-${index}`,
            offer,
            index,
            chartColor: chartColorForOffer(offer, dropChartItems, index)
          }
        );
      })), /* @__PURE__ */ React.createElement("div", { className: "care-roll-footer" }, /* @__PURE__ */ React.createElement("div", { className: "care-roll-actions" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          className: "care-button care-button-primary",
          onClick: dealPackage
        },
        spinButtonLabel
      )), /* @__PURE__ */ React.createElement("div", { className: "care-roll-worth" }, /* @__PURE__ */ React.createElement("strong", null, formatEuro(boardValue)), /* @__PURE__ */ React.createElement("span", { className: "care-roll-worth-note" }, "Best 2 picks")))), /* @__PURE__ */ React.createElement("div", { className: "care-insights-grid" }, /* @__PURE__ */ React.createElement(DropComparisonChart, { items: dropChartItems })), /* @__PURE__ */ React.createElement("section", { className: "care-catalog care-panel" }, /* @__PURE__ */ React.createElement("div", { className: "care-section-title-row care-section-title-row-inside" }, /* @__PURE__ */ React.createElement("h2", { className: "care-section-title" }, "Active Drop")), /* @__PURE__ */ React.createElement("div", { className: "care-catalog-chooser roi-toolbar-clean compact" }, /* @__PURE__ */ React.createElement("label", { className: "roi-search-shell", "aria-label": "Search care package items" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" }), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          value: catalogQuery,
          onChange: (event) => setCatalogQuery(event.target.value),
          placeholder: "Search items..."
        }
      )), /* @__PURE__ */ React.createElement(
        CareMenu,
        {
          label: "Type",
          options: FILTER_OPTIONS,
          value: catalogFilter,
          onChange: setCatalogFilter
        }
      ), /* @__PURE__ */ React.createElement(
        CareMenu,
        {
          label: "Sort",
          options: CATALOG_SORT_OPTIONS,
          value: catalogSort,
          onChange: setCatalogSort
        }
      )), catalogFilter !== "skins" ? /* @__PURE__ */ React.createElement("div", { className: "care-reward-grid care-whatyouget-grid" }, visibleCatalogRewards.map((reward) => /* @__PURE__ */ React.createElement(
        RewardCard,
        {
          key: reward.id,
          reward
        }
      ))) : /* @__PURE__ */ React.createElement(SkinItemsGrid, { items: visibleSkinItems }), catalogEmpty ? /* @__PURE__ */ React.createElement("div", { className: "care-catalog-empty" }, /* @__PURE__ */ React.createElement("strong", null, "No items match this filter"), /* @__PURE__ */ React.createElement("span", null, "Try another type or search term.")) : null))));
    }
    mountPage(
      /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement(CarePackagePage, null))
    );
  })();
})();
