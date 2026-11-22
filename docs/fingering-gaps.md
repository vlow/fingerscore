# Fingering gaps

Written pitches inside an instrument's range (`lo`..`ext`) that have no fingering entry in `src/data/fingerings.json`. The machine-readable list is `src/data/fingering-gaps.json`; keep both in sync. The app shows no chart for these notes.

Every standard fingering (the first option of a note) is printed by at least two independent charts (see `meta` in `fingerings.json` for titles, URLs and access dates); alternates follow the policy below. Where the charts print no common fingering, the pitch stays empty and is listed here. An empty array in `overrides[instId][pitch]` hides the kind table's entry for one instrument; an empty array in `tables.recGerman` means no sourced German fingering.

## Alternates policy

Owner decision, 2026-11-22. Where published charts print different fingerings for a note, the first option is the standard one and every other documented variant is an alternate (`p` 0.3–0.5; the option name says what differs and which chart prints it). A variant stays out when the evidence shows it is probably wrong: a transcription slip, a chart for another system or instrument size, a trill-only fingering, or a chart that omits keys entirely. Trill fingerings and intonation tweaks printed only in "alternate fingering" charts also stay out. This replaces the earlier rule that alternates come only from basic charts.

Two variants stay out by earlier owner decision: clarinet throat B♭4 with the A key + side key 2 (a trill fingering) and flute low C4 with the C♯ key shown as well (the C key closes both pads).

## Waiting for the owner

Nothing. Every note inside the normal range has a fingering, and `OWNER_PENDING` in the test "gap list is short and sourced" is empty.

## Summary

| Kind | Sources | Notes with a fingering | Alternates | Gaps | Reviewed |
|---|---|---|---|---|---|
| Xaphoon | official Xaphoon chart; "The Water Is Wide" songbook page | 25 (C4–C6) | 1 | 0 | no |
| Saxophone | WFG saxophone charts; Sax Teacher UK basic and altissimo charts | 39 (B♭3–C7, alto altissimo; soprano, tenor, baritone via overrides) | 27 in the alto table; soprano, tenor and baritone carry their own lists for E6–F♯6 | 3 (all altissimo) | no |
| Clarinet | WFG Boehm clarinet charts; Tomplay clarinet chart; Sax Teacher UK clarinet chart | 45 (E3–C7) | 16 | 0 | no |
| Flute, piccolo, alto flute | WFG flute and piccolo chart; Tomplay flute chart; Sax Teacher UK flute chart; flutetunes.com; Yamaha flute chart; *Flute For Dummies* chart | 37 (C4–C7) | 5 | 0 | no |
| Recorder (baroque) | WFG recorder charts; Dolmetsch Online text chart; Tomplay recorder chart; Yamaha soprano and alto charts; Philippe Bolton charts; American Recorder Society charts; Prescott Workshop charts; Blockis | 32 of 32 table indices | 17 | 0 | no |
| Recorder (German) | WFG recorder chart; Wikipedia citing Rowland-Jones and Linde; Yamaha German chart; Dolmetsch German chart; Philippe Bolton German chart; Blockis (with Yamaha and Aulos German charts) | 7 indices differ from baroque (5, 6, 8, 17, 18, 20, 22) | 6 | 0 | no |

## Open gaps

Inside the normal range: none.

Extended range (`hi+1`..`ext`):

- Soprano sax: written 94 (B♭6, altissimo). Checked: WFG saxophone charts, Sax Teacher UK soprano altissimo chart. No fingering appears in both.
- Tenor sax: written 95 (B6, altissimo). Checked: WFG saxophone charts, Sax Teacher UK tenor altissimo chart. No fingering appears in both.
- Baritone sax: written 95 (B6, altissimo). Checked: WFG saxophone charts, Sax Teacher UK baritone altissimo chart. No fingering appears in both.

## Xaphoon: source differences

Sources: the official Xaphoon fingering chart (C4–C6) and the songbook page "The Water Is Wide" (notes and fingerings for C4, D4, E4, F4, G4, A4, B♭4, C5).

Every fingering the songbook page prints (C4, D4, E4, F4, G4, A4, B♭4, C5) matches the official chart. The songbook does not show C♯4, E♭4, F♯4, G♯4, B4 or anything above C5.

