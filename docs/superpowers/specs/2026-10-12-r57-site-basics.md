# R57 — description, sharing preview, 404 page and the link check

**Date:** 2026-10-12 · **Status:** the user's request ("moze, uradi to") after a review of a generic website launch list. · **Release:** `2.0.0-alpha.84`.

## Scope

From the user's list of twenty launch items, these four apply to Dailo:

- meta descriptions;
- social sharing previews;
- a custom 404 page;
- a broken-link check.

The rest either exists already or does not apply to an app without a marketing site:

- **Exists:** the privacy and terms pages, the favicon, the phone layout and accessibility.
- **Does not apply:** analytics and a cookie banner (Dailo has neither tracking nor cookies). The same goes for robots.txt, sitemap.xml and canonical URLs, a call to action and an FAQ. Those belong to a separate landing page, if the user wants one.

## The change

- **Description and preview:** `index.html`, `privatnost.html`, `uslovi.html` and `uputstvo.html` each get:
  - `<meta name="description">` of 50–160 characters;
  - the Open Graph set: type, site name, `sr_RS` locale, title, the same description, the page's address on `https://marko-ivapix.github.io/dailo/`, the image with its size and alt text;
  - `twitter:card` `summary_large_image`.

  The app still sets its own page titles per screen.
- **`icons/og-image.png`:**
  - 1200×630 and about 37 KB.
  - It shows the rounded blue tile, "Dailo", "Zadaci, navike, ciljevi i dnevnik na jednom mestu." and "Radi i bez interneta" on the dark background.
  - `python3 tools/generate-icons.py --og` draws it in the vendored Space Grotesk and Geist. Only the Latin subsets are used, so the lines avoid č ć đ š ž.
  - It is not precached; the app never loads it.
- **`404.html`:** GitHub Pages serves it for any missing address under `/dailo/`, at any depth.
  - **Base:** `<base href="/dailo/">` keeps its links working from any depth.
  - **Indexing:** `noindex`, so search engines skip it.
  - **Content:** a Serbian "Stranica nije pronađena", "Otvori Dailo", and links to Uputstvo, Politika privatnosti and Uslovi korišćenja.
  - **Constraints:** no script, and it is not part of the offline app. The service worker only answers navigations to the app's own pages, so other addresses reach this page.
- **`tools/check-links.mjs`** (`npm run check:links`):
  - **Internal check, no network:**
    - Every `href`/`src` in the public pages and 404 must exist, with its `#anchor`. A `<base href="/…/">` resolves from the site root.
    - The manifest's paths must exist.
    - Every page the app names (`'….html'`) must exist.
    - Every own-site address (`https://marko-ivapix.github.io/dailo/…`) must exist in the repository, since it goes live with the commit.
    - `javascript:` links are reported.
  - **External check (`--external`):** every outside address in the pages, the manifest and `js/*.js` must answer. These are the starter examples' resources and the review's source.
    - The own site and the Supabase host are left out.
    - Each address is fetched with GET, with one retry.
    - 404 and 410 fail. 403, 429, 5xx and network errors only warn, since sites refuse robots or are briefly down.
- **CI:**
  - The Node suite runs the internal check on every push (`tests/site-r57.test.js`).
  - `.github/workflows/links.yml` runs the external check when the pages, `js/` or the manifest change, every Monday, and on demand. The cloud session's network cannot reach outside sites, so the first external result comes from GitHub.
- **`tests/offline-v1-9.test.js`:** the "no absolute URL in `index.html`" rule now also skips the `og:` tags, which other sites read and the app never loads.

## Checks

- **Node:** `tests/site-r57.test.js`, written first; it failed 6/6. It covers:
  - the tags on all four pages and the image's size;
  - the 404 page;
  - the internal check on the repository (no problems) and on a planted page (missing file, anchor, image, own-site address, `javascript:`);
  - collection and classification of outside links, with a retried network error;
  - the script, the workflow and the version.
- **Manual-pending:**
  - **The preview in a messenger:** paste the link into Viber, WhatsApp or Slack after the merge.
  - **The 404 page:** open a missing address on GitHub Pages.
  - **The first external run:** the result of the `Links` workflow.
