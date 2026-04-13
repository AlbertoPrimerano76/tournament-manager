#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { performance } from 'node:perf_hooks'

const ROUTES = {
  pageHome: 'GET /',
  apiTournaments: 'GET /api/v1/tournaments',
  pageOrganization: 'GET /:orgSlug',
  apiOrganization: 'GET /api/v1/organizations/:slug',
  pageTournament: 'GET /tornei/:slug',
  apiTournament: 'GET /api/v1/tournaments/:slug',
  apiTournamentAgeGroups: 'GET /api/v1/tournaments/:slug/age-groups',
  apiTournamentProgram: 'GET /api/v1/tournaments/:slug/program',
  apiTournamentFields: 'GET /api/v1/tournaments/:slug/fields',
  pageAgeGroup: 'GET /tornei/:slug/:ageGroupId',
  apiAgeGroupProgram: 'GET /api/v1/age-groups/:id/program',
  apiAgeGroupStandings: 'GET /api/v1/age-groups/:id/standings',
  apiAgeGroupMatches: 'GET /api/v1/age-groups/:id/matches',
  pageMatch: 'GET /partite/:id',
  apiMatch: 'GET /api/v1/matches/:id',
}

function showHelp() {
  console.log(`Public load tester

Usage:
  node scripts/public-load-test.mjs [options]

Options:
  --frontend-url <url>       Public frontend base URL
  --api-url <url>            Public API base URL
  --users <n>                Concurrent virtual users
  --duration <sec>           Test duration in seconds
  --ramp-up <sec>            Ramp-up time in seconds
  --think-min <ms>           Minimum think time between steps
  --think-max <ms>           Maximum think time between steps
  --timeout <ms>             Per-request timeout
  --max-tournaments <n>      Max tournaments to discover
  --max-age-groups <n>       Max age groups per tournament to use
  --output-dir <path>        Report output directory
  --max-failure-rate <pct>   Heuristic failure threshold, default 0.02
  --max-p95 <ms>             Heuristic p95 threshold, default 1500
  --help                     Show this help

Examples:
  node scripts/public-load-test.mjs --frontend-url http://localhost:5180 --api-url http://localhost:8002 --users 100 --duration 60
  node scripts/public-load-test.mjs --frontend-url https://minrugby-gestione-tornei.vercel.app --api-url https://rugby-tournament-api.onrender.com --users 500 --duration 180 --ramp-up 60
`)
}

function parseArgs(argv) {
  const config = {
    frontendUrl: 'http://localhost:5180',
    apiUrl: 'http://localhost:8002',
    users: 50,
    durationSec: 60,
    rampUpSec: 15,
    thinkMinMs: 150,
    thinkMaxMs: 900,
    timeoutMs: 10_000,
    maxTournaments: 3,
    maxAgeGroups: 2,
    outputDir: 'load-test-reports',
    maxFailureRate: 0.02,
    maxP95Ms: 1500,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--help') {
      showHelp()
      process.exit(0)
    }
    if (arg === '--frontend-url') config.frontendUrl = next
    if (arg === '--api-url') config.apiUrl = next
    if (arg === '--users') config.users = Number.parseInt(next, 10)
    if (arg === '--duration') config.durationSec = Number.parseInt(next, 10)
    if (arg === '--ramp-up') config.rampUpSec = Number.parseInt(next, 10)
    if (arg === '--think-min') config.thinkMinMs = Number.parseInt(next, 10)
    if (arg === '--think-max') config.thinkMaxMs = Number.parseInt(next, 10)
    if (arg === '--timeout') config.timeoutMs = Number.parseInt(next, 10)
    if (arg === '--max-tournaments') config.maxTournaments = Number.parseInt(next, 10)
    if (arg === '--max-age-groups') config.maxAgeGroups = Number.parseInt(next, 10)
    if (arg === '--output-dir') config.outputDir = next
    if (arg === '--max-failure-rate') config.maxFailureRate = Number.parseFloat(next)
    if (arg === '--max-p95') config.maxP95Ms = Number.parseInt(next, 10)
  }

  config.frontendUrl = normalizeBaseUrl(config.frontendUrl)
  config.apiUrl = normalizeBaseUrl(config.apiUrl)

  if (!Number.isFinite(config.users) || config.users < 1) throw new Error('--users must be >= 1')
  if (!Number.isFinite(config.durationSec) || config.durationSec < 1) throw new Error('--duration must be >= 1')
  if (!Number.isFinite(config.rampUpSec) || config.rampUpSec < 0) throw new Error('--ramp-up must be >= 0')
  if (!Number.isFinite(config.thinkMinMs) || config.thinkMinMs < 0) throw new Error('--think-min must be >= 0')
  if (!Number.isFinite(config.thinkMaxMs) || config.thinkMaxMs < config.thinkMinMs) throw new Error('--think-max must be >= think-min')
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 100) throw new Error('--timeout must be >= 100')

  return config
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '')
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)]
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index]
}

