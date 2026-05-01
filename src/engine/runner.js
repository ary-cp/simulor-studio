/**
 * Runner — orchestrates parallel user simulators.
 *
 * Creates N UserSimulator instances, runs them all concurrently via
 * Promise.all, drives the live dashboard at 1-second intervals, and
 * saves the log file when the test completes.
 */

const path            = require('path');
const UserSimulator   = require('./simulator');
const MetricsCollector = require('../metrics/collector');

/**
 * @param {object} scenario - validated scenario config object
 * @returns {object} final metrics snapshot
 */
async function run(scenario) {
  const metrics = new MetricsCollector();
  const endTime = Date.now() + scenario.duration * 1000;

  // Clear terminal and show startup banner
  process.stdout.write('\x1b[2J\x1b[H');
  console.log(`\n  Starting "${scenario.name}" — ${scenario.users} users for ${scenario.duration}s`);
  console.log(`  Target: ${scenario.baseUrl}\n`);

  // Dashboard refresh — redraws every second
  const dashInterval = setInterval(() => {
    const remaining = Math.round((endTime - Date.now()) / 1000);
    metrics.renderDashboard(scenario.name, scenario.users, remaining);
  }, 1000);

  // Spin up all simulators concurrently
  const simulators = Array.from(
    { length: scenario.users },
    (_, i) => new UserSimulator(i + 1, scenario, metrics)
  );

  // Promise.all — each sim runs independently; we wait for all to finish
  await Promise.all(simulators.map((sim) => sim.run(endTime)));

  clearInterval(dashInterval);

  // Final dashboard render
  metrics.renderDashboard(scenario.name, scenario.users, 0);

  // Persist results
  const logDir  = path.join(process.cwd(), 'logs');
  const logFile = metrics.save(logDir);

  console.log(`\n  Test complete.`);
  console.log(`  Results saved → ${logFile}\n`);

  return metrics.getSnapshot();
}

module.exports = { run };
