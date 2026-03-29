import { useEffect, useState, useRef } from 'react'
import type { ClockData, OccupationItem } from '../types'

type ClockPanelProps = {
  data: ClockData
  onOccupationSelect: (occupation: OccupationItem) => void
}

const markIndices = [9, 10, 11, 0]
const marks = markIndices.map((index) => {
  const angle = (index / 12) * Math.PI * 2 - Math.PI / 2
  const x = 200 + Math.cos(angle) * 162
  const y = 200 + Math.sin(angle) * 162
  return { x, y }
})

function angleForMinutes(totalMinutes: number, divisor: number) {
  return ((totalMinutes % divisor) / divisor) * Math.PI * 2
}

type InfoModalType = 'about' | 'rate' | 'jobs' | 'occupations' | 'threshold' | null

export default function ClockPanel({ data, onOccupationSelect }: ClockPanelProps) {
  const [openModal, setOpenModal] = useState<InfoModalType>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<OccupationItem[]>([])
  const [showResults, setShowResults] = useState(false)
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const [hours, minutes] = data.displayTime.split(':').map(Number)
  const totalMinutes = hours * 60 + minutes
  const minuteAngle = (angleForMinutes(totalMinutes, 60) * 180) / Math.PI
  const hourAngle = (angleForMinutes(totalMinutes, 720) * 180) / Math.PI

  useEffect(() => {
    if (!openModal) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenModal(null)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [openModal])

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      setShowResults(false)
      return
    }
    const query = searchQuery.toLowerCase()
    const results = data.occupations.filter(occ =>
      occ.title.toLowerCase().includes(query)
    ).slice(0, 8)
    setSearchResults(results)
    setShowResults(results.length > 0)
  }, [searchQuery, data.occupations])

  return (
    <section className="panel">
      {searchExpanded && <div className="search-backdrop" onClick={() => {
        setSearchExpanded(false)
        setSearchQuery('')
        setShowResults(false)
      }}></div>}
      <div className="clock-hero">
        <div className="clock-heading-row">
          <button
            type="button"
            className="clock-title-trigger"
            aria-haspopup="dialog"
            aria-expanded={openModal === 'about'}
            aria-label="Open AI Jobs Doomsday Clock explanation"
            onClick={() => setOpenModal('about')}
          >
            <span className="eyebrow">AI Jobs Doomsday Clock</span>
            <span className="clock-title-action" aria-hidden="true">→</span>
          </button>
          <div ref={searchContainerRef} className={`search-container ${searchExpanded ? 'search-expanded' : ''}`} style={searchExpanded && window.innerWidth <= 580 && searchContainerRef.current ? {
            top: `${searchContainerRef.current.getBoundingClientRect().top}px`
          } : undefined}>
            <button
              className="search-toggle-btn"
              onClick={() => setSearchExpanded(true)}
              aria-label="Open search"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <input
              type="text"
              className="search-input"
              placeholder="Search occupations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                setSearchExpanded(true)
                searchResults.length > 0 && setShowResults(true)
              }}
              onBlur={() => setTimeout(() => {
                setShowResults(false)
                if (!searchQuery) setSearchExpanded(false)
              }, 200)}
            />
            {showResults && (
              <div className="search-results">
                {searchResults.map((occ) => (
                  <button
                    key={occ.title}
                    className="search-result-item"
                    onClick={() => {
                      onOccupationSelect(occ)
                      setSearchQuery('')
                      setShowResults(false)
                    }}
                  >
                    <span className="search-result-title">{occ.title}</span>
                    <span className="search-result-exposure">{occ.exposure * 10}%</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
          <button
            type="button"
            className="time-threshold-tag"
            onClick={() => setOpenModal('threshold')}
            aria-label="Explain midnight threshold"
          >
            MIDNIGHT: Job Replacement &gt; 50%
          </button>
        </div>
      </div>

      {openModal ? (
        <div className="definition-modal-backdrop" onClick={() => setOpenModal(null)}>
          <div
            className="definition-modal"
            role="dialog"
            aria-modal="true"
            aria-label={openModal === 'about' ? 'About AI Jobs Doomsday Clock' : 'Metric explanation'}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="definition-modal-header">
              <p className="eyebrow">{openModal === 'about' ? 'About this page' : 'Metric explanation'}</p>
              <button type="button" className="definition-modal-close" aria-label="Close explanation" onClick={() => setOpenModal(null)}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="definition-modal-copy">
              {openModal === 'about' && (
                <>
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
                    <p>
                      Replacement rate is computed as a jobs-weighted mean exposure multiplied by 10.
                      The clock mapping is linear over 24 hours: minutesToMidnight = round((50 - replacementRate) * 14.4),
                      then displayTime is the 24-hour time for (1440 - minutesToMidnight) mod 1440.
                      Under this scale, 50% maps to 00:00 and each 1 percentage point shifts 14.4 minutes.
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
                </>
              )}

              {openModal === 'rate' && (
                <section className="definition-block">
                  <h3>What is Replacement Rate?</h3>
                  <p>
                    The replacement rate represents the percentage of work tasks across all occupations that AI is currently capable of performing—not the percentage of jobs that have been replaced.
                  </p>
                  <p>
                    For example, a 49.1% replacement rate means that, on average, 49.1% of the tasks within these jobs could theoretically be done by AI today. It does not mean 49.1% of workers have lost their jobs.
                  </p>
                  <p>
                    This metric is calculated as a jobs-weighted mean exposure score (from the dataset) multiplied by 10, providing a 0-100% scale of AI's potential impact on the labor market.
                  </p>
                </section>
              )}

              {openModal === 'jobs' && (
                <section className="definition-block">
                  <h3>What does Total Jobs represent?</h3>
                  <p>
                    This number represents the total employment count across all occupations included in the dataset, based on U.S. Bureau of Labor Statistics (BLS) data.
                  </p>
                  <p>
                    It reflects the scale of the labor market being analyzed—not the number of jobs at risk or already replaced by AI.
                  </p>
                </section>
              )}

              {openModal === 'occupations' && (
                <section className="definition-block">
                  <h3>What does Occupations count?</h3>
                  <p>
                    This is the number of distinct occupation categories included in the analysis, as defined by the BLS Standard Occupational Classification (SOC) system.
                  </p>
                  <p>
                    Each occupation has been evaluated for its exposure to AI capabilities, contributing to the overall replacement rate calculation.
                  </p>
                </section>
              )}

              {openModal === 'threshold' && (
                <section className="definition-block">
                  <h3>What does the 50% threshold mean?</h3>
                  <p>
                    The 50% threshold represents a symbolic "midnight" on this doomsday clock—the point at which AI could theoretically perform half of all work tasks across the labor market.
                  </p>
                  <p>
                    This does not mean 50% of jobs have disappeared or that 50% of workers are unemployed. Rather, it indicates that AI capabilities have reached a level where they could handle 50% of the tasks that make up these occupations.
                  </p>
                  <p>
                    The threshold serves as a reference point for understanding how close we are to widespread AI task automation across the economy.
                  </p>
                </section>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-label">
            Replacement Rate
            <button
              type="button"
              className="stat-info-btn"
              aria-label="Explain replacement rate"
              onClick={() => setOpenModal('rate')}
            >
              <span aria-hidden="true">i</span>
            </button>
          </span>
          <div className="stat-value">{data.replacementRate}%</div>
        </div>
        <div className="stat-item">
          <span className="stat-label">
            Total Jobs
            <button
              type="button"
              className="stat-info-btn"
              aria-label="Explain total jobs"
              onClick={() => setOpenModal('jobs')}
            >
              <span aria-hidden="true">i</span>
            </button>
          </span>
          <div className="stat-value">{(data.totalJobs / 1000000).toFixed(1)}M</div>
        </div>
        <div className="stat-item">
          <span className="stat-label">
            Occupations
            <button
              type="button"
              className="stat-info-btn"
              aria-label="Explain occupations"
              onClick={() => setOpenModal('occupations')}
            >
              <span aria-hidden="true">i</span>
            </button>
          </span>
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
