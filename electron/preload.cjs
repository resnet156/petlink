// 预加载脚本：在 contextIsolation 下安全暴露极简桥接给渲染进程
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('petlinkDesktop', {
  isElectron: true,
  close: () => ipcRenderer.send('mini:close'),
  toggleAlwaysOnTop: () => ipcRenderer.send('mini:toggle-top'),
  // 展开为完整应用 / 收起为桌面组件（同一窗口，store 不重载）
  expand: () => ipcRenderer.send('win:expand'),
  collapse: () => ipcRenderer.send('win:collapse'),
  // 退出整个程序
  quit: () => ipcRenderer.send('app:quit'),
})
