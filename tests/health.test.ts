import { describe, expect, it } from 'vitest';
import { GET } from '../app/api/health/route';
import { APP_NAME } from '../lib/app';

describe('health', () => {
  it('names this app, so the deploy can tell it apart from other apps on the server', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ app: APP_NAME, ok: true });
    expect(APP_NAME).toBe('osher-max-dashboard');
  });
});
