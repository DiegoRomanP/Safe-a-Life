// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { click, render, settle, setupRender } from '../test/render.js';
import { QueryCacheProvider } from './queryCache.js';
import { useDemoQuery } from './useDemoQuery.js';

setupRender();

// Muestra el estado del hook y un botón para reintentar.
function Probe({ load, cache }: { load: () => Promise<string>; cache: boolean }) {
  const query = useDemoQuery(load, 'recurso', { cache });
  return (
    <>
      <p>{query.status === 'ready' ? `${query.data}${query.refreshing ? ' (revalidando)' : ''}` : query.status}</p>
      <button onClick={query.retry}>Reintentar</button>
    </>
  );
}

// Devuelve el texto del estado; otra key monta de nuevo la sonda en el mismo provider.
function show(load: () => Promise<string>, key: string, cache = true) {
  const view = render(
    <QueryCacheProvider>
      <Probe key={key} load={load} cache={cache} />
    </QueryCacheProvider>,
  );
  return { text: () => view.querySelector('p')?.textContent, retry: () => click(view.querySelector('button')) };
}

describe('useDemoQuery con memoria', () => {
  const load = () => Promise.resolve('datos');

  it('al volver a montar muestra al instante la lectura guardada y la revalida', async () => {
    show(load, 'a');
    await settle();
    const view = show(load, 'b');
    expect(view.text()).toBe('datos (revalidando)');
    await settle();
    expect(view.text()).toBe('datos');
  });

  it('no usa la lectura guardada si los datos cambiaron (otra identidad de load)', async () => {
    show(load, 'a');
    await settle();
    const view = show(() => Promise.resolve('datos nuevos'), 'b');
    expect(view.text()).toBe('loading');
    await settle();
    expect(view.text()).toBe('datos nuevos');
  });

  it('reintentar muestra «Cargando» aunque haya una lectura guardada vigente', async () => {
    show(load, 'a');
    await settle();
    const view = show(load, 'b');
    expect(view.text()).toBe('datos (revalidando)');
    view.retry();
    expect(view.text()).toBe('loading');
  });

  it('sin la opción cache no recuerda nada', async () => {
    show(load, 'a', false);
    await settle();
    expect(show(load, 'b', false).text()).toBe('loading');
  });
});
