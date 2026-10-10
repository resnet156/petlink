import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { Modal } from '@/components/Modal'
import { EditorCanvas } from './EditorCanvas'
import { InspectorPanel } from './InspectorPanel'
import { useMapEditor } from './useMapEditor'
import { seedHomeMap } from '@/domain/seed'
import { clone } from '@/domain/geometry'
import { downscaleDataUrl } from '@/lib/image'
import { FURNITURE_PALETTE, FURNITURE_META } from '@/components/map/furnitureLib'

type Tab = 'upload' | 'draw' | 'scan' | 'bind'
const MAX_IMG = 8 * 1024 * 1024

export function MapBuilderModal() {
  const open = useStore((s) => s.modal === 'mapBuilder')
  const close = useStore((s) => s.closeModal)
  const homeMap = useStore((s) => s.homeMap)
  const applyHomeMap = useStore((s) => s.applyHomeMap)
  const toast = useStore((s) => s.toast)

  const editor = useMapEditor()
  const [tab, setTab] = useState<Tab>('draw')
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null)
  const [bgDataUrl, setBgDataUrl] = useState<string | undefined>(undefined)
  const [mapName, setMapName] = useState(homeMap.name)
  const [scanPct, setScanPct] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const scanTimer = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      editor.load(homeMap.rooms)
      setMapName(homeMap.name)
      setTab('draw')
      // 载入已同步的底图（跨设备编辑可见）
      setBgDataUrl(homeMap.backgroundImage)
      if (homeMap.backgroundImage) {
        const img = new Image()
        img.onload = () => setBgImage(img)
        img.src = homeMap.backgroundImage
      } else {
        setBgImage(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onUpload = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('error', '仅支持 JPG / PNG 图片')
    if (file.size > MAX_IMG) return toast('error', '图片太大（>8MB），请压缩后再上传')
    const reader = new FileReader()
    reader.onload = async () => {
      const raw = reader.result as string
      // 降采样后作为底图，随快照云端同步
      const scaled = await downscaleDataUrl(raw, 1280, 0.72)
      const img = new Image()
      img.onload = () => setBgImage(img)
      img.src = scaled
      setBgDataUrl(scaled)
      toast('success', '户型图已载入，请在“手绘户型”上逐个校准房间后应用')
      setTab('draw')
    }
    reader.onerror = () => toast('error', '图片读取失败，请重试')
    reader.readAsDataURL(file)
  }

  const startScan = () => {
    if (scanTimer.current) window.clearInterval(scanTimer.current)
    setScanPct(12)
    scanTimer.current = window.setInterval(() => {
      setScanPct((p) => {
        const n = p + Math.floor(Math.random() * 13) + 8
        if (n >= 100) {
          window.clearInterval(scanTimer.current!)
          editor.load(clone(seedHomeMap().rooms))
          toast('success', '家庭空间扫描完成，已生成可编辑户型，正在进入校准')
          setTab('draw')
          return 100
        }
        return n
      })
    }, 400)
  }

  const apply = () => {
    if (!editor.rooms.length) return toast('error', '请至少创建一个房间')
    const names = new Set<string>()
    for (const r of editor.rooms) {
      if (!r.name.trim()) return toast('error', '存在未命名房间')
      if (r.polygon.length < 3) return toast('error', `房间「${r.name}」顶点少于 3 个`)
      if (names.has(r.name.trim())) return toast('error', `房间名称重复：${r.name}`)
      names.add(r.name.trim())
    }
    applyHomeMap(editor.rooms, mapName, bgDataUrl)
    close()
    useStore.getState().goPage('map')
  }

  return (
    <Modal open={open} onClose={close} wide eyebrow="CREATE HOME MAP" title="创建 / 编辑家庭地图" desc="支持上传户型图、手绘、空间扫描，并绑定各房间设备。" testId="map-builder-modal">
      <div className="mb-3.5 flex gap-1.5 rounded-2xl bg-[#eef3f0] p-1.5">
        {(['upload', 'draw', 'scan', 'bind'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-xl px-3.5 py-2 text-xs font-bold ${tab === t ? 'bg-white text-teal shadow-softsm' : 'text-[#72817c]'}`}>
            {{ upload: '上传户型', draw: '手绘户型', scan: '空间扫描', bind: '绑定设备' }[t]}
          </button>
        ))}
      </div>

      {tab === 'upload' && (
        <div>
          <button onClick={() => fileRef.current?.click()} className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-[#cedbd5] bg-[#f7faf8] p-6 text-center">
            <div className="text-4xl">⌗</div>
            <b className="mt-2">上传家庭户型图</b>
            <p className="text-xs text-muted">支持 JPG / PNG（≤8MB）。上传后进入手绘校准房间。</p>
            {bgImage && <img src={bgImage.src} alt="户型图预览" className="mt-3 max-h-40 rounded-xl" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
        </div>
      )}

      {tab === 'draw' && (
        <div className="grid grid-cols-[minmax(0,1fr)_290px] gap-3.5 max-[900px]:grid-cols-1">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <button className={`btn ${editor.tool === 'rect' ? 'btn-primary' : ''}`} onClick={() => editor.setTool('rect')}>▭ 拖拽画房间</button>
              <button className={`btn ${editor.tool === 'poly' ? 'btn-primary' : ''}`} onClick={() => editor.setTool('poly')}>⌁ 自由多边形</button>
              <button className={`btn ${editor.tool === 'select' ? 'btn-primary' : ''}`} onClick={() => editor.setTool('select')}>↖ 调整布局</button>
              <button className={`btn ${editor.tool === 'furniture' ? 'btn-primary' : ''}`} data-testid="tool-furniture" onClick={() => editor.setTool('furniture')}>🛋 布置家具</button>
              <button className="btn" onClick={() => editor.load(homeMap.rooms)}>↺ 载入当前</button>
              <button className="btn" onClick={editor.undo}>↶ 撤销</button>
              <button className="btn" onClick={editor.redo}>↷ 重做</button>
            </div>
            {editor.tool === 'furniture' && (
              <div className="mb-2 rounded-xl border border-[#dbe7e1] bg-[#f4f8f6] p-2.5">
                {editor.selected < 0 ? (
                  <div className="text-[11px] text-muted">先在上方「调整布局」选中一个房间，再回到这里布置家具。</div>
                ) : (
                  <>
                    <div className="mb-1.5 text-[11px] text-muted">点击家具拖动摆放；拖右下角手柄缩放；选中后可旋转/删除；从下方添加。</div>
                    <div className="flex flex-wrap gap-1.5">
                      {FURNITURE_PALETTE.map((t) => (
                        <button key={t} className="rounded-lg border border-line bg-white px-2 py-1 text-[11px] hover:border-teal-2" onClick={() => editor.addFurniture(t)}>
                          ＋ {FURNITURE_META[t].label}
                        </button>
                      ))}
                    </div>
                    {editor.selectedFurn >= 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[#dbe7e1] pt-2">
                        <button className="btn !py-1.5 !text-[11px]" onClick={() => editor.resizeFurn(1.12, 1)}>宽+</button>
                        <button className="btn !py-1.5 !text-[11px]" onClick={() => editor.resizeFurn(0.9, 1)}>宽-</button>
                        <button className="btn !py-1.5 !text-[11px]" onClick={() => editor.resizeFurn(1, 1.12)}>高+</button>
                        <button className="btn !py-1.5 !text-[11px]" onClick={() => editor.resizeFurn(1, 0.9)}>高-</button>
                        <button className="btn !py-1.5 !text-[11px]" onClick={() => editor.rotateFurn(-45)}>↺ 旋转</button>
                        <button className="btn !py-1.5 !text-[11px]" onClick={() => editor.rotateFurn(45)}>↻ 旋转</button>
                        <button className="btn btn-red !py-1.5 !text-[11px]" data-testid="furn-delete" onClick={editor.deleteFurn}>删除家具</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <EditorCanvas editor={editor} bgImage={bgImage} />
            <div className="mt-2 flex gap-1.5">
              <button className="btn" disabled={editor.polyDraft.length < 3} onClick={() => editor.finishPoly()}>完成当前自由形状</button>
              <button className="btn" onClick={() => editor.setPolyDraft([])}>取消形状</button>
              <input className="field ml-auto max-w-[160px]" value={mapName} onChange={(e) => setMapName(e.target.value)} aria-label="地图名称" />
            </div>
            <p className="mt-2 rounded-xl bg-[#eef6f2] px-3 py-2 text-[11px] leading-relaxed text-[#60746c]">
              矩形：拖拽创建；自由形状：依次点击顶点后双击完成；调整布局：拖动房间移动、拖动绿色顶点改形状。所有房间都可单独重命名 / 改顶点 / 删除。
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <InspectorPanel editor={editor} />
            <button className="btn w-full" onClick={editor.clear}>清空全部</button>
            <button data-testid="apply-map" className="btn btn-primary w-full" onClick={apply}>应用到实时地图</button>
          </div>
        </div>
      )}

      {tab === 'scan' && (
        <div>
          <div className="relative grid h-[300px] place-items-center overflow-hidden rounded-[22px] bg-[#173831] text-[#cfe9e1]">
            {scanPct > 0 && scanPct < 100 && <div className="scan-line absolute left-[10%] right-[10%] h-0.5 bg-[#84d6bf] shadow-[0_0_18px_#84d6bf]" />}
            <div className="z-[2] text-center">
              <div className="text-4xl">⌗</div>
              <b>模拟扫描家庭空间</b>
              <div className="mt-2 text-xs opacity-70">缓慢移动手机，覆盖墙面与房间入口</div>
            </div>
            <div className="absolute bottom-5 left-5 right-5 h-1.5 overflow-hidden rounded-full bg-white/15">
              <i className="block h-full rounded-full bg-[#84d6bf] transition-all" style={{ width: `${scanPct}%` }} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button className="btn btn-primary" onClick={startScan}>开始模拟扫描</button>
            <span className="text-xs text-muted">扫描完成后生成简化房间，进入手绘校准。</span>
          </div>
        </div>
      )}

      {tab === 'bind' && <BindPane />}
    </Modal>
  )
}

function BindPane() {
  const devices = useStore((s) => s.devices)
  const rooms = useStore((s) => s.homeMap.rooms)
  const bind = useStore((s) => s.bindDeviceToRoom)
  const close = useStore((s) => s.closeModal)
  const toast = useStore((s) => s.toast)
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 max-[640px]:grid-cols-1">
        {devices.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#eef5f2]">▦</div>
            <div className="min-w-0 flex-1">
              <b className="block truncate text-sm">{d.name}</b>
              <select className="field mt-1 !py-1.5 text-[11px]" value={d.roomId} onChange={(e) => bind(d.id, e.target.value)}>
                {rooms.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
              </select>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <button className="btn btn-primary" onClick={() => { toast('success', '设备与房间绑定已保存'); close() }}>完成绑定</button>
      </div>
    </div>
  )
}
