// Tiny markdown subset for chat: code spans, bold, italic, links.
// Everything is HTML-escaped first; links open outside the app.

const PLACEHOLDER = '\u0000'

export function renderMarkdown(src: string): string {
  const stash: string[] = []
  const keep = (html: string): string => {
    stash.push(html)
    return `${PLACEHOLDER}${stash.length - 1}${PLACEHOLDER}`
  }
  const restore = (s: string): string =>
    s.replace(
      new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'),
      (_m: string, i: string) => stash[Number(i)] ?? '',
    )

  let esc = src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  esc = esc.replace(/`([^`\n]+)`/g, (_m: string, code: string) =>
    keep(`<code class="rounded bg-black/30 px-1 font-mono text-[12px]">${code}</code>`),
  )
  esc = esc.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m: string, text: string, url: string) =>
      keep(
        `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-rascal-accent underline">${text}</a>`,
      ),
  )
  esc = esc.replace(
    /(^|[\s(])((https?:\/\/)[^\s<]+)/g,
    (_m: string, pre: string, url: string) =>
      keep(
        `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-rascal-accent underline">${url}</a>`,
      ),
  )
  esc = esc.replace(/\*\*([^*]+)\*\*/g, (_m: string, b: string) =>
    keep(`<strong>${b}</strong>`),
  )
  esc = esc.replace(/(^|[^*\w])\*([^*\n]+)\*/g, (_m: string, pre: string, i: string) =>
    keep(`${pre}<em>${i}</em>`),
  )
  // @mentions highlight (1:1 chats are small, so highlight only).
  esc = esc.replace(/(^|\s)(@[A-Za-z0-9_.-]+)/g, (_m: string, pre: string, m: string) =>
    keep(`${pre}<span class="rounded bg-rascal-accent/25 px-1 text-rascal-accent">${m}</span>`),
  )

  return restore(esc).replace(/\n/g, '<br />')
}
