const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SCENARIO_DIR = path.join(ROOT, 'scenarios');
const LOG_DIR = path.join(ROOT, 'logs');
const START_PORT = Number(process.env.PORT || 4173);

let activeRun = null;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data, null, 2), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}

function safeJsonRead(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { error: error.message };
  }
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function listScenarios() {
  if (!fs.existsSync(SCENARIO_DIR)) return [];
  return fs.readdirSync(SCENARIO_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const config = safeJsonRead(path.join(SCENARIO_DIR, file));
      return {
        id: file.replace(/\.json$/, ''),
        file,
        ...config,
      };
    });
}

function scenarioPath(id) {
  const safeId = String(id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
  if (!safeId) return null;
  return {
    id: safeId,
    filePath: path.join(SCENARIO_DIR, `${safeId}.json`),
  };
}

function normalizeTarget(input) {
  const raw = String(input || '').trim().replace(/^"|"$/g, '');
  if (!raw) return { ok: false, error: 'Target URL or local file path is required.' };

  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('file://')) {
    return { ok: true, target: raw, kind: raw.startsWith('file://') ? 'file' : 'url' };
  }

  const resolved = path.resolve(raw);
  if (fs.existsSync(resolved)) {
    return { ok: true, target: pathToFileURL(resolved).href, kind: 'file', localPath: resolved };
  }

  if (/^[\w.-]+\.[a-z]{2,}/i.test(raw)) {
    return { ok: true, target: `https://${raw}`, kind: 'url' };
  }

  return { ok: false, error: 'Enter a valid URL or an existing local file path.' };
}

function extractPageFacts(text = '') {
  const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || 'Untitled';
  const links = (text.match(/<a\s/gi) || []).length;
  const scripts = (text.match(/<script\b/gi) || []).length;
  const styles = (text.match(/<link\b[^>]*stylesheet/gi) || []).length;
  return { title, links, scripts, styles };
}

function probeHttpTarget(target) {
  const started = Date.now();
  const parsed = new URL(target);
  const lib = parsed.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const req = lib.request(target, { method: 'GET', headers: { 'User-Agent': 'Sheheri-Test-Engine/1.0' } }, (response) => {
      let raw = '';
      response.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 250000) response.destroy();
      });
      response.on('end', () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 400,
          kind: 'url',
          target,
          status: response.statusCode,
          latency: Date.now() - started,
          contentType: response.headers['content-type'] || 'unknown',
          bytes: Buffer.byteLength(raw),
          ...extractPageFacts(raw),
        });
      });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ ok: false, kind: 'url', target, status: 0, latency: Date.now() - started, error: 'Timed out' });
    });
    req.on('error', (error) => {
      resolve({ ok: false, kind: 'url', target, status: 0, latency: Date.now() - started, error: error.message });
    });
    req.end();
  });
}

function probeFileTarget(target) {
  const started = Date.now();
  const filePath = new URL(target);
  try {
    const stats = fs.statSync(filePath);
    const text = stats.isFile() ? fs.readFileSync(filePath, 'utf8').slice(0, 250000) : '';
    return {
      ok: stats.isFile(),
      kind: 'file',
      target,
      status: stats.isFile() ? 200 : 0,
      latency: Date.now() - started,
      contentType: path.extname(filePath.pathname) || 'local-file',
      bytes: stats.size,
      ...extractPageFacts(text),
    };
  } catch (error) {
    return { ok: false, kind: 'file', target, status: 0, latency: Date.now() - started, error: error.message };
  }
}

async function probeTarget(input) {
  const normalized = normalizeTarget(input);
  if (!normalized.ok) return normalized;
  if (normalized.kind === 'file') return probeFileTarget(normalized.target);
  return probeHttpTarget(normalized.target);
}

function saveScenario(payload) {
  const target = scenarioPath(payload.name || payload.id);
  if (!target) return { ok: false, error: 'Scenario name is required.' };

  const users = Number(payload.users || 1);
  const duration = Number(payload.duration || 30);
  const baseUrl = String(payload.baseUrl || '').trim();
  const actions = Array.isArray(payload.actions) ? payload.actions : String(payload.actions || '').split(',');
  const cleanActions = actions.map((action) => String(action).trim()).filter(Boolean);

  const normalized = normalizeTarget(baseUrl);
  if (!normalized.ok) return normalized;
  if (users < 1 || users > 500) return { ok: false, error: 'Users must be between 1 and 500.' };
  if (duration < 5 || duration > 3600) return { ok: false, error: 'Duration must be between 5 and 3600 seconds.' };
  if (!cleanActions.length) return { ok: false, error: 'Add at least one action.' };

  const scenario = {
    name: target.id,
    baseUrl: normalized.target,
    users,
    duration,
    actions: cleanActions,
    weights: cleanActions.map(() => 1),
    delayRange: [
      Number(payload.minDelay || 1000),
      Number(payload.maxDelay || 4000),
    ],
    credentials: {
      usernamePrefix: payload.usernamePrefix || 'testuser',
      password: payload.password || 'password123',
    },
    endpoints: {
      login: payload.loginEndpoint || '/api/auth/login',
      post: payload.postEndpoint || '/api/posts',
      feed: payload.feedEndpoint || '/api/feed',
      page: payload.pageEndpoint || (normalized.kind === 'file' ? '' : '/'),
    },
  };

  fs.writeFileSync(target.filePath, JSON.stringify(scenario, null, 2));
  return { ok: true, scenario: { id: target.id, file: `${target.id}.json`, ...scenario } };
}