## Xaphoon: chart notes

- F♯5: the official chart prints the same holes as G5 and marks the note with an asterisk. The owner confirmed on 2026-11-22, from the Xaphoon handbook, that F♯5 is played either with the G5 fingering and less lip pressure, or with the high F fingering and more lip pressure. Both are entered; the G5 fingering is the standard one because the chart prints it.
- G♯4: the thumb dot is partly covered by the neighbouring photo on the chart. The visible part is solid, so the table records the thumb as closed.

## Saxophone: source differences

Sources: The Woodwind Fingering Guide saxophone charts (basic first and second octave; alternate second octave, lower and middle altissimo) and the Sax Teacher UK saxophone chart with its alto, tenor, baritone and soprano altissimo charts. Both charts agree on every standard fingering from B♭3 to F♯6 and on the named alternates entered (B♭: side, bis, 1 + 1, 1 + 2; C: side C; F♯: alternate F♯ key; F6: front F; F♯6: front F without the high F♯ key).

- Low B♭, B and C♯: both charts print the right-pinky low C key as pressed together with the left-pinky key. The table follows them.
- B♭: both charts name the side B♭ fingering (1 2 + side B♭) as the basic one; the bis and 1 + 1 fingerings are alternates.
- E6, F6, F♯6 (written 88–90): every saxophone carries the alternates printed by the WFG basic chart and the Sax Teacher UK basic chart (E6: front F + 2 3, 1 2 3 + side E; F6: front F + 2, 1 2 + side E; F♯6: front F + 2 + high F♯), plus the alternates of the Sax Teacher UK altissimo chart for its own size (that chart starts at E6). So E6 front F + 1 2 3 (WFG alternate chart, "great for baritone") appears where the Sax Teacher UK chart for that size prints it (alto, tenor), F6 front F + 1 2 on alto, tenor and baritone, and F♯6 front F + 2 + side B♭ on alto only. The alto list sits in `tables.sax`; soprano, tenor and baritone lists are in `overrides`. A baritone fingering that needs the low A key is left out, because the key map has no low A key.
- Altissimo G6–C7: the WFG lists many fingerings per note, most without a preferred one. For each saxophone the table takes the first fingering of the Sax Teacher UK chart for that saxophone that the WFG also prints. Soprano B♭6 and tenor and baritone B6 have no such fingering and are gaps.

## Clarinet: source differences

Sources: The Woodwind Fingering Guide Boehm clarinet charts (basic chalumeau, clarion and lower altissimo; upper altissimo alternates), the Tomplay interactive clarinet chart (written E3–A6) and the Sax Teacher UK clarinet chart (written E3–C7). Every standard entry is printed by the WFG and by at least one of the other two. Alternates: left/right pinky pairs, F♯4 (thumb + side keys 3 and 4), and the variants below.

- Tomplay's chart script holds a table of pressed key numbers per note. Key identities were read from that table by comparing neighbouring notes (for example F♯3 = G3 plus one left-pinky key), not from the drawing.
- F♯3 and C♯5: Sax Teacher UK lifts the right ring finger and adds an F♯/C♯ pinky key. Judged probably wrong: lifting the ring finger opens a tone hole above the F♯/C♯ key, so that fingering sounds about A3/E5 and the pinky key has no effect. The WFG and Tomplay keep all six holes closed; the table follows them.
- Low E3 and clarion B4: Tomplay's main fingering adds the right F/C key to the left E/B key (for slurs to F3/C5); the WFG alternate chart prints it too. Entered as an alternate after the plain left and right E/B fingerings.
- E♭6: WFG basic (2 3 | 1 + B/F♯ sliver + G♯/D♯ key) is printed by Tomplay too and is the standard. Sax Teacher UK's main fingering, 2 3 | 2 + G♯/D♯ key, is an alternate.
- G♯6: Tomplay and the WFG agree on 2 3 | 1 + sliver + G♯/D♯ (standard); Sax Teacher UK and the WFG agree on 2 3 + left F♯ | 1 3 (alternate).
- A6: Sax Teacher UK and the WFG agree on 2 3 + right F/C (standard). Tomplay's 2 3 + left F♯ + right G♯ is an alternate.
- B♭6, B6, C7: Tomplay stops at A6. The table uses Sax Teacher UK's main fingering, which is the first one the WFG lists for each note.
- Sliver alternates, printed by the WFG, Tomplay and Sax Teacher UK: E♭4/B♭5 with 1 2 + the left E♭/B♭ sliver key (new key `slEb` in the key map), B3/F♯5 with 1 2 3 | 1 + the right B/F♯ sliver key.
- Not entered: throat B♭4 with the A key + side key 2 (owner decision: a trill fingering). Sax Teacher UK's throat-key alternates for B4 (A key + side key 1; A key + register + side key 2) and C5 (A key + register + side keys 1 and 2): judged probably wrong as normal fingerings, because the WFG prints exactly these as trill fingerings (B4 with A4 and B♭4, C5 with B♭4).

