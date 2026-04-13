#!/usr/bin/env node

import http from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
const projectRoot = resolve(__dirname, '..')
const reportsRoot = resolve(projectRoot, 'load-test-reports')
const loadTestScript = resolve(projectRoot, 'scripts/public-load-test.mjs')
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
      reports.push({
        runId: entry.name,
        generatedAt: payload.generatedAt ?? info.mtime.toISOString(),
        verdict: payload.summary?.verdict ?? 'UNKNOWN',
        users: payload.config?.users ?? null,
        durationSec: payload.config?.durationSec ?? null,
        requestsPerSecond: payload.summary?.requestsPerSecond ?? null,
        failureRate: payload.summary?.failureRate ?? null,
        p95Ms: payload.summary?.p95Ms ?? null,
        p95Series: ts.length >= 2 ? ts.map(t => t.p95) : null,
      })
    } catch {
      // Ignore malformed reports
    }
  }

  return reports.sort((left, right) => right.runId.localeCompare(left.runId))
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
    '--max-failure-rate', String(config.maxFailureRate),
    '--max-p95', String(config.maxP95Ms),
    ...(config.tournamentDay ? ['--tournament-day', '--spike-users', String(config.spikeUsers), '--spike-every', String(config.spikeEveryMs)] : []),
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

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8')
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('METRIC_TICK:')) {
        try {
          const tick = JSON.parse(line.slice('METRIC_TICK:'.length))
          state.timeSeries.push(tick)
        } catch { /* ignore malformed tick */ }
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
    } else {
      state.status = 'failed'
      if (!state.error) {
        state.error = `Load test exited with code ${code}`
      }
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
