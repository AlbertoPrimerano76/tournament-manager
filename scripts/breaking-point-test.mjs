#!/usr/bin/env node
/**
 * Breaking Point Finder
 *
 * Phase 1 — Exponential search: start at startUsers, multiply ×1.5 until first FAIL
 * Phase 2 — Binary search ×3:   narrow the range to ±~50 users
 *
 * Protocol (stdout):
 *   STEP_START:{json}    — step about to begin
 *   METRIC_TICK:{json}   — live metrics every 5s during each step
 *   STEP_RESULT:{json}   — step finished
 *   BREAKING_POINT:{json}— final result
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { performance } from 'node:perf_hooks'

// ─── Args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const cfg = {
    frontendUrl: 'http://localhost:5180',
    apiUrl:      'http://localhost:8002',
    startUsers:     50,
    maxUsers:     1200,
    stepDurationSec: 45,
    stepRampSec:     10,
    cooldownSec:      8,
    thinkMinMs:     150,
    thinkMaxMs:     900,
    timeoutMs:   10_000,
    maxTournaments:   3,
    maxAgeGroups:     2,
    outputDir: 'load-test-reports',
    maxFailureRate: 0.05,
    maxP95Ms:       2000,
    bypassCache:    true,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]; const n = argv[i + 1]
    if (a === '--frontend-url')    cfg.frontendUrl    = n
    if (a === '--api-url')         cfg.apiUrl         = n
    if (a === '--start-users')     cfg.startUsers     = +n
    if (a === '--max-users')       cfg.maxUsers       = +n
    if (a === '--step-duration')   cfg.stepDurationSec = +n
    if (a === '--step-ramp')       cfg.stepRampSec    = +n
    if (a === '--cooldown')        cfg.cooldownSec    = +n
    if (a === '--think-min')       cfg.thinkMinMs     = +n
    if (a === '--think-max')       cfg.thinkMaxMs     = +n
    if (a === '--timeout')         cfg.timeoutMs      = +n
    if (a === '--max-tournaments') cfg.maxTournaments = +n
    if (a === '--max-age-groups')  cfg.maxAgeGroups   = +n
    if (a === '--output-dir')      cfg.outputDir      = n
    if (a === '--max-failure-rate') cfg.maxFailureRate = parseFloat(n)
    if (a === '--max-p95')         cfg.maxP95Ms       = +n
    if (a === '--no-bypass-cache') cfg.bypassCache    = false
  }
  cfg.frontendUrl = cfg.frontendUrl.replace(/\/+$/, '')
  cfg.apiUrl      = cfg.apiUrl.replace(/\/+$/, '')
  return cfg
}

// Set in main() after parseArgs
let BYPASS_CACHE = true

// ─── Utils ────────────────────────────────────────────────────────────────────

const sleep      = ms => new Promise(r => setTimeout(r, ms))
const randomInt  = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a
const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)]
const snap50     = n => Math.round(n / 50) * 50 || 50

function percentile(vals, p) {
  if (!vals.length) return 0
  const s = [...vals].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function fetchTimeout(url, ms, as = 'json') {
  const ac = new AbortController()
  const tid = setTimeout(() => ac.abort(), ms)
  try {
    const res = await fetch(url, {
      headers: { Accept: as === 'json' ? 'application/json' : 'text/html', 'User-Agent': 'rugby-bp/1.0', ...(BYPASS_CACHE ? { 'Cache-Control': 'no-cache' } : {}) },
      signal: ac.signal,
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return as === 'json' ? JSON.parse(text) : text
  } finally { clearTimeout(tid) }
}

async function fetchRetry(url, ms, as = 'json', tries = 3) {
  let last
  for (let i = 1; i <= tries; i++) {
    try { return await fetchTimeout(url, ms, as) }
    catch (e) { last = e; if (i < tries) { console.log(`  retry ${i} → ${url} (${e.message})`); await sleep(i * 2000) } }
  }
  throw last
}

async function timedFetch({ base, path, ms, as, metrics, key }) {
  const t0 = performance.now()
  const ac = new AbortController(); const tid = setTimeout(() => ac.abort(), ms)
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Accept: as === 'json' ? 'application/json' : 'text/html', 'User-Agent': 'rugby-bp/1.0', ...(BYPASS_CACHE ? { 'Cache-Control': 'no-cache' } : {}) },
      signal: ac.signal,
    })
    const text = await res.text()
    const dur = performance.now() - t0
    record(metrics, dur, res.ok)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return as === 'json' ? JSON.parse(text) : text
  } catch (e) {
    record(metrics, performance.now() - t0, false)
    throw e
  } finally { clearTimeout(tid) }
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

const mkMetrics = () => ({ total: 0, ok: 0, fail: 0, durs: [], tick: { n: 0, f: 0, d: [] } })

function record(m, dur, ok) {
  m.total++; m.durs.push(dur); m.tick.d.push(dur)
  if (ok) m.ok++; else { m.fail++; m.tick.f++ }
  m.tick.n++
}

// ─── Discovery ────────────────────────────────────────────────────────────────

async function discover(cfg) {
  const tms = Math.max(cfg.timeoutMs, 30_000)
  console.log(`  Connecting to ${cfg.apiUrl} ...`)
  const list = await fetchRetry(`${cfg.apiUrl}/api/v1/tournaments`, tms)
  if (!Array.isArray(list) || !list.length) throw new Error('No published tournaments')

  const profiles = []
  for (const t of list.slice(0, cfg.maxTournaments)) {
    let ags = []
    try { ags = await fetchRetry(`${cfg.apiUrl}/api/v1/tournaments/${encodeURIComponent(t.slug)}/age-groups`, tms) }
    catch { continue }
    const selected = []
    for (const ag of ags.slice(0, cfg.maxAgeGroups)) {
      let matches = []
      try { matches = await fetchRetry(`${cfg.apiUrl}/api/v1/age-groups/${encodeURIComponent(ag.id)}/matches`, tms) }
      catch { matches = [] }
      selected.push({ id: ag.id, label: ag.display_name || ag.id, matchIds: matches.map(m => m.id).filter(Boolean).slice(0, 8) })
    }
    if (selected.length) profiles.push({ slug: t.slug, name: t.name, orgSlug: t.organization_slug, ags: selected })
  }
  if (!profiles.length) throw new Error('No tournaments with age groups')
  return profiles
}

// ─── Journey ──────────────────────────────────────────────────────────────────

async function think(cfg) {
  if (cfg.thinkMaxMs > 0) await sleep(randomInt(cfg.thinkMinMs, cfg.thinkMaxMs))
}

async function journey(profile, cfg, metrics) {
  const ag = pickRandom(profile.ags)
  const mid = ag.matchIds.length ? pickRandom(ag.matchIds) : null
  const o = { ms: cfg.timeoutMs, metrics }
  await timedFetch({ base: cfg.frontendUrl, path: '/', as: 'text', key: 'home', ...o });         await think(cfg)
  await timedFetch({ base: cfg.apiUrl,      path: '/api/v1/tournaments', as: 'json', key: 'tlist', ...o }); await think(cfg)
  if (profile.orgSlug) {
    await timedFetch({ base: cfg.apiUrl, path: `/api/v1/organizations/${encodeURIComponent(profile.orgSlug)}`, as: 'json', key: 'org', ...o }); await think(cfg)
  }
  await timedFetch({ base: cfg.apiUrl, path: `/api/v1/tournaments/${encodeURIComponent(profile.slug)}`, as: 'json', key: 'tdetail', ...o }); await think(cfg)
  await timedFetch({ base: cfg.apiUrl, path: `/api/v1/tournaments/${encodeURIComponent(profile.slug)}/age-groups`, as: 'json', key: 'tags', ...o }); await think(cfg)
  await timedFetch({ base: cfg.apiUrl, path: `/api/v1/tournaments/${encodeURIComponent(profile.slug)}/program`, as: 'json', key: 'tprog', ...o }); await think(cfg)
  await timedFetch({ base: cfg.apiUrl, path: `/api/v1/age-groups/${encodeURIComponent(ag.id)}/standings`, as: 'json', key: 'stand', ...o }); await think(cfg)
  await timedFetch({ base: cfg.apiUrl, path: `/api/v1/age-groups/${encodeURIComponent(ag.id)}/program`, as: 'json', key: 'agprog', ...o })
  if (mid) {
    await think(cfg)
    await timedFetch({ base: cfg.apiUrl, path: `/api/v1/matches/${encodeURIComponent(mid)}`, as: 'json', key: 'match', ...o })
  }
}

async function runUser(idx, deadline, profiles, cfg, metrics) {
  const delay = cfg.rampUpSec > 0 ? Math.floor((cfg.rampUpSec * 1000 * idx) / cfg.users) : 0
  if (delay > 0) await sleep(delay)
  while (Date.now() < deadline) {
    try { await journey(pickRandom(profiles), cfg, metrics) }
    catch { await sleep(250) }
  }
}

// ─── Run one step ─────────────────────────────────────────────────────────────

const TICK_MS = 5_000

async function runStep(stepIdx, users, profiles, cfg) {
  const stepCfg = { ...cfg, users, rampUpSec: cfg.stepRampSec }
  const metrics  = mkMetrics()
  const deadline = Date.now() + cfg.stepDurationSec * 1000
  const ticks    = []
  let tickN = 0

  const tid = setInterval(() => {
    tickN++
    const { n, f, d } = metrics.tick; metrics.tick = { n: 0, f: 0, d: [] }
    const reqSec  = +(n / (TICK_MS / 1000)).toFixed(2)
    const errRate = n ? +((f / n) * 100).toFixed(2) : 0
    const p95     = +percentile(d, 95).toFixed(1)
    const tick    = { t: tickN * (TICK_MS / 1000), reqSec, errRate, p95, step: stepIdx, users }
    ticks.push(tick)
    process.stdout.write(`METRIC_TICK:${JSON.stringify(tick)}\n`)
    if (Date.now() >= deadline) clearInterval(tid)
  }, TICK_MS)

  await Promise.all(Array.from({ length: users }, (_, i) => runUser(i, deadline, profiles, stepCfg, metrics)))
  clearInterval(tid)

  const errRate    = metrics.total ? metrics.fail / metrics.total : 1
  const p95        = +percentile(metrics.durs, 95).toFixed(1)
  const p99        = +percentile(metrics.durs, 99).toFixed(1)
  const reqSec     = +(metrics.total / cfg.stepDurationSec).toFixed(2)
  const passed     = errRate <= cfg.maxFailureRate && p95 <= cfg.maxP95Ms

  const result = { step: stepIdx, users, p95, p99,
    errorRate: +((errRate * 100).toFixed(2)), reqSec,
    totalRequests: metrics.total, passed, verdict: passed ? 'PASS' : 'FAIL', ticks }

  process.stdout.write(`STEP_RESULT:${JSON.stringify(result)}\n`)
  console.log(`  → ${result.verdict}  p95=${p95}ms  err=${result.errorRate}%  r/s=${reqSec}`)
  return result
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const cfg = parseArgs(process.argv.slice(2))
  BYPASS_CACHE = cfg.bypassCache

  console.log('═'.repeat(60))
  console.log('Breaking Point Finder')
  console.log(`API:    ${cfg.apiUrl}`)
  console.log(`Range:  ${cfg.startUsers} → ${cfg.maxUsers} utenti`)
  console.log(`Step:   ${cfg.stepDurationSec}s + ramp ${cfg.stepRampSec}s + cooldown ${cfg.cooldownSec}s`)
  console.log(`Soglie: err≤${(cfg.maxFailureRate * 100).toFixed(0)}%  p95≤${cfg.maxP95Ms}ms`)
  console.log('═'.repeat(60))

  const profiles = await discover(cfg)
  console.log(`Trovati ${profiles.length} torneo/i`)

  const steps = []
  let stepIdx  = 0
  let lastPass = null
  let firstFail = null

  // ── Phase 1: exponential search ──────────────────────────────────────────
  let users = snap50(cfg.startUsers)
  while (users <= cfg.maxUsers) {
    stepIdx++
    process.stdout.write(`STEP_START:${JSON.stringify({ step: stepIdx, users, phase: 'search', totalStepsEst: 10 })}\n`)
    console.log(`\nStep ${stepIdx} [search]  ${users} utenti`)

    const res = await runStep(stepIdx, users, profiles, cfg)
    steps.push(res)

    if (res.passed) {
      lastPass = res
      const next = Math.min(cfg.maxUsers, snap50(users * 1.5))
      if (next === users) break   // cap hit
      users = next
    } else {
      firstFail = res
      break
    }
    console.log(`  Cooldown ${cfg.cooldownSec}s...`)
    await sleep(cfg.cooldownSec * 1000)
  }

  // ── Never failed ──────────────────────────────────────────────────────────
  if (!firstFail) {
    const bp = { found: false, breakingPoint: null, lastPass, firstFail: null, steps,
      message: `Sistema regge fino a ${cfg.maxUsers} utenti (limite del test)` }
    process.stdout.write(`BREAKING_POINT:${JSON.stringify(bp)}\n`)
    await save(cfg, steps, bp); return
  }

  // ── Failed on first step ───────────────────────────────────────────────────
  if (!lastPass) {
    const bp = { found: true, breakingPoint: cfg.startUsers, confidence: 'low', lastPass: null, firstFail, steps,
      message: `Sistema instabile già a ${cfg.startUsers} utenti` }
    process.stdout.write(`BREAKING_POINT:${JSON.stringify(bp)}\n`)
    await save(cfg, steps, bp); return
  }

  // ── Phase 2: binary search ×3 ─────────────────────────────────────────────
  let lo = lastPass.users, hi = firstFail.users
  for (let r = 1; r <= 3; r++) {
    const mid = snap50((lo + hi) / 2)
    if (mid === lo || mid === hi) break
    stepIdx++
    process.stdout.write(`STEP_START:${JSON.stringify({ step: stepIdx, users: mid, phase: 'refine', refineRound: r })}\n`)
    console.log(`\nStep ${stepIdx} [refine ${r}/3]  ${mid} utenti  (range ${lo}–${hi})`)

    console.log(`  Cooldown ${cfg.cooldownSec}s...`)
    await sleep(cfg.cooldownSec * 1000)
    const res = await runStep(stepIdx, mid, profiles, cfg)
    steps.push(res)

    if (res.passed) { lo = mid; lastPass = res }
    else            { hi = mid; firstFail = res }
  }

  const bp_est = snap50((lo + hi) / 2)
  const confidence = (hi - lo) <= 100 ? 'high' : (hi - lo) <= 250 ? 'medium' : 'low'
  const bp = {
    found: true, breakingPoint: bp_est, confidence,
    lastPass, firstFail, steps,
    message: `Breaking point stimato: ~${bp_est} utenti  (${lo} ✓ → ${hi} ✗)`,
  }

  process.stdout.write(`BREAKING_POINT:${JSON.stringify(bp)}\n`)
  await save(cfg, steps, bp)

  console.log('\n' + '═'.repeat(60))
  console.log(`BREAKING POINT: ~${bp_est} utenti  [${confidence} confidence]`)
  console.log(`Ultimo PASS:  ${lo} utenti  (p95=${lastPass.p95}ms  err=${lastPass.errorRate}%)`)
  console.log(`Primo FAIL:   ${hi} utenti  (p95=${firstFail.p95}ms  err=${firstFail.errorRate}%)`)
  console.log('═'.repeat(60))
}

async function save(cfg, steps, bp) {
  const runId = `bp-${new Date().toISOString().replaceAll(':', '-')}`
  const dir   = resolve(cfg.outputDir, runId)
  await mkdir(dir, { recursive: true })
  const report = { generatedAt: new Date().toISOString(), type: 'breaking-point', config: cfg, steps, breakingPoint: bp }
  await writeFile(join(dir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`Report: ${join(dir, 'summary.json')}`)
}

main().catch(e => { console.error(`Breaking point failed: ${e instanceof Error ? e.message : e}`); process.exitCode = 1 })
