---
description: Use when the user wants to add bottles from a label photo, a receipt, a list, or a text description.
---

# Identify a wine and add it

1. **Read the label.** Read both sides if you have them. The front usually has the producer, cuvée, and vintage. The back usually has the appellation, ABV, importer, and sometimes the grapes. Extract:
   - producer, exactly as printed (keep abbreviations like "Ch." or "Dom.")
   - cuvée (the wine name without the producer; empty if there is none)
   - vintage year, or "NV" if the label says so
   - color and style (still, sparkling, fortified, sweet)
   - appellation, country, region, ABV, grapes, and bottle size if printed

   If the vintage isn't visible, ask for it. Don't guess.

2. **Search.** Call `search_catalog` with `producer`, `wine`, `year`, and, when you have them, `appellation` and `color`.

3. **Decide from the candidates.** Read `score` and `reasons`:
   - **Existing vintage.** The top candidate has a `vintageId`, a score of about 0.9 or more, and "vintage exists". Add bottles with `producer: { id }`, `wine: { id }`, and `vintage: { id }`.
   - **New vintage of an existing wine.** The top candidate matches the producer and cuvée but says "vintage missing". Pass `producer: { id }`, `wine: { id }`, and `vintage: { year }`.
   - **New wine from an existing producer.** The producer matches well, but no cuvée scores above about 0.7. Pass `producer: { id }` and the new wine's fields.
   - **New producer.** No candidate's producer scores above about 0.7. Pass the new producer's fields.
   - **Too close to call.** Two candidates are within about 0.05 of each other, or the best is between 0.6 and 0.85. Show both to the user and ask which one it is.

4. **Learn from corrections.** If the user says a match is wrong and picks another entry, call `record_alias` with the label's spelling, the chosen target, and `source: "correction"`. The next search will then match it exactly.

5. **Commit.** Call `add_bottles` once with the quantity, size, location, and purchase details. Derive `ingestKey` from the input so a retry is safe:
   - photo: `photo:<hash or file id>`
   - receipt: `receipt:<merchant>|<date>|<line number>`
   - text: `text:<producer>|<wine>|<year>|<today's date>|<quantity>`

   If the result says `replayed`, those bottles already exist. Don't add them again.

6. **Enrich, labeled.** If you know a drink window or other detail the label doesn't show, call `update_vintage` or `update_wine` with `source: "agent"`. A window the user or an import set always wins.

7. **Report.** Name the producer, wine, and year, the number of bottles, where they went, and whether each entry was matched or newly created.
