const urls = [
  "https://3d.cs.money/api/search/items?q=baroque%20purple",
  "https://3d.cs.money/api/items/745",
  "https://3d.cs.money/api/skins/745",
  "https://3d.cs.money/api/v1/items/search?q=AK-47%20Baroque%20Purple",
  "https://3d.cs.money/api/item-configuration?paintIndex=745&weapon=weapon_ak47",
];

(async () => {
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
      const text = await response.text();
      console.log(`\n${url}\n${response.status} ${text.slice(0, 500).replace(/\s+/g, " ")}`);
    } catch (error) {
      console.log(url, error.message);
    }
  }
})();
