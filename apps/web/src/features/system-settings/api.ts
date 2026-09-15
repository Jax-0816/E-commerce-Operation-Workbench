import {
  SystemStatusResponseSchema,
  type SystemStatusResponse,
} from '@eaw/contracts/system-status';

export interface SystemStatusApi {
  get(): Promise<SystemStatusResponse>;
}

export function createBrowserSystemStatusApi(fetcher: typeof fetch = fetch): SystemStatusApi {
  return {
    async get() {
      const response = await fetcher('/api/v1/system/status');
      if (!response.ok) throw new Error('无法加载系统状态');
      return SystemStatusResponseSchema.parse(await response.json());
    },
  };
}
