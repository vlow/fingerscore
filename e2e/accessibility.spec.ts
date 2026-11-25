import { mkdirSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openState, STATES } from './states';

/**
 * Accessibility scan and two measured checks (target size, visible focus) over the named states; each requires zero
 * findings beyond EXCLUSIONS. A11Y_SHOTS=<absolute folder> saves a full-page picture of each state as <folder>/<id>.png.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SHOTS = process.env.A11Y_SHOTS;
// A relative folder would land in the repository, where pictures never belong.
if (SHOTS && !isAbsolute(SHOTS)) throw new Error(`A11Y_SHOTS must be an absolute folder path (it is "${SHOTS}"): pictures are never written into the repository.`);

/** An exclusion covers one rule on one element of one state and carries its reason. src/a11yExclusions.test.ts pins the count. None is in use. */
export const EXCLUSIONS: { state: string; rule: string; target: string; reason: string }[] = [];

interface AxeFinding { rule: string; target: string }

/** The findings of one check in one state; none is allowed. */
function judge(kind: 'axe' | 'targets' | 'focus', stateId: string, found: (AxeFinding | string)[]) {
  expect(found, `${kind} findings in ${stateId}`).toEqual([]);
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
  // A control or overlay counts when a person can see it: not empty, outside the viewport, hidden, inert or transparent.
  const shown = e => {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
    if (e.closest('[aria-hidden="true"], [inert]')) return false;
    for (let n = e; n; n = n.parentElement) if (getComputedStyle(n).opacity === '0') return false;
    return getComputedStyle(e).visibility !== 'hidden';
  };
  const overlays = () => [...document.querySelectorAll('[role=menu], [role=dialog], dialog[open]')].filter(shown);
  // The controls the Tab key reaches, in document order (no state uses a positive tabindex).
  const tabbables = selector => [...document.querySelectorAll(selector)].filter(e => {
    const r = e.getBoundingClientRect();
    return !e.disabled && e.tabIndex >= 0 && !e.closest('[inert]') && r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
  });
  return { describe, snap, markRatio, settled, shown, overlays, tabbables };
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
    const overlays = window.__a11y.overlays();
    for (const el of [...document.querySelectorAll<HTMLElement>(selector)]) {
      if (!el.isConnected || (el as HTMLButtonElement).disabled || el.closest('[inert]')) continue;
      if (overlays.length > 0 && !overlays.some(o => o.contains(el))) continue;
      // A link inside a sentence is exempt: its nearest paragraph or list item holds other text. A menu item is not a link in a sentence.
      const block = el.closest('p, li');
      if (el.tagName === 'A' && el.getAttribute('role') !== 'menuitem' && block && (block.textContent || '').trim() !== (el.textContent || '').trim()) continue;
      const look = getComputedStyle(el);
      if (look.visibility === 'hidden' || look.opacity === '0') continue;
      const labels = (el as HTMLInputElement).labels ? [...(el as HTMLInputElement).labels!] : [];
      const boxes = () => [el, ...labels].map(e => e.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
      if (boxes().length === 0 || el.getBoundingClientRect().width === 0) continue;
      const outside = () => boxes().some(r => r.bottom < 0 || r.top < 0 || r.bottom > innerHeight || r.right < 0 || r.left < 0 || r.right > innerWidth);
      if (outside()) {
        // Centre it vertically; scroll sideways only as far as needed, so that a scrolled container does not clip its neighbours.
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        if (!el.isConnected) continue;
      }
      const rects = boxes();
      const cx = (Math.min(...rects.map(r => r.left)) + Math.max(...rects.map(r => r.right))) / 2;
      const cy = (Math.min(...rects.map(r => r.top)) + Math.max(...rects.map(r => r.bottom))) / 2;
      const handled = (hit: Element | null) => !!hit && (el.contains(hit) || labels.some(l => l.contains(hit)));
      const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max - 1);
      const takes = (d: number) => [[-d, -d], [d, -d], [-d, d], [d, d]]
        .every(([dx, dy]) => handled(document.elementFromPoint(clamp(cx + dx, innerWidth), clamp(cy + dy, innerHeight))));
      // A pill on the paper must stay under its note, so it is held to 24 px like a note; every other control to 36 px.
      const onPaper = el.matches('[aria-haspopup=dialog]') && !!el.closest('[data-print-paper]');
      const need = el.hasAttribute('data-primary') || el.closest('header nav') ? 44 : onPaper ? 24 : 36;
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
 * Stops that show no mark of at least 3:1: an outline, box-shadow or border colour gained on focus.
 * Outside a menu or dialog the walk uses Tab, starts at the top of the page, its first stop must be the page's first
 * control, and when it ends by leaving the page its last stop must be the page's last control. In a menu the walk uses
 * ArrowDown from the focused item until the focus returns to it, and it must visit every item.
 * Returns the unmarked stops and, for the report, each stop's best ratio.
 */
async function unmarkedStops(page: Page): Promise<FocusResult> {
  const start = await page.evaluate(selector => {
    const overlays = window.__a11y.overlays();
    const w = window as unknown as { __stops: unknown[]; __last: Element | null };
    w.__stops = [];
    w.__last = null;
    const menu = overlays.find(o => o.getAttribute('role') === 'menu');
    if (menu) return { first: null, menuItems: menu.querySelectorAll('[role=menuitem]:not([aria-disabled=true])').length, menuHasFocus: menu.contains(document.activeElement) };
    if (overlays.length > 0) return { first: null, menuItems: 0, menuHasFocus: false };
    scrollTo(0, 0);
    (document.activeElement as HTMLElement | null)?.blur();
    // A removed node leaves the sequential focus start where it stood: before everything else.
    const marker = document.createElement('span');
    marker.tabIndex = -1;
    document.body.prepend(marker);
    marker.focus();
    marker.remove();
    const all = window.__a11y.tabbables(selector);
    w.__last = all[all.length - 1] ?? null;
    return { first: all[0] ? window.__a11y.describe(all[0]) : '', menuItems: 0, menuHasFocus: false };
  }, CONTROLS);
  const inMenu = start.menuItems > 0;
  if (inMenu) expect(start.menuHasFocus, 'the menu has the focus when it is open').toBe(true);
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
    // A menu starts on its first item: that item is the first stop. Home puts the focus there again by keyboard, as it is for a
    // person who opened the menu with Enter; the menu opened by a click shows no focus ring until a key is pressed.
    if (inMenu && i === 0) await page.keyboard.press('Home');
    else await page.keyboard.press(inMenu ? 'ArrowDown' : 'Tab');
    const result = await record();
    if (i === 0 && start.first !== null) {
      const first = await page.evaluate(() => window.__a11y.describe(document.activeElement));
      expect(first, 'the first Tab stop is the first control of the page').toBe(start.first);
    }
    if (result !== 'stop') { ended = result; break; }
  }
  const stops = await page.evaluate(() => (window as unknown as { __stops: unknown[] }).__stops.length);
  expect(stops, 'stops walked').toBeGreaterThan(0);
  // The walk ends when the focus wraps to the first stop or leaves the page after the last one (Chromium moves it to the
  // browser and the body). Both mean no stop traps it. Only the cap means a trap.
  expect(['wrapped', 'end'], `the walk hit the cap of ${MAX_STOPS} stops: a trap`).toContain(ended);
  if (inMenu) {
    expect(ended, 'ArrowDown comes back to the first item').toBe('wrapped');
    expect(stops, 'the walk visited every menu item').toBe(start.menuItems);
  } else if (start.first !== null && ended === 'end') {
    // Leaving the page after the last stop only counts when that stop is the page's last control: a walk cannot pass by stopping early.
    const last = await page.evaluate(() => {
      const w = window as unknown as { __stops: { el: HTMLElement }[]; __last: Element | null };
      return { same: w.__stops[w.__stops.length - 1]!.el === w.__last, stop: window.__a11y.describe(w.__stops[w.__stops.length - 1]!.el), expected: w.__last ? window.__a11y.describe(w.__last) : '' };
    });
    expect(last.stop, 'the last Tab stop is the last control of the page').toBe(last.expected);
    expect(last.same, 'the last Tab stop is the last control of the page (same element)').toBe(true);
  }
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
      shown(el: Element): boolean;
      overlays(): Element[];
      tabbables(selector: string): HTMLElement[];
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

    // The same scan in dark mode: no theme is stored, so the page follows the dark system (dark mode design 4.5).
    test('scan (dark)', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await prepare(page, state.id);
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'the page is dark').toBe('rgb(15, 17, 20)');
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

const SHEET_LABEL = 'Sheet music. Arrow keys select a note, Enter listens from it.';
const sheetGroup = (page: Page) => page.getByRole('group', { name: SHEET_LABEL });
const modeRadio = (page: Page, name: 'View' | 'Edit notes' | 'Lyrics' | 'Chords') =>
  page.getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name });
