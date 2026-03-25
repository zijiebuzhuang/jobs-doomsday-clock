import type { ClockData } from '../types'

type OccupationListProps = {
  occupations: ClockData['topExposures']
}

export default function OccupationList({ occupations }: OccupationListProps) {
  return (
    <div className="occupation-section">
      <h2 className="section-title">Highest AI Exposure Occupations</h2>
      <div className="occupation-list">
        {occupations.map((occ) => (
          <div key={occ.title} className="occupation-item">
            <h3>
              <a href={occ.url} target="_blank" rel="noopener noreferrer">
                {occ.title}
              </a>
            </h3>
            <div className="occupation-meta">
              <span>Exposure: {occ.exposure}/10</span>
              <span>Jobs: {(occ.jobs / 1000).toFixed(0)}K</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
