// 从 shot-dom.html 提取所有内联 <style> 标签内容（运行时注入的组件 CSS）
const fs = require('fs')
const html = fs.readFileSync('shot-dom.html', 'utf8')

const styles = []
const re = /<style[^>]*>([\s\S]*?)<\/style>/g
let m
while ((m = re.exec(html)) !== null) {
  styles.push(m[1])
}
fs.writeFileSync('harness-assets/runtime.css', styles.join('\n'))
console.log('style tags:', styles.length, 'total chars:', styles.join('').length)

// 检查目标类是否在内
const joined = styles.join('\n')
for (const p of ['pXSMma', 'uV2eYG', 'wSkVaW', 'hHd-Xa', 'qDHVXG', 'ydkMvW', 'Sh0Q9G', '_7KE1Ra', 'pI_x6G', 'jLrgrW', 'zGbnIq', 'VOzbGW', 'UQsH_q', 'YDXeBa']) {
  console.log(p, '=>', (joined.match(new RegExp(p, 'g')) || []).length)
}
