import { useEffect, useState } from 'react'
import ClockPanel from './components/ClockPanel'
import OccupationList from './components/OccupationList'
import ReferenceNewsList from './components/ReferenceNewsList'
import SiteFooter from './components/SiteFooter'
import type { ClockData } from './types'

export default function App() {
  const [data, setData] = useState<ClockData | null>(null)

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
      <ClockPanel data={data} />
      <OccupationList occupations={data.occupations} />
      <ReferenceNewsList items={data.referenceNews} />
      <SiteFooter />
    </main>
  )
}
