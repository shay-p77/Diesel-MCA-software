import { useState, useCallback, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import './PDFViewer.css'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export interface CrossStatementResult {
  statementIndex: number
  label: string
  count: number
}

interface PDFViewerProps {
  pdfUrl: string
  fileName: string
  savedScrollPosition?: number
  onScrollContainerRef?: (ref: HTMLDivElement | null) => void
  onSearchTermChange?: (term: string) => void
  crossStatementResults?: CrossStatementResult[]
  onSwitchStatement?: (index: number) => void
  initialSearchTerm?: string
}

/**
 * Count occurrences of `query` (already lowercased) in `text` (already lowercased).
 * This ONE function is used for both highlighting AND cross-document counts
 * so the numbers always match exactly.
 */
export function countOccurrences(text: string, query: string): number {
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(query, pos)) !== -1) {
    count++
    pos += query.length
  }
  return count
}

export default function PDFViewer({
  pdfUrl,
  savedScrollPosition = 0,
  onScrollContainerRef,
  onSearchTermChange,
  crossStatementResults,
  onSwitchStatement,
  initialSearchTerm = '',
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [searchText, setSearchText] = useState(initialSearchTerm)
  const [matchCount, setMatchCount] = useState(0)
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [scale, setScale] = useState(1.9)
  const [isSearching, setIsSearching] = useState(false)
  const [showFloatingNav, setShowFloatingNav] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const matchRanges = useRef<Range[]>([])
  const hasAutoSearched = useRef(false)
  const prevScale = useRef(1.9)

  // ── Register scroll container with parent ──
  useEffect(() => {
    if (onScrollContainerRef && containerRef.current) {
      onScrollContainerRef(containerRef.current)
    }
    return () => { if (onScrollContainerRef) onScrollContainerRef(null) }
  }, [onScrollContainerRef])

  // ── Show floating nav when scrolled down ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => setShowFloatingNav(el.scrollTop > 150)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [numPages])

  // ── Clear all highlights (no DOM modification needed!) ──
  const clearHighlights = useCallback(() => {
    try {
      (CSS as any).highlights?.delete('search-results')
      ;(CSS as any).highlights?.delete('search-current')
    } catch { /* ignore if API unavailable */ }
    matchRanges.current = []
  }, [])

  // ── Walk text nodes in text layers, create Range objects for each match ──
  // Uses CSS Custom Highlight API — no DOM modification at all.
  // The browser natively positions highlights on the text, which works
  // perfectly with pdfjs's absolute positioning and CSS transforms.
  const applyHighlights = useCallback((term: string): number => {
    if (!containerRef.current || !term.trim()) return 0

    if (!(CSS as any).highlights) {
      console.warn('CSS Custom Highlight API not supported')
      return 0
    }

    const query = term.toLowerCase()
    const ranges: Range[] = []

    containerRef.current
      .querySelectorAll('.react-pdf__Page__textContent')
      .forEach(textLayer => {
        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT)
        let node: Text | null
        while ((node = walker.nextNode() as Text | null)) {
          const text = node.textContent || ''
          const lower = text.toLowerCase()
          let idx = 0
          while ((idx = lower.indexOf(query, idx)) !== -1) {
            try {
              const range = new Range()
              range.setStart(node, idx)
              range.setEnd(node, idx + query.length)
              ranges.push(range)
            } catch { /* skip if range creation fails */ }
            idx += query.length
          }
        }
      })

    matchRanges.current = ranges

    // Register all-results highlight
    if (ranges.length > 0) {
      const allHighlight = new (window as any).Highlight(...ranges)
      allHighlight.priority = 0
      ;(CSS as any).highlights.set('search-results', allHighlight)
    }

    return ranges.length
  }, [])

  // ── Scroll to a specific match index ──
  const scrollToMatch = useCallback((index: number) => {
    const ranges = matchRanges.current
    if (ranges.length === 0 || index < 0 || index >= ranges.length) return

    // Set current-match highlight (higher priority paints on top)
    try {
      const currentHl = new (window as any).Highlight(ranges[index])
      currentHl.priority = 1
      ;(CSS as any).highlights.set('search-current', currentHl)
    } catch { /* ignore */ }

    // Scroll the range into view using its bounding rect
    const rect = ranges[index].getBoundingClientRect()
    const container = containerRef.current
    if (container && rect) {
      const containerRect = container.getBoundingClientRect()
      container.scrollTo({
        top: container.scrollTop + rect.top - containerRect.top - containerRect.height / 2 + rect.height / 2,
        behavior: 'smooth',
      })
    }

    setCurrentMatchIndex(index)
  }, [])

  // ── Execute search (Enter key or Search button) ──
  const executeSearch = useCallback(() => {
    if (!containerRef.current) return

    clearHighlights()

    const term = searchText.trim()
    if (!term) {
      setMatchCount(0)
      setCurrentMatchIndex(0)
      if (onSearchTermChange) onSearchTermChange('')
      return
    }

    setIsSearching(true)

    // Brief delay for text layers to finish rendering
    setTimeout(() => {
      const count = applyHighlights(term)
      setMatchCount(count)
      setCurrentMatchIndex(0)
      setIsSearching(false)

      if (count > 0) scrollToMatch(0)
      if (onSearchTermChange) onSearchTermChange(term)
    }, 300)
  }, [searchText, clearHighlights, applyHighlights, scrollToMatch, onSearchTermChange])

  // ── PDF document loaded ──
  function onDocumentLoadSuccess(pdf: PDFDocumentProxy) {
    setNumPages(pdf.numPages)

    // Auto-search when arriving with an active search term (switching statements)
    if (initialSearchTerm && !hasAutoSearched.current) {
      hasAutoSearched.current = true
      setTimeout(() => {
        if (!containerRef.current) return
        clearHighlights()
        const count = applyHighlights(initialSearchTerm)
        setMatchCount(count)
        setCurrentMatchIndex(0)
        if (count > 0) scrollToMatch(0)
        if (onSearchTermChange) onSearchTermChange(initialSearchTerm)
      }, 800)
    } else if (savedScrollPosition > 0 && containerRef.current) {
      setTimeout(() => {
        if (containerRef.current) containerRef.current.scrollTop = savedScrollPosition
      }, 300)
    }
  }

  // ── Re-apply highlights after zoom (pages re-render, old text nodes gone) ──
  useEffect(() => {
    if (prevScale.current === scale) return
    prevScale.current = scale

    if (!searchText.trim() || matchCount === 0) return

    const timer = setTimeout(() => {
      clearHighlights()
      const count = applyHighlights(searchText)
      setMatchCount(count)
      if (count > 0) {
        scrollToMatch(Math.min(currentMatchIndex, count - 1))
      }
    }, 600)

    return () => clearTimeout(timer)
  }, [scale]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation arrows ──
  const nextMatch = () => {
    if (matchCount === 0) return
    scrollToMatch((currentMatchIndex + 1) % matchCount)
  }
  const prevMatchFn = () => {
    if (matchCount === 0) return
    scrollToMatch(currentMatchIndex === 0 ? matchCount - 1 : currentMatchIndex - 1)
  }

  // ── Zoom ──
  const zoomIn = () => setScale(s => Math.min(s + 0.1, 3.0))
  const zoomOut = () => setScale(s => Math.max(s - 0.1, 0.5))

  // ── Clear search ──
  const clearSearch = () => {
    setSearchText('')
    setMatchCount(0)
    setCurrentMatchIndex(0)
    clearHighlights()
    if (onSearchTermChange) onSearchTermChange('')
  }

  // ── Stable refs for react-pdf ──
  const fileConfigRef = useRef({ url: pdfUrl })
  if (fileConfigRef.current.url !== pdfUrl) fileConfigRef.current = { url: pdfUrl }
  const pdfOptionsRef = useRef({})

  // ── Render all pages ──
  const renderAllPages = () => {
    if (!numPages) return null
    const pages = []
    for (let i = 1; i <= numPages; i++) {
      pages.push(
        <Page
          key={`page-${i}`}
          pageNumber={i}
          scale={scale}
          renderTextLayer={true}
          renderAnnotationLayer={true}
          className="pdf-page-continuous"
        />
      )
    }
    return pages
  }

  // ── Derived flags ──
  const hasResults = matchCount > 0
  const hasCrossResults = crossStatementResults && crossStatementResults.length > 0

  // ── Shared nav controls (toolbar + floating bar) ──
  const searchNavControls = (
    <>
      {hasResults && (
        <div className="search-nav">
          <button onClick={prevMatchFn} title="Previous match">&#8592;</button>
          <span>{currentMatchIndex + 1} of {matchCount}</span>
          <button onClick={nextMatch} title="Next match">&#8594;</button>
        </div>
      )}
      {hasCrossResults && (
        <div className="cross-statement-results">
          <span className="cross-statement-label">Also in:</span>
          {crossStatementResults!.map(r => (
            <button
              key={r.statementIndex}
              className="cross-statement-btn"
              onClick={() => onSwitchStatement?.(r.statementIndex)}
              title={`Switch to ${r.label}`}
            >
              {r.label} ({r.count})
            </button>
          ))}
        </div>
      )}
    </>
  )

  return (
    <div className="pdf-viewer-container">
      <div className="pdf-toolbar">
        <div className="search-section">
          <div className="search-input-wrapper">
            <input
              type="text"
              placeholder="Search in document..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && executeSearch()}
              className="pdf-search-input"
            />
            {searchText && (
              <button onClick={clearSearch} className="search-clear-btn" title="Clear search">
                &times;
              </button>
            )}
          </div>
          <button onClick={executeSearch} className="search-btn" disabled={isSearching}>
            {isSearching ? 'Searching...' : 'Search'}
          </button>
          {searchNavControls}
        </div>

        <div className="pdf-controls">
          <button onClick={zoomOut} title="Zoom Out">&minus;</button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} title="Zoom In">+</button>
          {numPages && numPages > 0 && (
            <div className="page-info">
              <span>{numPages} pages</span>
            </div>
          )}
        </div>
      </div>

      <div className="pdf-scroll-wrapper">
        <div className="pdf-document continuous-scroll" ref={containerRef}>
          <Document
            file={fileConfigRef.current}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<div className="pdf-loading">Loading PDF...</div>}
            error={<div className="pdf-error">Failed to load PDF.</div>}
            options={pdfOptionsRef.current}
          >
            {renderAllPages()}
          </Document>
        </div>

        {showFloatingNav && (hasResults || hasCrossResults) && (
          <div className="floating-search-nav">
            {searchNavControls}
          </div>
        )}
      </div>
    </div>
  )
}
