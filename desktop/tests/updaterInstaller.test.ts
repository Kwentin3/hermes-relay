import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { installerRunsSilently, updateCommand } from '../src/commands/update.js'
import {
  assetNameForPlatform,
  checkForUpdate,
  compareVersions,
  downloadAndInstall,
  finalizePendingUpdateAt
} from '../src/updater.js'
import { VERSION } from '../src/version.js'

test('native tray update checks use the distribution repository unless explicitly overridden', async () => {
  const originalFetch = globalThis.fetch
  const requested: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    requested.push(url)
    return new Response(JSON.stringify([{
      tag_name: url.includes('/Kwentin3/') ? 'desktop-v9.0.0-kwentin.1' : 'desktop-v99.0.0',
      prerelease: url.includes('/Kwentin3/'), published_at: '2026-10-18T00:00:00Z', assets: []
    }]), { status: 200 })
  }
  try {
    for (const repo of [undefined, 'Codename-11/hermes-relay']) {
      const result = await captureStdout(() => updateCommand({
        command: 'update', positional: [],
        flags: { installer: true, check: true, json: true, ...(repo ? { repo } : {}) }
      }, { platform: 'win32', bundle: { installed: true, path: 'C:\\Hermes\\hermes-relay-tray.exe', version: VERSION, running: true } }))
      assert.equal(result.code, 0)
      assert.equal(JSON.parse(result.output).installer_scheduled, false)
      assert.equal(JSON.parse(result.output).latest_tag, repo ? 'desktop-v99.0.0' : 'desktop-v9.0.0-kwentin.1')
    }
    assert.deepEqual(requested, [
      'https://api.github.com/repos/Kwentin3/hermes-relay/releases?per_page=100&page=1',
      'https://api.github.com/repos/Codename-11/hermes-relay/releases?per_page=100&page=1'
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('distribution prerelease sorts after its base and before the next upstream beta', () => {
  assert.equal(compareVersions('0.4.0-beta.10.kwentin.1', '0.4.0-beta.10'), 1)
  assert.equal(compareVersions('0.4.0-beta.10.kwentin.1', '0.4.0-beta.11'), -1)
  assert.equal(compareVersions('0.4.0-beta.10.kwentin.2', '0.4.0-beta.10.kwentin.1'), 1)
})

test('native tray install does not fall back or schedule an installer after discovery failures', async () => {
  const originalFetch = globalThis.fetch
  try {
    for (const failure of ['empty', 'http', 'network', 'malformed']) {
      const requested: string[] = []
      globalThis.fetch = async (input) => {
        requested.push(String(input))
        if (failure === 'network') throw new Error('network unavailable')
        return new Response(failure === 'malformed' ? '{}' : '[]', { status: failure === 'http' ? 403 : 200 })
      }
      const result = await captureStdout(() => updateCommand({
        command: 'update', positional: [],
        flags: { installer: true, 'download-only': true, yes: true, json: true }
      }, { platform: 'win32', bundle: { installed: true, path: 'C:\\Hermes\\hermes-relay-tray.exe', version: VERSION, running: true } }))
      assert.equal(result.code, failure === 'empty' ? 0 : 1, failure)
      const report = JSON.parse(result.output)
      assert.equal(report.installer_scheduled, false, failure)
      assert.equal(report.downloaded, false, failure)
      assert.equal(report.installed_path, null, failure)
      assert.deepEqual(requested, ['https://api.github.com/repos/Kwentin3/hermes-relay/releases?per_page=100&page=1'])
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('missing installer or checksum and mismatched bytes preserve the current artifact', async () => {
  const originalFetch = globalThis.fetch
  const scratch = await mkdtemp(join(tmpdir(), 'hermes-channel-update-'))
  const target = join(scratch, 'setup.exe')
  const assetName = 'hermes-relay-windows-x64-setup.exe'
  const bytes = Buffer.from('candidate installer')
  const checksum = createHash('sha256').update(bytes).digest('hex')
  try {
    for (const failure of ['asset', 'checksum-file', 'checksum-entry', 'checksum-mismatch']) {
      await writeFile(target, 'retained artifact')
      const requested: string[] = []
      globalThis.fetch = async (input) => {
        const url = String(input)
        requested.push(url)
        if (url.includes('/releases?')) return new Response(JSON.stringify([{
          tag_name: 'desktop-v9.0.0-kwentin.1', prerelease: true,
          published_at: '2026-10-18T00:00:00Z', assets: []
        }]), { status: 200 })
        if (url.endsWith('/SHA256SUMS.txt')) return new Response(
          failure === 'checksum-entry' ? `${checksum}  another.exe\n` : `${'0'.repeat(64)}  ${assetName}\n`,
          { status: failure === 'checksum-file' ? 404 : 200 }
        )
        return new Response(bytes, { status: failure === 'asset' ? 404 : 200 })
      }
      const info = await checkForUpdate({ assetName })
      assert.ok(info)
      assert.equal(info.is_prerelease, true)
      assert.equal(info.asset_url, `https://github.com/Kwentin3/hermes-relay/releases/download/desktop-v9.0.0-kwentin.1/${assetName}`)
      await assert.rejects(downloadAndInstall(info, { targetPath: target, cooperative: false }),
        failure === 'asset' ? /download .*404/ : failure === 'checksum-file' ? /fetch .*404/ :
          failure === 'checksum-entry' ? /has no entry/ : /checksum mismatch/)
      assert.equal(await readFile(target, 'utf8'), 'retained artifact', failure)
      await assert.rejects(stat(join(scratch, '.hermes-relay.download')), { code: 'ENOENT' })
      assert.ok(requested.every(url => url.includes('/Kwentin3/hermes-relay/')), failure)
    }
  } finally {
    globalThis.fetch = originalFetch
    await rm(scratch, { recursive: true, force: true })
  }
})

async function captureStdout(run: () => Promise<number>): Promise<{ code: number; output: string }> {
  const originalWrite = process.stdout.write
  let output = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    return true
  }) as typeof process.stdout.write
  try {
    return { code: await run(), output }
  } finally {
    process.stdout.write = originalWrite
  }
}

test('desktop installer selection downloads the requested asset to an exact verified path', async () => {
  const originalFetch = globalThis.fetch
  const scratch = await mkdtemp(join(tmpdir(), 'hermes-installer-update-'))
  const target = join(scratch, 'hermes-relay-setup.exe')
  const assetName = 'hermes-relay-windows-x64-setup.exe'
  const bytes = Buffer.from('verified desktop installer fixture')
  const checksum = createHash('sha256').update(bytes).digest('hex')

  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('/releases?')) {
      return new Response(JSON.stringify([{
        tag_name: 'desktop-v9.0.0',
        prerelease: false,
        published_at: '2026-08-11T00:00:00Z',
        assets: [{ name: assetName, browser_download_url: 'https://download.test/setup.exe', size: bytes.length }]
      }]), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.endsWith('/SHA256SUMS.txt')) {
      return new Response(`${checksum}  ${assetName}\n`, { status: 200 })
    }
    if (url === 'https://download.test/setup.exe') {
      return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } })
    }
    return new Response('not found', { status: 404 })
  }

  try {
    const info = await checkForUpdate({ repo: 'example/hermes-relay', assetName })
    assert.ok(info)
    assert.equal(info.asset_name, assetName)
    assert.equal(info.asset_url, 'https://download.test/setup.exe')

    const result = await downloadAndInstall(info, { targetPath: target, cooperative: false })
    assert.deepEqual(result, { installedPath: target, needsRestart: false })
    assert.deepEqual(await readFile(target), bytes)
  } finally {
    globalThis.fetch = originalFetch
    await rm(scratch, { recursive: true, force: true })
  }
})

test('release discovery paginates past mixed-surface releases', async () => {
  const originalFetch = globalThis.fetch
  const requested: string[] = []
  const nonDesktopRelease = (index: number) => ({
    tag_name: index % 2 === 0 ? `android-v1.${index}.0` : `server-v1.${index}.0`,
    prerelease: false,
    published_at: '2026-08-11T00:00:00Z',
    assets: []
  })
  globalThis.fetch = async (input) => {
    const url = String(input)
    requested.push(url)
    if (url.endsWith('page=1')) {
      return new Response(JSON.stringify(Array.from({ length: 100 }, (_, index) => nonDesktopRelease(index))), { status: 200 })
    }
    if (url.endsWith('page=2')) {
      return new Response(JSON.stringify([{
        tag_name: 'desktop-v9.1.0',
        prerelease: false,
        published_at: '2026-08-12T00:00:00Z',
        assets: []
      }]), { status: 200 })
    }
    return new Response('not found', { status: 404 })
  }

  try {
    const info = await checkForUpdate({ repo: 'example/hermes-relay', assetName: 'hermes-relay-linux-arm64' })
    assert.ok(info)
    assert.equal(info.latest_tag, 'desktop-v9.1.0')
    assert.equal(info.asset_name, 'hermes-relay-linux-arm64')
    assert.deepEqual(requested, [
      'https://api.github.com/repos/example/hermes-relay/releases?per_page=100&page=1',
      'https://api.github.com/repos/example/hermes-relay/releases?per_page=100&page=2'
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Linux arm64 maps to the published Bun asset', () => {
  assert.equal(assetNameForPlatform('linux', 'arm64'), 'hermes-relay-linux-arm64')
})

test('cooperative updater removes a released Windows backup without another staged update', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'hermes-updater-old-cleanup-'))
  const target = join(scratch, 'hermes-relay.exe')
  const oldPath = join(scratch, 'hermes-relay.old.exe')
  try {
    await writeFile(target, 'current')
    await writeFile(oldPath, 'previous')
    await finalizePendingUpdateAt(target)
    await assert.rejects(stat(oldPath), { code: 'ENOENT' })
    assert.equal(await readFile(target, 'utf8'), 'current')
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})

test('installer check reports a newer local preview without treating it as an error', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify([{
    tag_name: 'desktop-v0.4.0-alpha.2',
    prerelease: true,
    published_at: '2026-07-14T01:13:36Z',
    assets: [{
      name: 'hermes-relay-windows-x64-setup.exe',
      browser_download_url: 'https://download.test/setup.exe',
      size: 27_335_311
    }]
  }]), { status: 200, headers: { 'content-type': 'application/json' } })

  try {
    const check = await captureStdout(() => updateCommand({
      command: 'update',
      positional: [],
      flags: { installer: true, check: true, json: true, repo: 'example/hermes-relay' }
    }, {
      platform: 'win32',
      bundle: {
        installed: false,
        path: 'C:\\Hermes\\hermes-relay-tray.exe',
        version: null,
        running: false
      }
    }))
    assert.equal(check.code, 0)
    const report = JSON.parse(check.output)
    assert.equal(report.current, VERSION)
    assert.equal(report.latest_version, '0.4.0-alpha.2')
    assert.equal(report.up_to_date, true)
    assert.equal(report.ahead_of_latest, true)
    assert.equal(report.error, null)

    const install = await captureStdout(() => updateCommand({
      command: 'update',
      positional: [],
      flags: { installer: true, yes: true, json: true, repo: 'example/hermes-relay' }
    }, {
      platform: 'win32',
      bundle: {
        installed: false,
        path: 'C:\\Hermes\\hermes-relay-tray.exe',
        version: null,
        running: false
      }
    }))
    assert.equal(install.code, 2)
    assert.match(JSON.parse(install.output).error, /older than the installed CLI/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('default Windows update targets the installer when an older UI is installed', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify([{
    tag_name: `desktop-v${VERSION}`,
    prerelease: VERSION.includes('-'),
    published_at: '2026-09-01T00:00:00Z',
    assets: [
      {
        name: 'hermes-relay-win-x64.exe',
        browser_download_url: 'https://download.test/hermes-relay.exe',
        size: 10
      },
      {
        name: 'hermes-relay-windows-x64-setup.exe',
        browser_download_url: 'https://download.test/setup.exe',
        size: 20
      }
    ]
  }]), { status: 200, headers: { 'content-type': 'application/json' } })

  try {
    const check = await captureStdout(() => updateCommand({
      command: 'update',
      positional: [],
      flags: { check: true, json: true, repo: 'example/hermes-relay' }
    }, {
      platform: 'win32',
      bundle: {
        installed: true,
        path: 'C:\\Hermes\\hermes-relay-tray.exe',
        version: '0.4.0-beta.4',
        running: true
      }
    }))
    assert.equal(check.code, 0)
    const report = JSON.parse(check.output)
    assert.equal(report.target, 'cli_ui')
    assert.equal(report.asset_name, 'hermes-relay-windows-x64-setup.exe')
    assert.equal(report.ui_installed, true)
    assert.equal(report.ui_version, '0.4.0-beta.4')
    assert.equal(report.versions_in_sync, false)
    assert.equal(report.up_to_date, false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('default Windows update preserves a headless CLI-only installation', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify([{
    tag_name: `desktop-v${VERSION}`,
    prerelease: VERSION.includes('-'),
    published_at: '2026-09-01T00:00:00Z',
    assets: [{
      name: 'hermes-relay-win-x64.exe',
      browser_download_url: 'https://download.test/hermes-relay.exe',
      size: 10
    }]
  }]), { status: 200, headers: { 'content-type': 'application/json' } })

  try {
    const check = await captureStdout(() => updateCommand({
      command: 'update',
      positional: [],
      flags: { check: true, json: true, repo: 'example/hermes-relay' }
    }, {
      platform: 'win32',
      bundle: {
        installed: false,
        path: 'C:\\Hermes\\hermes-relay-tray.exe',
        version: null,
        running: false
      }
    }))
    assert.equal(check.code, 0)
    const report = JSON.parse(check.output)
    assert.equal(report.target, 'cli')
    assert.equal(report.asset_name, 'hermes-relay-win-x64.exe')
    assert.equal(report.ui_installed, false)
    assert.equal(report.versions_in_sync, true)
    assert.equal(report.up_to_date, true)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('existing bundle updates suppress the installer finish-page restart choice', () => {
  assert.equal(installerRunsSilently(true, false, false), true)
  assert.equal(installerRunsSilently(false, false, false), false)
  assert.equal(installerRunsSilently(false, true, false), true)
})
