const state = {
  scenarios: [],
  logs: [],
  summary: null,
  selectedRun: null,
  pollTimer: null,
};

const $ = (selector) => document.querySelector(selector);

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatDate(value) {
  if (!value) return 'Unknown time';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function setOptions() {
  const isMember = !!(window.Clerk && window.Clerk.user);
  
  $('#runSelect').innerHTML = state.logs.map((run, index) => (
    `<option value="${index}">${escapeHtml(run.file)} - ${formatDate(run.timestamp)}</option>`
  )).join('');

  // Filter out "heavy" or "load" scenarios for guests
  const filteredScenarios = state.scenarios.filter(s => {
    if (isMember) return true;
    const id = s.id.toLowerCase();
    return !id.includes('heavy') && !id.includes('load') && !id.includes('stress');
  });

  $('#scenarioSelect').innerHTML = filteredScenarios.map((scenario) => (
    `<option value="${escapeHtml(scenario.id)}">${escapeHtml(scenario.name || scenario.id)}</option>`
  )).join('');
}

function renderMetrics(run) {
  $('#totalRequests').textContent = formatNumber(run.totalCount);
  $('#avgLatency').textContent = `${run.avgLatency || 0}ms`;
  $('#successRate').textContent = `${run.successRate || 0}%`;
  $('#failureCount').textContent = `${formatNumber(run.totalFail)} failures`;
  $('#healthGrade').textContent = run.grade?.score ?? 0;
  $('#gradeLabel').textContent = run.grade?.label || 'Analyzing';
  $('#heroGrade').textContent = `${run.grade?.score ?? 0}/100 - ${run.grade?.label || 'Analyzing'}`;
  $('#latestRun').textContent = `${run.file} - ${formatDate(run.timestamp)}`;
  $('#requestTrend').textContent = `${run.elapsed || 0}s test window`;
}

function renderInsights(run) {
  const insights = run.insights || [];
  $('#insightList').innerHTML = insights.map((item) => `
    <article class="insight-item">
      <span></span>
      <p>${escapeHtml(item)}</p>
    </article>
  `).join('') || '<p class="empty-copy">No insights yet. Run a test to generate signal.</p>';
}

function renderActionRows(run) {
  const rows = run.actions.map((action) => `
    <tr>
      <td><strong>${escapeHtml(action.name)}</strong></td>
      <td>${formatNumber(action.count)}</td>
      <td>${action.avgLatency}ms</td>
      <td>${action.successRate}%</td>
    </tr>
  `).join('');

  $('#actionRows').innerHTML = rows || '<tr><td colspan="4">No action data yet.</td></tr>';
}

function drawChart(run) {
  const canvas = $('#actionChart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(640, rect.width * dpr);
  canvas.height = 320 * dpr;
  ctx.scale(dpr, dpr);

  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  ctx.clearRect(0, 0, width, height);

  const actions = run.actions.length ? run.actions : [{ name: 'No data', count: 1 }];
  const max = Math.max(...actions.map((item) => item.count), 1);
  const padding = 34;
  const barGap = 16;
  const barWidth = Math.max(34, (width - padding * 2 - barGap * (actions.length - 1)) / actions.length);

  const isLight = document.body.dataset.theme === 'light';
  
  ctx.fillStyle = isLight ? '#edf3ec' : '#0b110e';
  ctx.fillRect(0, 0, width, height);

  actions.forEach((action, index) => {
    const x = padding + index * (barWidth + barGap);
    const barHeight = Math.max(10, ((height - 96) * action.count) / max);
    const y = height - 54 - barHeight;
    const gradient = ctx.createLinearGradient(0, y, 0, height - 54);
    gradient.addColorStop(0, isLight ? '#183d32' : '#2dd4bf');
    gradient.addColorStop(1, isLight ? '#9be7c9' : '#0284c7');

    ctx.fillStyle = gradient;
    roundRect(ctx, x, y, barWidth, barHeight, 14);
    ctx.fill();

    ctx.fillStyle = isLight ? '#16201b' : '#f0f4f2';
    ctx.font = '700 15px Inter, sans-serif';
    ctx.fillText(formatNumber(action.count), x, y - 10);
    ctx.fillStyle = isLight ? '#68746e' : '#8a9691';
    ctx.font = '13px Inter, sans-serif';
    ctx.fillText(action.name, x, height - 24);
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function renderHistory() {
  $('#historyList').innerHTML = state.logs.map((run, index) => `
    <article class="history-item" data-run="${index}" tabindex="0">
      <div>
        <strong>${escapeHtml(run.file)}</strong>
        <div class="meta-line">
          <span>${formatDate(run.timestamp)}</span>
          <span>${formatNumber(run.totalCount)} req</span>
          <span>${run.successRate}% ok</span>
        </div>
      </div>
      <div class="history-actions">
        <span class="grade-pill ${run.grade?.tone || ''}">${run.grade?.score ?? 0}</span>
        ${run.file === 'demo-sample.json' ? '' : `<button type="button" class="tiny-danger" data-delete-log="${escapeHtml(run.file)}">Delete</button>`}
      </div>
    </article>
  `).join('');
}

function renderScenarios() {
  $('#scenarioCards').innerHTML = state.scenarios.map((scenario) => `
    <article class="scenario-card">
      <div class="scenario-topline">
        <strong>${escapeHtml(scenario.name || scenario.id)}</strong>
        <div class="scenario-actions">
          <button type="button" data-scenario="${escapeHtml(scenario.id)}">Use</button>
          ${['light', 'medium', 'heavy'].includes(scenario.id) ? '' : `<button type="button" class="tiny-danger" data-delete-scenario="${escapeHtml(scenario.id)}">Delete</button>`}
        </div>
      </div>
      <div class="meta-line">
        <span>${scenario.users} users</span>
        <span>${scenario.duration}s</span>
        <span>${escapeHtml((scenario.actions || []).join(', '))}</span>
      </div>
      <p>${escapeHtml(scenario.baseUrl || '')}</p>
    </article>
  `).join('');
}

function renderCompare(result) {
  const runs = result?.runs || [];
  const winner = result?.winner?.file;
  $('#compareList').innerHTML = runs.map((run) => `
    <article class="compare-card ${run.file === winner ? 'winner' : ''}">
      <span>${run.file === winner ? 'Best run' : 'Run'}</span>
      <strong>${escapeHtml(run.file)}</strong>
      <div class="meta-line">
        <span>Grade ${run.grade?.score ?? 0}</span>
        <span>${run.successRate}% ok</span>
        <span>${run.avgLatency}ms avg</span>
        <span>${formatNumber(run.totalCount)} req</span>
      </div>
    </article>
  `).join('') || '<p class="empty-copy">Run a few tests to compare results.</p>';
}

function renderProbe(result) {
  $('#probeResult').innerHTML = `
    <div class="probe-card ${result.ok ? 'ok' : 'bad'}">
      <strong>${result.ok ? 'Target reachable' : 'Target needs attention'}</strong>
      <div class="meta-line">
        <span>${escapeHtml(result.kind || 'unknown')}</span>
        <span>Status ${result.status ?? 0}</span>
        <span>${result.latency ?? 0}ms</span>
        <span>${formatNumber(result.bytes || 0)} bytes</span>
      </div>
      <p>${escapeHtml(result.title || result.error || result.target || '')}</p>
      ${result.links != null ? `<div class="meta-line"><span>${result.links} links</span><span>${result.scripts} scripts</span><span>${result.styles} stylesheets</span></div>` : ''}
    </div>
  `;
}

function renderReport(run) {
  $('#reportTitle').textContent = run.file;
  const errorCount = run.actions.reduce((sum, action) => sum + (action.errors?.length || 0), 0);
  const statusColor = run.grade?.score >= 80 ? 'var(--mint)' : run.grade?.score >= 50 ? 'var(--amber)' : 'var(--danger)';
  $('#reportDetails').innerHTML = `
    <div class="report-score" style="border-left: 4px solid ${statusColor}; padding-left: 16px; margin-bottom: 24px;">
      <strong style="font-size: 2.5rem; color: ${statusColor};">${run.grade?.score ?? 0}</strong>
      <span style="font-size: 1.1rem; color: var(--muted); margin-left: 8px;">${escapeHtml(run.grade?.label || 'Analyzing')}</span>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
      <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 12px;">
        <div style="color: var(--muted); font-size: 0.85rem; text-transform: uppercase;">Timestamp</div>
        <div style="font-size: 1.1rem; margin-top: 4px;">${formatDate(run.timestamp)}</div>
      </div>
      <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 12px;">
        <div style="color: var(--muted); font-size: 0.85rem; text-transform: uppercase;">Duration</div>
        <div style="font-size: 1.1rem; margin-top: 4px;">${run.elapsed}s</div>
      </div>
      <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 12px;">
        <div style="color: var(--muted); font-size: 0.85rem; text-transform: uppercase;">Requests per Sec</div>
        <div style="font-size: 1.1rem; margin-top: 4px;">${run.rps}</div>
      </div>
      <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 12px;">
        <div style="color: var(--muted); font-size: 0.85rem; text-transform: uppercase;">Failures / Errors</div>
        <div style="font-size: 1.1rem; margin-top: 4px; color: ${run.totalFail > 0 ? 'var(--danger)' : 'var(--ink)'};">${formatNumber(run.totalFail)} / ${formatNumber(errorCount)}</div>
      </div>
    </div>
    <details style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px;">
      <summary style="cursor: pointer; color: var(--forest); font-weight: 600;">View Raw JSON Payload</summary>
      <pre style="margin-top: 12px; overflow-x: auto; color: var(--mint); font-family: monospace; font-size: 0.9rem;">${escapeHtml(JSON.stringify(run.raw, null, 2))}</pre>
    </details>
  `;
}

function selectRun(index) {
  state.selectedRun = state.logs[index] || state.logs[0];
  if (!state.selectedRun) return;
  $('#runSelect').value = String(state.logs.indexOf(state.selectedRun));
  renderMetrics(state.selectedRun);
  renderInsights(state.selectedRun);
  renderActionRows(state.selectedRun);
  renderReport(state.selectedRun);
  drawChart(state.selectedRun);
}

async function refresh() {
  const [summary, scenarios, logs] = await Promise.all([
    fetchJson('/api/summary'),
    fetchJson('/api/scenarios'),
    fetchJson('/api/logs'),
  ]);

  state.summary = summary;
  state.scenarios = scenarios;
  state.logs = logs;
  setOptions();
  renderHistory();
  renderScenarios();
  selectRun(0);
}

async function pollRun() {
  const run = await fetchJson('/api/run');
  const status = run.status || 'idle';
  $('#runStatus').textContent = status === 'running' ? 'Running test' : status.charAt(0).toUpperCase() + status.slice(1);
  $('#runOutput').textContent = run.output ? run.output.join('').trim() || run.command : 'No active run yet.';
  $('#stopRunButton').disabled = status !== 'running';

  if (status === 'running') {
    state.pollTimer = setTimeout(pollRun, 1500);
  } else {
    await refresh();
  }
}

function updateView() {
  const isDashboardPage = window.location.pathname.includes('dashboard.html');
  
  if (isDashboardPage) {
    const hash = window.location.hash || '#dashboard';
    
    // Auth Check (Removed for demo/dev)
    // if (window.ClerkIsReady && !window.Clerk.user) {
    //   window.location.href = '/index.html';
    //   return;
    // }

    // Hide all dashboard tabs
    document.querySelectorAll('.dashboard-tab').forEach(tab => {
      tab.style.display = 'none';
    });
    
    // Show active tab
    const tabId = hash === '#dashboard' ? 'tab-dashboard' : 'tab-' + hash.substring(1);
    const activeTab = document.getElementById(tabId);
    if (activeTab) activeTab.style.display = 'block';
    
    // Update active state on sidebar links
    document.querySelectorAll('.sidebar .nav-list a').forEach(link => {
      const isMatch = link.getAttribute('href') === hash;
      link.classList.toggle('active', isMatch);
      if (isMatch) {
        // Update header
        const label = link.textContent;
        $('#currentTabLabel').textContent = label;
        $('#currentTabTitle').textContent = label === 'Overview' ? 'Command Center' : 
                                            label === 'Target Test' ? 'Universal Target Tester' :
                                            label === 'Scenarios' ? 'Scenario Library' :
                                            label === 'Builder' ? 'Scenario Builder' :
                                            label === 'Reports' ? 'Recent Results' : 'Launch Pad';
      }
    });

    window.scrollTo(0, 0);
  }
}

function bindEvents() {
  window.addEventListener('hashchange', updateView);
  
  $('#runSelect')?.addEventListener('change', (event) => selectRun(Number(event.target.value)));
  $('#refreshButton')?.addEventListener('click', refresh);
  $('#historyList')?.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-delete-log]');
    if (deleteButton) {
      event.stopPropagation();
      deleteLog(deleteButton.dataset.deleteLog);
      return;
    }
    const item = event.target.closest('[data-run]');
    if (item) selectRun(Number(item.dataset.run));
  });
  $('#scenarioCards')?.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-delete-scenario]');
    if (deleteButton) {
      deleteScenario(deleteButton.dataset.deleteScenario);
      return;
    }
    const button = event.target.closest('[data-scenario]');
    if (!button) return;
    $('#scenarioSelect').value = button.dataset.scenario;
    document.location.hash = '#runner';
  });

  $('#scenarioForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    payload.actions = String(payload.actions || '').split(',').map((item) => item.trim()).filter(Boolean);
    $('#scenarioMessage').textContent = 'Saving scenario...';

    const result = await fetchJson('/api/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    $('#scenarioMessage').textContent = result.ok ? `Saved ${result.scenario.name}.` : result.error;
    if (result.ok) await refresh();
  });

  $('#probeButton')?.addEventListener('click', async () => {
    let testCount = parseInt(localStorage.getItem('Simulor_test_count') || '0', 10);
    if (testCount >= 2) {
      $('#probeResult').textContent = 'Free tier limit reached (2 tests max). Please upgrade to Pro to continue testing.';
      return;
    }
    localStorage.setItem('Simulor_test_count', testCount + 1);

    const form = new FormData($('#targetForm'));
    const target = form.get('target');
    $('#probeResult').textContent = 'Checking target...';
    const result = await fetchJson('/api/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    renderProbe(result);
  });

  $('#targetForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    let testCount = parseInt(localStorage.getItem('Simulor_test_count') || '0', 10);
    if (testCount >= 2) {
      $('#probeResult').textContent = 'Free tier limit reached (2 tests max). Please upgrade to Pro to continue testing.';
      return;
    }
    localStorage.setItem('Simulor_test_count', testCount + 1);

    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    $('#probeResult').textContent = 'Creating a quick smoke run...';
    const result = await fetchJson('/api/quick-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!result.ok) {
      $('#probeResult').textContent = result.error;
      return;
    }
    renderProbe({ ok: true, kind: 'quick-run', status: 'started', latency: 0, bytes: 0, title: result.run.command });
    clearTimeout(state.pollTimer);
    pollRun();
  });

  $('#compareButton')?.addEventListener('click', compareTopRuns);

  $('#runForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    let testCount = parseInt(localStorage.getItem('Simulor_test_count') || '0', 10);
    if (testCount >= 2) {
      $('#runOutput').textContent = 'Free tier limit reached (2 tests max). Please upgrade to Pro to run more load scenarios.';
      return;
    }
    localStorage.setItem('Simulor_test_count', testCount + 1);

    const isMember = !!(window.Clerk && window.Clerk.user);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries([...form.entries()].filter(([, value]) => value));
    
    // Enforcement
    if (!isMember) {
      if (payload.profile !== 'small') {
        $('#runOutput').textContent = 'Error: Guest users can only run Small profiles. Please Sign In to unlock Medium/Heavy loads.';
        return;
      }
      payload.limit = 100; // Force 100 requests for guests
    }

    $('#runOutput').textContent = 'Starting run...';

    try {
      const result = await fetchJson('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!result.ok) {
        $('#runOutput').textContent = result.error;
        return;
      }

      clearTimeout(state.pollTimer);
      pollRun();
    } catch (error) {
      $('#runOutput').textContent = error.message;
    }
  });

  $('#stopRunButton')?.addEventListener('click', async () => {
    const result = await fetchJson('/api/run/stop', { method: 'POST' });
    $('#runOutput').textContent = result.ok ? 'Stopping active run...' : result.error;
    clearTimeout(state.pollTimer);
    pollRun();
  });

  window.addEventListener('resize', () => {
    if (state.selectedRun) drawChart(state.selectedRun);
  });
  


  // Magic Spotlight
  const spotlight = document.querySelector('.magic-spotlight');
  if (spotlight) {
    window.addEventListener('mousemove', (e) => {
      spotlight.style.setProperty('--x', `${e.clientX}px`);
      spotlight.style.setProperty('--y', `${e.clientY}px`);
    });
  }

  // Custom Cursor
  const cursor = document.querySelector('.custom-cursor');
  if (cursor) {
    window.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    });

    document.querySelectorAll('a, button, input, select, [role="button"], .palette-item, .history-item, .scenario-card').forEach(el => {
      el.addEventListener('mouseenter', () => cursor.classList.add('active'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('active'));
    });
  }

  // Command Palette Logic
  const palette = $('#commandPalette');
  const paletteSearch = $('#paletteSearch');
  
  const togglePalette = (show) => {
    palette?.classList.toggle('active', show);
    if (show) paletteSearch?.focus();
  };

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      togglePalette(true);
    }
    if (e.key === 'Escape') togglePalette(false);
  });

  palette?.addEventListener('click', (e) => {
    if (e.target === palette) togglePalette(false);
  });

  document.querySelectorAll('.palette-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      togglePalette(false);
      
      switch(action) {
        case 'go-home': window.location.href = '/index.html'; break;
        case 'go-dashboard': window.location.href = '/dashboard.html'; break;
        case 'go-pricing': window.location.href = '/pricing.html'; break;
        case 'go-docs': window.location.href = '/docs.html'; break;
        case 'toggle-theme': $('#themeToggle')?.click(); break;
      }
    });
  });

  // Newsletter Form Success
  $('.newsletter-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const input = e.target.querySelector('input');
    btn.textContent = 'Subscribed!';
    btn.disabled = true;
    input.disabled = true;
    input.value = 'Check your inbox!';
  });

  updateView();
}

