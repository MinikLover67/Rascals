import { useState } from 'react'
import { embedUrl, thumbUrl } from '../lib/youtube'

// Click-to-load: nothing from Google loads until the user presses play.
export default function YouTubeCard({ videoId }: { videoId: string }) {
  const [playing, setPlaying] = useState(false)

  if (playing) {
    return (
      <div className="mb-1.5 overflow-hidden rounded-xl">
        <iframe
          src={embedUrl(videoId)}
          title="YouTube video"
          className="aspect-video w-full max-w-md"
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  return (
    <button onClick={() => setPlaying(true)} className="group relative mb-1.5 block max-w-md text-left">
      <img
        src={thumbUrl(videoId)}
        alt="YouTube preview - click to play"
        loading="lazy"
        className="w-full rounded-xl object-cover"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-lg text-white group-hover:bg-rascal-accent">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
            <path d="M4 2.5v13l11-6.5z" />
          </svg>
        </span>
      </span>
      <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
        YouTube - click to load
      </span>
    </button>
  )
}
