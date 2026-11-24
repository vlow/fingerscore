import { mkdirSync, writeFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { BASELINE_FILE, beyondBaseline, keyOf, staleBaseline, type AxeFinding, type Found, type Kind } from './a11yBaseline';
import { STATES } from './states';

/**
 * Accessibility scan and two measured checks (target size, visible focus) over the named states.
 * While the app has findings, they are listed in a11y-baseline.json and the tests fail only on a finding beyond it
 * or on an entry that no longer applies. A11Y_WRITE_BASELINE=1 rewrites the file from the current findings.
 * A11Y_SHOTS=<folder> saves a full-page picture of each state as <folder>/<id>.png.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const WRITE = process.env.A11Y_WRITE_BASELINE === '1';
const SHOTS = process.env.A11Y_SHOTS;

/** An exclusion covers one rule on one element of one state and carries its reason. src/a11yExclusions.test.ts pins the count. None is in use. */
export const EXCLUSIONS: { state: string; rule: string; target: string; reason: string }[] = [];

const written: Record<Kind, Record<string, Found[]>> = { axe: {}, targets: {}, focus: {} };

test.afterAll(() => {
  if (!WRITE) return;
  const sorted = (list: Found[]) => [...new Map(list.map(f => [keyOf(f), f])).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, f]) => f);
  const out = Object.fromEntries((Object.keys(written) as Kind[]).map(kind => [kind,
    Object.fromEntries(Object.entries(written[kind]).filter(([, list]) => list.length > 0).map(([id, list]) => [id, sorted(list)]))]));
  writeFileSync(BASELINE_FILE, JSON.stringify(out, null, 2) + '\n');
});

/** Compares the findings with the baseline, or records them in write mode. */
function judge(kind: Kind, stateId: string, found: Found[]) {
  if (WRITE) { written[kind][stateId] = found; return; }
  expect(beyondBaseline(kind, stateId, found), `${kind} findings beyond the baseline in ${stateId}`).toEqual([]);
  expect(staleBaseline(kind, stateId, found), `${kind} baseline entries no longer found in ${stateId}`).toEqual([]);
}

