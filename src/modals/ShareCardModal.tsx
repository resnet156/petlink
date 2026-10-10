import { useEffect, useRef } from 'react'
import { useStore, currentRoom } from '@/store/useStore'
import { Modal } from '@/components/Modal'
import { drawShareCard } from '@/lib/shareCard'
import { relativeTime } from '@/lib/time'
import { blobToDataUrl, downscaleDataUrl } from '@/lib/image'

export function ShareCardModal() {
  const open = useStore((s) => s.modal === 'shareCard')
  const close = useStore((s) => s.closeModal)
  const pet = useStore((s) => s.pet)
  const lost = useStore((s) => s.lost)
  const room = useStore(currentRoom)
  const toast = useStore((s) => s.toast)
  const setPetPhoto = useStore((s) => s.setPetPhoto)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const lastRoom = useStore((s) => s.homeMap.rooms.find((r) => r.id === lost.lastRoomId)?.name) ?? room?.name ?? '家附近'
  const lastSeen = lost.lastUpdatedAt ? relativeTime(lost.lastUpdatedAt) : '刚刚'

  useEffect(() => {
    if (open && canvasRef.current)
      drawShareCard(canvasRef.current, {
        name: pet.name,
        species: pet.species,
        furColor: pet.furColor,
        collarColor: pet.collarColor,
        photo: pet.photo,
        lastRoom,
        lastSeen,
      })
  }, [open, pet.name, pet.species, pet.furColor, pet.collarColor, pet.photo, lastRoom, lastSeen])

  const onPickPhoto = async (file?: File) => {
    if (!file) return
    try {
      const raw = await blobToDataUrl(file)
      const small = await downscaleDataUrl(raw, 640, 0.8)
      setPetPhoto(pet.id, small)
      toast('success', `已更新${pet.name}的照片`)
    } catch {
      toast('error', '照片读取失败，请换一张')
    }
  }

  const download = () => {
    const c = canvasRef.current
    if (!c) return
    const a = document.createElement('a')
    a.download = `${pet.name}-寻宠卡片.png`
    a.href = c.toDataURL('image/png')
    a.click()
    toast('success', '寻宠卡片 PNG 已生成')
  }

  const share = async () => {
    const c = canvasRef.current
    if (!c) return
    if (navigator.share && typeof (navigator as any).canShare === 'function') {
      c.toBlob(async (blob) => {
        if (!blob) return
        const file = new File([blob], `${pet.name}-寻宠卡片.png`, { type: 'image/png' })
        try {
          await navigator.share({ files: [file], title: `帮我找找${pet.name}`, text: 'PetLink 走失互寻' })
        } catch {
          toast('info', '已取消分享')
        }
      })
    } else {
      toast('info', '当前浏览器不支持系统分享，已改为导出图片')
      download()
    }
  }

  return (
    <Modal open={open} onClose={close} title="寻宠卡片" eyebrow="SHARE LOST PET CARD" desc="依据宠物资料、照片与最近出现位置生成；适合分享至群聊、朋友圈或附近宠友社区。" testId="share-card-modal">
      <div className="flex justify-center rounded-[22px] bg-[#e6eeea] p-4">
        <canvas ref={canvasRef} width={720} height={960} className="h-auto w-[min(360px,100%)] rounded-[22px] bg-white shadow-soft" />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="share-photo-input"
        onChange={(e) => onPickPhoto(e.target.files?.[0])}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn" data-testid="share-upload-photo" onClick={() => fileRef.current?.click()}>📷 上传照片</button>
        {pet.photo && <button className="btn" onClick={() => { setPetPhoto(pet.id, undefined); toast('info', '已改用卡通形象') }}>用卡通形象</button>}
        <button className="btn btn-primary" onClick={download}>导出 PNG 图片</button>
        <button className="btn" onClick={share}>分享</button>
      </div>
    </Modal>
  )
}
