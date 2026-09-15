import { DashboardResponseSchema, type DashboardResponse } from '@eaw/contracts/dashboard';

export interface DashboardApi {
  get(): Promise<DashboardResponse>;
}

export function createBrowserDashboardApi(fetcher: typeof fetch = fetch): DashboardApi {
  return {
    async get() {
      const response = await fetcher('/api/v1/dashboard');
      if (!response.ok) throw new Error('无法加载运营总控台');
      return DashboardResponseSchema.parse(await response.json());
    },
  };
}
