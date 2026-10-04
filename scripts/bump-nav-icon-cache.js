const fs = require("fs");

fs.readdirSync(".").forEach((file) => {
  if (!file.endsWith(".html") || file.startsWith("tmp_")) return;
  let content = fs.readFileSync(file, "utf8");
  const next = content
    .replace(/shared-data\.js\?v=[^"']+/g, "shared-data.js?v=20260625-nav-icons-1")
    .replace(/shared-components\.build\.js\?v=[^"']+/g, "shared-components.build.js?v=20260625-nav-icons-1")
    .replace(/index\.css\?v=20260625-profile-compact-1/g, "index.css?v=20260625-nav-icons-1");
  if (next !== content) {
    fs.writeFileSync(file, next);
    console.log("updated", file);
  }
});
