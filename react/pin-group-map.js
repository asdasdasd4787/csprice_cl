(() => {
  const SERIES_1 = [
    "Guardian Pin",
    "Tactics Pin",
    "Nuke Pin",
    "Train Pin",
    "Victory Pin",
    "Militia Pin",
    "Italy Pin",
    "Mirage Pin",
    "Inferno Pin",
    "Dust II Pin",
    "Guardian Elite Pin",
  ];

  const SERIES_2 = [
    "Guardian 2 Pin",
    "Bravo Pin",
    "Baggage Pin",
    "Phoenix Pin",
    "Valeria Phoenix Pin",
    "Office Pin",
    "Cobblestone Pin",
    "Overpass Pin",
    "Bloodhound Pin",
    "Cache Pin",
    "Chroma Pin",
  ];

  const SERIES_3 = [
    "Guardian 3 Pin",
    "Canals Pin",
    "Welcome to the Clutch Pin",
    "Death Sentence Pin",
    "Inferno 2 Pin",
    "Wildfire Pin",
    "Easy Peasy Pin",
    "Aces High Pin",
    "Hydra Pin",
    "Howl Pin",
    "Brigadier General Pin",
  ];

  const ALYX = [
    "Combine Helmet Pin",
    "Black Mesa Pin",
    "CMB Pin",
    "Lambda Pin",
    "City 17 Pin",
    "Headcrab Glyph Pin",
    "Copper Lambda Pin",
    "Health Pin",
    "Sustenance! Pin",
    "Vortigaunt Pin",
    "Alyx Pin",
    "Civil Protection Pin",
  ];

  const PIN_GROUP_MAP = {
    "Collectible Pins": [...SERIES_1, ...SERIES_2, ...SERIES_3],
    "Half-Life: Alyx Collectible Pins": ALYX,
    "Series 1": SERIES_1,
    "Series 2": SERIES_2,
    "Series 3": SERIES_3,
  };

  Object.assign(window.CS2ReactData || (window.CS2ReactData = {}), { PIN_GROUP_MAP });
})();