function deleteScenario(id) {
  const target = scenarioPath(id);
  if (!target || !fs.existsSync(target.filePath)) return { ok: false, error: 'Scenario not found.' };
  if (['light', 'medium', 'heavy'].includes(target.id)) {
    return { ok: false, error: 'Built-in scenarios are protected.' };
  }
  fs.unlinkSync(target.filePath);
  return { ok: true };
}

function computeGrade(successRate, avgLatency, failCount) {
  let score = 100;
  score -= Math.max(0, 100 - successRate) * 1.7;
  score -= Math.max(0, avgLatency - 250) / 12;
  score -= Math.min(20, failCount * 0.25);
  score = Math.max(0, Math.round(score));

  if (score >= 92) return { score, label: 'Launch-ready', tone: 'excellent' };
  if (score >= 80) return { score, label: 'Healthy', tone: 'good' };
  if (score >= 65) return { score, label: 'Needs attention', tone: 'warn' };
  return { score, label: 'High risk', tone: 'danger' };
}

function buildInsights(summary) {
  const insights = [];
  if (summary.totalCount === 0) {
    insights.push('No requests were captured in this run.');
    return insights;
  }

  if (summary.successRate >= 98) insights.push('Reliability is strong: success rate is above 98%.');
  if (summary.successRate < 95) insights.push('Failure rate is noticeable. Check endpoint errors before increasing load.');
  if (summary.avgLatency > 500) insights.push('Average latency is high. Profile database calls, network waits, and slow handlers.');
  if (summary.avgLatency <= 250) insights.push('Latency looks comfortable for this test profile.');

  const slowest = [...summary.actions].sort((a, b) => b.avgLatency - a.avgLatency)[0];
  if (slowest) insights.push(`${slowest.name} is the slowest action at ${slowest.avgLatency}ms average latency.`);

  const noisiest = [...summary.actions].sort((a, b) => b.fail - a.fail)[0];
  if (noisiest && noisiest.fail > 0) insights.push(`${noisiest.name} produced the most failures (${noisiest.fail}).`);

  return insights.slice(0, 4);
}

function summarizeRun(file, data) {
  const actions = Object.entries(data.byAction || {}).map(([name, value]) => {
    const count = value.count || 0;
    const success = value.success || 0;
    const fail = value.fail || 0;
    return {
      name,
      count,
      success,
      fail,
      avgLatency: count ? Math.round((value.totalLatency || 0) / count) : 0,
      successRate: count ? Math.round((success / count) * 1000) / 10 : 0,
      errors: value.errors || [],
    };
  });

  const totalCount = data.totalCount || 0;
  const totalSuccess = data.totalSuccess || 0;
  const totalFail = data.totalFail || 0;
  const successRate = totalCount ? Math.round((totalSuccess / totalCount) * 1000) / 10 : 0;
  const avgLatency = data.avgLatency || 0;
  const summary = {
    file,
    timestamp: data.timestamp || null,
    elapsed: data.elapsed || 0,
    totalCount,
    totalSuccess,
    totalFail,
    successRate,
    avgLatency,
    rps: Number(data.rps || 0),
    actions,
    raw: data,
  };

  summary.grade = computeGrade(successRate, avgLatency, totalFail);
  summary.insights = buildInsights(summary);
  return summary;
}

function demoRun() {
  const raw = {
    elapsed: 120,
    totalCount: 1284,
    totalSuccess: 1248,
    totalFail: 36,
    avgLatency: 184,
    rps: '10.70',
    byAction: {
      feed: { count: 820, success: 805, fail: 15, totalLatency: 118900, errors: [] },
      post: { count: 336, success: 322, fail: 14, totalLatency: 80640, errors: [] },
      login: { count: 128, success: 121, fail: 7, totalLatency: 35456, errors: [] },
    },
    timestamp: new Date().toISOString(),
  };
  return summarizeRun('demo-sample.json', raw);
}