const polite = (page: Page) => sheetGroup(page).locator('[aria-live=polite]');

/** The most Tab presses `tabTo` makes before it gives up. */
const MAX_PRESSES = 200;

/** Presses Tab (or Shift+Tab) until `target` has the focus, so the test also proves that the keyboard reaches it. */
async function tabTo(page: Page, target: Locator, key: 'Tab' | 'Shift+Tab' = 'Tab') {
  // Tab is not pressed while the page still loads: the target must be on the screen first.
  await expect(target.first()).toBeVisible();
  const here = () => target.first().evaluate(el => el === document.activeElement, undefined, { timeout: 500 }).catch(() => false);
  for (let i = 0; i < MAX_PRESSES && !(await here()); i++) await page.keyboard.press(key);
  await expect(target.first(), `${key} reaches the control`).toBeFocused();
}

/** The notes and lengths of the sheet as the drawing shows them: the pitch height of each head, the head, dots, flags and rest. */
async function notesAndLengths(page: Page): Promise<string[]> {
  return page.locator('[data-ev]').evaluateAll(groups => groups.map(g => {
    const head = g.querySelector('[data-head]');
    return [g.getAttribute('data-ev'), head ? `${head.getAttribute('data-head')}@${head.getAttribute('cy')}` : `rest:${g.querySelector('[data-rest]')?.getAttribute('data-rest')}`,
      `dots:${g.querySelectorAll('[data-dot]').length}`, `flags:${g.querySelectorAll('[data-flag]').length}`, `tied:${g.hasAttribute('data-tied')}`].join(' ');
  }));
}