## Flute, piccolo, alto flute: source differences

Sources: The Woodwind Fingering Guide basic flute and piccolo chart, the Tomplay interactive flute chart (one fingering per note, C4–C7), the Sax Teacher UK flute chart, flutetunes.com, and for B♭6 and B6 the Yamaha flute chart and Wiley's *Flute For Dummies* chart (hosted by the National Flute Association). All three agree on every note from C♯4 to A6 and on B6, except where listed below.

- Piccolo and alto flute: the WFG states that its basic fingerings apply to all sizes of flute; flutetunes.com says the same of its basic chart. No piccolo or alto flute chart that differs was found, so `overrides` holds nothing for `picc` and `afl`.
- Low C4: the WFG marks only the low C key; Tomplay and Sax Teacher UK mark the low C and C♯ keys together. The owner decided on 2026-11-22 to follow the WFG: the C key also closes the C♯ pad, so a player presses the C key alone.
- B♭6: thumb + right first finger + D trill key, without the E♭ key. The WFG, flutetunes.com and Yamaha's flute chart print it so; Tomplay, Sax Teacher UK and Wiley's *Flute For Dummies* chart (hosted by the National Flute Association) add the E♭ key. With the right first finger down and fingers 2 and 3 up, the open F and E holes already vent the tube below, so the E♭ key changes little; players keep the little finger on it for balance, as on most notes. The standard follows the maker chart and the WFG; the version with the E♭ key is an alternate.
- B6: *Flute For Dummies* adds the E♭ key; the other charts do not. That chart prints the other third-octave notes like the WFG, so it counts as reliable here; the E♭ version is an alternate.
- C7: Sax Teacher UK adds the E♭ key; the WFG (C-foot fingering) and Tomplay do not. Standard as the WFG and Tomplay; the E♭ version is an alternate.
- B♭4/B♭5: 1 + 1 (all three) and thumb B♭ (WFG and Sax Teacher UK) are entered. The right-hand B♭ trill lever fingering is a trill fingering in the WFG and is left out.
- F♯4/F♯5 with the middle finger: the WFG prints it only as a trill fingering; not entered.
- Tomplay's older chart script (sheets/main.js) adds the G♯ key to F♯6; the flute page itself (visual-instruments/flute.min.js) does not. Judged probably wrong: superseded data that Tomplay's current chart no longer shows. Not entered.

## Recorder: source differences

Sources: the WFG basic recorder chart (one chart for C and F recorders, English and German models) and its third-octave alternate chart, the Dolmetsch Online text chart (baroque/English, C and F recorders) and the Tomplay soprano and alto charts (indices 0–26, baroque). Added for index 22, 27, 28 and the German notes: Yamaha's soprano (baroque and German) and alto charts, Dolmetsch's German chart, Philippe Bolton's baroque and German charts, the American Recorder Society soprano and alto charts, the Prescott Workshop charts and Blockis (blockfloetengriffe.de). `0.5` on hole 6 or 7 means only the larger hole of the pair is covered (the half-hole of the WFG and the `a` hole of Dolmetsch); `0.5` on the thumb means a pinched thumb hole.

