import { useState } from 'react'
import type { NewsFeedItem } from '../types'

type NewsFeedProps = {
  items: NewsFeedItem[]
  newsAdjustment: number
  generatedAt: string
}

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr)
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }
  const formattedDate = date.toLocaleDateString('en-US', options)
  return `${formattedDate} · Auto-updates daily at 08:00 SGT`
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatAdjustment(adj: number): string {
  if (adj === 0) return 'No change'
  const totalSeconds = Math.round(adj * 60)
  if (totalSeconds === 0) return 'No change'
  const sign = totalSeconds > 0 ? '+' : ''
  return `${sign}${totalSeconds} sec`
}

const IMPACT_LABELS = ['', 'Minor signal', 'Moderate signal', 'Notable signal', 'Major signal', 'Critical signal']

function ImpactDots({ score }: { score: number }) {
  return (
    <span className="news-feed-impact-container">
      <span className="news-feed-impact">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`news-feed-dot ${i < score ? 'news-feed-dot-active' : 'news-feed-dot-inactive'}`} />
        ))}
      </span>
      <span className="news-feed-impact-tooltip">
        Impact Score: {score}/5<br />
        <span className="news-feed-impact-desc">{IMPACT_LABELS[score]}</span>
      </span>
    </span>
  )
}

export default function NewsFeed({ items, newsAdjustment, generatedAt }: NewsFeedProps) {
  const [showAll, setShowAll] = useState(false)

  if (!items || items.length === 0) return null

  const advances = items.filter(i => i.effect === 'advance').length
  const delays = items.filter(i => i.effect === 'delay').length
  const totalItems = items.length

  const visibleItems = showAll ? items : items.slice(0, 6)

  return (
    <section className="news-feed-section">
      <div className="news-feed-header">
        <div className="news-feed-title-row">
          <h2 className="section-title">Latest Signals</h2>
          <span className="news-feed-date-subtitle">
            {formatDateHeader(generatedAt)}
          </span>
        </div>
        <div className="news-feed-summary">
          <span className="news-feed-stat">
            <span className="news-feed-filtered">Filtered from {totalItems} signals:</span>
            <span className="effect effect-advance">{advances} advance</span>
            <span className="news-feed-stat-sep">·</span>
            <span className="effect effect-delay">{delays} delay</span>
            <span className="news-feed-stat-sep">·</span>
            <span className="news-feed-adjustment">
              Clock: {formatAdjustment(newsAdjustment)}
            </span>
          </span>
        </div>
      </div>

      <div className="news-feed-grid">
        {visibleItems.map((item) => (
          <article key={item.id} className="news-feed-card">
            <div className="news-feed-card-header">
              <span className={`news-feed-effect ${item.effect === 'advance' ? 'news-feed-effect-advance' : 'news-feed-effect-delay'}`}>
                {item.effect === 'advance' ? '🐇 Advance' : '🐢 Delay'}
              </span>
              <ImpactDots score={item.impactScore} />
            </div>
            <h3 className="news-feed-card-title">
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
            </h3>
            <p className="news-feed-card-summary">{item.summary}</p>
            <div className="news-feed-card-footer">
              <span className="news-feed-source">{item.source}</span>
              <span className="news-feed-date">{timeAgo(item.date)}</span>
            </div>
          </article>
        ))}
      </div>

      {!showAll && items.length > 6 && (
        <div className="news-feed-more">
          <button
            className="news-feed-more-btn"
            onClick={() => setShowAll(true)}
          >
            Show more signals ({items.length - 6} hidden)
          </button>
        </div>
      )}
    </section>
  )
}
