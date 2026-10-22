import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, X509Certificate } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Duplex } from 'node:stream'
import test, { type TestContext } from 'node:test'

import { nodeWebSocketDispatcher } from '../src/transport/nodeWebSocketDispatcher.js'

// Public, test-only key and CA-signed leaf fixtures; valid from 2020 to 2120.
const KEY = "-----BEGIN PRIVATE KEY-----\nMIIEuwIBADANBgkqhkiG9w0BAQEFAASCBKUwggShAgEAAoIBAQCvC51Y1EyZ80H1\n98GDo/nwlgUvqwN5vQJ94b8JQQ6EZAcdNlhRoOu2rF+BtPlFzS3Vm3ca6QxJRJVL\n8klfb0vE0+ZGTbmlU5wvQkV89BvKOROfUO1cXstH5nfc7rCwWyxwQkVoaV5utoi5\nhCNbbN2/+QQv4a7WcMvRNvIExYM//mrgwja4OmnRY6yjlXI4a/T8cSpWbd7ph9Uz\nUG+yuT1P2ifA7NU+xoC9Yn7kcQNhEeCxnaqqWPqGIFqDPvxGyjKEfn0K6M6NLeKu\nvfFLwl9PuVBCkkEdX40k5LO4/rQHUl0LUB/gLcnGSukM0LdzuZ+gzZW9nDAMISWm\nKAvHUPR7AgMBAAECgf8s8bD02PA0lw+xNX+rkhYapfQlF+FMkeKR5eSTXiq0rA3s\nfBF/97PwZIzmGXPnblrWYDIDcear1ZeTfCIzVPPuKWZ2ulbSw5slTCOywF0nNoB6\nrGpFfoeL5KrOVCwxG9VW/YWtUzlEgsD6ucGVX0Dy/7gdWBnkumA4OhSbOLj6cAlc\ny60byp+7ZuNlb3fMycR3jqtEENF1kxdPV0WMSNwiyC99q1gzjwurTtnU1XVEt7Y6\nEhYvT9tXg95oLlaJkJ7GEDRY6DkG8IdRElEDnZqiFknFIJcp+ZQCEVGEj28n22At\njpYDQou1k/A4XoQwouTVZ1wvH/ddrOteUw1DNdUCgYEA3HYzXytp5Ia3f+4W+JJz\nhLQdUO5GSK792Avk1GWHN/uEMxkCnayGo+cEfGb9pSFOIHgk1yi+cIke1OQuEjzc\nrFG+qle4s+reBX71s3VZ8wabVYW35xzI80zJjwxmEl5lxEjs19FzNqfVTs12ZDBf\nHq7XXx/ljP2DE2kvVGSCTv0CgYEAy0M3XFec+/zUAEHKM4a23Ym4uxaAPNp9D23w\ndO/0EJL/K8QxQwKF51WDrg/Ugabjb0B19R0vuQYxYpK9H5BfWqMhRmP2Ap+VJu+6\nsNieo1cNgkJ/+BmmIqxlqwHaR2QVOAFqCvgcUCFsVuCIcIrPd3m3JOXSz+G53tZP\nm8jYdtcCgYAN1RzEC+VJAWriC/5E+mtlGCf+u/SM+u3ScGybJwOk75ML4bXYTsrj\n3craQ1wG0GAmiWNGXLgWN4RHt0lsu4TdCwP7jCV6pHHpxl2ENQi/xtpYM1umlJfH\nLDo5T33YCTQ5bJnvsKSZ+U3Y8+tJvf853Z6FyWqNvhpLTX46vVOvwQKBgFrL1L/4\nFxTtFFplCQjJRYhii9VusKv+QV0SFBZ4VYLN1xRa2FKBnwT+SwsG4TtlLDU3CzoJ\n5pZ08LyCpd6ipCWdtzB1WKBFXt/8uF1k9kAqk8s7H2TZOEBG2EdyVWoMh/nzj8YE\nnMkilP2d4PS83P4WrbvaubfIsjmbbAY/yooTAoGBAJ8wA9oKjrgY5I3UFQ5qu+Ya\nOkZM69TePOkvx4zUvpjK8X3u5sweB/e/FKNfu8HsVn/4o6Wu6F2rkAa1++q+UBLi\nOIz04PhZPBk0MXKDuLXrZXvxZ6O4kPZpgNTpOUSmvpn7/ckCGGkO7ZZN9Jnzr19I\n24HlGKv1RtR90vO94JFe\n-----END PRIVATE KEY-----\n"
const CERTIFICATE = "-----BEGIN CERTIFICATE-----\nMIIC1zCCAb+gAwIBAgIBAjANBgkqhkiG9w0BAQsFADAgMR4wHAYDVQQDDBVSZWxh\neSB0ZXN0IGZpeHR1cmUgQ0EwIBcNMjAwMTAxMDAwMDAwWhgPMjEyMDAxMDEwMDAw\nMDBaMBQxEjAQBgNVBAMMCWxvY2FsaG9zdDCCASIwDQYJKoZIhvcNAQEBBQADggEP\nADCCAQoCggEBAK8LnVjUTJnzQfX3wYOj+fCWBS+rA3m9An3hvwlBDoRkBx02WFGg\n67asX4G0+UXNLdWbdxrpDElElUvySV9vS8TT5kZNuaVTnC9CRXz0G8o5E59Q7Vxe\ny0fmd9zusLBbLHBCRWhpXm62iLmEI1ts3b/5BC/hrtZwy9E28gTFgz/+auDCNrg6\nadFjrKOVcjhr9PxxKlZt3umH1TNQb7K5PU/aJ8Ds1T7GgL1ifuRxA2ER4LGdqqpY\n+oYgWoM+/EbKMoR+fQrozo0t4q698UvCX0+5UEKSQR1fjSTks7j+tAdSXQtQH+At\nycZK6QzQt3O5n6DNlb2cMAwhJaYoC8dQ9HsCAwEAAaMmMCQwFAYDVR0RBA0wC4IJ\nbG9jYWxob3N0MAwGA1UdEwEB/wQCMAAwDQYJKoZIhvcNAQELBQADggEBAFjAD7rg\nVtlpwiA5Su9WVazkyRBwmTcDI4tfs3nRit6UssyyXMpuHb5srpPoRJ1C/mbqvhvU\neASTGaXNcLDhPgOc/9v+W9nW3V32sgsxl+6OpPALMkHjKhnMW1cVMpCExW2M6Pel\n6p09ZeQDcf+Rz4tkkDz5VlAXdV1ZmsDM47kPOR1kpD5n/+abfuZ3WCX9yBggIIzK\nfrXvZoiK/Q0LoGcTyrd+KeypoUtt114BQHXrHiG0iIvDFwJKwJnOVnUwKk1ytHzl\n5a/XntmSlh5nIa7epLew/T1XMPDJBan+ptNxvPvmXjSme3OhYan0G3/rJOmoA6bn\nWwzxs/QdHnL0CS8=\n-----END CERTIFICATE-----\n"
const OTHER_CERTIFICATE = "-----BEGIN CERTIFICATE-----\nMIIC3zCCAcegAwIBAgIBAzANBgkqhkiG9w0BAQsFADAgMR4wHAYDVQQDDBVSZWxh\neSB0ZXN0IGZpeHR1cmUgQ0EwIBcNMjAwMTAxMDAwMDAwWhgPMjEyMDAxMDEwMDAw\nMDBaMBgxFjAUBgNVBAMMDW90aGVyLmludmFsaWQwggEiMA0GCSqGSIb3DQEBAQUA\nA4IBDwAwggEKAoIBAQCvC51Y1EyZ80H198GDo/nwlgUvqwN5vQJ94b8JQQ6EZAcd\nNlhRoOu2rF+BtPlFzS3Vm3ca6QxJRJVL8klfb0vE0+ZGTbmlU5wvQkV89BvKOROf\nUO1cXstH5nfc7rCwWyxwQkVoaV5utoi5hCNbbN2/+QQv4a7WcMvRNvIExYM//mrg\nwja4OmnRY6yjlXI4a/T8cSpWbd7ph9UzUG+yuT1P2ifA7NU+xoC9Yn7kcQNhEeCx\nnaqqWPqGIFqDPvxGyjKEfn0K6M6NLeKuvfFLwl9PuVBCkkEdX40k5LO4/rQHUl0L\nUB/gLcnGSukM0LdzuZ+gzZW9nDAMISWmKAvHUPR7AgMBAAGjKjAoMBgGA1UdEQQR\nMA+CDW90aGVyLmludmFsaWQwDAYDVR0TAQH/BAIwADANBgkqhkiG9w0BAQsFAAOC\nAQEAUdJbeJJo22uGdHrHSrt0CeHM94G+G5l5xKRWBXYASTk1yAPf4E0w7wfNi10I\nUGzx+OfRudF/+shzV2eqUFLLmqdfpAagZybbhIUn6s/4tdpSHhJOUivNt4HjQrnP\ndqtiIlROWJ8G1sV+bk7wagVna9qM+rdKvcy9lwJyFySxqNWTZqKVWjKte73R2m3+\nLLL1vSr257jM4gzV96ODechY+N7PtgSQgFkTlpQKhQL0K/DSgrWET7+aSPFUloO7\nyE/Tm0chEeydr9Iw+1PEuoYBcKSlUZONHzLX/35lIX/G5FXXyahJVhNuy61hBzCR\n/qWPmqqeVoY+xEiPPLx87VIsow==\n-----END CERTIFICATE-----\n"

