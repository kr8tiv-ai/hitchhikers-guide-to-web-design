# Self-hosted type

No font CDN. `type.css` loads these files with `font-display: swap`. Only the weights the comps use are shipped. Each file is a static instance of the upstream variable font, subset to Latin-1 plus punctuation, with `kern`, `liga`, `calt`, `locl`, and `ccmp`.

## Bricolage Grotesque

Display and UI. Designer Mathieu Triay. Friendly, slightly uneven, confident at large sizes, which is the Don't Panic wordmark without a comic face or a book-cover clone.

- Copyright 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage)
- Name-table version: `Version 1.001;gftools[0.9.33.dev8+g029e19f]`
- google/fonts commit: `b9f6c712059d72742282ebdf06eadfc264c827f3` (2023-07-19)
- Upstream commit named in METADATA.pb: `84745e5b96261ae5f8c6c856e262fe78d1d6efdd`
- Licence: SIL Open Font License 1.1, full text in `BricolageGrotesque-OFL.txt`
- Axes on the variable source: opsz 12–96, wdth 75–100, wght 200–800

| File | Use |
| --- | --- |
| `BricolageGrotesque-opsz96-wght800.woff2` | Display, wordmark source, headlines |
| `BricolageGrotesque-opsz16-wght600.woff2` | Kickers, buttons, status, table labels |

## Literata

Text. TypeTogether. A reading serif for the long interview, distinct from the display grotesque.

- Copyright 2017 The Literata Project Authors (https://github.com/googlefonts/literata)
- Name-table version: `Version 3.103;gftools[0.9.29]`
- google/fonts commit: `c8018e986708f2aed63c928b1e9026826da1553d` (2023-05-19)
- Upstream commit named in METADATA.pb: `0c2761b727a1b3a7cffd313c37f0f5163dfc7a63`
- OFL text commit: `62dc5cc4728c30fd5bbf7edb5f54364634ad78e7`
- Licence: SIL Open Font License 1.1, full text in `Literata-OFL.txt`
- Axes on the variable source: opsz 7–72, wght 200–900

| File | Use |
| --- | --- |
| `Literata-opsz16-wght400.woff2` | Body |
| `Literata-opsz16-wght600.woff2` | Emphasis in running text |
| `Literata-Italic-opsz16-wght400.woff2` | The visitor's lines, and the brand-kit dek |

Instances were cut with `fontTools.varLib.instancer.instantiateVariableFont(..., updateFontNames=False)`. Bricolage's STAT table has no opsz 16 record, so `updateFontNames=True` throws. CSS `@font-face` sets the family names.
