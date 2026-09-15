export const SYSTEM_PROMPT_TEMPLATE_IDS = [
  'competitor-analysis',
  'market-insight',
  'selling-point-set',
  'title-generation',
  'creative-plan',
  'creative-item',
  'detail-page',
] as const;

export interface SystemStatusView {
  readonly appVersion: string;
  readonly localOnly: true;
  readonly bindAddress: '127.0.0.1';
  readonly ai: {
    readonly provider: 'deepseek';
    readonly model: 'deepseek-chat';
    readonly configured: boolean;
  };
  readonly prompts: { readonly installedCount: number; readonly activeCount: number };
  readonly rules: {
    readonly installedCount: number;
    readonly activePinduoduoCnVersion: string | null;
    readonly unresolvedActiveRuleCount: number;
  };
}

export interface SystemStatusApplication {
  get(): Promise<SystemStatusView>;
}

export interface SystemStatusApplicationDependencies {
  readonly appVersion: string;
  readonly ai: { get(): Promise<{ readonly configured: boolean }> };
  readonly prompts: {
    list(templateId: string): Promise<readonly { readonly active: boolean }[]>;
  };
  readonly rules: {
    list(
      platformId: 'pinduoduo',
      region: 'CN',
    ): Promise<
      readonly {
        readonly active: boolean;
        readonly pack: {
          readonly manifest: { readonly version: string };
          readonly rules: readonly { readonly status: 'verified' | 'needs_review' }[];
        };
      }[]
    >;
  };
}

export function createSystemStatusApplication(
  dependencies: SystemStatusApplicationDependencies,
): SystemStatusApplication {
  return {
    async get() {
      const [ai, promptGroups, rulePacks] = await Promise.all([
        dependencies.ai.get(),
        Promise.all(SYSTEM_PROMPT_TEMPLATE_IDS.map((id) => dependencies.prompts.list(id))),
        dependencies.rules.list('pinduoduo', 'CN'),
      ]);
      const prompts = promptGroups.flat();
      const activeRulePack = rulePacks.find(({ active }) => active);
      return {
        appVersion: dependencies.appVersion,
        localOnly: true,
        bindAddress: '127.0.0.1',
        ai: {
          provider: 'deepseek',
          model: 'deepseek-chat',
          configured: ai.configured,
        },
        prompts: {
          installedCount: prompts.length,
          activeCount: prompts.filter(({ active }) => active).length,
        },
        rules: {
          installedCount: rulePacks.length,
          activePinduoduoCnVersion: activeRulePack?.pack.manifest.version ?? null,
          unresolvedActiveRuleCount:
            activeRulePack?.pack.rules.filter(({ status }) => status === 'needs_review').length ??
            0,
        },
      };
    },
  };
}
