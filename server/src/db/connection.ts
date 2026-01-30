import mongoose from 'mongoose'

export async function connectToDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI

  if (!uri) {
    console.warn('MONGODB_URI not set - using in-memory storage')
    return
  }

  try {
    await mongoose.connect(uri, {
      dbName: 'diesel-mca',
    })
    console.log('Connected to MongoDB')
  } catch (error) {
    console.error('MongoDB connection error:', error)
    throw error
  }
}

export function isConnected(): boolean {
  return mongoose.connection.readyState === 1
}
