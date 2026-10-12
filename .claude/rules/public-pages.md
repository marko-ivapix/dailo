---
paths:
  - "privatnost.html"
  - "uslovi.html"
  - "uputstvo.html"
  - "404.html"
  - "docs/beta/**"
  - "docs/v2/**"
---
# Public pages and user guides (Serbian)

- These pages are Serbian (Latin script) and address the reader informally ("ti").
- **Legal text:** `privatnost.html` and `uslovi.html` change only with the user's approval. Facts such as the data controller, the address and ages come from the user. Update the date at the top when the text changes.
- **Head tags:** each public page keeps a meta description (50–160 characters) and the Open Graph set (`tests/site-r57.test.js`). `404.html` keeps `<base href="/dailo/">`, `noindex` and no script.
- Links must pass `npm run check:links`. Outside links are checked by `.github/workflows/links.yml`.
