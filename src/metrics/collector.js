/**
 * MetricsCollector — thread-safe (single-event-loop) metrics aggregator.
 *
 * Tracks per-action stats, maintains a sliding window for RPS calculation,
 * renders a live terminal dashboard, and serialises results to JSON.
 */

const fs   = require('fs');
const path = require('path');

// ANSI colour helpers
const C = {
  reset  : '\x1b[0m',
  bold   : '\x1b[1m',
  dim    : '\x1b[2m',
  cyan   : '\x1b[36m',
  green  : '\x1b[32m',
  yellow : '\x1b[33m',
  red    : '\x1b[31m',
  white  : '\x1b[37m',
};

class MetricsCollector {
  constructor() {
    this.startTime         = Date.now();
    // { actionName: { count, success, fail, totalLatency, errors[] } }
    this.actions           = {};
    // Rolling timestamps for RPS (last 10 s)
    this._requestTimestamps = [];
  }

  // ─── Recording ────────────────────────────────────────────────────────────

  /**
   * @param {string}  action   - e.g. "login", "post", "feed"
   * @param {number}  latency  - ms
   * @param {boolean} success
   * @param {Error|string|null} error
   */
  record(action, latency, success, error = null) {
    if (!this.actions[action]) {
      this.actions[action] = { count: 0, success: 0, fail: 0, totalLatency: 0, errors: [] };
    }
    const a = this.actions[action];
    a.count++;
    a.totalLatency += latency;

    if (success) {
      a.success++;
    } else {
      a.fail++;
      if (error) {
        // Keep last 100 errors per action to avoid memory bloat
        if (a.errors.length < 100) {
          a.errors.push({
            time  : new Date().toISOString(),
            error : error.message || String(error),
          });
        }
      }
    }

    this._requestTimestamps.push(Date.now());
  }

  // ─── Aggregation ──────────────────────────────────────────────────────────

  /** Requests per second over the last `windowMs` milliseconds */
  getRPS(windowMs = 10000) {
    const cutoff = Date.now() - windowMs;
    // Prune expired entries in place
    let i = 0;
    while (i < this._requestTimestamps.length && this._requestTimestamps[i] < cutoff) i++;
    if (i > 0) this._requestTimestamps.splice(0, i);
    return (this._requestTimestamps.length / (windowMs / 1000)).toFixed(2);
  }

  /** Returns a full snapshot of current metrics */
  getSnapshot() {
    let totalCount = 0, totalSuccess = 0, totalFail = 0, totalLatency = 0;

    for (const a of Object.values(this.actions)) {
      totalCount   += a.count;
      totalSuccess += a.success;
      totalFail    += a.fail;
      totalLatency += a.totalLatency;
    }

    return {
      elapsed      : Math.round((Date.now() - this.startTime) / 1000),
      totalCount,
      totalSuccess,
      totalFail,
      avgLatency   : totalCount ? Math.round(totalLatency / totalCount) : 0,
      rps          : this.getRPS(),
      byAction     : this.actions,
      timestamp    : new Date().toISOString(),
    };
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  /** Saves the final snapshot as a timestamped JSON file in `logDir` */
  save(logDir) {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    const ts       = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `run_${ts}.json`;
    const filepath = path.join(logDir, filename);

    const snapshot = this.getSnapshot();
    fs.writeFileSync(filepath, JSON.stringify(snapshot, null, 2));
    return filepath;
  }

  // ─── Live Dashboard ───────────────────────────────────────────────────────

  /**
   * Clears the terminal and redraws the live stats panel.
   * Called once per second from the runner's interval.
   */
  renderDashboard(scenarioName, totalUsers, remainingSecs) {
    const s    = this.getSnapshot();
    const mins = String(Math.floor(s.elapsed / 60)).padStart(2, '0');
    const secs = String(s.elapsed % 60).padStart(2, '0');

    const successRate = s.totalCount
      ? ((s.totalSuccess / s.totalCount) * 100).toFixed(1)
      : '0.0';
    const failRate = (100 - parseFloat(successRate)).toFixed(1);

    const SEP = `${C.cyan}${'═'.repeat(50)}${C.reset}`;
    const DIV = `${C.dim}${'─'.repeat(50)}${C.reset}`;

    const row = (label, value, color = C.white) =>
      `  ${C.dim}${label.padEnd(12)}${C.reset}  ${color}${C.bold}${value}${C.reset}`;

    const failColor = s.totalFail > 0 ? C.red : C.green;

    const lines = [
      '',
      SEP,
      `  ${C.bold}${C.cyan}SHEHERI TEST ENGINE${C.reset}${C.dim}  —  live${C.reset}`,
      SEP,
      row('Scenario',  scenarioName),
      row('Elapsed',   `${mins}:${secs}  (${Math.max(0, remainingSecs)}s remaining)`, C.cyan),
      row('Users',     String(totalUsers)),
      DIV,
      row('Requests',  s.totalCount.toLocaleString()),
      row('RPS',       s.rps,                        C.yellow),
      row('Avg Lat',   `${s.avgLatency}ms`,           C.yellow),
      row('Success',   `${s.totalSuccess.toLocaleString()} (${successRate}%)`, C.green),
      row('Failures',  `${s.totalFail.toLocaleString()} (${failRate}%)`,        failColor),
      DIV,
      `  ${C.bold}Per-action breakdown:${C.reset}`,
    ];

    for (const [name, data] of Object.entries(s.byAction)) {
      const avg = data.count ? Math.round(data.totalLatency / data.count) : 0;
      const ok  = data.count ? ((data.success / data.count) * 100).toFixed(0) : '0';
      lines.push(
        `  ${C.dim}${name.padEnd(10)}${C.reset}` +
        `  ${String(data.count).padStart(6)} reqs` +
        `  ${String(avg).padStart(6)}ms avg` +
        `  ${ok}% ok`
      );
    }

    lines.push(SEP);
    lines.push('');

    // \x1b[H = cursor to top-left, \x1b[J = clear to end of screen
    process.stdout.write('\x1b[H\x1b[J' + lines.join('\n') + '\n');
  }
}

module.exports = MetricsCollector;
