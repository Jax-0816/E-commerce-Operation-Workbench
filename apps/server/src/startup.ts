import { fileURLToPath } from 'node:url';

export interface CreateServerStartupOptions {
  readonly host?: string;
  readonly moduleUrl: string;
  readonly port?: string;
}

export interface ServerStartupOptions {
  readonly host: '127.0.0.1';
  readonly port: number;
  readonly webDistDir: string;
}

export function createServerStartupOptions({
  host,
  moduleUrl,
  port,
}: CreateServerStartupOptions): ServerStartupOptions {
  if (host !== undefined && host !== '127.0.0.1') {
    throw new Error('HOST must be 127.0.0.1');
  }

  return {
    host: '127.0.0.1',
    port: Number.parseInt(port ?? '3000', 10),
    webDistDir: fileURLToPath(new URL('../../web/dist/', moduleUrl)),
  };
}
