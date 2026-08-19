import { resolve } from 'node:path';

import { buildApp } from './app.js';
import { createAppContext } from './context.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '127.0.0.1';
const app = buildApp(createAppContext({ webDistDir: resolve(process.cwd(), 'apps/web/dist') }));

await app.listen({ host, port });
