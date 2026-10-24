# MandelGuessr canonical palette data

The generated RGB tables in `mandelbrot-palette-data.ts` are fixed project
assets. Rebuild them with `scripts/generate-mandelbrot-palettes.mjs` and the
named upstream files. Runtime interpolation is cyclic, byte-encoded sRGB
interpolation; the tables are not gamma-corrected or otherwise modified.

## CLASSIC (`classic-v2-upr-serialized-phase`)

- Source: Wolfgang Beyer's *Mandel zoom 00 Mandelbrot set* Ultra Fractal 3 UPR.
- Controls: `(28, 6555392)`, `(92, 13331232)`, `(196, 16777197)`,
  `(285, 43775)`, `(371, 3146289)`, `smooth=yes`, `rotation=29`.
- Construction: 400 cyclic samples, Windows COLORREF byte order, and cyclic
  shape-preserving cubic interpolation at the serialized control indices.
  The UPR's separate `rotation=29` editor state is recorded for provenance but
  is not applied again: doing so double-shifts the exported image's phase.
- Verification: the interpolation family was selected by comparison with the
  published reference JPEG. Ultra Fractal's proprietary interpolation details
  are not published, so this is a documented best reproduction rather than a
  claim of byte-identical Ultra Fractal output.
- Re-run the reference comparison with `scripts/verify-classic-reference.mjs`,
  a local Sharp module entry point, and the original Wikimedia JPEG. It reports
  the corrected built-in Log mapping at the serialized UPR phase.
- Reference license: CC BY-SA 3.0 and GFDL; credit Wolfgang Beyer.
- Source URL: https://commons.wikimedia.org/wiki/File:Mandel_zoom_00_mandelbrot_set.jpg
- The social preview `public/og.png` is computed with this palette and a title overlay.

## RETRO (`fractint-default-map-32-55-v1`)

- Source: Fractint 20.4.10 `maps/default.map`, entries 32 through 55 only.
- Project: The Stone Soup Group, Fractint.
- Fractint is distributed under its own copyright/distribution notice rather
  than an OSI license. This table records the 24 historical VGA RGB facts and
  does not vendor Fractint code or the full palette.
- Source URL: https://sources.debian.org/data/non-free/x/xfractint/20.4.10-5/maps/default.map
- Notice URL: https://sources.debian.org/src/xfractint/20.4.10-5/fractsrc.txt

## SCIENTIFIC (`scientific-colour-maps-8.0.1-romao`)

- Source: Fabio Crameri, Scientific Colour Maps 8.0.1, `romaO`, 256 RGB rows.
- License: MIT. Copyright (c) Fabio Crameri.
- Canonical release: https://zenodo.org/records/8409685
- Project and usage guide: https://www.fabiocrameri.ch/colourmaps/
- The checked integer table is mirrored by the MIT-licensed ForColormap v8.0.1
  translation; it is copied as data and not regenerated from sparse controls.

## MONOCHROME and SPECTRUM

- Source: Peter Kovesi, ColorCET integer CSV distribution, `CET-C5.csv` and
  `CET-C6.csv`, 256 RGB rows each.
- License: Creative Commons Attribution 4.0 International (CC BY 4.0).
- Attribution: Peter Kovesi, *Good Colour Maps: How to Design Them*.
- Source: https://colorcet.com/download/index.html
- License: https://creativecommons.org/licenses/by/4.0/

## Source-file checksums used for this revision

- Fractint `default.map`: `974ab3dcc630f2bc146ca1a70004b3454b720c98b4427fa244db5bd094be1104`
- ForColormap v8.0.1 scientific source: `3f069d2345af392f401bcff1eafef78c2c8654e5b2d9796a750cdfd81395c8dd`
- ColorCET `CET-C5.csv`: `9438202120d1a79aa9eafbb1fb90606d8b67838bfa8ee9774f5cb8f4e52fa119`
- ColorCET `CET-C6.csv`: `4af0c64ea15a49872d96a4fbb67e838499d5db809fd3aa1b732be6018ff2d03d`