function average(values) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function createMetrics() {
  return {
    startedAt: new Date().toISOString(),
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalBytes: 0,
    allDurations: [],
    statusCounts: {},
    sessionsStarted: 0,
    sessionsCompleted: 0,
    sessionErrors: 0,
    routeMap: new Map(),
    errors: [],
    // per-tick accumulators (reset every TICK_INTERVAL_MS)
    _tick: { requests: 0, errors: 0, durations: [] },
  }
}

const TICK_INTERVAL_MS = 10_000

function startMetricsTicker(metrics, config, deadlineMs, collectedTicks = []) {
  let tickIndex = 0
  const id = setInterval(() => {
    const now = Date.now()
    tickIndex += 1
    const elapsed = tickIndex * (TICK_INTERVAL_MS / 1000)
    const total = config.durationSec + config.rampUpSec
    const { requests, errors, durations } = metrics._tick
    metrics._tick = { requests: 0, errors: 0, durations: [] }

    const reqSec = Number((requests / (TICK_INTERVAL_MS / 1000)).toFixed(2))
    const errRate = requests === 0 ? 0 : Number(((errors / requests) * 100).toFixed(2))
    const p95 = Number(percentile(durations, 95).toFixed(1))
    const p50 = Number(percentile(durations, 50).toFixed(1))
    const activeSessions = metrics.sessionsStarted - metrics.sessionsCompleted - metrics.sessionErrors

    const tick = { t: elapsed, total, reqSec, errRate, p95, p50, activeSessions, errors }
    collectedTicks.push(tick)
    process.stdout.write(`METRIC_TICK:${JSON.stringify(tick)}\n`)

    if (now >= deadlineMs) clearInterval(id)
  }, TICK_INTERVAL_MS)
  return id
}

function recordRequest(metrics, routeKey, durationMs, status, ok, bytes, errorMessage = null) {
  metrics.totalRequests += 1
  metrics.totalBytes += bytes
  metrics.allDurations.push(durationMs)
  metrics.statusCounts[status] = (metrics.statusCounts[status] ?? 0) + 1
  // tick accumulator
  metrics._tick.requests += 1
  metrics._tick.durations.push(durationMs)

  if (ok) {
    metrics.successfulRequests += 1
  } else {
    metrics.failedRequests += 1
    metrics._tick.errors += 1
    if (errorMessage && metrics.errors.length < 20) {
      metrics.errors.push({ routeKey, status, error: errorMessage })
    }
  }

  const route = metrics.routeMap.get(routeKey) ?? {
    label: ROUTES[routeKey] ?? routeKey,
    count: 0,
    ok: 0,
    fail: 0,
    bytes: 0,
    durations: [],
    statuses: {},
  }

  route.count += 1
  route.bytes += bytes
  route.durations.push(durationMs)
  route.statuses[status] = (route.statuses[status] ?? 0) + 1
  if (ok) route.ok += 1
  else route.fail += 1
  metrics.routeMap.set(routeKey, route)
}

async function fetchWithTimeout(url, timeoutMs, parseAs = 'json') {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        Accept: parseAs === 'json' ? 'application/json' : 'text/html,application/xhtml+xml',
        'User-Agent': 'rugby-public-load-tester/1.0',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    })

    const text = await response.text()
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return parseAs === 'json' ? JSON.parse(text) : text
  } finally {
    clearTimeout(timeout)
  }
}

