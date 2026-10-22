import { request } from 'node:https'
import type { Duplex } from 'node:stream'

interface UpgradeOptions {
  origin: string | URL
  path: string
  method: string
  headers: Record<string, string> | string[] | [string, string][]
  upgrade?: string
}

interface UpgradeHandler {
  onConnect(abort: (error?: Error) => void): void
  onUpgrade(statusCode: number, headers: string[], socket: Duplex): void
  onError(error: Error): void
}

/** Node's built-in WebSocket accepts a dispatcher, but ignores Bun's `tls` option.
 * Adapt only its HTTPS upgrade; Node retains WebSocket validation and framing.
 * Trust is scoped to the certificate already verified by Relay's pin probe.
 */
export function nodeWebSocketDispatcher(certificate: string) {
  return {
    dispatch(options: UpgradeOptions, handler: UpgradeHandler): boolean {
      const origin = new URL(options.origin)
      if (origin.protocol !== 'https:' || options.method !== 'GET' || options.upgrade !== 'websocket') {
        throw new Error('Pinned WebSocket dispatcher requires an HTTPS WebSocket upgrade')
      }
      const entries = options.headers
      const headers = Array.isArray(entries)
        ? Object.fromEntries(Array.isArray(entries[0])
          ? entries as [string, string][]
          : (entries as string[]).reduce<[string, string][]>((pairs, value, index, values) => {
            if (index % 2 === 0) pairs.push([value, values[index + 1]!])
            return pairs
          }, []))
        : entries
      let settled = false
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        handler.onError(error)
      }
      // Pass the request target verbatim. Resolving a leading `//` as a URL
      // would replace the reviewed origin rather than preserve its path.
      const req = request(origin, {
        path: options.path,
        method: 'GET',
        headers: { ...headers, Connection: 'Upgrade', Upgrade: 'websocket' },
        agent: false,
        ca: certificate,
        allowPartialTrustChain: true,
        rejectUnauthorized: true
      })
      const timer = setTimeout(() => req.destroy(new Error('Pinned WebSocket upgrade timed out')), 10_000)
      timer.unref?.()
      req.once('error', fail)
      req.once('response', response => {
        response.destroy()
        fail(new Error(`WebSocket upgrade returned HTTP ${response.statusCode}`))
      })
      req.once('upgrade', (response, socket, head) => {
        settled = true
        clearTimeout(timer)
        if (head.length) socket.unshift(head)
        handler.onUpgrade(response.statusCode ?? 101, response.rawHeaders, socket)
      })
      handler.onConnect(error => req.destroy(error))
      req.end()
      return true
    }
  }
}
