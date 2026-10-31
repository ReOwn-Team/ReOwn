import { createApp } from './app.js';
import { config } from './config.js';
import { bootstrap } from './db/bootstrap.js';
import { runJobs } from './services/jobs.js';

await bootstrap();
const app = createApp();
app.listen(config.port, () => console.log(`ReOwn API chạy tại http://localhost:${config.port} (${config.env})`));

setInterval(() => {
  runJobs().then((r) => r.skipped || console.log('[jobs]', r)).catch((e) => console.error('[jobs] lỗi', e));
}, config.jobsIntervalSec * 1000).unref();
