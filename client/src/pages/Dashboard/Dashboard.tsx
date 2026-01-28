import { useState, useMemo } from 'react'
import Header from '../../components/Header'
import FilterBar, { StatusFilter, SortOption } from '../../components/FilterBar'
import StatsRow from '../../components/StatsRow'
import DealCard from '../../components/DealCard'
import { mockDeals } from '../../data/mockData'
import './Dashboard.css'

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [industryFilter, setIndustryFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortOption>('date_desc')

  const industries = useMemo(() => {
    const set = new Set(mockDeals.map(d => d.industry))
    return ['all', ...Array.from(set)]
  }, [])

  const filteredDeals = useMemo(() => {
    let deals = [...mockDeals]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      deals = deals.filter(d =>
        d.businessName.toLowerCase().includes(query) ||
        d.ownerName.toLowerCase().includes(query) ||
        d.industry.toLowerCase().includes(query)
      )
    }

    if (statusFilter !== 'all') {
      deals = deals.filter(d => d.status === statusFilter)
    }

    if (industryFilter !== 'all') {
      deals = deals.filter(d => d.industry === industryFilter)
    }

    deals.sort((a, b) => {
      switch (sortBy) {
        case 'date_desc':
          return new Date(b.dateSubmitted).getTime() - new Date(a.dateSubmitted).getTime()
        case 'date_asc':
          return new Date(a.dateSubmitted).getTime() - new Date(b.dateSubmitted).getTime()
        case 'amount_desc':
          return b.amountRequested - a.amountRequested
        case 'amount_asc':
          return a.amountRequested - b.amountRequested
        case 'name_asc':
          return a.businessName.localeCompare(b.businessName)
        default:
          return 0
      }
    })

    return deals
  }, [searchQuery, statusFilter, industryFilter, sortBy])

  return (
    <div className="dashboard">
      <Header />

      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        industryFilter={industryFilter}
        onIndustryChange={setIndustryFilter}
        industries={industries}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      <StatsRow deals={mockDeals} />

      <div className="deals-list">
        {filteredDeals.map(deal => (
          <DealCard key={deal.id} deal={deal} />
        ))}

        {filteredDeals.length === 0 && (
          <div className="no-results">
            No deals match your filters
          </div>
        )}
      </div>
    </div>
  )
}
