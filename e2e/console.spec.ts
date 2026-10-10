import { test, expect, type ConsoleMessage } from '@playwright/test'

test('全流程点击无 console error / pageerror', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

  await page.goto('/')
  await expect(page.getByTestId('nav-home')).toBeVisible()

  // 遍历四个主页面
  for (const p of ['map', 'records', 'me', 'home'] as const) {
    await page.getByTestId(`nav-${p}`).click()
    await page.waitForTimeout(150)
  }

  // 打开我的页面里的各弹层
  await page.getByTestId('nav-me').click()
  const modals = ['家庭地图', '虚拟栅栏', '走失互寻', '主人声音', '宠物对话框', '毛茸茸好友', '全屋自动联动', '设备管理']
  for (const name of modals) {
    await page.getByRole('button', { name: new RegExp(name) }).click()
    await page.waitForTimeout(120)
    await page.keyboard.press('Escape').catch(() => {})
    // 通过点击遮罩关闭
    await page.mouse.click(5, 5)
    await page.waitForTimeout(80)
  }

  // 地图页交互
  await page.getByTestId('nav-map').click()
  await page.getByTestId('pet-avatar').click({ force: true })
  await page.waitForTimeout(150)
  await page.mouse.click(5, 5)
  await page.getByTestId('demo-mode-toggle').click() // 开启演示模式以显示模拟按钮
  await page.getByTestId('sim-next-room').click()
  await page.waitForTimeout(1800)

  // 过滤掉与业务无关的资源类噪声（如 favicon）
  const meaningful = errors.filter((e) => !/favicon|net::ERR/i.test(e))
  expect(meaningful, meaningful.join('\n')).toHaveLength(0)
})
