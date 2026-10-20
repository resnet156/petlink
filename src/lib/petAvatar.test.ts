import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { assertAnimatedRig, isPetAvatarUpdate, latestPetAvatarJob, rememberPetAvatarJob } from './petAvatar'

function sampleRig() {
  const file = readFileSync(resolve(process.cwd(), 'public/models/quaternius-shiba-chibi.glb'))
  return Uint8Array.from(file).buffer
}

describe('per-pet generated desktop avatar', () => {
  beforeEach(() => localStorage.clear())

  it('indexes each generated task under the corresponding pet without changing the app-store schema', () => {
    rememberPetAvatarJob('user:a:home:a', 'pet-dog', 'job-dog')
    rememberPetAvatarJob('user:a:home:a', 'pet-cat', 'job-cat')
    expect(latestPetAvatarJob('user:a:home:a', 'pet-dog')).toBe('job-dog')
    expect(latestPetAvatarJob('user:a:home:a', 'pet-cat')).toBe('job-cat')
    expect(latestPetAvatarJob('user:a:home:a', 'pet-unknown')).toBe('')
  })

  it('isolates generated jobs and update events across account and household switches', () => {
    rememberPetAvatarJob('user:a:home:a', 'pet-dog', 'job-a')
    rememberPetAvatarJob('user:b:home:b', 'pet-dog', 'job-b')
    expect(latestPetAvatarJob('user:a:home:a', 'pet-dog')).toBe('job-a')
    expect(latestPetAvatarJob('user:b:home:b', 'pet-dog')).toBe('job-b')
    expect(latestPetAvatarJob('user:a:home:shared', 'pet-dog')).toBe('')
    const event = new StorageEvent('storage', { key: 'petlink-pet-avatar-updated-v2', newValue: JSON.stringify({ scope: 'user:a:home:a', petId: 'pet-dog' }) })
    expect(isPetAvatarUpdate(event, 'user:a:home:a', 'pet-dog')).toBe(true)
    expect(isPetAvatarUpdate(event, 'user:b:home:b', 'pet-dog')).toBe(false)
  })

  it('accepts a real animated skinned GLB but rejects the same model with skin and clips removed', () => {
    const rig = sampleRig()
    expect(() => assertAnimatedRig(rig)).not.toThrow()
    const source = Buffer.from(rig)
    const oldJsonLength = source.readUInt32LE(12)
    const document = JSON.parse(source.toString('utf8', 20, 20 + oldJsonLength)) as Record<string, unknown>
    delete document.skins
    delete document.animations
    const json = Buffer.from(JSON.stringify(document))
    const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)])
    const staticModel = Buffer.alloc(20 + padded.length + source.length - 20 - oldJsonLength)
    source.copy(staticModel, 0, 0, 12)
    staticModel.writeUInt32LE(staticModel.length, 8)
    staticModel.writeUInt32LE(padded.length, 12)
    staticModel.writeUInt32LE(0x4e4f534a, 16)
    padded.copy(staticModel, 20)
    source.copy(staticModel, 20 + padded.length, 20 + oldJsonLength)
    expect(() => assertAnimatedRig(Uint8Array.from(staticModel).buffer)).toThrow(/骨骼或动画/)
  })
})
