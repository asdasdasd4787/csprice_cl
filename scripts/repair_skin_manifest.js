const fs = require("fs");
const path = require("path");

const manifestPath = path.join(__dirname, "..", "assets", "models", "skins", "manifest.json");
const lines = fs.readFileSync(manifestPath, "utf8").split(/\r?\n/);
let repaired = 0;

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (!line.includes('"market_name"')) {
    continue;
  }

  const match = line.match(/"market_name"\s*:\s*"(.*)"\s*,?\s*$/);
  const value = match ? match[1] : "";
  if (line.length <= 240 && value.length <= 160) {
    continue;
  }

  let finishToken = "";
  for (let look = index + 1; look < Math.min(index + 6, lines.length); look += 1) {
    const tokenMatch = lines[look].match(/"finish_token"\s*:\s*"([^"]+)"/);
    if (tokenMatch) {
      finishToken = tokenMatch[1];
      break;
    }
  }

  const fallbackNames = {
    hy_webs: "CZ75-Auto | Crimson Web",
  };
  const replacement = fallbackNames[finishToken] || "Unknown Skin";
  lines[index] = `      "market_name": "${replacement}",`;
  repaired += 1;
  console.log(`Repaired oversized market_name for finish_token=${finishToken || "unknown"}`);
}

const output = lines.join("\n");
JSON.parse(output);
fs.writeFileSync(manifestPath, `${output}\n`, "utf8");
console.log(`Manifest repaired (${repaired} entries). Size: ${(fs.statSync(manifestPath).size / 1024).toFixed(1)} KB`);
