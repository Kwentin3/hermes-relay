#!/usr/bin/env node

// Preserve the native single-executable/installer/update contract while using
// Node's x64 runtime instead of Bun's Nehalem (SSE4.2) baseline on Windows.
import { createHash } from 'node:crypto'
import { isBuiltin } from 'node:module'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'
import { inject } from 'postject'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = (await readFile(join(root, '.node-version'), 'utf8')).trim()
const expectedSha = 'dccc52de28d8df2ee22d2062424f8c563070d95d8ad70c54c4bf01d590dec14f'
if (version !== '22.23.4') throw new Error('Review the official Windows Node SHA256 when updating .node-version')
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Build the Windows Node SEA on Windows x64 with the pinned runtime')
}
const work = join(root, 'dist', 'sea')
const output = join(root, 'dist', 'bin')
await mkdir(work, { recursive: true })
await mkdir(output, { recursive: true })
const source = `https://nodejs.org/dist/v${version}/win-x64/node.exe`
const runtime = join(work, 'node.exe')
const sha256 = data => createHash('sha256').update(data).digest('hex')
let runtimeBytes
try { runtimeBytes = await readFile(runtime) } catch { /* first build */ }
if (!runtimeBytes || sha256(runtimeBytes) !== expectedSha) {
  const response = await fetch(source)
  if (!response.ok) throw new Error(`Node download failed: HTTP ${response.status}`)
  runtimeBytes = Buffer.from(await response.arrayBuffer())
  if (sha256(runtimeBytes) !== expectedSha) throw new Error('Official Node executable SHA256 mismatch')
  await writeFile(runtime, runtimeBytes)
}

const bundle = join(work, 'relay.cjs')
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/nodeWindowsEntry.ts'],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  metafile: true,
  // The CLI is explicitly invoked by the Windows entry. Doctor's source URL
  // becomes the executable URL; no source tree is present on the user's PC.
  define: { 'import.meta.main': 'false', 'import.meta.url': '__hermesSeaUrl' },
  banner: { js: "const __hermesSeaUrl = require('node:url').pathToFileURL(process.execPath).href;" }
})
for (const item of Object.values(result.metafile.outputs)) {
  for (const imported of item.imports) {
    if (imported.external && !isBuiltin(imported.path)) {
      throw new Error(`Windows executable has an unbundled dependency: ${imported.path}`)
    }
  }
}
const blob = join(work, 'relay.blob')
const config = join(work, 'sea.json')
await writeFile(config, JSON.stringify({
  main: bundle, output: blob, disableExperimentalSEAWarning: true,
  useSnapshot: false, useCodeCache: false,
  execArgv: ['--use-system-ca'], execArgvExtension: 'none'
}))
const prepared = spawnSync(runtime, ['--experimental-sea-config', config], { stdio: 'inherit' })
if (prepared.error || prepared.status !== 0) throw prepared.error ?? new Error('Node SEA preparation failed')
const exe = join(output, 'hermes-relay-win-x64.exe')
await copyFile(runtime, exe)
await inject(exe, 'NODE_SEA_BLOB', await readFile(blob), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
})
await writeFile(join(output, 'windows-runtime.json'), JSON.stringify({
  runtime: 'node-sea', node_version: version, node_sha256: expectedSha, source,
  use_snapshot: false, use_code_cache: false,
  cli_sha256: sha256(await readFile(exe)), platform: 'win32', arch: 'x64'
}, null, 2) + '\n')
console.log(`Windows Node SEA ready: ${exe}`)
