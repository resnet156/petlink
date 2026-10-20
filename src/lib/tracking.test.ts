import { describe, it, expect } from 'vitest'
import { handoffMessage, roomHasDevice, trackingSourceLabel, camerasOf } from './tracking'
import type { Device, Room } from '@/domain/types'

const dev = (id: string, type: Device['type'], roomId: string, online = true): Device => ({
  id,
  name: id,
  type,
  roomId,
  online,
  status: {},
})
const room = (id: string): Room => ({ id, name: id, kind: 'custom', polygon: [], devices: [], environment: { temperature: 26, humidity: 55, updatedAt: 0 } })

describe('tracking helpers', () => {
  it('roomHasDevice respects online flag', () => {
    const devices = [dev('c1', 'camera', 'r1'), dev('c2', 'camera', 'r2', false)]
    expect(roomHasDevice(devices, 'r1', 'camera')).toBe(true)
    expect(roomHasDevice(devices, 'r2', 'camera')).toBe(false)
    expect(roomHasDevice(devices, 'r3', 'camera')).toBe(false)
  })

  it('camerasOf returns only online cameras', () => {
    const devices = [dev('c1', 'camera', 'r1'), dev('s1', 'speaker', 'r1'), dev('c2', 'camera', 'r2', false)]
    expect(camerasOf(devices).map((d) => d.id)).toEqual(['c1'])
  })

  it('trackingSourceLabel maps sources', () => {
    expect(trackingSourceLabel(['camera', 'ble'])).toBe('视觉 + 项圈')
    expect(trackingSourceLabel(['ble', 'imu'])).toBe('项圈信号')
    expect(trackingSourceLabel(['ble'])).toBe('项圈信号')
  })

  it('handoffMessage covers no_camera and completed', () => {
    const a = room('客厅')
    const b = room('宠物房')
    expect(handoffMessage('no_camera', a, b)).toContain('宠物房')
    expect(handoffMessage('completed', a, b)).toContain('宠物房摄像头')
    expect(handoffMessage('lost', a, b)).toContain('客厅')
  })
})
