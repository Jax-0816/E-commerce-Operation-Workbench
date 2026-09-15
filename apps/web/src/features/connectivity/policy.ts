export type WorkbenchCapability =
  | 'deepseek_connection_test'
  | 'strategy_generation'
  | 'title_generation'
  | 'creative_generation'
  | 'creative_regeneration'
  | 'detail_generation'
  | 'workflow_start'
  | 'workflow_resume'
  | 'workflow_retry'
  | 'local_crud'
  | 'ai_key_management'
  | 'pricing_and_history'
  | 'promotion_calculation'
  | 'competitor_import'
  | 'rule_management'
  | 'backup_and_restore'
  | 'persisted_reads';

const internetCapabilities = new Set<WorkbenchCapability>([
  'deepseek_connection_test',
  'strategy_generation',
  'title_generation',
  'creative_generation',
  'creative_regeneration',
  'detail_generation',
  'workflow_start',
  'workflow_resume',
  'workflow_retry',
]);

export function capabilityAvailability(capability: WorkbenchCapability, online: boolean) {
  if (!online && internetCapabilities.has(capability)) {
    return {
      available: false,
      reason: '当前处于离线状态，需要连接互联网后才能使用此功能。',
    } as const;
  }
  return { available: true, reason: null } as const;
}
