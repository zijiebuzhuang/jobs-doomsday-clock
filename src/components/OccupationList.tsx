import { useState } from 'react'
import type { OccupationItem } from '../types'

type OccupationListProps = {
  occupations: OccupationItem[]
}

export default function OccupationList({ occupations }: OccupationListProps) {
  const [visibleCount, setVisibleCount] = useState(9)

  const visibleOccupations = occupations.slice(0, visibleCount)
  const hasMore = visibleCount < occupations.length

  const handleShowMore = () => {
    setVisibleCount(prev => Math.min(prev + 9, occupations.length))
  }

  return (
    <section className="occupation-section">
      <h2 className="section-title">Occupational Exposure</h2>
      <div className="occupation-grid">
        {visibleOccupations.map((occ) => (
          <article key={occ.title} className="occupation-card">
            <div className="occupation-card-header">
              <span className="occupation-exposure">Exposure {occ.exposure}/10</span>
              <span className="occupation-jobs">{occ.jobs.toLocaleString()} jobs</span>
            </div>
            <h3>
              <a href={occ.url} target="_blank" rel="noopener noreferrer">
                {occ.title}
              </a>
            </h3>
            <p className="occupation-source">Source: Bureau of Labor Statistics</p>
            <div className="occupation-tertiary">
              {occ.category ? <span className="occupation-badge">{occ.category}</span> : null}
              {occ.outlook !== undefined ? (
                <span className={`occupation-badge ${occ.outlook < 0 ? 'occupation-badge-negative' : 'occupation-badge-muted'}`}>
                  {occ.outlook}%
                </span>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {hasMore && (
        <div className="news-feed-more">
          <button
            className="news-feed-more-btn"
            onClick={handleShowMore}
          >
            Show more occupations ({occupations.length - visibleCount} hidden)
          </button>
        </div>
      )}
    </section>
  )
}
