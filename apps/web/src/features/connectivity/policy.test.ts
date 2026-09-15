import { describe, expect, it } from 'vitest';

import { capabilityAvailability, type WorkbenchCapability } from './policy.js';

describe('capabilityAvailability', () => {
  it('blocks every public-internet action offline with a visible reason', () => {
    const internet: readonly WorkbenchCapability[] = [
      'deepseek_connection_test',
      'strategy_generation',
      'title_generation',
      'creative_generation',
      'creative_regeneration',
      'detail_generation',
      'workflow_start',
      'workflow_resume',
      'workflow_retry',
    ];
    for (const capability of internet) {
      expect(capabilityAvailability(capability, false)).toEqual({
        available: false,
        reason: '当前处于离线状态，需要连接互联网后才能使用此功能。',
      });
      expect(capabilityAvailability(capability, true)).toEqual({ available: true, reason: null });
    }
  });

  it('keeps all local work available offline', () => {
    const local: readonly WorkbenchCapability[] = [
      'local_crud',
      'ai_key_management',
      'pricing_and_history',
      'promotion_calculation',
      'competitor_import',
      'rule_management',
      'backup_and_restore',
      'persisted_reads',
    ];
    for (const capability of local) {
      expect(capabilityAvailability(capability, false)).toEqual({ available: true, reason: null });
    }
  });
});
