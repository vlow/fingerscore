import { act, render } from '@testing-library/react';
import { vi } from 'vitest';
import { sampleDoc } from '../../domain/fixture';
import { usePlayback } from './usePlayback';

type OnEvent = (id: string | null) => void;
const player = vi.hoisted(() => ({ onEvent: null as OnEvent | null, playing: true }));
vi.mock('../../audio/player', () => ({
  createPlayer: () => ({
    play: (_s: unknown, _d: unknown, onEvent: OnEvent) => { player.onEvent = onEvent; },
    stop: () => {},
    get playing() { return player.playing; },
  }),
}));

function Probe({ onRender }: { onRender(api: ReturnType<typeof usePlayback>): void }) {
  const api = usePlayback(sampleDoc('asax'), null);
  onRender(api);
  return <p data-testid="playing">{api.playingId ?? 'none'}</p>;
}

describe('the highlight of a playing sheet', () => {
  it('draws every mark, also when two timers are due together: each one is in the DOM before the next runs', () => {
    let api!: ReturnType<typeof usePlayback>;
    const { getByTestId } = render(<Probe onRender={a => { api = a; }} />);
    act(() => { api.togglePlay(); });
    const shown = () => getByTestId('playing').textContent;
    // what the timers do: they run in the same task queue turn, outside React's batching of an event or of act
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    try {
      const seen: (string | null)[] = [];
      for (const id of ['a', 'b', 'c']) { player.onEvent!(id); seen.push(shown()); }   // no await between: one batch without flushSync
      expect(seen).toEqual(['a', 'b', 'c']);
      player.playing = false;
      player.onEvent!(null);
    } finally {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    }
  });
});
