/** Address selection coverage for hosts with physical and virtual adapters. */

import { describe, expect, it, vi } from 'vitest'

vi.mock('node:os', () => ({
  networkInterfaces: () => ({
    'VMware Network Adapter': [{
      address: '192.168.166.1',
      netmask: '255.255.255.0',
      family: 'IPv4',
      mac: '00:50:56:c0:00:01',
      internal: false,
      cidr: '192.168.166.1/24',
    }],
    WLAN: [{
      address: '192.168.101.17',
      netmask: '255.255.255.0',
      family: 'IPv4',
      mac: 'd0:3c:1f:19:8e:80',
      internal: false,
      cidr: '192.168.101.17/24',
    }],
  }),
}))

const { resolveAdvertiseHost } = await import('../src/index.ts')

describe('mobile advertised host selection', () => {
  it('uses the address selected by the operating system default route', () => {
    expect(resolveAdvertiseHost({ host: '0.0.0.0' }, '192.168.101.17')).toBe('192.168.101.17')
  })

  it('requires an explicit host when route selection cannot disambiguate adapters', () => {
    expect(() => resolveAdvertiseHost({ host: '0.0.0.0' })).toThrow('multiple LAN IPv4 addresses')
  })

  it('keeps an explicit advertised host authoritative', () => {
    expect(resolveAdvertiseHost({ host: '0.0.0.0', advertiseHost: 'phone-host.local' }, '192.168.101.17'))
      .toBe('phone-host.local')
  })
})
