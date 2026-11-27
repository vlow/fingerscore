import type { Instrument } from '../../domain/instruments';
import type { InstId } from '../../domain/types';
import { CLARINET } from './clarinetModel';
import { FLUTE } from './fluteModel';
import type { InstrumentModel } from './model';
import { RECORDER } from './recorderModel';
import { SAX } from './saxModel';
import { SOPRANO_SAX } from './sopranoSaxModel';
import { XAPHOON } from './xaphoonModel';

/** One model per fingering-chart family: every instrument of a family shares its chart, so it shares its drawing. */
export const MODELS: Record<Instrument['kind'], InstrumentModel> = {
  sax: SAX,
  cl: CLARINET,
  fl: FLUTE,
  rec: RECORDER,
  xaph: XAPHOON,
};

/** Soprano saxophones come straight or curved; the curved one has the alto's shape, with the same keys. */
export type SopranoShape = 'straight' | 'curved';
export const SOPRANO_SHAPES: Record<SopranoShape, InstrumentModel> = {
  straight: SOPRANO_SAX,
  curved: { ...SAX, name: 'Curved soprano saxophone' },
};

/** The model an instrument is drawn with. Only the soprano sax has a choice of shape. */
export function modelFor(id: InstId, kind: Instrument['kind'], soprano: SopranoShape = 'straight'): InstrumentModel {
  return id === 'ssax' ? SOPRANO_SHAPES[soprano] : MODELS[kind];
}
