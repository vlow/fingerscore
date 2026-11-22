# Glyph sources

Every music glyph the app draws comes from Bravura, the SMuFL reference font by Steinberg, licensed under the SIL Open Font License 1.1. The licence text ships in `licenses/Bravura-OFL.txt`, because the OFL requires it to accompany the outlines.

The outlines live in `src/data/glyphs.json` and render through `src/render/Glyph.tsx`. The app never loads the font at runtime.

## Regenerate

```sh
npm install
npm run glyphs        # tsx scripts/extract-glyphs.ts
```

`scripts/extract-glyphs.ts` reads `files/bravura-latin-400-normal.woff` from the devDependency `@fontsource/bravura` with `opentype.js` (also a devDependency). It writes `paths`, `bbox` (ink box), `advance` and `placement` for each glyph. It exits with an error if a code point maps to `.notdef` or an empty outline. No file is downloaded outside npm.

## Glyphs

| App name | SMuFL name | Code point |
|---|---|---|
| `trebleClef` | gClef | U+E050 |
| `flat` | accidentalFlat | U+E260 |
| `natural` | accidentalNatural | U+E261 |
| `sharp` | accidentalSharp | U+E262 |
| `restWhole` | restWhole | U+E4E3 |
| `restHalf` | restHalf | U+E4E4 |
| `restQuarter` | restQuarter | U+E4E5 |
| `restEighth` | rest8th | U+E4E6 |
| `restSixteenth` | rest16th | U+E4E7 |
| `digit0` … `digit9` | timeSig0 … timeSig9 | U+E080 … U+E089 |

Units: 1000 per em, y up, one staff space = 250 units.

## Placement

One transform for every glyph: `translate(x, y) scale(0.04, -0.04)`, since one staff space is 10px. The glyph origin sits on a staff position, per the SMuFL registration. `B` is the y of the bottom staff line.

| Glyph | Origin y | Origin x |
|---|---|---|
| `trebleClef` | G line, `B - 10` | 4 (`HEADER.clefInset`) |
| `flat`, `sharp`, `natural` | notehead centre | right ink edge 9px left of the notehead centre |
| key-signature accidentals | line or space of the accidental | `34 + 11k` |
| `restWhole` | 4th line, `B - 30` (hangs from it) | ink centred on the event x |
| `restHalf` | middle line, `B - 20` (sits on it) | ink centred on the event x |
| `restQuarter`, `restEighth`, `restSixteenth` | middle line, `B - 20` | ink centred on the event x |
| time-signature numerator | 4th line, `B - 30` | number's ink centred on the slot |
| time-signature denominator | 2nd line, `B - 10` | number's ink centred on the slot |

Bravura digits are two staff spaces tall and vertically centred on their origin, so the numerator fills the upper half of the staff and the denominator the lower half. `Glyph` adds the origin offset itself: callers pass the bottom staff line for clef and rests and the note y for accidentals. `src/render/Glyph.test.tsx` checks the resulting pixel boxes.
