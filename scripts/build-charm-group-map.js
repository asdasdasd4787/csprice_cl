const fs = require("fs");
const path = require("path");

const GROUPS = {
  "Dr. Boom Charms": "Dr Boom Charm Collection",
  "Missing Link Community Charms": "Missing Link Community Charm Collection",
  "Missing Link Charms": "Missing Link Charm Collection",
  "Small Arms Charms": "Small Arms Charm Collection",
};

async function main() {
  const res = await fetch("https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/keychains.json");
  const data = await res.json();
  const items = Object.values(data);
  const map = {};

  for (const [group, collection] of Object.entries(GROUPS)) {
    map[group] = items
      .filter((item) => (item.collections || []).some((entry) => entry.name === collection))
      .map((item) => String(item.name || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  map["Sticker Slabs"] = "__ALL_SLABS__";

  const out = `(() => {
  const CHARM_GROUP_MAP = ${JSON.stringify(map, null, 2)};
  Object.assign(window.CS2ReactData || (window.CS2ReactData = {}), { CHARM_GROUP_MAP });
})();
`;

  const target = path.join(__dirname, "..", "react", "charm-group-map.js");
  fs.writeFileSync(target, out);
  console.log("Wrote", target);
  for (const [group, roster] of Object.entries(map)) {
    console.log(group, roster.length);
  }
}

main();
