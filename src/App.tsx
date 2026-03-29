import { useEffect, useState } from 'react'
import ClockPanel from './components/ClockPanel'
import OccupationList from './components/OccupationList'
import ReferenceNewsList from './components/ReferenceNewsList'
import SiteFooter from './components/SiteFooter'
import OccupationCard from './components/OccupationCard'
import type { ClockData, OccupationItem } from './types'

export default function App() {
  const [data, setData] = useState<ClockData | null>(null)
  const [selectedOccupation, setSelectedOccupation] = useState<OccupationItem | null>(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data.json`)
      .then(res => res.json())
      .then(setData)
      .catch(console.error)
  }, [])

  if (!data) {
    return <div className="app-shell">Loading...</div>
  }

  return (
    <main className="app-shell">
      <ClockPanel data={data} onOccupationSelect={setSelectedOccupation} />
      <OccupationList occupations={data.occupations} />
      <ReferenceNewsList items={data.referenceNews} />
      <SiteFooter />
      {selectedOccupation && (
        <OccupationCard occupation={selectedOccupation} onClose={() => setSelectedOccupation(null)} />
      )}
    </main>
  )
}
