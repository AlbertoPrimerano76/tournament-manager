#!/usr/bin/env node

import http from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, readdir, stat, rm, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
const projectRoot = resolve(__dirname, '..')
const reportsRoot = resolve(projectRoot, 'load-test-reports')
const scenariosPath = resolve(reportsRoot, 'scenarios.json')
const loadTestScript = resolve(projectRoot, 'scripts/public-load-test.mjs')
const bpTestScript   = resolve(projectRoot, 'scripts/breaking-point-test.mjs')
const htmlPath = resolve(projectRoot, 'scripts/load-test-ui.html')

const defaultConfig = {
  frontendUrl: 'https://minrugby-gestione-tornei.vercel.app',
  apiUrl: 'https://rugby-tournament-api.onrender.com',
  users: 100,
  durationSec: 60,
  rampUpSec: 15,
  thinkMinMs: 150,
  thinkMaxMs: 900,
  timeoutMs: 10000,
  maxTournaments: 3,
  maxAgeGroups: 2,
  maxFailureRate: 0.02,
  maxP95Ms: 1500,
  tournamentDay: false,
  spikeUsers: 50,
  spikeEveryMs: 30000,
  bypassCache: true,
}

const state = {
  runId: null,
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  config: null,
  outputDir: null,
  childPid: null,
  exitCode: null,
  stdoutTail: [],
  stderrTail: [],
  error: null,
  timeSeries: [],
  reportPayload: null,
}

const bpState = {
  status: 'idle',   // idle | running | completed | failed
  startedAt: null,
  finishedAt: null,
  config: null,
  childPid: null,
  exitCode: null,
  stdoutTail: [],
  stderrTail: [],
  error: null,
  currentStep: null,   // {step, users, phase}
  steps: [],           // completed STEP_RESULT items
  breakingPoint: null, // final BREAKING_POINT payload
  timeSeries: [],
}

function showHelp() {
  console.log(`Load test UI

Usage:
  node scripts/load-test-ui.mjs [--port 8787] [--host 127.0.0.1]

This starts a local web UI on your PC. The UI launches the load test
against remote frontend/backend URLs such as Vercel + Render.
`)
}

function parseArgs(argv) {
  const config = { host: '127.0.0.1', port: 8787 }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--help') {
      showHelp()
      process.exit(0)
    }
    if (arg === '--host') config.host = next
    if (arg === '--port') config.port = Number.parseInt(next, 10)
  }
  if (!Number.isFinite(config.port) || config.port < 1) {
    throw new Error('--port must be a valid port number')
  }
  return config
}

function pushTail(target, text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)

  for (const line of lines) {
    target.push(line)
  }

  if (target.length > 120) {
    target.splice(0, target.length - 120)
  }
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(`${JSON.stringify(payload)}\n`)
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

