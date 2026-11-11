import { lookup as dnsLookup } from 'node:dns'
import type { LookupAddress, LookupOptions } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP } from 'node:net'

// SSRF protection for fetching user-supplied URLs (OAuth client metadata documents).
// The IP check runs inside the socket's DNS lookup, so it also covers DNS rebinding
// and every redirect hop. IP literals skip DNS and are checked up front.

const blocked = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, prefix, 'ipv6')

/** True for loopback, private, link-local, multicast, documentation and other non-public addresses. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return blocked.check(address, 'ipv4')
  if (family === 6) {
    // IPv4-mapped (::ffff:10.0.0.1) must be judged as IPv4
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
    if (mapped) return blocked.check(mapped, 'ipv4')
    return blocked.check(address, 'ipv6')
  }
  return true
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

function safeLookup(hostname: string, options: LookupOptions, callback: LookupCallback) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '')
    const list = addresses as LookupAddress[]
    if (!list.length || list.some(a => isBlockedAddress(a.address))) {
      return callback(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }), '')
    }
    if (options.all) return callback(null, list)
    callback(null, list[0]!.address, list[0]!.family)
  })
}

export class SafeFetchError extends Error {}

interface Options { maxBytes: number, timeoutMs: number, maxRedirects: number, accept?: string }

/** Downloads a public http(s) URL into memory with size, time and redirect limits. */
export async function safeFetchBuffer(rawUrl: string, opts: Options, redirects = 0): Promise<Buffer> {
  let url: URL
  try {
    url = new URL(rawUrl)
  }
  catch {
    throw new SafeFetchError('Ungültige URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SafeFetchError('Nur http- und https-URLs sind erlaubt.')
  if (url.username || url.password) throw new SafeFetchError('URLs mit Zugangsdaten sind nicht erlaubt.')
  if (url.port && !['80', '443'].includes(url.port)) throw new SafeFetchError('Nur die Standard-Ports 80 und 443 sind erlaubt.')

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && isBlockedAddress(host)) throw new SafeFetchError('Diese Adresse ist nicht erlaubt.')

  const client = url.protocol === 'https:' ? https : http

  return await new Promise<Buffer>((resolve, reject) => {
    const req = client.get(url, {
      lookup: safeLookup as never,
      timeout: opts.timeoutMs,
      headers: { 'user-agent': 'exam/1.0', 'accept': opts.accept ?? 'image/*' },
    }, (res) => {
      const status = res.statusCode ?? 0

      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        if (redirects >= opts.maxRedirects) return reject(new SafeFetchError('Zu viele Weiterleitungen.'))
        const next = new URL(res.headers.location, url).toString()
        return safeFetchBuffer(next, opts, redirects + 1).then(resolve, reject)
      }
      if (status < 200 || status >= 300) {
        res.resume()
        return reject(new SafeFetchError(`Laden fehlgeschlagen (HTTP ${status}).`))
      }
      if (Number(res.headers['content-length'] ?? 0) > opts.maxBytes) {
        res.destroy()
        return reject(new SafeFetchError('Das Bild ist zu groß.'))
      }

      const chunks: Buffer[] = []
      let size = 0
      res.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > opts.maxBytes) {
          res.destroy()
          reject(new SafeFetchError('Das Bild ist zu groß.'))
        }
        else chunks.push(chunk)
      })
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })

    req.on('timeout', () => req.destroy(new SafeFetchError('Zeitüberschreitung beim Laden des Bildes.')))
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err instanceof SafeFetchError) return reject(err)
      if (err.code === 'EBLOCKED') return reject(new SafeFetchError('Diese Adresse ist nicht erlaubt.'))
      reject(new SafeFetchError('Bild konnte nicht geladen werden.'))
    })
  })
}
