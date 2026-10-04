window.CS2ReactData = Object.assign({}, window.CS2ReactData || {}, (() => {
  const navCollections = [
    { img: "assets/collections/source2/ascent-source2.svg", alt: "Ascent", name: "Ascent" },
    { img: "assets/collections/source2/boreal-source2.svg", alt: "Boreal", name: "Boreal" },
    { img: "assets/collections/source2/radiant-source2.svg", alt: "Radiant", name: "Radiant" },
    { img: "assets/collections/fracture.webp", alt: "Fracture Collection", name: "Fracture Collection", href: "fracture.html" },
    { img: "assets/collections/source2/train-2025-source2.svg", alt: "Train 2025", name: "Train 2025" },
    { img: "assets/collections/dust-2.webp", alt: "Dust II", name: "Dust II" },
    { img: "assets/collections/vertigo.webp", alt: "Vertigo", name: "Vertigo" },
    { img: "assets/collections/mirage.webp", alt: "Mirage", name: "Mirage" },
    { img: "assets/collections/overpass.webp", alt: "Overpass", name: "Overpass" },
    { img: "assets/collections/inferno-2018.webp", alt: "Inferno 2018", name: "Inferno 2018" },
    { img: "assets/collections/nuke-2018.webp", alt: "Nuke 2018", name: "Nuke 2018" },
    { img: "assets/collections/cobblestone.webp", alt: "Cobblestone", name: "Cobblestone" },
    { img: "assets/collections/gods-and-monsters.webp", alt: "Gods & Monsters", name: "Gods & Monsters" },
    { img: "assets/collections/canals.webp", alt: "Canals", name: "Canals" },
    { img: "assets/collections/control.webp", alt: "Control", name: "Control" },
    { img: "assets/collections/bank.webp", alt: "Bank", name: "Bank" },
    { img: "assets/collections/norse.webp", alt: "Norse", name: "Norse" },
    { img: "assets/collections/rising-sun.webp", alt: "Rising Sun", name: "Rising Sun" },
    { img: "assets/collections/chop-shop.webp", alt: "Chop Shop", name: "Chop Shop" }
  ];

  const navCases = [
    { img: "assets/cases/fever-case.webp", name: "Fever Case" },
    { img: "assets/cases/gallery-case.webp", name: "Gallery Case" },
    { img: "assets/cases/kilowatt-case.webp", name: "Kilowatt Case" },
    { img: "assets/cases/revolution-case.webp", name: "Revolution Case", href: "Revolution.html" },
    { img: "assets/cases/recoil-case.webp", name: "Recoil Case" },
    { img: "assets/cases/dreams-and-nightmares-case.webp", name: "Dreams & Nightmares Case" },
    { img: "assets/cases/riptide-case.webp", name: "Operation Riptide Case" },
    { img: "assets/cases/snakebite.png", name: "Snakebite Case" },
    { img: "assets/cases/broken-fang-case.webp", name: "Operation Broken Fang Case" },
    { img: "assets/cases/fracture-case.webp", name: "Fracture Case", href: "fracture.html" },
    { img: "assets/cases/chluchk.png", name: "Clutch Case" },
    { img: "assets/cases/prisma2.png", name: "Prisma 2 Case" },
    { img: "assets/cases/prisma.png", name: "Prisma Case" },
    { img: "assets/cases/spectrum2.png", name: "Spectrum 2 Case" },
    { img: "assets/cases/spectrum.png", name: "Spectrum Case" },
    { img: "assets/cases/glove-case.webp", name: "Glove Case" },
    { img: "assets/cases/cs20.png", name: "CS20 Case" },
    { img: "assets/cases/horizon.png", name: "Horizon Case" },
    { img: "assets/cases/dangerzone.png", name: "Danger Zone Case" },
    { img: "assets/cases/shaterd web.png", name: "Shattered Web Case" },
    { img: "assets/cases/falcion.png", name: "Falchion Case" },
    { img: "assets/cases/shadow.png", name: "Shadow Case" },
    { img: "assets/cases/widlfire.png", name: "Operation Wildfire Case" },
    { img: "assets/cases/vanguard.png", name: "Operation Vanguard" },
    { img: "assets/cases/breaokout.png", name: "Operation Breakout" },
    { img: "assets/cases/hydracase.png", name: "Operation Hydra" },
    { img: "assets/cases/chroma3.png", name: "Chroma 3 Case" },
    { img: "assets/cases/chroma2.png", name: "Chroma 2 Case" },
    { img: "assets/cases/chroma.png", name: "Chroma Case" },
    { img: "assets/cases/gammacase.png", name: "Gamma 2 Case" },
    { img: "assets/cases/gamma1.png", name: "Gamma Case" },
    { img: "assets/cases/revolver.png", name: "Revolver Case" },
    { img: "assets/cases/phonex.png", name: "Operation Phoenix" },
    { img: "assets/cases/huntsma.png", name: "Huntsman Case" },
    { img: "assets/cases/bravo.png", name: "Operation Bravo" },
    { img: "assets/cases/weaponcase.png", name: "CS:GO Weapon Case" },
    { img: "assets/cases/weaponcase2.png", name: "CS:GO Weapon Case 2" },
    { img: "assets/cases/weaponcase3.png", name: "CS:GO Weapon Case 3" },
    { img: "assets/cases/winter-offensive-case.webp", name: "Winter Offensive Weapon Case" },
    { img: "assets/cases/2013esport.png", name: "eSports 2013" },
    { img: "assets/cases/winter2013.png", name: "eSports 2013 Winter" },
    { img: "assets/cases/summer214.png", name: "eSports 2014 Summer" }
  ];

  const navStickers = [
    { img: "assets/stickers/katowice-2014.png", name: "Katowice 2014", year: 2014, date: "2014-02-13" },
    { img: "assets/stickers/cologne-2014.png", name: "Cologne 2014", year: 2014, date: "2014-08-14" },
    { img: "assets/stickers/dreamhack-2014.png", name: "DreamHack 2014", year: 2014, date: "2014-11-27" },
    { img: "assets/stickers/katowice-2015.png", name: "Katowice 2015", year: 2015, date: "2015-03-12" },
    { img: "assets/stickers/cologne-2015.png", name: "Cologne 2015", year: 2015, date: "2015-07-02" },
    { img: "assets/stickers/cluj-napoca-2015.png", name: "Cluj-Napoca 2015", year: 2015, date: "2015-10-22" },
    { img: "assets/stickers/mlg-columbus-2016.png", name: "MLG Columbus 2016", year: 2016, date: "2016-03-29" },
    { img: "assets/stickers/cologne-2016.png", name: "Cologne 2016", year: 2016, date: "2016-07-05" },
    { img: "assets/stickers/atlanta-2017.png", name: "Atlanta 2017", year: 2017, date: "2017-01-22" },
    { img: "assets/stickers/krakow-2017.png", name: "Krakow 2017", year: 2017, date: "2017-07-16" },
    { img: "assets/stickers/boston-2018.png", name: "Boston 2018", year: 2018, date: "2018-01-12" },
    { img: "assets/stickers/london-2018.png", name: "London 2018", year: 2018, date: "2018-09-05" },
    { img: "assets/stickers/community-2018.png", name: "Community 2018", year: 2018, date: "2018-09-05" },
    { img: "assets/stickers/katowice-2019.png", name: "Katowice 2019", year: 2019, date: "2019-02-13" },
    { img: "assets/stickers/berlin-2019.png", name: "Berlin 2019", year: 2019, date: "2019-08-23" },
    { img: "assets/stickers/rmr-2020.png", name: "2020 RMR", year: 2020, date: "2020-09-18" },
    { img: "assets/stickers/stockholm-2021.png", name: "Stockholm 2021", year: 2021, date: "2021-10-26" },
    { img: "assets/stickers/community-2021.png", name: "Community 2021", year: 2021, date: "2021-10-26" },
    { img: "assets/stickers/antwerp-2022.png", name: "Antwerp 2022", year: 2022, date: "2022-05-09" },
    { img: "assets/stickers/rio-2022.png", name: "Rio 2022", year: 2022, date: "2022-10-31" },
    { img: "assets/stickers/paris-2023.png", name: "Paris 2023", year: 2023, date: "2023-05-08" },
    { img: "assets/stickers/copenhagen-2024.png", name: "Copenhagen 2024", year: 2024, date: "2024-03-17" },
    { img: "assets/stickers/shanghai-2024.png", name: "Shanghai 2024", year: 2024, date: "2024-12-01" },
    { img: "assets/stickers/austin-2025.png", name: "Austin 2025", year: 2025, date: "2025-05-10" },
    { img: "assets/stickers/budapest-2025.png", name: "Budapest 2025", year: 2025, date: "2025-11-08" },
    // Cologne 2026 removed on request (2026-09-27): its capsules are not on
    // the Steam market and its only art was the Cologne 2016 placeholder.
    { img: "assets/stickers/community-capsule-1.png", name: "Community Capsule 1", year: 2014, date: "2014-05-15" },
    { img: "assets/stickers/community-series-2.png", name: "Community Series 2", year: 2015, date: "2015-05-05" },
    { img: "assets/stickers/community-series-3.png", name: "Community Series 3", year: 2016, date: "2016-05-03" },
    { img: "assets/stickers/community-series-4.png", name: "Community Series 4", year: 2017, date: "2017-05-25" },
    { img: "assets/stickers/community-series-5.png", name: "Community Series 5", year: 2018, date: "2018-08-15" },
    { img: "assets/stickers/cs20.png", name: "CS20 Capsule", year: 2019, date: "2019-10-01" },
    { img: "assets/stickers/10-year-birthday.png", name: "10 Year Birthday", year: 2022, date: "2022-08-21" },
    { img: "assets/stickers/shattered-web.png", name: "Shattered Web", year: 2019, date: "2019-11-18" },
    { img: "assets/stickers/broken-fang.png", name: "Broken Fang", year: 2020, date: "2020-12-03" },
    { img: "assets/stickers/riptide.png", name: "Operation Riptide", year: 2021, date: "2021-09-21" },
    { img: "assets/stickers/recoil.png", name: "Recoil Collection", year: 2022, date: "2022-07-19" },
    { img: "assets/stickers/elemental-craft.png", name: "Elemental Craft", year: 2024, date: "2024-06-13" },
    { img: "assets/stickers/character-craft.png", name: "Character Craft", year: 2024, date: "2024-08-08" },
    { img: "assets/stickers/poorly-drawn.png", name: "Poorly Drawn", year: 2020, date: "2020-05-12" },
    { img: "assets/stickers/chicken.png", name: "Chicken Capsule", year: 2020, date: "2020-06-09" },
    { img: "assets/stickers/half-life-alyx.png", name: "Half-Life: Alyx", year: 2020, date: "2020-03-23" },
    { img: "assets/stickers/halo.png", name: "Halo Capsule", year: 2021, date: "2021-03-03" },
    { img: "assets/stickers/warhammer-40k.png", name: "Warhammer 40K", year: 2021, date: "2021-04-14" },
    { img: "assets/stickers/pinups.png", name: "Pinups Capsule", year: 2016, date: "2016-04-26" },
    { img: "assets/stickers/enfu.png", name: "Enfu Capsule", year: 2016, date: "2016-04-27" },
    { img: "assets/stickers/sugarface.png", name: "Sugarface Capsule", year: 2017, date: "2017-05-25" },
    { img: "assets/stickers/team-roles.png", name: "Team Roles Capsule", year: 2018, date: "2018-05-31" },
    { img: "assets/stickers/bestiary.png", name: "Bestiary Capsule", year: 2018, date: "2018-06-14" }
  ];

  const navOtherSections = [
    {
      title: "Music Kits",
      cardImg: "assets/other/music-kit-masterminds.webp",
      items: [
        { img: "assets/other/music-kit-masterminds.webp", name: "Masterminds Music Kit Box" },
        { img: "assets/other/music-kit-initiators.webp", name: "Initiators Music Kit Box" },
        { img: "assets/other/music-kit-deluge.webp", name: "Deluge Music Kit Box" },
        { img: "assets/other/music-kit-nightmode.webp", name: "NIGHTMODE Music Kit Box" },
        { img: "assets/other/music-kit-masterminds-2.webp", name: "Masterminds 2 Music Kit Box" },
        { img: "assets/other/music-kit-tacticians.webp", name: "Tacticians Music Kit Box" },
        { img: "assets/other/music-kit-masterminds.webp", name: "StatTrak\u2122 Masterminds Music Kit Box" },
        { img: "assets/other/music-kit-initiators.webp", name: "StatTrak\u2122 Initiators Music Kit Box" },
      ]
    },
    {
      title: "Agents",
      items: [
        { img: "assets/other/agents.webp", name: "All Agents" },
        { img: "assets/other/agents-riptide.webp", name: "Operation Riptide Agents" },
        { img: "assets/other/agents-broken-fang.webp", name: "Broken Fang Agents" },
        { img: "assets/other/agents-shattered-web.webp", name: "Shattered Web Agents" }
      ]
    },
    {
      title: "Charms",
      cardImg: "assets/other/charm-small-arms.webp",
      items: [
        { img: "assets/other/charm-dr-boom.webp", name: "Dr. Boom Charms" },
        { img: "assets/other/charm-missing-link-community.webp", name: "Missing Link Community Charms" },
        { img: "assets/other/charm-missing-link.webp", name: "Missing Link Charms" },
        { img: "assets/other/charm-small-arms.webp", name: "Small Arms Charms" },
        { img: "https://cdn.steamstatic.com/apps/730/icons/econ/stickers/emskatowice2014/fnatic_1355_37.8553e3a26b612d50fe5cc5e12a1b936664b75081.png", name: "Sticker Slabs" },
      ]
    },
    {
      title: "Patches",
      cardImg: "assets/other/patch-csgo-card.webp",
      items: [
        { img: "assets/other/patch-csgo.webp", name: "CS:GO Patch Pack" },
        { img: "assets/other/patch-stockholm-challengers.webp", name: "Stockholm 2021 Challengers Patch Pack" },
        { img: "assets/other/patch-stockholm-contenders.webp", name: "Stockholm 2021 Contenders Patch Pack" },
        { img: "assets/other/patch-stockholm-legends.webp", name: "Stockholm 2021 Legends Patch Pack" },
        { img: "assets/other/patch-riptide.webp", name: "Operation Riptide Patch Collection" },
        { img: "assets/other/patch-metal-skill-group.webp", name: "Metal Skill Group Patch Collection" },
        { img: "assets/other/patch-alyx.webp", name: "Half-Life: Alyx Patch Pack" },
      ]
    },
    {
      title: "Pins",
      items: [
        { img: "assets/other/pins.png", name: "Collectible Pins" },
        { img: "assets/other/pins-alyx.png", name: "Half-Life: Alyx Collectible Pins" },
        { img: "assets/other/pins-series-1.png", name: "Series 1" },
        { img: "assets/other/pins-series-2.png", name: "Series 2" },
        { img: "assets/other/pins-series-3.png", name: "Series 3" }
      ]
    },
    {
      title: "Graffiti",
      items: [
        { img: "assets/steam-market-cache/graffiti--d371ffa512.png", name: "Graffiti" },
        { img: "assets/other/graffiti-collection-3.webp", name: "CS:GO Graffiti #3 Collection" },
        { img: "assets/other/graffiti-collection-2.png", name: "CS:GO Graffiti #2 Collection" },
        { img: "assets/other/graffiti-trolling.webp", name: "Trolling Graffiti Collection" },
        { img: "assets/steam-market-cache/perfect-world-graffiti-box--78df82060b.png", name: "Perfect World Graffiti Box" },
        { img: "assets/steam-market-cache/cs-go-graffiti-box--05896ee1c9.png", name: "CS:GO Graffiti Box" },
        { img: "assets/steam-market-cache/community-graffiti-box-1--67fee6c2f9.png", name: "Community Graffiti Box 1" }
      ]
    }
  ];

  const weaponCategories = [
    {
      key: "pistols",
      label: "Pistols",
      icon: "fa-solid fa-gun",
      folder: "pistols",
      placeholder: "Search for Pistols...",
      items: ["Zeus x27", "CZ75-Auto", "Desert Eagle", "Dual Berettas", "Five-SeveN", "Glock-18", "P2000", "P250", "R8 Revolver", "Tec-9", "USP-S"]
    },
    {
      key: "smgs",
      label: "SMGs",
      icon: "fa-solid fa-burst",
      folder: "smgs",
      placeholder: "Search for SMGs...",
      items: ["MAC-10", "MP5-SD", "MP7", "MP9", "PP-Bizon", "P90", "UMP-45"]
    },
    {
      key: "heavy",
      label: "Heavy",
      icon: "fa-solid fa-fire",
      folder: "heavy",
      placeholder: "Search for Heavy weapons...",
      items: ["MAG-7", "Nova", "Sawed-Off", "XM1014", "M249", "Negev"]
    },
    {
      key: "rifles",
      label: "Rifles",
      icon: "fa-solid fa-bolt",
      folder: "rifles",
      placeholder: "Search for Rifles...",
      items: ["AK-47", "AUG", "AWP", "FAMAS", "G3SG1", "Galil AR", "M4A1-S", "M4A4", "SCAR-20", "SG 553", "SSG 08"]
    },
    {
      key: "rare",
      label: "Rare",
      icon: "fa-solid fa-khanda",
      folder: "knives",
      placeholder: "Search for knives & gloves...",
      knifeItems: [
        "Bayonet",
        "Bowie Knife",
        "Butterfly Knife",
        "Classic Knife",
        "Falchion Knife",
        "Flip Knife",
        "Gut Knife",
        "Huntsman Knife",
        "Karambit",
        "Kukri Knife",
        "M9 Bayonet",
        "Navaja Knife",
        "Nomad Knife",
        "Paracord Knife",
        "Shadow Daggers",
        "Skeleton Knife",
        "Stiletto Knife",
        "Talon Knife",
        "Ursus Knife"
      ],
      gloveItems: [
        "Bloodhound Gloves",
        "Broken Fang Gloves",
        "Driver Gloves",
        "Hand Wraps",
        "Hydra Gloves",
        "Moto Gloves",
        "Specialist Gloves",
        "Sport Gloves"
      ],
      get items() {
        return [...this.knifeItems, ...this.gloveItems];
      }
    }
  ];

  const featuredItems = [
    { title: "Desert Eagle | Code Red", img: "deagle.webp", rarity: "covert" },
    { title: "UMP-45 | Primal Saber", img: "ump.webp", rarity: "epic" },
    { title: "M4A4 | Radiation Hazard", img: "m4.webp", rarity: "rare" },
    { title: "AK-47 | Neon Revolution", img: "ak.webp", rarity: "covert" },
    { title: "FAMAS | Mecha Industries", img: "famas.webp", rarity: "epic" },
    { title: "MP9 | Featherweight", img: "mp9.webp", rarity: "rare" }
  ];

  const footerColumns = [
    {
      title: "Browse",
      links: [
        { href: "rifles.html", label: "Rifles" },
        { href: "pistols.html", label: "Pistols" },
        { href: "smgs.html", label: "SMGs" },
        { href: "heavy.html", label: "Heavy" },
        { href: "rare.html", label: "Rare" }
      ]
    },
    {
      title: "Features",
      links: [
        { href: "deals.html", label: "Deals" },
        { href: "skin-crafter.html", label: "3D Viewer" },
        { href: "stats-db.html", label: "Database" },
        { href: "watchlist.html", label: "Watchlist" },
        { href: "carepackage.html", label: "Care Package" }
      ]
    },
    {
      title: "Guides",
      links: [
        { href: "collections.html", label: "Collections" },
        { href: "cases.html", label: "Cases" },
        { href: "armory.html", label: "Armory" },
        { href: "data.html", label: "Market Data" }
      ]
    }
  ];

  return {
    navCollections,
    navCases,
    navStickers,
    navOtherSections,
    weaponCategories,
    featuredItems,
    footerColumns
  };
})());

