const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const children = [];
let dashboardUrl = null;

function spawnNode(label, args) {
  const child = spawn(process.execPath, args, { cwd: root });
  children.push(child);

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    process.stdout.write(`[${label}] ${text}`);
    const match = text.match(/http:\/\/localhost:\d+/);
    if (label === 'dashboard' && match) dashboardUrl = match[0];
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });

  return child;
}

function openBrowser(url) {
  const command = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];

  spawn(command[0], command[1], { stdio: 'ignore', detached: true }).unref();
}

function waitForDashboard() {
  const timer = setInterval(() => {
    if (!dashboardUrl) return;

    http.get(`${dashboardUrl}/api/health`, (res) => {
      if (res.statusCode === 200) {
        clearInterval(timer);
        console.log('');
        console.log(`Ready: ${dashboardUrl}`);
        console.log('Press Ctrl+C to stop demo services.');
        console.log('');
        if (process.env.NO_OPEN !== '1') openBrowser(dashboardUrl);
      }
    }).on('error', () => {});
  }, 500);
}

function shutdown() {
  console.log('\nStopping Sheheri dev services...');
  for (const child of children) {
    if (child.killed) continue;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
    } else {
      child.kill();
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Starting Sheheri demo API and dashboard...');
spawnNode('demo-api', ['src/demo/api-server.js']);
spawnNode('dashboard', ['src/dashboard/server.js']);
waitForDashboard();
