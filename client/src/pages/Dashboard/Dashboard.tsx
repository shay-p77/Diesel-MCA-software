import { useState, useEffect, useMemo } from 'react'
import Header from '../../components/Header'
import FilterBar, { SortOption, StatusFilter, NSFFilter, PositionFilter, AmountRange } from '../../components/FilterBar'
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [nsfFilter, setNSFFilter] = useState<NSFFilter>('all')
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all')
  const [amountRange, setAmountRange] = useState<AmountRange>('all')

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

  // Helper to get NSF count from deal
  const getNSFCount = (deal: Deal): number => {
    if (deal.bankAccounts && deal.bankAccounts.length > 0) {
      return deal.bankAccounts.reduce((sum, acc) => sum + (acc.bankData?.nsfs || 0), 0)
    }
    return deal.bankData?.nsfs || 0
  }

  const filteredDeals = useMemo(() => {
    let filtered = [...deals]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(d =>
        d.businessName.toLowerCase().includes(query) ||
        (d.broker && d.broker.toLowerCase().includes(query))
      )
    }

    // Industry filter
    if (industryFilter !== 'all') {
      filtered = filtered.filter(d => d.industry === industryFilter)
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(d => d.status === statusFilter)
    }

    // Amount range filter
    if (amountRange !== 'all') {
      filtered = filtered.filter(d => {
        const amount = d.amountRequested
        switch (amountRange) {
          case '0-25k':
            return amount >= 0 && amount < 25000
          case '25k-50k':
            return amount >= 25000 && amount < 50000
          case '50k-100k':
            return amount >= 50000 && amount < 100000
          case '100k+':
            return amount >= 100000
          default:
            return true
        }
      })
    }

    // NSF filter
    if (nsfFilter !== 'all') {
      filtered = filtered.filter(d => {
        const nsfs = getNSFCount(d)
        switch (nsfFilter) {
          case '0':
            return nsfs === 0
          case '1-2':
            return nsfs >= 1 && nsfs <= 2
          case '3+':
            return nsfs >= 3
          default:
            return true
        }
      })
    }

    // Position filter
    if (positionFilter !== 'all') {
      filtered = filtered.filter(d => {
        const positions = d.existingPositions?.length || 0
        switch (positionFilter) {
          case '0':
            return positions === 0
          case '1-2':
            return positions >= 1 && positions <= 2
          case '3+':
            return positions >= 3
          default:
            return true
        }
      })
    }

    // Sort
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
  }, [deals, searchQuery, industryFilter, sortBy, statusFilter, nsfFilter, positionFilter, amountRange])

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
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        nsfFilter={nsfFilter}
        onNSFChange={setNSFFilter}
        positionFilter={positionFilter}
        onPositionChange={setPositionFilter}
        amountRange={amountRange}
        onAmountRangeChange={setAmountRange}
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
