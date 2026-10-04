const fs = require("fs");
const path = require("path");

const list = JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".tmp_crates.json"), "utf8"));
const catalog = require(path.join(__dirname, "..", "assets", "steam-market-cache", "roi_catalog.json")).items.filter(
  (item) => item.category === "patches"
);
const names = new Set(catalog.map((item) => item.market_hash_name));

function resolve(name) {
  if (names.has(name)) return name;
  const prefixed = `Patch | ${name}`;
  if (names.has(prefixed)) return prefixed;
  return null;
}

function fromCrate(label) {
  const crate = list.find((entry) => entry.market_hash_name === label || entry.name === label);
  return (crate?.contains || [])
    .map((item) => resolve(item.market_hash_name || item.name))
    .filter(Boolean);
}

const CSGO = fromCrate("CS:GO Patch Pack");
const METAL = fromCrate("Metal Skill Group Patch Collection");
const ALYX = fromCrate("Half-Life: Alyx Patch Pack");
const RIPTIDE = fromCrate("Operation Riptide Patch Collection");
const STOCKHOLM_LEGENDS = fromCrate("Stockholm 2021 Legends Patch Pack");
const STOCKHOLM_CHALLENGERS = fromCrate("Stockholm 2021 Challengers Patch Pack");
const STOCKHOLM_CONTENDERS = fromCrate("Stockholm 2021 Contenders Patch Pack");
const STOCKHOLM = [
  ...new Set([
    ...STOCKHOLM_LEGENDS,
    ...STOCKHOLM_CHALLENGERS,
    ...STOCKHOLM_CONTENDERS,
  ]),
];
const ALL_AGENT = [...new Set([...CSGO, ...METAL, ...ALYX, ...RIPTIDE])];

const map = {
  "All Agent Patches": ALL_AGENT,
  "CS:GO Patch Pack": CSGO,
  "Metal Skill Group Patch Collection": METAL,
  "Half-Life: Alyx Patch Pack": ALYX,
  "Operation Riptide Patch Collection": RIPTIDE,
  "Stockholm 2021 Legends Patch Pack": STOCKHOLM_LEGENDS,
  "Stockholm 2021 Challengers Patch Pack": STOCKHOLM_CHALLENGERS,
  "Stockholm 2021 Contenders Patch Pack": STOCKHOLM_CONTENDERS,
  "Stockholm 2021 Patches": STOCKHOLM,
};

const output = `(() => {
  const PATCH_GROUP_MAP = ${JSON.stringify(map, null, 2)};
  Object.assign(window.CS2ReactData || (window.CS2ReactData = {}), { PATCH_GROUP_MAP });
})();
`;

fs.writeFileSync(path.join(__dirname, "..", "react", "patch-group-map.js"), output);
console.log(
  Object.fromEntries(Object.entries(map).map(([key, value]) => [key, value.length]))
);