function sanitizeConfig(body) {
  const merged = {
    ...defaultConfig,
    ...body,
  }

  const cleaned = {
    frontendUrl: String(merged.frontendUrl || '').replace(/\/+$/, ''),
    apiUrl: String(merged.apiUrl || '').replace(/\/+$/, ''),
    users: Number.parseInt(String(merged.users), 10),
    durationSec: Number.parseInt(String(merged.durationSec), 10),
    rampUpSec: Number.parseInt(String(merged.rampUpSec), 10),
    thinkMinMs: Number.parseInt(String(merged.thinkMinMs), 10),
    thinkMaxMs: Number.parseInt(String(merged.thinkMaxMs), 10),
    timeoutMs: Number.parseInt(String(merged.timeoutMs), 10),
    maxTournaments: Number.parseInt(String(merged.maxTournaments), 10),
    maxAgeGroups: Number.parseInt(String(merged.maxAgeGroups), 10),
    maxFailureRate: Number.parseFloat(String(merged.maxFailureRate)),
    maxP95Ms: Number.parseInt(String(merged.maxP95Ms), 10),
    tournamentDay: String(merged.tournamentDay) === 'true' || merged.tournamentDay === true,
    spikeUsers: Number.parseInt(String(merged.spikeUsers ?? 50), 10),
    spikeEveryMs: Number.parseInt(String(merged.spikeEveryMs ?? 30000), 10),
    bypassCache: String(merged.bypassCache) !== 'false' && merged.bypassCache !== false,
  }

  if (!cleaned.frontendUrl.startsWith('http')) throw new Error('frontendUrl must start with http or https')
  if (!cleaned.apiUrl.startsWith('http')) throw new Error('apiUrl must start with http or https')
  if (!Number.isFinite(cleaned.users) || cleaned.users < 1) throw new Error('users must be >= 1')
  if (!Number.isFinite(cleaned.durationSec) || cleaned.durationSec < 1) throw new Error('durationSec must be >= 1')
  if (!Number.isFinite(cleaned.rampUpSec) || cleaned.rampUpSec < 0) throw new Error('rampUpSec must be >= 0')
  if (!Number.isFinite(cleaned.thinkMinMs) || cleaned.thinkMinMs < 0) throw new Error('thinkMinMs must be >= 0')
  if (!Number.isFinite(cleaned.thinkMaxMs) || cleaned.thinkMaxMs < cleaned.thinkMinMs) throw new Error('thinkMaxMs must be >= thinkMinMs')
  if (!Number.isFinite(cleaned.timeoutMs) || cleaned.timeoutMs < 100) throw new Error('timeoutMs must be >= 100')
  if (!Number.isFinite(cleaned.maxTournaments) || cleaned.maxTournaments < 1) throw new Error('maxTournaments must be >= 1')
  if (!Number.isFinite(cleaned.maxAgeGroups) || cleaned.maxAgeGroups < 1) throw new Error('maxAgeGroups must be >= 1')
  if (!Number.isFinite(cleaned.maxFailureRate) || cleaned.maxFailureRate < 0) throw new Error('maxFailureRate must be >= 0')
  if (!Number.isFinite(cleaned.maxP95Ms) || cleaned.maxP95Ms < 1) throw new Error('maxP95Ms must be >= 1')

  return cleaned
}

function buildRunId() {
  return new Date().toISOString().replaceAll(':', '-')
}

async function listReports() {
  if (!existsSync(reportsRoot)) return []

  const entries = await readdir(reportsRoot, { withFileTypes: true })
  const reports = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const reportPath = join(reportsRoot, entry.name, 'summary.json')
    if (!existsSync(reportPath)) continue
    try {
      const payload = JSON.parse(await readFile(reportPath, 'utf8'))
      const info = await stat(reportPath)
      const ts = payload.timeSeries || []
      const generatedAt = payload.generatedAt ?? info.mtime.toISOString()
      const d = new Date(generatedAt)
      const dateStr = d.toISOString().slice(0, 10)                          // "2026-04-13"
      const timeStr = d.toTimeString().slice(0, 5)                          // "14:30"
      reports.push({
        runId: entry.name,
        generatedAt,
        date: dateStr,
        time: timeStr,
        verdict: payload.summary?.verdict ?? 'UNKNOWN',
        users: payload.config?.users ?? null,
        durationSec: payload.config?.durationSec ?? null,
        rampUpSec: payload.config?.rampUpSec ?? null,
        tournamentDay: payload.config?.tournamentDay ?? false,
        bypassCache: payload.config?.bypassCache ?? true,
        requestsPerSecond: payload.summary?.requestsPerSecond ?? null,
        failureRate: payload.summary?.failureRate ?? null,
        p95Ms: payload.summary?.p95Ms ?? null,
        sessionsCompleted: payload.summary?.sessionsCompleted ?? null,
        p95Series: ts.length >= 2 ? ts.map(t => t.p95) : null,
      })
    } catch {
      // Ignore malformed reports
    }
  }

  return reports.sort((left, right) => right.runId.localeCompare(left.runId))
}

