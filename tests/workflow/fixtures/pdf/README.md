# Synthetic Chromium PDF fixtures

These files contain synthetic test data only and were not collected from a person or application. The two Chromium files were generated from [`chromium-source.html`](chromium-source.html) through Chromium DevTools Protocol `Page.printToPDF`. `image-only.pdf` is a minimal hand-built PDF 1.4 document containing one 1×1 RGB image XObject and no text object.

## Generator coordinates

- Browser host: Brave Browser `150.1.92.138`
- Reported engine: Chrome `150.0.7871.101`
- PDF producer: `Skia/PDF m150`
- Tagged fixture options: `generateTaggedPDF: true`, `generateDocumentOutline: true`
- Untagged fixture options: `generateTaggedPDF: false`, `generateDocumentOutline: false`
- Both fixtures: `printBackground: true`, `preferCSSPageSize: true`

The source uses a CSS grid to create two visual columns. Lato Regular was loaded from a local copy of `ofl/lato/Lato-Regular.ttf` at Google Fonts commit `038b637da7b3fd956a4ed93ffc607c3d5e4ce172`; its SHA-256 is `d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251`. The font is not retained separately. Each PDF contains only the subset embedded by Chromium. [`Lato-OFL.txt`](Lato-OFL.txt) is the license text from that commit with one trailing space normalized.

## Reviewed fixture hashes

| File | SHA-256 | Structure |
|---|---|---|
| `chromium-tagged.pdf` | `d2b37b5dcdcceeb7133ee7f4bee7a72654cea93fb3c1fe3c526dcc7e11e62ddb` | tagged, document outline, embedded Lato subset |
| `chromium-untagged.pdf` | `4dcdfbc200428d7b324e9d87dcaf1a3183e89d31298f1778b1645483565d5021` | untagged, embedded Lato subset |
| `image-only.pdf` | `10b506dc3659b9588496395d5c466c9b780fd11920165321fbb198d55cefc13a` | untagged, one image XObject, no text object |

Chromium writes creation timestamps, so regeneration of the Chromium files is not expected to reproduce these byte hashes. Replacing either fixture requires reviewing its synthetic source, generator coordinates, embedded-font license, structure, extracted text, and new hash. Fixture generation is maintainer-only and is never part of package build, installation, or runtime behavior.
