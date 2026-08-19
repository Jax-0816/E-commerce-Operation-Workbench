import { createProductionApp } from './runtime.js';
import { createServerStartupOptions } from './startup.js';

const options = createServerStartupOptions({
  host: process.env.HOST,
  moduleUrl: import.meta.url,
  port: process.env.PORT,
  workspacePath: process.env.EAW_WORKSPACE_PATH,
});
const app = await createProductionApp(options);

try {
  await app.listen({ host: options.host, port: options.port });
} catch (error) {
  await app.close();
  throw error;
}
