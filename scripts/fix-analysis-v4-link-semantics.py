from pathlib import Path

path = Path("app/analysis/analysis-client.tsx")
text = path.read_text()
old_list = '<div className={styles.breakdown} role="list">'
new_list = '<div className={styles.breakdown}>'
old_link = '<Link href={item.href ?? periodHref(snapshot)} key={`${item.id ?? "none"}-${item.name}`} className={styles.breakdownRow} role="listitem">'
new_link = '<Link href={item.href ?? periodHref(snapshot)} key={`${item.id ?? "none"}-${item.name}`} className={styles.breakdownRow}>'
if text.count(old_list) != 1:
    raise SystemExit("breakdown list anchor changed")
if text.count(old_link) != 1:
    raise SystemExit("category link anchor changed")
text = text.replace(old_list, new_list, 1).replace(old_link, new_link, 1)
path.write_text(text)
