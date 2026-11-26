const fieldPattern = /\{\{ *([a-zA-Z][a-zA-Z0-9_ -]{0,39}?) *\}\}/g

export function promptFields(prompt) {
  return [...new Set(Array.from(prompt.matchAll(fieldPattern), match => match[1].trim()))]
}

export function fillPrompt(prompt, values) {
  return prompt.replace(fieldPattern, (original, name) => values.get(name.trim())?.trim() || original)
}
