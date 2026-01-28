import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import DealDetail from './pages/DealDetail'
import './index.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/deal/:id" element={<DealDetail />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
