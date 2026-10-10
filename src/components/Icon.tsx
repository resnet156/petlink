import {
  Home,
  Radar,
  ClipboardList,
  UserRound,
  Bell,
  Map,
  Cloud,
  LogIn,
  Settings,
  Utensils,
  Search,
  Eye,
  Shield,
  Flag,
  Mic,
  MessageCircle,
  Users,
  Zap,
  Cpu,
  Volume2,
  Video,
  Sparkles,
  Camera,
  BookHeart,
  MonitorDown,
  type LucideIcon,
} from 'lucide-react'

// 统一线性图标：语义名 → lucide 图标。emoji 仅保留在宠物表情 / 设备类型展示。
const MAP: Record<string, LucideIcon> = {
  home: Home,
  map: Radar,
  records: ClipboardList,
  me: UserRound,
  bell: Bell,
  mapManage: Map,
  cloud: Cloud,
  login: LogIn,
  settings: Settings,
  feed: Utensils,
  find: Search,
  peek: Eye,
  fence: Shield,
  lost: Flag,
  voice: Mic,
  chat: MessageCircle,
  friends: Users,
  automation: Zap,
  devices: Cpu,
  call: Volume2,
  video: Video,
  play: Sparkles,
  camera: Camera,
  diary: BookHeart,
  desktop: MonitorDown,
}

export function Icon({
  name,
  size = 20,
  className,
  strokeWidth = 1.9,
}: {
  name: keyof typeof MAP
  size?: number
  className?: string
  strokeWidth?: number
}) {
  const C = MAP[name] ?? Home
  return <C size={size} className={className} strokeWidth={strokeWidth} aria-hidden />
}

export type IconName = keyof typeof MAP
