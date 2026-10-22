import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
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
  assert.ok(payload.length < 126, 'fixture supports short text messages only')
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload])
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

