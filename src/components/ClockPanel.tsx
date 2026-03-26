import { useEffect, useState } from 'react'
import type { ClockData } from '../types'

type ClockPanelProps = {
  data: ClockData
}

const marks = Array.from({ length: 12 }, (_, index) => {
  const angle = (index / 12) * Math.PI * 2 - Math.PI / 2
  const x = 200 + Math.cos(angle) * 162
  const y = 200 + Math.sin(angle) * 162
  return { x, y }
})

function angleForMinutes(totalMinutes: number, divisor: number) {
  return ((totalMinutes % divisor) / divisor) * Math.PI * 2
}

export default function ClockPanel({ data }: ClockPanelProps) {
  const [open, setOpen] = useState(false)
  const [hours, minutes] = data.displayTime.split(':').map(Number)
  const totalMinutes = hours * 60 + minutes
  const minuteAngle = (angleForMinutes(totalMinutes, 60) * 180) / Math.PI
  const hourAngle = (angleForMinutes(totalMinutes, 720) * 180) / Math.PI

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <section className="panel">
      <div className="clock-hero">
        <div className="clock-heading-row">
          <button
            type="button"
            className="clock-title-trigger"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label="Open AI Jobs Doomsday Clock explanation"
            onClick={() => setOpen(true)}
          >
            <span className="eyebrow">AI Jobs Doomsday Clock</span>
            <span className="clock-title-action" aria-hidden="true">→</span>
          </button>
        </div>

        <div className="clock-stage">
          <div className="clock-face">
            <svg viewBox="0 0 400 400" className="clock-svg" role="img" aria-label={`Clock reads ${data.displayTime}`}>
              <circle cx="200" cy="200" r="196" className="clock-ring" />
              <circle cx="200" cy="200" r="196" className="clock-edge-ripple" />
              {marks.map((mark, index) => (
                <circle key={index} cx={mark.x} cy={mark.y} r="23" className="clock-mark" />
              ))}
              <g transform={`rotate(${hourAngle} 200 200)`}>
                <polygon points="191,88 209,88 219,214 181,214" className="clock-hour-hand" />
              </g>
              <g transform={`rotate(${minuteAngle} 200 200)`}>
                <polygon points="196,52 204,52 209,214 191,214" className="clock-minute-hand" />
              </g>
              <circle cx="200" cy="200" r="5" className="clock-center-hub" />
            </svg>
          </div>
        </div>

        <div className="clock-readout">
          <h1>{data.displayTime}</h1>
          <div className="time-context">
            {data.minutesToMidnight} minutes to midnight
          </div>
        </div>
      </div>

      {open ? (
        <div className="definition-modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="definition-modal"
            role="dialog"
            aria-modal="true"
            aria-label="About AI Jobs Doomsday Clock"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="definition-modal-header">
              <p className="eyebrow">About this page</p>
              <button type="button" className="definition-modal-close" aria-label="Close explanation" onClick={() => setOpen(false)}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="definition-modal-copy">
              <section className="definition-block">
                <h3>Project scope</h3>
                <p>
                  AI Jobs Doomsday Clock is a compact public-facing monitor of AI labor replacement pressure.
                  The large clock readout translates the current aggregate replacement rate into a doomsday-style
                  time metaphor: higher replacement pressure moves the display closer to midnight.
                </p>
              </section>

              <section className="definition-block">
                <h3>How to read this page</h3>
                <ul>
                  <li>
                    <strong>Clock + minutes to midnight:</strong> A visual summary of current replacement pressure.
                  </li>
                  <li>
                    <strong>Top metrics:</strong> Replacement rate, total jobs represented, and occupation count in
                    the current dataset snapshot.
                  </li>
                  <li>
                    <strong>Occupational Exposure:</strong> Role-level cards with exposure score, job volume,
                    category, and outlook signal.
                  </li>
                  <li>
                    <strong>Reference News Feed:</strong> Evidence-style cards adapted from the original doomsday-clock
                    project to ground the interpretation in external reporting.
                  </li>
                </ul>
              </section>

              <section className="definition-block">
                <h3>Data and method notes</h3>
                <p>
                  This page is generated from precomputed local data and rendered as a static site.
                  The frontend does not recompute labor exposure in the browser; it reads generated JSON output.
                </p>
              </section>

              <section className="definition-block">
                <h3>Acknowledgement</h3>
                <p>
                  This project draws occupation exposure data from Andrej Karpathy's jobs dataset and project.
                  Respect and thanks to that work for making this derivative monitoring view possible.
                </p>
                <p>
                  Source project:{' '}
                  <a href="https://github.com/karpathy/jobs" target="_blank" rel="noopener noreferrer">
                    github.com/karpathy/jobs
                  </a>
                </p>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">Replacement Rate</span>
          <div className="stat-value">{data.replacementRate}%</div>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Jobs</span>
          <div className="stat-value">{(data.totalJobs / 1000000).toFixed(1)}M</div>
        </div>
        <div className="stat-item">
          <span className="stat-label">Occupations</span>
          <div className="stat-value">{data.occupationCount}</div>
        </div>
      </div>

      <p className="stats-source-note">
        <span>Data source: Andrej Karpathy&apos;s jobs dataset (BLS-linked occupations).</span>
        <span>
          Time conversion: minutesToMidnight = round((50 − replacementRate) × 14.4), then displayTime = 24h format of
          (1440 − minutesToMidnight).
        </span>
      </p>
    </section>
  )
}
