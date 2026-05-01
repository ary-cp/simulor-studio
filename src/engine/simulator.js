/**
 * UserSimulator — models one virtual user.
 *
 * Each instance owns an ApiClient (so tokens stay isolated per user),
 * picks weighted-random actions, and runs a timed loop until `endTime`.
 */

const ApiClient = require('../api/client');

class UserSimulator {
  /**
   * @param {number} userId    - 1-based index (used to build test username)
   * @param {object} scenario  - parsed scenario config
   * @param {MetricsCollector} metrics
   */
  constructor(userId, scenario, metrics) {
    this.userId   = userId;
    this.scenario = scenario;
    this.metrics  = metrics;
    this.client   = new ApiClient(scenario.baseUrl, scenario.endpoints);

    // Build credentials from scenario config
    const creds       = scenario.credentials || {};
    this.username     = `${creds.usernamePrefix || 'testuser'}${userId}`;
    this.password     = creds.password || 'password123';
    this.isLoggedIn   = false;
  }

  // ─── Action selection ─────────────────────────────────────────────────────

  /**
   * Picks an action from scenario.actions.
   * If scenario.weights is provided, uses weighted random selection;
   * otherwise uniform random.
   */
  pickAction() {
    const { actions, weights } = this.scenario;

    if (!weights || weights.length !== actions.length) {
      return actions[Math.floor(Math.random() * actions.length)];
    }

    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < actions.length; i++) {
      r -= weights[i];
      if (r <= 0) return actions[i];
    }
    return actions[actions.length - 1];
  }

  /** Random delay within the configured [min, max] ms range */
  randomDelay() {
    const [min, max] = this.scenario.delayRange || [2000, 8000];
    return min + Math.random() * (max - min);
  }

  // ─── Action executors ─────────────────────────────────────────────────────

  async doLogin() {
    try {
      const res     = await this.client.loginUser(this.username, this.password);
      const success = res.status >= 200 && res.status < 300;
      if (success) this.isLoggedIn = true;
      this.metrics.record('login', res.latency, success, success ? null : `HTTP ${res.status}`);
    } catch (err) {
      this.metrics.record('login', 0, false, err);
    }
  }

  async doPost() {
    // Auto-login if we have credentials but haven't logged in yet
    if (!this.isLoggedIn && this.scenario.actions.includes('login')) {
      await this.doLogin();
    }
    try {
      const res     = await this.client.createPost();
      const success = res.status >= 200 && res.status < 300;
      this.metrics.record('post', res.latency, success, success ? null : `HTTP ${res.status}`);
    } catch (err) {
      this.metrics.record('post', 0, false, err);
    }
  }

  async doFeed() {
    try {
      // Randomise page to simulate different feed depths
      const page    = Math.ceil(Math.random() * 5);
      const res     = await this.client.fetchFeed(page);
      const success = res.status >= 200 && res.status < 300;
      this.metrics.record('feed', res.latency, success, success ? null : `HTTP ${res.status}`);
    } catch (err) {
      this.metrics.record('feed', 0, false, err);
    }
  }

  async doPage() {
    try {
      const res = await this.client.fetchPage();
      const success = res.status >= 200 && res.status < 400;
      this.metrics.record('page', res.latency, success, success ? null : `HTTP ${res.status}`);
    } catch (err) {
      this.metrics.record('page', 0, false, err);
    }
  }

  async executeAction(action) {
    switch (action) {
      case 'login': return this.doLogin();
      case 'post':  return this.doPost();
      case 'feed':  return this.doFeed();
      case 'page':
      case 'website':
      case 'url':   return this.doPage();
      case 'idle':  return null; // deliberate no-op — just delays
      default:
        // Unknown action — skip silently
        return null;
    }
  }

  // ─── Main run loop ────────────────────────────────────────────────────────

  /**
   * Runs until `endTime` (epoch ms), picking random actions and waiting
   * random delays between each. Returns when time expires.
   */
  async run(endTime) {
    // Eager login before the main loop so we start with a valid token
    if (this.scenario.actions.includes('login')) {
      await this.doLogin();
    }

    while (Date.now() < endTime) {
      const action    = this.pickAction();
      await this.executeAction(action);

      // Don't sleep past the end time
      const remaining = endTime - Date.now();
      if (remaining <= 0) break;

      const delay = Math.min(this.randomDelay(), remaining);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

module.exports = UserSimulator;
