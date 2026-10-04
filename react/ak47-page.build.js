(() => {
  (() => {
    const { mountPage } = window.CS2React;
    const cards = [
      {
        name: "Aphrodite",
        rarity: "Covert Rifle",
        image: "assets/skins/ak47-aphrodite.webp",
        priceRange: "25,03 EUR - 63,98 EUR",
        meta: "Limited Edition Item",
        primaryAction: "Inspect in-game (MW)",
        secondaryAction: "1396 Steam Listings"
      },
      {
        name: "The Oligarch",
        rarity: "Covert Rifle",
        stattrak: true,
        image: "assets/skins/ak47-oligarch.webp",
        priceRange: "57,28 EUR - 628,79 EUR",
        caseSource: {
          image: "assets/cases/genesis.webp",
          label: "Sealed Genesis Terminal"
        },
        primaryAction: "Inspect in-game (FN)",
        secondaryAction: "421 Steam Listings"
      },
      {
        name: "Inheritance",
        rarity: "Covert Rifle",
        stattrak: true,
        image: "assets/skins/ak47-inheritance.webp",
        priceRange: "54,44 EUR - 211,80 EUR",
        caseSource: {
          image: "assets/cases/kilowatt.webp",
          label: "Kilowatt Case"
        },
        primaryAction: "Inspect in-game (FN)",
        secondaryAction: "711 Steam Listings"
      }
    ];
    function Ak47Page() {
      return /* @__PURE__ */ React.createElement("section", { className: "skins-page" }, /* @__PURE__ */ React.createElement("div", { className: "skins-header" }, /* @__PURE__ */ React.createElement("h1", null, "AK-47 Skins"), /* @__PURE__ */ React.createElement("button", { className: "filter-btn" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-sliders" }), " Filter & Sort")), /* @__PURE__ */ React.createElement("div", { className: "skins-grid" }, cards.map((card) => /* @__PURE__ */ React.createElement("div", { className: "skin-card", key: card.name }, /* @__PURE__ */ React.createElement("h3", null, card.name), /* @__PURE__ */ React.createElement("div", { className: "rarity-bar covert" }, /* @__PURE__ */ React.createElement("span", null, card.rarity), /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" })), card.stattrak ? /* @__PURE__ */ React.createElement("div", { className: "stattrak" }, "StatTrak Available") : null, /* @__PURE__ */ React.createElement("img", { src: card.image, alt: `AK-47 ${card.name}` }), /* @__PURE__ */ React.createElement("div", { className: "price-range" }, card.priceRange), card.meta ? /* @__PURE__ */ React.createElement("div", { className: "skin-meta" }, /* @__PURE__ */ React.createElement("span", null, card.meta)) : null, card.caseSource ? /* @__PURE__ */ React.createElement("div", { className: "case-source" }, /* @__PURE__ */ React.createElement("img", { src: card.caseSource.image, alt: card.caseSource.label }), /* @__PURE__ */ React.createElement("span", null, card.caseSource.label)) : null, /* @__PURE__ */ React.createElement("div", { className: "card-actions" }, /* @__PURE__ */ React.createElement("button", null, card.primaryAction), /* @__PURE__ */ React.createElement("button", null, card.secondaryAction))))));
    }
    mountPage(/* @__PURE__ */ React.createElement(Ak47Page, null));
  })();
})();