/** Page-side helpers, plain JavaScript so no compiler adds helpers to it. Descriptions use role, name and text only. */
const HELPERS = `
window.__a11y = (() => {
  const ROLE = { a: 'link', button: 'button', select: 'combobox', textarea: 'textbox', h1: 'heading', h2: 'heading', h3: 'heading', nav: 'navigation', li: 'listitem', ul: 'list', p: 'paragraph', svg: 'graphics', img: 'img', dialog: 'dialog', label: 'label' };
  const clean = s => (s || '').replace(/\\s+/g, ' ').trim().replace(/(just now|\\d+ ?[a-z]+ ago)/g, 'TIME').slice(0, 50);
  const roleOf = el => {
    const tag = el.tagName.toLowerCase();
    if (el.getAttribute('role')) return el.getAttribute('role');
    if (tag === 'input') return { checkbox: 'checkbox', radio: 'radio', range: 'slider', search: 'searchbox', file: 'file' }[el.type] || 'textbox';
    return ROLE[tag] || tag;
  };
  const nameOf = el => {
    const label = el.getAttribute('aria-label');
    if (label) return clean(label);
    const by = el.getAttribute('aria-labelledby');
    if (by) return clean(by.split(' ').map(id => document.getElementById(id)?.textContent || '').join(' '));
    if (el.labels && el.labels.length) return clean([...el.labels].map(l => l.textContent).join(' '));
    const alt = el.getAttribute('alt');
    if (alt) return clean(alt);
    const text = clean(el.textContent);
    if (text) return text;
    return clean(el.getAttribute('title') || el.getAttribute('placeholder') || '');
  };
  const stable = el => {
    for (const a of el.getAttributeNames()) if (a.startsWith('data-') && a !== 'data-primary') return '[' + a + (el.getAttribute(a) ? '=' + el.getAttribute(a).slice(0, 30) : '') + ']';
    return '';
  };
  const describe = el => {
    if (!el) throw new Error('describe: the element does not resolve');
    const name = nameOf(el);
    const base = roleOf(el) + (name ? ' "' + name + '"' : stable(el));
    if (name || stable(el)) return base;
    const up = el.parentElement && el.parentElement.closest('[role],[data-testid],[aria-label],section,nav,header,footer,main');
    return base + (up ? ' in ' + roleOf(up) + (nameOf(up) && up.getAttribute('aria-label') ? ' "' + nameOf(up) + '"' : '') : '');
  };

  // Colours: computed values are rgb() or rgba().
  const parse = (text, el) => {
    const m = /^rgba?\\(([^)]+)\\)$/.exec(text.trim());
    if (!m) throw new Error('colour not understood on ' + describe(el) + ': ' + text);
    const n = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
    return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] : 1 };
  };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  /** The background behind an element: the ancestors' backgrounds over white. */
  const behind = el => {
    const chain = [];
    for (let e = el.parentElement; e; e = e.parentElement) chain.unshift(e);
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (const e of chain) { const c = parse(getComputedStyle(e).backgroundColor, e); if (c.a > 0) bg = over(c, bg); }
    return bg;
  };
  const snap = el => {
    const cs = getComputedStyle(el);
    const outer = behind(el);
    const own = over(parse(cs.backgroundColor, el), outer);
    return {
      outline: cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0 ? null : cs.outlineColor,
      shadow: cs.boxShadow,
      border: ['Top', 'Right', 'Bottom', 'Left'].map(s => parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none' ? cs['border' + s + 'Color'] : null),
      outer, own, el,
    };
  };
  const NONE = { outline: null, shadow: 'none', border: [null, null, null, null] };
  /** The best contrast of a mark gained on focus; 0 when there is none. Background change alone does not count. */
  const markRatio = (on, off) => {
    off = off || NONE;
    let best = 0;
    const against = (colour, ground) => {
      const c = parse(colour, on.el);
      if (c.a === 0) return;
      best = Math.max(best, ratio(over(c, ground), ground));
    };
    if (on.outline && on.outline !== off.outline) against(on.outline, on.outer);
    if (on.shadow !== 'none' && on.shadow !== off.shadow) {
      for (const layer of on.shadow.match(/rgba?\\([^)]*\\)[^,]*(?:\\([^)]*\\)[^,]*)*/g) || []) {
        const colour = /rgba?\\([^)]*\\)/.exec(layer)[0];
        const sizes = layer.replace(colour, '').replace('inset', '').match(/-?[0-9.]+px/g) || [];
        if (!sizes.some(v => parseFloat(v) !== 0)) continue;
        against(colour, layer.includes('inset') ? on.own : on.outer);
      }
    }
    on.border.forEach((colour, i) => { if (colour && colour !== off.border[i]) against(colour, on.own); });
    return best;
  };
  // An animation that never ends cannot be waited for.
  const settled = () => Promise.all(document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => undefined)));
  return { describe, roleOf, nameOf, snap, markRatio, settled };
})();
`;

const CONTROLS = 'button, a[href], input, select, textarea, [role=button], [role=menuitem], [role=radio], [role=tab], [tabindex]:not([tabindex="-1"])';

async function prepare(page: Page, id: string) {
  const state = STATES.find(s => s.id === id)!;
  await state.open(page);
  await page.addScriptTag({ content: HELPERS });
}

async function axeFindings(page: Page, stateId: string): Promise<AxeFinding[]> {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const found: AxeFinding[] = [];
  for (const violation of result.violations) {
    for (const node of violation.nodes) {
      const selector = node.target.find((t): t is string => typeof t === 'string')!;
      const target = await page.evaluate(sel => window.__a11y.describe(document.querySelector(sel)), selector);
      found.push({ rule: violation.id, target });
    }
  }
  return found.filter(f => !EXCLUSIONS.some(e => e.state === stateId && e.rule === f.rule && e.target === f.target));
}

/** Identical descriptions stay visible as "name ×2", so a second identical control cannot hide behind the first. */
function counted(list: string[]): string[] {
  const counts = new Map<string, number>();
  for (const item of list) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts].map(([item, n]) => (n > 1 ? `${item} ×${n}` : item));
}

interface TargetResult { failures: string[]; near: string[]; measured: number; inside: number; overlayOpen: boolean }

/**
 * Controls whose click area is smaller than the size they need; "role name (need px)".
 * The area is the union of the control's box and its labels' boxes. While a menu or dialog is open, only its own
 * controls are measured: the others lie under it. `near` lists every control measured within 2 px of its threshold.
 * `measured` counts the controls probed and `inside` those among them that lie in an open overlay.
 */