type NativeWebSocket = new (url: string, options: {
  headers?: Record<string, string>
  dispatcher: ReturnType<typeof nodeWebSocketDispatcher>
}) => WebSocket
const NativeWebSocket = WebSocket as unknown as NativeWebSocket

async function fixture(t: TestContext): Promise<{ server: Server; port: number }> {
  const server = createServer({ key: KEY, cert: CERTIFICATE })
  const sockets = new Set<Duplex>()
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
  server.on('upgrade', (_request, socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
  server.on('tlsClientError', () => {})
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
  })
  return { server, port: (server.address() as AddressInfo).port }
}

function event(socket: WebSocket, name: 'open' | 'error' | 'message' | 'close'): Promise<Event> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`WebSocket ${name} timed out`)), 5_000)
    socket.addEventListener(name, received => { clearTimeout(timer); resolve(received) }, { once: true })
    if (name !== 'error') socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error(`WebSocket failed before ${name}`))
    }, { once: true })
  })
}

function textFrame(text: string): Buffer {
  const payload = Buffer.from(text)
  assert.ok(payload.length < 65536, 'fixture supports messages below 64 KiB only')
  const head = payload.length < 126
    ? Buffer.from([0x81, payload.length])
    : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255])
  return Buffer.concat([head, payload])
}