async function readScenarios() {
  if (!existsSync(scenariosPath)) return []
  try { return JSON.parse(await readFile(scenariosPath, 'utf8')) } catch { return [] }
}

async function writeScenarios(scenarios) {
  await mkdir(reportsRoot, { recursive: true })
  await writeFile(scenariosPath, JSON.stringify(scenarios, null, 2), 'utf8')
}

async function readReport(runId) {
  const reportPath = join(reportsRoot, runId, 'summary.json')
  if (!existsSync(reportPath)) return null
  return JSON.parse(await readFile(reportPath, 'utf8'))
}

function getStatusPayload() {
  return {
    ...state,
    hasRunningProcess: state.status === 'running',
    defaultConfig,
  }
}

function startRun(config) {
  if (state.status === 'running') {
    throw new Error('A load test is already running')
  }

  const runId = buildRunId()
  const outputDir = join(reportsRoot, runId)
  const args = [
    loadTestScript,
    '--frontend-url', config.frontendUrl,
    '--api-url', config.apiUrl,
    '--users', String(config.users),
    '--duration', String(config.durationSec),
    '--ramp-up', String(config.rampUpSec),
    '--think-min', String(config.thinkMinMs),
    '--think-max', String(config.thinkMaxMs),
    '--timeout', String(config.timeoutMs),
    '--max-tournaments', String(config.maxTournaments),
    '--max-age-groups', String(config.maxAgeGroups),
    '--output-dir', reportsRoot,
    '--run-id', runId,
    '--max-failure-rate', String(config.maxFailureRate),
    '--max-p95', String(config.maxP95Ms),
    ...(config.tournamentDay ? ['--tournament-day', '--spike-users', String(config.spikeUsers), '--spike-every', String(config.spikeEveryMs)] : []),
    ...(config.bypassCache ? [] : ['--no-bypass-cache']),
  ]

  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  state.runId = runId
  state.status = 'running'
  state.startedAt = new Date().toISOString()
  state.finishedAt = null
  state.config = config
  state.outputDir = outputDir
  state.childPid = child.pid ?? null
  state.exitCode = null
  state.stdoutTail = []
  state.stderrTail = []
  state.error = null
  state.timeSeries = []
  state.reportPayload = null

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8')
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('METRIC_TICK:')) {
        try {
          const tick = JSON.parse(line.slice('METRIC_TICK:'.length))
          state.timeSeries.push(tick)
        } catch { /* ignore malformed tick */ }
      } else if (line.startsWith('REPORT_JSON:')) {
        try {
          state.reportPayload = JSON.parse(line.slice('REPORT_JSON:'.length))
        } catch { /* ignore malformed report */ }
      }
    }
    pushTail(state.stdoutTail, text)
  })
  child.stderr.on('data', (chunk) => pushTail(state.stderrTail, chunk.toString('utf8')))
  child.on('error', (error) => {
    state.status = 'failed'
    state.finishedAt = new Date().toISOString()
    state.error = error.message
  })
  child.on('close', (code) => {
    state.exitCode = code
    state.finishedAt = new Date().toISOString()
    if (code === 0) {
      state.status = 'completed'
      if (state.reportPayload?.runId && state.reportPayload?.report) {
        const reportDir = join(reportsRoot, state.reportPayload.runId)
        mkdir(reportDir, { recursive: true })
          .then(() => writeFile(join(reportDir, 'summary.json'), `${JSON.stringify(state.reportPayload.report, null, 2)}\n`, 'utf8'))
          .catch((error) => {
            state.error = `Report save failed: ${error.message}`
          })
      }
    } else {
      state.status = 'failed'
      if (!state.error) {
        // Try to extract the actual error from stderr/stdout tails
        const allLines = [...state.stderrTail, ...state.stdoutTail]
        const errorLine = allLines.reverse().find((l) => l.includes('Load test failed:') || l.includes('Error:') || l.includes('error:'))
        state.error = errorLine ? errorLine.replace(/^.*?(Load test failed:|Error:|error:)\s*/, '$1 ').trim() : `Load test exited with code ${code}`
      }
    }
  })
}

