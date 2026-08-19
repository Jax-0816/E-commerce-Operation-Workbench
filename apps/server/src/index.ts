import { buildApp } from './app.js';
import { createAppContext } from './context.js';
import { createServerStartupOptions } from './startup.js';

const options = createServerStartupOptions({
  host: process.env.HOST,
  moduleUrl: import.meta.url,
  port: process.env.PORT,
});
const app = buildApp(createAppContext({ webDistDir: options.webDistDir }));

await app.listen({ host: options.host, port: options.port });
