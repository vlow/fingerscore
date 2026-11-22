# Fingering gaps

Written pitches inside an instrument's range (`lo`..`ext`) that have no fingering entry in `src/data/fingerings.json`. The machine-readable list is `src/data/fingering-gaps.json`; keep both in sync. The app shows no chart for these notes.

Every entry in the tables was printed by two independent charts (see `meta` in `fingerings.json`). A pitch where the two charts print no common fingering stays empty and is listed here.

An empty array in `overrides[instId][pitch]` hides the kind table's entry for that one instrument; it marks an instrument-specific gap.

## Open gaps

- Soprano sax: written 94 (B♭6, altissimo). Checked: WFG saxophone charts, Sax Teacher UK soprano altissimo chart. No fingering appears in both.
- Tenor sax: written 95 (B6, altissimo). Checked: WFG saxophone charts, Sax Teacher UK tenor altissimo chart. No fingering appears in both.
- Baritone sax: written 95 (B6, altissimo). Checked: WFG saxophone charts, Sax Teacher UK baritone altissimo chart. No fingering appears in both.
- Not yet looked up (Task 7 in progress):
  - Flute (flute, piccolo, alto flute): written 76–85 (second-octave E5–C♯6). Not yet looked up.
  - Soprano recorder: written 87–91 (table indices 27–31). Not yet looked up.
  - Alto recorder: written 92–96 (table indices 27–31). Not yet looked up.

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