test('keyboard only: from the instrument to play mode without a mouse', async ({ page }) => {
  // E2E_CPU_RATE=6 runs the test on a CPU six times slower, as a slow machine does (a way to look for races).
  // Unset, 0 and anything that is not a number above 1 leave the CPU alone.
  const cpuRate = Number(process.env.E2E_CPU_RATE);
  if (cpuRate > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  test.setTimeout(120_000);
  await page.goto('/');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('/');

  // Choose an instrument, open the sample, make the sheet.
  const tenor = page.getByRole('radio', { name: /^Tenor/ });
  await tabTo(page, tenor);
  await page.keyboard.press('Space');
  await expect(tenor).toHaveAttribute('aria-checked', 'true');
  await tabTo(page, page.getByRole('button', { name: /Try a sample/ }));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByRole('button', { name: /Make the sheet from/ }));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('system').first()).toBeVisible();

  // Edit notes: select the first note with the arrow keys and raise it by a semitone.
  await tabTo(page, modeRadio(page, 'View'));
  await page.keyboard.press('ArrowRight');
  await expect(modeRadio(page, 'Edit notes')).toHaveAttribute('aria-checked', 'true');
  await tabTo(page, sheetGroup(page));
  await page.keyboard.press('ArrowRight');
  await expect(polite(page)).toHaveText(/^Selected: /);
  const before = await polite(page).textContent();
  await page.keyboard.press('ArrowUp');
  await expect(polite(page)).not.toHaveText(before!);
  const edited = await notesAndLengths(page);

  // Lyrics: Tab from the sheet enters the Lyric field; the letters go into the field and edit no note.
  await tabTo(page, modeRadio(page, 'Edit notes'), 'Shift+Tab');
  await page.keyboard.press('ArrowRight');
  await expect(modeRadio(page, 'Lyrics')).toHaveAttribute('aria-checked', 'true');
  await tabTo(page, sheetGroup(page));
  await page.keyboard.press('Tab');
  const lyric = page.getByRole('textbox', { name: 'Lyric' });
  await expect(lyric).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Bag ace');
  await expect(lyric).toHaveValue('Bag ace');

  // Chords.
  await tabTo(page, modeRadio(page, 'Lyrics'), 'Shift+Tab');
  await page.keyboard.press('ArrowRight');
  await expect(modeRadio(page, 'Chords')).toHaveAttribute('aria-checked', 'true');
  await tabTo(page, sheetGroup(page));
  await page.keyboard.press('Tab');
  const chord = page.getByRole('textbox', { name: 'Chord' });
  await expect(chord).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Cage');
  await expect(chord).toHaveValue('Cage');
  expect(await notesAndLengths(page), 'typing in the fields changed no note or length').toEqual(edited);

  // Shift+Tab leaves the field for the sheet and Esc clears the selection, so Tab goes on to the pills under the charts.
  await page.keyboard.press('Shift+Tab');
  await expect(sheetGroup(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(polite(page)).toHaveText('Selection cleared');

  // Esc on the alternate-fingering popover returns the focus to its pill.
  const pill = page.getByRole('button', { name: /^⇅ \d+ alternate fingerings for / }).first();
  await tabTo(page, pill);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(pill).toBeFocused();

  // Save, then the File menu: Esc returns the focus to File; Download JSON starts a download.
  await tabTo(page, page.getByRole('button', { name: 'Save', exact: true }), 'Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  const file = page.getByRole('button', { name: /^File/ });
  await tabTo(page, file);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'File' })).toHaveCount(0);
  await expect(file).toBeFocused();
  await page.keyboard.press('Enter');
  const json = page.getByRole('menuitem', { name: 'Download JSON' });
  for (let i = 0; i < 6 && !(await json.evaluate(el => el === document.activeElement)); i++) await page.keyboard.press('ArrowDown');
  await expect(json).toBeFocused();
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toMatch(/\.json$/);

  // Play mode and back.
  const play = page.getByRole('button', { name: 'Play mode' });
  await tabTo(page, play);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Play mode' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Play mode' })).toHaveCount(0);
  await expect(play).toBeFocused();
});

