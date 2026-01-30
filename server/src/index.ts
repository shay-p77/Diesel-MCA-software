import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import dealsRouter from './routes/deals.js'
import { seedDemoData } from './store/deals.js'
import { connectToDatabase, isConnected } from './db/connection.js'
import { getKoncileService } from './services/koncile.js'

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api/deals', dealsRouter)

// Health check
app.get('/api/health', async (_req, res) => {
  let koncileStatus = 'unknown'

  try {
    const koncile = getKoncileService()
    const isValid = await koncile.checkApiKey()
    koncileStatus = isValid ? 'connected' : 'invalid_key'
  } catch (e) {
    koncileStatus = 'error'
  }

  res.json({
    status: 'ok',
    message: 'Amkus API is running',
    services: {
      koncile: koncileStatus,
      claude: process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here'
        ? 'configured'
        : 'not_configured',
      mongodb: isConnected() ? 'connected' : 'not_connected',
    },
  })
})

// Start server
async function start() {
  // Connect to MongoDB
  try {
    await connectToDatabase()
  } catch (error) {
    console.warn('MongoDB connection failed, using in-memory storage')
  }

  app.listen(PORT, async () => {
    console.log(`Amkus API running on http://localhost:${PORT}`)
    console.log('')
    console.log('Services:')
    console.log(`  MongoDB: ${isConnected() ? 'Connected' : 'Not connected (using in-memory)'}`)
    console.log('')
    console.log('Endpoints:')
    console.log(`  GET  /api/health`)
    console.log(`  GET  /api/deals`)
    console.log(`  POST /api/deals`)
    console.log(`  GET  /api/deals/:id`)
    console.log(`  POST /api/deals/:id/upload`)
    console.log(`  GET  /api/deals/:id/extraction`)
    console.log(`  POST /api/deals/:id/chat`)
    console.log('')

    // Seed demo data if empty
    await seedDemoData()
  })
}

start()
