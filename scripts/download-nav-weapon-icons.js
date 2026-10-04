const fs = require("fs");
const path = require("path");
const https = require("https");

const OUT_DIR = path.join(__dirname, "..", "assets", "nav", "weapons");

// Noun Project icons (CC BY — attribution in assets/nav/ATTRIBUTION.txt)
const ICONS = {
  pistols: { id: 356723, url: "https://thenounproject.com/icon/handgun-356723/" },
  smgs: { id: 8384490, url: "https://thenounproject.com/icon/submachine-gun-8384490/" },
  shotguns: { id: 6734669, url: "https://thenounproject.com/icon/shotgun-6734669/" },
  lmgs: { id: 8270592, url: "https://thenounproject.com/icon/machine-gun-8270592/" },
  rifles: { id: 8332161, url: "https://thenounproject.com/icon/assault-rifle-8332161/" },
  knives: { id: 447762, url: "https://thenounproject.com/icon/bayonet-m9-knife-447762/" },
  gloves: { id: 6983165, url: "https://thenounproject.com/icon/safety-gloves-6983165/" },
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "CS2PriceTracker/1.0" } }, (response) => {
        if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          download(response.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`HTTP ${response.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          fs.writeFileSync(dest, Buffer.concat(chunks));
          resolve(dest);
        });
      })
      .on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const [key, meta] of Object.entries(ICONS)) {
    const pngUrl = `https://static.thenounproject.com/png/${meta.id}-200.png`;
    const dest = path.join(OUT_DIR, `${key}.png`);
    await download(pngUrl, dest);
    console.log(`saved ${key}.png (${fs.statSync(dest).size} bytes)`);
  }

  const attribution = `# Navbar weapon icons (Noun Project)

Icons downloaded from https://thenounproject.com/ under Creative Commons Attribution.

| File | Noun Project |
|------|----------------|
| pistols.png | Handgun (#356723) — https://thenounproject.com/icon/handgun-356723/ |
| smgs.png | Submachine gun (#8384490) — https://thenounproject.com/icon/submachine-gun-8384490/ |
| shotguns.png | Shotgun (#6734669) — https://thenounproject.com/icon/shotgun-6734669/ |
| lmgs.png | Machine gun (#8270592) — https://thenounproject.com/icon/machine-gun-8270592/ |
| rifles.png | Assault rifle (#8332161) — https://thenounproject.com/icon/assault-rifle-8332161/ |
| knives.png | Bayonet M9 knife (#447762) — https://thenounproject.com/icon/bayonet-m9-knife-447762/ |
| gloves.png | Safety gloves (#6983165) — https://thenounproject.com/icon/safety-gloves-6983165/ |
`;

  fs.writeFileSync(path.join(__dirname, "..", "assets", "nav", "ATTRIBUTION.txt"), attribution);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
