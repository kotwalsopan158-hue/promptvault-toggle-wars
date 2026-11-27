import { promptFields } from './prompt-inputs.js'
import { workflowText } from './workspace.js'

export const maxTemplateBytes = 128 * 1024

export function readMarkdownTemplate(markdown) {
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd().split('\n')
  const section = lines.indexOf('## Reusable prompt')
  const fence = lines[section + 2]?.match(/^(`{3,})text$/)?.[1]
  const closing = fence ? lines.indexOf(fence, section + 3) : -1
  if (!lines[0].startsWith('# ') || section < 1 || lines[section + 1] !== '' || closing !== lines.length - 1 || !fence) {
    throw Error('Choose a Markdown file exported by PromptVault. It needs a title and a fenced Reusable prompt section.')
  }
  return workflowText({
    title: lines[0].slice(2).replace(/\\([\\`*_{}[\]()#+.!<>|~-])/g, '$1'),
    prompt: lines.slice(section + 3, closing).join('\n'),
  })
}

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
