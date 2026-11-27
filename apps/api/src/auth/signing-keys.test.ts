import { symmetricEncrypt } from 'better-auth/crypto';
import { describe, expect, it, vi } from 'vitest';
import { dropUnreadableKeys } from './signing-keys.js';

const OLD = 'an-old-secret-that-is-at-least-32-chars!';
const NEW = 'the-new-secret-that-is-at-least-32-chars';

describe('dropUnreadableKeys', () => {
  it('removes keys encrypted with a previous secret, keeps current ones', async () => {
    const rows = [
      {
        id: 'old',
        privateKey: JSON.stringify(await symmetricEncrypt({ key: OLD, data: '{"k":1}' })),
      },
      {
        id: 'new',
        privateKey: JSON.stringify(await symmetricEncrypt({ key: NEW, data: '{"k":2}' })),
      },
    ];
    const where = vi.fn(async () => {});
    const db = {
      select: () => ({ from: async () => rows }),
      delete: () => ({ where }),
    };
    expect(await dropUnreadableKeys({ db } as never, NEW)).toBe(1);
    expect(where).toHaveBeenCalledTimes(1);
  });

  it('does nothing when every key is readable', async () => {
    const rows = [
      { id: 'a', privateKey: JSON.stringify(await symmetricEncrypt({ key: NEW, data: 'x' })) },
    ];
    const del = vi.fn();
    const db = { select: () => ({ from: async () => rows }), delete: del };
    expect(await dropUnreadableKeys({ db } as never, NEW)).toBe(0);
    expect(del).not.toHaveBeenCalled();
  });
});
