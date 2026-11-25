import { useId } from 'react';
import type { Derived } from '../domain/derive';
import { intervalText, isTransposing } from '../domain/instruments';
import { keyName, keySignature, mod12, sigText, spell } from '../domain/keys';
import { bestShiftForConcertTonic, bestShiftForWrittenTonic, reasonText } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { shiftLabel, shiftOctaveLabel } from './labels';
import s from './KeyBridge.module.css';

interface Props {
  doc: Doc; derived: Derived;
  onShift(shift: number): void;
}

const PCS = Array.from({ length: 12 }, (_, pc) => pc);
const MAX_SHIFT = 24;

function KeySelect(p: { id: string; value: number; mode: Doc['originalMode']; describedBy: string; onPick(pc: number): void }) {
  return (
    <select id={p.id} className={s.select} value={p.value} aria-describedby={p.describedBy}
      onChange={e => p.onPick(Number(e.target.value))}>
      {PCS.map(pc => <option key={pc} value={pc}>{keyName(pc, p.mode)}</option>)}
    </select>
  );
}

const SpeakerIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" />
  </svg>
);
const NoteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
);

/** Sidebar card body "Key & transposition" (SPEC §6.2): key selects, fine-tune, keys that fit. */
export default function KeyBridge({ doc, derived, onShift }: Props) {
  const uid = useId();
  const i = derived.inst;
  const mode = doc.originalMode;
  const transposing = isTransposing(i);
  const { shift } = doc;

  const pickConcert = (pc: number) => onShift(bestShiftForConcertTonic(derived.ranked, doc.originalTonicPc, pc));
  const pickWritten = (pc: number) => onShift(bestShiftForWrittenTonic(derived.ranked, i, doc.originalTonicPc, pc));

  return (
    <>
      {transposing ? (
        <div className={s.bridge}>
          <div className={s.sounds}>
            <label htmlFor={`${uid}-c`} className={s.label}><SpeakerIcon />Sounds in · concert pitch</label>
            <KeySelect id={`${uid}-c`} value={derived.concertTonicPc} mode={mode} describedBy={`${uid}-ch`} onPick={pickConcert} />
            <div id={`${uid}-ch`} className={s.help}>What the band and audience hear. Set this to play along with others.</div>
          </div>
          <div className={s.connector}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v16" /><path d="M6 14l6 6 6-6" />
            </svg>
            <span>{intervalText(i)}</span>
          </div>
          <div className={s.reads}>
            <label htmlFor={`${uid}-w`} className={s.label}><NoteIcon />You read · written pitch</label>
            <KeySelect id={`${uid}-w`} value={derived.writtenTonicPc} mode={mode} describedBy={`${uid}-wh`} onPick={pickWritten} />
            <div id={`${uid}-wh`} className={s.helpTeal}>{sigText(derived.sig)} · this is the sheet below, with your fingerings</div>
          </div>
        </div>
      ) : (
        <div className={s.single}>
          <label htmlFor={`${uid}-w`} className={s.label}>Key</label>
          <KeySelect id={`${uid}-w`} value={derived.writtenTonicPc} mode={mode} describedBy={`${uid}-wh`} onPick={pickWritten} />
          <div id={`${uid}-wh`} className={s.helpTeal}>{sigText(derived.sig)} · {intervalText(i)}</div>
        </div>
      )}

      <div className={s.subhead}>Fine-tune</div>
      <div className={s.fine}>
        <button type="button" className={s.step} aria-label="One semitone down" disabled={shift <= -MAX_SHIFT}
          onClick={() => onShift(shift - 1)}>−</button>
        <div className={s.shift} aria-live="polite">
          <div className={s.shiftBig}>{shiftLabel(shift)}</div>
          <div className={s.shiftSub}>
            semitones{Math.abs(shift) >= 12 && ` · ${shiftOctaveLabel(shift)}`} from original
          </div>
        </div>
        <button type="button" className={s.step} aria-label="One semitone up" disabled={shift >= MAX_SHIFT}
          onClick={() => onShift(shift + 1)}>+</button>
      </div>
      <div className={s.octaves}>
        <button type="button" className={s.octave} disabled={shift - 12 < -MAX_SHIFT} onClick={() => onShift(shift - 12)}>Octave down</button>
        <button type="button" className={s.octave} disabled={shift + 12 > MAX_SHIFT} onClick={() => onShift(shift + 12)}>Octave up</button>
      </div>

      <div className={s.fits}>
        <div className={s.subhead}>Keys that fit</div>
        {derived.ranked.slice(0, 3).map(r => {
          const concertPc = mod12(doc.originalTonicPc + r.shift);
          const writtenPc = mod12(concertPc + i.off);
          const sig = keySignature(writtenPc, mode);
          const written = keyName(writtenPc, mode);
          const on = r.shift === shift;
          return (
            <button key={r.shift} type="button" className={s.fit} aria-pressed={on} onClick={() => onShift(r.shift)}>
              <span className={s.fitText}>
                <strong>{transposing ? `Sounds ${keyName(concertPc, mode)} → you read ${written}` : written}</strong>
                <span className={s.sep}> · </span>
                <span className={s.fitReason}>{reasonText(r, i)}</span>
              </span>
              <span className={s.sep}> · </span>
              <span className={s.fitRange}>{spell(r.min, sig).name} – {spell(r.max, sig).name}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
