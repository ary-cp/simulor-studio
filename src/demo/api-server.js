const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const START_PORT = Number(process.env.DEMO_API_PORT || 3000);
const PORT_FILE = path.join(__dirname, '..', '..', '.demo-api-port');
const users = new Map();
const posts = [];

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenFor(username) {
  return Buffer.from(`${username}:${Date.now()}`).toString('base64url');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') return sendJson(res, 200, { ok: true });
  if (url.pathname === '/health') return sendJson(res, 200, { ok: true, posts: posts.length });

  await wait(35 + Math.random() * 180);

  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    const username = body.username || 'anonymous';
    const token = tokenFor(username);
    users.set(token, username);
    return sendJson(res, 200, { token, user: { username } });
  }

  if (url.pathname === '/api/posts' && req.method === 'POST') {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Missing token' });
    const body = await readBody(req);
    const post = {
      id: posts.length + 1,
      content: body.content || 'Demo post',
      createdAt: new Date().toISOString(),
    };
    posts.unshift(post);
    return sendJson(res, 201, post);
  }

  if (url.pathname === '/api/feed' && req.method === 'GET') {
    const page = Number(url.searchParams.get('page') || 1);
    const pageSize = 10;
    const seedPosts = Array.from({ length: 35 }, (_, index) => ({
      id: `seed-${index + 1}`,
      content: `Seed feed item ${index + 1}`,
      createdAt: new Date(Date.now() - index * 60000).toISOString(),
    }));
    const allPosts = [...posts, ...seedPosts];
    return sendJson(res, 200, {
      page,
      items: allPosts.slice((page - 1) * pageSize, page * pageSize),
      total: allPosts.length,
    });
  }

  return sendJson(res, 404, { error: 'Not found' });
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
      fs.writeFileSync(PORT_FILE, String(port));
      console.log(`Demo API target running at http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error(`Demo API failed to start: ${error.message}`);
    process.exit(1);
  });
