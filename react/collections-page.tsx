(() => {
  const { useState } = React;
  const { mountPage } = window.CS2React;
  const { navCases = [] } = window.CS2ReactData || {};

  const COLLECTIONS = [
    { name: "The Achroma Collection", intro: "2026-01-21", category: "Active Prime Drop", kind: "Collection" },
    { name: "The Ascent Collection", intro: "2025-03-31", category: "Active Prime Drop", kind: "Collection" },
    { name: "The Boreal Collection", intro: "2025-03-31", category: "Active Prime Drop", kind: "Collection" },
    { name: "The Genesis Collection", intro: "2025-09-17", category: "Active Prime Drop", kind: "Collection" },
    { name: "The Harlequin Collection", intro: "2026-01-21", category: "Active Prime Drop", kind: "Collection" },
    { name: "The Radiant Collection", intro: "2025-03-31", category: "Active Prime Drop", kind: "Collection" },
    { name: "Limited Edition Item", intro: "2024-10-02", category: "Armory Exclusive", kind: "Collection" },
    { name: "The Graphic Design Collection", intro: "2024-10-02", category: "Armory Exclusive", kind: "Collection" },
    { name: "The Overpass 2024 Collection", intro: "2024-10-02", category: "Armory Exclusive", kind: "Collection" },
    { name: "The Sport & Field Collection", intro: "2024-10-02", category: "Armory Exclusive", kind: "Collection" },
    { name: "The Train 2025 Collection", intro: "2025-03-31", category: "Armory Exclusive", kind: "Collection" },
    { name: "The 2021 Dust 2 Collection", intro: "2021-09-22", category: "Operation Riptide", kind: "Collection" },
    { name: "The 2021 Mirage Collection", intro: "2021-09-22", category: "Operation Riptide", kind: "Collection" },
    { name: "The 2021 Train Collection", intro: "2021-09-22", category: "Operation Riptide", kind: "Collection" },
    { name: "The 2021 Vertigo Collection", intro: "2021-09-22", category: "Operation Riptide", kind: "Collection" },
    { name: "The Ancient Collection", intro: "2020-12-03", category: "Operation Broken Fang", kind: "Collection" },
    { name: "The Control Collection", intro: "2020-12-03", category: "Operation Broken Fang", kind: "Collection" },
    { name: "The Havoc Collection", intro: "2020-12-03", category: "Operation Broken Fang", kind: "Collection" },
    { name: "The Canals Collection", intro: "2019-11-18", category: "Operation Shattered Web", kind: "Collection" },
    { name: "The Norse Collection", intro: "2019-11-18", category: "Operation Shattered Web", kind: "Collection" },
    { name: "The St. Marc Collection", intro: "2019-11-18", category: "Operation Shattered Web", kind: "Collection" },
    { name: "The Cache Collection", intro: "2014-08-08", category: "Legacy Operation", kind: "Collection" },
    { name: "The Chop Shop Collection", intro: "2015-05-26", category: "Legacy Operation", kind: "Collection" },
    { name: "The Cobblestone Collection", intro: "2014-07-01", category: "Legacy Operation", kind: "Collection" },
    { name: "The Gods and Monsters Collection", intro: "2015-05-26", category: "Legacy Operation", kind: "Collection" },
    { name: "The Overpass Collection", intro: "2014-07-01", category: "Legacy Operation", kind: "Collection" },
    { name: "The Rising Sun Collection", intro: "2015-05-26", category: "Legacy Operation", kind: "Collection" },
    { name: "The Anubis Collection", intro: "2023-04-24", category: "Discontinued", kind: "Collection" },
    { name: "The Assault Collection", intro: "2013-08-14", category: "Discontinued", kind: "Collection" },
    { name: "The Aztec Collection", intro: "2013-08-14", category: "Discontinued", kind: "Collection" },
    { name: "The Baggage Collection", intro: "2014-07-01", category: "Discontinued", kind: "Collection" },
    { name: "The Bank Collection", intro: "2014-05-01", category: "Discontinued", kind: "Collection" },
    { name: "The Dust Collection", intro: "2013-08-14", category: "Discontinued", kind: "Collection" },
    { name: "The Inferno Collection", intro: "2013-08-14", category: "Discontinued", kind: "Collection" },
    { name: "The Italy Collection", intro: "2013-11-27", category: "Discontinued", kind: "Collection" },
    { name: "The Lake Collection", intro: "2013-11-27", category: "Discontinued", kind: "Collection" },
    { name: "The Militia Collection", intro: "2013-08-14", category: "Discontinued", kind: "Collection" },
    { name: "The Mirage Collection", intro: "2013-11-27", category: "Discontinued", kind: "Collection" },
    { name: "The Nuke Collection", intro: "2013-08-14", category: "Discontinued", kind: "Collection" },
    { name: "The Office Collection", intro: "2013-08-14", category: "Discontinued", kind: "Collection" },
    { name: "The Train Collection", intro: "2013-11-27", category: "Discontinued", kind: "Collection" },
    { name: "The Vertigo Collection", intro: "2013-08-14", category: "Discontinued", kind: "Collection" },
    { name: "The 2018 Inferno Collection", intro: "2018-09-01", category: "Discontinued", kind: "Collection" },
    { name: "The 2018 Nuke Collection", intro: "2018-09-01", category: "Discontinued", kind: "Collection" },
    { name: "The Alpha Collection", intro: "2013-09-19", category: "Discontinued", kind: "Collection" },
    { name: "The Blacksite Collection", intro: "2018-12-06", category: "Discontinued", kind: "Collection" },
    { name: "The Dust 2 Collection", intro: "2013-11-27", category: "Discontinued", kind: "Collection" },
    { name: "The Safehouse Collection", intro: "2013-11-27", category: "Discontinued", kind: "Collection" }
  ];

  const GROUP_COLORS = {
    "Active Prime Drop": "#60a5fa",
    "Armory Exclusive": "#f472b6",
    "Operation Riptide": "#34d399",
    "Operation Broken Fang": "#f97316",
    "Operation Shattered Web": "#a78bfa",
    "Legacy Operation": "#22d3ee",
    Discontinued: "#f87171",
    "Weapon Case": "#fbbf24",
    "Operation Case": "#fb7185",
    "eSports Case": "#2dd4bf"
  };

  const COLLECTION_GROUP_ORDER = [
    "Active Prime Drop",
    "Armory Exclusive",
    "Operation Riptide",
    "Operation Broken Fang",
    "Operation Shattered Web",
    "Legacy Operation",
    "Discontinued"
  ];

  const COLLECTION_GROUP_COPY = {
    "Active Prime Drop": "Currently rotating prime-drop collections, similar to the live highlighted section on collection trackers.",
    "Armory Exclusive": "Armory reward collections and other modern shop-style drops kept together in one band.",
    "Operation Riptide": "Operation Riptide reward collections from the 2021 operation pass.",
    "Operation Broken Fang": "Broken Fang collections grouped as one operation-era block.",
    "Operation Shattered Web": "Shattered Web collections separated from older operations for cleaner browsing.",
    "Legacy Operation": "Older operation collections and map-special sets from the classic CS:GO era.",
    Discontinued: "Retired map collections and older legacy sets that were removed or superseded by later refreshes."
  };

  const CASE_GROUP_ORDER = ["Weapon Case", "Operation Case", "eSports Case"];

  const CASE_GROUP_COPY = {
    "Weapon Case": "Standard weapon cases, from the early CS:GO Weapon Cases through the latest community releases.",
    "Operation Case": "Cases tied directly to operations and event-style drops.",
    "eSports Case": "The original eSports tournament-linked case line."
  };

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

  const CASE_METADATA = {
    "Revolution Case": {
      displayName: "Revolution Case",
      intro: "2023-02-09",
      category: "Weapon Case",
      href: "Revolution.html"
    },
    "Fracture Case": {
      displayName: "Fracture Case",
      intro: "2020-08-06",
      category: "Weapon Case",
      href: "fracture.html"
    },
    "Fever Case": {
      displayName: "Fever Case",
      intro: "2025-03-31",
      category: "Weapon Case"
    },
    "Gallery Case": {
      displayName: "Gallery Case",
      intro: "2024-10-02",
      category: "Weapon Case"
    },
    "Kilowatt Case": {
      displayName: "Kilowatt Case",
      intro: "2024-02-06",
      category: "Weapon Case"
    },
    "Recoil Case": {
      displayName: "Recoil Case",
      intro: "2022-07-01",
      category: "Weapon Case"
    },
    "Dreams & Nightmares Case": {
      displayName: "Dreams & Nightmares Case",
      intro: "2022-01-20",
      category: "Weapon Case"
    },
    "Operation Riptide Case": {
      displayName: "Operation Riptide Case",
      intro: "2021-09-22",
      category: "Operation Case"
    },
    "Operation Broken Fang Case": {
      displayName: "Operation Broken Fang Case",
      intro: "2020-12-03",
      category: "Operation Case"
    },
    "Snakebite Case": {
      displayName: "Snakebite Case",
      intro: "2021-05-03",
      category: "Weapon Case"
    },
    "Clutch Case": {
      displayName: "Clutch Case",
      intro: "2018-02-14",
      category: "Weapon Case"
    },
    "Prisma 2 Case": {
      displayName: "Prisma 2 Case",
      intro: "2020-03-31",
      category: "Weapon Case"
    },
    "Prisma Case": {
      displayName: "Prisma Case",
      intro: "2019-03-13",
      category: "Weapon Case"
    },
    "Spectrum 2 Case": {
      displayName: "Spectrum 2 Case",
      intro: "2017-09-14",
      category: "Weapon Case"
    },
    "Spectrum Case": {
      displayName: "Spectrum Case",
      intro: "2017-03-15",
      category: "Weapon Case"
    },
    "Glove Case": {
      displayName: "Glove Case",
      intro: "2016-11-28",
      category: "Weapon Case"
    },
    "CS20 Case": {
      displayName: "CS20 Case",
      intro: "2019-10-18",
      category: "Weapon Case"
    },
    "Horizon Case": {
      displayName: "Horizon Case",
      intro: "2018-08-02",
      category: "Weapon Case"
    },
    "Danger Zone Case": {
      displayName: "Danger Zone Case",
      intro: "2018-12-06",
      category: "Weapon Case"
    },
    "Shattered Web Case": {
      displayName: "Shattered Web Case",
      intro: "2019-11-18",
      category: "Operation Case"
    },
    "Falchion Case": {
      displayName: "Falchion Case",
      intro: "2015-05-26",
      category: "Weapon Case"
    },
    "Shadow Case": {
      displayName: "Shadow Case",
      intro: "2015-09-17",
      category: "Weapon Case"
    },
    "Operation Wildfire Case": {
      displayName: "Operation Wildfire Case",
      intro: "2016-02-17",
      category: "Operation Case"
    },
    "Operation Vanguard": {
      displayName: "Operation Vanguard Weapon Case",
      intro: "2014-11-11",
      category: "Operation Case"
    },
    "Operation Breakout": {
      displayName: "Operation Breakout Weapon Case",
      intro: "2014-07-01",
      category: "Operation Case"
    },
    "Operation Hydra": {
      displayName: "Operation Hydra Case",
      intro: "2017-05-23",
      category: "Operation Case"
    },
    "Chroma 3 Case": {
      displayName: "Chroma 3 Case",
      intro: "2016-04-27",
      category: "Weapon Case"
    },
    "Chroma 2 Case": {
      displayName: "Chroma 2 Case",
      intro: "2015-04-15",
      category: "Weapon Case"
    },
    "Chroma Case": {
      displayName: "Chroma Case",
      intro: "2015-01-08",
      category: "Weapon Case"
    },
    "Gamma 2 Case": {
      displayName: "Gamma 2 Case",
      intro: "2016-08-18",
      category: "Weapon Case"
    },
    "Gamma Case": {
      displayName: "Gamma Case",
      intro: "2016-06-15",
      category: "Weapon Case"
    },
    "Revolver Case": {
      displayName: "Revolver Case",
      intro: "2015-12-08",
      category: "Weapon Case"
    },
    "Operation Phoenix": {
      displayName: "Operation Phoenix Weapon Case",
      intro: "2014-02-20",
      category: "Operation Case"
    },
    "Winter Offensive Weapon Case": {
      displayName: "Winter Offensive Weapon Case",
      intro: "2013-12-18",
      category: "Weapon Case"
    },
    "Huntsman Case": {
      displayName: "Huntsman Weapon Case",
      intro: "2014-05-01",
      category: "Weapon Case"
    },
    "Operation Bravo": {
      displayName: "Operation Bravo Case",
      intro: "2013-09-19",
      category: "Operation Case"
    },
    "CS:GO Weapon Case": {
      displayName: "CS:GO Weapon Case",
      intro: "2013-08-14",
      category: "Weapon Case"
    },
    "CS:GO Weapon Case 2": {
      displayName: "CS:GO Weapon Case 2",
      intro: "2013-11-08",
      category: "Weapon Case"
    },
    "CS:GO Weapon Case 3": {
      displayName: "CS:GO Weapon Case 3",
      intro: "2014-02-12",
      category: "Weapon Case"
    },
    "eSports 2013": {
      displayName: "eSports 2013 Case",
      intro: "2013-08-14",
      category: "eSports Case"
    },
    "eSports 2013 Winter": {
      displayName: "eSports 2013 Winter Case",
      intro: "2013-12-18",
      category: "eSports Case"
    },
    "eSports 2014 Summer": {
      displayName: "eSports 2014 Summer Case",
      intro: "2014-07-10",
      category: "eSports Case"
    }
  };

  const CASES = navCases.map((entry) => {
    const metadata = CASE_METADATA[entry.name] || {};

    return {
      name: metadata.displayName || entry.name,
      intro: metadata.intro || "",
      category: metadata.category || "Weapon Case",
      kind: "Case",
      image: entry.img,
      href: metadata.href || entry.href || ""
    };
  });

  const CATALOG = [...COLLECTIONS, ...CASES];

  function formatCatalogDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function catalogMonogram(name) {
    const pieces = name
      .replace(/^The\s+/i, "")
      .replace(/\s+Collection$/i, "")
      .replace(/\s+Item$/i, "")
      .replace(/\s+Case$/i, "")
      .split(/[\s.&-]+/)
      .filter(Boolean);

    return pieces
      .slice(0, 2)
      .map((piece) => (/^\d/.test(piece) ? piece.slice(0, 2) : piece[0].toUpperCase()))
      .join("");
  }

  function buildCatalogPlaceholder(entry) {
    const accent = GROUP_COLORS[entry.category] || "#60a5fa";
    const monogram = catalogMonogram(entry.name) || "CS";
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

  function resolveCatalogImage(entry) {
    if (entry.image) {
      return entry.image;
    }

    return COLLECTION_IMAGE_MAP[entry.name] || buildCatalogPlaceholder(entry);
  }

  function getEntryTimestamp(entry) {
    if (!entry.intro) {
      return Number.NEGATIVE_INFINITY;
    }

    const timestamp = new Date(entry.intro).getTime();
    return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
  }

  function sortCatalog(entries, sortValue) {
    const sorted = [...entries];

    if (sortValue === "name-asc") sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sortValue === "name-desc") sorted.sort((a, b) => b.name.localeCompare(a.name));
    if (sortValue === "intro-old") sorted.sort((a, b) => getEntryTimestamp(a) - getEntryTimestamp(b));
    if (sortValue === "intro-new") sorted.sort((a, b) => getEntryTimestamp(b) - getEntryTimestamp(a));

    return sorted;
  }

  function buildCategoryGroups(entries, sortValue, order) {
    return order
      .map((category) => ({
        category,
        entries: sortCatalog(entries.filter((entry) => entry.category === category), sortValue)
      }))
      .filter((group) => group.entries.length > 0);
  }

  function CollectionsPage() {
    const [search, setSearch] = useState("");
    const [sortValue, setSortValue] = useState("intro-new");

    const query = search.trim().toLowerCase();
    const renderKeyPrefix = `${sortValue}-${query || "all"}`;
    const filtered = CATALOG.filter((entry) => (
      `${entry.name} ${entry.category} ${entry.kind}`.toLowerCase().includes(query)
    ));
    const displayedCollections = sortCatalog(
      filtered.filter((entry) => entry.kind === "Collection"),
      sortValue
    );
    const displayedCases = sortCatalog(
      filtered.filter((entry) => entry.kind === "Case"),
      sortValue
    );
    const displayedCollectionGroups = buildCategoryGroups(displayedCollections, sortValue, COLLECTION_GROUP_ORDER);
    const displayedCaseGroups = buildCategoryGroups(displayedCases, sortValue, CASE_GROUP_ORDER);
    const displayedTotal = displayedCollections.length + displayedCases.length;

    function renderCards(entries) {
      return entries.map((entry, index) => {
        const accent = GROUP_COLORS[entry.category] || "#60a5fa";
        const cardKey = `${renderKeyPrefix}-${entry.kind}-${entry.name}-${entry.intro}`;
        const animationStyle = { animationDelay: `${Math.min(index, 14) * 0.035}s` };
        const cardContent = (
          <>
            <img src={resolveCatalogImage(entry)} alt={entry.name} />

            <div className="card-meta">
              <span>{entry.kind}</span>
              <span className="card-meta-divider">/</span>
              <span className="card-category" style={{ color: accent }}>{entry.category}</span>
              {entry.intro ? (
                <>
                  <span className="card-meta-divider">/</span>
                  <span>{entry.intro.slice(0, 4)}</span>
                </>
              ) : null}
            </div>

            <h3>{entry.name}</h3>
            <span className="card-date">
              {entry.kind === "Case" ? "Released" : "Introduced"}: {formatCatalogDate(entry.intro)}
            </span>
          </>
        );

        if (entry.href) {
          return (
            <a className="card link-card catalog-card-enter" href={entry.href} key={cardKey} style={animationStyle}>
              {cardContent}
            </a>
          );
        }

        return (
          <div className="card catalog-card-enter" key={cardKey} style={animationStyle}>
            {cardContent}
          </div>
        );
      });
    }

    return (
      <>
        <header className="catalog-hero">
          <h1>CS2 Collections</h1>
          <p>
            Browse all Counter-Strike collections first, then keep scrolling for the full case archive.
            Filters stay up top, but the layout is cleaner and easier to scan.
          </p>

          <div className="search-bar">
            <label className="search-input-wrap" htmlFor="searchInput">
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="text"
                id="searchInput"
                placeholder="Search collections, cases, or categories..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label className="search-select-wrap" htmlFor="sortSelect">
              <span><i className="fa-solid fa-filter" /> Sort</span>
              <select
                id="sortSelect"
                value={sortValue}
                onChange={(event) => setSortValue(event.target.value)}
              >
                <option value="intro-new">Newest First</option>
                <option value="intro-old">Oldest First</option>
                <option value="name-asc">Name (A - Z)</option>
                <option value="name-desc">Name (Z - A)</option>
              </select>
            </label>
          </div>

          <div className="results-meta">
            <span>{displayedCollections.length} collections</span>
            <span>{displayedCases.length} cases</span>
            <span>{displayedTotal} visible of {CATALOG.length}</span>
          </div>
        </header>

        <section className="catalog-section" id="collectionsSection">
          <div className="section-heading">
            <h2>Collections</h2>
            <span>{displayedCollections.length} entries</span>
          </div>
          <p className="section-copy">
            Valve collection sets, including active drops, Armory releases, older operation sets, and
            retired map collections.
          </p>
          <div className="catalog-group-stack">
            {displayedCollectionGroups.map((group) => (
              <div className="catalog-group" key={`collection-${group.category}`}>
                <div className="catalog-group-header">
                  <div>
                    <h3>{group.category}</h3>
                    <p>{COLLECTION_GROUP_COPY[group.category]}</p>
                  </div>
                  <span>{group.entries.length} entries</span>
                </div>
                <div className="collections-grid">
                  {renderCards(group.entries)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="catalog-section" id="casesSection">
          <div className="section-heading">
            <h2>Cases</h2>
            <span>{displayedCases.length} entries</span>
          </div>
          <p className="section-copy">
            Full weapon case list below the collections section, separated into standard weapon cases,
            operation cases, and eSports drops. Updated higher-resolution case artwork is used where available.
          </p>
          <div className="catalog-group-stack">
            {displayedCaseGroups.map((group) => (
              <div className="catalog-group" key={`case-${group.category}`}>
                <div className="catalog-group-header">
                  <div>
                    <h3>{group.category}</h3>
                    <p>{CASE_GROUP_COPY[group.category]}</p>
                  </div>
                  <span>{group.entries.length} entries</span>
                </div>
                <div className="collections-grid">
                  {renderCards(group.entries)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="no-results" id="noResults" style={{ display: displayedTotal ? "none" : "block" }}>
          No collections or cases found.
        </p>
      </>
    );
  }

  mountPage(<CollectionsPage />);
})();
