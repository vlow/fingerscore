# Glyph sources

Notation glyphs live in `src/data/glyphs.json` (`paths`, font units 1000/em, y up) and render through `src/render/Glyph.tsx`.

## Extracted from GNU FreeSerif

`trebleClef`, `flat`, `sharp`, `natural`, `restWhole`, `restHalf`, `restQuarter`, `restEighth`.
Source: GNU FreeFont, GPL with font exception (credit it in the About page). Extraction tool: fontTools `SVGPathPen` over the glyph set, one path per glyph. The font is not committed.

## `restSixteenth` (composed, not extracted)

The font was not downloaded. The glyph is the `restEighth` path plus a copy of it shifted down-left by one staff space. One staff space is 10px, which is 214 font units at the rest transform's scale (0.0467). Shift: dx = -214, dy = -214 (y up). Every coordinate of the second subpath is offset by that amount; the two subpaths share the common rest transform.

## Time-signature digits (no glyph paths)

Digits are SVG `<text>`, not paths. `TimeSigDigits` in `src/render/Glyph.tsx` draws them with:

- `font-family: "Times New Roman", Times, "Nimbus Roman", serif; font-weight: 700`
- font size 30px, which gives a digit height of about 20px (two staff spaces)
- upper digit baseline on the middle staff line, lower digit baseline on the bottom line
- `y` = bottom staff line, `x` = centre

`GlyphName` has no `digit*` members and `glyphs.json` has no digit paths.

## Open item

Exact FreeSerif outlines for the sixteenth rest (U+1D13F) and the digits 2, 3, 4, 6, 8 are not extracted. Doing so needs the owner's permission to download the font. Planned steps once granted:

1. Download `FreeSerif.otf` from the GNU FreeFont release to a fresh, empty directory outside the repo.
2. Run, with `python3 -I`: fontTools `TTFont`, `font.getGlyphSet()`, `SVGPathPen`, for the glyphs above.
3. Replace `restSixteenth` in `glyphs.json`, add `digit2`..`digit8`, scale digits to 20px tall, and swap `TimeSigDigits` to paths.
