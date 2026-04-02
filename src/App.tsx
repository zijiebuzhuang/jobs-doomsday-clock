import { useEffect, useState } from 'react'
import ClockPanel from './components/ClockPanel'
import NewsFeed from './components/NewsFeed'
import OccupationList from './components/OccupationList'
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
      {data.newsFeed && data.newsFeed.length > 0 && (
        <NewsFeed items={data.newsFeed} newsAdjustment={data.newsAdjustment} generatedAt={data.generatedAt} />
      )}
      <OccupationList occupations={data.occupations} />
      <SiteFooter />
      {selectedOccupation && (
        <OccupationCard occupation={selectedOccupation} onClose={() => setSelectedOccupation(null)} />
      )}
    </main>
  )
}
