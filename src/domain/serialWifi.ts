/** USB serial frames are UTF-8, newline-delimited, and capped before JSON parsing. */
export const SERIAL_LINE_LIMIT = 8192

export type WifiDeviceStatus = {
  deviceId: string
  bootId: string
  protocolVersion: number
  capabilities: ('wifi-update')[]
  cloudConfigured: boolean
  wifiConfigured: boolean
  wifiState: 'unconfigured' | 'connecting' | 'connected'
  wifi: boolean
  timeSynced: boolean
  acceptedBatches: number
  lastHttp: number
  firmware: string
  wifiLastDisconnectReason: number
  wifiConnectAttempts: number
}

export type WifiSerialMessage =
  | { kind: 'status'; status: WifiDeviceStatus }
  | { kind: 'config'; ok: boolean; wifiSaved: boolean; restart: boolean; error?: string }

const utf8 = new TextEncoder()
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown, minimum = 0): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum ? value : 0
const identifier = (value: unknown): string =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value) ? value : ''

export function validateWifi(ssid: string, password: string): string | null {
  if (/[\x00-\x1f\x7f]/.test(ssid)) return 'Wi-Fi 名称不能包含换行、制表符或其他控制字符'
  if (/[\x00-\x1f\x7f]/.test(password)) return 'Wi-Fi 密码不能包含换行、制表符或其他控制字符'
  const ssidBytes = utf8.encode(ssid).byteLength
  if (ssidBytes < 1 || ssidBytes > 32) return 'Wi-Fi 名称须为 1–32 个 UTF-8 字节（中文通常占 3 字节）'
  const passwordBytes = utf8.encode(password).byteLength
  if ((passwordBytes >= 8 && passwordBytes <= 63) || /^[0-9a-fA-F]{64}$/.test(password)) return null
  return 'Wi-Fi 密码须为 8–63 个 UTF-8 字节，或 64 位十六进制密钥'
}

/** JSON escaping keeps credentials inside one frame; never trim either credential. */
export function encodeWifiCommand(ssid: string, password: string): string {
  const error = validateWifi(ssid, password)
  if (error) throw new Error(error)
  return `WIFI ${JSON.stringify({ ssid, password })}\n`
}

/** Ignore logs/telemetry and expose only allowlisted, normalized device fields. */
export function parseSerialLine(line: string): WifiSerialMessage | null {
  if (line.length > SERIAL_LINE_LIMIT || utf8.encode(line).byteLength > SERIAL_LINE_LIMIT) return null
  const frame = line.replace(/\r?\n$/, '').replace(/\r$/, '')
  if (/[\r\n]/.test(frame)) return null
  const isStatus = frame.startsWith('STATUS ')
  const isConfig = frame.startsWith('CFG ')
  if (!isStatus && !isConfig) return null

  let value: unknown
  try {
    value = JSON.parse(frame.slice(isStatus ? 7 : 4))
  } catch {
    return null
  }
  if (!object(value)) return null

  if (isConfig) {
    // SET also emits CFG on older firmware; only WIFI acknowledgements belong here.
    if (value.command !== 'WIFI' || typeof value.ok !== 'boolean') return null
    if (value.ok === true && value.wifiSaved === true && value.restart === true) {
      return { kind: 'config', ok: true, wifiSaved: true, restart: true }
    }
    const error = typeof value.error === 'string' && ['invalid_wifi', 'cloud_not_configured', 'nvs_write'].includes(value.error)
      ? value.error : 'unknown'
    return { kind: 'config', ok: false, wifiSaved: false, restart: false, error }
  }

  return {
    kind: 'status',
    status: {
      deviceId: identifier(value.deviceId),
      bootId: identifier(value.bootId),
      protocolVersion: integer(value.protocolVersion),
      capabilities: Array.isArray(value.capabilities) && value.capabilities.includes('wifi-update') ? ['wifi-update'] : [],
      cloudConfigured: value.cloudConfigured === true,
      wifiConfigured: value.wifiConfigured === true,
      wifiState: value.wifiState === 'connected' || value.wifiState === 'connecting' ? value.wifiState : 'unconfigured',
      wifi: value.wifi === true,
      timeSynced: value.timeSynced === true,
      acceptedBatches: integer(value.acceptedBatches),
      lastHttp: integer(value.lastHttp, -999),
      firmware: typeof value.firmware === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$/.test(value.firmware) ? value.firmware : '',
      wifiLastDisconnectReason: integer(value.wifiLastDisconnectReason),
      wifiConnectAttempts: integer(value.wifiConnectAttempts),
    },
  }
}
