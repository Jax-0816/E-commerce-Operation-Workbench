import { pathToFileURL } from 'node:url';

import type { WorkspaceEnvironment, WorkspacePlatform } from '@eaw/workspace';

import { createProductionApp } from './runtime.js';
import { createServerStartupOptions } from './startup.js';

export interface BootstrapWorkspaceInput {
  readonly environment?: WorkspaceEnvironment;
  readonly moduleUrl: string;
  readonly platform?: WorkspacePlatform;
  readonly workspacePath?: string;
}

export async function bootstrapWorkspace(input: BootstrapWorkspaceInput): Promise<void> {
  const options = createServerStartupOptions({
    environment: input.environment,
    moduleUrl: input.moduleUrl,
    platform: input.platform,
    workspacePath: input.workspacePath,
  });
  const app = await createProductionApp({
    migrationsDirectory: options.migrationsDirectory,
    workspacePath: options.workspacePath,
  });
  try {
    await app.ready();
  } finally {
    await app.close();
  }
}

export function parseBootstrapArguments(args: readonly string[]): { workspacePath?: string } {
  if (args.length === 0) return {};
  if (args.length === 2 && args[0] === '--workspace' && args[1]?.trim()) {
    return { workspacePath: args[1] };
  }
  throw new TypeError('Bootstrap arguments are invalid.');
}

async function main(): Promise<void> {
  const input = parseBootstrapArguments(process.argv.slice(2));
  await bootstrapWorkspace({ moduleUrl: import.meta.url, ...input });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'Workspace bootstrap failed.');
    process.exitCode = 1;
  }
}
