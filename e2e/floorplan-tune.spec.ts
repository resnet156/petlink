import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 户型识别调参专用诊断用例（不参与常规回归）。
 * 用法：把真实户型图保存为 e2e/fixtures/floorplan-real.png（或 .jpg），
 * 然后运行：  npx playwright test floorplan-tune
 * 它会：上传该图 → 自动识别 → 打印识别到的房间数 → 把带房间叠加的
 * 编辑器画布截图写到 e2e/fixtures/_detect-result.png 供人工核对对齐/完整性。
 * 若文件不存在则跳过（避免影响 CI）。
 */

const FIX = path.join(process.cwd(), 'e2e', 'fixtures')
const CANDIDATES = ['floorplan-real.png', 'floorplan-real.jpg', 'floorplan-real.jpeg', 'floorplan-real.webp']

function findFixture(): string | null {
  for (const name of CANDIDATES) {
    const p = path.join(FIX, name)
    if (fs.existsSync(p)) return p
  }
  return null
}

const gotoFresh = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
}

test('户型识别调参：真实户型图识别结果诊断', async ({ page }) => {
  const file = findFixture()
  test.skip(!file, '未找到 e2e/fixtures/floorplan-real.(png|jpg)，跳过调参用例')
  const mime = file!.endsWith('.jpg') || file!.endsWith('.jpeg') ? 'image/jpeg' : file!.endsWith('.webp') ? 'image/webp' : 'image/png'
  const buf = fs.readFileSync(file!)

  await gotoFresh(page)
  page.on('console', (m) => { const t = m.text(); if (t.startsWith('[FP]')) console.log(t) })
  await page.evaluate(() => { (globalThis as unknown as { __FP_DEBUG?: boolean }).__FP_DEBUG = true })
  await page.getByTestId('nav-map').click()
  await page.getByTestId('edit-map-btn').click()
  await expect(page.getByTestId('map-builder-modal')).toBeVisible()
  await page.getByRole('button', { name: '上传户型' }).click()
  await page.getByTestId('upload-floorplan-input').setInputFiles({ name: path.basename(file!), mimeType: mime, buffer: buf })

  // 等待墙体参考层生成（ML 模型首次需下载~24MB+推理，放宽到 60s），再截编辑器画布
  await expect(page.getByTestId('editor-canvas')).toBeVisible({ timeout: 60000 })
  await page.waitForTimeout(4000)
  // eslint-disable-next-line no-console
  console.log(`[floorplan-tune] 自动生成房间数 = ${await page.getByTestId('room-row').count()}`)

  const canvas = page.getByTestId('editor-canvas')
  if (await canvas.count()) {
    await canvas.first().screenshot({ path: path.join(FIX, '_detect-result.png') })
    // eslint-disable-next-line no-console
    console.log(`[floorplan-tune] 已保存墙体参考层叠加截图 -> e2e/fixtures/_detect-result.png`)

    // 模拟"拖拽画房间"验证吸附：在画布中部斜拉一个矩形，截图看是否贴齐墙线
    await page.getByRole('button', { name: '拖拽画房间' }).click().catch(() => {})
    const box = await canvas.first().boundingBox()
    if (box) {
      const x0 = box.x + box.width * 0.42, y0 = box.y + box.height * 0.5
      const x1 = box.x + box.width * 0.62, y1 = box.y + box.height * 0.82
      await page.mouse.move(x0, y0); await page.mouse.down()
      await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 5 })
      await page.mouse.move(x1, y1, { steps: 5 }); await page.mouse.up()
      await page.waitForTimeout(300)
      await canvas.first().screenshot({ path: path.join(FIX, '_snap-test.png') })
      // eslint-disable-next-line no-console
      console.log('[floorplan-tune] 已保存吸附测试截图 -> e2e/fixtures/_snap-test.png')
    }
  }

  expect(await canvas.count()).toBeGreaterThan(0)
})
