import { useStore } from '@/store/useStore'
import { LiveMap } from '@/components/map/LiveMap'
import { SuggestionCard } from '@/components/map/SuggestionCard'
import { CameraFloat } from '@/components/map/CameraFloat'
import { MapSidePanel } from '@/components/map/MapSidePanel'
import type { MapMode } from '@/store/useStore'

const MODES: { key: MapMode; label: string }[] = [
  { key: 'live', label: '实时' },
  { key: 'history', label: '历史' },
  { key: 'devices', label: '设备' },
]

export function MapPage() {
  const mapMode = useStore((s) => s.mapMode)
  const setMapMode = useStore((s) => s.setMapMode)
  const pet = useStore((s) => s.pet)
  const openModal = useStore((s) => s.openModal)
  const toggleDrawer = useStore((s) => s.toggleDrawer)

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[620px] flex-col gap-3.5 max-[1000px]:h-auto max-[1000px]:min-h-0">
      <div className="flex items-center justify-between gap-3 max-[700px]:flex-col max-[700px]:items-stretch">
        <div className="flex items-center gap-3">
          <div>
            <div className="eyebrow">REAL-TIME HOME MAP</div>
            <div className="mt-0.5 text-xl font-extrabold max-[700px]:text-lg">我的家 · {pet.name}实时地图</div>
          </div>
          <span className="badge">● 实时追踪</span>
        </div>
        <div className="flex items-center gap-2.5 max-[700px]:w-full">
          <div className="flex rounded-2xl bg-[#e4ebe7] p-1 max-[700px]:flex-1">
            {MODES.map((m) => (
              <button
                key={m.key}
                data-testid={`map-mode-${m.key}`}
                onClick={() => {
                  setMapMode(m.key)
                  if (m.key === 'history') toggleDrawer(true)
                }}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition max-[700px]:flex-1 ${
                  mapMode === m.key ? 'bg-white text-teal shadow-softsm' : 'text-[#6f817b]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button className="btn whitespace-nowrap" data-testid="map-fence-btn" onClick={() => openModal('fence')}>
            围栏
          </button>
          <button className="btn whitespace-nowrap" data-testid="edit-map-btn" onClick={() => openModal('mapBuilder')}>
            编辑户型
          </button>
        </div>
      </div>

      {/* PC：地图主体 + 右侧固定信息面板；窄屏：地图在上、面板在下 */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_340px] gap-4 max-[1000px]:grid-cols-1">
        <div className="relative flex min-h-0 items-center justify-center max-[1000px]:min-h-[48vh]">
          <LiveMap />
          {mapMode === 'live' && <SuggestionCard />}
          <CameraFloat />
        </div>
        <aside className="min-h-0 overflow-auto max-[1000px]:overflow-visible">
          <MapSidePanel />
        </aside>
      </div>
    </div>
  )
}
