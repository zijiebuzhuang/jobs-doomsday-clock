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
  return (
    <section className="reference-news-section">
      <h2 className="section-title">Reference News Feed</h2>
      <div className="reference-news-list">
        {items.map((item) => (
          <article key={item.id} className="reference-news-item">
            <div className="evidence-date">
              <span className="evidence-date-main">{formatDate(item.date)}</span>
              {item.contributionType === 'shock' ? <span className="evidence-badge evidence-badge-milestone">Milestone</span> : null}
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
    </section>
  )
}
