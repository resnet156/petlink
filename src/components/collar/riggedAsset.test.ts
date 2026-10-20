import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('bundled Q Shiba asset', () => {
  it('contains a self-contained 46-joint rig with the three motion clips used by the collar', () => {
    const file = readFileSync(resolve(process.cwd(), 'public/models/quaternius-shiba-chibi.glb'))
    expect(file.toString('ascii', 0, 4)).toBe('glTF')
    expect(file.readUInt32LE(8)).toBe(file.length)
    const jsonLength = file.readUInt32LE(12)
    const json = JSON.parse(file.toString('utf8', 20, 20 + jsonLength)) as {
      skins: Array<{ joints: number[] }>
      animations: Array<{ name: string }>
      buffers: Array<{ uri?: string }>
      images?: Array<{ uri?: string }>
    }
    expect(json.skins).toHaveLength(1)
    expect(json.skins[0].joints).toHaveLength(46)
    expect(json.animations.map((clip) => clip.name)).toEqual(expect.arrayContaining(['Idle', 'Walk', 'Gallop']))
    expect(json.animations).toHaveLength(12)
    expect(json.buffers.every((buffer) => !buffer.uri)).toBe(true)
    expect((json.images ?? []).every((image) => !image.uri)).toBe(true)
  })
})
