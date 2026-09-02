import { describe, expect, it } from 'vitest';

import type { RulePacksApplication } from '@eaw/application';

import { buildApp } from '../app.js';
import { createAppContext } from '../context.js';

describe('rule pack HTTP contract', () => {
  it('lists, imports, activates, and diffs inert rule packs', async () => {
    const calls: string[] = [];
    const application: RulePacksApplication = {
      async import(input) {
        calls.push(typeof input === 'string' ? input : `bytes:${input.byteLength}`);
        return record(false);
      },
      async activate(id) {
        calls.push(`activate:${id}`);
        return record(true);
      },
      async list(platformId, region) {
        calls.push(`list:${platformId}:${region}`);
        return [record(false)];
      },
      async diff(beforeId, afterId) {
        calls.push(`diff:${beforeId}:${afterId}`);
        return {
          added: [],
          removed: [],
          changed: [{ key: 'commission', before: rule(100), after: rule(125) }],
        };
      },
      async createSnapshot() {
        throw new Error('not used');
      },
    };
    const app = buildApp(createAppContext({ rules: application }));

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/rule-packs?platformId=pinduoduo&region=CN',
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ items: [{ id: 'pack-one', active: false }] });
    const imported = await app.inject({
      method: 'POST',
      url: '/api/v1/rule-packs/import',
      payload: { format: 'json', contents: '{}' },
    });
    expect(imported.statusCode).toBe(201);
    const activated = await app.inject({
      method: 'POST',
      url: '/api/v1/rule-packs/pack-one/activate',
    });
    expect(activated.statusCode).toBe(200);
    expect(activated.json()).toMatchObject({ active: true });
    const diff = await app.inject({
      method: 'GET',
      url: '/api/v1/rule-packs/pack-two/diff?against=pack-one',
    });
    expect(diff.statusCode).toBe(200);
    expect(diff.json()).toMatchObject({ changed: [{ key: 'commission' }] });
    expect(calls).toEqual([
      'list:pinduoduo:CN',
      '{}',
      'activate:pack-one',
      'diff:pack-one:pack-two',
    ]);
    await app.close();
  });

  it('decodes bounded ZIP base64 before handing data to the application', async () => {
    let received: Uint8Array | string | undefined;
    const application = {
      import: async (input: Uint8Array | string) => {
        received = input;
        return record(false);
      },
      activate: async () => record(true),
      list: async () => [],
      diff: async () => ({ added: [], removed: [], changed: [] }),
      createSnapshot: async () => {
        throw new Error('not used');
      },
    } satisfies RulePacksApplication;
    const app = buildApp(createAppContext({ rules: application }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/rule-packs/import',
      payload: { format: 'zip-base64', contents: Buffer.from('PK').toString('base64') },
    });
    expect(response.statusCode).toBe(201);
    expect(received).toEqual(new Uint8Array(Buffer.from('PK')));
    await app.close();
  });
});

function record(active: boolean) {
  return {
    id: 'pack-one',
    pack: {
      manifest: {
        schemaVersion: '1' as const,
        platformId: 'pinduoduo' as const,
        region: 'CN',
        version: '2026.9.0',
        publisher: 'Ecommerce AI Workbench',
        verifiedAt: '2026-09-01T00:00:00.000Z',
        minimumAppVersion: '0.1.0',
        checksum: 'a'.repeat(64),
        description: '测试规则包',
      },
      rules: [rule(100)],
    },
    installedAt: new Date('2026-09-01T00:00:00.000Z'),
    activatedAt: active ? new Date('2026-09-02T00:00:00.000Z') : null,
    active,
  };
}

function rule(rateBasisPoints: number) {
  return {
    key: 'commission',
    type: 'financial' as const,
    scope: { level: 'platform' as const },
    provenance: {
      url: 'https://example.invalid',
      title: '测试来源',
      type: 'documentation' as const,
    },
    verifiedAt: '2026-09-01T00:00:00.000Z',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    expiresAt: null,
    status: 'verified' as const,
    summary: '测试规则',
    implementationNote: '测试规则',
    config: { rateBasisPoints },
    impact: 'financial' as const,
  };
}
