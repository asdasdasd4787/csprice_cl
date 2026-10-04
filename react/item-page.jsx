(() => {
  const { useEffect, useRef, useState } = React;
  const { Layout, classNames, mountPage } = window.CS2React;

  const ALERTS_KEY = "cs2_price_alerts";

  function readAlerts() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(ALERTS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) { return []; }
  }

  function writeAlerts(alerts) {
    try { window.localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts)); } catch (_e) {}
  }

  function ItemPriceAlertModal({ itemName, onClose }) {
    const existing = readAlerts().find((a) => a.item_name === itemName) || null;
    const [minPrice, setMinPrice] = useState(existing ? String(existing.min_price ?? "") : "");
    const [maxPrice, setMaxPrice] = useState(existing ? String(existing.max_price ?? "") : "");
    const [email, setEmail] = useState(existing ? existing.email : "");
    const [saved, setSaved] = useState(false);

    useEffect(() => {
      const onKey = (e) => { if (e.key === "Escape") onClose(); };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const handleSave = () => {
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !trimmedEmail.includes("@")) { alert("Please enter a valid email address."); return; }
      const min = minPrice !== "" ? parseFloat(minPrice) : null;
      const max = maxPrice !== "" ? parseFloat(maxPrice) : null;
      if (min === null && max === null) { alert("Please enter at least one price threshold."); return; }
      const next = readAlerts().filter((a) => a.item_name !== itemName);
      next.push({ item_name: itemName, min_price: min, max_price: max, email: trimmedEmail, triggered: false, created_at: new Date().toISOString() });
      writeAlerts(next);
      setSaved(true);
      window.setTimeout(() => onClose(), 1400);
    };

    return (
      <div className="watchlist-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="watchlist-modal">
          <button className="watchlist-modal-close" type="button" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
          <div className="watchlist-modal-head">
            <div className="watchlist-modal-head-icon"><i className="fa-solid fa-bell" /></div>
            <div><h3>Price Alert</h3><p>{itemName}</p></div>
          </div>
          {saved ? (
            <div className="watchlist-modal-saved"><i className="fa-solid fa-circle-check" /> Alert saved! You'll be notified at <strong>{email}</strong>.</div>
          ) : (
            <>
              <div className="watchlist-modal-field">
                <label>Minimum Price (€)</label>
                <input type="number" min="0" step="0.01" placeholder="e.g. 25.00" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
                <span className="watchlist-modal-hint">Notify when price drops below this</span>
              </div>
              <div className="watchlist-modal-field">
                <label>Maximum Price (€)</label>
                <input type="number" min="0" step="0.01" placeholder="e.g. 75.00" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
                <span className="watchlist-modal-hint">Notify when price rises above this</span>
              </div>
              <div className="watchlist-modal-field">
                <label>Email Address</label>
                <input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="watchlist-modal-actions">
                <button className="watchlist-modal-btn primary" type="button" onClick={handleSave}><i className="fa-solid fa-bell" /> Set Alert</button>
                <button className="watchlist-modal-btn secondary" type="button" onClick={onClose}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const URL_PARAMS = new URLSearchParams(window.location.search);
  const ITEM_ID = URL_PARAMS.get("item_id") || 1;
  // The market_hash_name is the only identifier that is stable across the app DB
  // and the Supabase chart DB (numeric item_id differs between them). Always send
  // it as lookup_name so endpoints resolve the correct item/variant.
  const LOOKUP_NAME = (URL_PARAMS.get("market_hash_name") || URL_PARAMS.get("lookup_name") || "").trim();
  const LOOKUP_QS = LOOKUP_NAME ? `&lookup_name=${encodeURIComponent(LOOKUP_NAME)}` : "";
  const PRICE_SYMBOL = "\u20ac";
  const LOCAL_MODEL_URL = "assets/models/m4blendmodel.glb";

  const ITEM_DETAILS = {
    title: "M4A1-S | Vaporwave",
    collectionName: "Gallery Collection",
    collectionImage: "assets/collections/the_gallery_collection.png",
    image: "assets/weapons/rifles/m4a1s-vaporwave.webp",
    steamLink: "https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Vaporwave",
    description: "It has been custom painted with a Greco-Roman statue and other distorted imagery from a bygone era.",
    added: "4 October 2024",
    update: "The Armory"
  };

  const QUALITY_ROWS = [
    { wear: "Factory New", price: "—", stattrak: "—" },
    { wear: "Minimal Wear", price: "—", stattrak: "—" },
    { wear: "Field-Tested", price: "—", stattrak: "—" },
    { wear: "Well-Worn", price: "—", stattrak: "—" },
    { wear: "Battle-Scarred", price: "—", stattrak: "—" }
  ];

  const INSPECT_WEAR_OPTIONS = [
    { wear: "Factory New", short: "FN", label: "Factory New", buttonClass: "fn", image: "assets/weapons/rifles/m4a1s-vaporwave.webp" },
    { wear: "Minimal Wear", short: "MW", label: "Minimal Wear", buttonClass: "mw", image: "assets/weapons/rifles/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_3HDzaD_vh3oO57WCilkCIrujqNjsH_In7DZgYnWcAiR-MJshO6koDlN7vhsQyLi41HyS.png" },
    { wear: "Field-Tested", short: "FT", label: "Field-Tested", buttonClass: "ft", image: "assets/weapons/rifles/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_3HDzaD_vh3oO57WCilkCIqtjmMj4K3d3OWbVIkW5p4R7YDu0PrlIHjYbyzsweKi4 (1).png" },
    { wear: "Well-Worn", short: "WW", label: "Well-Worn", buttonClass: "ww", image: "assets/weapons/rifles/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_3HDzaD_vh3oO57WCilkCIqtjmMj4K3d3OWbVIkW5p4R7YDu0PrlIHjYbyzsweKi49GmC.png" },
    { wear: "Battle-Scarred", short: "BS", label: "Battle-Scarred", buttonClass: "bs", image: "assets/weapons/rifles/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_3HDzaD_vh3oO57WCilkCIvtjyTg8GodXmePFd2DpckFONe40W_lYbuYu7qslDajo.png" }
  ];

  const PRIMARY_MARKET_ROWS = [
    { name: "DMarket", image: "assets/markets/dmarket.png", basePrice: "139.51", fee: "2%", finalPrice: "142.30" },
    { name: "SkinMonkey", image: "assets/markets/skinmonkey.png", basePrice: "138.92", fee: "3%", finalPrice: "143.09" },
    { name: "Steam Market", image: "assets/markets/steam.png", basePrice: "141.23", fee: "15%", finalPrice: "162.41" },
    { name: "CS.Money", image: "assets/markets/csmoney.png", basePrice: "135.74", fee: "2%", finalPrice: "138.45", best: true },
    { name: "skinport", image: "assets/markets/skinport.png", basePrice: "157.04", fee: "1%", finalPrice: "158.61" }
  ];

  const EXTRA_MARKET_ROWS = [
    { name: "Buff.163", image: "assets/markets/buff.webp", basePrice: "137.85", fee: "2.5%", finalPrice: "141.30", extra: true },
    { name: "SkinSwap", image: "assets/markets/skins.png", basePrice: "139.26", fee: "2%", finalPrice: "142.05", extra: true },
    { name: "Lis-Skins", image: "assets/markets/lis-skins.jpg", basePrice: "140.10", fee: "2%", finalPrice: "142.90", extra: true },
    { name: "SkinBurn", image: "assets/markets/images.jfif", basePrice: "141.44", fee: "4%", finalPrice: "147.10", extra: true },
    { name: "Buff Market", image: "assets/markets/buff.webp", basePrice: "138.08", fee: "2.5%", finalPrice: "141.53", extra: true }
  ];

  const DEMO_PRICE_HISTORY = [
    { date: "2026-04-24", price: 147.39, volume: 139 },
    { date: "2026-04-25", price: 147.99, volume: 141 },
    { date: "2026-04-26", price: 148.72, volume: 141 },
    { date: "2026-04-27", price: 149.55, volume: 139 },
    { date: "2026-04-28", price: 150.42, volume: 136 },
    { date: "2026-04-29", price: 151.28, volume: 132 },
    { date: "2026-04-30", price: 152.08, volume: 129 },
    { date: "2026-05-01", price: 152.75, volume: 126 },
    { date: "2026-05-02", price: 153.27, volume: 125 },
    { date: "2026-05-03", price: 153.61, volume: 125 },
    { date: "2026-05-04", price: 153.74, volume: 127 },
    { date: "2026-05-05", price: 153.69, volume: 131 }
  ];

  const MARKET_COLORS = {
    CSFloat: "#ec4899",
    "Buff.163": "#f97316",
    "Buff Market": "#f97316",
    UUSkins: "#3b82f6",
    YouPin898: "#14b8a6",
    Steam: "#6366f1",
    Unknown: "#64748b",
    "White.Market": "#84cc16",
    "SkinSwap CN": "#f43f5e",
    Ecosteam: "#a78bfa",
    "CS.Money": "#fb7185",
    Skinport: "#22d3ee",
    DMarket: "#facc15",
    Other: "#0e7490"
  };

  const MARKETPLACE_META = {
    CSFloat: { short: "CF", region: "west" },
    "Buff.163": { short: "BF", image: "assets/markets/buff.webp?v=2", region: "east" },
    UUSkins: { short: "UU", image: "assets/markets/uuskins.png?v=1", region: "west" },
    YouPin898: { short: "YP", image: "assets/markets/youpin898.png?v=1", region: "east" },
    Steam: { short: "ST", image: "assets/markets/steam.png", region: "west" },
    "Steam Market": { canonical: "Steam", short: "ST", image: "assets/markets/steam.png", region: "west" },
    Unknown: { short: "UN", region: "west" },
    "White.Market": { short: "WM", region: "west" },
    "SkinSwap CN": { short: "SC", image: "assets/markets/skinswap-cn.jfif?v=1", region: "east" },
    Ecosteam: { short: "EC", image: "assets/markets/ecosteam.jpg?v=1", region: "west" },
    "CS.Money": { short: "CM", image: "assets/markets/csmoney.png", region: "west" },
    "CS.MONEY Bot": { canonical: "CS.Money", short: "CM", image: "assets/markets/csmoney.png", region: "west" },
    Skinport: { short: "SP", image: "assets/markets/skinport.png", region: "west" },
    skinport: { canonical: "Skinport", short: "SP", image: "assets/markets/skinport.png", region: "west" },
    DMarket: { short: "DM", image: "assets/markets/dmarket.png", region: "west" },
    SkinMonkey: { short: "SM", image: "assets/markets/skinmonkey.png", region: "west" },
    SkinSwap: { short: "SS", image: "assets/markets/images.jfif", region: "west" },
    "Lis-Skins": { short: "LS", image: "assets/markets/lis-skins.jpg", region: "west" },
    SkinBurn: { short: "SB", image: "assets/markets/skins.png", region: "west" },
    "Buff Market": { short: "BM", image: "assets/markets/buff.webp", region: "east" },
    SkinBaron: { short: "SB", region: "west" },
    Other: { short: "OT", region: "west" }
  };

  const BUY_ORDER_PRIORITY = ["Ecosteam", "Buff.163", "CSFloat", "Steam", "Skinport", "CS.Money"];
  const SELL_ORDER_PRIORITY = ["YouPin898", "Ecosteam", "SkinSwap CN", "UUSkins", "Buff.163", "Steam", "White.Market", "CS.Money"];

  const SUPPLY_FALLBACKS = {
    "1M": [
      { marketplace: "CSFloat", volume: 91, pct: 13.52 },
      { marketplace: "Buff.163", volume: 87, pct: 12.93 },
      { marketplace: "UUSkins", volume: 72, pct: 10.7 },
      { marketplace: "YouPin898", volume: 71, pct: 10.55 },
      { marketplace: "Steam", volume: 59, pct: 8.77 },
      { marketplace: "Skinport", volume: 47, pct: 6.98 },
      { marketplace: "Unknown", volume: 43, pct: 6.39 },
      { marketplace: "White.Market", volume: 39, pct: 5.79 },
      { marketplace: "SkinSwap CN", volume: 39, pct: 5.79 },
      { marketplace: "Ecosteam", volume: 37, pct: 5.5 },
      { marketplace: "CS.Money", volume: 30, pct: 4.46 },
      { marketplace: "Other", volume: 58, pct: 8.62 }
    ],
    "6M": [
      { marketplace: "CSFloat", volume: 516, pct: 15.16 },
      { marketplace: "Buff.163", volume: 489, pct: 14.37 },
      { marketplace: "UUSkins", volume: 414, pct: 12.17 },
      { marketplace: "YouPin898", volume: 391, pct: 11.49 },
      { marketplace: "Steam", volume: 354, pct: 10.4 },
      { marketplace: "Skinport", volume: 241, pct: 7.08 },
      { marketplace: "CS.Money", volume: 218, pct: 6.4 },
      { marketplace: "White.Market", volume: 196, pct: 5.76 },
      { marketplace: "SkinSwap CN", volume: 183, pct: 5.38 },
      { marketplace: "Ecosteam", volume: 167, pct: 4.91 },
      { marketplace: "Other", volume: 234, pct: 6.88 }
    ],
    "1Y": [
      { marketplace: "CSFloat", volume: 1048, pct: 16.05 },
      { marketplace: "Buff.163", volume: 981, pct: 15.02 },
      { marketplace: "UUSkins", volume: 779, pct: 11.93 },
      { marketplace: "YouPin898", volume: 741, pct: 11.35 },
      { marketplace: "Steam", volume: 698, pct: 10.69 },
      { marketplace: "Skinport", volume: 486, pct: 7.44 },
      { marketplace: "CS.Money", volume: 421, pct: 6.45 },
      { marketplace: "White.Market", volume: 386, pct: 5.91 },
      { marketplace: "SkinSwap CN", volume: 354, pct: 5.42 },
      { marketplace: "Ecosteam", volume: 319, pct: 4.89 },
      { marketplace: "Other", volume: 317, pct: 4.86 }
    ]
  };

  const LISTING_FALLBACKS = {
    CSFloat: { best_price: 158.61, fee_pct: 2.5, total_stock: 91, trend_pct: 3.2, wears: [{ wear: "Factory New", best_price: 158.61, stock: 22 }, { wear: "Minimal Wear", best_price: 143, stock: 18 }, { wear: "Field-Tested", best_price: 137, stock: 30 }, { wear: "Well-Worn", best_price: 129, stock: 12 }, { wear: "Battle-Scarred", best_price: 121, stock: 9 }] },
    "Buff.163": { best_price: 152.4, fee_pct: 2, total_stock: 87, trend_pct: 1.8, wears: [{ wear: "Factory New", best_price: 152.4, stock: 18 }, { wear: "Minimal Wear", best_price: 139, stock: 24 }, { wear: "Field-Tested", best_price: 133, stock: 25 }, { wear: "Well-Worn", best_price: 125, stock: 14 }, { wear: "Battle-Scarred", best_price: 117, stock: 6 }] },
    UUSkins: { best_price: 149.9, fee_pct: 3, total_stock: 72, trend_pct: -0.5, wears: [{ wear: "Factory New", best_price: 149.9, stock: 15 }, { wear: "Minimal Wear", best_price: 135, stock: 20 }, { wear: "Field-Tested", best_price: 128, stock: 22 }, { wear: "Well-Worn", best_price: 121, stock: 10 }, { wear: "Battle-Scarred", best_price: 113, stock: 5 }] },
    YouPin898: { best_price: 151, fee_pct: 2.5, total_stock: 71, trend_pct: 2.1, wears: [{ wear: "Factory New", best_price: 151, stock: 14 }, { wear: "Minimal Wear", best_price: 136, stock: 19 }, { wear: "Field-Tested", best_price: 130, stock: 21 }, { wear: "Well-Worn", best_price: 122, stock: 12 }, { wear: "Battle-Scarred", best_price: 114, stock: 5 }] },
    Steam: { best_price: 162.41, fee_pct: 15, total_stock: 59, trend_pct: 0.8, wears: [{ wear: "Factory New", best_price: 162.41, stock: 10 }, { wear: "Minimal Wear", best_price: 149, stock: 16 }, { wear: "Field-Tested", best_price: 140, stock: 18 }, { wear: "Well-Worn", best_price: 131, stock: 9 }, { wear: "Battle-Scarred", best_price: 123, stock: 6 }] },
    Skinport: { best_price: 157.04, fee_pct: 1, total_stock: 39, trend_pct: 1.1, wears: [{ wear: "Factory New", best_price: 157.04, stock: 16 }, { wear: "Minimal Wear", best_price: 141, stock: 11 }, { wear: "Field-Tested", best_price: 134, stock: 7 }, { wear: "Well-Worn", best_price: 126, stock: 3 }, { wear: "Battle-Scarred", best_price: 119, stock: 2 }] },
    "CS.Money": { best_price: 147.5, fee_pct: 2, total_stock: 30, trend_pct: -0.9, wears: [{ wear: "Factory New", best_price: 147.5, stock: 8 }, { wear: "Minimal Wear", best_price: 133, stock: 8 }, { wear: "Field-Tested", best_price: 126, stock: 7 }, { wear: "Well-Worn", best_price: 118, stock: 4 }, { wear: "Battle-Scarred", best_price: 111, stock: 3 }] },
    "White.Market": { best_price: 155.8, fee_pct: 4, total_stock: 39, trend_pct: 0.4, wears: [{ wear: "Factory New", best_price: 155.8, stock: 8 }, { wear: "Minimal Wear", best_price: 140, stock: 10 }, { wear: "Field-Tested", best_price: 133, stock: 12 }, { wear: "Well-Worn", best_price: 124, stock: 5 }, { wear: "Battle-Scarred", best_price: 116, stock: 4 }] },
    "SkinSwap CN": { best_price: 148.7, fee_pct: 3, total_stock: 39, trend_pct: -1.3, wears: [{ wear: "Factory New", best_price: 148.7, stock: 7 }, { wear: "Minimal Wear", best_price: 133.5, stock: 9 }, { wear: "Field-Tested", best_price: 127, stock: 14 }, { wear: "Well-Worn", best_price: 118, stock: 6 }, { wear: "Battle-Scarred", best_price: 110, stock: 3 }] },
    Ecosteam: { best_price: 150.2, fee_pct: 3.5, total_stock: 37, trend_pct: 0.4, wears: [{ wear: "Factory New", best_price: 150.2, stock: 6 }, { wear: "Minimal Wear", best_price: 135.5, stock: 9 }, { wear: "Field-Tested", best_price: 128.5, stock: 13 }, { wear: "Well-Worn", best_price: 120, stock: 5 }, { wear: "Battle-Scarred", best_price: 112, stock: 4 }] }
  };

  const PROVIDER_HISTORY = {
    labels: ["19 Mar", "22 Mar", "25 Mar", "28 Mar", "31 Mar", "3 Apr", "6 Apr", "9 Apr", "12 Apr", "15 Apr", "18 Apr", "21 Apr", "24 Apr", "27 Apr", "30 Apr", "5 May"],
    providers: [
      { name: "Buff.163", color: "#38bdf8", values: [160.8, 159.3, 157.7, 156.8, 155.4, 153.9, 153.1, 152.5, 151.8, 151.2, 151, 151.6, 152.4, 153.5, 154.4, 155.2] },
      { name: "Skinport", color: "#22d3ee", values: [159.8, 158.9, 157.6, 156.9, 155.8, 154.4, 153.8, 153.4, 152.9, 152.3, 152, 152.6, 153.1, 154.2, 155.4, 157.04] },
      { name: "White.Market", color: "#a855f7", values: [164.4, 165.8, 161.1, 158.6, 156.2, 154.7, 153.4, 153.1, 152.2, 151.8, 151, 150.7, 151.1, 151.9, 152.7, 153.8] },
      { name: "CS.MONEY Bot", color: "#f59e0b", values: [149.5, 150.1, 150.8, 151.5, 151.9, 152.2, 152.8, 153.2, 153.9, 154.1, 154.6, 155, 155.4, 156, 156.6, 157.2] },
      { name: "SkinBaron", color: "#10b981", values: [151.2, 151.6, 152, 151.8, 152.4, 153, 153.8, 154.3, 154.9, 155.1, 155.3, 155.6, 156.1, 156.5, 156.8, 157.4] }
    ]
  };

  const PROVIDER_COLORS = PROVIDER_HISTORY.providers.reduce((colors, provider) => {
    colors[provider.name] = provider.color;
    return colors;
  }, {});

  const PROVIDER_RANGE_POINTS = {
    "30D": 8,
    "90D": 14,
    "180D": 16,
    "1Y": 16
  };

  const MAIN_MARKETS = ["CSFloat", "Buff.163", "UUSkins", "YouPin898", "Steam", "Skinport", "CS.Money", "White.Market", "SkinSwap CN", "Ecosteam"];

  function canonicalMarketName(name) {
    return MARKETPLACE_META[name]?.canonical || name;
  }

  function marketColor(name) {
    const canonical = canonicalMarketName(name);
    return MARKET_COLORS[name] || MARKET_COLORS[canonical] || "#38bdf8";
  }

  function getMarketplaceMeta(name) {
    const canonical = canonicalMarketName(name);
    return MARKETPLACE_META[name] || MARKETPLACE_META[canonical] || { short: String(name || "?").slice(0, 2).toUpperCase(), region: "west" };
  }

  function formatDate(value) {
    const date = new Date(value);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  function formatPrice(value) {
    return `${PRICE_SYMBOL}${Number(value).toFixed(2)}`;
  }

  function formatTablePrice(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(2) : "\u2014";
  }

  function formatFee(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "\u2014";
    return `${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(1)}%`;
  }

  function formatCount(value) {
    return new Intl.NumberFormat("en-US").format(Number(value || 0));
  }

  function formatPercent(value) {
    const number = Number(value || 0);
    return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
  }

  function buildWearMarketUrl(itemName, wear) {
    return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(`${itemName} (${wear})`)}?l=english`;
  }

  function resolveNearestInspectWear(selectedWear, inspectEntries) {
    const wearOrder = INSPECT_WEAR_OPTIONS.map((option) => option.wear);
    const availableWears = wearOrder.filter((wear) => Boolean(inspectEntries?.[wear]?.inspect_url));

    if (!availableWears.length) {
      return null;
    }

    if (inspectEntries?.[selectedWear]?.inspect_url) {
      return selectedWear;
    }

    const selectedIndex = Math.max(0, wearOrder.indexOf(selectedWear));
    return availableWears
      .slice()
      .sort((leftWear, rightWear) => {
        const leftIndex = wearOrder.indexOf(leftWear);
        const rightIndex = wearOrder.indexOf(rightWear);
        const leftDistance = Math.abs(leftIndex - selectedIndex);
        const rightDistance = Math.abs(rightIndex - selectedIndex);

        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }

        return leftIndex - rightIndex;
      })[0];
  }

  function toneClass(value) {
    if (Math.abs(Number(value || 0)) < 0.01) return "flat";
    return Number(value) >= 0 ? "up" : "down";
  }

  function mergeQualityRows(fallbackRows, liveRows) {
    if (!Array.isArray(liveRows) || !liveRows.length) {
      return fallbackRows;
    }

    const rowsByWear = liveRows.reduce((lookup, row) => {
      if (row?.wear) {
        lookup[row.wear] = row;
      }
      return lookup;
    }, {});

    return fallbackRows.map((row) => {
      const liveRow = rowsByWear[row.wear];
      if (!liveRow) return row;

      const st = liveRow.stattrak ?? liveRow.stattrak_price ?? null;
      return {
        ...row,
        price: formatTablePrice(liveRow.price),
        // Show a real StatTrak price only when the API provides one; never a placeholder.
        stattrak: (st != null && Number(st) > 0) ? formatTablePrice(st) : "—"
      };
    });
  }

  function buildComparisonRowFromListings(listings) {
    const basePrice = Number(listings?.base_price ?? listings?.best_price);
    const feePct = Number(listings?.fee_pct ?? 0);
    const explicitFinalPrice = Number(listings?.final_price);
    const finalPrice = Number.isFinite(explicitFinalPrice)
      ? explicitFinalPrice
      : basePrice * (1 + feePct / 100);

    if (!Number.isFinite(basePrice) || basePrice <= 0 || !Number.isFinite(finalPrice)) {
      return null;
    }

    return {
      base_price: Number(basePrice.toFixed(2)),
      fee_pct: Number(feePct.toFixed(2)),
      final_price: Number(finalPrice.toFixed(2))
    };
  }

  function mergeMarketRows(steamMarket, skinportMarket, remoteMarkets = {}) {
    const fallbackRows = [...PRIMARY_MARKET_ROWS, ...EXTRA_MARKET_ROWS];
    if (!steamMarket && !skinportMarket && !Object.keys(remoteMarkets).length) {
      return fallbackRows;
    }

    const liveMarkets = {
      "Steam Market": steamMarket,
      Steam: steamMarket,
      skinport: skinportMarket,
      Skinport: skinportMarket,
      ...remoteMarkets
    };

    return fallbackRows.map((row) => {
      const rawName = String(row.name || "");
      const canonical = canonicalMarketName(rawName);
      const liveRow = liveMarkets[rawName] || liveMarkets[canonical] || null;

      if (!liveRow) {
        return row;
      }

      const basePrice = Number(liveRow.base_price ?? liveRow.best_price);
      const feePct = Number(liveRow.fee_pct ?? 0);
      const finalPrice = Number.isFinite(Number(liveRow.final_price))
        ? Number(liveRow.final_price)
        : basePrice * (1 + feePct / 100);

      if (!Number.isFinite(basePrice) || basePrice <= 0 || !Number.isFinite(finalPrice)) {
        return row;
      }

      return {
        ...row,
        basePrice: formatTablePrice(basePrice),
        fee: formatFee(feePct),
        finalPrice: formatTablePrice(finalPrice)
      };
    });
  }

  function buildSteamListingsFallback(steamSnapshot) {
    const fallback = LISTING_FALLBACKS.Steam;
    const rowsByWear = Array.isArray(steamSnapshot?.quality_rows)
      ? steamSnapshot.quality_rows.reduce((lookup, row) => {
          if (row?.wear) {
            lookup[row.wear] = row;
          }
          return lookup;
        }, {})
      : {};

    const wears = fallback.wears.map((row) => {
      const liveRow = rowsByWear[row.wear];
      return liveRow
        ? { ...row, best_price: Number(liveRow.price) }
        : row;
    });

    const factoryNew = rowsByWear["Factory New"];

    return {
      ...fallback,
      best_price: factoryNew ? Number(factoryNew.price) : fallback.best_price,
      wears
    };
  }

  function buildSkinportListingsFallback(skinportSnapshot) {
    const fallback = LISTING_FALLBACKS.Skinport;
    const rowsByWear = Array.isArray(skinportSnapshot?.quality_rows)
      ? skinportSnapshot.quality_rows.reduce((lookup, row) => {
          if (row?.wear) {
            lookup[row.wear] = row;
          }
          return lookup;
        }, {})
      : {};

    const wears = fallback.wears.map((row) => {
      const liveRow = rowsByWear[row.wear];
      return liveRow
        ? {
            ...row,
            best_price: Number(liveRow.min_price ?? liveRow.price ?? row.best_price),
            stock: Number(liveRow.quantity ?? row.stock)
          }
        : row;
    });

    const factoryNew = rowsByWear["Factory New"];
    const totalStock = Object.values(rowsByWear).reduce((sum, row) => sum + Number(row?.quantity || 0), 0);

    return {
      ...fallback,
      best_price: factoryNew ? Number(factoryNew.min_price ?? factoryNew.price ?? fallback.best_price) : fallback.best_price,
      total_stock: totalStock || fallback.total_stock,
      wears
    };
  }

  function computeTrend(prices, lookback) {
    if (!prices.length) return 0;
    const end = prices[prices.length - 1];
    const startIndex = Math.max(0, prices.length - 1 - lookback);
    const start = prices[startIndex] || end;
    if (!start) return 0;
    return ((end - start) / start) * 100;
  }

  function drawRoundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
  }

  function buildVolumeColors(prices) {
    return prices.map((price, index) => {
      if (index === 0) return "rgba(71, 85, 105, 0.55)";
      return price >= prices[index - 1]
        ? "rgba(34, 197, 94, 0.42)"
        : "rgba(239, 68, 68, 0.45)";
    });
  }

  function pctSeriesFromPrices(rows) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const first = Number(rows[0].price) || 1;
    return rows.map((row) => Number((((Number(row.price) - first) / first) * 100).toFixed(2)));
  }

  function buildUniversalOrderBook(rows, range, totalSupply = 0) {
    const points = Array.isArray(rows) ? rows : [];
    const prices = points.map((row) => Number(row.price)).filter((value) => Number.isFinite(value) && value > 0);
    const latest = prices.length ? prices[prices.length - 1] : 153.69;
    const lowest = prices.length ? Math.min(...prices) : latest * 0.96;
    const highest = prices.length ? Math.max(...prices) : latest * 1.04;
    const swing = Math.max(highest - lowest, latest * 0.014);
    const rangeFactor = { "1M": 1, "6M": 1.24, "1Y": 1.52 }[range] || 1;
    const cashSpread = Number((Math.max(0.74, swing * 0.22 + latest * 0.0038) * rangeFactor).toFixed(2));
    const steamSpread = Number((cashSpread * 1.62).toFixed(2));
    const highestBuy = Number((latest - cashSpread / 2).toFixed(2));
    const lowestSell = Number((latest + cashSpread / 2).toFixed(2));
    const normalizedSupply = Math.max(Number(totalSupply) || 0, 650);
    const buyOrders = Math.round(Math.max(98, normalizedSupply * 0.015) * (range === "1Y" ? 1.08 : range === "6M" ? 1.03 : 1));
    const sellOrders = Math.round(Math.max(755, normalizedSupply * 0.418) * (range === "1Y" ? 1.16 : range === "6M" ? 1.08 : 1));
    const buySteps = range === "1Y" ? 11 : 9;
    const sellSteps = range === "1Y" ? 12 : 10;
    const buyWidth = cashSpread * 2.05;
    const sellWidth = cashSpread * 2.6;
    const pivotPrice = Number(((highestBuy + lowestSell) / 2).toFixed(2));
    const visualFloor = Number((pivotPrice - Math.max(cashSpread * 0.2, latest * 0.002)).toFixed(2));
    const visualCeiling = Number((pivotPrice + Math.max(sellWidth * 0.86, latest * 0.06 * rangeFactor)).toFixed(2));
    const buyLift = Number((Math.max(cashSpread * 0.92, latest * 0.01 * rangeFactor)).toFixed(2));
    const sellLift = Number((visualCeiling - pivotPrice).toFixed(2));

    const buySeries = Array.from({ length: buySteps }, (_, index) => {
      const progress = index / (buySteps - 1 || 1);
      return {
        x: Math.round(-buyOrders + buyOrders * progress),
        y: Number((pivotPrice + buyLift * (1 - Math.pow(progress, 0.88))).toFixed(2))
      };
    });

    const sellSeries = Array.from({ length: sellSteps }, (_, index) => {
      const progress = index / (sellSteps - 1 || 1);
      return {
        x: Math.round(sellOrders * progress),
        y: Number((pivotPrice + sellLift * (0.1 * progress + 0.9 * Math.pow(progress, 1.9))).toFixed(2))
      };
    });

    return {
      badgeCount: buySeries.length + sellSeries.length,
      buyOrders,
      buySeries,
      cashSpread,
      highestBuy,
      lowestSell,
      maxDepth: visualCeiling,
      minDepth: visualFloor,
      sellOrders,
      sellSeries,
      steamSpread,
      xMax: sellOrders,
      xMin: -buyOrders
    };
  }

  function buildProviderOrderPanels(orderBook, distributionData) {
    const entries = (Array.isArray(distributionData) ? distributionData : [])
      .filter((entry) => entry && entry.marketplace && entry.marketplace !== "Other" && Number(entry.volume) > 0)
      .map((entry) => ({
        ...entry,
        canonical: canonicalMarketName(entry.marketplace),
        refPrice: Number(
          entry.avg_price
          || LISTING_FALLBACKS[canonicalMarketName(entry.marketplace)]?.best_price
          || LISTING_FALLBACKS[entry.marketplace]?.best_price
          || orderBook.highestBuy
        )
      }));

    const resolveByPriority = (priority, count, fallbackSorter) => {
      const picked = priority
        .map((name) => entries.find((entry) => entry.canonical === name || entry.marketplace === name))
        .filter(Boolean);

      const seen = new Set(picked.map((entry) => entry.marketplace));
      const fill = [...entries]
        .filter((entry) => !seen.has(entry.marketplace))
        .sort(fallbackSorter)
        .slice(0, Math.max(0, count - picked.length));

      return [...picked, ...fill].slice(0, count);
    };

    const buyEntries = resolveByPriority(
      BUY_ORDER_PRIORITY,
      Math.min(2, entries.length),
      (left, right) => left.refPrice - right.refPrice || left.volume - right.volume
    );

    const sellEntries = resolveByPriority(
      SELL_ORDER_PRIORITY,
      Math.min(5, entries.length),
      (left, right) => right.volume - left.volume || left.refPrice - right.refPrice
    );

    const allocateCounts = (items, total, weightFn) => {
      if (!items.length) return [];
      const weighted = items.map((item) => ({ item, weight: Math.max(0.0001, weightFn(item)) }));
      const weightTotal = weighted.reduce((sum, entry) => sum + entry.weight, 0) || 1;
      const raw = weighted.map((entry) => (entry.weight / weightTotal) * total);
      const base = raw.map((value) => Math.floor(value));
      let remainder = total - base.reduce((sum, value) => sum + value, 0);
      const fractions = raw
        .map((value, index) => ({ index, fraction: value - base[index] }))
        .sort((left, right) => right.fraction - left.fraction);

      for (let index = 0; remainder > 0; index += 1) {
        const target = fractions[index % fractions.length];
        base[target.index] += 1;
        remainder -= 1;
      }

      return weighted.map((entry, index) => ({ ...entry.item, count: base[index] }));
    };

    return {
      buy: allocateCounts(buyEntries, orderBook.buyOrders, (entry) => 1 / Math.max(1, entry.volume)).map((entry, index) => ({
        ...entry,
        price: Number((orderBook.highestBuy - index * Math.max(0.22, orderBook.cashSpread * 0.52)).toFixed(2))
      })),
      sell: allocateCounts(sellEntries, orderBook.sellOrders, (entry) => entry.volume).map((entry, index) => ({
        ...entry,
        price: Number((orderBook.lowestSell + index * Math.max(0.18, orderBook.cashSpread * 0.26)).toFixed(2))
      }))
    };
  }

  function buildRegionalMarketShare(distributionData) {
    const entries = (Array.isArray(distributionData) ? distributionData : [])
      .filter((entry) => entry && entry.marketplace && entry.marketplace !== "Other" && Number(entry.volume) > 0)
      .map((entry) => ({
        ...entry,
        canonical: canonicalMarketName(entry.marketplace),
        region: getMarketplaceMeta(entry.marketplace).region || "west"
      }));

    const eastEntries = entries.filter((entry) => entry.region === "east");
    const westEntries = entries.filter((entry) => entry.region !== "east");
    const eastVolume = eastEntries.reduce((sum, entry) => sum + Number(entry.volume || 0), 0);
    const westVolume = westEntries.reduce((sum, entry) => sum + Number(entry.volume || 0), 0);
    const total = Math.max(1, eastVolume + westVolume);
    const eastPct = Number(((eastVolume / total) * 100).toFixed(1));
    const westPct = Number((100 - eastPct).toFixed(1));

    return {
      eastEntries,
      eastPct,
      westEntries,
      westPct
    };
  }

  function MarketplaceBadge({ name, compact = false }) {
    const meta = getMarketplaceMeta(name);
    const style = { "--badge-accent": marketColor(name) };

    return (
      <span className={classNames("marketplace-badge", compact && "compact", !meta.image && "fallback")} style={style}>
        {meta.image ? <img src={meta.image} alt="" loading="lazy" /> : meta.short}
      </span>
    );
  }

  function FullscreenButton({ active, label, onClick }) {
    return (
      <button
        type="button"
        className={`chart-fullscreen-btn${active ? " active" : ""}`}
        aria-label={active ? `Exit fullscreen for ${label}` : `Open ${label} in fullscreen`}
        title={active ? "Exit fullscreen" : "Open fullscreen"}
        onClick={onClick}
      >
        <i className={`fa-solid ${active ? "fa-compress" : "fa-expand"}`} />
      </button>
    );
  }

  function resolveProviderSeries(range, remoteProviders) {
    if (Array.isArray(remoteProviders) && remoteProviders.length) {
      const labels = (remoteProviders[0].points || []).map((point) => formatDate(point.date));
      const providerNames = new Set(remoteProviders.map((provider) => provider.name));
      const fallbackProviders = PROVIDER_HISTORY.providers
        .filter((provider) => !providerNames.has(provider.name))
        .map((provider) => ({
          name: provider.name,
          color: provider.color,
          values: provider.values.slice(-labels.length)
        }));

      return {
        labels,
        providers: [
          ...remoteProviders.map((provider) => ({
            name: provider.name,
            color: PROVIDER_COLORS[provider.name] || "#38bdf8",
            values: (provider.points || []).map((point) => point.price)
          })),
          ...fallbackProviders
        ]
      };
    }

    const points = PROVIDER_RANGE_POINTS[range] || PROVIDER_RANGE_POINTS["90D"];
    return {
      labels: PROVIDER_HISTORY.labels.slice(-points),
      providers: PROVIDER_HISTORY.providers.map((provider) => ({
        name: provider.name,
        color: provider.color,
        values: provider.values.slice(-points)
      }))
    };
  }

  const latestPriceMarkerPlugin = {
    id: "latestPriceMarker",
    afterDatasetsDraw(chart) {
      const lineIndex = chart.data.datasets.findIndex((dataset) => dataset.type === "line");
      if (lineIndex === -1) return;

      const meta = chart.getDatasetMeta(lineIndex);
      const point = meta.data[meta.data.length - 1];
      if (!point) return;

      const value = chart.data.datasets[lineIndex].data[chart.data.datasets[lineIndex].data.length - 1];
      const context = chart.ctx;
      const area = chart.chartArea;
      const y = point.y;
      const label = formatPrice(value);

      context.save();
      context.setLineDash([4, 4]);
      context.strokeStyle = "rgba(59, 130, 246, 0.55)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(area.left, y);
      context.lineTo(area.right, y);
      context.stroke();
      context.setLineDash([]);

      context.fillStyle = "#3b82f6";
      context.beginPath();
      context.arc(point.x, point.y, 4, 0, Math.PI * 2);
      context.fill();

      context.font = "600 12px Segoe UI";
      const labelWidth = context.measureText(label).width + 18;
      const labelHeight = 24;
      const labelX = area.right - labelWidth - 6;
      const labelY = Math.max(area.top + 8, Math.min(area.bottom - labelHeight - 8, y - labelHeight / 2));

      context.fillStyle = "#2563eb";
      drawRoundedRect(context, labelX, labelY, labelWidth, labelHeight, 8);
      context.fill();

      context.fillStyle = "#ffffff";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, labelX + labelWidth / 2, labelY + labelHeight / 2 + 0.5);
      context.restore();
    }
  };

  function fallbackSupply(range) {
    const data = SUPPLY_FALLBACKS[range] || SUPPLY_FALLBACKS["1M"];
    return {
      total: data.reduce((sum, entry) => sum + entry.volume, 0),
      data
    };
  }

  function disposeViewerMaterials(material) {
    if (!material) return;
    if (Array.isArray(material)) {
      material.forEach(disposeViewerMaterials);
      return;
    }

    Object.values(material).forEach((value) => {
      if (value && typeof value === "object" && typeof value.dispose === "function") {
        value.dispose();
      }
    });

    if (typeof material.dispose === "function") {
      material.dispose();
    }
  }

  function ItemPage() {
    const fallbackMarketRows = [...PRIMARY_MARKET_ROWS, ...EXTRA_MARKET_ROWS];
    /* ---- phone layout (owner, 2026-10-03) -------------------------------
       The item page is one desktop layout that phones only reflow. Below the
       breakpoint it renders a purpose-built tree instead, off the same state -
       no extra fetching, nothing recomputed. Declared here with the rest of the
       state so it is defined above every use: a const read before its
       declaration is a runtime ReferenceError that esbuild compiles silently,
       which already cost this project a live page once. */
    const [isPhone, setIsPhone] = useState(
      () => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches
    );
    const [mRange, setMRange] = useState("3M");
    const [mWatched, setMWatched] = useState(false);
    const [mShowAllMarkets, setMShowAllMarkets] = useState(false);

    useEffect(() => {
      if (typeof window.matchMedia !== "function") return undefined;
      const query = window.matchMedia("(max-width: 767px)");
      const sync = (event) => setIsPhone(event.matches);
      query.addEventListener("change", sync);
      return () => query.removeEventListener("change", sync);
    }, []);

    const [priceRange, setPriceRange] = useState("ALL");
    const [qualityRows, setQualityRows] = useState(QUALITY_ROWS);
    const [marketRowsData, setMarketRowsData] = useState(fallbackMarketRows);
    const [steamSnapshot, setSteamSnapshot] = useState(null);
    const [skinportSnapshot, setSkinportSnapshot] = useState(null);
    const [priceHistory, setPriceHistory] = useState(DEMO_PRICE_HISTORY);
    const [distributionRange, setDistributionRange] = useState("1M");
    const initialSupply = fallbackSupply("1M");
    const [distributionData, setDistributionData] = useState(initialSupply.data);
    const [distributionTotal, setDistributionTotal] = useState(initialSupply.total);
    const [selectedMarket, setSelectedMarket] = useState("CSFloat");
    const [listingsData, setListingsData] = useState(LISTING_FALLBACKS.CSFloat);
    const [roiRange, setRoiRange] = useState("1M");
    const [roiHistory, setRoiHistory] = useState(DEMO_PRICE_HISTORY);
    const [providerRange, setProviderRange] = useState("90D");
    const [remoteProviders, setRemoteProviders] = useState(null);
    const [isViewerActive, setIsViewerActive] = useState(false);
    const [viewerStatus, setViewerStatus] = useState("idle");
    const [fullscreenTarget, setFullscreenTarget] = useState("");
    const [alertModalOpen, setAlertModalOpen] = useState(false);
    const [donutHover, setDonutHover] = useState(null);
    const [showExtraMarketplaces, setShowExtraMarketplaces] = useState(false);
    const [remoteMarketListings, setRemoteMarketListings] = useState({});
    const [inspectLinks, setInspectLinks] = useState({});
    const [inspectLoading, setInspectLoading] = useState(true);
    const [selectedInspectWear, setSelectedInspectWear] = useState("Factory New");

    const priceChartCanvasRef = useRef(null);
    const donutChartCanvasRef = useRef(null);
    const listingsBarCanvasRef = useRef(null);
    const roiCanvasRef = useRef(null);
    const providerCanvasRef = useRef(null);
    const viewerContainerRef = useRef(null);

    const priceChartInstanceRef = useRef(null);
    const donutChartInstanceRef = useRef(null);
    const listingsChartInstanceRef = useRef(null);
    const roiChartInstanceRef = useRef(null);
    const providerChartInstanceRef = useRef(null);
    const viewerResourcesRef = useRef(null);
    const fullscreenRefs = useRef({});

    const bindFullscreenRef = (key) => (node) => {
      if (node) {
        fullscreenRefs.current[key] = node;
      } else {
        delete fullscreenRefs.current[key];
      }
    };

    const toggleFullscreen = (key) => {
      const target = fullscreenRefs.current[key];
      if (!target || typeof target.requestFullscreen !== "function") return;

      if (document.fullscreenElement === target) {
        if (typeof document.exitFullscreen === "function") {
          document.exitFullscreen().catch(() => undefined);
        }
        return;
      }

      if (document.fullscreenElement && document.fullscreenElement !== target) {
        if (typeof document.exitFullscreen === "function") {
          document.exitFullscreen()
            .catch(() => undefined)
            .finally(() => target.requestFullscreen().catch(() => undefined));
        }
        return;
      }

      target.requestFullscreen().catch(() => undefined);
    };

    const toggle3DViewer = () => {
      setViewerStatus((current) => (current === "idle" ? "loading" : current));
      setIsViewerActive((current) => !current);
    };

    useEffect(() => {
      const syncFullscreenTarget = () => {
        const activeElement = document.fullscreenElement;
        if (!activeElement) {
          setFullscreenTarget("");
          return;
        }

        const matchedEntry = Object.entries(fullscreenRefs.current).find(([, node]) => node === activeElement);
        setFullscreenTarget(matchedEntry ? matchedEntry[0] : "");
      };

      document.addEventListener("fullscreenchange", syncFullscreenTarget);
      return () => document.removeEventListener("fullscreenchange", syncFullscreenTarget);
    }, [ITEM_ID]);

    useEffect(() => () => {
      const resources = viewerResourcesRef.current;
      if (!resources) return;

      resources.isActive = false;
      if (resources.frameId) {
        window.cancelAnimationFrame(resources.frameId);
      }

      resources.resizeObserver?.disconnect();
      if (resources.resizeHandler) {
        window.removeEventListener("resize", resources.resizeHandler);
      }

      if (resources.modelRoot) {
        resources.modelRoot.traverse((child) => {
          if (child.geometry && typeof child.geometry.dispose === "function") {
            child.geometry.dispose();
          }

          if (child.material) {
            disposeViewerMaterials(child.material);
          }
        });
      }

      resources.controls?.dispose();
      resources.renderer?.dispose();

      if (resources.container && resources.renderer?.domElement?.parentNode === resources.container) {
        resources.container.removeChild(resources.renderer.domElement);
      }

      viewerResourcesRef.current = null;
    }, [ITEM_ID]);

    useEffect(() => {
      let cancelled = false;

      fetch(`get_steam_snapshot.php?item_id=${ITEM_ID}${LOOKUP_QS}`)
        .then((response) => {
          if (!response.ok) throw new Error(`Steam snapshot request failed (${response.status})`);
          return response.json();
        })
        .then((json) => {
          if (cancelled) return;
          if (json && json.error) throw new Error(json.error);
          setSteamSnapshot(json);
          setQualityRows(mergeQualityRows(QUALITY_ROWS, json.quality_rows || []));
        })
        .catch(() => {
          if (cancelled) return;
          setSteamSnapshot(null);
          setQualityRows(QUALITY_ROWS);
        });

      return () => {
        cancelled = true;
      };
    }, [ITEM_ID]);

    useEffect(() => {
      let cancelled = false;

      fetch(`get_skinport_snapshot.php?item_id=${ITEM_ID}${LOOKUP_QS}`)
        .then((response) => {
          if (!response.ok) throw new Error(`Skinport snapshot request failed (${response.status})`);
          return response.json();
        })
        .then((json) => {
          if (cancelled) return;
          if (json && json.error) throw new Error(json.error);
          setSkinportSnapshot(json);
        })
        .catch(() => {
          if (!cancelled) {
            setSkinportSnapshot(null);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [ITEM_ID]);

    useEffect(() => {
      let cancelled = false;
      const trackedMarkets = ["Buff.163", "Buff Market"];

      Promise.allSettled(
        trackedMarkets.map((marketplace) => (
          fetch(`get_listings.php?item_id=${ITEM_ID}&marketplace=${encodeURIComponent(marketplace)}${LOOKUP_NAME ? `&market_hash_name=${encodeURIComponent(LOOKUP_NAME)}` : ""}`)
            .then((response) => {
              if (!response.ok) throw new Error(`Mapped marketplace request failed (${response.status})`);
              return response.json();
            })
            .then((json) => {
              if (json && json.error) throw new Error(json.error);
              return buildComparisonRowFromListings(json);
            })
        ))
      )
        .then((results) => {
          if (cancelled) return;

          const nextMarkets = {};
          results.forEach((result, index) => {
            if (result.status === "fulfilled" && result.value) {
              nextMarkets[trackedMarkets[index]] = result.value;
            }
          });

          setRemoteMarketListings(nextMarkets);
        })
        .catch(() => {
          if (!cancelled) setRemoteMarketListings({});
        });

      return () => {
        cancelled = true;
      };
    }, [ITEM_ID]);

    useEffect(() => {
      let cancelled = false;
      setInspectLoading(true);

      fetch(`get_steam_inspect_links.php?item_id=${ITEM_ID}`)
        .then((response) => {
          if (!response.ok) throw new Error(`Inspect link request failed (${response.status})`);
          return response.json();
        })
        .then((json) => {
          if (cancelled) return;
          if (json && json.error) throw new Error(json.error);
          setInspectLinks(json.links || {});
          setInspectLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setInspectLinks({});
          setInspectLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [ITEM_ID]);

    useEffect(() => {
      setMarketRowsData(
        mergeMarketRows(
          steamSnapshot?.steam_market || null,
          skinportSnapshot?.skinport_market || null,
          remoteMarketListings
        )
      );
    }, [steamSnapshot, skinportSnapshot, remoteMarketListings]);

    useEffect(() => {
      let cancelled = false;

      fetch(`get_prices.php?item_id=${ITEM_ID}&range=${priceRange}${LOOKUP_QS}`)
        .then((response) => {
          if (!response.ok) throw new Error(`Price history request failed (${response.status})`);
          return response.json();
        })
        .then((raw) => {
          if (cancelled) return;
          if (raw && raw.error) throw new Error(raw.error);
          const rows = Array.isArray(raw) ? raw : (raw.data || []);
          if (!rows.length) throw new Error("No price history data returned");
          setPriceHistory(rows);
        })
        .catch(() => {
          if (!cancelled) setPriceHistory(DEMO_PRICE_HISTORY);
        });

      return () => {
        cancelled = true;
      };
    }, [priceRange]);

    useEffect(() => {
      let cancelled = false;

      fetch(`get_distribution.php?item_id=${ITEM_ID}&range=${distributionRange}${LOOKUP_QS}`)
        .then((response) => {
          if (!response.ok) throw new Error(`Distribution request failed (${response.status})`);
          return response.json();
        })
        .then((json) => {
          if (cancelled) return;
          if (json && json.error) throw new Error(json.error);
          setDistributionTotal(json.total || 0);
          setDistributionData(json.data || []);
        })
        .catch(() => {
          if (cancelled) return;
          const fallback = fallbackSupply(distributionRange);
          setDistributionTotal(fallback.total);
          setDistributionData(fallback.data);
        });

      return () => {
        cancelled = true;
      };
    }, [distributionRange]);

    useEffect(() => {
      let cancelled = false;

      fetch(`get_listings.php?item_id=${ITEM_ID}&marketplace=${encodeURIComponent(selectedMarket)}${LOOKUP_NAME ? `&market_hash_name=${encodeURIComponent(LOOKUP_NAME)}` : ""}`)
        .then((response) => {
          if (!response.ok) throw new Error(`Listings request failed (${response.status})`);
          return response.json();
        })
        .then((json) => {
          if (cancelled) return;
          if (json && json.error) throw new Error(json.error);
          setListingsData(json);
        })
        .catch(() => {
          if (!cancelled) {
            if (canonicalMarketName(selectedMarket) === "Steam" && steamSnapshot) {
              setListingsData(buildSteamListingsFallback(steamSnapshot));
              return;
            }
            if (canonicalMarketName(selectedMarket) === "Skinport" && skinportSnapshot) {
              setListingsData(buildSkinportListingsFallback(skinportSnapshot));
              return;
            }
            setListingsData(LISTING_FALLBACKS[selectedMarket] || LISTING_FALLBACKS.CSFloat);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [selectedMarket, steamSnapshot, skinportSnapshot]);

    useEffect(() => {
      let cancelled = false;

      fetch(`get_prices.php?item_id=${ITEM_ID}&range=${roiRange}${LOOKUP_QS}`)
        .then((response) => {
          if (!response.ok) throw new Error(`ROI request failed (${response.status})`);
          return response.json();
        })
        .then((json) => {
          if (cancelled) return;
          const rows = Array.isArray(json) ? json : [];
          if (!rows.length) throw new Error("No ROI data returned");
          setRoiHistory(rows);
        })
        .catch(() => {
          if (!cancelled) setRoiHistory(DEMO_PRICE_HISTORY);
        });

      return () => {
        cancelled = true;
      };
    }, [roiRange]);

    useEffect(() => {
      let cancelled = false;

      fetch(`get_provider_prices.php?item_id=${ITEM_ID}&range=${providerRange}${LOOKUP_QS}`)
        .then((response) => {
          if (!response.ok) throw new Error(`Provider history request failed (${response.status})`);
          return response.json();
        })
        .then((json) => {
          if (cancelled) return;
          if (json && json.error) throw new Error(json.error);
          setRemoteProviders(json.providers || []);
        })
        .catch(() => {
          if (!cancelled) setRemoteProviders(null);
        });

      return () => {
        cancelled = true;
      };
    }, [providerRange]);

    const activeInspectOption = INSPECT_WEAR_OPTIONS.find((option) => option.wear === selectedInspectWear) || INSPECT_WEAR_OPTIONS[0];
    const activeInspectEntry = inspectLinks[selectedInspectWear] || null;
    const resolvedInspectWear = resolveNearestInspectWear(selectedInspectWear, inspectLinks);
    const resolvedInspectEntry = resolvedInspectWear ? inspectLinks[resolvedInspectWear] || null : null;
    const resolvedInspectOption = INSPECT_WEAR_OPTIONS.find((option) => option.wear === resolvedInspectWear) || null;
    const activeInspectShort = activeInspectOption?.short || "FN";
    const activeWeaponImage = activeInspectOption?.image || ITEM_DETAILS.image;
    const activeSteamListingUrl = activeInspectEntry?.market_url || buildWearMarketUrl(ITEM_DETAILS.title, selectedInspectWear);
    const inspectLaunchWear = resolvedInspectWear || selectedInspectWear;
    const inspectLaunchShort = resolvedInspectOption?.short || activeInspectShort;
    const canInspectInGame = Boolean(resolvedInspectEntry?.inspect_url);

    const openInspectTarget = (wear) => {
      const entry = inspectLinks[wear] || null;
      if (!entry?.inspect_url) {
        return;
      }

      const inspectAnchor = document.createElement("a");
      inspectAnchor.href = entry.inspect_url;
      inspectAnchor.style.display = "none";
      inspectAnchor.rel = "noreferrer";
      document.body.appendChild(inspectAnchor);
      inspectAnchor.click();
      inspectAnchor.remove();
    };

    const openSteamListing = (wear = selectedInspectWear) => {
      const entry = inspectLinks[wear] || null;
      const targetUrl = entry?.market_url || buildWearMarketUrl(ITEM_DETAILS.title, wear);
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    };

    const selectWearPreview = (event, wear) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      setSelectedInspectWear(wear);
    };

    useEffect(() => {
      const container = viewerContainerRef.current;
      if (!isViewerActive || !container) return undefined;
      let cancelled = false;

      if (!window.THREE || !window.THREE.GLTFLoader || !window.THREE.OrbitControls) {
        setViewerStatus("error");
        return undefined;
      }

      const existingResources = viewerResourcesRef.current;

      const startRenderLoop = (resources) => {
        resources.isActive = true;

        const renderFrame = () => {
          if (!viewerResourcesRef.current || !viewerResourcesRef.current.isActive) return;
          resources.controls.update();
          resources.renderer.render(resources.scene, resources.camera);
          resources.frameId = window.requestAnimationFrame(renderFrame);
        };

        if (resources.frameId) {
          window.cancelAnimationFrame(resources.frameId);
        }

        renderFrame();
      };

      const stopRenderLoop = (resources) => {
        if (!resources) return;
        resources.isActive = false;
        if (resources.frameId) {
          window.cancelAnimationFrame(resources.frameId);
          resources.frameId = null;
        }
      };

      if (existingResources) {
        existingResources.container = container;
        if (existingResources.renderer.domElement.parentNode !== container) {
          container.appendChild(existingResources.renderer.domElement);
        }
        existingResources.resizeHandler?.();
        setViewerStatus("ready");
        startRenderLoop(existingResources);

        return () => {
          stopRenderLoop(existingResources);
        };
      }

      setViewerStatus("loading");

      const scene = new window.THREE.Scene();
      const camera = new window.THREE.PerspectiveCamera(38, 1, 0.1, 100);
      const renderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputEncoding = window.THREE.sRGBEncoding;
      renderer.toneMapping = window.THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;

      container.appendChild(renderer.domElement);

      const ambientLight = new window.THREE.AmbientLight(0xffffff, 1.7);
      const keyLight = new window.THREE.DirectionalLight(0xfff2df, 2.8);
      const rimLight = new window.THREE.DirectionalLight(0xa5b4fc, 1.5);
      const fillLight = new window.THREE.HemisphereLight(0xffffff, 0x0f172a, 1.2);

      keyLight.position.set(4.5, 4, 7);
      rimLight.position.set(-5, 2, -4);

      scene.add(ambientLight, keyLight, rimLight, fillLight);

      const controls = new window.THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.minPolarAngle = Math.PI * 0.3;
      controls.maxPolarAngle = Math.PI * 0.7;

      const resources = {
        camera,
        container,
        controls,
        frameId: null,
        isActive: false,
        modelRoot: null,
        renderer,
        resizeHandler: null,
        resizeObserver: null,
        scene
      };

      const resizeViewer = () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (!width || !height) return;

        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      const releaseViewerResources = (disposeModel) => {
        stopRenderLoop(resources);
        resources.resizeObserver?.disconnect();
        window.removeEventListener("resize", resizeViewer);

        if (disposeModel && resources.modelRoot) {
          resources.modelRoot.traverse((child) => {
            if (child.geometry && typeof child.geometry.dispose === "function") {
              child.geometry.dispose();
            }

            if (child.material) {
              disposeViewerMaterials(child.material);
            }
          });
        }

        controls.dispose();
        renderer.dispose();

        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }

        if (viewerResourcesRef.current === resources) {
          viewerResourcesRef.current = null;
        }
      };

      resources.resizeHandler = resizeViewer;
      window.addEventListener("resize", resizeViewer);

      if (typeof window.ResizeObserver === "function") {
        resources.resizeObserver = new window.ResizeObserver(resizeViewer);
        resources.resizeObserver.observe(container);
      }

      const loader = new window.THREE.GLTFLoader();
      loader.load(
        LOCAL_MODEL_URL,
        (gltf) => {
          if (cancelled) {
            resources.modelRoot = gltf.scene;
            releaseViewerResources(true);
            return;
          }

          const modelRoot = gltf.scene;
          resources.modelRoot = modelRoot;

          const bounds = new window.THREE.Box3().setFromObject(modelRoot);
          const center = bounds.getCenter(new window.THREE.Vector3());
          const size = bounds.getSize(new window.THREE.Vector3());
          const maxDimension = Math.max(size.x, size.y, size.z) || 1;

          modelRoot.position.sub(center);
          modelRoot.rotation.y = -Math.PI / 2;
          scene.add(modelRoot);

          camera.near = 0.1;
          camera.far = maxDimension * 12;
          camera.position.set(maxDimension * 1.15, maxDimension * 0.28, maxDimension * 1.95);
          camera.lookAt(0, 0, 0);
          camera.updateProjectionMatrix();

          controls.target.set(0, 0, 0);
          controls.minDistance = maxDimension * 1.8;
          controls.maxDistance = maxDimension * 2.5;
          controls.update();

          resizeViewer();
          viewerResourcesRef.current = resources;
          setViewerStatus("ready");
          startRenderLoop(resources);
        },
        undefined,
        () => {
          releaseViewerResources(true);
          if (!cancelled) {
            setViewerStatus("error");
          }
        }
      );

      return () => {
        cancelled = true;
        if (!viewerResourcesRef.current) {
          releaseViewerResources(false);
          return;
        }
        stopRenderLoop(resources);
      };
    }, [isViewerActive]);

    useEffect(() => {
      const canvas = priceChartCanvasRef.current;
      if (!canvas || !window.Chart || !priceHistory.length) return undefined;

      const context = canvas.getContext("2d");
      if (!context) return undefined;

      const labels = priceHistory.map((row) => formatDate(row.date));
      const prices = priceHistory.map((row) => Number(row.price));
      const volumes = priceHistory.map((row) => Number(row.volume || 0));
      const volumeColors = buildVolumeColors(prices);

      if (priceChartInstanceRef.current) {
        priceChartInstanceRef.current.destroy();
      }

      priceChartInstanceRef.current = new window.Chart(context, {
        data: {
          labels,
          datasets: [
            {
              type: "bar",
              label: "Volume",
              data: volumes,
              backgroundColor: volumeColors,
              borderRadius: 0,
              borderSkipped: false,
              barPercentage: 0.94,
              categoryPercentage: 0.98,
              yAxisID: "y1",
              order: 1
            },
            {
              type: "line",
              label: `Cheapest Price (${PRICE_SYMBOL})`,
              data: prices,
              borderColor: "#3b82f6",
              backgroundColor: context.createLinearGradient(0, 0, 0, 360),
              fill: true,
              tension: 0.34,
              pointRadius: 0,
              pointHoverRadius: 5,
              pointHitRadius: 16,
              borderWidth: 2.4,
              yAxisID: "y",
              order: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 10, right: 8, bottom: 8, left: 0 } },
          animation: { duration: 650, easing: "easeOutQuart" },
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#111827",
              borderColor: "rgba(96, 165, 250, 0.25)",
              borderWidth: 1,
              padding: 12,
              displayColors: false,
              titleColor: "#cbd5e1",
              bodyColor: "#ffffff",
              callbacks: {
                title: (contextItems) => contextItems[0].label,
                label: (contextItem) => (
                  contextItem.dataset.type === "line"
                    ? `Price: ${formatPrice(contextItem.raw)}`
                    : `Volume: ${contextItem.raw} listings`
                )
              }
            }
          },
          scales: {
            x: {
              grid: { display: false, drawBorder: false },
              border: { display: false },
              ticks: {
                color: "rgba(148, 163, 184, 0.85)",
                font: { size: 11, weight: "600" },
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: priceRange === "ALL" ? 8 : 6
              }
            },
            y: {
              position: "right",
              grace: "10%",
              grid: { color: "rgba(148, 163, 184, 0.14)", drawBorder: false },
              border: { display: false },
              ticks: {
                color: "rgba(191, 219, 254, 0.72)",
                padding: 10,
                font: { size: 11, weight: "600" },
                callback: (value) => formatPrice(value)
              }
            },
            y1: {
              beginAtZero: true,
              position: "left",
              border: { display: false },
              grid: { display: false, drawBorder: false },
              ticks: { display: false },
              suggestedMax: Math.max(...volumes) * 3.4
            }
          }
        },
        plugins: [
          {
            ...latestPriceMarkerPlugin,
            beforeDatasetsDraw(chart) {
              const gradient = context.createLinearGradient(0, 0, 0, 360);
              gradient.addColorStop(0, "rgba(59, 130, 246, 0.19)");
              gradient.addColorStop(1, "rgba(59, 130, 246, 0.01)");
              chart.data.datasets[1].backgroundColor = gradient;
            }
          }
        ]
      });

      return () => {
        if (priceChartInstanceRef.current) {
          priceChartInstanceRef.current.destroy();
          priceChartInstanceRef.current = null;
        }
      };
    }, [priceHistory, priceRange]);

    useEffect(() => {
      const canvas = donutChartCanvasRef.current;
      if (!canvas || !window.Chart || !distributionData.length) return undefined;
      const context = canvas.getContext("2d");
      if (!context) return undefined;

      if (donutChartInstanceRef.current) {
        donutChartInstanceRef.current.destroy();
      }

      donutChartInstanceRef.current = new window.Chart(context, {
        type: "doughnut",
        data: {
          labels: distributionData.map((entry) => entry.marketplace),
          datasets: [{
            data: distributionData.map((entry) => entry.volume),
            backgroundColor: distributionData.map((entry) => marketColor(entry.marketplace)),
            borderWidth: 0,
            spacing: 4,
            borderRadius: 5,
            hoverOffset: 7,
            hoverBorderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "70%",
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: false,
              external: ({ tooltip }) => {
                if (!tooltip || tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
                  setDonutHover((current) => (current ? null : current));
                  return;
                }

                const point = tooltip.dataPoints[0];
                const arc = point.element;
                const meta = distributionData[point.dataIndex];
                if (!arc || !meta) return;

                const midAngle = (arc.startAngle + arc.endAngle) / 2;
                const offset = arc.outerRadius + 18;
                const left = arc.x + Math.cos(midAngle) * offset;
                const top = arc.y + Math.sin(midAngle) * offset;
                const horizontalBias = Math.abs(Math.cos(midAngle));
                let side = "right";

                if (horizontalBias > 0.42) {
                  side = Math.cos(midAngle) >= 0 ? "right" : "left";
                } else {
                  side = Math.sin(midAngle) >= 0 ? "bottom" : "top";
                }

                const nextHover = {
                  side,
                  title: point.label,
                  subtitle: `${formatCount(point.raw)} listings (${meta.pct}%)`,
                  left: Number(left.toFixed(1)),
                  top: Number(top.toFixed(1))
                };

                setDonutHover((current) => {
                  if (
                    current
                    && current.side === nextHover.side
                    && current.title === nextHover.title
                    && current.subtitle === nextHover.subtitle
                    && current.left === nextHover.left
                    && current.top === nextHover.top
                  ) {
                    return current;
                  }
                  return nextHover;
                });
              }
            }
          }
        }
      });

      return () => {
        if (donutChartInstanceRef.current) {
          donutChartInstanceRef.current.destroy();
          donutChartInstanceRef.current = null;
        }
        setDonutHover(null);
      };
    }, [distributionData]);

    useEffect(() => {
      const canvas = listingsBarCanvasRef.current;
      if (!canvas || !window.Chart || !listingsData) return undefined;
      const context = canvas.getContext("2d");
      if (!context) return undefined;

      const wears = listingsData.wears || [];
      const labels = wears.map((entry) => (
        entry.wear
          .replace("Factory New", "FN")
          .replace("Minimal Wear", "MW")
          .replace("Field-Tested", "FT")
          .replace("Well-Worn", "WW")
          .replace("Battle-Scarred", "BS")
      ));
      const stocks = wears.map((entry) => entry.stock);
      const gradient = context.createLinearGradient(0, 0, 0, 140);
      gradient.addColorStop(0, `${marketColor(selectedMarket)}cc`);
      gradient.addColorStop(1, `${marketColor(selectedMarket)}33`);

      if (listingsChartInstanceRef.current) {
        listingsChartInstanceRef.current.destroy();
      }

      listingsChartInstanceRef.current = new window.Chart(context, {
        type: "bar",
        data: {
          labels,
          datasets: [{
            label: "Listings",
            data: stocks,
            backgroundColor: gradient,
            borderRadius: 6,
            borderSkipped: false,
            barPercentage: 0.6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 400, easing: "easeOutQuart" },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#1e293b",
              borderColor: "rgba(255,255,255,.1)",
              borderWidth: 1,
              padding: 10,
              displayColors: false,
              callbacks: {
                title: (contextItems) => wears[contextItems[0].dataIndex]?.wear || contextItems[0].label,
                label: (contextItem) => `  ${contextItem.raw} listings @ ${(wears[contextItem.dataIndex]?.best_price || 0).toFixed(2)}`
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: "#475569", font: { size: 11 } } },
            y: { grid: { color: "rgba(255,255,255,.04)" }, ticks: { color: "#475569", font: { size: 11 }, stepSize: 5 } }
          }
        }
      });

      return () => {
        if (listingsChartInstanceRef.current) {
          listingsChartInstanceRef.current.destroy();
          listingsChartInstanceRef.current = null;
        }
      };
    }, [listingsData, selectedMarket]);

    useEffect(() => {
      const canvas = roiCanvasRef.current;
      if (!canvas || !window.Chart) return undefined;
  
      const context = canvas.getContext("2d");
      if (!context) return undefined;

      const buyGradient = context.createLinearGradient(0, 0, 0, 260);
      buyGradient.addColorStop(0, "rgba(59, 130, 246, 0.36)");
      buyGradient.addColorStop(0.6, "rgba(59, 130, 246, 0.1)");
      buyGradient.addColorStop(1, "rgba(59, 130, 246, 0)");

      const sellGradient = context.createLinearGradient(0, 0, 0, 260);
      sellGradient.addColorStop(0, "rgba(34, 197, 94, 0.36)");
      sellGradient.addColorStop(0.6, "rgba(34, 197, 94, 0.1)");
      sellGradient.addColorStop(1, "rgba(34, 197, 94, 0)");

      if (roiChartInstanceRef.current) {
        roiChartInstanceRef.current.destroy();
      }

      roiChartInstanceRef.current = new window.Chart(context, {
        type: "line",
        data: {
          datasets: [{
            label: "Buy Orders",
            data: orderBook.buySeries,
            parsing: false,
            borderColor: "#3b82f6",
            backgroundColor: buyGradient,
            fill: "start",
            tension: 0.08,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2.2
          }, {
            label: "Sell Orders",
            data: orderBook.sellSeries,
            parsing: false,
            borderColor: "#22c55e",
            backgroundColor: sellGradient,
            fill: "start",
            tension: 0.08,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2.2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 520, easing: "easeOutQuart" },
          interaction: { mode: "nearest", intersect: false },
          layout: {
            padding: { top: 6, right: 12, bottom: 4, left: 8 }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#111827",
              borderColor: "rgba(96, 165, 250, 0.22)",
              borderWidth: 1,
              displayColors: true,
              callbacks: {
                title: (contextItems) => contextItems[0].dataset.label,
                label: (contextItem) => `${formatCount(Math.abs(Math.round(contextItem.raw.x)))} orders at ${formatPrice(contextItem.raw.y)}`
              }
            }
          },
          scales: {
            x: {
              type: "linear",
              min: orderBook.xMin,
              max: orderBook.xMax,
              grid: { display: false },
              border: { display: false },
              ticks: { display: false }
            },
            y: {
              min: orderBook.minDepth,
              max: orderBook.maxDepth,
              grid: { color: "rgba(148, 163, 184, 0.09)" },
              border: { display: false },
              ticks: {
                color: "rgba(148, 163, 184, 0.76)",
                maxTicksLimit: 4,
                callback: (value) => formatPrice(value)
              }
            }
          }
        }
      });

      return () => {
        if (roiChartInstanceRef.current) {
          roiChartInstanceRef.current.destroy();
          roiChartInstanceRef.current = null;
        }
      };
    }, [roiHistory, roiRange, distributionTotal]);

    const providerSeries = resolveProviderSeries(providerRange, remoteProviders);

    useEffect(() => {
      const canvas = providerCanvasRef.current;
      const series = resolveProviderSeries(providerRange, remoteProviders);
      if (!canvas || !window.Chart || !series.providers.length) return undefined;
      const context = canvas.getContext("2d");
      if (!context) return undefined;

      if (providerChartInstanceRef.current) {
        providerChartInstanceRef.current.destroy();
      }

      providerChartInstanceRef.current = new window.Chart(context, {
        type: "line",
        data: {
          labels: series.labels,
          datasets: series.providers.map((provider) => ({
            label: provider.name,
            data: provider.values,
            borderColor: provider.color,
            backgroundColor: provider.color,
            tension: 0.34,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2,
            fill: false
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 520, easing: "easeOutQuart" },
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#111827",
              borderColor: "rgba(148, 163, 184, 0.22)",
              borderWidth: 1,
              callbacks: {
                label: (contextItem) => `${contextItem.dataset.label}: ${formatPrice(contextItem.raw)}`
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: {
                color: "rgba(148, 163, 184, 0.82)",
                font: { size: 10, weight: "600" },
                maxTicksLimit: 5
              }
            },
            y: {
              position: "right",
              grid: { color: "rgba(148, 163, 184, 0.12)" },
              border: { display: false },
              ticks: {
                color: "rgba(191, 219, 254, 0.72)",
                font: { size: 10, weight: "600" },
                callback: (value) => formatPrice(value)
              }
            }
          }
        }
      });

      return () => {
        if (providerChartInstanceRef.current) {
          providerChartInstanceRef.current.destroy();
          providerChartInstanceRef.current = null;
        }
      };
    }, [providerRange, remoteProviders]);

    const priceValues = priceHistory.map((row) => Number(row.price));
    const chartDelta = computeTrend(priceValues, priceValues.length - 1);
    const chartBadges = [
      { label: "24H", value: computeTrend(priceValues, 1) },
      { label: "7D", value: computeTrend(priceValues, 7) },
      { label: "30D", value: computeTrend(priceValues, 30) },
      { label: "90D", value: computeTrend(priceValues, 90) }
    ];

    const chartSubtitle = priceHistory.length
      ? `Historical daily market data for ${ITEM_DETAILS.title} from ${formatDate(priceHistory[0].date)} to ${formatDate(priceHistory[priceHistory.length - 1].date)}.`
      : `Historical daily market data for ${ITEM_DETAILS.title}.`;

    const orderBook = buildUniversalOrderBook(roiHistory, roiRange, distributionTotal);
    const providerOrderPanels = buildProviderOrderPanels(orderBook, distributionData);
    const regionalMarketShare = buildRegionalMarketShare(distributionData);
    const selectedShare = distributionData.find((entry) => entry.marketplace === selectedMarket);
    const totalSupplyLabel = distributionTotal >= 1000 ? `${(distributionTotal / 1000).toFixed(1)}k` : String(distributionTotal);
    const listingsTrendUp = Number(listingsData.trend_pct || 0) >= 0;
    const marketRows = showExtraMarketplaces ? marketRowsData : marketRowsData.slice(0, 5);

    /* ---- phone helpers ---------------------------------------------------
       All derived from state the desktop layout already holds. */
    const M_RANGES = [
      { id: "7D", days: 7 }, { id: "1M", days: 30 }, { id: "3M", days: 90 },
      { id: "6M", days: 182 }, { id: "1Y", days: 365 }, { id: "Max", days: 0 }
    ];

    function mSeries(range) {
      const rows = Array.isArray(priceHistory) ? priceHistory : [];
      const found = M_RANGES.find((entry) => entry.id === range);
      const days = found ? found.days : 0;
      return days > 0 ? rows.slice(-days) : rows;
    }

    // Change over a window, as a percentage of the oldest point in it.
    function mChange(days) {
      const rows = Array.isArray(priceHistory) ? priceHistory : [];
      if (rows.length < 2) return null;
      const slice = days > 0 ? rows.slice(-days) : rows;
      if (slice.length < 2) return null;
      const first = Number(slice[0].price);
      const last = Number(slice[slice.length - 1].price);
      if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
      return ((last - first) / first) * 100;
    }

    function mPct(value) {
      if (value == null) return "—";
      const sign = value >= 0 ? "+" : "";
      return sign + value.toFixed(2) + "%";
    }

    /* The chart is an inline SVG rather than the desktop canvas: it scales with
       the card, needs no resize observer, and the y-axis can be scaled to the
       SELECTED range instead of the all-time range, which the spec asks for and
       a shared canvas could not do without disturbing the desktop chart. */
    function MItemChart({ rows, height = 150 }) {
      const points = (rows || []).map((row) => Number(row.price)).filter((v) => Number.isFinite(v));
      if (points.length < 2) {
        return <p className="mitem-empty">No price history yet.</p>;
      }
      const W = 320;
      const H = height;
      const PAD_T = 8;
      const PAD_B = 18;
      const lo = Math.min(...points);
      const hi = Math.max(...points);
      const span = hi - lo || 1;
      const x = (i) => (i / (points.length - 1)) * W;
      const y = (v) => PAD_T + (1 - (v - lo) / span) * (H - PAD_T - PAD_B);
      const line = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
      const area = `${line} L${W},${H - PAD_B} L0,${H - PAD_B} Z`;
      const grid = [0, 0.5, 1].map((t) => ({ t, value: lo + span * t }));
      const first = rows[0], mid = rows[Math.floor(rows.length / 2)], last = rows[rows.length - 1];
      return (
        <div className="mitem-chart">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
               aria-label={`Price from ${formatPrice(points[0])} to ${formatPrice(points[points.length - 1])} over the selected range.`}>
            {grid.map((g) => (
              <line key={g.t} x1="0" x2={W} y1={y(g.value)} y2={y(g.value)} className="mitem-grid" />
            ))}
            <path d={area} className="mitem-area" />
            <path d={line} className="mitem-line" />
          </svg>
          <div className="mitem-yaxis" aria-hidden="true">
            {grid.slice().reverse().map((g) => <span key={g.t}>{formatPrice(g.value)}</span>)}
          </div>
          <div className="mitem-xaxis" aria-hidden="true">
            <span>{formatDate(first.date)}</span>
            <span>{formatDate(mid.date)}</span>
            <span>{formatDate(last.date)}</span>
          </div>
        </div>
      );
    }

    if (isPhone) {
      /* A generated item page carries its own identity in window.__ITEM_ROUTE__,
         written by scripts/build_item_urls.php. ITEM_DETAILS is the demo item
         (M4A1-S | Vaporwave) that the page falls back to until the live record
         arrives - and when that fetch fails, the fallback is what you see, with
         the wrong name and the wrong picture under the right <title>. The route
         needs no fetch, so prefer it and keep ITEM_DETAILS as the last resort. */
      const route = (window.__ITEM_ROUTE__ && typeof window.__ITEM_ROUTE__ === "object")
        ? window.__ITEM_ROUTE__
        : null;
      const mTitle = String((route && (route.display_name || route.market_hash_name)) || ITEM_DETAILS.title);
      const mImage = String((route && route.image) || activeWeaponImage || ITEM_DETAILS.image);
      const mType = String((route && route.category) || ITEM_DETAILS.collectionName || "");

      const rows = mSeries(mRange);
      const current = Array.isArray(priceHistory) && priceHistory.length
        ? Number(priceHistory[priceHistory.length - 1].price)
        : null;
      const today = mChange(2);
      const chips = [
        { label: "24h", value: mChange(2) },
        { label: "7d", value: mChange(7) },
        { label: "30d", value: mChange(30) },
        { label: "90d", value: mChange(90) },
        { label: "All", value: mChange(0) }
      ];
      // Cheapest first; Steam is the reference every other row is compared to.
      const priced = marketRowsData
        .map((row) => ({ ...row, num: Number(String(row.finalPrice).replace(/[^0-9.]/g, "")) }))
        .filter((row) => Number.isFinite(row.num) && row.num > 0)
        .sort((a, b) => a.num - b.num);
      const steamRow = priced.find((row) => /steam/i.test(row.name));
      const steamPrice = steamRow ? steamRow.num : null;
      const buyRows = mShowAllMarkets ? priced : priced.slice(0, 6);

      return (
        <Layout>
          <div className="mitem">
            <header className="mitem-bar">
              <button type="button" className="mitem-icon" aria-label="Back" onClick={() => window.history.back()}>
                <i className="fa-solid fa-arrow-left" aria-hidden="true" />
              </button>
              <h1 className="mitem-bar-title">{mTitle}</h1>
              <button type="button" className="mitem-icon" aria-label="Share"
                onClick={() => {
                  const url = window.location.href;
                  if (navigator.share) navigator.share({ title: mTitle, url }).catch(() => {});
                  else if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
                }}>
                <i className="fa-solid fa-share-nodes" aria-hidden="true" />
              </button>
              <button type="button" className="mitem-icon"
                aria-label={mWatched ? "Remove from watchlist" : "Add to watchlist"}
                aria-pressed={mWatched} onClick={() => setMWatched((v) => !v)}>
                <i className={mWatched ? "fa-solid fa-star" : "fa-regular fa-star"} aria-hidden="true" />
              </button>
            </header>

            <section className="mitem-hero">
              <div className="mitem-shot">
                <img src={mImage} alt={mTitle} />
              </div>
              <span className="mitem-type">{mType}</span>
              <h2 className="mitem-name">{mTitle}</h2>
              <p className="mitem-sub">{ITEM_DETAILS.description}</p>
              <button type="button" className="mitem-steam" onClick={() => openSteamListing(selectedInspectWear)}>
                View on Steam <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
              </button>
            </section>

            <section className="mitem-card">
              <div className="mitem-pricetop">
                <span className="mitem-price">{current != null ? formatPrice(current) : "\u2014"}</span>
                {today != null && (
                  <span className={classNames("mitem-delta", today >= 0 ? "up" : "down")}>{mPct(today)} today</span>
                )}
                <span className="mitem-src">Steam</span>
              </div>

              <div className="mitem-chips">
                {chips.map((chip) => (
                  <span key={chip.label}
                        className={classNames("mitem-chip", chip.value == null ? "flat" : chip.value >= 0 ? "up" : "down")}>
                    <b>{chip.label}</b> {mPct(chip.value)}
                  </span>
                ))}
              </div>

              <div className="mitem-seg" role="group" aria-label="Price range">
                {M_RANGES.map((entry) => (
                  <button key={entry.id} type="button"
                          className={classNames("mitem-segbtn", mRange === entry.id && "is-active")}
                          aria-pressed={mRange === entry.id}
                          onClick={() => setMRange(entry.id)}>
                    {entry.id}
                  </button>
                ))}
              </div>

              <MItemChart rows={rows} />
            </section>

            <div className="mitem-actions">
              <button type="button" className="mitem-act primary" onClick={() => setAlertModalOpen(true)}>
                <i className="fa-solid fa-bell" aria-hidden="true" /> Price alert
              </button>
              <a className="mitem-act" href={"index.html?q=" + encodeURIComponent("Analyse " + mTitle)}>
                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> AI analysis
              </a>
            </div>

            <section className="mitem-sec">
              <div className="mitem-sechead">
                <h2>Listings by market</h2>
                <span>{distributionData.length} markets</span>
              </div>
              {distributionData.length === 0 ? (
                <p className="mitem-empty">No listing data yet.</p>
              ) : (
                <>
                  <div className="mitem-dist">
                    {distributionData
                      .slice()
                      .sort((a, b) => Number(b.volume) - Number(a.volume))
                      .map((entry) => {
                        const top = Math.max(...distributionData.map((row) => Number(row.volume) || 0)) || 1;
                        const value = Number(entry.volume) || 0;
                        // A 0-listing market still gets a 2px stub, so the row
                        // reads as "none" rather than as a missing row.
                        const width = value > 0 ? Math.max((value / top) * 100, 1.5) : 0;
                        const isSteam = /steam/i.test(entry.marketplace);
                        return (
                          <div className="mitem-distrow" key={entry.marketplace}>
                            <span className="mitem-distname">{entry.marketplace}</span>
                            <span className="mitem-disttrack">
                              <span
                                className={classNames("mitem-distbar", isSteam && "is-steam")}
                                style={{ width: width + "%", minWidth: value > 0 ? undefined : "2px" }}
                              />
                            </span>
                            <span className="mitem-distval">{formatCount(value)}</span>
                          </div>
                        );
                      })}
                  </div>
                  <p className="mitem-disttotal">{formatCount(distributionTotal)} listings in total</p>
                </>
              )}
            </section>

            <section className="mitem-sec">
              <div className="mitem-sechead">
                <h2>Where to buy</h2>
                <span>{priced.length} markets</span>
              </div>
              <div className="mitem-buy">
                {buyRows.map((row) => {
                  const isSteam = /steam/i.test(row.name);
                  const vsSteam = !isSteam && steamPrice ? ((row.num - steamPrice) / steamPrice) * 100 : null;
                  const cheapest = priced.length > 0 && row.num === priced[0].num;
                  return (
                    <a className="mitem-buyrow" key={row.name} href={row.url || "#"}
                       target="_blank" rel="noopener noreferrer">
                      <span className="mitem-buybody">
                        <span className="mitem-buyname">{row.name}</span>
                        <span className="mitem-buymeta">Fee {row.fee}</span>
                      </span>
                      <span className="mitem-buyprice">
                        <span className={classNames("mitem-buyval", cheapest && "best")}>{formatPrice(row.num)}</span>
                        <span className="mitem-buyvs">
                          {isSteam
                            ? "Reference price"
                            : vsSteam != null
                              ? (vsSteam >= 0 ? "+" : "") + vsSteam.toFixed(0) + "% vs Steam"
                              : ""}
                        </span>
                      </span>
                      <i className="fa-solid fa-arrow-up-right-from-square mitem-buygo" aria-hidden="true" />
                    </a>
                  );
                })}
              </div>
              {priced.length > 6 && (
                <button type="button" className="mitem-more" onClick={() => setMShowAllMarkets((v) => !v)}>
                  {mShowAllMarkets ? "Show fewer markets" : "Show all " + priced.length + " markets"}
                </button>
              )}
            </section>
            {/* 10. Community ideas - the same component the desktop page and
                the TF2 item page mount, not a phone copy of it, so posts and
                sentiment stay one implementation. */}
            {window.CS2React && window.CS2React.CommunityIdeas ? (
              <window.CS2React.CommunityIdeas
                itemName={mTitle}
                itemTitle={mTitle}
                priceSymbol="\u20AC"
              />
            ) : null}
          </div>
          {alertModalOpen && <ItemPriceAlertModal itemName={ITEM_DETAILS.title} onClose={() => setAlertModalOpen(false)} />}
        </Layout>
      );
    }

    return (
      <Layout>
        <div className="item-page">
          <div className="item-container">
            <div className="item-preview">
              <div className="item-card covert">
                <div className="item-info">
                  <h1 className="item-title">{ITEM_DETAILS.title}</h1>

                  <div className="item-collection">
                    <img src={ITEM_DETAILS.collectionImage} alt={ITEM_DETAILS.collectionName} />
                    <span><b>{ITEM_DETAILS.collectionName}</b></span>
                  </div>

                  <div className="item-image">
                    <img
                      id="weaponImage"
                      src={activeWeaponImage}
                      alt={ITEM_DETAILS.title}
                      style={{ opacity: isViewerActive ? 0 : 1 }}
                    />
                    <div
                      id="weaponViewer3D"
                      className={isViewerActive ? "active" : ""}
                      ref={viewerContainerRef}
                    />
                  </div>
                </div>

                <div className="preview-action-row">
                  <div
                    className={`viewer-3d-btn${isViewerActive ? " active" : ""}`}
                    id="view3dBtn"
                    onClick={toggle3DViewer}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggle3DViewer();
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <i className="fa-solid fa-cube" /> {isViewerActive ? "View in 2D" : "View in 3D"}
                  </div>

                  <button
                    type="button"
                    className={`viewer-3d-btn inspect-game-btn${inspectLoading ? " loading" : ""}`}
                    onClick={() => openInspectTarget(inspectLaunchWear)}
                    disabled={inspectLoading || !canInspectInGame}
                    title={inspectLoading
                      ? "Loading Counter-Strike preview link..."
                      : canInspectInGame
                        ? inspectLaunchWear === selectedInspectWear
                          ? `Open ${ITEM_DETAILS.title} (${selectedInspectWear}) in Counter-Strike`
                          : `Open ${ITEM_DETAILS.title} in Counter-Strike using the nearest live preview for ${inspectLaunchWear}`
                        : `A live Counter-Strike preview link is not available for ${selectedInspectWear} right now.`}
                  >
                    <i className="fa-solid fa-crosshairs" />
                    {inspectLoading
                      ? "Loading Game Link..."
                      : canInspectInGame
                        ? `View in Game (${inspectLaunchShort})`
                        : "View in Game"}
                  </button>
                </div>

                <div className="inspect-buttons">
                  {INSPECT_WEAR_OPTIONS.map((option) => (
                    <button
                      type="button"
                      className={`inspect-btn ${option.buttonClass}${selectedInspectWear === option.wear ? " active" : ""}`}
                      key={option.wear}
                      aria-pressed={selectedInspectWear === option.wear}
                      title={`Show ${option.wear} preview`}
                      onClick={(event) => selectWearPreview(event, option.wear)}
                    >
                      {option.label || option.wear}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="item-summary-panel">
              <div className="quality-prices">
                <div className="quality-header">
                  <span>Wear</span>
                  <span>Price</span>
                  <span style={{ color: "#f97316" }}>StatTrak</span>
                </div>

                {qualityRows.map((row) => (
                  <div className="quality-row" key={row.wear}>
                    <span>{row.wear}</span>
                    <span className="price">{row.price}</span>
                    <span className="price stattrak">{row.stattrak}</span>
                  </div>
                ))}

                <div className="price-actions">
                  <div className="item-buttons">
                    <button type="button" onClick={() => openSteamListing(selectedInspectWear)} className="info-btn steam-btn" title={`Open ${ITEM_DETAILS.title} (${selectedInspectWear}) on the Steam market`}>
                      <i className="fa-brands fa-steam" />
                      View on Steam ({activeInspectShort})
                    </button>

                    <button className="info-btn secondary price-alert-btn" type="button" onClick={() => setAlertModalOpen(true)}>
                      <i className="fa-solid fa-bell" />
                      Price Alert
                    </button>
                  </div>

                  <div className="item-description">
                    <h3>Description</h3>
                    <p>{ITEM_DETAILS.description}</p>
                  </div>

                  <div className="item-meta">
                    <div className="meta-row">
                      <span className="meta-label">Added:</span>
                      <span className="meta-value">{ITEM_DETAILS.added}</span>
                    </div>

                    <div className="meta-row">
                      <span className="meta-label">Update:</span>
                      <span className="meta-value">{ITEM_DETAILS.update}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="market-compare">
            <h2>Marketplace Prices</h2>

            <div className="market-table">
              <div className="market-row header">
                <span>Marketplace</span>
                <span>Base Price</span>
                <span>Fee</span>
                <span>After Tax</span>
                <span />
              </div>

              {marketRows.map((row) => (
                <div className={classNames("market-row", row.best && "best", row.extra && "extra")} key={row.name}>
                  <span className="market-name">
                    {row.image ? <img src={row.image} alt={row.name} /> : <MarketplaceBadge name={row.name} />}
                    {row.name}
                  </span>

                  <span>{row.basePrice}</span>
                  <span>{row.fee}</span>
                  <span className="final">{row.finalPrice}</span>

                  <a className="buy-btn">Buy</a>
                </div>
              ))}
            </div>
          </div>

          <div className="expand-markets">
            <button
              id="expandMarketsBtn"
              type="button"
              aria-expanded={showExtraMarketplaces}
              onClick={() => setShowExtraMarketplaces((current) => !current)}
            >
              {showExtraMarketplaces ? "Hide Extra Marketplaces" : "Show More Marketplaces"}
              <i className="fa-solid fa-chevron-down" />
            </button>
          </div>

          <div className="analytics-section">
            <div className="price-chart" ref={bindFullscreenRef("price-history")}>
              <FullscreenButton
                active={fullscreenTarget === "price-history"}
                label="Price History"
                onClick={() => toggleFullscreen("price-history")}
              />
              <div className="chart-headline-row">
                <div className="chart-header-left">
                  <div className="chart-overline">Market History</div>
                  <h2>Cheapest Price History</h2>
                  <p className="chart-subtitle" id="chartSubtitle">{chartSubtitle}</p>
                </div>

                <div className="chart-point-badge">
                  <i className="fa-solid fa-circle-info" />
                  <span><strong id="chartPointCount">{priceHistory.length}</strong> data points</span>
                </div>
              </div>

              <div className="chart-summary-row">
                <div className="chart-price-stack">
                  <div className="chart-price-row">
                    <span className="chart-current-price" id="chartCurrentPrice">
                      {priceHistory.length ? formatPrice(priceValues[priceValues.length - 1]) : "\u2014"}
                    </span>
                    <span className={`chart-delta ${toneClass(chartDelta)}`} id="chartDelta">
                      {formatPercent(chartDelta)}
                    </span>
                  </div>

                  <div className="chart-badge-row">
                    {chartBadges.map((badge) => (
                      <span className={`chart-stat-badge ${toneClass(badge.value)}`} key={badge.label}>
                        {badge.label} {formatPercent(badge.value)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="chart-toolbar">
                  <div className="chart-ranges">
                    {["7D", "1M", "3M", "6M", "1Y", "ALL"].map((range) => (
                      <button
                        className={`range-btn${priceRange === range ? " active" : ""}`}
                        data-range={range}
                        key={range}
                        onClick={() => setPriceRange(range)}
                      >
                        {range === "ALL" ? "All" : range}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="price-chart-wrapper">
                <canvas id="priceHistoryChart" ref={priceChartCanvasRef} />
              </div>
            </div>

            <div className="analytics-grid">
              <div className="chart-card supply-card" ref={bindFullscreenRef("total-supply")}>
                <FullscreenButton
                  active={fullscreenTarget === "total-supply"}
                  label="Total Supply"
                  onClick={() => toggleFullscreen("total-supply")}
                />
                <div className="supply-header">
                  <div>
                    <div className="mini-stat-label">Total Supply</div>
                    <div className="mini-stat-value" id="supplyTotal">{totalSupplyLabel}</div>
                  </div>
                  <div className="mini-ranges" data-control="supply">
                    {["1M", "6M", "1Y"].map((range) => (
                      <button
                        className={`mini-btn${distributionRange === range ? " active" : ""}`}
                        data-range={range}
                        key={range}
                        onClick={() => setDistributionRange(range)}
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="supply-body">
                  <div className="donut-wrap">
                    <canvas id="donutChart" ref={donutChartCanvasRef} />
                    {donutHover && (
                      <div
                        className={classNames("donut-hover-tooltip", donutHover.side)}
                        style={{ left: `${donutHover.left}px`, top: `${donutHover.top}px` }}
                      >
                        <div className="donut-hover-title">{donutHover.title}</div>
                        <div className="donut-hover-subtitle">{donutHover.subtitle}</div>
                      </div>
                    )}
                    <div className="donut-center-overlay">
                      <div className="donut-center-num" id="donutCenterNum">{distributionTotal}</div>
                      <div className="donut-center-sub">listings</div>
                    </div>
                  </div>

                  <div className="donut-legend" id="donutLegend">
                    {distributionData.map((entry) => (
                      <div
                        className={`donut-legend-item${entry.marketplace === selectedMarket ? " selected" : ""}`}
                        key={entry.marketplace}
                        onClick={() => setSelectedMarket(entry.marketplace)}
                      >
                        <span className="donut-legend-dot" style={{ background: marketColor(entry.marketplace) }} />
                        <span className="donut-legend-name">{entry.marketplace}</span>
                        <span className="donut-legend-count">{entry.volume}</span>
                        <span className="donut-legend-pct">{entry.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="market-distribution-panel">
                  <div className="market-distribution-title">
                    <span className="market-distribution-accent" />
                    <span>Market Distribution</span>
                  </div>

                  <div className="market-region-card east">
                    <div className="market-region-icon">
                      <i className="fa-solid fa-earth-asia" />
                    </div>
                    <div className="market-region-copy">
                      <div className="market-region-heading">
                        <span>Eastern Markets</span>
                        <span className="market-region-pill">{regionalMarketShare.eastPct}%</span>
                      </div>
                      <div className="market-region-list">
                        {regionalMarketShare.eastEntries.length
                          ? regionalMarketShare.eastEntries.map((entry) => entry.marketplace).join(", ")
                          : "Buff.163, YouPin898, SkinSwap CN"}
                      </div>
                    </div>
                  </div>

                  <div className="market-region-card west">
                    <div className="market-region-icon">
                      <i className="fa-solid fa-earth-europe" />
                    </div>
                    <div className="market-region-copy">
                      <div className="market-region-heading">
                        <span>Western Markets</span>
                        <span className="market-region-pill">{regionalMarketShare.westPct}%</span>
                      </div>
                      <div className="market-region-list">
                        {regionalMarketShare.westEntries.length
                          ? regionalMarketShare.westEntries.map((entry) => entry.marketplace).join(", ")
                          : "CSFloat, Steam, Skinport, White.Market, UUSkins, Ecosteam"}
                      </div>
                    </div>
                  </div>

                  <div className="market-distribution-bar-labels">
                    <span>Eastern Market Share</span>
                    <span>Western Market Share</span>
                  </div>
                  <div className="market-distribution-bar">
                    <span className="market-distribution-east" style={{ width: `${regionalMarketShare.eastPct}%` }} />
                  </div>
                </div>
              </div>

              <div className="chart-card listings-card" ref={bindFullscreenRef("active-listings")}>
                <FullscreenButton
                  active={fullscreenTarget === "active-listings"}
                  label="Active Listings"
                  onClick={() => toggleFullscreen("active-listings")}
                />
                <div className="listings-top">
                  <div className="mini-stat-label">Active Listings</div>
                  <div className="market-tabs-wrap" id="marketTabs">
                    {MAIN_MARKETS.map((market) => {
                      const active = market === selectedMarket;
                      return (
                        <button
                          className={`market-tab${active ? " active" : ""}`}
                          data-name={market}
                          key={market}
                          onClick={() => setSelectedMarket(market)}
                          style={active ? { background: `${marketColor(market)}33`, borderColor: `${marketColor(market)}88` } : undefined}
                        >
                          <span className="market-tab-dot" style={{ background: marketColor(market) }} />
                          {market}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="listing-stats-row" id="listingStatsRow">
                  <div className="listing-stat-box">
                    <div className="lsb-label">Best Price</div>
                    <div className="lsb-value">{Number(listingsData.best_price || 0).toFixed(2)}</div>
                    <div className="lsb-sub">before fee</div>
                  </div>
                  <div className="listing-stat-box">
                    <div className="lsb-label">Platform Fee</div>
                    <div className="lsb-value">{listingsData.fee_pct}%</div>
                    <div className="lsb-sub">of sale price</div>
                  </div>
                  <div className="listing-stat-box">
                    <div className="lsb-label">Active Stock</div>
                    <div className="lsb-value">{listingsData.total_stock}</div>
                    <div className={`lsb-sub ${listingsTrendUp ? "up" : "down"}`}>
                      {listingsTrendUp ? "+" : ""}{Number(listingsData.trend_pct || 0).toFixed(1)}% this week
                    </div>
                  </div>
                  <div className="listing-stat-box">
                    <div className="lsb-label">Market Share</div>
                    <div className="lsb-value" id="mktShareVal">
                      {selectedShare ? `${selectedShare.pct}%` : "--%"}
                    </div>
                    <div className="lsb-sub">of total supply</div>
                  </div>
                </div>

                <div className="listings-bar-wrap">
                  <canvas id="listingsBar" ref={listingsBarCanvasRef} />
                </div>

              </div>
            </div>

            <div className="mini-charts-row">
              <div className="chart-card mini-chart-card order-book-card" ref={bindFullscreenRef("order-book")}>
                <FullscreenButton
                  active={fullscreenTarget === "order-book"}
                  label="Universal Order Book"
                  onClick={() => toggleFullscreen("order-book")}
                />
                <div className="order-book-header">
                  <div>
                    <h2>Universal Order Book</h2>
                    <p>All available buy orders and sell orders combined.</p>
                  </div>
                  <div className="order-book-badge">
                    <i className="fa-solid fa-circle-info" />
                    <span>{orderBook.badgeCount} data points</span>
                  </div>
                </div>

                <div className="order-book-stats">
                  <div className="order-book-stat buy">
                    <span>Highest Buy Order</span>
                    <strong>{formatPrice(orderBook.highestBuy)}</strong>
                  </div>
                  <div className="order-book-stat spread">
                    <span>Cash Spread</span>
                    <strong>{formatPrice(orderBook.cashSpread)}</strong>
                  </div>
                  <div className="order-book-stat steam">
                    <span>Steam Spread</span>
                    <strong>{formatPrice(orderBook.steamSpread)}</strong>
                  </div>
                  <div className="order-book-stat sell">
                    <span>Lowest Sell Order</span>
                    <strong>{formatPrice(orderBook.lowestSell)}</strong>
                  </div>
                </div>

                <div className="mini-top order-book-toolbar">
                  <div className="order-book-legend">
                    <span className="order-book-pill buy">
                      <span className="order-book-pill-dot" />
                      Buy Orders
                    </span>
                    <span className="order-book-pill sell">
                      <span className="order-book-pill-dot" />
                      Sell Orders
                    </span>
                  </div>

                  <div className="mini-ranges" data-control="roi">
                    {["1M", "6M", "1Y"].map((range) => (
                      <button
                        className={`mini-btn${roiRange === range ? " active" : ""}`}
                        data-range={range}
                        key={range}
                        onClick={() => setRoiRange(range)}
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mini-canvas-wrap order-book-canvas-wrap">
                  <canvas id="roiChart" ref={roiCanvasRef} />
                </div>

                <div className="order-book-footer">
                  <span>{formatCount(orderBook.buyOrders)} buy</span>
                  <span className="order-book-footer-label">Price ({PRICE_SYMBOL})</span>
                  <span>{formatCount(orderBook.sellOrders)} sell</span>
                </div>

              </div>

              <div className="chart-card mini-chart-card provider-history-card" ref={bindFullscreenRef("provider-history")}>
                <FullscreenButton
                  active={fullscreenTarget === "provider-history"}
                  label="Provider Price History"
                  onClick={() => toggleFullscreen("provider-history")}
                />
                <div className="mini-top">
                  <div>
                    <div className="mini-stat-label">Provider Price History</div>
                    <div className="mini-stat-value provider-count" id="providerCount">
                      {providerSeries.providers.length} Providers
                    </div>
                  </div>
                  <div className="mini-ranges" data-control="providers">
                    {["30D", "90D", "180D", "1Y"].map((range) => (
                      <button
                        className={`mini-btn${providerRange === range ? " active" : ""}`}
                        data-range={range}
                        key={range}
                        onClick={() => setProviderRange(range)}
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="provider-legend" id="providerLegend">
                  {providerSeries.providers.map((provider) => (
                    <span className="provider-pill" key={provider.name}>
                      <span className="provider-dot" style={{ background: provider.color }} />
                      {provider.name}
                    </span>
                  ))}
                </div>

                <div className="mini-canvas-wrap provider-canvas-wrap">
                  <canvas id="providerPriceChart" ref={providerCanvasRef} />
                </div>

                <div className="provider-order-grid">
                  <div className="provider-order-card sell">
                    <div className="provider-order-title">
                      Top Sell Orders ({providerOrderPanels.sell.length} sources, {formatCount(orderBook.sellOrders)} total)
                    </div>

                    <div className="provider-order-list">
                      {providerOrderPanels.sell.map((entry, index) => (
                        <div className="provider-order-row" key={`sell-${entry.marketplace}`}>
                          <span className="provider-order-rank">{index + 1}</span>
                          <span className="provider-order-market">
                            <MarketplaceBadge name={entry.marketplace} compact />
                            <span className="provider-order-market-copy">
                              <span className="provider-order-market-name">{entry.marketplace}</span>
                              <span className="provider-order-market-count">({formatCount(entry.count)})</span>
                            </span>
                          </span>
                          <span className="provider-order-price sell">{formatPrice(entry.price)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {alertModalOpen && <ItemPriceAlertModal itemName={ITEM_DETAILS.title} onClose={() => setAlertModalOpen(false)} />}
      </Layout>
    );
  }

  mountPage(<ItemPage />);
})();
