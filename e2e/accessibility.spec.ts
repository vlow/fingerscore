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

/**
 * An exclusion covers one rule on one element of one state and carries its reason. src/a11yExclusions.test.ts pins the count.
 * ARIA lets a menu own only menu items, groups and separators. A role that fits a link (group, none, presentation) does
 * not take it out of the menu's children: axe walks through groups, and a focusable element keeps its role.
 */
export const EXCLUSIONS: { state: string; rule: string; target: string; reason: string }[] = [
  {
    state: 'sheet-file-menu',
    rule: 'aria-required-children',
    target: 'menu "File"',
    reason: 'The import notice with its "Terms of Use" link sits between two menu items by design (part 6a). It is not a menu item, the arrow keys skip it, and Tab reaches the link. No ARIA role makes a link a valid child of a menu.',
  },
];

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
    if (!el) return 'unknown';
    const name = nameOf(el);
    const base = roleOf(el) + (name ? ' "' + name + '"' : stable(el));
    if (name || stable(el)) return base;
    const up = el.parentElement && el.parentElement.closest('[role],[data-testid],[aria-label],section,nav,header,footer,main');
    return base + (up ? ' in ' + roleOf(up) + (nameOf(up) && up.getAttribute('aria-label') ? ' "' + nameOf(up) + '"' : '') : '');
  };
  return { describe, roleOf, nameOf };
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

/** Controls whose click area is smaller than the size they need. Returns "role name (need px)". */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(selector => {
    const failures: string[] = [];
    const controls = [...document.querySelectorAll<HTMLElement>(selector)];
    for (const el of controls) {
      if (!el.isConnected || (el as HTMLButtonElement).disabled || el.closest('[inert]')) continue;
      const parent = el.parentElement;
      // A link inside a sentence is exempt.
      if (el.tagName === 'A' && parent && ['P', 'LI', 'SPAN'].includes(parent.tagName)
        && (parent.textContent || '').trim() !== (el.textContent || '').trim()) continue;
      const look = getComputedStyle(el);
      if (look.visibility === 'hidden' || look.opacity === '0') continue;
      let box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) {
        el.scrollIntoView({ block: 'center', inline: 'center' });
        if (!el.isConnected) continue;
        box = el.getBoundingClientRect();
      }
      const need = el.hasAttribute('data-primary') || el.closest('header nav') ? 44 : 36;
      const d = need / 2 - 1;
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const labels = (el as HTMLInputElement).labels ? [...(el as HTMLInputElement).labels!] : [];
      const handled = (hit: Element | null) => !!hit && (el.contains(hit) || labels.some(l => l.contains(hit)));
      const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max - 1);
      const points = [[-d, -d], [d, -d], [-d, d], [d, d]].map(([dx, dy]) => [clamp(cx + dx, innerWidth), clamp(cy + dy, innerHeight)]);
      if (!points.every(([x, y]) => handled(document.elementFromPoint(x, y)))) {
        failures.push(`${window.__a11y.describe(el)} (${need} px)`);
      }
    }
    return failures;
  }, CONTROLS);
}

/** Tab stops that show no focus mark. Returns the descriptions of those stops. */
async function unmarkedStops(page: Page): Promise<string[]> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    (window as unknown as { __stops: unknown[] }).__stops = [];
  });
  const mark = () => page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    const w = window as unknown as { __stops: { el: HTMLElement; outline: string; shadow: string }[] };
    w.__stops.push({
      el,
      outline: style.outlineStyle === 'none' || parseFloat(style.outlineWidth) === 0 ? 'none' : `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
      shadow: style.boxShadow,
    });
    return el === w.__stops[0].el && w.__stops.length > 1 ? 'again' : 'stop';
  });
  for (let i = 0; i < 200; i++) {
    await page.keyboard.press('Tab');
    const result = await mark();
    if (result === null || result === 'again') break;
  }
  return page.evaluate(() => {
    const w = window as unknown as { __stops: { el: HTMLElement; outline: string; shadow: string }[] };
    const stops = w.__stops;
    if (stops.length > 1 && stops[stops.length - 1].el === stops[0].el) stops.pop();
    (document.activeElement as HTMLElement | null)?.blur();
    const failures: string[] = [];
    for (const stop of stops) {
      const rest = stop.el.isConnected ? getComputedStyle(stop.el) : null;
      const outlineShown = stop.outline !== 'none' && (!rest || stop.outline !== (rest.outlineStyle === 'none' || parseFloat(rest.outlineWidth) === 0 ? 'none' : `${rest.outlineStyle} ${rest.outlineWidth} ${rest.outlineColor}`));
      const shadowShown = stop.shadow !== 'none' && (!rest || stop.shadow !== rest.boxShadow);
      if (!outlineShown && !shadowShown) failures.push(window.__a11y.describe(stop.el));
    }
    return failures;
  });
}

declare global {
  interface Window { __a11y: { describe(el: Element | null): string } }
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
      judge('targets', state.id, await smallTargets(page));
    });

    test('focus', async ({ page }) => {
      await prepare(page, state.id);
      judge('focus', state.id, await unmarkedStops(page));
    });
  });
}
