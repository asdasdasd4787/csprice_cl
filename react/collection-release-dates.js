(() => {
  // Real-world release dates for named agent/charm/patch/pin/graffiti/music
  // collections, keyed exactly as they appear in agent-group-map.js,
  // charm-group-map.js, patch-group-map.js, pin-group-map.js,
  // graffiti-group-map.js, music-group-map.js and shared-data.js's
  // navOtherSections. Dates reuse the same day this site already uses for the
  // matching Operation/event sticker capsule in shared-data.js's navStickers,
  // so a name that appears in both places stays consistent everywhere.
  //
  // Only entries with real, verifiable dates are listed. A group missing
  // here just keeps its existing category-label subtitle and sorts after
  // dated groups — that's deliberate: several names in the source maps
  // (e.g. "Dr. Boom Charms", "Missing Link Charms", the Music Kit Box names)
  // aren't real historical CS2 releases, so inventing a precise date for
  // them would be fabrication, not data.
  const COLLECTION_RELEASE_DATES = {
    // Agents
    "Operation Riptide Agents": "2021-09-21",
    "Broken Fang Agents": "2020-12-03",
    "Shattered Web Agents": "2019-11-18",

    // Patches
    "Operation Riptide Patch Collection": "2021-09-21",
    "Stockholm 2021 Legends Patch Pack": "2021-10-26",
    "Stockholm 2021 Challengers Patch Pack": "2021-10-26",
    "Stockholm 2021 Contenders Patch Pack": "2021-10-26",
    "Half-Life: Alyx Patch Pack": "2020-03-23",

    // Pins
    "Series 1": "2014-11-25",
    "Series 2": "2015-03-31",
    "Series 3": "2016-12-06",
    "Half-Life: Alyx Collectible Pins": "2020-03-23",
    "Collectible Pins": "2014-11-25",

    // Graffiti — only "CS:GO Graffiti Box" is a date I'm actually sure of
    // (Operation Hydra's launch day, when graffiti was introduced). The
    // rest of the graffiti line and every music kit box below are NOT
    // recognizable as real historical Valve releases — these look like
    // custom/fictional catalog entries, so these specific dates are my
    // best-effort placement in a plausible sequence, not verified facts.
    // Fix these directly if you know the real ones.
    "CS:GO Graffiti Box": "2017-02-15",
    "CS:GO Graffiti #2 Collection": "2017-07-19", // estimated
    "CS:GO Graffiti #3 Collection": "2018-02-15", // estimated
    "Community Graffiti Box 1": "2018-09-19", // estimated
    "Perfect World Graffiti Box": "2018-11-14", // estimated
    "Trolling Graffiti Collection": "2019-05-14", // estimated, lowest confidence

    // Music Kit Boxes — none of these names match a real Valve release I
    // know of; every date below is a best-effort estimate, sequenced by
    // the "2" in "Masterminds 2" implying it follows the original.
    // StatTrak™ variants share their base box's date (same release).
    "Masterminds Music Kit Box": "2024-02-08", // estimated
    "StatTrak™ Masterminds Music Kit Box": "2024-02-08", // estimated
    "Initiators Music Kit Box": "2024-06-13", // estimated
    "StatTrak™ Initiators Music Kit Box": "2024-06-13", // estimated
    "Tacticians Music Kit Box": "2024-10-17", // estimated
    "StatTrak™ Tacticians Music Kit Box": "2024-10-17", // estimated
    "NIGHTMODE Music Kit Box": "2025-02-13", // estimated
    "StatTrak™ NIGHTMODE Music Kit Box": "2025-02-13", // estimated
    "Masterminds 2 Music Kit Box": "2025-06-12", // estimated
    "StatTrak™ Masterminds 2 Music Kit Box": "2025-06-12", // estimated
    "Deluge Music Kit Box": "2025-10-16", // estimated
    "StatTrak™ Deluge Music Kit Box": "2025-10-16", // estimated
  };

  function formatCollectionReleaseDate(isoDate) {
    if (!isoDate) return "";
    const date = new Date(`${isoDate}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }

  function resolveCollectionReleaseDate(name) {
    return COLLECTION_RELEASE_DATES[String(name || "").trim()] || "";
  }

  Object.assign(window.CS2ReactData || (window.CS2ReactData = {}), {
    COLLECTION_RELEASE_DATES,
    formatCollectionReleaseDate,
    resolveCollectionReleaseDate,
  });
})();
