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
    return (
      <section className="skins-page">
        <div className="skins-header">
          <h1>AK-47 Skins</h1>
          <button className="filter-btn">
            <i className="fa-solid fa-sliders" /> Filter &amp; Sort
          </button>
        </div>

        <div className="skins-grid">
          {cards.map((card) => (
            <div className="skin-card" key={card.name}>
              <h3>{card.name}</h3>

              <div className="rarity-bar covert">
                <span>{card.rarity}</span>
                <i className="fa-solid fa-magnifying-glass" />
              </div>

              {card.stattrak ? <div className="stattrak">StatTrak Available</div> : null}

              <img src={card.image} alt={`AK-47 ${card.name}`} />

              <div className="price-range">{card.priceRange}</div>

              {card.meta ? (
                <div className="skin-meta">
                  <span>{card.meta}</span>
                </div>
              ) : null}

              {card.caseSource ? (
                <div className="case-source">
                  <img src={card.caseSource.image} alt={card.caseSource.label} />
                  <span>{card.caseSource.label}</span>
                </div>
              ) : null}

              <div className="card-actions">
                <button>{card.primaryAction}</button>
                <button>{card.secondaryAction}</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  mountPage(<Ak47Page />);
})();
