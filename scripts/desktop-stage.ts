import { cp, mkdir, readdir, realpath, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'

const root = process.cwd()
const stage = join(root, 'apps', 'desktop', 'dsh-runtime')
await rm(stage, { recursive: true, force: true })
const run = promisify(execFile)
// dsh-app-boot intentionally keeps Cordis as peer dependencies; include the
// workspace dev graph so those runtime peers are present in the closed bundle.
await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['deploy', '--legacy', '--filter', '@deepseek-ai/dsh', '--prod=false', stage], { cwd: root, shell: process.platform === 'win32', maxBuffer: 10 * 1024 * 1024 })
// Workspace peers are not traversed by pnpm deploy. Copy the built @deepseek
// packages as real directories so the standalone runtime can resolve them
// without retaining pnpm's workspace symlink graph.
const sourceScope = join(root, 'node_modules', '@deepseek-ai')
const targetScope = join(stage, 'node_modules', '@deepseek-ai')
await mkdir(targetScope, { recursive: true })
for (const name of await readdir(sourceScope)) {
  const source = join(sourceScope, name)
  const target = join(targetScope, name)
  try {
    // Deploy may already provide this package (sometimes as a link to the
    // same workspace directory). Never recurse-copy an existing target.
    await realpath(target)
    continue
  } catch {
    // A package may be absent from deploy's peer graph; copy it below.
  }
  await cp(source, target, { recursive: true, dereference: true, force: true })
}
await cp(join(root, 'apps', 'web', 'dist'), join(stage, 'apps', 'web', 'dist'), { recursive: true })
console.log(`staged dsh runtime at ${stage}`)
