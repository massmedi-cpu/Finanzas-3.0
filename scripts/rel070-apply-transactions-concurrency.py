from pathlib import Path

path = Path('app/transactions/transactions-client.tsx')
text = path.read_text()
old = '''  const fetchPage = useCallback(async (filters: Filters, cursor: Cursor | null, append: boolean) => {
    const replaceEpochAtStart = replaceRequestSequence.current;'''
new = '''  const fetchPage = useCallback(async (filters: Filters, cursor: Cursor | null, append: boolean) => {
    if (append && replaceAbortController.current) return;

    const replaceEpochAtStart = replaceRequestSequence.current;'''
if old not in text:
    raise SystemExit('REL-070 append guard anchor not found')
path.write_text(text.replace(old, new, 1))
Path('scripts/rel070-apply-transactions-concurrency.py').unlink()
