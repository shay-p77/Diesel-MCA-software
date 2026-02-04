import './FilterBar.css'

export type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'name_asc'
export type StatusFilter = 'all' | 'pending' | 'under_review' | 'approved' | 'declined'
export type NSFFilter = 'all' | '0' | '1-2' | '3+'
export type PositionFilter = 'all' | '0' | '1-2' | '3+'
export type AmountRange = 'all' | '0-25k' | '25k-50k' | '50k-100k' | '100k+'

interface FilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  industryFilter: string
  onIndustryChange: (industry: string) => void
  industries: string[]
  sortBy: SortOption
  onSortChange: (sort: SortOption) => void
  statusFilter: StatusFilter
  onStatusChange: (status: StatusFilter) => void
  nsfFilter: NSFFilter
  onNSFChange: (nsf: NSFFilter) => void
  positionFilter: PositionFilter
  onPositionChange: (position: PositionFilter) => void
  amountRange: AmountRange
  onAmountRangeChange: (range: AmountRange) => void
}

export default function FilterBar({
  searchQuery,
  onSearchChange,
  industryFilter,
  onIndustryChange,
  industries,
  sortBy,
  onSortChange,
  statusFilter,
  onStatusChange,
  nsfFilter,
  onNSFChange,
  positionFilter,
  onPositionChange,
  amountRange,
  onAmountRangeChange
}: FilterBarProps) {
  return (
    <div className="filters-bar">
      <div className="filters-row">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search deals..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
            className="filter-select"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
          </select>

          <select
            value={industryFilter}
            onChange={(e) => onIndustryChange(e.target.value)}
            className="filter-select"
          >
            {industries.map(ind => (
              <option key={ind} value={ind}>
                {ind === 'all' ? 'All Industries' : ind}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="filter-select"
          >
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
            <option value="amount_desc">Highest Amount</option>
            <option value="amount_asc">Lowest Amount</option>
            <option value="name_asc">Name A-Z</option>
          </select>
        </div>
      </div>

      <div className="filters-row secondary">
        <div className="filter-group">
          <label className="filter-label">Amount:</label>
          <select
            value={amountRange}
            onChange={(e) => onAmountRangeChange(e.target.value as AmountRange)}
            className="filter-select small"
          >
            <option value="all">Any</option>
            <option value="0-25k">$0 - $25k</option>
            <option value="25k-50k">$25k - $50k</option>
            <option value="50k-100k">$50k - $100k</option>
            <option value="100k+">$100k+</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">NSFs:</label>
          <select
            value={nsfFilter}
            onChange={(e) => onNSFChange(e.target.value as NSFFilter)}
            className="filter-select small"
          >
            <option value="all">Any</option>
            <option value="0">0 (Clean)</option>
            <option value="1-2">1-2</option>
            <option value="3+">3+</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Positions:</label>
          <select
            value={positionFilter}
            onChange={(e) => onPositionChange(e.target.value as PositionFilter)}
            className="filter-select small"
          >
            <option value="all">Any</option>
            <option value="0">0 (Clean)</option>
            <option value="1-2">1-2</option>
            <option value="3+">3+</option>
          </select>
        </div>
      </div>
    </div>
  )
}