test('announcements: refusals are alerts, save status and the live line are status regions', async ({ page }) => {
  await openState(page, 'start-refusal');
  await expect(page.getByRole('alert').filter({ hasText: 'is not a format fingerscore reads' })).toBeVisible();

  await openState(page, 'sheet-view');
  await expect(page.getByRole('status').filter({ hasText: /^Not saved yet$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
  // The live line of the paper carries the selection and PDF progress; it is a status region.
  await expect(polite(page)).toHaveAttribute('role', 'status');

  // A PDF that cannot show a character is an error: an alert, not a status.
  await openState(page, 'sheet-pdf-message');
  await expect(page.getByRole('alert').filter({ hasText: "The PDF can't show these characters" })).toBeVisible();
});

test('announcements: selecting a note says its pitch, length and bar', async ({ page }) => {
  await openState(page, 'sheet-view');
  await modeRadio(page, 'Edit notes').click();
  const panel = page.getByRole('group', { name: 'Edit notes panel' });
  const hits = page.locator('[data-hit]');
  // The length in the words of the note panel: its pressed length button, "Dotted" in front when that is pressed.
  for (const k of [1, 6, 11]) {
    await hits.nth(k).click();
    const line = (await polite(page).textContent())!;
    const length = ['Sixteenth', 'Eighth', 'Quarter', 'Half', 'Whole'];
    let base = '';
    for (const name of length) if ((await panel.getByRole('button', { name, exact: true }).getAttribute('aria-pressed')) === 'true') base = name.toLowerCase();
    const dotted = (await panel.getByRole('button', { name: 'Dotted' }).getAttribute('aria-pressed')) === 'true';
    expect(base, 'one length button is pressed').not.toBe('');
    expect(line).toMatch(new RegExp(`^Selected: (rest|[A-G][♭♯]?\\d), ${dotted ? 'dotted ' : ''}${base}, (bar \\d+|pickup bar)$`));
  }
});

test('paper description: the name stays, the description names the title, instrument and key and follows the title', async ({ page }) => {
  await openState(page, 'sheet-view');
  const paper = sheetGroup(page);
  await expect(paper).toHaveAccessibleName(SHEET_LABEL);
  const title = page.getByRole('textbox', { name: 'Sheet title' });
  const selected = (select: Locator) => select.evaluate(el => (el as HTMLSelectElement).selectedOptions[0].text);
  const instrument = await selected(page.locator('#inst'));
  const key = await selected(page.getByRole('combobox', { name: /^You read/ }));
  const written = await title.inputValue();
  await expect(paper).toHaveAccessibleDescription(new RegExp(`${written.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  await expect(paper).toHaveAccessibleDescription(new RegExp(instrument.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await expect(paper).toHaveAccessibleDescription(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await title.fill('A new title');
  await expect(paper).toHaveAccessibleDescription(/^A new title\./);
  await expect(paper).toHaveAccessibleName(SHEET_LABEL);
});

test.describe('reduced motion', () => {
  /** Presses PageDown in play mode and reports the scroller's position in each of the next 10 frames, and where it rests 1.5 s later. */
  async function turn(page: Page) {
    await openState(page, 'play-mode');
    const scroller = page.getByTestId('play-scroller');
    expect(await scroller.evaluate(el => el.scrollHeight > el.clientHeight + 10), 'the sample has more than one page').toBe(true);
    await page.getByRole('region', { name: 'Play mode' }).focus();
    await scroller.evaluate(el => { el.scrollTop = 0; });
    await page.keyboard.press('PageDown');
    return scroller.evaluate(el => new Promise<{ start: number; samples: number[]; final: number }>(resolve => {
      const samples: number[] = [];
      const frame = () => {
        samples.push(el.scrollTop);
        if (samples.length < 10) requestAnimationFrame(frame);
        else setTimeout(() => resolve({ start: 0, samples, final: el.scrollTop }), 1500);
      };
      requestAnimationFrame(frame);
    }));
  }

  test('a page turn jumps within one frame', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { samples, final } = await turn(page);
    expect(samples[0], 'the turn has happened after one frame').toBeGreaterThan(100);
    expect(samples, 'every frame shows the final position').toEqual(samples.map(() => final));
  });

  test('without the setting the turn glides', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const { start, samples, final } = await turn(page);
    expect(final, 'the turn moved the page').toBeGreaterThan(start + 100);
    expect(samples.some(v => v > start && v < final), `a frame lies between ${start} and ${final}: ${samples.join(', ')}`).toBe(true);
  });
});

test.describe('narrow screens', () => {
  for (const [width, height] of [[320, 640], [768, 1024], [1024, 768]]) {
    test(`no state scrolls sideways at ${width} × ${height}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height });
      const wide: string[] = [];
      for (const state of STATES) {
        await state.open(page);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (over > 0) wide.push(`${state.id}: ${over} px too wide`);
      }
      expect(wide).toEqual([]);
    });
  }
});

