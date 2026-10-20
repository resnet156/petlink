import type { DeviceType } from '@/domain/types'

// 小度 / 智能家居产品风格的设备图标（SVG，画在地图坐标系中，约 ±16 单位）。
// 摄像头/音箱/智能屏对应小度实际产品形态；其余为统一风格的智能家居图标。
const INK = '#33463f'
const TEAL = '#2e7f75'
const TEALSOFT = '#cfe8e0'

function Camera() {
  // 小度智能摄像头：枪机机身 + 镜头筒 + 支架
  return (
    <g>
      <path d="M-11 12 L-11 6 L-5 6" fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <rect x={-12} y={-7} width={18} height={14} rx={6} fill="#ffffff" stroke={INK} strokeWidth={1.5} />
      <rect x={-9} y={-7} width={4} height={14} rx={2} fill="#eef4f1" />
      <circle cx={8} cy={0} r={6.5} fill="#20302c" stroke={INK} strokeWidth={1} />
      <circle cx={8} cy={0} r={3.2} fill={TEAL} />
      <circle cx={9.6} cy={-1.6} r={1.1} fill="#eafff8" />
      <circle cx={-7} cy={-4} r={1.2} fill="#d9574f" />
    </g>
  )
}

function Speaker() {
  // 小度智能音箱 Play：圆柱 + 底部灯环
  return (
    <g>
      <rect x={-8} y={-12} width={16} height={23} rx={8} fill="#ffffff" stroke={INK} strokeWidth={1.4} />
      <ellipse cx={0} cy={-12} rx={8} ry={2.6} fill="#eef4f1" stroke={INK} strokeWidth={1} />
      <rect x={-8} y={5} width={16} height={4} rx={2} fill={TEAL} />
      <circle cx={-3} cy={-3} r={0.9} fill="#c3d2cb" />
      <circle cx={0} cy={-3} r={0.9} fill="#c3d2cb" />
      <circle cx={3} cy={-3} r={0.9} fill="#c3d2cb" />
    </g>
  )
}

function SmartScreen() {
  // 小度在家智能屏：带楔形底座的屏幕
  return (
    <g>
      <path d="M-11 7 L11 7 L8 13 L-8 13 Z" fill="#c3d2cb" />
      <rect x={-13} y={-11} width={26} height={19} rx={3} fill="#ffffff" stroke={INK} strokeWidth={1.4} />
      <rect x={-10} y={-8} width={20} height={13} rx={1.6} fill={TEALSOFT} />
      <circle cx={0} cy={-1.5} r={3} fill={TEAL} />
    </g>
  )
}

function Feeder() {
  // 智能喂食器：料仓 + 出粮碗
  return (
    <g>
      <path d="M-9 -12 L9 -12 L6 4 L-6 4 Z" fill="#ffffff" stroke={INK} strokeWidth={1.4} />
      <rect x={-7} y={-12} width={14} height={3} rx={1.5} fill={TEAL} />
      <ellipse cx={0} cy={9} rx={11} ry={4} fill="#dfe9e4" stroke={INK} strokeWidth={1.2} />
      <ellipse cx={0} cy={8} rx={6} ry={2} fill="#c7b48f" />
    </g>
  )
}

function Water() {
  // 智能饮水器：底座 + 水流
  return (
    <g>
      <ellipse cx={0} cy={10} rx={12} ry={4} fill="#dfe9e4" stroke={INK} strokeWidth={1.2} />
      <path d="M-7 10 q7 -22 7 -22 q0 0 7 22" fill="#ffffff" stroke={INK} strokeWidth={1.4} />
      <path d="M-3 6 q3 3 6 0" fill="none" stroke="#5aa6e0" strokeWidth={1.6} />
      <circle cx={0} cy={-9} r={2} fill="#eafff8" stroke={INK} strokeWidth={0.8} />
    </g>
  )
}

function AC() {
  // 空调室内机：长条 + 出风格栅
  return (
    <g>
      <rect x={-15} y={-7} width={30} height={13} rx={5} fill="#ffffff" stroke={INK} strokeWidth={1.4} />
      <line x1={-11} y1={2} x2={11} y2={2} stroke="#aebfb8" strokeWidth={1.4} />
      <line x1={-11} y1={5} x2={11} y2={5} stroke="#aebfb8" strokeWidth={1.4} />
      <circle cx={11} cy={-3} r={1.2} fill={TEAL} />
    </g>
  )
}

function Sensor() {
  // 温湿度传感器：圆角方块 + 温度/湿度符号
  return (
    <g>
      <rect x={-10} y={-10} width={20} height={20} rx={5} fill="#ffffff" stroke={INK} strokeWidth={1.4} />
      <path d="M-3 -5 v7 a3 3 0 1 0 2 0 v-7 a1 1 0 0 0 -2 0 Z" fill="none" stroke="#d9574f" strokeWidth={1.3} />
      <path d="M5 -4 q3 4 0 7 q-3 -3 0 -7 Z" fill="#5aa6e0" />
    </g>
  )
}

function Toy() {
  return (
    <g>
      <circle cx={0} cy={0} r={9} fill="#ffffff" stroke={INK} strokeWidth={1.4} />
      <path d="M0 -9 V9 M-9 0 H9" stroke={TEAL} strokeWidth={1.6} />
    </g>
  )
}

const GLYPH: Record<DeviceType, () => JSX.Element> = {
  camera: Camera,
  speaker: Speaker,
  smart_screen: SmartScreen,
  feeder: Feeder,
  water: Water,
  ac: AC,
  temp_humidity: Sensor,
  toy: Toy,
}

export function DeviceGlyph({ type }: { type: DeviceType }) {
  const C = GLYPH[type] ?? Toy
  return <C />
}
