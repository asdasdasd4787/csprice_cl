(() => {
  (() => {
    const { useState } = React;
    const { Layout, SortChipPicker, ShowcaseCard, CategoryCountBadge, mountPage, useI18n } = window.CS2React;
    const COLLECTIONS = [
      { name: "The Achroma Collection", intro: "2026-01-21", category: "Weapon Skins" },
      { name: "The Ascent Collection", intro: "2025-03-31", category: "Weapon Skins" },
      { name: "The Boreal Collection", intro: "2025-03-31", category: "Weapon Skins" },
      { name: "The Genesis Collection", intro: "2025-09-17", category: "Weapon Skins" },
      { name: "The Harlequin Collection", intro: "2026-01-21", category: "Weapon Skins" },
      { name: "The Radiant Collection", intro: "2025-03-31", category: "Weapon Skins" },
      { name: "Limited Edition Item", intro: "2024-10-02", category: "Armory Exclusive" },
      { name: "The Graphic Design Collection", intro: "2024-10-02", category: "Armory Exclusive" },
      { name: "The Overpass 2024 Collection", intro: "2024-10-02", category: "Armory Exclusive" },
      { name: "The Sport & Field Collection", intro: "2024-10-02", category: "Armory Exclusive" },
      { name: "The Train 2025 Collection", intro: "2025-03-31", category: "Armory Exclusive" },
      { name: "The 2021 Dust 2 Collection", intro: "2021-09-22", category: "Operation Riptide" },
      { name: "The 2021 Mirage Collection", intro: "2021-09-22", category: "Operation Riptide" },
      { name: "The 2021 Train Collection", intro: "2021-09-22", category: "Operation Riptide" },
      { name: "The 2021 Vertigo Collection", intro: "2021-09-22", category: "Operation Riptide" },
      { name: "The Ancient Collection", intro: "2020-12-03", category: "Operation Broken Fang" },
      { name: "The Control Collection", intro: "2020-12-03", category: "Operation Broken Fang" },
      { name: "The Havoc Collection", intro: "2020-12-03", category: "Operation Broken Fang" },
      { name: "The Canals Collection", intro: "2019-11-18", category: "Operation Shattered Web" },
      { name: "The Norse Collection", intro: "2019-11-18", category: "Operation Shattered Web" },
      { name: "The St. Marc Collection", intro: "2019-11-18", category: "Operation Shattered Web" },
      { name: "The Cache Collection", intro: "2014-08-08", category: "Legacy Operation" },
      { name: "The Chop Shop Collection", intro: "2015-05-26", category: "Legacy Operation" },
      { name: "The Cobblestone Collection", intro: "2014-07-01", category: "Legacy Operation" },
      { name: "The Gods and Monsters Collection", intro: "2015-05-26", category: "Legacy Operation" },
      { name: "The Overpass Collection", intro: "2014-07-01", category: "Legacy Operation" },
      { name: "The Rising Sun Collection", intro: "2015-05-26", category: "Legacy Operation" },
      { name: "The Anubis Collection", intro: "2023-04-24", category: "Discontinued" },
      { name: "The Assault Collection", intro: "2013-08-14", category: "Discontinued" },
      { name: "The Aztec Collection", intro: "2013-08-14", category: "Discontinued" },
      { name: "The Baggage Collection", intro: "2014-07-01", category: "Discontinued" },
      { name: "The Bank Collection", intro: "2014-05-01", category: "Discontinued" },
      { name: "The Dust Collection", intro: "2013-08-14", category: "Discontinued" },
      { name: "The Inferno Collection", intro: "2013-08-14", category: "Discontinued" },
      { name: "The Italy Collection", intro: "2013-11-27", category: "Discontinued" },
      { name: "The Lake Collection", intro: "2013-11-27", category: "Discontinued" },
      { name: "The Militia Collection", intro: "2013-08-14", category: "Discontinued" },
      { name: "The Mirage Collection", intro: "2013-11-27", category: "Discontinued" },
      { name: "The Nuke Collection", intro: "2013-08-14", category: "Discontinued" },
      { name: "The Office Collection", intro: "2013-08-14", category: "Discontinued" },
      { name: "The Train Collection", intro: "2013-11-27", category: "Discontinued" },
      { name: "The Vertigo Collection", intro: "2013-08-14", category: "Discontinued" },
      { name: "The 2018 Inferno Collection", intro: "2018-09-01", category: "Discontinued" },
      { name: "The 2018 Nuke Collection", intro: "2018-09-01", category: "Discontinued" },
      { name: "The Alpha Collection", intro: "2013-09-19", category: "Discontinued" },
      { name: "The Blacksite Collection", intro: "2018-12-06", category: "Discontinued" },
      { name: "The Dust 2 Collection", intro: "2013-11-27", category: "Discontinued" },
      { name: "The Safehouse Collection", intro: "2013-11-27", category: "Discontinued" }
    ];
    const OPERATION_MEDIA_ACCENT = "#f97316";
    const OPERATION_CATEGORIES = /* @__PURE__ */ new Set([
      "Operation Riptide",
      "Operation Broken Fang",
      "Operation Shattered Web",
      "Legacy Operation"
    ]);
    const GROUP_COLORS = {
      "Weapon Skins": "#60a5fa",
      "Armory Exclusive": "#f472b6",
      "Operation Riptide": OPERATION_MEDIA_ACCENT,
      "Operation Broken Fang": OPERATION_MEDIA_ACCENT,
      "Operation Shattered Web": OPERATION_MEDIA_ACCENT,
      "Legacy Operation": OPERATION_MEDIA_ACCENT,
      Discontinued: "#f87171"
    };
    const COLLECTION_GROUP_ORDER = [
      "Weapon Skins",
      "Armory Exclusive",
      "Operation Riptide",
      "Operation Broken Fang",
      "Operation Shattered Web",
      "Legacy Operation",
      "Discontinued"
    ];
    const COLLECTION_IMAGE_MAP = {
      "The Achroma Collection": "assets/collections/source2/achroma-source2.svg",
      "The Alpha Collection": "assets/collections/the_alpha_collection.png",
      "The Ancient Collection": "assets/collections/the_ancient_collection.png",
      "The Anubis Collection": "assets/collections/anubis.webp",
      "The Ascent Collection": "assets/collections/source2/ascent-source2.svg",
      "The Assault Collection": "assets/collections/the_assault_collection.png",
      "The Aztec Collection": "assets/collections/the_aztec_collection.png",
      "The Baggage Collection": "assets/collections/the_baggage_collection.png",
      "The Bank Collection": "assets/collections/bank.webp",
      "The Blacksite Collection": "assets/collections/the_blacksite_collection.png",
      "The Boreal Collection": "assets/collections/source2/boreal-source2.svg",
      "The Canals Collection": "assets/collections/canals.webp",
      "The Cache Collection": "assets/collections/cashe.webp",
      "The Chop Shop Collection": "assets/collections/chop-shop.webp",
      "The Cobblestone Collection": "assets/collections/cobblestone.webp",
      "The Control Collection": "assets/collections/control.webp",
      "The 2021 Dust 2 Collection": "assets/collections/21dust.webp",
      "The Dust 2 Collection": "assets/collections/dust-2.webp",
      "The Dust Collection": "assets/collections/the_dust_collection.png",
      "The Genesis Collection": "assets/collections/source2/genesis-source2.svg",
      "The Gods and Monsters Collection": "assets/collections/gods-and-monsters.webp",
      "The Graphic Design Collection": "assets/collections/source2/graphic-design-source2.svg",
      "The Harlequin Collection": "assets/collections/source2/harlequin-source2.svg",
      "The Havoc Collection": "assets/collections/the_havoc_collection.png",
      "The 2018 Inferno Collection": "assets/collections/inferno-2018.webp",
      "The Inferno Collection": "assets/collections/the_inferno_collection.png",
      "The Italy Collection": "assets/collections/italy.webp",
      "The Lake Collection": "assets/collections/the_lake_collection.png",
      "Limited Edition Item": "assets/collections/limited_edition_item.png",
      "The Militia Collection": "assets/collections/the_militia_collection.png",
      "The 2021 Mirage Collection": "assets/collections/the_2021_mirage_collection.png",
      "The Mirage Collection": "assets/collections/mirage.webp",
      "The Norse Collection": "assets/collections/norse.webp",
      "The 2018 Nuke Collection": "assets/collections/nuke-2018.webp",
      "The Nuke Collection": "assets/collections/the_nuke_collection.png",
      "The Office Collection": "assets/collections/office.webp",
      "The Overpass 2024 Collection": "assets/collections/source2/overpass-2024-source2.svg",
      "The Overpass Collection": "assets/collections/overpass.webp",
      "The Radiant Collection": "assets/collections/source2/radiant-source2.svg",
      "The Rising Sun Collection": "assets/collections/rising-sun.webp",
      "The Safehouse Collection": "assets/collections/the_safehouse_collection.png",
      "The Sport & Field Collection": "assets/collections/the_sport_&_field_collection.png",
      "The St. Marc Collection": "assets/collections/the_st._marc_collection.png",
      "The Train Collection": "assets/collections/the_train_collection.png",
      "The Train 2025 Collection": "assets/collections/source2/train-2025-source2.svg",
      "The 2021 Train Collection": "assets/collections/21train.webp",
      "The 2021 Vertigo Collection": "assets/collections/21_vertigo.webp",
      "The Vertigo Collection": "assets/collections/vertigo.webp"
    };
    function collectionMonogram(name) {
      const pieces = name.replace(/^The\s+/i, "").replace(/\s+Collection$/i, "").replace(/\s+Item$/i, "").split(/[\s.&-]+/).filter(Boolean);
      return pieces.slice(0, 2).map((piece) => /^\d/.test(piece) ? piece.slice(0, 2) : piece[0].toUpperCase()).join("");
    }
    function buildCollectionPlaceholder(entry) {
      const accent = GROUP_COLORS[entry.category] || "#60a5fa";
      const monogram = collectionMonogram(entry.name) || "CS";
      const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 280">
        <defs>
          <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="${accent}" />
            <stop offset="100%" stop-color="#0f172a" />
          </linearGradient>
        </defs>
        <rect width="480" height="280" rx="36" fill="url(#card)" />
        <circle cx="374" cy="70" r="72" fill="rgba(255,255,255,0.1)" />
        <circle cx="98" cy="228" r="104" fill="rgba(15,23,42,0.25)" />
        <text x="50%" y="56%" text-anchor="middle" fill="#e2e8f0" font-family="Arial" font-size="112" font-weight="700">${monogram}</text>
      </svg>
    `;
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }
    function resolveCollectionHref(entry) {
      const image = resolveCollectionImage(entry);
      const pairedCase = {
        "The Fracture Collection": "fracture"
      };
      if (pairedCase[entry.name]) {
        return "detail.html?type=collection&name=" + encodeURIComponent(entry.name) + "&slug=" + encodeURIComponent(pairedCase[entry.name] + " case") + "&image=" + encodeURIComponent(image);
      }
      return "detail.html?type=collection&name=" + encodeURIComponent(entry.name) + "&image=" + encodeURIComponent(image);
    }
    function resolveCollectionImage(entry) {
      return COLLECTION_IMAGE_MAP[entry.name] || buildCollectionPlaceholder(entry);
    }
    function sortWithinGroup(entries, sortValue) {
      const sorted = [...entries];
      if (sortValue === "name-asc") sorted.sort((a, b) => a.name.localeCompare(b.name));
      if (sortValue === "name-desc") sorted.sort((a, b) => b.name.localeCompare(a.name));
      if (sortValue === "intro-old") sorted.sort((a, b) => new Date(a.intro) - new Date(b.intro));
      if (sortValue === "intro-new") sorted.sort((a, b) => new Date(b.intro) - new Date(a.intro));
      return sorted;
    }
    function collectionDisplayCategory(category) {
      return category === "Weapon Skins" ? "Active Drop" : category;
    }
    function formatReleaseDate(isoDate) {
      const date = /* @__PURE__ */ new Date(`${isoDate}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    }
    function sortCollections(entries, sortValue) {
      const known = new Set(COLLECTION_GROUP_ORDER);
      const byGroup = COLLECTION_GROUP_ORDER.map((category) => sortWithinGroup(entries.filter((entry) => entry.category === category), sortValue));
      const unknown = sortWithinGroup(
        entries.filter((entry) => !known.has(entry.category)),
        sortValue
      );
      const discontinuedIndex = COLLECTION_GROUP_ORDER.indexOf("Discontinued");
      const beforeDiscontinued = byGroup.slice(0, discontinuedIndex).flat();
      const discontinued = byGroup[discontinuedIndex] || [];
      return [...beforeDiscontinued, ...unknown, ...discontinued];
    }
    function CollectionsPage() {
      const { t } = useI18n();
      const [search, setSearch] = useState("");
      const [sortValue, setSortValue] = useState("intro-new");
      const query = search.trim().toLowerCase();
      const filtered = COLLECTIONS.filter((entry) => `${entry.name} ${entry.category} ${collectionDisplayCategory(entry.category)}`.toLowerCase().includes(query));
      const displayed = sortCollections(filtered, sortValue);
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: "collections-shell" }, /* @__PURE__ */ React.createElement("header", { className: "collections-head collections-head-animated collections-head--toolbar" }, /* @__PURE__ */ React.createElement("h1", { className: "collections-head-sr-title" }, "CS2 Collections")), /* @__PURE__ */ React.createElement("div", { className: "collections-controls" }, /* @__PURE__ */ React.createElement("div", { className: "collections-search-wrap" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" }), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          id: "searchInput",
          placeholder: "Search by collection name or category...",
          value: search,
          onChange: (event) => setSearch(event.target.value)
        }
      )), /* @__PURE__ */ React.createElement("span", { className: "collections-results-count" }, t("cat_resultsCount", { count: displayed.length })), /* @__PURE__ */ React.createElement(
        SortChipPicker,
        {
          value: sortValue,
          onChange: setSortValue,
          ariaLabel: "Sort collections",
          options: [
            { value: "intro-new", label: "Newest First" },
            { value: "intro-old", label: "Oldest First" },
            { value: "name-asc", label: "Name (A - Z)" },
            { value: "name-desc", label: "Name (Z - A)" }
          ]
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "collections-grid collections-grid-animated", id: "collectionsGrid", key: `grid-${query || "all"}` }, displayed.map((entry, index) => {
        const accent = GROUP_COLORS[entry.category] || "#60a5fa";
        const mediaAccent = OPERATION_CATEGORIES.has(entry.category) ? OPERATION_MEDIA_ACCENT : entry.category === "Discontinued" ? "#f87171" : void 0;
        const href = resolveCollectionHref(entry);
        return /* @__PURE__ */ React.createElement(
          ShowcaseCard,
          {
            key: `${entry.name}-${entry.intro}`,
            href,
            image: resolveCollectionImage(entry),
            imageAlt: entry.name,
            accent,
            mediaAccent,
            labelLeft: collectionDisplayCategory(entry.category),
            title: entry.name,
            subtitle: formatReleaseDate(entry.intro),
            showAccentFoot: false,
            animated: true,
            staggerIndex: index,
            footer: /* @__PURE__ */ React.createElement("span", { className: "card-intro" }, /* @__PURE__ */ React.createElement("span", { className: "card-intro-dot" }), "View all items")
          }
        );
      })), /* @__PURE__ */ React.createElement("p", { className: "no-results", id: "noResults", style: { display: displayed.length ? "none" : "block" } }, "No collections found.")));
    }
    mountPage(/* @__PURE__ */ React.createElement(CollectionsPage, null));
  })();
})();