async function smallTargets(page: Page): Promise<TargetResult> {
  return page.evaluate(selector => {
    const failures: string[] = [];
    const near: string[] = [];
    let measured = 0;
    let inside = 0;
    // An overlay counts when a person can see it: not hidden, inert, transparent or outside the viewport.
    const shown = (e: Element) => {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
      if (e.closest('[aria-hidden="true"], [inert]')) return false;
      for (let n: Element | null = e; n; n = n.parentElement) if (getComputedStyle(n).opacity === '0') return false;
      return getComputedStyle(e).visibility !== 'hidden';
    };
    const overlays = [...document.querySelectorAll('[role=menu], [role=dialog], dialog[open]')].filter(shown);
    for (const el of [...document.querySelectorAll<HTMLElement>(selector)]) {
      if (!el.isConnected || (el as HTMLButtonElement).disabled || el.closest('[inert]')) continue;
      if (overlays.length > 0 && !overlays.some(o => o.contains(el))) continue;
      // A link inside a sentence is exempt: its nearest paragraph or list item holds other text.
      const block = el.closest('p, li');
      if (el.tagName === 'A' && block && (block.textContent || '').trim() !== (el.textContent || '').trim()) continue;
      const look = getComputedStyle(el);
      if (look.visibility === 'hidden' || look.opacity === '0') continue;
      const labels = (el as HTMLInputElement).labels ? [...(el as HTMLInputElement).labels!] : [];
      const boxes = () => [el, ...labels].map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
      if (boxes().length === 0 || el.getBoundingClientRect().width === 0) continue;
      const outside = () => boxes().some(r => r.bottom < 0 || r.top < 0 || r.bottom > innerHeight || r.right < 0 || r.left < 0 || r.right > innerWidth);
      if (outside()) {
        el.scrollIntoView({ block: 'center', inline: 'center' });
        if (!el.isConnected) continue;
      }
      const rects = boxes();
      const cx = (Math.min(...rects.map(r => r.left)) + Math.max(...rects.map(r => r.right))) / 2;
      const cy = (Math.min(...rects.map(r => r.top)) + Math.max(...rects.map(r => r.bottom))) / 2;
      const handled = (hit: Element | null) => !!hit && (el.contains(hit) || labels.some(l => l.contains(hit)));
      const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max - 1);
      const takes = (d: number) => [[-d, -d], [d, -d], [-d, d], [d, d]]
        .every(([dx, dy]) => handled(document.elementFromPoint(clamp(cx + dx, innerWidth), clamp(cy + dy, innerHeight))));
      const need = el.hasAttribute('data-primary') || el.closest('header nav') ? 44 : 36;
      const passes = takes(need / 2 - 1);
      // The measured extent: the largest square around the centre that the control takes whole.
      let lo = 0, hi = need + 10;
      if (takes(0)) for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (takes(mid)) lo = mid; else hi = mid; }
      const extent = takes(0) ? 2 * lo + 2 : 0;
      measured++;
      if (overlays.some(o => o.contains(el))) inside++;
      const description = window.__a11y.describe(el);
      if (!passes) failures.push(`${description} (${need} px)`);
      if (Math.abs(extent - need) <= 2) near.push(`${description}: ${passes ? 'passes' : 'fails'} at about ${extent.toFixed(1)} px, needs ${need}`);
    }
    return { failures, near, measured, inside, overlayOpen: overlays.length > 0 };
  }, CONTROLS);
}

interface FocusResult { failures: string[]; ratios: string[] }

/** The most Tab stops a walk may take before it counts as a trap. */
const MAX_STOPS = 200;

/**
 * Tab stops that show no mark of at least 3:1: an outline, box-shadow or border colour gained on focus.
 * Outside a menu or dialog the walk starts at the top of the page and its first stop must be the page's first control.
 * Returns the unmarked stops and, for the report, each stop's best ratio.
 */