const isDashboardPage = window.location.pathname.includes('dashboard.html');

$('#themeToggle')?.addEventListener('click', () => {
  const body = document.body;
  const isLight = body.dataset.theme === 'light';
  body.dataset.theme = isLight ? 'dark' : 'light';
  
  const sunIcon = document.querySelector('.sun-icon');
  const moonIcon = document.querySelector('.moon-icon');
  if (isLight) {
    if (sunIcon) sunIcon.style.display = 'block';
    if (moonIcon) moonIcon.style.display = 'none';
  } else {
    if (sunIcon) sunIcon.style.display = 'none';
    if (moonIcon) moonIcon.style.display = 'block';
  }
  
  if (typeof state !== 'undefined' && state.selectedRun && typeof drawChart === 'function') {
    drawChart(state.selectedRun);
  }
});

bindEvents();
if (isDashboardPage) {
  refresh()
    .then(pollRun)
    .catch((error) => {
      if ($('#runOutput')) $('#runOutput').textContent = error.message;
    });
}

async function deleteLog(file) {
  const result = await fetchJson(`/api/logs/${encodeURIComponent(file)}`, { method: 'DELETE' });
  $('#runOutput').textContent = result.ok ? `Deleted ${file}` : result.error;
  await refresh();
}

async function deleteScenario(id) {
  const result = await fetchJson(`/api/scenarios/${encodeURIComponent(id)}`, { method: 'DELETE' });
  $('#scenarioMessage').textContent = result.ok ? `Deleted ${id}.` : result.error;
  await refresh();
}

