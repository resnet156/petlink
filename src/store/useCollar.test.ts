import { beforeEach, describe, expect, it } from 'vitest'
import { applyCollarActivity, useCollar } from './useCollar'
import { useStore } from './useStore'

const device = { deviceId: 'capsule-01', firmware: 'test', source: 'wifi', sampleRate: 20, receivedAt: 1, sequence: 1 }

describe('collar-to-pet binding', () => {
  beforeEach(() => {
    useStore.getState().resetDemo()
    useCollar.setState({ token: '', live: { device, latest: null, events: [], online: true }, phase: 'locked', boundPetId: null })
  })

  it('does not overwrite demo behavior without a viewer token and explicit binding', () => {
    const before = useStore.getState().pets.map((pet) => pet.behavior)
    applyCollarActivity(device.deviceId, 'unknown')
    expect(useStore.getState().pets.map((pet) => pet.behavior)).toEqual(before)
    useCollar.setState({ token: 'viewer' })
    applyCollarActivity(device.deviceId, 'run')
    expect(useStore.getState().pets.map((pet) => pet.behavior)).toEqual(before)
  })

  it('updates only the pet paired to the matching device, regardless of the active pet', () => {
    const [first, second] = useStore.getState().pets
    useStore.getState().setActivePet(first.id)
    const before = useStore.getState().pet.behavior
    useCollar.setState({ token: 'viewer', phase: 'connected', boundPetId: second.id })
    applyCollarActivity('other-device', 'run', 123)
    expect(useStore.getState().pets.find((pet) => pet.id === second.id)?.behavior).toBe(second.behavior)
    applyCollarActivity(device.deviceId, 'run', 123)
    expect(useStore.getState().pets.find((pet) => pet.id === second.id)?.behavior).toBe('running')
    expect(useStore.getState().pets.find((pet) => pet.id === first.id)?.behavior).toBe(before)
    expect(useStore.getState().pet.id).toBe(first.id)
    expect(useStore.getState().pet.behavior).toBe(before)
  })
})
