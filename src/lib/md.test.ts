import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './md'

describe('renderMarkdown', () => {
  it('neutralizes stored XSS (audit A1)', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes quotes so href attributes cannot break out', () => {
    const html = renderMarkdown('[x](https://e.com/"onload="alert(1))')
    expect(html).not.toContain('"onload="')
  })

  it('renders links with rel/target, bare URLs autolinked', () => {
    const html = renderMarkdown('[Docs](https://e.com) and https://f.com/x')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('>Docs</a>')
    expect(html).toContain('>https://f.com/x</a>')
  })

  it('renders code, bold, italic, mentions', () => {
    expect(renderMarkdown('`a+b`')).toContain('<code')
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>')
    expect(renderMarkdown('*it*')).toContain('<em>it</em>')
    expect(renderMarkdown('hi @minik')).toContain('@minik')
  })

  it('keeps newlines as breaks', () => {
    expect(renderMarkdown('a\nb')).toContain('a<br />b')
  })
})
