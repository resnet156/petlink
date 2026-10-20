import { describe, expect, it } from 'vitest'
import { activityToBehavior, liveActivity, parseLive, validRoom, validateGlb, type CollarLive } from './collar'

const live: CollarLive = {
  online: true,
  device: { deviceId: 'capsule', firmware: 'test', source: 'serial-bridge', sampleRate: 50, receivedAt: 100_000, sequence: 7 },
  latest: { id: '12', deviceId: 'capsule', bootId: 'boot', seq: 7, receivedAt: 100_000, capturedAt: 99_990,
    activity: 'walk', confidence: .75, features: { accelRms: .12, gyroRms: 15 }, sample: { ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 15 } },
  events: [],
}

describe('real collar contract', () => {
  it('accepts numeric database identifiers and normalizes them to stable UI strings', () => {
    const response = { ...live, latest: { ...live.latest, id: 12 } }
    expect(parseLive(response).latest?.id).toBe('12')
  })
  it('does not animate a stale, disconnected, offline, or missing device', () => {
    expect(liveActivity(live, 105_000, true)).toBe('walk')
    expect(liveActivity(live, 111_000, true)).toBe('unknown')
    expect(liveActivity(live, 105_000, false)).toBe('unknown')
    expect(liveActivity({ ...live, online: false }, 105_000, true)).toBe('unknown')
    expect(liveActivity(null, 105_000, true)).toBe('unknown')
    expect(liveActivity({ ...live, latest: null }, 105_000, true)).toBe('unknown')
  })
  it('rejects incomplete or nonfinite axis samples instead of displaying fabricated zeros', () => {
    expect(() => parseLive({ ...live, latest: { ...live.latest, sample: {} } })).toThrow()
    expect(() => parseLive({ ...live, latest: { ...live.latest, sample: { ...live.latest!.sample, ax: Infinity } } })).toThrow()
    expect(() => parseLive({ ...live, latest: { ...live.latest, activity: 'sleeping' } })).toThrow()
  })
  it('maps only measured motion to the pet and never infers sleep, feeding or location', () => {
    expect(activityToBehavior.rest).toBe('idle')
    expect(activityToBehavior.walk).toBe('walking')
    expect(activityToBehavior.shake).toBe('shaking')
    expect(Object.values(activityToBehavior)).not.toContain('sleeping')
    expect(Object.values(activityToBehavior)).not.toContain('eating')
  })
})

describe('local modeling inputs', () => {
  it('requires physical, bounded room dimensions', () => {
    expect(validRoom({ width: 4.8, depth: 3.6, height: 2.7 })).toBe(true)
    expect(validRoom({ width: NaN, depth: 3.6, height: 2.7 })).toBe(false)
    expect(validRoom({ width: 0, depth: 3.6, height: 2.7 })).toBe(false)
    expect(validRoom({ width: 4, depth: 3, height: 15 })).toBe(false)
  })
  const glb = (json: unknown) => {
    const text = JSON.stringify(json)
    const bytes = new TextEncoder().encode(text.padEnd(Math.ceil(text.length / 4) * 4, ' '))
    const buffer = new ArrayBuffer(20 + bytes.byteLength)
    const view = new DataView(buffer)
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true)
    view.setUint32(12, bytes.byteLength, true); view.setUint32(16, 0x4e4f534a, true)
    new Uint8Array(buffer, 20).set(bytes)
    return buffer
  }
  it('accepts self-contained models but prevents external texture or buffer requests', () => {
    expect(() => validateGlb(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 0 }] }))).not.toThrow()
    expect(() => validateGlb(glb({ asset: { version: '2.0' }, images: [{ uri: 'https://example.com/tracking.png' }] }))).toThrow(/外部/)
    expect(() => validateGlb(glb({ asset: { version: '2.0' }, buffers: [{ uri: '../model.bin' }] }))).toThrow(/外部/)
    expect(() => validateGlb(new ArrayBuffer(10))).toThrow()
  })
  it('rejects valid GLB headers with missing or unsupported asset metadata before loading', () => {
    expect(() => validateGlb(glb({ asset: {} }))).toThrow(/asset/)
    expect(() => validateGlb(glb({}))).toThrow(/asset/)
    expect(() => validateGlb(glb({ asset: { version: '1.0' } }))).toThrow(/asset/)
  })
})
