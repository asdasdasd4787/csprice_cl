(() => {
  const CASE_CATALOG = [
    {
      name: "Fever Case",
      intro: "2025-03-31",
      category: "Active Drop",
      image: "assets/cases/fever-case.webp",
      update: "Spring 2025",
      description: "The newest Prime weapon case in CS2, packed with colourful community finishes and the usual knife and glove specials.",
    },
    {
      name: "Gallery Case",
      intro: "2024-10-02",
      category: "Active Drop",
      image: "assets/cases/gallery-case.webp",
      update: "The Armory",
      description: "Introduced with The Armory update, this case brings art-inspired skins from The Gallery Collection to the drop pool.",
    },
    {
      name: "Kilowatt Case",
      intro: "2024-02-06",
      category: "Active Drop",
      image: "assets/cases/kilowatt-case.webp",
      update: "February 2024",
      description: "A modern CS2 weapon case featuring electric-themed community designs and standard rare special items.",
    },
    {
      name: "Revolution Case",
      intro: "2023-02-10",
      category: "Discontinued",
      image: "assets/cases/revolution-case.webp",
      href: "Revolution.html",
      update: "February 2023",
      description: "A bold community case with graffiti-inspired finishes from The Revolution Collection, still a popular rare drop.",
    },
    {
      name: "Recoil Case",
      intro: "2022-07-01",
      category: "Discontinued",
      image: "assets/cases/recoil-case.webp",
      update: "Recoil Case Update",
      description: "Released mid-2022 with vibrant skins from The Recoil Collection, including several fan-favourite rifle finishes.",
    },
    {
      name: "Dreams & Nightmares Case",
      intro: "2022-01-21",
      category: "Discontinued",
      image: "assets/cases/dreams-and-nightmares-case.webp",
      update: "Dreams & Nightmares",
      description: "Built from a community contest, this case mixes surreal dream-themed skins with darker nightmare designs.",
    },
    {
      name: "Operation Riptide Case",
      intro: "2021-09-22",
      category: "Operation Case",
      image: "assets/cases/riptide-case.webp",
      update: "Operation Riptide",
      description: "The Operation Riptide weapon case with coastal-themed skins, purchasable with operation stars during the event.",
    },
    {
      name: "Snakebite Case",
      intro: "2021-05-03",
      category: "Discontinued",
      image: "assets/cases/snakebite.png",
      update: "End of Broken Fang",
      description: "Introduced on 3 May 2021 with Snakebite Collection skins and Shattered Web glove specials inside.",
    },
    {
      name: "Operation Broken Fang Case",
      intro: "2020-12-03",
      category: "Operation Case",
      image: "assets/cases/broken-fang-case.webp",
      update: "Operation Broken Fang",
      description: "The signature case of Operation Broken Fang, featuring Broken Fang gloves and community skins from the operation.",
    },
    {
      name: "Fracture Case",
      intro: "2020-08-07",
      category: "Discontinued",
      image: "assets/cases/fracture-case.webp",
      href: "fracture.html",
      update: "Fracture Case Update",
      description: "Launched after Shattered Web with fractured, high-contrast designs from The Fracture Collection.",
    },
    {
      name: "Clutch Case",
      intro: "2018-02-15",
      category: "Discontinued",
      image: "assets/cases/chluchk.png",
      update: "Clutch Case Update",
      description: "An early glove-enabled case with racing and industrial skins from The Clutch Collection.",
    },
    {
      name: "Prisma 2 Case",
      intro: "2020-03-31",
      category: "Discontinued",
      image: "assets/cases/prisma2.png",
      update: "Prisma 2",
      description: "A sequel to the Prisma Case with neon-accented community finishes and Chroma-style knife drops.",
    },
    {
      name: "Prisma Case",
      intro: "2019-03-13",
      category: "Discontinued",
      image: "assets/cases/prisma.png",
      update: "Prisma Case Update",
      description: "Known for its bright, anime-influenced skins and colourful Chroma knife specials.",
    },
    {
      name: "Spectrum 2 Case",
      intro: "2017-09-14",
      category: "Discontinued",
      image: "assets/cases/spectrum2.png",
      update: "Spectrum 2",
      description: "The follow-up to Spectrum with more Chroma knives and vivid finishes from The Spectrum 2 Collection.",
    },
    {
      name: "Spectrum Case",
      intro: "2017-03-15",
      category: "Discontinued",
      image: "assets/cases/spectrum.png",
      update: "Spectrum Case Update",
      description: "Famous for introducing Chroma knives to the drop pool alongside bold community weapon finishes.",
    },
    {
      name: "Glove Case",
      intro: "2016-11-28",
      category: "Special Case",
      image: "assets/cases/glove-case.webp",
      update: "Glove Case Update",
      description: "The first weapon case to drop gloves as rare specials, paired with skins from The Glove Collection.",
    },
    {
      name: "CS20 Case",
      intro: "2019-10-18",
      category: "Discontinued",
      image: "assets/cases/cs20.png",
      update: "CS20",
      description: "A anniversary case celebrating twenty years of Counter-Strike with nostalgic and commemorative skin designs.",
    },
    {
      name: "Horizon Case",
      intro: "2018-08-02",
      category: "Discontinued",
      image: "assets/cases/horizon.png",
      update: "Horizon Case Update",
      description: "Introduced Horizon knives alongside colourful, stylised skins from The Horizon Collection.",
    },
    {
      name: "Danger Zone Case",
      intro: "2018-12-06",
      category: "Discontinued",
      image: "assets/cases/dangerzone.png",
      update: "Danger Zone",
      description: "Released with the Danger Zone battle royale mode, featuring tactical skins from its namesake collection.",
    },
    {
      name: "Shattered Web Case",
      intro: "2019-11-18",
      category: "Operation Case",
      image: "assets/cases/shaterd web.png",
      update: "Operation Shattered Web",
      description: "The Operation Shattered Web case with covert agent-themed skins and the Specialist glove set.",
    },
    {
      name: "Falchion Case",
      intro: "2015-05-26",
      category: "Discontinued",
      image: "assets/cases/falcion.png",
      update: "Falchion Case Update",
      description: "Added the Falchion knife to case openings along with community skins from The Falchion Collection.",
    },
    {
      name: "Shadow Case",
      intro: "2015-09-17",
      category: "Discontinued",
      image: "assets/cases/shadow.png",
      update: "Shadow Case Update",
      description: "Introduced Shadow daggers with darker, stealth-themed finishes from The Shadow Collection.",
    },
    {
      name: "Operation Wildfire Case",
      intro: "2016-02-17",
      category: "Operation Case",
      image: "assets/cases/widlfire.png",
      update: "Operation Wildfire",
      description: "The Operation Wildfire weapon case with fire-themed community designs and operation-exclusive availability.",
    },
    {
      name: "Operation Vanguard Weapon Case",
      intro: "2014-11-11",
      category: "Operation Case",
      image: "assets/cases/vanguard.png",
      update: "Operation Vanguard",
      description: "An operation case from Vanguard with military-inspired skins, unlocked through operation missions and stars.",
    },
    {
      name: "Operation Breakout Weapon Case",
      intro: "2014-07-01",
      category: "Operation Case",
      image: "assets/cases/breaokout.png",
      update: "Operation Breakout",
      description: "The Breakout operation case that introduced the Butterfly knife to CS:GO case openings.",
    },
    {
      name: "Operation Hydra Case",
      intro: "2017-05-23",
      category: "Operation Case",
      image: "assets/cases/hydracase.png",
      update: "Operation Hydra",
      description: "Released during Operation Hydra with exotic community finishes and operation star redemption.",
    },
    {
      name: "Chroma 3 Case",
      intro: "2016-04-27",
      category: "Discontinued",
      image: "assets/cases/chroma3.png",
      update: "Chroma 3",
      description: "The third Chroma case, continuing the colourful knife tradition with finishes from The Chroma 3 Collection.",
    },
    {
      name: "Chroma 2 Case",
      intro: "2015-04-15",
      category: "Discontinued",
      image: "assets/cases/chroma2.png",
      update: "Chroma 2",
      description: "Expanded the Chroma knife lineup with more painted finishes and popular rifle skins.",
    },
    {
      name: "Chroma Case",
      intro: "2015-01-08",
      category: "Discontinued",
      image: "assets/cases/chroma.png",
      update: "Chroma Case Update",
      description: "The original Chroma case that brought colour-coated knives and striking community weapon skins to CS:GO.",
    },
    {
      name: "Gamma 2 Case",
      intro: "2016-08-18",
      category: "Discontinued",
      image: "assets/cases/gammacase.png",
      update: "Gamma 2",
      description: "A follow-up Gamma case with more Gamma knives and bright finishes from The Gamma 2 Collection.",
    },
    {
      name: "Gamma Case",
      intro: "2016-06-15",
      category: "Discontinued",
      image: "assets/cases/gamma1.png",
      update: "Gamma Case Update",
      description: "Introduced Gamma knives alongside high-saturation skins from The Gamma Collection.",
    },
    {
      name: "Revolver Case",
      intro: "2015-12-08",
      category: "Discontinued",
      image: "assets/cases/revolver.png",
      update: "Revolver Case Update",
      description: "Launched alongside the R8 Revolver with community skins from The Revolver Case Collection.",
    },
    {
      name: "Operation Phoenix Weapon Case",
      intro: "2014-02-20",
      category: "Operation Case",
      image: "assets/cases/phonex.png",
      update: "Operation Phoenix",
      description: "An early operation case with skins from The Phoenix Collection, earned through Phoenix operation progress.",
    },
    {
      name: "Huntsman Weapon Case",
      intro: "2014-05-01",
      category: "Discontinued",
      image: "assets/cases/huntsma.png",
      update: "Huntsman Case Update",
      description: "Added the Huntsman knife with rugged outdoor-themed skins from The Huntsman Collection.",
    },
    {
      name: "Operation Bravo Case",
      intro: "2013-09-19",
      category: "Operation Case",
      image: "assets/cases/bravo.png",
      update: "Operation Bravo",
      description: "One of the first operation cases, featuring premium finishes from The Bravo Collection.",
    },
    {
      name: "CS:GO Weapon Case",
      intro: "2013-08-14",
      category: "Discontinued",
      image: "assets/cases/weaponcase.png",
      update: "Arms Deal",
      description: "The original 2013 Arms Deal weapon case, now one of the rarest legacy drops in Counter-Strike.",
    },
    {
      name: "CS:GO Weapon Case 2",
      intro: "2013-11-06",
      category: "Discontinued",
      image: "assets/cases/weaponcase2.png",
      update: "Arms Deal 2",
      description: "The second legacy weapon case with early community skins, no longer in the active drop pool.",
    },
    {
      name: "CS:GO Weapon Case 3",
      intro: "2014-02-12",
      category: "Discontinued",
      image: "assets/cases/weaponcase3.png",
      update: "Arms Deal 3",
      description: "The third Arms Deal case with classic finishes, now only obtainable through trading or the market.",
    },
    {
      name: "Winter Offensive Weapon Case",
      intro: "2013-12-18",
      category: "Discontinued",
      image: "assets/cases/winter-offensive-case.webp",
      update: "Winter Offensive",
      description: "A holiday-season 2013 case with skins from The Winter Offensive Collection, long since discontinued.",
    },
    {
      name: "eSports 2013 Case",
      intro: "2013-08-14",
      category: "Discontinued",
      image: "assets/cases/2013esport.png",
      update: "eSports 2013",
      description: "An early eSports case whose key sales supported tournament prize pools, featuring sticker capsule themes.",
    },
    {
      name: "eSports 2013 Winter Case",
      intro: "2013-12-18",
      category: "Discontinued",
      image: "assets/cases/winter2013.png",
      update: "eSports 2013 Winter",
      description: "The winter eSports 2013 case with proceeds funding competitive events and legacy weapon finishes.",
    },
    {
      name: "eSports 2014 Summer Case",
      intro: "2014-07-10",
      category: "Discontinued",
      image: "assets/cases/summer214.png",
      update: "eSports 2014 Summer",
      description: "A summer 2014 eSports case supporting the competitive scene with tournament-era skin designs.",
    },
    {
      name: "Sealed Genesis Terminal",
      intro: "2025-06-20",
      category: "Terminal",
      image: "https://cdn.csroi.com/weapon_cases/crate_community_36_closed_png.png",
      update: "Genesis Terminal",
      description: "Armory sealed terminal that opens into Genesis Collection weapon skins — tracked alongside weapon cases.",
    },
    {
      name: "Sealed Dead Hand Terminal",
      intro: "2025-11-26",
      category: "Terminal",
      image: "https://cdn.csroi.com/weapon_cases/crate_community_37_closed_png.png",
      update: "Dead Hand Terminal",
      description: "Armory sealed terminal for Dead Hand Collection skins — included in the cases database with weapon cases.",
    },
  ];

  const CASE_CATEGORY_COLORS = {
    "Active Drop": "#60a5fa",
    "Operation Case": "#a78bfa",
    "Special Case": "#f472b6",
    Terminal: "#96B8E5",
    Discontinued: "#f87171",
  };

  function normalizeCaseName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/cs:go/g, "csgo")
      .replace(/cs-go/g, "csgo")
      .replace(/\s+/g, " ");
  }

  function lookupCaseCatalog(name) {
    const raw = String(name || "").trim();
    if (!raw) return null;

    const variants = new Set([raw]);
    if (!/\b(case|terminal)\b/i.test(raw)) {
      variants.add(`${raw} Case`);
      variants.add(`${raw} Weapon Case`);
    }
    if (/^operation\b/i.test(raw) && !/\bweapon case$/i.test(raw)) {
      variants.add(`${raw} Weapon Case`);
    }

    for (const variant of variants) {
      const key = normalizeCaseName(variant);
      const exact = CASE_CATALOG.find((entry) => normalizeCaseName(entry.name) === key);
      if (exact) return exact;
    }

    const key = normalizeCaseName(raw);
    return CASE_CATALOG.find((entry) => {
      const entryKey = normalizeCaseName(entry.name);
      return key.includes(entryKey) || entryKey.includes(key);
    }) || null;
  }

  function resolveCaseCatalogEntry(...names) {
    const seen = new Set();
    for (const name of names) {
      const clean = String(name || "").trim();
      if (!clean) continue;
      const dedupeKey = clean.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const hit = lookupCaseCatalog(clean);
      if (hit) return hit;
    }
    return null;
  }

  function formatCaseBlurb(text, maxWords = 14) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "";
    return words.slice(0, maxWords).join(" ");
  }

  function formatCaseIntroDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  Object.assign(window.CS2ReactData || (window.CS2ReactData = {}), {
    CASE_CATALOG,
    CASE_CATEGORY_COLORS,
    lookupCaseCatalog,
    resolveCaseCatalogEntry,
    formatCaseIntroDate,
    formatCaseBlurb,
  });
})();
