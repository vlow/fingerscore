import { useEffect, useMemo, useRef, useState } from 'react';
import { createPlayer, type Player } from '../../audio/player';
import { buildSchedule, firstTickOf, sliceSchedule } from '../../domain/playback';
import type { Doc } from '../../domain/types';

/** Play and stop from the transport or the sheet's Enter/Space, from the selected event when there is one. */
export function usePlayback(doc: Doc, selectedId: string | null) {
  // Playback. The player (and its AudioContext) is created on the first Play.
  const playerRef = useRef<Player | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playError, setPlayError] = useState(false);
  // Playback stops when what it plays changes: pitches, lengths, rests, ties, bars and their repeats, key, instrument,
  // tempo. Lyrics live on the events too, but typing one must not stop the music.
  const audible = useMemo(() => doc.score.map(b => `${b.cap}${b.rs ? 's' : ''}${b.re ? 'e' : ''}${b.volta}:`
    + b.ev.map(e => `${e.m},${e.d}${e.r ? 'r' : ''}${e.tie ? 't' : ''}`).join(';')).join('|'), [doc.score]);
  useEffect(() => () => playerRef.current?.stop(), [audible, doc.shift, doc.inst, doc.tempo]);

  function stopPlay() {
    playerRef.current?.stop();
    setPlaying(false);
    setPlayingId(null);
  }

  function togglePlay() {
    const current = playerRef.current;
    if (playing && current) {
      stopPlay();
      return;
    }
    try {
      const player = current ?? createPlayer();
      playerRef.current = player;
      const from = selectedId === null ? null : firstTickOf(doc, selectedId);
      const full = buildSchedule(doc);
      player.play(from === null ? full : sliceSchedule(full, from), doc, id => {
        setPlayingId(id);
        setPlaying(player.playing);
      });
      setPlayError(false);
      setPlaying(true);
    } catch {
      setPlayError(true);
      setPlaying(false);
      setPlayingId(null);
    }
  }

  return { playerRef, playing, playingId, playError, togglePlay, stopPlay };
}
