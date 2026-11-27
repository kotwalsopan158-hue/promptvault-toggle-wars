import { promptFields } from './prompt-inputs.js'

export function markdownTemplate({ title, prompt }) {
  const heading = title.replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}[\]()#+.!<>|~-]/g, '\\$&')
  const fields = promptFields(prompt)
  const fenceLength = Math.max(2, ...Array.from(prompt.matchAll(/`+/g), match => match[0].length)) + 1
  const fence = '`'.repeat(fenceLength)
  const inputs = fields.length ? ['## Inputs', '', ...fields.map(name => '- `' + name + '`'), ''] : []
  return ['# ' + heading, '', ...inputs, '## Reusable prompt', '', fence + 'text', prompt, fence, ''].join('\n')
}

export function downloadTemplate(record) {
  const slug = record.title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  const blob = new Blob([markdownTemplate(record)], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'promptvault-' + (slug || 'workflow') + '.md'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
