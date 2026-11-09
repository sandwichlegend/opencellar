---
description: Use when the user asks to clean up the catalog, find duplicates, or merge entries.
---

# Clean up the catalog

1. Call `find_duplicates`. Start at the default threshold. Lower it to 0.7 only if the user asks for a deeper pass.
2. For each pair, call `get_wine` or `list_cellar` as needed to see what each side holds.
3. Propose merges in a short list. For each one, give the entry to keep, the entry to fold in, and why. Prefer to keep the entry with the correct accented spelling, the most bottles, or the richer data.
4. Some pairs are not duplicates, such as two cuvées with similar names. Say so and leave them alone.
5. Call `merge` only for pairs the user approves. The tool also asks for approval. After each merge, report what moved from the summary.
6. The merged name becomes an alias automatically, so future label scans still match. Don't record it again.
