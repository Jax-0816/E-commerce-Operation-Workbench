import { fileURLToPath } from 'node:url';

import {
  resolveDefaultWorkspace,
  type WorkspaceEnvironment,
  type WorkspacePlatform,
} from '@eaw/workspace';

export interface CreateServerStartupOptions {
  readonly host?: string;
  readonly moduleUrl: string;
  readonly port?: string;
  readonly environment?: WorkspaceEnvironment;
  readonly platform?: WorkspacePlatform;
  readonly workspacePath?: string;
}

export interface ServerStartupOptions {
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly webDistDir: string;
  readonly migrationsDirectory: string;
  readonly workspacePath: string;
}

export function createServerStartupOptions({
  host,
  moduleUrl,
  port,
  environment = process.env,
  platform = process.platform,
  workspacePath,
}: CreateServerStartupOptions): ServerStartupOptions {
  if (host !== undefined && host !== '127.0.0.1') {
    throw new Error('HOST must be 127.0.0.1');
  }

  return {
    host: '127.0.0.1',
    port: Number.parseInt(port ?? '3000', 10),
    webDistDir: fileURLToPath(new URL('../../web/dist/', moduleUrl)),
    migrationsDirectory: fileURLToPath(new URL('../../../migrations/', moduleUrl)),
    workspacePath: workspacePath ?? resolveDefaultWorkspace(platform, environment),
  };
}
