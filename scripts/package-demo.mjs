import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const output = 'release'
mkdirSync(output, { recursive: true })
const mime = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png' }

function embedFile(file) {
  const type = mime[path.extname(file)]
  if (!type) throw Error('Unsupported asset in the portable build: ' + file)
  return 'data:' + type + ';base64,' + readFileSync(file).toString('base64')
}

let html = readFileSync('dist/index.html', 'utf8')
html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  const js = readFileSync(path.resolve('dist', src), 'utf8').replace(/<\/script/gi, '<\\/script')
  return '<script type="module">' + js + '</script>'
})
html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => {
  const file = path.resolve('dist', href)
  const css = readFileSync(file, 'utf8').replace(/url\((['"]?)([^)'"]+)\1\)/g, (url, quote, src) => {
    if (src.startsWith('data:')) return url
    return 'url("' + embedFile(path.resolve(path.dirname(file), src)) + '")'
  })
  return '<style>' + css + '</style>'
})
html = html.replace(/(<link\b[^>]*rel="icon"[^>]*href=")([^"]+)(")/, (_, start, href, end) => start + embedFile(path.resolve('dist', href)) + end)
writeFileSync(path.join(output, 'PromptVault.html'), html)

const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
const language = { '.js': 'javascript', '.jsx': 'jsx', '.mjs': 'javascript', '.json': 'json', '.md': 'markdown', '.yml': 'yaml', '.css': 'css', '.html': 'html', '.svg': 'xml' }
let book = '# PromptVault complete source\n\nEvery tracked project file is included below in full.\n'
for (const file of paths) {
  const contents = readFileSync(file, 'utf8')
  const runs = Array.from(contents.matchAll(/`+/g), match => match[0].length)
  const fence = '`'.repeat(Math.max(2, ...runs) + 1)
  book += '\n## ' + file + '\n\n' + fence + (language[path.extname(file)] || 'text') + '\n'
  book += contents + (contents.endsWith('\n') ? '' : '\n') + fence + '\n'
}
writeFileSync(path.join(output, 'PromptVault-full-source.md'), book)
execFileSync('git', ['archive', '--format=zip', '--prefix=PromptVault/', '--output=release/PromptVault-source.zip', 'HEAD'])
console.log('Packaged the portable app, full source listing and source ZIP.')
