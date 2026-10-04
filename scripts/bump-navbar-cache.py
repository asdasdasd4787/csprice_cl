import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
NEW_NAV = "20260622-navbar-unify-1"
NEW_INDEX = "20260622-landing-1"

for path in sorted(ROOT.glob("*.html")):
    if path.name.startswith("tmp_"):
        continue
    text = path.read_text(encoding="utf-8")
    new = text
    new = re.sub(
        r"shared-components\.build\.js\?v=[^\"']+",
        f"shared-components.build.js?v={NEW_NAV}",
        new,
    )
    new = re.sub(
        r"shared-data\.js\?v=[^\"']+",
        f"shared-data.js?v={NEW_NAV}",
        new,
    )
    new = re.sub(
        r"index\.css\?v=20260620[^\"']+",
        f"index.css?v={NEW_INDEX}",
        new,
    )
    if new != text:
        path.write_text(new, encoding="utf-8")
        print("updated", path.name)

print("done")
