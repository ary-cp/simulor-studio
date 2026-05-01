/**
 * ApiClient — zero-dependency HTTP client built on Node's built-in http/https.
 * Handles auth tokens, JSON bodies, timing, and request timeouts.
 * Works with both localhost (http) and remote (https) targets.
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');

// Realistic-looking post content so the app doesn't filter test payloads
const SAMPLE_POSTS = [
  'Just testing the waters today.',
  'Another post to check the feed pipeline.',
  'Load testing is an art form.',
  'Checking endpoint stability under pressure.',
  'Simulated user activity at its finest.',
  'Performance matters more than people think.',
  'API reliability check in progress.',
  'Testing, testing, 1-2-3.',
];

class ApiClient {
  /**
   * @param {string} baseUrl   - e.g. "http://localhost:3000" or "https://api.example.com"
   * @param {object} endpoints - optional overrides for route paths
   */
  constructor(baseUrl, endpoints = {}) {
    this.baseUrl = String(baseUrl || '').startsWith('file:')
      ? String(baseUrl || '')
      : String(baseUrl || '').replace(/\/$/, '');
    this.token   = null;

    this.endpoints = {
      login : '/api/auth/login',
      post  : '/api/posts',
      feed  : '/api/feed',
      page  : '/',
      ...endpoints,
    };
  }

  // ─── Core request method ──────────────────────────────────────────────────

  /**
   * Makes an HTTP/HTTPS request and returns { status, data, latency }.
   * Never throws — on network errors it returns status 0.
   */
  async _request(path, options = {}) {
    const url    = this.baseUrl.startsWith('file:') ? this.baseUrl : `${this.baseUrl}${path}`;
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return this._readFile(parsed);

    const lib    = parsed.protocol === 'https:' ? https : http;
    const start  = Date.now();

    return new Promise((resolve) => {
      const headers = {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...options.headers,
      };

      const body = options.body ? JSON.stringify(options.body) : null;
      if (body) headers['Content-Length'] = Buffer.byteLength(body);

      const reqOptions = {
        hostname : parsed.hostname,
        port     : parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path     : (parsed.pathname || '/') + (parsed.search || ''),
        method   : options.method || 'GET',
        headers,
      };

      const req = lib.request(reqOptions, (res) => {
        let raw = '';
        res.on('data',  (chunk) => { raw += chunk; });
        res.on('end',   ()      => {
          const latency = Date.now() - start;
          let data = null;
          try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
          resolve({ status: res.statusCode, data, latency });
        });
      });

      // Hard timeout per request — prevents stuck promises
      req.setTimeout(10000, () => {
        req.destroy();
        resolve({ status: 0, data: null, latency: Date.now() - start, timedOut: true });
      });

      req.on('error', (err) => {
        resolve({ status: 0, data: null, latency: Date.now() - start, error: err.message });
      });

      if (body) req.write(body);
      req.end();
    });
  }

  async _readFile(parsed) {
    const start = Date.now();
    return new Promise((resolve) => {
      fs.readFile(parsed, 'utf8', (error, data) => {
        resolve({
          status: error ? 0 : 200,
          data: error ? null : data.slice(0, 5000),
          latency: Date.now() - start,
          error: error ? error.message : null,
        });
      });
    });
  }

  // ─── Public API actions ───────────────────────────────────────────────────

  /** POST /api/auth/login — stores returned token for subsequent calls */
  async loginUser(username, password) {
    const res = await this._request(this.endpoints.login, {
      method : 'POST',
      body   : { username, password },
    });
    if (res.status >= 200 && res.status < 300 && res.data?.token) {
      this.token = res.data.token;
    }
    return res;
  }

  /** POST /api/posts — creates a post with random sample content */
  async createPost(content) {
    const text = content || SAMPLE_POSTS[Math.floor(Math.random() * SAMPLE_POSTS.length)];
    return this._request(this.endpoints.post, {
      method : 'POST',
      body   : { content: text },
    });
  }

  /** GET /api/feed?page=N — fetches a feed page */
  async fetchFeed(page = 1) {
    return this._request(`${this.endpoints.feed}?page=${page}`);
  }

  /** GET a regular website page or read a local file target */
  async fetchPage() {
    return this._request(this.endpoints.page || '/');
  }
}

module.exports = ApiClient;
