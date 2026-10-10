import { describe, expect, it } from 'vitest'
import { encodeWifiCommand, parseSerialLine, SERIAL_LINE_LIMIT, validateWifi } from './serialWifi'

describe('Wi-Fi serial commands', () => {
  it('validates UTF-8 byte counts rather than JavaScript string lengths', () => {
    expect(validateWifi('网'.repeat(10) + 'ab', 'password')).toBeNull()
    expect(validateWifi('网'.repeat(11), 'password')).toMatch(/名称/)
    expect(validateWifi('🐾'.repeat(8), '密码密')).toBeNull()
    expect(validateWifi('🐾'.repeat(9), 'password')).toMatch(/名称/)
    expect(validateWifi('', 'password')).toMatch(/名称/)
    expect(validateWifi('home', '密'.repeat(21))).toBeNull()
    expect(validateWifi('home', '密'.repeat(22))).toMatch(/密码/)
    expect(validateWifi('home', '密码')).toMatch(/密码/)
    expect(validateWifi('home', '1234567')).toMatch(/密码/)
    expect(validateWifi('home', '12345678')).toBeNull()
    expect(validateWifi('home', 'a'.repeat(63))).toBeNull()
  })

  it('accepts exactly 64 hexadecimal characters as a raw WPA key', () => {
    expect(validateWifi('home', 'aF09'.repeat(16))).toBeNull()
    expect(validateWifi('home', 'g'.repeat(64))).toMatch(/密码/)
    expect(validateWifi('home', 'a'.repeat(65))).toMatch(/密码/)
    expect(validateWifi('home', '')).toMatch(/密码/)
  })

  it('preserves spaces and safely JSON-escapes quotes and slashes in one frame', () => {
    const ssid = ' 家中"网络\\ '
    const password = '  pa"ss\\word  '
    const command = encodeWifiCommand(ssid, password)
    expect(command.startsWith('WIFI ')).toBe(true)
    expect(command.match(/\n/g)).toHaveLength(1)
    expect(command.endsWith('\n')).toBe(true)
    expect(JSON.parse(command.slice(5))).toEqual({ ssid, password })
    expect(Object.keys(JSON.parse(command.slice(5)))).toEqual(['ssid', 'password'])
    expect(encodeWifiCommand(' ', '        ')).toBe('WIFI {"ssid":" ","password":"        "}\n')
  })

  it('does not produce a command for invalid credentials', () => {
    expect(() => encodeWifiCommand('', 'password')).toThrow(/名称/)
    expect(() => encodeWifiCommand('home', 'short')).toThrow(/密码/)
  })

  it('rejects ASCII control characters instead of emitting an invalid or injected frame', () => {
    for (const control of ['\0', '\n', '\r', '\t', '\x1f', '\x7f']) {
      expect(validateWifi(`home${control}`, 'password')).toMatch(/名称.*控制字符/)
      expect(validateWifi('home', `password${control}`)).toMatch(/密码.*控制字符/)
      expect(() => encodeWifiCommand(`home${control}`, 'password')).toThrow(/控制字符/)
      expect(() => encodeWifiCommand('home', `password${control}`)).toThrow(/控制字符/)
    }
    expect(() => encodeWifiCommand('home\nSTATUS', 'password')).toThrow(/控制字符/)
  })
})

