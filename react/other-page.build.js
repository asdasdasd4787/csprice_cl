(() => {
  (() => {
    const { useEffect, useMemo, useState } = React;
    const { Layout, SortChipPicker, ShowcaseCard, CategoryCountBadge, mountPage, useI18n } = window.CS2React;
    const data = window.CS2ReactData || {};
    const CATALOG_COUNTS_URL = "assets/data/catalog-counts.json?v=20260919-counts-1";
    const SECTION_LINKS = {
      "Music Kits": "music.html",
      "Agents": "agents.html",
      "Charms": "charms.html",
      "Patches": "patches.html",
      "Pins": "pins.html",
      "Graffiti": "graffiti.html"
    };
    const CATEGORY_ACCENT = "#34d399";
    function OtherLandingPage() {
      const { t } = useI18n();
      const [search, setSearch] = useState("");
      const [sortValue, setSortValue] = useState("name-asc");
      const groups = useMemo(() => {
        return (Array.isArray(data.navOtherSections) ? data.navOtherSections : []).map((section) => ({
          name: section.title,
          img: section.cardImg || section.items?.[0]?.img || "",
          href: SECTION_LINKS[section.title] || "roi.html",
          accent: CATEGORY_ACCENT,
          subtitle: `${section.items?.length || 0} collections`
        }));
      }, []);
      const [otherTotal, setOtherTotal] = useState(0);
      useEffect(() => {
        let alive = true;
        fetch(CATALOG_COUNTS_URL).then((response) => response.ok ? response.json() : null).then((counts) => {
          if (alive && counts) setOtherTotal(Number(counts?.sections?.other) || 0);
        }).catch(() => {
        });
        return () => {
          alive = false;
        };
      }, []);
      const query = search.trim().toLowerCase();
      const filtered = groups.filter((entry) => entry.name.toLowerCase().includes(query));
      const displayed = useMemo(() => {
        const sorted = [...filtered];
        if (sortValue === "name-desc") {
          sorted.sort((left, right) => right.name.localeCompare(left.name));
        } else {
          sorted.sort((left, right) => left.name.localeCompare(right.name));
        }
        return sorted;
      }, [filtered, sortValue]);
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement("div", { className: "collections-shell" }, /* @__PURE__ */ React.createElement("header", { className: "collections-head collections-head--toolbar" }, /* @__PURE__ */ React.createElement("h1", { className: "collections-head-sr-title" }, "Other Items")), /* @__PURE__ */ React.createElement("div", { className: "collections-controls" }, /* @__PURE__ */ React.createElement("div", { className: "collections-search-wrap" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" }), /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "text",
          placeholder: "Search categories...",
          value: search,
          onChange: (event) => setSearch(event.target.value)
        }
      )), /* @__PURE__ */ React.createElement("span", { className: "collections-results-count" }, t("cat_resultsCount", { count: displayed.length })), /* @__PURE__ */ React.createElement(
        SortChipPicker,
        {
          value: sortValue,
          onChange: setSortValue,
          ariaLabel: "Sort other categories",
          options: [
            { value: "name-asc", label: "A → Z" },
            { value: "name-desc", label: "Z → A" }
          ]
        }
      )), /* @__PURE__ */ React.createElement("div", { className: "collections-grid collections-grid-animated", key: `grid-${query || "all"}` }, displayed.map((entry, index) => /* @__PURE__ */ React.createElement(
        ShowcaseCard,
        {
          key: entry.name,
          href: entry.href,
          image: entry.img,
          imageAlt: entry.name,
          accent: entry.accent,
          labelLeft: "Other",
          title: entry.name,
          subtitle: entry.subtitle,
          animated: true,
          staggerIndex: index,
          showAccentFoot: false,
          footer: /* @__PURE__ */ React.createElement("span", { className: "card-intro" }, /* @__PURE__ */ React.createElement("span", { className: "card-intro-dot" }), "View collections")
        }
      ))), !displayed.length ? /* @__PURE__ */ React.createElement("p", { className: "no-results" }, "No categories found.") : null));
    }
    mountPage(/* @__PURE__ */ React.createElement(OtherLandingPage, null));
  })();
})();
