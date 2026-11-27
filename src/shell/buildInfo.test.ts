import { versionLabel } from './buildInfo';

it.each([
  [{ commit: 'a1b2c3d', version: '1.3.1', release: true }, '1.3.1 · a1b2c3d'],
  [{ commit: 'a1b2c3d', version: '1.3.1', release: false }, 'dev based on 1.3.1 · a1b2c3d'],
  [{ commit: 'a1b2c3d', version: '', release: false }, 'dev · a1b2c3d'],
  [{ commit: '', version: '', release: false }, 'dev'],
])('labels %o as %s', (info, label) => {
  expect(versionLabel(info)).toBe(label);
});