async function compareTopRuns() {
  const files = state.logs.filter((run) => run.file !== 'demo-sample.json').slice(0, 3).map((run) => run.file);
  if (!files.length) {
    renderCompare({ runs: [] });
    return;
  }
  const result = await fetchJson('/api/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });
  renderCompare(result);
}

// Setup scroll reveal
function initReveal() {
  if (window.revealInitialized) return;
  window.revealInitialized = true;

  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px',
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
      }
    });
  }, observerOptions);

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
  
  // Auto-add reveal to common elements
  document.querySelectorAll('article, .section-heading, .console-grid, .price-card').forEach(el => {
    // Skip timeline steps to avoid conflict
    if (el.classList.contains('timeline-step')) return;

    if (!el.classList.contains('reveal')) {
      el.classList.add('reveal');
      observer.observe(el);
    }
  });

  // Engine Progress Logic
  const engineProgress = document.getElementById('engineProgress');
  const engineSteps = document.querySelectorAll('.engine-step');
  
  if (engineProgress && engineSteps.length > 0) {
    const handleEngineScroll = () => {
      const section = document.querySelector('.engine-section');
      const rect = section.getBoundingClientRect();
      const winHeight = window.innerHeight;
      
      // Calculate scroll percentage relative to section
      const totalDist = rect.height - winHeight + 200;
      const scrolled = Math.max(0, Math.min(1, (winHeight / 2 - rect.top) / totalDist));
      
      engineProgress.style.height = (scrolled * 100) + '%';
      
      // Activate steps & Parallax
      engineSteps.forEach((step, idx) => {
        const stepRect = step.getBoundingClientRect();
        const offset = stepRect.top - winHeight / 2;
        
        if (stepRect.top < winHeight * 0.8 && stepRect.bottom > winHeight * 0.2) {
          step.classList.add('active');
        } else {
          if (stepRect.top < winHeight * 0.2) step.classList.add('active');
          else step.classList.remove('active');
        }
      });
    };
    
    window.addEventListener('scroll', handleEngineScroll);
    handleEngineScroll(); // Initial check
  }

  const timelineSteps = document.querySelectorAll('.timeline-step');
  const timelineWrapper = document.querySelector('.timeline-wrapper');

  if (timelineWrapper && timelineSteps.length > 0) {
    let hasRun = false;
    const runSweepAnimation = () => {
      if (hasRun) return;
      hasRun = true;
      let progress = 0;
      const duration = 2000; // 2 seconds
      const start = performance.now();

      const animate = (now) => {
        const elapsed = now - start;
        const p = Math.min(1, elapsed / duration);
        
        // Easing: easeInOutCubic
        const easedP = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        const percentage = easedP * 100;

        timelineWrapper.style.setProperty('--progress', percentage + '%');

        timelineSteps.forEach((step, idx) => {
          const stepThreshold = (idx / (timelineSteps.length - 1)) * 100;
          // Trigger reveal exactly when dot is at or past the marker
          if (percentage >= stepThreshold) {
            step.classList.add('revealed');
          }
        });

        if (p < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setTimeout(runSweepAnimation, 400); // Slight delay for impact
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });

    observer.observe(timelineWrapper);
  }
}

