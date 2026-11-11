import { describe, expect, it } from 'vitest'
import { isBlockedAddress, safeFetchBuffer } from '../server/utils/safe-fetch'

const opts = { maxBytes: 1024, timeoutMs: 2000, maxRedirects: 1 }

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true)
  })

  it.each(['1.1.1.1', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '::ffff:1.1.1.1'])('allows %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false)
  })
})

describe('safeFetchBuffer', () => {
  it.each([
    ['ftp://example.org/a.png', /http/],
    ['file:///etc/passwd', /http/],
    ['http://user:pw@example.org/a.png', /Zugangsdaten/],
    ['http://example.org:8080/a.png', /Port/],
    ['http://127.0.0.1/a.png', /nicht erlaubt/],
    ['http://[::1]/a.png', /nicht erlaubt/],
    ['http://169.254.169.254/latest/meta-data', /nicht erlaubt/],
    ['kein url', /Ungültige URL/],
  ])('rejects %s', async (url, message) => {
    await expect(safeFetchBuffer(url, opts)).rejects.toThrow(message)
  })

  it('blocks hostnames that resolve to private addresses', async () => {
    await expect(safeFetchBuffer('http://localhost/a.png', opts)).rejects.toThrow(/nicht erlaubt/)
  })
})
