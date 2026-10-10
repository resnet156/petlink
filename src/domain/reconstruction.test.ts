import { describe, expect, it } from 'vitest'
import { artifactUrl, parseJobs, parseLayout, validateMedia } from './reconstruction'

const image = (size = 1024) => ({ name: 'room.jpg', type: 'image/jpeg', size })
const video = (size = 1024) => ({ name: 'pet.mp4', type: 'video/mp4', size })

describe('reconstruction upload boundaries', () => {
  it('supports all four entry types, with multiple room photos and one video', () => {
    expect(() => validateMedia([image()], 'pet', 'image')).not.toThrow()
    expect(() => validateMedia([video()], 'pet', 'video')).not.toThrow()
    expect(() => validateMedia([image(), image()], 'room', 'image')).not.toThrow()
    expect(() => validateMedia([video()], 'room', 'video')).not.toThrow()
    expect(() => validateMedia([video(), video()], 'room', 'video')).toThrow(/一个视频/)
    expect(() => validateMedia([image(), image()], 'pet', 'image')).toThrow(/一张/)
  })
  it('rejects mismatched media and per-file or total size overflow before upload', () => {
    expect(() => validateMedia([video()], 'pet', 'image')).toThrow()
    expect(() => validateMedia([image(16 * 1024 * 1024)], 'room', 'image')).toThrow(/15 MB/)
    expect(() => validateMedia([video(101 * 1024 * 1024)], 'room', 'video')).toThrow(/100 MB/)
    expect(() => validateMedia(Array.from({ length: 11 }, () => image(15 * 1024 * 1024)), 'room', 'image')).toThrow(/150 MB/)
    expect(() => validateMedia([image(0)], 'room', 'image')).toThrow(/空文件/)
  })
  it('never sends artifact bearer credentials outside the current service', () => {
    expect(artifactUrl('/petlink/api/jobs/123/artifacts/model.glb', 'https://example.com', '/petlink/')).toBe('https://example.com/petlink/api/jobs/123/artifacts/model.glb')
    expect(() => artifactUrl('https://other.com/petlink/api/jobs/123/a', 'https://example.com', '/petlink/')).toThrow()
    expect(() => artifactUrl('/another-app/file', 'https://example.com', '/petlink/')).toThrow()
    expect(() => artifactUrl('/petlink/api/jobs/../../admin', 'https://example.com', '/petlink/')).toThrow()
  })
})

describe('server generated evidence', () => {
  it('preserves relative units and limitations instead of inventing measured dimensions', () => {
    const layout = parseLayout({ version: 1, unit: 'relative', method: 'depth-model', rooms: [{ name: 'Visible area', polygon: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }] }], limitations: ['No metric scale'] })
    expect(layout.unit).toBe('relative')
    expect(layout.rooms[0].height).toBeUndefined()
    expect(layout.limitations).toEqual(['No metric scale'])
    expect(() => parseLayout({ ...layout, unit: undefined })).toThrow(/单位/)
    expect(() => parseLayout({ ...layout, rooms: [{ polygon: [{ x: NaN, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }] })).toThrow(/坐标/)
  })
  it('reads actual worker availability and rejects fabricated statuses', () => {
    const response = parseJobs({ jobs: [{ id: 'one', kind: 'pet', status: 'queued', stage: 'Waiting for worker', createdAt: 1000, updatedAt: 1000 }], worker: { online: false, capabilities: [] } })
    expect(response.jobs[0].status).toBe('queued')
    expect(response.worker?.online).toBe(false)
    expect(() => parseJobs({ jobs: [{ id: 'two', kind: 'pet', status: 'magic-ready', stage: '' }] })).toThrow()
  })
})
