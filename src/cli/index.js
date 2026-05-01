/**
 * CLI entry point — parses arguments, loads the scenario file, and fires
 * the runner. Supports named scenarios (light/medium/heavy) or a direct
 * path to any JSON file.
 *
 * Usage:
 *   node index.js --scenario light
 *   node index.js --scenario scenarios/custom.json
 *   node index.js --scenario medium --url http://localhost:4000 --users 10
 */

const path = require('path');
const fs   = require('fs');
const { run } = require('../engine/runner');

// ─── Arg parser ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      // Next token is the value if it doesn't start with '--'
      const next = argv[i + 1];
      args[key] = (next && !next.startsWith('--')) ? argv[++i] : true;
    }
  }
  return args;
}

// ─── Scenario loader ──────────────────────────────────────────────────────────

function loadScenario(nameOrPath) {
  let resolved = nameOrPath;

  // If no extension, treat as a built-in scenario name
  if (!resolved.endsWith('.json')) {
    resolved = path.join(__dirname, '../../scenarios', `${resolved}.json`);
  } else if (!path.isAbsolute(resolved)) {
    resolved = path.join(process.cwd(), resolved);
  }

  if (!fs.existsSync(resolved)) {
    console.error(`\n  Error: scenario not found — ${resolved}`);
    listScenarios();
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function listScenarios() {
  const dir = path.join(__dirname, '../../scenarios');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    : [];
  console.log('\n  Built-in scenarios:');
  files.forEach((f) => console.log(`    --scenario ${f.replace('.json', '')}`));
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(scenario) {
  const required = ['baseUrl', 'users', 'duration', 'actions'];
  for (const field of required) {
    if (scenario[field] == null) {
      console.error(`  Error: scenario missing required field "${field}"`);
      process.exit(1);
    }
  }
  if (!Array.isArray(scenario.actions) || scenario.actions.length === 0) {
    console.error('  Error: scenario.actions must be a non-empty array');
    process.exit(1);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.list) {
    listScenarios();
    process.exit(0);
  }

  if (!args.scenario) {
    console.error('\n  Usage: node index.js --scenario <name|path.json>');
    console.error('         node index.js --scenario light');
    console.error('         node index.js --scenario heavy --url http://localhost:4000');
    console.error('         node index.js --list\n');
    process.exit(1);
  }

  const scenario = loadScenario(args.scenario);

  // CLI overrides — useful for quick one-offs without editing JSON
  if (args.url)      scenario.baseUrl  = args.url;
  if (args.users)    scenario.users    = parseInt(args.users, 10);
  if (args.duration) scenario.duration = parseInt(args.duration, 10);

  validate(scenario);

  await run(scenario);
}

main().catch((err) => {
  console.error('\n  Fatal error:', err.message || err);
  process.exit(1);
});
