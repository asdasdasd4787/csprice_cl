(() => {
  const { useEffect, useMemo, useState } = React;
  const { Layout, SortChipPicker, ShowcaseCard, CategoryCountBadge, mountPage, useI18n } = window.CS2React;
  const data = window.CS2ReactData || {};

  // Database totals per section (built by scripts/build_catalog_counts.php).
  const CATALOG_COUNTS_URL = "assets/data/catalog-counts.json?v=20260919-counts-1";

  const SECTION_LINKS = {
    "Music Kits": "music.html",
    "Agents": "agents.html",
    "Charms": "charms.html",
    "Patches": "patches.html",
    "Pins": "pins.html",
    "Graffiti": "graffiti.html",
  };

  // Match weapon hub cards (SMGs, rifles, etc.)
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
        subtitle: `${section.items?.length || 0} collections`,
      }));
    }, []);

    const [otherTotal, setOtherTotal] = useState(0);
    useEffect(() => {
      let alive = true;
      fetch(CATALOG_COUNTS_URL)
        .then((response) => (response.ok ? response.json() : null))
        .then((counts) => {
          if (alive && counts) setOtherTotal(Number(counts?.sections?.other) || 0);
        })
        .catch(() => {});
      return () => { alive = false; };
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

    return (
      <Layout>
        <div className="collections-shell">
          <header className="collections-head collections-head--toolbar">
            {/* Title kept for screen readers / SEO only; the toolbar is the header. */}
            <h1 className="collections-head-sr-title">Other Items</h1>
          </header>
          <div className="collections-controls">
            <div className="collections-search-wrap">
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="text"
                placeholder="Search categories..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <span className="collections-results-count">{t("cat_resultsCount", { count: displayed.length })}</span>
            <SortChipPicker
              value={sortValue}
              onChange={setSortValue}
              ariaLabel="Sort other categories"
              options={[
                { value: "name-asc", label: "A → Z" },
                { value: "name-desc", label: "Z → A" },
              ]}
            />
          </div>

          <div className="collections-grid collections-grid-animated" key={`grid-${query || "all"}`}>
            {displayed.map((entry, index) => (
              <ShowcaseCard
                key={entry.name}
                href={entry.href}
                image={entry.img}
                imageAlt={entry.name}
                accent={entry.accent}
                labelLeft="Other"
                title={entry.name}
                subtitle={entry.subtitle}
                animated
                staggerIndex={index}
                showAccentFoot={false}
                footer={(
                  <span className="card-intro">
                    <span className="card-intro-dot" />
                    View collections
                  </span>
                )}
              />
            ))}
          </div>

          {!displayed.length ? <p className="no-results">No categories found.</p> : null}
        </div>
      </Layout>
    );
  }

  mountPage(<OtherLandingPage />);
})();