async function unmarkedStops(page: Page): Promise<FocusResult> {
  const startAtTop = await page.evaluate(selector => {
    const overlay = [...document.querySelectorAll('[role=menu], [role=dialog], dialog[open]')].some(e => e.getBoundingClientRect().width > 0);
    const w = window as unknown as { __stops: unknown[] };
    w.__stops = [];
    if (overlay) return null;
    scrollTo(0, 0);
    (document.activeElement as HTMLElement | null)?.blur();
    // A removed node leaves the sequential focus start where it stood: before everything else.
    const marker = document.createElement('span');
    marker.tabIndex = -1;
    document.body.prepend(marker);
    marker.focus();
    marker.remove();
    const first = [...document.querySelectorAll<HTMLElement>(selector)].find(e => {
      const r = e.getBoundingClientRect();
      return !(e as HTMLButtonElement).disabled && e.tabIndex >= 0 && !e.closest('[inert]') && r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    });
    return first ? window.__a11y.describe(first) : '';
  }, CONTROLS);
  const record = () => page.evaluate(async () => {
    await window.__a11y.settled();
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'end';
    const w = window as unknown as { __stops: { el: HTMLElement; on: unknown }[] };
    if (w.__stops.length > 0 && el === w.__stops[0].el) return 'wrapped';
    // The mark may sit on the control or, as with :focus-within, on one of its two nearest ancestors.
    const chain = [el, el.parentElement, el.parentElement?.parentElement].filter((e): e is HTMLElement => !!e && e !== document.body);
    w.__stops.push({ el, on: chain.map(e => ({ el: e, snap: window.__a11y.snap(e) })) });
    return 'stop';
  });
  let ended = 'cap';
  for (let i = 0; i < MAX_STOPS; i++) {
    await page.keyboard.press('Tab');
    const result = await record();
    if (i === 0 && startAtTop !== null) {
      const first = await page.evaluate(() => window.__a11y.describe(document.activeElement));
      expect(first, 'the first Tab stop is the first control of the page').toBe(startAtTop);
    }
    if (result !== 'stop') { ended = result; break; }
  }
  expect(await page.evaluate(() => (window as unknown as { __stops: unknown[] }).__stops.length), 'Tab stops walked').toBeGreaterThan(0);
  // The walk ends when the focus wraps to the first stop or leaves the page after the last one (Chromium moves it to the
  // browser and the body). Both mean no stop traps it. Only the cap means a trap.
  expect(['wrapped', 'end'], `the Tab walk hit the cap of ${MAX_STOPS} stops: a trap`).toContain(ended);
  return page.evaluate(async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    await window.__a11y.settled();
    const w = window as unknown as { __stops: { el: HTMLElement; on: { el: HTMLElement; snap: unknown }[] }[] };
    const failures: string[] = [];
    const ratios: string[] = [];
    for (const stop of w.__stops) {
      const r = Math.max(...stop.on.map(({ el, snap }) => window.__a11y.markRatio(snap, el.isConnected ? window.__a11y.snap(el) : null)));
      const description = window.__a11y.describe(stop.el);
      ratios.push(`${description}: ${r.toFixed(2)}:1`);
      if (r < 3) failures.push(description);
    }
    return { failures, ratios };
  });
}

declare global {
  interface Window {
    __a11y: {
      describe(el: Element | null): string;
      snap(el: Element): unknown;
      markRatio(on: unknown, off: unknown): number;
      settled(): Promise<unknown>;
    };
  }
}

for (const state of STATES) {
  test.describe(state.id, () => {
    test('landmark', async ({ page }) => {
      await state.open(page);
      await expect(state.landmark(page).first()).toBeVisible();
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/${state.id}.png`, fullPage: true });
      }
    });

    test('scan', async ({ page }) => {
      await prepare(page, state.id);
      judge('axe', state.id, await axeFindings(page, state.id));
    });

    test('targets', async ({ page }) => {
      await prepare(page, state.id);
      const { failures, near, measured, inside, overlayOpen } = await smallTargets(page);
      expect(measured, 'controls measured').toBeGreaterThan(0);
      if (overlayOpen) expect(inside, 'measured controls inside the open overlay').toBeGreaterThan(0);
      if (process.env.A11Y_NEAR) for (const line of near) console.log(`NEAR ${state.id}: ${line}`);
      judge('targets', state.id, counted(failures));
    });

    test('focus', async ({ page }) => {
      await prepare(page, state.id);
      const { failures, ratios } = await unmarkedStops(page);
      if (process.env.A11Y_NEAR) for (const line of ratios) console.log(`FOCUS ${state.id}: ${line}`);
      judge('focus', state.id, counted(failures));
    });
  });
}
