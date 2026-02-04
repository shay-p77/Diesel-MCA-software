import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'
// @ts-ignore - mark.js doesn't have type definitions
import Mark from 'mark.js'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import './PDFViewer.css'

// Set up the worker - using local file from public directory
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface PDFViewerProps {
  pdfUrl: string
  fileName: string
}

export default function PDFViewer({ pdfUrl }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<number[]>([])
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0)
  const [scale, setScale] = useState(1.0)
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const pdfDocumentRef = useRef<HTMLDivElement>(null)
  const markInstanceRef = useRef<Mark | null>(null)

  function onDocumentLoadSuccess(pdf: PDFDocumentProxy) {
    setNumPages(pdf.numPages)
    setPdfDocument(pdf)
  }

  const handleSearch = useCallback(async () => {
    if (!searchText.trim() || !pdfDocument) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    const query = searchText.toLowerCase()
    const results: number[] = []

    try {
      // Search through each page
      for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i)
        const textContent = await page.getTextContent()

        // Combine all text items into a single string
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ')
          .toLowerCase()

        // Check if this page contains the search term
        if (pageText.includes(query)) {
          results.push(i)
        }
      }

      setSearchResults(results)
      setCurrentSearchIndex(0)
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setIsSearching(false)
    }
  }, [searchText, pdfDocument])

  const nextSearchResult = () => {
    if (searchResults.length === 0) return
    const nextIndex = (currentSearchIndex + 1) % searchResults.length
    setCurrentSearchIndex(nextIndex)
  }

  const prevSearchResult = () => {
    if (searchResults.length === 0) return
    const prevIndex = currentSearchIndex === 0 ? searchResults.length - 1 : currentSearchIndex - 1
    setCurrentSearchIndex(prevIndex)
  }

  const zoomIn = () => setScale(s => Math.min(s + 0.1, 2.0))
  const zoomOut = () => setScale(s => Math.max(s - 0.1, 0.5))

  const clearSearch = () => {
    setSearchText('')
    setSearchResults([])
    setCurrentSearchIndex(0)
    if (markInstanceRef.current) {
      markInstanceRef.current.unmark()
    }
  }

  // Highlight search results when search text changes
  useEffect(() => {
    if (!searchText.trim() || searchResults.length === 0) {
      // Clear any existing highlights
      if (markInstanceRef.current) {
        markInstanceRef.current.unmark()
      }
      return
    }

    // Wait for the text layers to fully render, then highlight across all pages
    const timer = setTimeout(() => {
      if (pdfDocumentRef.current) {
        // Find all text layer elements (for continuous scroll, there are multiple)
        const textLayers = pdfDocumentRef.current.querySelectorAll('.react-pdf__Page__textContent')

        textLayers.forEach(textLayer => {
          // Create mark instance on the text layer
          const markInstance = new Mark(textLayer)

          // Highlight the search term
          markInstance.mark(searchText, {
            className: 'search-highlight',
            acrossElements: true,
            separateWordSearch: false,
            caseSensitive: false,
          })
        })
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [searchText, searchResults, numPages])

  // Memoize file config to avoid unnecessary reloads
  const fileConfig = useMemo(() => ({
    url: pdfUrl,
  }), [pdfUrl])

  const pdfOptions = useMemo(() => ({}), [])

  // Render all pages for continuous scroll
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

  return (
    <div className="pdf-viewer-container">
      <div className="pdf-toolbar">
        <div className="search-section">
          <div className="search-input-wrapper">
            <input
              type="text"
              placeholder="Search in PDF..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="pdf-search-input"
            />
            {searchText && (
              <button onClick={clearSearch} className="search-clear-btn" title="Clear search">
                ×
              </button>
            )}
          </div>
          <button onClick={handleSearch} className="search-btn" disabled={isSearching}>
            {isSearching ? 'Searching...' : 'Search'}
          </button>
          {searchResults.length > 0 && (
            <div className="search-nav">
              <button onClick={prevSearchResult}>←</button>
              <span>{currentSearchIndex + 1} of {searchResults.length}</span>
              <button onClick={nextSearchResult}>→</button>
            </div>
          )}
        </div>

        <div className="pdf-controls">
          <button onClick={zoomOut} title="Zoom Out">−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} title="Zoom In">+</button>

          {numPages && numPages > 0 && (
            <div className="page-info">
              <span>{numPages} pages</span>
            </div>
          )}
        </div>
      </div>

      <div className="pdf-document continuous-scroll" ref={pdfDocumentRef}>
        <Document
          file={fileConfig}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="pdf-loading">Loading PDF...</div>}
          error={<div className="pdf-error">Failed to load PDF.</div>}
          options={pdfOptions}
        >
          {renderAllPages()}
        </Document>
      </div>
    </div>
  )
}
