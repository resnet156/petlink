import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// Electron 桌面组件构建：资源用相对路径（file:// 加载）
const isElectron = process.env.VITE_ELECTRON === '1'
const basePath = process.env.VITE_BASE_PATH || '/'

export default defineConfig({
  base: isElectron ? './' : basePath,
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'PetLink · 小度全屋宠物陪伴',
        short_name: 'PetLink',
        description: '把真实宠物变成家庭地图里的实时数字 Avatar：随时看它、叫它、陪它。',
        theme_color: '#2e7f75',
        background_color: '#eef3ef',
        display: 'standalone',
        orientation: 'portrait',
        start_url: basePath,
        scope: basePath,
        lang: 'zh-CN',
        icons: [
          { src: `${basePath}icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${basePath}icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${basePath}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
} as any)