document.addEventListener('DOMContentLoaded', initReveal);
// Fallback for SPA-like navigation or late rendering
setTimeout(initReveal, 1000);

// Global Login Trigger
window.triggerLogin = function() {
  if (window.Clerk && !window.Clerk.user) {
    window.Clerk.openSignIn();
  } else {
    window.location.href = '/dashboard.html';
  }
};

// Guest/Member View Update
window.updateView = function() {
  const isMember = !!(window.Clerk && window.Clerk.user);
  
  // Guard Builder
  const builderOverlay = document.getElementById('builderOverlay');
  const builderBadge = document.getElementById('builderBadge');
  if (builderOverlay) builderOverlay.style.display = isMember ? 'none' : 'flex';
  if (builderBadge) builderBadge.style.display = isMember ? 'none' : 'inline-block';

  // Guard Profiles
  const medProfile = document.getElementById('profileMedium');
  const heavyProfile = document.getElementById('profileHeavy');
  if (medProfile && !isMember) {
    medProfile.style.pointerEvents = 'none';
    medProfile.querySelector('.profile-card-mini').classList.add('locked');
  }
  if (heavyProfile && !isMember) {
    heavyProfile.style.pointerEvents = 'none';
    heavyProfile.querySelector('.profile-card-mini').classList.add('locked');
  }

  // Refresh scenario dropdown based on guest status
  setOptions();
};

