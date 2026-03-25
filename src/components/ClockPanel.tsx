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
  const [hours, minutes] = data.displayTime.split(':').map(Number)
  const totalMinutes = hours * 60 + minutes
  const minuteAngle = (angleForMinutes(totalMinutes, 60) * 180) / Math.PI
  const hourAngle = (angleForMinutes(totalMinutes, 720) * 180) / Math.PI

  return (
    <section className="panel">
      <div className="clock-hero">
        <div>
          <p className="eyebrow">AI Jobs Doomsday Clock</p>
        </div>

        <div className="clock-stage">
          <div className="clock-face">
            <svg viewBox="0 0 400 400" className="clock-svg" role="img" aria-label={`Clock reads ${data.displayTime}`}>
              <circle cx="200" cy="200" r="196" className="clock-ring" />
              {marks.map((mark, index) => (
                <circle key={index} cx={mark.x} cy={mark.y} r="20" className="clock-mark" />
              ))}
              <g transform={`rotate(${hourAngle} 200 200)`}>
                <rect x="188" y="74" width="24" height="126" rx="4" className="clock-hour-hand" />
              </g>
              <g transform={`rotate(${minuteAngle} 200 200)`}>
                <rect x="195" y="18" width="10" height="182" rx="2.5" className="clock-minute-hand" />
              </g>
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
    </section>
  )
}
