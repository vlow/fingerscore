import type { Derived } from '../domain/derive';
import type { BeamGroup, SystemBars } from './layout';
import type { Placed } from './TupletMark';

/** What a system draws its notes from: each event with its place, the events by id, the beam groups and the group of each beamed event. */
export function systemPlacement(derived: Derived, system: SystemBars, beams: BeamGroup[][]) {
  const placed: Placed[] = system.bars.flatMap(bar => bar.events.map(e => ({ ev: derived.byId[e.id], x: e.x, y: e.y })));
  const byId = new Map(placed.map(n => [n.ev.id, n]));
  const groups = system.bars.flatMap(bar => beams[bar.bar] ?? []);
  const beamOf = new Map(groups.flatMap(g => g.ids.map(id => [id, g] as const)));
  return { placed, byId, groups, beamOf };
}
