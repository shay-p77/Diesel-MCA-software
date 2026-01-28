import './FilterBar.css'

export type StatusFilter = 'all' | 'pending' | 'under_review' | 'approved' | 'declined'
export type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'name_asc'

interface FilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  statusFilter: StatusFilter
  onStatusChange: (status: StatusFilter) => void
  industryFilter: string
  onIndustryChange: (industry: string) => void
  industries: string[]
  sortBy: SortOption
  onSortChange: (sort: SortOption) => void
}

export default function FilterBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  industryFilter,
  onIndustryChange,
  industries,
  sortBy,
  onSortChange
}: FilterBarProps) {
  return (
    <div className="filters-bar">
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
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
        </select>

        <select
          value={industryFilter}
          onChange={(e) => onIndustryChange(e.target.value)}
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
        >
          <option value="date_desc">Newest First</option>
          <option value="date_asc">Oldest First</option>
          <option value="amount_desc">Highest Amount</option>
          <option value="amount_asc">Lowest Amount</option>
          <option value="name_asc">Name A-Z</option>
        </select>
      </div>
    </div>
  )
}