// Hook into Clerk readiness
document.addEventListener('DOMContentLoaded', () => {
  if (window.ClerkIsReady) updateView();
});

// Hero Terminal Logic
document.addEventListener('DOMContentLoaded', () => {
  const heroProbeBtn = document.getElementById('heroProbeBtn');
  const heroProbeInput = document.getElementById('heroProbeInput');
  const heroProbeResult = document.getElementById('heroProbeResult');

  const addTerminalLine = (text, type = 'info') => {
    if (!heroProbeResult) return;
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerHTML = `<span style="color: var(--mint)">[SYSTEM]</span> ${text}`;
    heroProbeResult.appendChild(line);
    heroProbeResult.scrollTop = heroProbeResult.scrollHeight;
  };

  if (heroProbeBtn) {
    heroProbeBtn.addEventListener('click', () => {
      const url = heroProbeInput.value.trim();
      if (!url) return;

      heroProbeResult.style.display = 'block';
      heroProbeResult.innerHTML = '<div class="terminal-cursor"></div>';
      
      const logs = [
        `Initializing probe for: ${url}`,
        `DNS Lookup... Resolved.`,
        `Establishing secure connection...`,
        `Analyzing reliability metrics...`,
        `Finalizing report...`
      ];

      let i = 0;
      const interval = setInterval(() => {
        if (i < logs.length) {
          addTerminalLine(logs[i]);
          i++;
        } else {
          clearInterval(interval);
          addTerminalLine('<span style="color: var(--mint)">Probe Complete. Redirecting...</span>');
          setTimeout(() => {
            window.location.href = '/dashboard.html';
          }, 1500);
        }
      }, 600);
    });
  }
});
