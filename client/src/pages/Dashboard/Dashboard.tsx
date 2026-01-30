import { useState, useEffect, useMemo } from 'react'
import Header from '../../components/Header'
import FilterBar, { SortOption } from '../../components/FilterBar'
import StatsRow from '../../components/StatsRow'
import DealCard from '../../components/DealCard'
import DealModal from '../../components/DealModal'
import { api } from '../../services/api'
import { Deal } from '../../types'
import './Dashboard.css'

export default function Dashboard() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [industryFilter, setIndustryFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortOption>('date_desc')

  // Fetch deals from API
  useEffect(() => {
    const fetchDeals = async () => {
      try {
        setLoading(true)
        const data = await api.getDeals()
        setDeals(data)
        setError(null)
      } catch (err: any) {
        setError(err.message || 'Failed to load deals')
        console.error('Failed to fetch deals:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchDeals()
  }, [])

  const industries = useMemo(() => {
    const set = new Set(deals.map(d => d.industry))
    return ['all', ...Array.from(set)]
  }, [deals])

  const filteredDeals = useMemo(() => {
    let filtered = [...deals]

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(d =>
        d.businessName.toLowerCase().includes(query) ||
        (d.broker && d.broker.toLowerCase().includes(query))
      )
    }

    if (industryFilter !== 'all') {
      filtered = filtered.filter(d => d.industry === industryFilter)
    }

    filtered.sort((a, b) => {
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

    return filtered
  }, [deals, searchQuery, industryFilter, sortBy])

  const handleNewDeal = () => {
    setIsModalOpen(true)
  }

  const handleDealSaved = (deal: Deal) => {
    setDeals(prev => {
      const exists = prev.find(d => d.id === deal.id)
      if (exists) {
        return prev.map(d => d.id === deal.id ? deal : d)
      }
      return [deal, ...prev]
    })
  }

  if (loading) {
    return (
      <div className="dashboard">
        <Header onNewDeal={handleNewDeal} />
        <div className="loading-state">Loading deals...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="dashboard">
        <Header onNewDeal={handleNewDeal} />
        <div className="error-state">
          <p>Failed to load deals: {error}</p>
          <p className="error-hint">Make sure the backend server is running on port 5000</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <Header onNewDeal={handleNewDeal} />

      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        industryFilter={industryFilter}
        onIndustryChange={setIndustryFilter}
        industries={industries}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      <StatsRow deals={deals} />

      <div className="deals-list">
        {filteredDeals.map(deal => (
          <DealCard key={deal.id} deal={deal} />
        ))}

        {filteredDeals.length === 0 && (
          <div className="no-results">
            {deals.length === 0 ? 'No deals yet. Click "+ New Deal" to get started.' : 'No deals match your filters'}
          </div>
        )}
      </div>

      <DealModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleDealSaved}
      />
    </div>
  )
}
