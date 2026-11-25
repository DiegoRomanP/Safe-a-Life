// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, setupRender } from '../../../test/render.js';
import { DevMailboxLink } from './DevMailboxLink.js';

setupRender();
afterEach(() => vi.unstubAllEnvs());

describe('Enlace al buzón de desarrollo', () => {
  it('en desarrollo abre el buzón local en otra pestaña y sin Referer', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_DEV_MAILBOX_URL', undefined);
    const link = render(<DevMailboxLink />).querySelector('a');
    expect(link?.textContent).toBe('Abrir buzón de desarrollo');
    expect(link?.getAttribute('href')).toBe('http://127.0.0.1:4025');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noreferrer');
  });

  it('usa VITE_DEV_MAILBOX_URL si está definida', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_DEV_MAILBOX_URL', 'http://127.0.0.1:4999');
    expect(render(<DevMailboxLink />).querySelector('a')?.getAttribute('href')).toBe('http://127.0.0.1:4999');
  });

  it('fuera de desarrollo no pinta nada', () => {
    vi.stubEnv('DEV', false);
    expect(render(<DevMailboxLink />).innerHTML).toBe('');
  });
});
