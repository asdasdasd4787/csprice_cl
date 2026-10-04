const paintIndex = "745";
const weapon = "weapon_ak47";
const base = `https://assets.cs.money/3d/assets/${weapon}/materials/${paintIndex}`;

const candidates = [
  `${base}/normal.png`,
  `${base}/color.png`,
  `${base}/albedo.png`,
  `${base}/diffuse.png`,
  `${base}/basecolor.png`,
  `${base}/orm.png`,
  `https://assets.cs.money/3d/assets/${weapon}/materials/${paintIndex}/color.png`,
];

async function head(url) {
  const response = await fetch(url, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0" } });
  console.log(`${response.status} ${response.headers.get("content-length") || ""} ${url}`);
}

(async () => {
  for (const url of candidates) {
    await head(url);
  }
})();