test('Node WebSocket sends upgrade headers and exchanges frames with a pinned CA-issued leaf', async t => {
  const { server, port } = await fixture(t)
  let receivedHeader: string | string[] | undefined
  const auth = new Promise<string>(resolve => {
    server.on('upgrade', (request, socket) => {
      receivedHeader = request.headers['x-hermes-relay-session']
      const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
      socket.write(Buffer.concat([
        Buffer.from(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`),
        textFrame('fixture-ready')
      ]))
      let input = Buffer.alloc(0)
      socket.on('data', chunk => {
        input = Buffer.concat([input, chunk])
        if (input.length < 6) return
        const length = input[1]! & 0x7f
        if (input.length < 6 + length) return
        assert.equal(input[0], 0x81)
        assert.ok(input[1]! & 0x80, 'built-in WebSocket masks client frames')
        const payload = Buffer.from(input.subarray(6, 6 + length))
        for (let index = 0; index < payload.length; index++) payload[index] ^= input[2 + index % 4]!
        resolve(payload.toString())
        socket.removeAllListeners('data')
        socket.end(Buffer.from([0x88, 0x00]))
      })
    })
  })
  const socket = new NativeWebSocket(`wss://localhost:${port}/relay/ws?fixture=1`, {
    headers: { 'X-Hermes-Relay-Session': 'fixture-session' },
    dispatcher: nodeWebSocketDispatcher(CERTIFICATE)
  })
  const welcome = event(socket, 'message')
  const closed = event(socket, 'close')
  await event(socket, 'open')
  socket.send('fixture-auth')
  assert.equal((await welcome as MessageEvent).data, 'fixture-ready')
  assert.equal(await auth, 'fixture-auth')
  assert.equal(receivedHeader, 'fixture-session')
  await closed
})

test('a different certificate cannot receive the session header or auth payload', async t => {
  const { server, port } = await fixture(t)
  let upgrades = 0
  server.on('upgrade', () => { upgrades++ })
  const socket = new NativeWebSocket(`wss://localhost:${port}/relay/ws`, {
    headers: { 'X-Hermes-Relay-Session': 'fixture-session' },
    dispatcher: nodeWebSocketDispatcher(OTHER_CERTIFICATE)
  })
  socket.addEventListener('open', () => socket.send('fixture-auth'))
  await event(socket, 'error')
  assert.equal(upgrades, 0)
})

test('pin trust retains hostname verification before sending credentials', async t => {
  const { server, port } = await fixture(t)
  let upgrades = 0
  server.on('upgrade', () => { upgrades++ })
  const socket = new NativeWebSocket(`wss://127.0.0.1:${port}/relay/ws`, {
    headers: { 'X-Hermes-Relay-Session': 'fixture-session' },
    dispatcher: nodeWebSocketDispatcher(CERTIFICATE)
  })
  socket.addEventListener('open', () => socket.send('fixture-auth'))
  await event(socket, 'error')
  assert.equal(upgrades, 0)
})

test('the native WebSocket still rejects an invalid upgrade accept key', async t => {
  const { server, port } = await fixture(t)
  server.on('upgrade', (_request, socket) => {
    socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: invalid\r\n\r\n')
  })
  const socket = new NativeWebSocket(`wss://localhost:${port}/relay/ws`, {
    dispatcher: nodeWebSocketDispatcher(CERTIFICATE)
  })
  await event(socket, 'error')
})

test('a rejected HTTP upgrade finishes as a WebSocket error', async t => {
  const { server, port } = await fixture(t)
  server.on('upgrade', (_request, socket) => {
    socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
  })
  const socket = new NativeWebSocket(`wss://localhost:${port}/relay/ws`, {
    dispatcher: nodeWebSocketDispatcher(CERTIFICATE)
  })
  await event(socket, 'error')
})

test('packaged CLI preserves native pairing and refuses invalid TLS before credentials', {
  skip: !process.env.HERMES_RELAY_TEST_EXE
}, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'hermes-relay-packaged-tls-'))
  const executable = join(directory, 'hermes-relay.exe')
  copyFileSync(resolve(process.env.HERMES_RELAY_TEST_EXE!), executable)
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const certificate = new X509Certificate(CERTIFICATE)
  const pin = 'sha256/' + createHash('sha256')
    .update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64')
  const deviceId = '11111111-1111-4111-8111-111111111111'

  for (const scenario of [
    { name: 'pinned leaf', hostname: 'localhost', pin, success: true },
    { name: 'wrong pin', hostname: 'localhost', pin: 'sha256/' + Buffer.alloc(32).toString('base64'), success: false },
    { name: 'wrong hostname', hostname: '127.0.0.1', pin, success: false }
  ]) {
    await t.test(scenario.name, async context => {
      const { server, port } = await fixture(context)
      const home = join(directory, scenario.name)
      const state = join(home, '.hermes')
      mkdirSync(state, { recursive: true })
      const url = `wss://${scenario.hostname}:${port}/relay/ws`
      const sessionPath = join(state, 'remote-sessions.json')
      writeFileSync(sessionPath, JSON.stringify({ version: 1, sessions: {
        [url]: { token: 'fixture-existing-session', paired_at: 123, server_version: 'fixture-relay', cert_pin_sha256: scenario.pin }
      } }))
      const previousSession = readFileSync(sessionPath)
      const devicePath = join(state, 'desktop-device-id')
      writeFileSync(devicePath, `${deviceId}\n`)
      let upgrades = 0
      const authFrames: Record<string, unknown>[] = []

      server.on('upgrade', (request, socket) => {
        upgrades++
        socket.on('error', () => {})
        const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
        let input = Buffer.alloc(0)
        socket.on('data', chunk => {
          input = Buffer.concat([input, chunk])
          while (input.length >= 2) {
            const opcode = input[0]! & 15
            let length = input[1]! & 127
            assert.notEqual(length, 127, 'fixture does not accept 64-bit frame lengths')
            let offset = 2
            if (length === 126) {
              if (input.length < 4) return
              length = input.readUInt16BE(2)
              offset = 4
            }
            assert.ok(input[1]! & 128, 'native client frames must be masked')
            if (input.length < offset + 4 + length) return
            const mask = input.subarray(offset, offset + 4)
            offset += 4
            const body = Buffer.from(input.subarray(offset, offset + length))
            input = input.subarray(offset + length)
            for (let index = 0; index < body.length; index++) body[index] ^= mask[index % 4]!
            if (opcode === 8) { socket.end(Buffer.from([0x88, 0])); return }
            if (opcode !== 1) continue
            const message = JSON.parse(body.toString()) as { channel: string; type: string; payload: Record<string, unknown> }
            if (message.channel === 'system' && message.type === 'auth') {
              authFrames.push(message.payload)
              socket.write(textFrame(JSON.stringify({ channel: 'system', type: 'auth.ok', payload: {
                session_token: 'fixture-new-session', server_version: 'fixture-relay', expires_at: null,
                grants: { bridge: null }, transport_hint: 'wss'
              } })))
            }
          }
        })
      })

      const child = spawn(executable, ['pair', 'ABC123', '--remote', url, '--non-interactive', '--no-color'], {
        cwd: directory,
        env: {
          ...process.env, USERPROFILE: home, HOME: home,
          APPDATA: join(home, 'AppData', 'Roaming'), LOCALAPPDATA: join(home, 'AppData', 'Local'),
          HERMES_RELAY_PAIR_QR: '', HERMES_RELAY_URL: '', NODE_OPTIONS: ''
        },
        windowsHide: true
      })
      let stderr = ''
      child.stdout.resume()
      child.stderr.on('data', chunk => { stderr += String(chunk) })
      const timeout = setTimeout(() => child.kill(), 20_000)
      context.after(() => { clearTimeout(timeout); if (child.exitCode === null) child.kill() })
      const exitCode = await new Promise<number | null>((fulfill, reject) => {
        child.once('error', reject)
        child.once('close', fulfill)
      })
      clearTimeout(timeout)
      assert.equal(exitCode, scenario.success ? 0 : 1, stderr)
      assert.equal(upgrades, scenario.success ? 1 : 0, stderr)
      assert.equal(authFrames.length, scenario.success ? 1 : 0, stderr)
      assert.equal(readFileSync(devicePath, 'utf8'), `${deviceId}\n`)
      if (scenario.success) {
        assert.equal(authFrames[0]!.pairing_code, 'ABC123')
        assert.equal(authFrames[0]!.device_id, deviceId)
        const stored = JSON.parse(readFileSync(sessionPath, 'utf8')) as { sessions: Record<string, { token: string }> }
        assert.equal(stored.sessions[url]!.token, 'fixture-new-session')
      } else {
        assert.deepEqual(readFileSync(sessionPath), previousSession)
      }
    })
  }
})
