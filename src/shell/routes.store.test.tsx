import { routeModule } from './routes';

const hydrate = vi.hoisted(() => vi.fn());
vi.mock('../state/store', async importOriginal => ({ ...(await importOriginal<typeof import('../state/store')>()), hydrate }));

it('a page without the store does not load it; pages with it hydrate once', async () => {
  await routeModule('/about').load();
  expect(hydrate).not.toHaveBeenCalled();
  await routeModule('/').load();
  expect(hydrate).toHaveBeenCalledTimes(1);
  await routeModule('/scales').load();
  expect(hydrate).toHaveBeenCalledTimes(1);
});