async function timedFetch({ baseUrl, path, timeoutMs, parseAs, metrics, routeKey }) {
  const started = performance.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const url = `${baseUrl}${path}`
  try {
    const response = await fetch(url, {
      headers: {
        Accept: parseAs === 'json' ? 'application/json' : 'text/html,application/xhtml+xml',
        'User-Agent': 'rugby-public-load-tester/1.0',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    })

    const text = await response.text()
    const durationMs = performance.now() - started
    const ok = response.ok
    const status = String(response.status)
    recordRequest(metrics, routeKey, durationMs, status, ok, Buffer.byteLength(text))
    if (!ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return parseAs === 'json' ? JSON.parse(text) : text
  } catch (error) {
    const durationMs = performance.now() - started
    const status = error?.name === 'AbortError' ? 'timeout' : 'error'
    recordRequest(metrics, routeKey, durationMs, status, false, 0, error instanceof Error ? error.message : String(error))
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function discoverProfiles(config) {
  const tournaments = await fetchWithTimeout(`${config.apiUrl}/api/v1/tournaments`, config.timeoutMs, 'json')
  const selectedTournaments = tournaments.slice(0, config.maxTournaments)

  const profiles = []
  for (const tournament of selectedTournaments) {
    let ageGroups = []
    try {
      ageGroups = await fetchWithTimeout(
        `${config.apiUrl}/api/v1/tournaments/${encodeURIComponent(tournament.slug)}/age-groups`,
        config.timeoutMs,
        'json',
      )
    } catch {
      continue
    }

    const selectedAgeGroups = []
    for (const ageGroup of ageGroups.slice(0, config.maxAgeGroups)) {
      let matches = []
      try {
        matches = await fetchWithTimeout(
          `${config.apiUrl}/api/v1/age-groups/${encodeURIComponent(ageGroup.id)}/matches`,
          config.timeoutMs,
          'json',
        )
      } catch {
        matches = []
      }

      selectedAgeGroups.push({
        id: ageGroup.id,
        label: ageGroup.display_name || ageGroup.age_group || ageGroup.id,
        matchIds: matches.map((match) => match.id).filter(Boolean).slice(0, 8),
      })
    }

    if (selectedAgeGroups.length > 0) {
      profiles.push({
        tournamentSlug: tournament.slug,
        tournamentName: tournament.name,
        organizationSlug: tournament.organization_slug,
        ageGroups: selectedAgeGroups,
      })
    }
  }

  if (profiles.length === 0) {
    throw new Error('No public tournaments with age groups were discovered')
  }

  return profiles
}

async function maybeThink(config) {
  if (config.thinkMaxMs <= 0) return
  await sleep(randomInt(config.thinkMinMs, config.thinkMaxMs))
}

async function simulateJourney(profile, config, metrics) {
  const ageGroup = pickRandom(profile.ageGroups)
  const matchId = ageGroup.matchIds.length > 0 ? pickRandom(ageGroup.matchIds) : null

  await timedFetch({ baseUrl: config.frontendUrl, path: '/', timeoutMs: config.timeoutMs, parseAs: 'text', metrics, routeKey: 'pageHome' })
  await maybeThink(config)
  await timedFetch({ baseUrl: config.apiUrl, path: '/api/v1/tournaments', timeoutMs: config.timeoutMs, parseAs: 'json', metrics, routeKey: 'apiTournaments' })
  await maybeThink(config)

  if (profile.organizationSlug) {
    await timedFetch({ baseUrl: config.frontendUrl, path: `/${profile.organizationSlug}`, timeoutMs: config.timeoutMs, parseAs: 'text', metrics, routeKey: 'pageOrganization' })
    await maybeThink(config)
    await timedFetch({ baseUrl: config.apiUrl, path: `/api/v1/organizations/${encodeURIComponent(profile.organizationSlug)}`, timeoutMs: config.timeoutMs, parseAs: 'json', metrics, routeKey: 'apiOrganization' })
    await maybeThink(config)
  }

  await timedFetch({ baseUrl: config.frontendUrl, path: `/tornei/${profile.tournamentSlug}`, timeoutMs: config.timeoutMs, parseAs: 'text', metrics, routeKey: 'pageTournament' })
  await maybeThink(config)
  await timedFetch({ baseUrl: config.apiUrl, path: `/api/v1/tournaments/${encodeURIComponent(profile.tournamentSlug)}`, timeoutMs: config.timeoutMs, parseAs: 'json', metrics, routeKey: 'apiTournament' })
  await maybeThink(config)
  await timedFetch({ baseUrl: config.apiUrl, path: `/api/v1/tournaments/${encodeURIComponent(profile.tournamentSlug)}/age-groups`, timeoutMs: config.timeoutMs, parseAs: 'json', metrics, routeKey: 'apiTournamentAgeGroups' })
  await maybeThink(config)
  await timedFetch({ baseUrl: config.apiUrl, path: `/api/v1/tournaments/${encodeURIComponent(profile.tournamentSlug)}/program`, timeoutMs: config.timeoutMs, parseAs: 'json', metrics, routeKey: 'apiTournamentProgram' })
  await maybeThink(config)
  await timedFetch({ baseUrl: config.apiUrl, path: `/api/v1/tournaments/${encodeURIComponent(profile.tournamentSlug)}/fields`, timeoutMs: config.timeoutMs, parseAs: 'json', metrics, routeKey: 'apiTournamentFields' })
  await maybeThink(config)

  await timedFetch({ baseUrl: config.frontendUrl, path: `/tornei/${profile.tournamentSlug}/${ageGroup.id}`, timeoutMs: config.timeoutMs, parseAs: 'text', metrics, routeKey: 'pageAgeGroup' })
  await maybeThink(config)
  await timedFetch({ baseUrl: config.apiUrl, path: `/api/v1/age-groups/${encodeURIComponent(ageGroup.id)}/program`, timeoutMs: config.timeoutMs, parseAs: 'json', metrics, routeKey: 'apiAgeGroupProgram' })
  await maybeThink(config)
  await timedFetch({ baseUrl: config.apiUrl, path: `/api/v1/age-groups/${encodeURIComponent(ageGroup.id)}/standings`, timeoutMs: config.timeoutMs, parseAs: 'json', metrics, routeKey: 'apiAgeGroupStandings' })
  await maybeThink(config)
  await timedFetch({ baseUrl: config.apiUrl, path: `/api/v1/age-groups/${encodeURIComponent(ageGroup.id)}/matches`, timeoutMs: config.timeoutMs, parseAs: 'json', metrics, routeKey: 'apiAgeGroupMatches' })

  if (matchId) {
    await maybeThink(config)
    await timedFetch({ baseUrl: config.frontendUrl, path: `/partite/${matchId}`, timeoutMs: config.timeoutMs, parseAs: 'text', metrics, routeKey: 'pageMatch' })
    await maybeThink(config)
    await timedFetch({ baseUrl: config.apiUrl, path: `/api/v1/matches/${encodeURIComponent(matchId)}`, timeoutMs: config.timeoutMs, parseAs: 'json', metrics, routeKey: 'apiMatch' })
  }
}

async function runUser(userIndex, deadlineMs, profiles, config, metrics) {
  const rampDelayMs = Math.floor((config.rampUpSec * 1000 * userIndex) / config.users)
  if (rampDelayMs > 0) await sleep(rampDelayMs)

  metrics.sessionsStarted += 1
  while (Date.now() < deadlineMs) {
    const profile = pickRandom(profiles)
    try {
      await simulateJourney(profile, config, metrics)
      metrics.sessionsCompleted += 1
    } catch {
      metrics.sessionErrors += 1
      await sleep(250)
    }
  }
}

function buildSummary(metrics, config, profiles, wallClockMs, timeSeries) {
  const routes = [...metrics.routeMap.entries()].map(([routeKey, route]) => ({
    routeKey,
    label: route.label,
    count: route.count,
    ok: route.ok,
    fail: route.fail,
    avgMs: Number(average(route.durations).toFixed(1)),
    p50Ms: Number(percentile(route.durations, 50).toFixed(1)),
    p95Ms: Number(percentile(route.durations, 95).toFixed(1)),
    p99Ms: Number(percentile(route.durations, 99).toFixed(1)),
    maxMs: Number(Math.max(...route.durations, 0).toFixed(1)),
    bytes: route.bytes,
    statuses: route.statuses,
  })).sort((left, right) => right.count - left.count)

  const failureRate = metrics.totalRequests === 0 ? 1 : metrics.failedRequests / metrics.totalRequests
  const overallP95 = percentile(metrics.allDurations, 95)
  const verdict = failureRate <= config.maxFailureRate && overallP95 <= config.maxP95Ms ? 'PASS' : 'WARN'

  return {
    generatedAt: new Date().toISOString(),
    config,
    discovery: profiles,
    summary: {
      verdict,
      totalRequests: metrics.totalRequests,
      successfulRequests: metrics.successfulRequests,
      failedRequests: metrics.failedRequests,
      failureRate: Number((failureRate * 100).toFixed(2)),
      requestsPerSecond: Number((metrics.totalRequests / (wallClockMs / 1000)).toFixed(2)),
      sessionsStarted: metrics.sessionsStarted,
      sessionsCompleted: metrics.sessionsCompleted,
      sessionErrors: metrics.sessionErrors,
      avgMs: Number(average(metrics.allDurations).toFixed(1)),
      p50Ms: Number(percentile(metrics.allDurations, 50).toFixed(1)),
      p95Ms: Number(overallP95.toFixed(1)),
      p99Ms: Number(percentile(metrics.allDurations, 99).toFixed(1)),
      maxMs: Number(Math.max(...metrics.allDurations, 0).toFixed(1)),
      totalBytes: metrics.totalBytes,
      thresholds: {
        maxFailureRatePct: Number((config.maxFailureRate * 100).toFixed(2)),
        maxP95Ms: config.maxP95Ms,
      },
      statusCounts: metrics.statusCounts,
    },
    routes,
    sampleErrors: metrics.errors,
    timeSeries: timeSeries || [],
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function renderHtmlReport(report) {
  const summary = report.summary
  const routesHtml = report.routes.map((route) => `
    <tr>
      <td>${escapeHtml(route.label)}</td>
      <td>${route.count}</td>
      <td>${route.fail}</td>
      <td>${route.avgMs}</td>
      <td>${route.p95Ms}</td>
      <td>${route.p99Ms}</td>
      <td>${route.maxMs}</td>
    </tr>
  `).join('')

  const errorsHtml = report.sampleErrors.length === 0
    ? '<p class="muted">No sample errors captured.</p>'
    : `<table><thead><tr><th>Route</th><th>Status</th><th>Error</th></tr></thead><tbody>${report.sampleErrors.map((item) => `
      <tr><td>${escapeHtml(item.routeKey)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.error)}</td></tr>
    `).join('')}</tbody></table>`

  const discoveryHtml = report.discovery.map((profile) => `
    <li><strong>${escapeHtml(profile.tournamentName)}</strong> (${escapeHtml(profile.tournamentSlug)}) - ${profile.ageGroups.length} categorie</li>
  `).join('')

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Public Load Test Report</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f7f1;
      --panel: #ffffff;
      --ink: #122018;
      --muted: #5c6b60;
      --accent: #166534;
      --warn: #b45309;
      --border: #d9e3d7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top, #ebfff2 0%, #f4f7f1 35%, #eef3ee 100%);
      padding: 24px;
    }
    .wrap {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      gap: 20px;
    }
    .hero, .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 24px;
      box-shadow: 0 24px 70px -48px rgba(15, 23, 42, 0.35);
    }
    .hero {
      padding: 24px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .card {
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 14px;
      background: linear-gradient(180deg, #ffffff 0%, #f7fbf7 100%);
    }
    .label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .value {
      font-size: 28px;
      font-weight: 800;
    }
    .panel {
      padding: 20px;
    }
    .muted {
      color: var(--muted);
    }
    .verdict {
      display: inline-flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: 999px;
      font-weight: 800;
      background: ${summary.verdict === 'PASS' ? '#dcfce7' : '#ffedd5'};
      color: ${summary.verdict === 'PASS' ? 'var(--accent)' : 'var(--warn)'};
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    ul {
      margin: 10px 0 0;
      padding-left: 18px;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <div class="verdict">${summary.verdict}</div>
      <h1>Public Load Test Report</h1>
      <p class="muted">Generato il ${escapeHtml(report.generatedAt)}. Questo report simula navigazione pubblica reale tra homepage, torneo, categoria e partita.</p>
      <div class="grid">
        <div class="card"><div class="label">Utenti concorrenti</div><div class="value">${summary.sessionsStarted}</div></div>
        <div class="card"><div class="label">Request totali</div><div class="value">${summary.totalRequests}</div></div>
        <div class="card"><div class="label">Req/sec</div><div class="value">${summary.requestsPerSecond}</div></div>
        <div class="card"><div class="label">Error rate</div><div class="value">${summary.failureRate}%</div></div>
        <div class="card"><div class="label">P95</div><div class="value">${summary.p95Ms} ms</div></div>
        <div class="card"><div class="label">P99</div><div class="value">${summary.p99Ms} ms</div></div>
      </div>
    </section>

    <section class="panel">
      <h2>Scenario</h2>
      <p class="muted">Soglie euristiche: error rate <= ${summary.thresholds.maxFailureRatePct}% e p95 <= ${summary.thresholds.maxP95Ms} ms.</p>
      <ul>${discoveryHtml}</ul>
    </section>

    <section class="panel">
      <h2>Route Breakdown</h2>
      <table>
        <thead>
          <tr>
            <th>Route</th>
            <th>Request</th>
            <th>Errori</th>
            <th>Avg ms</th>
            <th>P95 ms</th>
            <th>P99 ms</th>
            <th>Max ms</th>
          </tr>
        </thead>
        <tbody>${routesHtml}</tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Error Samples</h2>
      ${errorsHtml}
    </section>
  </main>
</body>
</html>`
}

async function main() {
  const config = parseArgs(process.argv.slice(2))
  const metrics = createMetrics()

  console.log(`Discovering public journeys from ${config.apiUrl} ...`)
  const profiles = await discoverProfiles(config)
  console.log(`Discovered ${profiles.length} tournaments and ${profiles.reduce((sum, profile) => sum + profile.ageGroups.length, 0)} age groups`)

  const started = performance.now()
  const deadlineMs = Date.now() + (config.durationSec * 1000)
  const collectedTicks = []
  const tickerId = startMetricsTicker(metrics, config, deadlineMs, collectedTicks)
  await Promise.all(Array.from({ length: config.users }, (_, index) => runUser(index, deadlineMs, profiles, config, metrics)))
  clearInterval(tickerId)
  const wallClockMs = performance.now() - started

  const report = buildSummary(metrics, config, profiles, wallClockMs, collectedTicks)
  const runId = new Date().toISOString().replaceAll(':', '-')
  const outputDir = resolve(config.outputDir, runId)
  await mkdir(outputDir, { recursive: true })
  await writeFile(join(outputDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(join(outputDir, 'report.html'), renderHtmlReport(report), 'utf8')

  console.log('')
  console.log(`Verdict: ${report.summary.verdict}`)
  console.log(`Requests: ${report.summary.totalRequests}`)
  console.log(`Req/sec: ${report.summary.requestsPerSecond}`)
  console.log(`Failure rate: ${report.summary.failureRate}%`)
  console.log(`P95: ${report.summary.p95Ms} ms`)
  console.log(`P99: ${report.summary.p99Ms} ms`)
  console.log(`Sessions completed: ${report.summary.sessionsCompleted}`)
  console.log(`JSON report: ${join(outputDir, 'summary.json')}`)
  console.log(`HTML report: ${join(outputDir, 'report.html')}`)
}

main().catch((error) => {
  console.error(`Load test failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
