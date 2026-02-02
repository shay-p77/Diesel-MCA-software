import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'
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

export default function PDFViewer({ pdfUrl, fileName }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
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

      if (results.length > 0) {
        setPageNumber(results[0])
      }
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
    setPageNumber(searchResults[nextIndex])
  }

  const prevSearchResult = () => {
    if (searchResults.length === 0) return
    const prevIndex = currentSearchIndex === 0 ? searchResults.length - 1 : currentSearchIndex - 1
    setCurrentSearchIndex(prevIndex)
    setPageNumber(searchResults[prevIndex])
  }

  const changePage = (offset: number) => {
    setPageNumber((prevPageNumber) => {
      const newPage = prevPageNumber + offset
      return Math.min(Math.max(1, newPage), numPages || 1)
    })
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

  // Highlight search results when page or search text changes
  useEffect(() => {
    if (!searchText.trim() || searchResults.length === 0) {
      // Clear any existing highlights
      if (markInstanceRef.current) {
        markInstanceRef.current.unmark()
      }
      return
    }

    // Wait for the page text layer to fully render, then highlight
    const timer = setTimeout(() => {
      if (pdfDocumentRef.current) {
        // Find the text layer element
        const textLayer = pdfDocumentRef.current.querySelector('.react-pdf__Page__textContent')

        if (textLayer) {
          // Create mark instance on the text layer
          const markInstance = new Mark(textLayer)

          // Clear previous highlights
          markInstance.unmark()

          // Highlight the search term
          markInstance.mark(searchText, {
            className: 'search-highlight',
            acrossElements: true,
            separateWordSearch: false,
            caseSensitive: false,
          })

          markInstanceRef.current = markInstance
        }
      }
    }, 300) // Increased timeout to ensure text layer is rendered

    return () => clearTimeout(timer)
  }, [pageNumber, searchText, searchResults])

  // Memoize file and options to avoid unnecessary reloads
  const fileConfig = useMemo(() => ({
    url: pdfUrl,
    withCredentials: false,
  }), [pdfUrl])

  const pdfOptions = useMemo(() => ({}), [])

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

          <div className="page-controls">
            <button onClick={() => changePage(-1)} disabled={pageNumber <= 1}>←</button>
            <span>Page {pageNumber} of {numPages}</span>
            <button onClick={() => changePage(1)} disabled={pageNumber >= (numPages || 1)}>→</button>
          </div>
        </div>
      </div>

      <div className="pdf-document" ref={pdfDocumentRef}>
        <Document
          file={fileConfig}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="pdf-loading">Loading PDF...</div>}
          error={<div className="pdf-error">Failed to load PDF. Check console for details.</div>}
          options={pdfOptions}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
      </div>
    </div>
  )
}
