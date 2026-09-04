import { describe, expect, it } from 'vitest';

import { createLocalCompetitorDataProvider } from './provider.js';

describe('CompetitorDataProvider', () => {
  it('dispatches delimited imports through the replaceable provider port', async () => {
    const provider = createLocalCompetitorDataProvider();

    const preview = await provider.preview({
      format: 'csv',
      content: 'name,sales\n竞品 A,10万+',
    });

    expect(preview).toMatchObject({
      valid: true,
      rows: [{ name: '竞品 A', displayedSalesText: '10万+' }],
    });
  });
});
