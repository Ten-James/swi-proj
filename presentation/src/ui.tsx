import type { CSSProperties, ReactNode } from 'react'
import { usePresentation } from '@react-slides/core'

/** Resolves a file from public/ against the deploy base path (react-slides build --base). */
export function asset(path: string) {
  return `${import.meta.env.BASE_URL}${path}`
}

export type Status = 'CONFIRMED' | 'PENDING_APPROVAL' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'

export function BrandMark() {
  const colors = ['--confirmed', '--pending', '--confirmed', '--cancelled', '--confirmed', '--rejected']
  return (
    <span className="brand-mark" aria-hidden>
      {colors.map((c, i) => (
        <i key={i} style={{ background: `var(${c})` }} />
      ))}
    </span>
  )
}

function Footer({ section }: { section?: string }) {
  const { slideIndex, totalSlides } = usePresentation()
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <div className="frame-footer">
      <span className="brand">
        <BrandMark />
        Agent Reservations{section ? ` · ${section}` : ''}
      </span>
      <span>
        {pad(slideIndex + 1)} / {pad(totalSlides)}
      </span>
    </div>
  )
}

export function Frame({
  children,
  title,
  lede,
  section,
  dark,
  style,
}: {
  children?: ReactNode
  title?: ReactNode
  lede?: ReactNode
  section?: string
  dark?: boolean
  style?: CSSProperties
}) {
  return (
    <div className={`frame${dark ? ' dark' : ''}`} style={style}>
      {title && <h2>{title}</h2>}
      {lede && <p className="lede">{lede}</p>}
      {children}
      <Footer section={section} />
    </div>
  )
}

export function Pill({ status, children }: { status: Status | 'ghost'; children?: ReactNode }) {
  return <span className={`pill ${status}`}>{children ?? status}</span>
}

export function Browser({
  src,
  url = 'localhost:3000',
  alt,
  scrollTo = 0,
  crop = { x: 0, w: 1 },
  style,
  children,
}: {
  src: string
  url?: string
  alt: string
  /** Fraction of the screenshot height scrolled out of view at the top. */
  scrollTo?: number
  /** Horizontal crop as fractions of the screenshot width: start `x`, visible width `w`. */
  crop?: { x: number; w: number }
  style?: CSSProperties
  /** Overlays (e.g. <Marker>) positioned in screenshot coordinates. */
  children?: ReactNode
}) {
  return (
    <div className="browser" style={style}>
      <div className="browser-bar">
        <i />
        <i />
        <i />
        <span className="browser-url">{url}</span>
      </div>
      <div className="browser-view">
        <div
          className="shot"
          style={{
            width: `${100 / crop.w}%`,
            marginLeft: `${(-crop.x / crop.w) * 100}%`,
            transform: `translateY(${-scrollTo * 100}%)`,
          }}
        >
          <img src={src} alt={alt} />
          {children}
        </div>
      </div>
    </div>
  )
}

export function Marker({ n, x, y }: { n: number; x: string; y: string }) {
  return (
    <span className="marker" style={{ left: x, top: y }}>
      {n}
    </span>
  )
}
