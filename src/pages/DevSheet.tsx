import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { ORDER } from '../domain/instruments';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { InstId } from '../domain/types';
import { Paper } from '../render/Paper';
import { layoutSheet } from '../render/sheetLayout';

/** Dev-only preview of the sheet renderer: /dev/sheet?inst=<id>&shift=<n>. */
export default function DevSheet() {
  const [params] = useSearchParams();
  const raw = params.get('inst');
  const id: InstId = ORDER.includes(raw as InstId) ? (raw as InstId) : 'xc';
  const shiftParam = params.get('shift');
  const [title, setTitle] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState<string | null>(null);

  const { doc, derived, layout } = useMemo(() => {
    const base = sampleDoc(id);
    const shift = shiftParam !== null && Number.isInteger(Number(shiftParam)) ? Number(shiftParam) : base.shift;
    const doc = { ...base, shift, title: title ?? base.title, subtitle: subtitle ?? base.subtitle };
    const derived = derive(doc, DEFAULT_PREFS);
    return { doc, derived, layout: layoutSheet(doc, derived) };
  }, [id, shiftParam, title, subtitle]);

  return (
    <div style={{ overflowX: 'auto' }}>
      <Paper doc={doc} derived={derived} layout={layout} playingId={null} selectedId={null} onSelect={() => {}} onTitle={setTitle} onSubtitle={setSubtitle} />
    </div>
  );
}