function listLogs(includeDemo = true) {
  ensureLogDir();
  const logs = fs.readdirSync(LOG_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => summarizeRun(file, safeJsonRead(path.join(LOG_DIR, file))))
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  return logs.length || !includeDemo ? logs : [demoRun()];
}

function getLog(file) {
  const safeFile = path.basename(file || '');
  if (!safeFile.endsWith('.json')) return null;
  const fullPath = path.join(LOG_DIR, safeFile);
  if (!fs.existsSync(fullPath)) return null;
  return summarizeRun(safeFile, safeJsonRead(fullPath));
}

function deleteLog(file) {
  const safeFile = path.basename(file || '');
  if (!safeFile.endsWith('.json')) return { ok: false, error: 'Invalid log file.' };
  const fullPath = path.join(LOG_DIR, safeFile);
  if (!fs.existsSync(fullPath)) return { ok: false, error: 'Log not found.' };
  fs.unlinkSync(fullPath);
  return { ok: true };
}

function compareLogs(files) {
  const selected = (Array.isArray(files) ? files : [])
    .map(getLog)
    .filter(Boolean)
    .slice(0, 4);

  return {
    ok: true,
    runs: selected,
    winner: selected.length ? [...selected].sort((a, b) => b.grade.score - a.grade.score)[0] : null,
  };
}

function getSummary() {
  const logs = listLogs(false);
  const latest = logs[0] || demoRun();
  const totalRuns = logs.length;
  const totalRequests = logs.reduce((sum, run) => sum + run.totalCount, 0);
  const avgSuccessRate = logs.length
    ? Math.round((logs.reduce((sum, run) => sum + run.successRate, 0) / logs.length) * 10) / 10
    : latest.successRate;
  const bestRun = logs.length
    ? [...logs].sort((a, b) => b.grade.score - a.grade.score)[0]
    : latest;

  return {
    totalRuns,
    totalRequests,
    avgSuccessRate,
    latest,
    bestRun,
    scenarios: listScenarios().length,
  };
}

