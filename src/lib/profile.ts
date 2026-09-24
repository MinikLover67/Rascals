// Profile media: avatar + banner images live in IndexedDB (localStorage
// cannot hold blobs). Static images are downscaled on import; GIFs pass
// through untouched so animation survives ("moving pfp / moving banner").

import { kvDel, kvGet, kvSet } from './idb'

export const AVATAR_MAX_BYTES = 256 * 1024
export const BANNER_MAX_BYTES = 512 * 1024
const AVATAR_SIZE = 256
const BANNER_WIDTH = 960

async function downscale(blob: Blob, maxDim: number): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
    if (scale >= 1 && blob.size <= BANNER_MAX_BYTES) return blob
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    ctx.drawImage(bmp, 0, 0, w, h)
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85),
    )
    return out ?? blob
  } finally {
    try {
      bmp.close()
    } catch {
      // already closed
    }
  }
}

export interface StoredImage {
  id: string
  mime: string
}

/** Validate + store an avatar (PNG/JPG/WEBP downscaled, GIF kept animated). */
export async function storeAvatar(file: File): Promise<StoredImage> {
  if (file.type === 'image/gif') {
    if (file.size <= 0 || file.size > 2 * 1024 * 1024) {
      throw new Error('GIF avatars must be under 2 MB.')
    }
    const id = `av-${Date.now().toString(36)}`
    await kvSet(`prof:avatar:${id}`, file)
    return { id, mime: 'image/gif' }
  }
  if (!file.type.startsWith('image/') || file.size <= 0) {
    throw new Error('Pick an image file (PNG/JPG/GIF).')
  }
  const blob = await downscale(file, AVATAR_SIZE)
  if (blob.size > AVATAR_MAX_BYTES) throw new Error('That image is too big — try a smaller one.')
  const id = `av-${Date.now().toString(36)}`
  await kvSet(`prof:avatar:${id}`, blob)
  return { id, mime: blob.type || 'image/jpeg' }
}

/** Validate + store a banner (GIF kept animated, statics fit 960px wide). */
export async function storeBanner(file: File): Promise<StoredImage> {
  if (file.type === 'image/gif') {
    if (file.size <= 0 || file.size > 3 * 1024 * 1024) {
      throw new Error('GIF banners must be under 3 MB.')
    }
    const id = `bn-${Date.now().toString(36)}`
    await kvSet(`prof:banner:${id}`, file)
    return { id, mime: 'image/gif' }
  }
  if (!file.type.startsWith('image/') || file.size <= 0) {
    throw new Error('Pick an image file (PNG/JPG/GIF).')
  }
  const blob = await downscale(file, BANNER_WIDTH)
  if (blob.size > BANNER_MAX_BYTES) throw new Error('That image is too big — try a smaller one.')
  const id = `bn-${Date.now().toString(36)}`
  await kvSet(`prof:banner:${id}`, blob)
  return { id, mime: blob.type || 'image/jpeg' }
}

export async function loadAvatar(id: string): Promise<Blob | null> {
  return kvGet(`prof:avatar:${id}`)
}

export async function loadBanner(id: string): Promise<Blob | null> {
  return kvGet(`prof:banner:${id}`)
}

export async function dropAvatar(id: string): Promise<void> {
  await kvDel(`prof:avatar:${id}`)
}

export async function dropBanner(id: string): Promise<void> {
  await kvDel(`prof:banner:${id}`)
}

/** Object URL for rendering (cached per call site via useState/useEffect). */
export async function avatarUrl(id: string): Promise<string | null> {
  const blob = await loadAvatar(id)
  return blob ? URL.createObjectURL(blob) : null
}

export async function bannerUrl(id: string): Promise<string | null> {
  const blob = await loadBanner(id)
  return blob ? URL.createObjectURL(blob) : null
}

// ---- Peer profile cache (their look, fetched on demand) --------------------

export interface PeerProfile {
  themePrimary: string
  themeAccent: string
  nameStyle: string
  /** MIME when the peer also sent image bytes (stored under peer blob keys). */
  avatarMime?: string | null
  bannerMime?: string | null
  /** Gradient CSS when their banner is a preset (no bytes needed). */
  bannerCss?: string | null
  at: number
}

export async function savePeerProfile(userId: string, p: PeerProfile): Promise<void> {
  try {
    await kvSet(
      `prof:peer:${userId}`,
      new Blob(
        [
          JSON.stringify({
            themePrimary: p.themePrimary,
            themeAccent: p.themeAccent,
            nameStyle: p.nameStyle,
            avatarMime: p.avatarMime ?? null,
            bannerMime: p.bannerMime ?? null,
            bannerCss: p.bannerCss ?? null,
            at: p.at,
          }),
        ],
        { type: 'application/json' },
      ),
    )
  } catch {
    // cache is garnish
  }
}

export async function loadPeerProfile(userId: string): Promise<PeerProfile | null> {
  try {
    const blob = await kvGet(`prof:peer:${userId}`)
    if (!blob) return null
    const raw = JSON.parse(await blob.text()) as Partial<PeerProfile>
    if (typeof raw.themePrimary !== 'string') return null
    return {
      themePrimary: raw.themePrimary,
      themeAccent: typeof raw.themeAccent === 'string' ? raw.themeAccent : '#7c6cff',
      nameStyle: typeof raw.nameStyle === 'string' ? raw.nameStyle : 'default',
      avatarMime: typeof raw.avatarMime === 'string' ? raw.avatarMime : null,
      bannerMime: typeof raw.bannerMime === 'string' ? raw.bannerMime : null,
      bannerCss: typeof raw.bannerCss === 'string' ? raw.bannerCss.slice(0, 200) : null,
      at: typeof raw.at === 'number' ? raw.at : 0,
    }
  } catch {
    return null
  }
}

export async function savePeerBlob(userId: string, kind: 'avatar' | 'banner', blob: Blob): Promise<void> {
  try {
    await kvSet(`prof:peer:${userId}:${kind}`, blob)
  } catch {
    // cache is garnish
  }
}

export async function loadPeerBlob(userId: string, kind: 'avatar' | 'banner'): Promise<Blob | null> {
  return kvGet(`prof:peer:${userId}:${kind}`)
}
