// 探针：打开官方 UI → 点击一个有消息的会话 → 抓消息流 DOM
// 用法：$env:EXPLORE_URL="http://127.0.0.1:3099/"; $env:EXPLORE_OUT="<dir>"; npx electron scripts/probe-flow.cjs
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, backgroundColor: '#0f1115' })
  win.webContents.setBackgroundThrottling(false)
  await win.loadURL(process.env.EXPLORE_URL)
  await new Promise((r) => setTimeout(r, 9000))

  const clicked = await win.webContents.executeJavaScript(`(() => {
    // 会话树条目：优先按标题文本找，点击其祖先中可点击的元素
    const titles = ['App开发新功能实现方法', '你好', '当前开发进度如何'];
    for (const t of titles) {
      const els = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim() === t);
      for (const el of els) {
        let n = el;
        for (let depth = 0; n && depth < 4; depth++, n = n.parentElement) {
          if (n.onclick || n.getAttribute('role') === 'treeitem' || n.tagName === 'BUTTON') {
            n.click();
            return 'clicked:' + t + '@' + n.tagName;
          }
        }
      }
    }
    return 'no-session-clicked';
  })()`)
  console.log('CLICK_RESULT', clicked)
  await new Promise((r) => setTimeout(r, 8000))

  const out = process.env.EXPLORE_OUT
  fs.mkdirSync(out, { recursive: true })
  const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML')
  fs.writeFileSync(path.join(out, 'flow-dom.html'), html)
  const text = await win.webContents.executeJavaScript('document.body.innerText')
  fs.writeFileSync(path.join(out, 'flow-text.txt'), text)
  console.log('DONE html=' + html.length + ' text=' + text.length)
  app.quit()
})
