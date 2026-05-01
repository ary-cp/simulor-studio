# Simulor Reliability Studio

Simulor is a high-fidelity, local-first web and API reliability engine. It's built for developers who need cinematic testing, deep diagnostic signal, and beautiful reporting without the complexity of enterprise QA suites.

![Node.js](https://img.shields.io/badge/Node.js-16%2B-183d32)
![Dependencies](https://img.shields.io/badge/runtime-zero_dependencies-9be7c9)
![License](https://img.shields.io/badge/license-MIT-d86145)

## Features
- **Local-first Engine**: Runs in your environment, testing your code with zero latency.
- **Cinematic Dashboard**: A premium, high-impact workspace for monitoring and control.
- **AI-Grade Signals**: Track latency, success rates, and action-level health with precision.
- **Member-Driven Model**: Open source at heart, with professional features unlocked via free registration.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/simulor/simulor-studio.git
cd simulor-studio
npm run dev
```

`npm run dev` starts the demo API, starts the dashboard, picks free ports automatically, and opens the browser.

If you prefer manual mode:

```bash
npm run demo-api
npm run dashboard
```

Open the exact dashboard URL printed in the terminal. If `4173` is busy, it will try `4174`, `4175`, and so on.

## What It Can Test

- Public websites like `https://example.com`
- Localhost apps like `http://localhost:5173`
- APIs with login/feed/post style scenarios
- Local files like `D:\my-site\index.html`
- `file:///D:/my-site/index.html`

Use **Universal Target Tester** in the dashboard:

- **Probe** checks reachability, status, latency, title, links, scripts, and styles.
- **Quick Run** creates a temporary `page` scenario and runs a smoke/load test.

## Features

- Startup-style landing page plus responsive dashboard
- SaaS-style pricing, workflow, FAQ, final CTA, and production-readiness sections
- One-command local demo with auto-open browser
- Automatic port fallback for dashboard and demo API
- Built-in demo API target
- Scenario cards for `light`, `medium`, and `heavy`
- Custom scenario builder saved into `scenarios/`
- Browser launch pad for test runs
- Stop active runs from the dashboard
- Saved JSON reports in `logs/`
- Run history, report details, raw JSON preview
- Health grade and practical insights
- Canvas chart and action breakdown table
- Run comparison panel
- CSV export at `/api/export.csv`
- No external runtime dependencies

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start demo API + dashboard and open browser |
| `npm run dashboard` | Start only the dashboard |
| `npm run dashboard:open` | Start dashboard and open browser on Windows |
| `npm run demo-api` | Start the demo API target |
| `npm run demo-test` | Run a short test against the active demo API |
| `npm run light` | Run light built-in scenario |
| `npm run medium` | Run medium built-in scenario |
| `npm run heavy` | Run heavy built-in scenario |
| `npm run check` | Syntax-check all project scripts |

## Dashboard APIs

| Route | Purpose |
|-------|---------|
| `GET /api/health` | Server health check |
| `GET /api/summary` | Aggregate stats |
| `GET /api/scenarios` | Scenario configs |
| `POST /api/scenarios` | Create a custom scenario |
| `DELETE /api/scenarios/:id` | Delete a custom scenario |
| `GET /api/logs` | Saved run summaries |
| `GET /api/logs/:file` | Detailed report |
| `DELETE /api/logs/:file` | Delete one saved log |
| `POST /api/compare` | Compare selected logs |
| `POST /api/probe` | Probe a URL or local file |
| `POST /api/quick-run` | Start quick website/local-file run |
| `GET /api/export.csv` | Download CSV report |
| `GET /api/run` | Active run status |
| `POST /api/run` | Start a scenario |
| `POST /api/run/stop` | Stop active run |

## Demo API

The demo API implements the default scenario endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | `GET` | Demo server health check |
| `/api/auth/login` | `POST` | Returns a fake bearer token |
| `/api/posts` | `POST` | Creates an in-memory post |
| `/api/feed?page=1` | `GET` | Returns an in-memory feed |

If `3000` is busy, the demo API automatically tries `3001`, `3002`, and so on. The chosen port is saved to `.demo-api-port`, so `npm run demo-test` targets the correct URL.

## Scenario Config

Scenarios live in `scenarios/`.

```json
{
  "name": "medium",
  "baseUrl": "http://localhost:3000",
  "users": 20,
  "duration": 120,
  "actions": ["login", "post", "feed", "idle"],
  "weights": [1, 3, 6, 1],
  "delayRange": [2000, 6000],
  "credentials": {
    "usernamePrefix": "testuser",
    "password": "password123"
  },
  "endpoints": {
    "login": "/api/auth/login",
    "post": "/api/posts",
    "feed": "/api/feed"
  }
}
```

Supported actions:

| Action | What it does |
|--------|--------------|
| `login` | POST credentials and store bearer token |
| `post` | POST sample content |
| `feed` | GET a paginated feed |
| `page` | GET a website page or read a local file |
| `idle` | Wait without sending a request |

## Project Structure

```text
sheheri-tester/
  public/                 dashboard UI
  src/api/                HTTP, HTTPS, and file client
  src/dashboard/          dashboard server and APIs
  src/demo/               demo API and demo test launcher
  src/dev/                one-command launcher
  src/engine/             user simulator and runner
  src/metrics/            metrics collector and report writer
  scenarios/              scenario JSON files
  logs/                   generated run reports
  docs/                   architecture and screenshots
```

See [docs/architecture.md](docs/architecture.md) for the architecture diagram.

## Quality Check

```bash
npm run check
```

## License

MIT
