import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { previewTrack, stopPreview } from '../audio/player';
import { displayName, inst, noteNameFlat } from '../domain/instruments';
import { buildDoc } from '../import/buildDoc';
import { buildOptionsFor, defaultBuildOptions } from '../import';
import { analyseTracks, usableTracks, type TrackInfo } from '../import/melody';
import { ImportError, type ParsedSong, type ParsedTrack } from '../import/types';
import { useApp } from '../state/store';
import PageBar from '../ui/PageBar';
import PianoRoll from '../ui/PianoRoll';
import Steps from '../ui/Steps';
import s from './Tracks.module.css';

const PREVIEW_SECONDS = 8;

type Tag = TrackInfo['tags'][number] | 'Below range' | "Can't be played";
const TAG_TONE: Record<Tag, string> = {
  Lyrics: s.tagTeal, 'Single notes': s.tagTeal, Chords: s.tagGrey, 'Below range': s.tagAmber, "Can't be played": s.tagGrey,
};

interface Row { track: ParsedTrack; info: TrackInfo; num: number; usable: boolean; below: boolean; tags: Tag[] }

const capitalise = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function instrumentLine(t: ParsedTrack): string {
  const parts = [t.instrument ? capitalise(t.instrument) : '', t.channel !== null ? `channel ${t.channel}` : ''];
  return parts.filter(Boolean).join(' · ');
}

function songLength(song: ParsedSong): number {
  let end = 0;
  for (const t of song.tracks) for (const n of t.notes) end = Math.max(end, n.start + n.dur);
  return end;
}