- The WFG and Dolmetsch agree on every index from 0 to 26 except 22, and on 29, 30 and 31.
- Index 8 (soprano G♯, alto C♯): standard 1 2 3 | 4 5 + larger hole of 6 (WFG, Dolmetsch). Alternates: hole 6 fully covered (Tomplay), hole 6 open (Prescott).
- Indices 25 and 26 (soprano C♯ and D, third octave): standard as the WFG and Dolmetsch. Alternates: hole 7 also closed (ARS, Prescott, Tomplay, Bolton); at 25 also Yamaha's 1 3 | 4 5 7 and Bolton's three other options (1 3 | 4; 1 | 4 5; 1 3 | 4 5, each with the bell closed).
- Indices 25 and 29 need the bell end closed (for example on the knee). The diagram cannot show this; the option name says it.
- Index 22 (soprano B♭, alto E♭): thumb pinched, 1 2 | 4 5 6, for both sizes. Printed by the WFG, Yamaha's soprano and alto charts, Bolton (C and F) and Blockis, and by Tomplay's soprano chart. Thumb pinched, 1 2 | 5 6 + half 7 is printed by the American Recorder Society and Prescott Workshop charts (both sizes) and Tomplay's alto chart; Bolton lists 1 2 | 4 5 6 + half 7 as its alternative; Dolmetsch prints 1 2 | 5 6. These three are alternates.
- Index 27 (soprano D♯, alto G♯): thumb pinched, – 2 3 | – 5 6 (both holes of 6 closed), printed by Dolmetsch, Bolton and the American Recorder Society. Alternates: 1 3 only (Bolton, WFG), 2 3 only (WFG, Blockis), larger hole of 6 only (WFG). The WFG's other entries for this note appear only in its alternate chart and stay out.
- Index 28 (soprano E, alto A): thumb pinched, – 2 3 | – 5 6 with the bell end closed, printed by Dolmetsch, Bolton and Blockis. Alternates: larger hole of 6 only (WFG), hole 1 half + 2 (Bolton).
- Alternate at index 11 (soprano B, alto E): thumb + 2 3, printed by the WFG and Dolmetsch.
- German F (index 5): T 1 2 3 | 4 – – –, printed by the WFG and quoted from Rowland-Jones (English Wikipedia) and Linde (German Wikipedia).
- German F♯ (index 6): T 1 2 3 | – 5 6 7, printed by the WFG, Yamaha, Dolmetsch, Blockis and Aulos (via Blockis). Bolton's German chart prints the baroque T 1 2 3 | – 5 6 –. Judged probably wrong for the German system: the WFG lists exactly that fingering as “basic for English models” and gives – 5 6 7 for German models, and every maker of German-system recorders prints – 5 6 7. Bolton makes baroque recorders; his German chart repeats the baroque fingering at both notes (6 and 18) where the WFG marks a German difference.
- German upper F (index 17): thumb pinched, 1 2 3 | 4 – – –, printed by the WFG, Yamaha, Dolmetsch, Bolton and Blockis.
- German upper F♯ (index 18): thumb pinched, 1 2 3 | – 5 – 7, printed by the WFG, Yamaha, Dolmetsch and Aulos (via Blockis). Alternate: – 5 + half 6 (Yamaha, Blockis). Bolton and Blockis's general chart print the baroque – 5 – –; judged probably wrong for the German system for the same reason as index 6 (the WFG labels it English-only; Blockis's own Yamaha and Aulos German pages print – 5 – 7).
- German G♯ (index 8): T 1 2 – | 4 5 – – (WFG, Bolton, Blockis general chart; owner decision 2026-11-22). Alternates: hole 6 half covered (Yamaha German chart; Bolton and Blockis as alternative), hole 6 fully covered (Dolmetsch German chart, Aulos via Blockis).
- German upper G♯ (index 20): thumb pinched, 1 2 3 | – 5 6 7, printed by Yamaha's German chart, Blockis's Yamaha (YRS-23, YRS-301, YRA-27) and Aulos German pages, and Blockis's general German chart. Alternates: hole 3 open (Dolmetsch German chart), and the baroque 1 2 | 4 (the WFG, which prints no separate German fingering here, and Bolton).
- German upper B♭ (index 22): standard as baroque (Yamaha German chart, Blockis). Alternate: hole 6 half covered (Dolmetsch German chart; Blockis as alternative).