function sanitizeBpConfig(body) {
  const defaults = {
    frontendUrl: defaultConfig.frontendUrl,
    apiUrl: defaultConfig.apiUrl,
    startUsers: 50, maxUsers: 1200,
    stepDurationSec: 45, stepRampSec: 10, cooldownSec: 8,
    thinkMinMs: 150, thinkMaxMs: 900, timeoutMs: 10000,
    maxTournaments: 3, maxAgeGroups: 2,
    maxFailureRate: 0.05, maxP95Ms: 2000,
  }
  const m = { ...defaults, ...body }
  return {
    frontendUrl: String(m.frontendUrl).replace(/\/+$/, ''),
    apiUrl:      String(m.apiUrl).replace(/\/+$/, ''),
    startUsers:     Number.parseInt(String(m.startUsers), 10),
    maxUsers:       Number.parseInt(String(m.maxUsers), 10),
    stepDurationSec:Number.parseInt(String(m.stepDurationSec), 10),
    stepRampSec:    Number.parseInt(String(m.stepRampSec), 10),
    cooldownSec:    Number.parseInt(String(m.cooldownSec), 10),
    thinkMinMs:     Number.parseInt(String(m.thinkMinMs), 10),
    thinkMaxMs:     Number.parseInt(String(m.thinkMaxMs), 10),
    timeoutMs:      Number.parseInt(String(m.timeoutMs), 10),
    maxTournaments: Number.parseInt(String(m.maxTournaments), 10),
    maxAgeGroups:   Number.parseInt(String(m.maxAgeGroups), 10),
    maxFailureRate: Number.parseFloat(String(m.maxFailureRate)),
    maxP95Ms:       Number.parseInt(String(m.maxP95Ms), 10),
  }
}

function startBpRun(config) {
  if (bpState.status === 'running') throw new Error('A breaking point test is already running')
  if (state.status === 'running') throw new Error('A load test is already running — stop it first')

  const args = [
    bpTestScript,
    '--frontend-url', config.frontendUrl, '--api-url', config.apiUrl,
    '--start-users',  String(config.startUsers),
    '--max-users',    String(config.maxUsers),
    '--step-duration',String(config.stepDurationSec),
    '--step-ramp',    String(config.stepRampSec),
    '--cooldown',     String(config.cooldownSec),
    '--think-min',    String(config.thinkMinMs),
    '--think-max',    String(config.thinkMaxMs),
    '--timeout',      String(config.timeoutMs),
    '--max-tournaments', String(config.maxTournaments),
    '--max-age-groups',  String(config.maxAgeGroups),
    '--output-dir',   reportsRoot,
    '--max-failure-rate', String(config.maxFailureRate),
    '--max-p95',      String(config.maxP95Ms),
  ]

  const child = spawn(process.execPath, args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] })

  Object.assign(bpState, {
    status: 'running', startedAt: new Date().toISOString(), finishedAt: null,
    config, childPid: child.pid ?? null, exitCode: null,
    stdoutTail: [], stderrTail: [], error: null,
    currentStep: null, steps: [], breakingPoint: null, timeSeries: [],
  })

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8')
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('STEP_RESULT:'))    { try { bpState.steps.push(JSON.parse(line.slice(12))) } catch {} }
      else if (line.startsWith('STEP_START:'))     { try { bpState.currentStep = JSON.parse(line.slice(11)) } catch {} }
      else if (line.startsWith('BREAKING_POINT:')) { try { bpState.breakingPoint = JSON.parse(line.slice(15)) } catch {} }
      else if (line.startsWith('METRIC_TICK:'))    { try { bpState.timeSeries.push(JSON.parse(line.slice(12))) } catch {} }
    }
    pushTail(bpState.stdoutTail, text)
  })
  child.stderr.on('data', (chunk) => pushTail(bpState.stderrTail, chunk.toString('utf8')))
  child.on('error', (err) => { bpState.status = 'failed'; bpState.finishedAt = new Date().toISOString(); bpState.error = err.message })
  child.on('close', (code) => {
    bpState.exitCode = code; bpState.finishedAt = new Date().toISOString()
    bpState.status = code === 0 ? 'completed' : 'failed'
    if (code !== 0 && !bpState.error) {
      const lines = [...bpState.stderrTail, ...bpState.stdoutTail]
      const el = lines.reverse().find(l => l.includes('failed:') || l.includes('Error:'))
      bpState.error = el || `BP test exited with code ${code}`
    }
  })
}

