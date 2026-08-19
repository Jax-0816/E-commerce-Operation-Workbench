import { describe, expect, it } from 'vitest';

import { buildApp } from './app.js';
import { createAppContext } from './context.js';

describe('GET /api/v1/health', () => {
  it('reports the running application version', async () => {
    const app = buildApp(createAppContext({}));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', appVersion: '0.1.0' });
    await app.close();
  });
});
