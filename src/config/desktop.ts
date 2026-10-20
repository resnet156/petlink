// 桌面组件（Electron 原生客户端）发布配置。
// 安装包由 CI 在打 tag（v*）时用 electron-builder 构建并发布到 GitHub Releases，
// artifactName 固定，因此可用 /releases/latest/download/<固定名> 作为稳定下载地址。
const OWNER = 'barneyyyy99'
const REPO = 'petlink'
const BASE = `https://github.com/${OWNER}/${REPO}`

export const DESKTOP_RELEASE = {
  owner: OWNER,
  repo: REPO,
  /** 首个安装包发布后置为 true：下载按钮改为直链下载，否则引导到发布页 */
  published: true,
  mac: `${BASE}/releases/latest/download/PetLink-Desktop-mac.dmg`,
  win: `${BASE}/releases/latest/download/PetLink-Desktop-win.exe`,
  linux: `${BASE}/releases/latest/download/PetLink-Desktop-linux.AppImage`,
  /** 所有版本列表页（无论是否已发布都存在） */
  releasesPage: `${BASE}/releases`,
}

export type DesktopOS = 'mac' | 'win' | 'linux'

/** 粗略识别当前操作系统，用于高亮对应平台的下载按钮 */
export function detectOS(): DesktopOS {
  if (typeof navigator === 'undefined') return 'win'
  const ua = `${navigator.userAgent} ${navigator.platform}`.toLowerCase()
  if (ua.includes('mac')) return 'mac'
  if (ua.includes('linux') && !ua.includes('android')) return 'linux'
  return 'win'
}

export const OS_LABEL: Record<DesktopOS, string> = {
  mac: 'macOS (.dmg)',
  win: 'Windows (.exe)',
  linux: 'Linux (.AppImage)',
}
