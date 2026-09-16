from pathlib import Path

path = Path("app/analysis/analysis-client.tsx")
text = path.read_text()
anchor = "      setCategoriesExpanded(false);\n"
if text.count(anchor) != 1:
    raise SystemExit("residual categories reset anchor changed")
path.write_text(text.replace(anchor, "", 1))
