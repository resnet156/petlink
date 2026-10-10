import { useState } from 'react'
import { useStore, currentRoom } from '@/store/useStore'
import { roomHasDevice } from '@/lib/tracking'

/** 环境联动建议卡：进入房间读取该房间环境 → 判断 → 建议 → 用户确认 */
export function SuggestionCard() {
  const room = useStore(currentRoom)
  const rules = useStore((s) => s.rules)
  const devices = useStore((s) => s.devices)
  const turnOnAC = useStore((s) => s.turnOnAC)
  const toast = useStore((s) => s.toast)
  const [dismissed, setDismissed] = useState<string>('')

  if (!room) return null
  const env = room.environment
  const tempRule = rules.find((r) => r.trigger === 'temp_above' && r.enabled)
  const humidRule = rules.find((r) => r.trigger === 'humidity_above' && r.enabled)
  const tempHigh = tempRule && env.temperature >= (tempRule.threshold ?? 29)
  const humidHigh = humidRule && env.humidity >= (humidRule.threshold ?? 75)
  if (!tempHigh && !humidHigh) return null

  // 环境签名，环境变化后重新提示
  const sig = `${room.id}:${env.temperature}:${env.humidity}`
  if (dismissed === sig) return null

  const hasAC = roomHasDevice(devices, room.id, 'ac')

  return (
    <div
      data-testid="suggestion-card"
      className="animate-pop absolute left-4 right-4 top-4 z-[8] flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-[#f1dcc4] bg-orange-soft/95 px-4 py-3 shadow-softsm backdrop-blur"
    >
      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-orange" />
      <div className="min-w-0 flex-1 text-xs leading-relaxed text-[#8b623f]">
        <b>{room.name}环境需要关注</b> · {env.temperature.toFixed(1)}℃ / 湿度 {env.humidity}%，建议空调设为 26℃
        {!hasAC && <span className="text-orange">（该房间无空调，将调用最近房间）</span>}
      </div>
      <div className="flex gap-2">
        <button
          className="btn btn-primary"
          onClick={() => {
            void turnOnAC(room.id)
            setDismissed(sig)
          }}
        >
          开启空调
        </button>
        <button
          className="btn"
          onClick={() => {
            toast('info', '已暂缓本次环境提醒')
            setDismissed(sig)
          }}
        >
          稍后
        </button>
      </div>
    </div>
  )
}
