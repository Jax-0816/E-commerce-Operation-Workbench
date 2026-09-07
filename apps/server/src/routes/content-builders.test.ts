import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import type { ContentBuildersApplication } from '@eaw/application';
import { createCreativePlanRevision, createUuidV7 } from '@eaw/domain';

import { registerContentBuilderRoutes } from './content-builders.js';

describe('content builder routes', () => {
  it('returns a strict five-item creative revision', async () => {
    const productId = createUuidV7();
    const revision = createCreativePlanRevision({
      id: createUuidV7(),
      lineageId: createUuidV7(),
      productId,
      platformId: 'pinduoduo',
      revisionNo: 1,
      origin: 'generated',
      status: 'verified',
      items: Array.from({ length: 5 }, (_, index) => ({
        id: createUuidV7(),
        order: index + 1,
        role: index === 0 ? 'hero' : 'supporting',
        headline: `图 ${index + 1}`,
        body: '说明',
        promptZh: '中文提示',
        promptEn: 'English prompt',
        negativePromptZh: '中文负面',
        negativePromptEn: 'English negative',
        evidenceRefs: [],
        reviewTerms: [],
        locked: false,
      })),
      dependencyHashes: { facts: 'a'.repeat(64) },
      validationIssues: [],
      generationId: createUuidV7(),
      supersedesRevisionId: null,
      createdAt: new Date(),
    });
    const view = { revision, stale: false, staleReasons: [] } as const;
    const application = {
      async generateCreative() {
        return view;
      },
      async regenerateCreativeItem() {
        return view;
      },
      async lockCreativeItem() {
        return view;
      },
      async reorderCreative() {
        return view;
      },
      async listCreative() {
        return [view];
      },
      async generateDetail() {
        throw new Error('unused');
      },
      async lockDetailSection() {
        throw new Error('unused');
      },
      async reorderDetail() {
        throw new Error('unused');
      },
      async listDetail() {
        return [];
      },
    } satisfies ContentBuildersApplication;
    const app = Fastify();
    registerContentBuilderRoutes(app, application);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/creative/generate?platformId=pinduoduo`,
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().revision.items).toHaveLength(5);
    await app.close();
  });
});