test.describe('click areas on the paper', () => {
  /** Centre of an element's first notehead (or of the whole element) in page coordinates after scrolling it into view. */
  async function centreOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
    const target = page.locator(selector).first();
    await target.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    const box = (await target.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  const selectedNote = (page: Page) => page.locator('[data-selected="true"]').first().getAttribute('data-ev');

  /** Event ids with a notehead, per system, in order, with the x of the head in the system. */
  async function heads(page: Page): Promise<{ id: string; system: number; x: number }[]> {
    return page.getByTestId('system').evaluateAll(systems => systems.flatMap((system, k) =>
      [...system.querySelectorAll('[data-ev]')].flatMap(g => {
        const head = g.querySelector('[data-head]');
        return head ? [{ id: g.getAttribute('data-ev')!, system: k, x: head.getBoundingClientRect().left + head.getBoundingClientRect().width / 2 }] : [];
      })));
  }

  test('a click on each note of the densest stretch selects that note', async ({ page }) => {
    await openState(page, 'sheet-view');
    await modeRadio(page, 'Edit notes').click();
    const all = await heads(page);
    // The closest pair of heads in one system and the notes around it.
    let at = 0;
    let gap = Infinity;
    all.forEach((n, i) => { const next = all[i + 1]; if (next && next.system === n.system && next.x - n.x < gap) { gap = next.x - n.x; at = i; } });
    const run = all.slice(Math.max(0, at - 1), at + 3).filter(n => n.system === all[at]!.system);
    expect(run.length).toBeGreaterThanOrEqual(3);
    for (const note of run) {
      const { x, y } = await centreOf(page, `[data-ev="${note.id}"] [data-head]`);
      await page.mouse.click(x, y);
      expect(await selectedNote(page), `the click on the head of ${note.id}, ${gap.toFixed(0)} px from its neighbour`).toBe(note.id);
      await page.mouse.click(x, y);   // the same click again clears the selection
    }

    // Four eighth notes and a half in one bar, two octaves up: every note has a pill and the heads sit 21 px apart. The i-th
    // pill belongs to the i-th head, and a pill's centre must be nearer to its own head than to any other: a pill that
    // drifted under its neighbour would mark the wrong note.
    await openState(page, 'start-empty');
    await page.getByTestId('drop-zone').locator('input[type=file]').setInputFiles('e2e/fixtures/eighths.abc');
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page.getByTestId('system').first()).toBeVisible();
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Octave up', exact: true }).click();
    const { notes, pills } = await page.getByTestId('system').first().evaluate(svg => {
      const centre = (e: Element) => e.getBoundingClientRect().left + e.getBoundingClientRect().width / 2;
      return { notes: [...svg.querySelectorAll('[data-head]')].map(centre), pills: [...svg.parentElement!.querySelectorAll('[aria-haspopup=dialog]')].map(centre) };
    });
    expect(notes, 'five notes').toHaveLength(5);
    expect(pills, 'a pill under each of them').toHaveLength(5);
    expect(notes[1]! - notes[0]!, 'the first four notes are about 21 px apart').toBeLessThan(22);
    pills.forEach((pill, i) => {
      notes.forEach((note, j) => {
        if (j !== i) expect(Math.abs(pill - notes[i]!), `pill ${i + 1} is nearer to its own note than to note ${j + 1}`).toBeLessThan(Math.abs(pill - note));
      });
    });
  });

  test('a click on a note in the last bar of a system selects it and no note of the next system', async ({ page }) => {
    await openState(page, 'sheet-view');
    await modeRadio(page, 'Edit notes').click();
    const all = await heads(page);
    const systems = new Set(all.map(n => n.system));
    expect(systems.size).toBeGreaterThan(1);
    for (const k of [...systems].slice(0, -1)) {
      const last = [...all].reverse().find(n => n.system === k)!;
      const hit = page.locator(`[data-hit="${last.id}"]`);
      await hit.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
      const box = (await hit.boundingBox())!;
      // The foot of the column is the point nearest the next system; a pill under the chart, if there is one, takes the last 8 px.
      const foot = { x: box.x + box.width / 2, y: box.y + box.height - 12 };
      await page.mouse.click(foot.x, foot.y);
      expect(await selectedNote(page), `a click at the foot of the last column of system ${k + 1}`).toBe(last.id);
      await page.mouse.click(foot.x, foot.y);
    }
  });

  test('a click on the edge of an alternate-fingering pill opens its own popover', async ({ page }) => {
    // Two octaves up, the sample has runs of pills that sit as close as the spacing allows.
    await openState(page, 'sheet-out-of-range');
    const pills = page.getByRole('button', { name: /^⇅ \d+ alternate fingerings for / });
    const names = await pills.evaluateAll(els => els.map(e => e.getAttribute('aria-label')!));
    expect(names.length).toBeGreaterThan(10);
    // The pill is drawn 26 px wide and takes clicks 26 px wide on the paper: 12 px right of its centre is still this pill, never its neighbour 26 px away.
    for (const [k, name] of names.entries()) {
      const pill = pills.nth(k);
      await pill.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
      const box = (await pill.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2 + 12, box.y + box.height / 2);
      const note = name.replace(/^.* for /, '');
      await expect(page.getByRole('dialog', { name: new RegExp(`^Alternate fingerings for ${note}`) }), `pill ${k + 1} of ${names.length}`).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });

  test('the smallest note click area', async ({ page }) => {
    await openState(page, 'sheet-view');
    // Width of the area that takes the click, walking across each column at half its height one pixel at a time.
    const widths = await page.locator('[data-hit]').evaluateAll(columns => columns.map(c => {
      c.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = c.getBoundingClientRect();
      const y = r.top + r.height / 2;
      let taken = 0;
      for (let x = Math.floor(r.left) - 40; x < r.right + 40; x++) if (document.elementFromPoint(x + 0.5, y) === c) taken++;
      return { id: c.getAttribute('data-hit')!, drawn: Math.round(r.width * 10) / 10, taken, height: Math.round(r.height) };
    }));
    const smallest = widths.reduce((a, b) => (b.taken < a.taken ? b : a));
    console.log(`SMALLEST NOTE CLICK AREA: ${smallest.taken} px wide (drawn ${smallest.drawn} px), ${smallest.height} px high, of ${widths.length} columns`);
    expect(Math.min(...widths.map(w => w.height)), 'every column is at least 24 px high').toBeGreaterThanOrEqual(24);
    expect(smallest.taken, 'the narrowest column takes at least 16 px').toBeGreaterThanOrEqual(16);
  });
});
