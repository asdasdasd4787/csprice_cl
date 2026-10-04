(() => {
  (() => {
    const { useState } = React;
    const { Layout, SortChipPicker, ShowcaseCard, CategoryCountBadge, mountPage, useI18n } = window.CS2React;
    const { CASE_CATALOG } = window.CS2ReactData || {};
    const CASES = Array.isArray(CASE_CATALOG) ? CASE_CATALOG : [];
    const CASE_MEDIA_ACCENT = "#34d399";
    const DISCONTINUED_MEDIA_ACCENT = "#f87171";
    const GROUP_COLORS = {
      "Active Drop": "#60a5fa",
      "Operation Case": "#a78bfa",
      "Special Case": "#f472b6",
      Terminal: "#96B8E5",
      Discontinued: "#f87171"
    };
    const CASE_GROUP_ORDER = [
      "Terminal",
      "Active Drop",
      "Operation Case",
      "Special Case",
      "Discontinued"
    ];
    function caseMonogram(name) {
      const pieces = name.replace(/\s+Case$/i, "").replace(/^Operation\s+/i, "").replace(/^CS:GO\s+/i, "").replace(/^eSports\s+/i, "ES ").split(/[\s.&-]+/).filter(Boolean);
      return pieces.slice(0, 2).map((piece) => /^\d/.test(piece) ? piece.slice(0, 2) : piece[0].toUpperCase()).join("");
    }
    function buildCasePlaceholder(entry) {
      const accent = GROUP_COLORS[entry.category] || "#60a5fa";
      const monogram = caseMonogram(entry.name) || "CS";
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
    function resolveCaseImage(entry) {
      return entry.image || buildCasePlaceholder(entry);
    }
    function formatReleaseDate(isoDate) {
      const date = /* @__PURE__ */ new Date(`${isoDate}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    }
    function resolveCaseHref(entry) {
      const name = entry.name;
      const params = new URLSearchParams({
        lookup_name: name,
        display_name: name,
        market_hash_name: name,
        image: entry.image || "",
        market_url: `https://steamcommunity.com/market/listings/730/${encodeURIComponent(name)}`,
        type: "Case",
        category: entry.category || "",
        type_filter: entry.category || ""
      });
      return `item_page.php?${params.toString()}`;
    }
    function sortWithinGroup(entries, sortValue) {
      const sorted = [...entries];
      if (sortValue === "name-asc") sorted.sort((a, b) => a.name.localeCompare(b.name));
      if (sortValue === "name-desc") sorted.sort((a, b) => b.name.localeCompare(a.name));
      if (sortValue === "intro-old") sorted.sort((a, b) => new Date(a.intro) - new Date(b.intro));
      if (sortValue === "intro-new") sorted.sort((a, b) => new Date(b.intro) - new Date(a.intro));
      return sorted;
    }
    function sortCases(entries, sortValue) {
      if (sortValue === "intro-new" || sortValue === "intro-old") {
        return sortWithinGroup(entries, sortValue);
      }
      const known = new Set(CASE_GROUP_ORDER);
      const byGroup = CASE_GROUP_ORDER.map((category) => sortWithinGroup(entries.filter((entry) => entry.category === category), sortValue));
      const unknown = sortWithinGroup(
        entries.filter((entry) => !known.has(entry.category)),
        sortValue
      );
      const discontinuedIndex = CASE_GROUP_ORDER.indexOf("Discontinued");
      const beforeDiscontinued = byGroup.slice(0, discontinuedIndex).flat();
      const discontinued = byGroup[discontinuedIndex] || [];
      return [...beforeDiscontinued, ...unknown, ...discontinued];
    }
    function CasesPage() {
      const { t } = useI18n();
      const [search, setSearch] = useState("");
      const [sortValue, setSortValue] = useState("intro-new");
      const query = search.trim().toLowerCase();
      const filtered = CASES.filter((entry) => `${entry.name} ${entry.category}`.toLowerCase().includes(query));
      const displayed = sortCases(filtered, sortValue);
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: "collections-shell" }, /* @__PURE__ */ React.createElement("header", { className: "collections-head collections-head-animated collections-head--toolbar" }, /* @__PURE__ */ React.createElement("h1", { className: "collections-head-sr-title" }, "CS2 Cases")), /* @__PURE__ */ React.createElement("div", { className: "collections-controls" }, /* @__PURE__ */ React.createElement("div", { className: "collections-search-wrap" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" }), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          id: "searchInput",
          placeholder: "Search by case, terminal, or category...",
          value: search,
          onChange: (event) => setSearch(event.target.value)
        }
      )), /* @__PURE__ */ React.createElement("span", { className: "collections-results-count" }, t("cat_resultsCount", { count: displayed.length })), /* @__PURE__ */ React.createElement(
        SortChipPicker,
        {
          value: sortValue,
          onChange: setSortValue,
          ariaLabel: "Sort cases and terminals",
          options: [
            { value: "intro-new", label: "Newest First" },
            { value: "intro-old", label: "Oldest First" },
            { value: "name-asc", label: "Name (A - Z)" },
            { value: "name-desc", label: "Name (Z - A)" }
          ]
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "collections-grid collections-grid-animated", id: "casesGrid", key: `grid-${query || "all"}` }, displayed.map((entry, index) => {
        const accent = GROUP_COLORS[entry.category] || "#60a5fa";
        const mediaAccent = entry.category === "Discontinued" ? DISCONTINUED_MEDIA_ACCENT : CASE_MEDIA_ACCENT;
        const href = resolveCaseHref(entry);
        return /* @__PURE__ */ React.createElement(
          ShowcaseCard,
          {
            key: `${entry.name}-${entry.intro}`,
            href,
            image: resolveCaseImage(entry),
            imageAlt: entry.name,
            accent,
            mediaAccent,
            mediaClassName: entry.category === "Terminal" ? "card-media-terminal" : "",
            labelLeft: entry.category === "Terminal" ? "Active Drop" : entry.category,
            title: entry.name,
            subtitle: formatReleaseDate(entry.intro),
            showAccentFoot: false,
            animated: true,
            staggerIndex: index,
            footer: /* @__PURE__ */ React.createElement("span", { className: "card-intro" }, /* @__PURE__ */ React.createElement("span", { className: "card-intro-dot" }), "View item")
          }
        );
      })), /* @__PURE__ */ React.createElement("p", { className: "no-results", id: "noResults", style: { display: displayed.length ? "none" : "block" } }, "No cases or terminals found.")));
    }
    mountPage(/* @__PURE__ */ React.createElement(CasesPage, null));
  })();
})();
