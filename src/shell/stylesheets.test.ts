import { stylesheetsReady } from './stylesheets';

const settled = async (p: Promise<unknown>) => {
  let done = false;
  void p.then(() => { done = true; });
  await new Promise(r => setTimeout(r, 0));
  return done;
};

afterEach(() => { document.head.innerHTML = ''; });

function addLink(): HTMLLinkElement {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = '/assets/Start.css';
  document.head.appendChild(l);
  return l;
}

it('resolves at once when no stylesheet is pending', async () => {
  expect(await settled(stylesheetsReady())).toBe(true);
});

it('waits for a pending stylesheet to load', async () => {
  const l = addLink();
  const ready = stylesheetsReady();
  expect(await settled(ready)).toBe(false);
  l.dispatchEvent(new Event('load'));
  expect(await settled(ready)).toBe(true);
});

it('a stylesheet that fails does not hold the page', async () => {
  const l = addLink();
  const ready = stylesheetsReady();
  l.dispatchEvent(new Event('error'));
  expect(await settled(ready)).toBe(true);
});
