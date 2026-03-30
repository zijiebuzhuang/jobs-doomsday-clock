import { useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import type { OccupationItem } from '../types'

type OccupationCardProps = {
  occupation: OccupationItem
  onClose: () => void
}

export default function OccupationCard({ occupation, onClose }: OccupationCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)

  const replacementRate = occupation.exposure * 10
  const minutesToMidnight = Math.round((50 - replacementRate) * 14.4)
  const totalMinutes = (1440 - minutesToMidnight) % 1440
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const displayTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

  const hourAngle = ((totalMinutes % 720) / 720) * 360
  const minuteAngle = ((totalMinutes % 60) / 60) * 360

  const handleSave = async () => {
    if (!cardRef.current || saving) return
    setSaving(true)

    const captureArea = cardRef.current
    const actions = captureArea.querySelector('.occupation-card-actions') as HTMLElement
    const footerUrl = captureArea.querySelector('.occupation-card-footer-url') as HTMLElement
    const headerClose = captureArea.querySelector('.definition-modal-close') as HTMLElement

    const originalMaxHeight = captureArea.style.maxHeight
    const originalOverflow = captureArea.style.overflow
    captureArea.style.maxHeight = 'none'
    captureArea.style.overflow = 'visible'

    if (actions) actions.style.display = 'none'
    if (footerUrl) footerUrl.style.display = 'block'
    if (headerClose) headerClose.style.display = 'none'

    try {
      await new Promise(resolve => setTimeout(resolve, 50))

      const canvas = await html2canvas(captureArea, {
        backgroundColor: '#0c0c0c',
        scale: 2,
        logging: false,
        useCORS: true,
        windowWidth: captureArea.scrollWidth,
        windowHeight: captureArea.scrollHeight
      })

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Failed to generate image')

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = `${occupation.title.replace(/\s+/g, '-')}.png`
      link.href = url
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      console.error('Failed to save image:', error)
      alert('Failed to generate image. Please try again.')
    } finally {
      captureArea.style.maxHeight = originalMaxHeight
      captureArea.style.overflow = originalOverflow
      if (actions) actions.style.display = ''
      if (footerUrl) footerUrl.style.display = 'none'
      if (headerClose) headerClose.style.display = ''
      setSaving(false)
    }
  }

  return (
    <div className="occupation-card-backdrop" onClick={onClose}>
      <div ref={cardRef} className="occupation-card-modal" onClick={(e) => e.stopPropagation()}>
        <div className="occupation-card-capture-area">
          <div className="occupation-card-header">
            <p className="eyebrow">Occupation Detail</p>
            <button type="button" className="definition-modal-close" aria-label="Close" onClick={onClose}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div className="occupation-card-content">
            <h2>{occupation.title}</h2>

          <div className="occupation-card-clock">
            <svg viewBox="0 0 120 120" className="occupation-card-clock-svg">
              <circle cx="60" cy="60" r="58" fill="#f5f1e8" />
              <circle cx="60" cy="11" r="7" fill="#050505" />
              <g transform={`rotate(${hourAngle} 60 60)`}>
                <rect x="57" y="30" width="6" height="30" fill="#050505" />
              </g>
              <g transform={`rotate(${minuteAngle} 60 60)`}>
                <rect x="58.5" y="20" width="3" height="40" fill="#f5f1e8" stroke="#050505" strokeWidth="1" />
              </g>
              <circle cx="60" cy="60" r="2" fill="#050505" />
            </svg>
          </div>

          <div className="occupation-card-exposure">{replacementRate}%</div>
          <p className="occupation-card-label">AI Replacement Rate</p>
          <div className="occupation-card-time-inline">
            {displayTime} · {minutesToMidnight >= 0
              ? `${minutesToMidnight} min to midnight`
              : `${Math.abs(minutesToMidnight)} min past midnight`}
          </div>

          <div className="occupation-card-stats">
            <div>
              <span className="occupation-card-stat-label">Total Jobs</span>
              <span className="occupation-card-stat-value">{(occupation.jobs / 1000000).toFixed(2)}M</span>
            </div>
            {occupation.category && (
              <div>
                <span className="occupation-card-stat-label">Category</span>
                <span className="occupation-card-stat-value">{occupation.category.replace(/-/g, ' ')}</span>
              </div>
            )}
            {occupation.outlookDesc && (
              <div>
                <span className="occupation-card-stat-label">Outlook</span>
                <span className="occupation-card-stat-value">{occupation.outlookDesc}</span>
              </div>
            )}
          </div>
        </div>
        <div className="occupation-card-footer-url" style={{ display: 'none', textAlign: 'center', marginTop: '20px', marginBottom: '8px', fontFamily: 'var(--font-ui)', fontSize: '10px', letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase' }}>
          jobdoomsday.tech
        </div>
        </div>
        <div className="occupation-card-actions">
          <button onClick={handleSave} className="occupation-card-btn" disabled={saving}>
            {saving ? 'Generating...' : 'Save as Image'}
          </button>
          {occupation.url && (
            <a href={occupation.url} target="_blank" rel="noopener noreferrer" className="occupation-card-btn">View BLS Data</a>
          )}
        </div>
      </div>
    </div>
  )
}
