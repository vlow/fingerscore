import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { displayName, inst } from '../domain/instruments';
import { buildDoc } from '../import/buildDoc';
import { defaultBuildOptions, parseFile } from '../import';
import { usableTracks } from '../import/melody';
import type { ParsedSong } from '../import/types';
import { useApp } from '../state/store';
import DropZone, { errorMessage } from '../ui/DropZone';
import InstrumentPicker from '../ui/InstrumentPicker';
import s from './Start.module.css';

const SAMPLE = 'Auld_Lang_Syne.mid';

const STEPS = [
  ['We find the melody', 'Multi-track MIDI or a score with several parts? We pick the most likely melody and let you choose another.'],
  ['We suggest a key', 'Every note must fit your instrument’s range. Among the keys that fit, we favour the easy register and few accidentals.'],
  ['You fine-tune and print', 'Shift by semitones or octaves. Notes out of range are flagged right away. Export as PDF.'],
];

export default function Start() {
  const instId = useApp(st => st.instId);
  const prefs = useApp(st => st.prefs);
  const setInstrument = useApp(st => st.setInstrument);
  const setPrefs = useApp(st => st.setPrefs);
  const setSong = useApp(st => st.setSong);
  const setDoc = useApp(st => st.setDoc);
  const navigate = useNavigate();
  const missingSheet = (useLocation().state as { missingSheet?: boolean } | null)?.missingSheet === true;
  const [error, setError] = useState<string | null>(null);

  /** A new song replaces the previous one and drops its sheet. */
  function acceptSong(song: ParsedSong) {
    setError(null);
    setSong(song);
    setDoc(null);
  }

  /** One usable track goes straight to the sheet; otherwise the user picks the part. */
  function continueWith(song: ParsedSong) {
    setError(null);
    if (usableTracks(song).length !== 1) { navigate('/tracks'); return; }
    try {
      setDoc(buildDoc(song, defaultBuildOptions(song, instId, prefs)));
      navigate('/sheet');
    } catch (e) {
      setError(errorMessage(e, song.file));
    }
  }

  async function trySample() {
    setError(null);
    try {
      const res = await fetch(`/demo/${SAMPLE}`);
      if (!res.ok) throw new Error(res.statusText);
      const song = await parseFile(new File([await res.arrayBuffer()], SAMPLE));
      acceptSong(song);
      continueWith(song);
    } catch (e) {
      setError(errorMessage(e, SAMPLE));
    }
  }

  return (
    <div className={s.page}>
      <div className={s.intro}>
        <h1 className={s.h1}>Sheet music with fingering charts for woodwinds</h1>
        <p className={s.lead}>
          Upload a MIDI or MusicXML file. We transpose it to a key that suits your instrument and add a fingering chart
          under every note.
        </p>
      </div>

      {missingSheet && <p role="alert" className={s.missing}>That sheet is no longer saved in this browser.</p>}

      <InstrumentPicker value={instId} onChange={setInstrument} />

      <DropZone
        instrumentName={displayName(inst(instId))}
        onSong={acceptSong}
        onContinue={() => { const song = useApp.getState().song; if (song) continueWith(song); }}
      />

      <fieldset className={s.prefs}>
        <legend className={s.legend}>Key preference</legend>
        <label className={s.check}>
          <input
            type="checkbox" checked={prefs.easyRegister}
            onChange={e => setPrefs({ easyRegister: e.target.checked })}
          />
          Prefer the easy register (no octave key or overblowing)
        </label>
        <label className={s.check}>
          <input
            type="checkbox" checked={prefs.fewAccidentals}
            onChange={e => setPrefs({ fewAccidentals: e.target.checked })}
          />
          Prefer keys with few sharps or flats
        </label>
      </fieldset>

      <div className={s.sample}>
        <button type="button" className={s.sampleButton} onClick={() => void trySample()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
          Try a sample: Auld Lang Syne (MIDI)
        </button>
        {error && <p role="alert" className={s.error}>{error}</p>}
      </div>

      <section aria-label="How it works" className={s.how}>
        {STEPS.map(([title, text], i) => (
          <div key={title} className={s.step}>
            <div className={s.stepNum} aria-hidden="true">{i + 1}</div>
            <h2 className={s.stepTitle}>{title}</h2>
            <p className={s.stepText}>{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
