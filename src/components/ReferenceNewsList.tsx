import { useState } from 'react'
import type { ReferenceNewsItem } from '../types'

type ReferenceNewsListProps = {
  items: ReferenceNewsItem[]
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatSource(value: string) {
  const sources = value.split(' / ').filter(Boolean)
  if (sources.length <= 1) return sources[0] ?? value
  return `${sources[0]} +${sources.length - 1}`
}

export default function ReferenceNewsList({ items }: ReferenceNewsListProps) {
  const [showMilestoneModal, setShowMilestoneModal] = useState(false)

  const sortedItems = [...items].sort((a, b) => {
    if (a.contributionType === 'shock' && b.contributionType !== 'shock') return -1
    if (a.contributionType !== 'shock' && b.contributionType === 'shock') return 1
    return 0
  })

  return (
    <section className="reference-news-section">
      <h2 className="section-title">Reference News Feed</h2>
      <div className="reference-news-list">
        {sortedItems.map((item) => (
          <article key={item.id} className="reference-news-item">
            <div className="evidence-date">
              <span className="evidence-date-main">{formatDate(item.date)}</span>
              {item.contributionType === 'shock' ? (
                <button
                  className="evidence-badge evidence-badge-milestone"
                  onClick={() => setShowMilestoneModal(true)}
                  type="button"
                >
                  Milestone
                </button>
              ) : null}
            </div>
            <h3>
              <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                {item.title}
              </a>
            </h3>
            <p>{item.summary}</p>
            <div className="evidence-source">
              <span>Source: {formatSource(item.source)}</span>
            </div>
            <div className="evidence-tertiary">
              <div className="evidence-footer">
                <span className={`effect effect-${item.effect}`}>
                  {item.effect === 'advance' ? 'Closer to midnight' : 'Farther from midnight'}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>

      {showMilestoneModal && (
        <div
          className="definition-modal-backdrop"
          onClick={() => setShowMilestoneModal(false)}
        >
          <div
            className="definition-modal"
            role="dialog"
            aria-labelledby="milestone-title"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="definition-modal-header">
              <h2 id="milestone-title" className="eyebrow">
                Concept: Milestone
              </h2>
              <button
                className="definition-modal-close"
                onClick={() => setShowMilestoneModal(false)}
                aria-label="Close dialog"
                type="button"
              >
                ×
              </button>
            </div>
            <div className="definition-modal-copy">
              <div className="definition-block">
                <h3>Milestone Event</h3>
                <p>
                  A milestone event (or "shock") represents a discrete, significant event in the timeline of AI development. These are specific occurrences, such as a major model release, a breakthrough paper, or a key regulatory decision, that act as sudden catalysts.
                </p>
                <p>
                  Unlike slow variables (which measure gradual, continuous trends like compute cost or overall job exposure), milestones are distinct moments in time that the Bulletin considers when setting the Doomsday Clock.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
