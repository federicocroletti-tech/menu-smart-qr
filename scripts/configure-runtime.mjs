import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const configuredUrl = process.env.API_BASE_URL?.trim() ?? '';
let apiBaseUrl = '';
if (configuredUrl) {
  const parsedUrl = new URL(
    configuredUrl.includes('://') ? configuredUrl : `https://${configuredUrl}`,
  );
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('API_BASE_URL must use HTTP or HTTPS.');
  }
  apiBaseUrl = parsedUrl.origin;
}
const outputPath = join(
  process.cwd(),
  'dist',
  'menu-smart-qr',
  'browser',
  'runtime-config.js',
);

await writeFile(
  outputPath,
  `window.menuSmartQrRuntime = Object.freeze(${JSON.stringify({ apiBaseUrl })});\n`,
);
console.log(`Runtime API endpoint configured: ${apiBaseUrl || 'same origin'}`);
