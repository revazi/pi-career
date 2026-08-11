# Synthetic PDF fixtures

These files contain synthetic test data only and were not collected from a person or application. The two Chromium files were generated from [`chromium-source.html`](chromium-source.html) through Chromium DevTools Protocol `Page.printToPDF`. The ReportLab file was generated from [`reportlab-source.py`](reportlab-source.py). `image-only.pdf` is a minimal hand-built PDF 1.4 document containing one 1×1 RGB image XObject and no text object.

## Chromium generator coordinates

- Browser host: Brave Browser `150.1.92.138`
- Reported engine: Chrome `150.0.7871.101`
- PDF producer: `Skia/PDF m150`
- Tagged fixture options: `generateTaggedPDF: true`, `generateDocumentOutline: true`
- Untagged fixture options: `generateTaggedPDF: false`, `generateDocumentOutline: false`
- Both fixtures: `printBackground: true`, `preferCSSPageSize: true`

The Chromium source uses a CSS grid to create two visual columns.

## ReportLab generator coordinates

- Host interpreter: CPython `3.11.1` on macOS arm64
- Generator: `reportlab==4.4.10`, wheel `reportlab-4.4.10-py3-none-any.whl`, SHA-256 `5abc815746ae2bc44e7ff25db96814f921349ca814c992c7eac3c26029bf7c24`
- Import-only generator dependency: `pillow==11.1.0`, wheel `pillow-11.1.0-cp311-cp311-macosx_11_0_arm64.whl`, SHA-256 `96f82000e12f23e4f29346e42702b6ed9a2f2fea34a740dd5ffffcc8c539eb35`
- ReportLab wheel license: BSD-3-Clause, embedded license SHA-256 `ef831761646313921375fc2cb888e8eeaf7da213d0b92852c10c42f3a0b4d138`
- Pillow wheel license: MIT-CMU, embedded license SHA-256 `f576d3937d21161eac59b0b6f7807a2f5f30fe77d72abfe0d5b4d8e939b31288`
- Output options: PDF 1.4, two Letter pages, compressed content, `invariant=1`, no tags

The exact wheels were obtained from the canonical PyPI package files, installed with dependencies disabled into a temporary virtual environment, and were not retained. They are neither project dependencies nor part of package build, installation, or runtime behavior. With those exact coordinates, the checked-in source regenerated a byte-identical PDF during review.

## Embedded font

Both browser fixtures and the ReportLab fixture use Lato Regular from `ofl/lato/Lato-Regular.ttf` at Google Fonts commit `038b637da7b3fd956a4ed93ffc607c3d5e4ce172`; its SHA-256 is `d636e4683231f931eda222d588e944d082bfd3bdba02f928bee461c0f185b251`. The full font is not retained separately. Each searchable fixture contains only its generated subset. [`Lato-OFL.txt`](Lato-OFL.txt) is the license text from that commit with one trailing space normalized.

## Reviewed fixture hashes

| File | SHA-256 | Structure |
|---|---|---|
| `chromium-tagged.pdf` | `d2b37b5dcdcceeb7133ee7f4bee7a72654cea93fb3c1fe3c526dcc7e11e62ddb` | tagged, document outline, embedded Lato subset |
| `chromium-untagged.pdf` | `4dcdfbc200428d7b324e9d87dcaf1a3183e89d31298f1778b1645483565d5021` | untagged, embedded Lato subset |
| `reportlab-embedded-font.pdf` | `92a51829077a0b33628ca0a3ae0fcb49c125a4c39e42b271eacd31fb5d578d5d` | untagged, two pages, compressed content, embedded Lato subset |
| `image-only.pdf` | `10b506dc3659b9588496395d5c466c9b780fd11920165321fbb198d55cefc13a` | untagged, one image XObject, no text object |

Chromium writes creation timestamps, so regeneration of the Chromium files is not expected to reproduce their byte hashes. The ReportLab source enables invariant output and reproduced its reviewed hash exactly. Replacing any fixture requires reviewing its synthetic source, generator coordinates, embedded-font license where applicable, structure, extracted text, and new hash. Fixture generation is maintainer-only and is never part of package build, installation, or runtime behavior.