function clock(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function Tracks() {
  const song = useApp(st => st.song);
  useEffect(() => stopPreview, []);
  if (!song) return <Navigate to="/" replace />;
  return <TrackChooser song={song} />;
}

function TrackChooser({ song }: { song: ParsedSong }) {
  const instId = useApp(st => st.instId);
  const prefs = useApp(st => st.prefs);
  const setDoc = useApp(st => st.setDoc);
  const navigate = useNavigate();
  const instrument = inst(instId);
  const instLabel = displayName(instrument);
  const bandLo = instrument.lo - instrument.off;
  const bandHi = instrument.hi - instrument.off;

  // The track whose preview is sounding; its button shows Stop until the preview ends or is stopped.
  const [previewing, setPreviewing] = useState<string | null>(null);
  function togglePreview(track: ParsedTrack) {
    if (previewing === track.id) { stopPreview(); setPreviewing(null); return; }
    setPreviewing(track.id);
    previewTrack(track.notes, song.tempo, PREVIEW_SECONDS, () => setPreviewing(null));
  }

  const rows = useMemo<Row[]>(() => {
    const infos = analyseTracks(song);
    return song.tracks.map((track, i) => {
      const usable = !track.percussion && track.notes.length > 0;
      const below = usable && track.notes.filter(n => n.midi < bandLo).length > track.notes.length / 2;
      const tags: Tag[] = [...infos[i].tags];
      if (below) tags.push('Below range');
      if (track.percussion) tags.push("Can't be played");
      return { track, info: infos[i], num: i + 1, usable, below, tags };
    });
  }, [song, bandLo]);

  // A song without a usable track still lists its rows, all disabled, with nothing to make.
  const [opts, setOpts] = useState(() => usableTracks(song).length > 0
    ? defaultBuildOptions(song, instId, prefs)
    : buildOptionsFor(song, song.tracks[0]?.id ?? '', instId, prefs));
  const [error, setError] = useState<string | null>(null);

  const selected = rows.find(r => r.track.id === opts.trackId) ?? rows[0];
  const recommended = rows.find(r => r.info.recommended);
  const length = songLength(song);
  const pitches = rows.filter(r => r.usable).flatMap(r => [r.info.stats.min, r.info.stats.max]);
  const low = Math.min(bandLo, ...pitches) - 1;
  const high = Math.max(bandHi, ...pitches) + 1;

  function choose(trackId: string) {
    setError(null);
    setOpts(buildOptionsFor(song, trackId, instId, prefs));
  }

  function make() {
    try {
      setDoc(buildDoc(song, { ...opts, instId, prefs }));
      navigate('/sheet');
    } catch (e) {
      setError(e instanceof ImportError ? e.userMessage : 'The sheet could not be made from this track.');
    }
  }

  const otherSources = rows.filter(r => r.usable && r !== selected);
  const lyricSources = rows.filter(r => r.track.lyrics.length > 0);
  const reasons = recommended ? recommendReasons(recommended, rows) : '';

  return (
    <>
      <PageBar left={<Steps current="track" />} right={<Link to="/" className={s.secondary}>Different file</Link>} />
      <div className={s.page}>
        <div className={s.head}>
          <div>
            <h1 className={s.h1}>Which part do you want to play?</h1>
            <div className={s.fileLine}>
              {song.file} · {song.format} · {song.tracks.length} {song.tracks.length === 1 ? 'track' : 'tracks'} ·{' '}
              {song.timeSig[0]}/{song.timeSig[1]} · ♩ = {Math.round(song.tempo)} · {clock((length * 60) / song.tempo)}
            </div>
          </div>
          {recommended && (
            <div className={s.picked}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6l-4.9 3.6 1.9-5.8L4 8.8h6.1z" />
              </svg>
              <span>We picked <strong>{recommended.track.name}</strong>{reasons && `: ${reasons}`}.</span>
            </div>
          )}
        </div>

        <div className={s.body}>
          <fieldset className={s.list}>
            <legend className={s.srOnly}>Tracks in this file</legend>
            {rows.map(r => {
              const on = r === selected;
              const nameId = `track-name-${r.num}`;
              const { stats } = r.info;
              return (
                <div key={r.track.id} data-testid="track-row" className={s.row} data-selected={on || undefined} data-disabled={!r.usable || undefined}>
                  <label className={s.info}>
                    <input
                      type="radio" name="track" className={s.radio} aria-labelledby={nameId}
                      checked={on && r.usable} disabled={!r.usable} onChange={() => choose(r.track.id)}
                    />
                    <span className={s.infoText}>
                      <span className={s.nameLine}>
                        <span id={nameId} className={s.name}>{r.num} · {r.track.name}</span>
                        {r.info.recommended && <span className={s.recommended}>Recommended</span>}
                        {r.tags.map(t => <span key={t} className={`${s.tag} ${TAG_TONE[t]}`}>{t}</span>)}
                      </span>
                      <span className={s.instrument}>{instrumentLine(r.track)}</span>
                      <span className={s.stats}>
                        <span><span className={s.statLabel}>Notes</span> <strong>{stats.notes}</strong></span>
                        <span><span className={s.statLabel}>Range</span>{' '}
                          <strong>{r.usable ? `${noteNameFlat(stats.min)} – ${noteNameFlat(stats.max)}` : '—'}</strong></span>
                        <span><span className={s.statLabel}>At once</span>{' '}
                          <strong>{!r.usable ? '—' : stats.maxSimultaneous === 1 ? '1 note' : `up to ${stats.maxSimultaneous} notes`}</strong></span>
                      </span>
                    </span>
                  </label>
                  <div className={s.preview}>
                    <PianoRoll
                      notes={r.track.notes} length={length} low={low} high={high} band={{ lo: bandLo, hi: bandHi }}
                      label={`Piano roll of ${r.track.name}`} tone={!r.usable ? 'ghost' : on ? 'accent' : 'muted'}
                    />
                    {r.usable && (
                      <button
                        type="button" className={s.play}
                        aria-label={previewing === r.track.id ? `Stop the preview of ${r.track.name}` : `Play a preview of ${r.track.name}`}
                        onClick={() => togglePreview(r.track)}
                      >
                        {previewing === r.track.id
                          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
                          : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div className={s.legend}>
              <span className={s.legendSwatch} aria-hidden="true" />
              Shaded band = range of your instrument ({instLabel}: {noteNameFlat(bandLo)}–{noteNameFlat(bandHi)}), before transposition
            </div>
          </fieldset>

          <aside className={s.side}>
            <section className={s.card} aria-labelledby="selected-h">
              <h2 id="selected-h" className={s.cardTitle}>Selected</h2>
              <div className={s.selectedName}>{selected.num} · {selected.track.name}</div>
              {selected.usable && selected.info.stats.maxSimultaneous === 1 && !selected.below && (
                <Hint tone="teal" icon="✓">One note at a time — ready for the {instLabel}.</Hint>
              )}
              {selected.info.tags.includes('Chords') && (
                <Hint tone="amber" icon="!">
                  Plays up to {selected.info.stats.maxSimultaneous} notes at once. A {instLabel} plays one, so we’ll reduce it to a
                  single line.
                </Hint>
              )}
              {selected.below && (
                <Hint tone="amber" icon="!">
                  {noteNameFlat(selected.info.stats.min)}–{noteNameFlat(selected.info.stats.max)} is far below the {instLabel}. It
                  will be moved up by octaves, which changes its character.
                </Hint>
              )}
              {selected.info.tags.includes('Chords') && (
                <label className={s.field}>
                  From chords, keep
                  <select
                    className={s.select} value={opts.keep}
                    onChange={e => setOpts({ ...opts, keep: e.target.value as 'top' | 'bottom' })}
                  >
                    <option value="top">Top note (usually the tune)</option>
                    <option value="bottom">Bottom note</option>
                  </select>
                </label>
              )}
            </section>

            <section className={s.card} aria-labelledby="extras-h">
              <h2 id="extras-h" className={s.cardTitle}>Extras on the sheet</h2>
              <label className={s.field}>
                Chord symbols from
                <select
                  className={s.select} value={opts.chordsFrom ?? ''}
                  onChange={e => setOpts({ ...opts, chordsFrom: e.target.value || null })}
                >
                  <option value="">None</option>
                  {selected.track.chords.length > 0 && <option value="file">Chord symbols in the file</option>}
                  {otherSources.map(r => <option key={r.track.id} value={r.track.id}>Detected from {r.track.name}</option>)}
                </select>
              </label>
              <label className={s.field}>
                Lyrics from
                <select
                  className={s.select} value={opts.lyricsFrom ?? ''}
                  onChange={e => setOpts({ ...opts, lyricsFrom: e.target.value || null })}
                >
                  <option value="">None</option>
                  {lyricSources.map(r => <option key={r.track.id} value={r.track.id}>{r.num} · {r.track.name}</option>)}
                </select>
              </label>
            </section>

            {error && <p role="alert" className={s.error}>{error}</p>}

            <button type="button" className={s.cta} data-primary="" onClick={make} disabled={!selected.usable}>
              Make the sheet from {selected.track.name}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
              </svg>
            </button>
          </aside>
        </div>

        <p className={s.note}>MusicXML files list parts here; a part with two voices shows each voice as its own row.</p>
      </div>
    </>
  );
}

function Hint({ tone, icon, children }: { tone: 'teal' | 'amber'; icon: string; children: ReactNode }) {
  return (
    <div className={`${s.hint} ${tone === 'teal' ? s.hintTeal : s.hintAmber}`}>
      <span className={s.hintIcon} aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

/** "single notes, lyrics attached, highest average pitch" for the recommended row. */
function recommendReasons(rec: Row, rows: Row[]): string {
  const out: string[] = [];
  if (rec.info.tags.includes('Single notes')) out.push('single notes');
  if (rec.info.tags.includes('Lyrics')) out.push('lyrics attached');
  const avg = (r: Row) => r.track.notes.reduce((a, n) => a + n.midi, 0) / r.track.notes.length;
  if (rows.filter(r => r.usable).every(r => r === rec || avg(r) < avg(rec))) out.push('highest average pitch');
  return out.join(', ');
}
