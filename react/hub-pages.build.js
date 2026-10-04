(() => {
  (() => {
    const { Layout, mountPage, useI18n, classNames, getCurrentPageName } = window.CS2React;
    const equipmentIcon = (slug) => slug === "gloves" ? "assets/icons/equipment/gloves-silhouette.png?v=20260925-gloves-sil-1" : `assets/icons/equipment/${slug}.svg`;
    const sectionIcon = (file) => `assets/icons/sections/${file}`;
    const weaponArt = (path) => `assets/weapons/${path}`;
    const HUBS = {
      "tools.html": {
        titleKey: "nav_tools",
        blurb: "Everything on the site that does the digging for you.",
        accent: "#60a5fa",
        links: [
          {
            href: "deals.html",
            labelKey: "nav_deals",
            icon: "fa-solid fa-tags",
            desc: "Listings priced under their market value, refreshed all day."
          },
          {
            href: "roi.html",
            labelKey: "nav_market",
            icon: "fa-solid fa-chart-line",
            desc: "Compare every marketplace on one item: price, spread and ROI."
          },
          {
            href: "skin-crafter.html",
            labelKey: "nav_skinCrafter",
            icon: "fa-solid fa-cube",
            desc: "Place stickers and charms on a 3D skin before you spend a cent."
          },
          {
            href: "carepackage.html",
            labelKey: "nav_carePackage",
            icon: "fa-solid fa-gift",
            desc: "A daily roll of items worth a second look."
          },
          {
            href: "armory.html",
            labelKey: "footer_armory",
            icon: "fa-solid fa-shield-halved",
            desc: "This season's armory rewards and what they cost to reach."
          },
          {
            href: "stats-db.html",
            labelKey: "footer_database",
            icon: "fa-solid fa-database",
            desc: "The raw database behind the site: every tracked item and price."
          },
          {
            href: "data.html",
            labelKey: "footer_marketData",
            icon: "fa-solid fa-chart-column",
            desc: "Market-wide numbers: volume, movers and where the money went."
          },
          {
            href: "watchlist.html",
            labelKey: "common_watchlist",
            icon: "fa-solid fa-bookmark",
            desc: "The items you saved, with their price moves since you did."
          }
        ]
      },
      "skins.html": {
        titleKey: "nav_skins",
        blurb: "Every weapon class, with prices for each finish.",
        accent: "#38bdf8",
        links: [
          {
            href: "knives.html",
            labelKey: "icat_knives",
            img: weaponArt("knives/butterfly-knife.png"),
            desc: "Karambits, butterflies and the rest of the rare blades."
          },
          {
            href: "gloves.html",
            labelKey: "icat_gloves",
            img: weaponArt("gloves/sport-gloves.png"),
            desc: "Every glove set, from Hand Wraps to Sport Gloves."
          },
          {
            href: "pistols.html",
            labelKey: "nav_pistols",
            img: weaponArt("pistols/desert-eagle.png"),
            desc: "Deagle, Glock, USP-S and the whole sidearm rack."
          },
          {
            href: "rifles.html",
            labelKey: "nav_rifles",
            img: weaponArt("rifles/ak-47.png"),
            desc: "AK-47, M4s, AWP and the rest of the primaries."
          },
          {
            href: "smgs.html",
            labelKey: "nav_smgs",
            img: weaponArt("smgs/p90.png"),
            desc: "MAC-10, MP9, P90 and the other spray guns."
          },
          {
            href: "heavy.html",
            labelKey: "nav_heavy",
            img: weaponArt("heavy/m249.png"),
            desc: "Shotguns and machine guns, the cheap end of the market."
          }
        ]
      },
      "other.html": {
        titleKey: "nav_other",
        blurb: "Everything that is not a gun: sets, capsules and collectibles.",
        accent: "#34d399",
        links: [
          {
            href: "collections.html",
            labelKey: "nav_collections",
            img: sectionIcon("collection.svg"),
            desc: "Skin sets by map and operation, with every drop inside."
          },
          {
            href: "cases.html",
            labelKey: "nav_cases",
            // The navbar's own case art, so this row matches the drawn icons
            // around it instead of standing out as a coloured glyph.
            img: "assets/nav/items/cases.png",
            desc: "Case prices, drop odds and what opening one is worth."
          },
          {
            href: "stickers.html",
            labelKey: "nav_stickers",
            img: sectionIcon("sticker-navi.png"),
            desc: "Capsules and the stickers inside them, team by team."
          },
          {
            href: "agents.html",
            labelKey: "icat_agents",
            img: sectionIcon("agent.png"),
            desc: "Playable agents for both sides, priced per skin."
          },
          {
            href: "charms.html",
            labelKey: "icat_charms",
            img: sectionIcon("charm.png"),
            desc: "Keychains you hang off a weapon, by capsule."
          },
          {
            href: "patches.html",
            labelKey: "icat_patches",
            img: sectionIcon("patch.png"),
            desc: "Agent patches, including the tournament runs."
          },
          {
            href: "graffiti.html",
            labelKey: "icat_graffiti",
            img: sectionIcon("graffiti.png"),
            desc: "Sealed graffiti in every colour it was printed in."
          },
          {
            href: "pins.html",
            labelKey: "icat_pins",
            img: sectionIcon("pin.png"),
            desc: "Collectible pins from every series."
          },
          {
            href: "music.html",
            labelKey: "icat_musicKits",
            img: sectionIcon("music-kit.png"),
            desc: "Music kits and their StatTrak versions."
          }
        ]
      }
    };
    function HubPage() {
      const { t } = useI18n();
      const page = getCurrentPageName();
      const hub = HUBS[page] || HUBS["tools.html"];
      return /* @__PURE__ */ React.createElement(Layout, null, /* @__PURE__ */ React.createElement(
        "div",
        {
          className: classNames("hub-shell", `hub-shell--${String(page).replace(/\.[a-z]+$/i, "")}`),
          style: { "--hub-accent": hub.accent }
        },
        /* @__PURE__ */ React.createElement("header", { className: "hub-head" }, /* @__PURE__ */ React.createElement("h1", null, t(hub.titleKey)), /* @__PURE__ */ React.createElement("p", null, hub.blurb)),
        /* @__PURE__ */ React.createElement("div", { className: "hub-grid" }, hub.links.map((entry, index) => /* @__PURE__ */ React.createElement(
          "a",
          {
            className: "hub-card",
            href: entry.href,
            key: entry.href,
            style: { "--row-i": Math.min(index, 12) }
          },
          /* @__PURE__ */ React.createElement("span", { className: "hub-card-icon", "aria-hidden": "true" }, entry.img ? /* @__PURE__ */ React.createElement("img", { src: entry.img, alt: "", loading: "lazy", decoding: "async" }) : /* @__PURE__ */ React.createElement("i", { className: entry.icon })),
          /* @__PURE__ */ React.createElement("span", { className: "hub-card-body" }, /* @__PURE__ */ React.createElement("strong", null, t(entry.labelKey)), /* @__PURE__ */ React.createElement("small", null, entry.desc)),
          /* @__PURE__ */ React.createElement("i", { className: classNames("fa-solid fa-chevron-right", "hub-card-go"), "aria-hidden": "true" })
        )))
      ));
    }
    mountPage(/* @__PURE__ */ React.createElement(HubPage, null));
  })();
})();
