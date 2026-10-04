(() => {
  const { Layout, FeaturedPreview, CollectionCard, MarketCard, mountPage } = window.CS2React;
  const shared = window.CS2ReactData;

  const categoryCards = [
    {
      iconClass: "fa-solid fa-bolt",
      iconTone: "blue",
      title: "Rifles",
      subtitle: "AK-47, M4A4, M4A1-S",
      badgeTone: "blue",
      badge: "50+"
    },
    {
      iconClass: "fa-solid fa-gun",
      iconTone: "green",
      title: "Pistols",
      subtitle: "Desert Eagle, USP-S, Glock-18",
      badgeTone: "green",
      badge: "40+"
    },
    {
      iconClass: "fa-solid fa-burst",
      iconTone: "purple",
      title: "SMGs",
      subtitle: "MP9, MP7, P90",
      badgeTone: "purple",
      badge: "30+"
    },
    {
      iconClass: "fa-solid fa-fire",
      iconTone: "red",
      title: "LMGs",
      subtitle: "M249, Negev, M60",
      badgeTone: "red",
      badge: "25+"
    }
  ];

  const itemTypeCards = [
    {
      iconClass: "fa-solid fa-box",
      iconTone: "orange",
      title: "Cases",
      subtitle: "Active & discontinued cases",
      badgeTone: "orange",
      badge: "30+"
    },
    {
      iconClass: "fa-solid fa-boxes-stacked",
      iconTone: "purple",
      title: "Capsules",
      subtitle: "Sticker & autograph capsules",
      badgeTone: "purple",
      badge: "25+"
    },
    {
      iconClass: "fa-solid fa-star",
      iconTone: "cyan",
      title: "Stickers",
      subtitle: "Team stickers & autographs",
      badgeTone: "cyan",
      badge: "100+"
    },
    {
      iconClass: "fa-solid fa-user-secret",
      iconTone: "red",
      title: "Agents",
      subtitle: "Character models & patches",
      badgeTone: "red",
      badge: "10+"
    }
  ];

  const popularCollections = [
    { img: "Gods_and_Monsters.webp", alt: "The Gods and Monsters Collection", name: "The Gods & Monsters Collection" },
    { img: "Canals.webp", alt: "Canals Collection", name: "Canals Collection" },
    { img: "Control.webp", alt: "Control Collection", name: "Control Collection" },
    { img: "Bank.webp", alt: "Bank Collection", name: "Bank Collection" },
    { img: "Cobblestone.webp", alt: "Cobblestone Collection", name: "Cobblestone Collection" },
    { img: "Norse.webp", alt: "Norse Collection", name: "Norse Collection" },
    { img: "Rising_Sun.webp", alt: "Rising Sun Collection", name: "Rising Sun Collection" },
    { img: "Chop_Shop.webp", alt: "Chop Shop Collection", name: "Chop Shop Collection" }
  ];

  const popularCases = [
    { img: "Fracture_Case.webp", alt: "Fracture Case", name: "Fracture Case" },
    { img: "CS20_Case.webp", alt: "CS20 Case", name: "CS20 Case" },
    { img: "revolution-case.webp", alt: "Revolution Case", name: "Revolution Case" },
    { img: "Spectrum_2_Case.webp", alt: "Spectrum 2 Case", name: "Spectrum 2 Case" },
    { img: "Prisma_2_Case.webp", alt: "Prisma 2 Case", name: "Prisma 2 Case" },
    { img: "Snakebite_Case.webp", alt: "Snakebite Case", name: "Snakebite Case" },
    { img: "Clutch_Case.webp", alt: "Clutch Case", name: "Clutch Case" },
    { img: "Dreams_&_Nightmares_Case.webp", alt: "Dreams & Nightmares Case", name: "Dreams & Nightmares Case" }
  ];

  const trendingItems = [
    { img: "AK-47_Vulcan.webp", name: "AK-47 | Vulcan", price: 6.98, change: 9.84 },
    { img: "P250_Asiimov.webp", name: "P250 | Asiimov", price: 31.45, change: 12.27 },
    { img: "Sous-Lieutenant_Medic_Gendarmerie_Nationale.webp", name: "Medic | Gendarmerie Nationale", price: 2.18, change: 7.91 },
    { img: "Sticker_King_on_the_Field.webp", name: "Sticker | King on the Field", price: 1042.6, change: 5.68 },
    { img: "Navaja_Knife.webp", name: "Navaja Knife", price: 2269.4, change: 8.12 },
    { img: "M249_Nebula_Crusader.webp", name: "M249 | Nebula Crusader", price: 21.35, change: 10.44 }
  ];

  const decliningItems = [
    { img: "Driver_Gloves_Racing_Green.webp", name: "Driver Gloves | Racing Green", price: 642.8, change: -6.92 },
    { img: "SCAR-20_Bloodsport.webp", name: "SCAR-20 | Bloodsport", price: 3984.1, change: -4.37 },
    { img: "Bowie_Knife_Slaughter.webp", name: "Bowie Knife | Slaughter", price: 301.55, change: -9.18 },
    { img: "Operation_Hydra_Case.webp", name: "Operation Hydra Case", price: 34.2, change: -12.64 },
    { img: "PP-Bizon_Antique.webp", name: "PP-Bizon | Antique", price: 487.9, change: -7.53 },
    { img: "Number_K_The_Professionals.webp", name: "Number K | The Professionals", price: 8.95, change: -10.21 }
  ];

  function HomePage() {
    return (
      <Layout>
        <div className="hero">
          <div className="hero-left">
            <h1>
              Browse and track all <br />
              skins, cases, capsules,<br />
              and more
            </h1>

            <p>
              Browse and track all CS2 items. Track prices, discover profitable deals,
              see your inventory worth, and find the best marketplace to sell on.
            </p>

            <div className="hero-buttons">
              <a className="btn-primary" href="roi.html#roi-items">
                <i className="fa-solid fa-magnifying-glass" /> Browse CS2 Skins
              </a>
              <a className="btn-secondary" href="collections.html">
                <i className="fa-solid fa-circle-half-stroke" /> Collections
              </a>
            </div>

            <div className="hero-features refined">
              <span><i className="fa-solid fa-circle-check" /> Live market prices</span>
              <span><i className="fa-solid fa-circle-check" /> Inventory tracking</span>
              <span><i className="fa-solid fa-circle-check" /> ROI analytics</span>
            </div>
          </div>

          <div className="hero-right">
            <FeaturedPreview items={shared.featuredItems} />
          </div>
        </div>

        <div className="categories-section">
          <h2>Browse by Category</h2>

          <div className="category-grid">
            {categoryCards.map((card) => (
              <div className="category-card" key={card.title}>
                <div className="cat-left">
                  <div className={`cat-icon ${card.iconTone}`}>
                    <i className={card.iconClass} />
                  </div>
                  <div>
                    <div className="cat-title">{card.title}</div>
                    <div className="cat-sub">{card.subtitle}</div>
                  </div>
                </div>
                <div className={`cat-badge ${card.badgeTone}`}>{card.badge}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="item-types">
          {itemTypeCards.map((card) => (
            <div className="item-type-card" key={card.title}>
              <div className={`item-icon ${card.iconTone}`}>
                <i className={card.iconClass} />
              </div>
              <div className="item-info">
                <div className="item-title">{card.title}</div>
                <div className="item-sub">{card.subtitle}</div>
              </div>
              <div className={`item-badge ${card.badgeTone}`}>{card.badge}</div>
            </div>
          ))}
        </div>

        <div className="collections-section">
          <div className="collections-header">
            <h2>Collections</h2>
            <a href="collections.html" className="view-all">
              View all collections <i className="fa-solid fa-arrow-right" />
            </a>
          </div>

          <div className="collections-grid">
            {popularCollections.map((collection) => (
              <CollectionCard
                key={collection.name}
                img={collection.img}
                alt={collection.alt}
                name={collection.name}
              />
            ))}
          </div>
        </div>

        <div className="collections-section">
          <div className="collections-header">
            <h2>Cases</h2>
            <a href="cases.html" className="view-all">
              View all cases <i className="fa-solid fa-arrow-right" />
            </a>
          </div>

          <div className="collections-grid">
            {popularCases.map((collection) => (
              <CollectionCard
                key={collection.name}
                img={collection.img}
                alt={collection.alt}
                name={collection.name}
                wrapName={false}
              />
            ))}
          </div>
        </div>

        <section className="market-section">
          <h2 className="section-title trending">
            <i className="fa-solid fa-arrow-trend-up" /> Top Trending
          </h2>

          <div className="item-grid" id="trendingGrid">
            {trendingItems.map((item) => (
              <MarketCard item={item} key={item.name} />
            ))}
          </div>

          <h2 className="section-title declining">
            <i className="fa-solid fa-arrow-trend-down" /> Top Declining
          </h2>

          <div className="item-grid" id="decliningGrid">
            {decliningItems.map((item) => (
              <MarketCard item={item} key={item.name} />
            ))}
          </div>
        </section>
      </Layout>
    );
  }

  mountPage(<HomePage />);
})();
