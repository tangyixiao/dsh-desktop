import { createServer } from 'node:net'
import { access } from 'node:fs/promises'
import { spawn, type ChildProcess } from 'node:child_process'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export interface DshServerOptions {
  profile: string
  preferredPort: number
  host: string
  runtimeRoot?: string
  nodeExecutable?: string
  dshHome?: string
}

export interface DshServer {
  port: number
  localUrl: string
  lanUrls: readonly string[]
  stop(): Promise<void>
}

export async function chooseListenPort(host: string, preferredPort: number): Promise<number> {
  const probe = (port: number) => new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(port, host, () => {
      const address = server.address()
      const selected = typeof address === 'object' && address ? address.port : port
      server.close(() => resolve(selected))
    })
  })
  try { return await probe(preferredPort) } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'EACCES' && code !== 'EADDRINUSE') throw error
    return probe(0)
  }
}

function nodeFor(options: DshServerOptions): string {
  if (options.nodeExecutable) return options.nodeExecutable
  if (process.env.DSH_NODE_EXECUTABLE) return process.env.DSH_NODE_EXECUTABLE
  return process.execPath
}

function runtimeArgv(node: string, cli: string, args: string[]): string[] {
  return process.versions.electron && node === process.execPath ? ['--run-as-node', cli, ...args] : [cli, ...args]
}

async function waitForHttp(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000
  let lastError: unknown
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`dsh exited before readiness (code ${child.exitCode})`)
    try {
      const response = await fetch(url)
      if (response.ok || response.status === 404) return
    } catch (error) { lastError = error }
    await delay(150)
  }
  throw new Error(`dsh readiness timeout: ${String(lastError ?? url)}`)
}

export async function startDshServer(options: DshServerOptions): Promise<DshServer> {
  const runtimeRoot = resolve(options.runtimeRoot ?? join(process.resourcesPath, 'dsh-runtime'))
  const candidates = [join(runtimeRoot, 'lib', 'bin.js'), join(runtimeRoot, 'apps', 'cli', 'lib', 'bin.js')]
  const cli = await (async () => {
    for (const candidate of candidates) {
      try { await access(candidate); return candidate } catch { /* try next layout */ }
    }
    throw new Error(`dsh CLI not found under ${runtimeRoot}`)
  })()
  const port = await chooseListenPort(options.host, options.preferredPort)
  const child = spawn(nodeFor(options), runtimeArgv(nodeFor(options), cli, [options.profile, '--host', options.host, '--port', String(port), '--no-open']), {
    cwd: runtimeRoot,
    env: {
      ...process.env,
      DSH_DESKTOP: '1',
      DSH_HOME: options.dshHome ?? process.env.DSH_HOME,
      BIND_HOST: options.host,
      HOST: options.host,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout?.on('data', chunk => process.stdout.write(`[dsh] ${chunk}`))
  child.stderr?.on('data', chunk => process.stderr.write(`[dsh] ${chunk}`))
  const localUrl = `http://127.0.0.1:${port}`
  try {
    await waitForHttp(localUrl, child)
  } catch (error) {
    await stopProcess(child)
    throw error
  }
  const lanUrls = options.host === '0.0.0.0' ? [`http://localhost:${port}`] : [localUrl]
  return { port, localUrl, lanUrls, stop: () => stopProcess(child) }
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const deadline = Date.now() + 5_000
  while (child.exitCode === null && Date.now() < deadline) await delay(100)
  if (child.exitCode === null && process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
  } else if (child.exitCode === null) child.kill('SIGKILL')
}