function toCsv(logs) {
  const rows = [
    ['file', 'timestamp', 'elapsed', 'requests', 'success', 'failures', 'success_rate', 'avg_latency', 'rps', 'grade'],
    ...logs.map((run) => [
      run.file,
      run.timestamp || '',
      run.elapsed,
      run.totalCount,
      run.totalSuccess,
      run.totalFail,
      run.successRate,
      run.avgLatency,
      run.rps,
      run.grade.score,
    ]),
  ];

  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function runScenario(payload) {
  if (activeRun && activeRun.status === 'running') {
    return { ok: false, error: 'A test is already running.' };
  }

  const scenario = String(payload.scenario || '').replace(/[^a-z0-9_-]/gi, '');
  if (!scenario || !fs.existsSync(path.join(SCENARIO_DIR, `${scenario}.json`))) {
    return { ok: false, error: 'Choose a valid scenario.' };
  }

  const users = payload.users ? Number(payload.users) : null;
  const duration = payload.duration ? Number(payload.duration) : null;
  if (users && (users < 1 || users > 500)) return { ok: false, error: 'Users must be between 1 and 500.' };
  if (duration && (duration < 5 || duration > 3600)) return { ok: false, error: 'Duration must be between 5 and 3600 seconds.' };

  const args = ['index.js', '--scenario', scenario];
  if (payload.url) args.push('--url', String(payload.url));
  if (users) args.push('--users', String(users));
  if (duration) args.push('--duration', String(duration));

  const child = spawn(process.execPath, args, { cwd: ROOT, shell: false });
  activeRun = {
    id: Date.now().toString(36),
    status: 'running',
    command: `node ${args.join(' ')}`,
    scenario,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    output: [],
    pid: child.pid,
    child,
  };

  const capture = (chunk) => {
    const text = chunk.toString().replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    activeRun.output.push(text);
    activeRun.output = activeRun.output.slice(-80);
  };

  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('close', (code, signal) => {
    activeRun.status = signal ? 'stopped' : code === 0 ? 'completed' : 'failed';
    activeRun.exitCode = code;
    activeRun.finishedAt = new Date().toISOString();
    activeRun.child = null;
  });

  return { ok: true, run: publicRun(activeRun) };
}

function quickRunTarget(payload) {
  const normalized = normalizeTarget(payload.target);
  if (!normalized.ok) return normalized;

  const id = `quick-${Date.now().toString(36)}`;
  const scenario = {
    name: id,
    baseUrl: normalized.target,
    users: Number(payload.users || 3),
    duration: Number(payload.duration || 15),
    actions: ['page'],
    weights: [1],
    delayRange: [Number(payload.minDelay || 500), Number(payload.maxDelay || 1800)],
    endpoints: {
      page: normalized.kind === 'file' ? '' : '/',
    },
  };

  if (scenario.users < 1 || scenario.users > 500) return { ok: false, error: 'Users must be between 1 and 500.' };
  if (scenario.duration < 5 || scenario.duration > 3600) return { ok: false, error: 'Duration must be between 5 and 3600 seconds.' };

  fs.writeFileSync(path.join(SCENARIO_DIR, `${id}.json`), JSON.stringify(scenario, null, 2));
  return runScenario({ scenario: id });
}

function stopRun() {
  if (!activeRun || activeRun.status !== 'running' || !activeRun.child) {
    return { ok: false, error: 'No active run to stop.' };
  }
  activeRun.child.kill();
  return { ok: true, run: publicRun(activeRun) };
}

function publicRun(run) {
  if (!run) return { status: 'idle' };
  const { child, ...safeRun } = run;
  return safeRun;
}

function routeApi(req, res, url) {
  if (url.pathname === '/api/health') {
    sendJson(res, 200, { ok: true, uptime: process.uptime() });
    return true;
  }
  if (url.pathname === '/api/summary') {
    sendJson(res, 200, getSummary());
    return true;
  }
  if (url.pathname === '/api/scenarios' && req.method === 'GET') {
    sendJson(res, 200, listScenarios());
    return true;
  }
  if (url.pathname === '/api/scenarios' && req.method === 'POST') {
    return getBody(req).then((body) => sendJson(res, 200, saveScenario(body)));
  }
  if (url.pathname.startsWith('/api/scenarios/') && req.method === 'DELETE') {
    sendJson(res, 200, deleteScenario(decodeURIComponent(url.pathname.replace('/api/scenarios/', ''))));
    return true;
  }
  if (url.pathname === '/api/logs' && req.method === 'GET') {
    sendJson(res, 200, listLogs());
    return true;
  }
  if (url.pathname === '/api/compare' && req.method === 'POST') {
    return getBody(req).then((body) => sendJson(res, 200, compareLogs(body.files)));
  }
  if (url.pathname === '/api/probe' && req.method === 'POST') {
    return getBody(req).then((body) => probeTarget(body.target).then((result) => sendJson(res, 200, result)));
  }
  if (url.pathname === '/api/quick-run' && req.method === 'POST') {
    return getBody(req).then((body) => sendJson(res, 200, quickRunTarget(body)));
  }
  if (url.pathname === '/api/export.csv') {
    send(res, 200, toCsv(listLogs(false)), {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="sheheri-runs.csv"',
    });
    return true;
  }
  if (url.pathname.startsWith('/api/logs/')) {
    if (req.method === 'DELETE') {
      sendJson(res, 200, deleteLog(decodeURIComponent(url.pathname.replace('/api/logs/', ''))));
      return true;
    }
    const report = getLog(decodeURIComponent(url.pathname.replace('/api/logs/', '')));
    if (report) sendJson(res, 200, report);
    else sendJson(res, 404, { error: 'Log not found.' });
    return true;
  }
  if (url.pathname === '/api/run' && req.method === 'GET') {
    sendJson(res, 200, publicRun(activeRun));
    return true;
  }
  if (url.pathname === '/api/run' && req.method === 'POST') {
    return getBody(req).then((body) => sendJson(res, 200, runScenario(body)));
  }
  if (url.pathname === '/api/run/stop' && req.method === 'POST') {
    sendJson(res, 200, stopRun());
    return true;
  }

  return null;
}

function serveStatic(req, res, url) {
  const requested = decodeURIComponent(url.pathname);
  const relativePath = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(PUBLIC_DIR, relativePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }
    send(res, 200, content, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      const handled = routeApi(req, res, url);
      if (handled) return;
      return sendJson(res, 404, { error: 'API route not found.' });
    }
    return serveStatic(req, res, url);
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
});

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close(() => resolve(true));
      })
      .listen(port);
  });
}

async function findPort(startPort) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortFree(port)) return port;
    console.log(`Port ${port} is busy, trying ${port + 1}...`);
  }
  throw new Error(`No free port found from ${startPort} to ${startPort + 19}`);
}

findPort(START_PORT)
  .then((port) => {
    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.log('');
      console.log(`Sheheri dashboard running at ${url}`);
      console.log('Keep this terminal open while using the dashboard.');
      console.log('');
      if (process.env.OPEN === '1') {
        const command = process.platform === 'win32'
          ? ['cmd', ['/c', 'start', '', url]]
          : process.platform === 'darwin'
            ? ['open', [url]]
            : ['xdg-open', [url]];
        spawn(command[0], command[1], { stdio: 'ignore', detached: true }).unref();
      }
    });
  })
  .catch((error) => {
    console.error(`Dashboard failed to start: ${error.message}`);
    process.exit(1);
  });