describe('Wi-Fi serial response parser', () => {
  const status = {
    deviceId: 'petlink-collar-00:11:22:33:44:55',
    bootId: 'boot-1234',
    protocolVersion: 2,
    capabilities: ['wifi-update'],
    cloudConfigured: true,
    wifiConfigured: true,
    wifiState: 'connecting',
    wifi: false,
    timeSynced: false,
    acceptedBatches: 3,
    lastHttp: -1,
    firmware: '0.2.1-collar.1',
    wifiLastDisconnectReason: 202,
    wifiConnectAttempts: 2,
  }

  it('reads exact STATUS frames and optional serial line terminators', () => {
    for (const suffix of ['', '\r', '\n', '\r\n']) {
      expect(parseSerialLine(`STATUS ${JSON.stringify(status)}${suffix}`)).toEqual({ kind: 'status', status })
    }
    expect(parseSerialLine(`STATUS ${JSON.stringify({ ...status, wifi: true, wifiState: 'connected', timeSynced: true })}`))
      .toMatchObject({ kind: 'status', status: { wifi: true, wifiState: 'connected', timeSynced: true } })
  })

  it('ignores telemetry, cloud output, boot logs, and inexact prefixes', () => {
    for (const line of [
      JSON.stringify({ ...status, wifi: true }),
      `PL1 ${JSON.stringify(status)}`, `CLOUD ${JSON.stringify(status)}`,
      'ESP-ROM:esp32s3-20210327', 'I (100) wifi: connected',
      ` status ${JSON.stringify(status)}`, ` STATUS ${JSON.stringify(status)}`,
      `STATUSX ${JSON.stringify(status)}`, `STATUS\t${JSON.stringify(status)}`,
    ]) expect(parseSerialLine(line)).toBeNull()
  })

  it('ignores malformed, primitive, multiline, and oversized frames without throwing', () => {
    for (const line of ['STATUS {', 'STATUS null', 'STATUS []', 'STATUS true', 'CFG "ok"',
      'STATUS {}\nSTATUS {}', 'STATUS {}\rSTATUS {}', `STATUS {"firmware":"${'a'.repeat(SERIAL_LINE_LIMIT)}"}`,
      `STATUS {"firmware":"${'网'.repeat(3000)}"}`,
    ]) expect(parseSerialLine(line)).toBeNull()
  })

  it('keeps old firmware unsupported when capability or cloud setup information is absent', () => {
    const message = parseSerialLine('STATUS {"firmware":"0.2.0","wifi":true}')
    expect(message).toEqual({ kind: 'status', status: {
      deviceId: '', bootId: '',
      protocolVersion: 0, capabilities: [], cloudConfigured: false, wifiConfigured: false,
      wifiState: 'unconfigured', wifi: true, timeSynced: false, acceptedBatches: 0, lastHttp: 0,
      firmware: '0.2.0', wifiLastDisconnectReason: 0, wifiConnectAttempts: 0,
    } })
  })

  it('uses conservative defaults for malformed fields and filters unknown capabilities', () => {
    const message = parseSerialLine(`STATUS ${JSON.stringify({
      protocolVersion: '2', capabilities: ['wifi-update', 'password'], cloudConfigured: 'true',
      wifiConfigured: 1, wifiState: 'failed', wifi: 'true', timeSynced: {}, acceptedBatches: -1,
      lastHttp: 2.5, firmware: '<script>secret</script>', wifiLastDisconnectReason: -2, wifiConnectAttempts: 1e30,
    })}`)
    expect(message).toEqual({ kind: 'status', status: {
      deviceId: '', bootId: '',
      protocolVersion: 0, capabilities: ['wifi-update'], cloudConfigured: false, wifiConfigured: false,
      wifiState: 'unconfigured', wifi: false, timeSynced: false, acceptedBatches: 0, lastHttp: 0,
      firmware: '', wifiLastDisconnectReason: 0, wifiConnectAttempts: 0,
    } })
  })

  it('retains bounded safe device and boot identifiers for reconnection checks', () => {
    expect(parseSerialLine(`STATUS ${JSON.stringify({ ...status, deviceId: 'a'.repeat(128), bootId: '0'.repeat(128) })}`))
      .toMatchObject({ kind: 'status', status: { deviceId: 'a'.repeat(128), bootId: '0'.repeat(128) } })
    for (const value of ['a'.repeat(129), '<script>bad</script>', 'line\nsecret', { token: 'secret' }, 123]) {
      expect(parseSerialLine(`STATUS ${JSON.stringify({ ...status, deviceId: value, bootId: value })}`))
        .toMatchObject({ kind: 'status', status: { deviceId: '', bootId: '' } })
    }
  })

  it('never passes through credentials, cloud tokens, response bodies, or arbitrary fields', () => {
    const extra = { password: 'password-secret', token: 'token-secret', rawBody: 'body-secret',
      ssid: 'private-network', cloud: { token: 'nested-secret' }, capabilities: ['wifi-update', 'token-secret'] }
    expect(parseSerialLine(`STATUS ${JSON.stringify({ ...status, ...extra })}`)).toEqual({ kind: 'status', status })
    const config = parseSerialLine(`CFG ${JSON.stringify({ command: 'WIFI', ok: true, wifiSaved: true, restart: true, ...extra })}`)
    expect(config).toEqual({ kind: 'config', ok: true, wifiSaved: true, restart: true })
  })

  it('only accepts acknowledgements explicitly correlated to WIFI, ignoring legacy SET', () => {
    for (const command of [undefined, 'SET', 'STATUS', 'wifi']) {
      expect(parseSerialLine(`CFG ${JSON.stringify({ command, ok: true, wifiSaved: true, restart: true })}`)).toBeNull()
    }
    expect(parseSerialLine('CFG {"command":"WIFI","ok":"true"}')).toBeNull()
  })

  it('treats a successful save acknowledgement as saved/restarting, never as connected', () => {
    expect(parseSerialLine('CFG {"command":"WIFI","ok":true,"wifiSaved":true,"restart":true,"wifi":true,"wifiState":"connected"}'))
      .toEqual({ kind: 'config', ok: true, wifiSaved: true, restart: true })
    expect(parseSerialLine('CFG {"command":"WIFI","ok":true}'))
      .toEqual({ kind: 'config', ok: false, wifiSaved: false, restart: false, error: 'unknown' })
  })

  it('allows only documented error codes and never reflects arbitrary firmware error text', () => {
    for (const error of ['invalid_wifi', 'cloud_not_configured', 'nvs_write']) {
      expect(parseSerialLine(`CFG ${JSON.stringify({ command: 'WIFI', ok: false, error })}`))
        .toEqual({ kind: 'config', ok: false, wifiSaved: false, restart: false, error })
    }
    expect(parseSerialLine('CFG {"command":"WIFI","ok":false,"error":"password=private token=secret","wifiSaved":true,"restart":true}'))
      .toEqual({ kind: 'config', ok: false, wifiSaved: false, restart: false, error: 'unknown' })
    expect(parseSerialLine('CFG {"command":"WIFI","ok":false,"error":{"toString":"secret"}}'))
      .toEqual({ kind: 'config', ok: false, wifiSaved: false, restart: false, error: 'unknown' })
  })
})
