import './FilterBar.css'

export type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'name_asc'

interface FilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  industryFilter: string
  onIndustryChange: (industry: string) => void
  industries: string[]
  sortBy: SortOption
  onSortChange: (sort: SortOption) => void
}

export default function FilterBar({
  searchQuery,
  onSearchChange,
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
