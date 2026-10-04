const fs = require("fs");
const bump = "20260625-weapon-equip-icons-1";

fs.readdirSync(".").forEach((file) => {
  if (!file.endsWith(".html") || file.startsWith("tmp_")) return;
  let content = fs.readFileSync(file, "utf8");
  const next = content
    .replace(/shared-components\.build\.js\?v=[^"']+/g, `shared-components.build.js?v=${bump}`)
    .replace(/index\.css\?v=[^"']+/g, `index.css?v=${bump}`);
  if (next !== content) {
    fs.writeFileSync(file, next);
    console.log("updated", file);
  }
});
