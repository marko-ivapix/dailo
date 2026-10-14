# R69 — the user's Bucket list in the examples

**Date:** 2026-10-13 · **Status:** the user asked for "listu za bucket list od 50 do 100 stavki, pa cu ja da izbacim sta ne treba". From the proposed 89 they removed items 3, 4, 6, 11, 35, 47, 52 and 82 and reworded two: "9 neka bude samo da vidim pustinju, 51 bez ovog 'u divljini'". · **Release:** `2.0.0-alpha.96`.

## The change

- **The list:** the "Bucket lista" project of "Popuni primerima" (`js/starter-examples.js`) now holds the 81 kept items, in the order of the list. There are 14 in travel, 13 in Serbia and the Balkans, 6 on the motorcycle, 10 in adrenaline, 5 in nature, 7 in health and challenges, 9 in learning, 5 in food and 12 in life.
- **Removed:** Iceland, the Norwegian fjords, Machu Picchu, New Zealand, Nordkapp by motorcycle, Kilimanjaro, a night under the stars without a tent, and a trip with the parents.
- **Reworded:** "Vidi pustinju" (was a night in the desert) and "Nekoliko dana kampovanja sam" (without "u divljini").
- **Plain items:** the dreams have no dates, months or tags.
- **Earlier dreams:**
  - The nine dreams from R67 keep their sample keys, so a workspace that already has them gets only the new ones.
  - Two of them read as in the proposed list: "Obiđi svih pet nacionalnih parkova Srbije" and "Nauči da roniš (sa sertifikatom)". Their old catalog entries left.
- **Unchanged:** "Muzički instrument" stays in Za učenje, and "Nauči da sviraš instrument" is a dream. The user kept both.

## Checks

- **Node:** `tests/bucket-list-r69.test.js` was written first; 4 of its 5 tests failed. It covers:
  - the 81 titles in order;
  - the removed and reworded items;
  - an earlier copy counted by its key;
  - the Serbian names;
  - the version.
- **R67:** `tests/own-examples-r67.test.js` now expects 81 dreams and 108 tasks in the toast, with an R69 comment.
- **Suites:**
  - `npm run verify`: 1234/1234.
  - `npm run smoke`: OK.
  - `npm run check:python`: 4/4.
  - `npm run check:links`: OK.
- **Manual-pending:** "Popuni primerima" on the phone, then Bucket lista.
