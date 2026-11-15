// YouTube detection + click-to-load embeds (nothing loads until clicked).

const PATTERNS = [
  /(?:youtube\.com\/watch[^#\s]*[?&]v=|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/,
]

export function extractYouTubeId(text: string): string | null {
  for (const line of text.split(/\s+/)) {
    for (const re of PATTERNS) {
      const m = re.exec(line)
      if (m) return m[1]
    }
  }
  return null
}

export function thumbUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

export function embedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`
}