async function requestHandler(req, res) {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost')

  if (req.method === 'GET' && requestUrl.pathname === '/') {
    const html = await readFile(htmlPath, 'utf8')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/status') {
    json(res, 200, getStatusPayload())
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/reports') {
    json(res, 200, { items: await listReports() })
    return
  }

  if (req.method === 'GET' && requestUrl.pathname.startsWith('/api/reports/')) {
    const runId = decodeURIComponent(requestUrl.pathname.replace('/api/reports/', ''))
    const report = await readReport(runId)
    if (!report) {
      json(res, 404, { detail: 'Report not found' })
      return
    }
    json(res, 200, report)
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/bp/status') {
    json(res, 200, bpState)
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/bp/start') {
    try {
      const body = await readBody(req)
      const config = sanitizeBpConfig(body)
      startBpRun(config)
      json(res, 202, { status: 'started' })
    } catch (error) {
      json(res, 400, { detail: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  if (req.method === 'DELETE' && requestUrl.pathname === '/api/reports') {
    if (!existsSync(reportsRoot)) { json(res, 200, { deleted: 0 }); return }
    const entries = await readdir(reportsRoot, { withFileTypes: true })
    let deleted = 0
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      await rm(join(reportsRoot, entry.name), { recursive: true, force: true })
      deleted += 1
    }
    json(res, 200, { deleted })
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/scenarios') {
    json(res, 200, { items: await readScenarios() })
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/scenarios') {
    try {
      const body = await readBody(req)
      const name = String(body.name || '').trim()
      if (!name) throw new Error('name is required')
      const config = sanitizeConfig(body.config || {})
      const scenarios = await readScenarios()
      const idx = scenarios.findIndex(s => s.name === name)
      const entry = { name, config, savedAt: new Date().toISOString() }
      if (idx >= 0) scenarios[idx] = entry
      else scenarios.push(entry)
      await writeScenarios(scenarios)
      json(res, 200, { ok: true })
    } catch (error) {
      json(res, 400, { detail: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  if (req.method === 'DELETE' && requestUrl.pathname.startsWith('/api/scenarios/')) {
    const name = decodeURIComponent(requestUrl.pathname.replace('/api/scenarios/', ''))
    const scenarios = await readScenarios()
    await writeScenarios(scenarios.filter(s => s.name !== name))
    json(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/start') {
    try {
      const body = await readBody(req)
      const config = sanitizeConfig(body)
      startRun(config)
      json(res, 202, { status: 'started', runId: state.runId })
    } catch (error) {
      json(res, 400, { detail: error instanceof Error ? error.message : String(error) })
    }
    return
  }

  json(res, 404, { detail: 'Not found' })
}

async function main() {
  const config = parseArgs(process.argv.slice(2))
  const server = http.createServer((req, res) => {
    requestHandler(req, res).catch((error) => {
      json(res, 500, { detail: error instanceof Error ? error.message : String(error) })
    })
  })

  server.listen(config.port, config.host, () => {
    console.log(`Load test UI running at http://${config.host}:${config.port}`)
    console.log('This tool runs locally on your PC and targets the remote frontend/backend URLs you configure in the browser.')
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
