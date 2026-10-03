import json
from pathlib import Path

for name in ["package.json", "package-lock.json"]:
    path = Path(name)
    data = json.loads(path.read_text())
    data["version"] = "10.0.70"
    if name == "package-lock.json":
        packages = data.setdefault("packages", {})
        root = packages.setdefault("", {})
        root["version"] = "10.0.70"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

Path('scripts/rel070-bump-version.py').unlink()
