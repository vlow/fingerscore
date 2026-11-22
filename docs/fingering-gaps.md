# Fingering gaps

Written pitches inside an instrument's range (`lo`..`ext`) that have no fingering entry in `src/data/fingerings.json`. The machine-readable list is `src/data/fingering-gaps.json`; keep both in sync. The app shows no chart for these notes.

Every entry in the tables is printed by at least two independent charts (see `meta` in `fingerings.json` for titles, URLs and access dates). Where the charts print no common fingering, the pitch stays empty and is listed here. An empty array in `overrides[instId][pitch]` hides the kind table's entry for one instrument; an empty array in `tables.recGerman` means no sourced German fingering.

## Summary

| Kind | Sources | Notes with a fingering | Alternates | Gaps | Reviewed |
|---|---|---|---|---|---|
| Xaphoon | official Xaphoon chart; "The Water Is Wide" songbook page | 25 (C4–C6) | 0 | 0 | no |
| Saxophone | WFG saxophone charts; Sax Teacher UK saxophone and altissimo charts | 39 (B♭3–C7, alto altissimo; soprano, tenor, baritone altissimo via overrides) | 13 | 3 (all altissimo) | no |
| Clarinet | WFG Boehm clarinet charts; Tomplay clarinet chart; Sax Teacher UK clarinet chart | 45 (E3–C7) | 8 | 0 | no |
| Flute, piccolo, alto flute | WFG flute and piccolo chart; Tomplay flute chart; Sax Teacher UK flute chart; flutetunes.com (sizes) | 37 (C4–C7) | 2 | 0 | no |
| Recorder (baroque) | WFG recorder charts; Dolmetsch Online text chart; Tomplay recorder chart | 30 of 32 table indices | 1 | 5 (1 inside the normal range: alto E♭6) | no |
| Recorder (German) | WFG recorder chart; Wikipedia citing Rowland-Jones and Linde | 1 note differs from baroque (F) | 0 | 4 German notes without a second source | no |

## Open gaps

Inside the normal range (`lo`..`hi`):

- **Alto recorder: written 87 (E♭6, table index 22).** WFG prints 1 2 | 4 5 6 (thumb pinched), Dolmetsch 1 2 | 5 6, Tomplay's alto chart 1 2 | 5 6 + half 7. No two agree. The soprano entry at the same index (B♭) is printed by the WFG and Tomplay's soprano chart. Needs an owner decision or a further chart.

Extended range (`hi+1`..`ext`):

- Soprano sax: written 94 (B♭6, altissimo). Checked: WFG saxophone charts, Sax Teacher UK soprano altissimo chart. No fingering appears in both.
- Tenor sax: written 95 (B6, altissimo). Checked: WFG saxophone charts, Sax Teacher UK tenor altissimo chart. No fingering appears in both.
- Baritone sax: written 95 (B6, altissimo). Checked: WFG saxophone charts, Sax Teacher UK baritone altissimo chart. No fingering appears in both.
- Soprano recorder: written 87 and 88 (D♯ and E, table indices 27 and 28). WFG half-holes hole 6, Dolmetsch closes it; Tomplay stops at index 26.
- Alto recorder: written 92 and 93 (G♯ and A, table indices 27 and 28). Same disagreement as the soprano.

German recorder fingering (no chart shown; not in `fingering-gaps.json` because the baroque table has data there):

- Table indices 6, 8, 17 and 18 (soprano F♯, G♯, upper F, upper F♯; alto B, C♯, upper B♭, upper B). The WFG prints German fingerings for them (T 1 2 3 | – 5 6 7, T 1 2 – | 4 5 – –, t 1 2 3 | 4 – – –, t 1 2 3 | – 5 – 7), but no second chart with German fingerings could be read: Dolmetsch's text chart is baroque only, and Tomplay offers German only as a PDF.

## Xaphoon: source differences

Sources: the official Xaphoon fingering chart (C4–C6) and the songbook page "The Water Is Wide" (notes and fingerings for C4, D4, E4, F4, G4, A4, B♭4, C5).

Every fingering the songbook page prints (C4, D4, E4, F4, G4, A4, B♭4, C5) matches the official chart. The songbook does not show C♯4, E♭4, F♯4, G♯4, B4 or anything above C5.

## Xaphoon: chart notes

- F♯5 carries an asterisk on the official chart, but the chart prints no footnote for it. The chart prints the same holes for F♯5 and G5 (top hole open, everything else closed). The table follows the chart; a Xaphoon player should confirm.
- G♯4: the thumb dot is partly covered by the neighbouring photo on the chart. The visible part is solid, so the table records the thumb as closed.

## Saxophone: source differences

Sources: The Woodwind Fingering Guide saxophone charts (basic first and second octave; alternate second octave, lower and middle altissimo) and the Sax Teacher UK saxophone chart with its alto, tenor, baritone and soprano altissimo charts. Both charts agree on every standard fingering from B♭3 to F♯6 and on the named alternates entered (B♭: side, bis, 1 + 1, 1 + 2; C: side C; F♯: alternate F♯ key; E6 and F6: front F; F♯6: front F without the high F♯ key).

