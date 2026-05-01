const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..', '..');
const portFile = path.join(root, '.demo-api-port');
const port = fs.existsSync(portFile) ? fs.readFileSync(portFile, 'utf8').trim() : '3000';
const url = `http://localhost:${port}`;

function checkDemoApi() {
  return new Promise((resolve) => {
    const req = http.get(`${url}/health`, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          resolve(Boolean(data.ok && Object.prototype.hasOwnProperty.call(data, 'posts')));
        } catch {
          resolve(false);
        }
      });
    });
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function main() {
  const ready = await checkDemoApi();
  if (!ready) {
    console.error(`Demo API is not reachable at ${url}.`);
    console.error('Start it first with: npm run demo-api');
    console.error('If it auto-selects another port, keep that terminal open and rerun npm run demo-test.');
    process.exit(1);
  }

  console.log(`Running demo test against ${url}`);
  const result = spawnSync(process.execPath, [
    'index.js',
    '--scenario',
    'medium',
    '--url',
    url,
    '--users',
    '2',
    '--duration',
    '10',
  ], {
    cwd: root,
    stdio: 'inherit',
  });

  process.exit(result.status || 0);
}

main();