- Low B♭, B and C♯: both charts print the right-pinky low C key as pressed together with the left-pinky key. The table follows them.
- B♭: both charts name the side B♭ fingering (1 2 + side B♭) as the basic one; the bis and 1 + 1 fingerings are alternates.
- E6 alternates: Sax Teacher UK's basic chart prints 1 2 3 + side E; the WFG prints 1 2 3 + G♯ + side E instead. Neither is entered. Front F + 1 2 3 appears in both and is entered.
- F6 front F: the Sax Teacher UK alto altissimo chart adds the left first finger key; its basic chart and the WFG leave it open. The table follows the basic charts (front F + 2).
- F♯6 without the high F♯ key (front F + 2 + side B♭): only the Sax Teacher UK alto chart prints it; soprano, tenor and baritone get the standard fingering only.
- Altissimo G6–C7: the WFG lists many fingerings per note, most without a preferred one. For each saxophone the table takes the first fingering of the Sax Teacher UK chart for that saxophone that the WFG also prints. Soprano B♭6 and tenor and baritone B6 have no such fingering and are gaps.

## Clarinet: source differences

Sources: The Woodwind Fingering Guide Boehm clarinet charts (basic chalumeau, clarion and lower altissimo; upper altissimo alternates), the Tomplay interactive clarinet chart (written E3–A6) and the Sax Teacher UK clarinet chart (written E3–C7). Every entry is printed by the WFG and by at least one of the other two.

- Tomplay's chart script holds a table of pressed key numbers per note. Key identities were read from that table by comparing neighbouring notes (for example F♯3 = G3 plus one left-pinky key), not from the drawing.
- F♯3 and C♯5: Sax Teacher UK lifts the right ring finger and adds an F♯/C♯ pinky key. The WFG and Tomplay keep all six holes closed and add the left or right F♯/C♯ pinky key. The table follows the WFG and Tomplay.
- Low E3 and clarion B4: Tomplay's main fingering adds the right F/C key to the left E/B key (for slurs to F3/C5). Only the plain left and right E/B fingerings are entered; WFG and Sax Teacher UK print both.
- E♭6: WFG basic (2 3 | 1 + B/F♯ sliver + G♯/D♯ key) is printed by Tomplay too; Sax Teacher UK prints it as an alternate. Entered.
- G♯6: Tomplay and the WFG agree on 2 3 | 1 + sliver + G♯/D♯; Sax Teacher UK and the WFG agree on 2 3 + left F♯ | 1 3. The table follows the publisher chart (Tomplay).
- A6: Tomplay prints 2 3 + left F♯ + right G♯, which the WFG does not list. Sax Teacher UK and the WFG agree on 2 3 + right F/C. Entered.
- B♭6, B6, C7: Tomplay stops at A6. The table uses Sax Teacher UK's main fingering, which is the first one the WFG lists for each note.
- Not entered: the E♭/B♭ sliver alternates for E♭4/B♭5 and the B/F♯ sliver alternates for B3/F♯5 (the WFG and Tomplay print them, but the table carries only the pinky, F♯4 and throat B♭ alternates); Sax Teacher UK's throat-key alternates for B4 and C5 (no other source prints them).

## Flute, piccolo, alto flute: source differences

Sources: The Woodwind Fingering Guide basic flute and piccolo chart, the Tomplay interactive flute chart (one fingering per note, C4–C7) and the Sax Teacher UK flute chart. All three agree on every note from C♯4 to A6 and on B6, except where listed below.

- Piccolo and alto flute: the WFG states that its basic fingerings apply to all sizes of flute; flutetunes.com says the same of its basic chart. No piccolo or alto flute chart that differs was found, so `overrides` holds nothing for `picc` and `afl`.
- Low C4: the WFG marks only the low C key; Tomplay and Sax Teacher UK mark the low C and C♯ keys together. The table follows the two charts that agree (C and C♯ keys).
- B♭6: the WFG omits the E♭ key; Tomplay and Sax Teacher UK hold it. The table follows the two that agree (E♭ key held).
- C7: Sax Teacher UK adds the E♭ key; the WFG (C-foot fingering) and Tomplay do not. The table follows the WFG and Tomplay.
- B♭4/B♭5: 1 + 1 (all three) and thumb B♭ (WFG and Sax Teacher UK) are entered. The right-hand B♭ trill lever fingering is a trill fingering in the WFG and is left out.
- F♯4/F♯5 with the middle finger: the WFG prints it only as a trill fingering; not entered.
- Tomplay's older chart script (sheets/main.js) adds the G♯ key to F♯6; the flute page itself (visual-instruments/flute.min.js) does not. The table uses the flute page's data, which matches the WFG and Sax Teacher UK.

## Recorder: source differences

Sources: the WFG basic recorder chart (one chart for C and F recorders, English and German models) and its third-octave alternate chart, the Dolmetsch Online text chart (baroque/English, C and F recorders) and the Tomplay soprano and alto charts (indices 0–26, baroque). `0.5` on hole 6 or 7 means only the larger hole of the pair is covered (the half-hole of the WFG and the `a` hole of Dolmetsch); `0.5` on the thumb means a pinched thumb hole.

- The WFG and Dolmetsch agree on every index from 0 to 26 except 22, and on 29, 30 and 31.
- Index 8 (soprano G♯, alto C♯): Tomplay closes both holes of 6; the WFG and Dolmetsch cover only the larger one. The table follows the WFG and Dolmetsch.
- Indices 25 and 26 (soprano C♯ and D, third octave): Tomplay adds hole 7 and, at 26, leaves out the closed bell. The table follows the WFG and Dolmetsch.
- Indices 25 and 29 need the bell end closed (for example on the knee). The diagram cannot show this; the option name says it.
- Index 22: see Open gaps. The soprano B♭ follows the WFG and Tomplay's soprano chart (1 2 | 4 5 6).
- Alternate at index 11 (soprano B, alto E): thumb + 2 3, printed by the WFG and Dolmetsch.
- German F (index 5): T 1 2 3 | 4 – – –, printed by the WFG and quoted from Rowland-Jones (English Wikipedia) and Linde (German Wikipedia).
