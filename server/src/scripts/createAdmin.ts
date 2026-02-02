import 'dotenv/config'
import { connectToDatabase } from '../db/connection.js'
import { UserModel } from '../db/models/User.js'
import { hashPassword } from '../utils/auth.js'

async function createAdmin() {
  try {
    await connectToDatabase()
    console.log('Connected to database')

    // Check if admin already exists
    const existingAdmin = await UserModel.findOne({ email: 'admin@dieselmca.com' })
    if (existingAdmin) {
      console.log('Admin user already exists!')
      console.log('Email:', existingAdmin.email)

      // Update existing admin to ensure passwordSetup is true
      if (!existingAdmin.passwordSetup) {
        existingAdmin.passwordSetup = true
        await existingAdmin.save()
        console.log('✓ Updated admin user with passwordSetup flag')
      }

      process.exit(0)
    }

    // Create admin user
    const hashedPassword = await hashPassword('admin123')
    const admin = await UserModel.create({
      email: 'admin@dieselmca.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'admin',
      passwordSetup: true,
    })

    console.log('\n✓ Admin user created successfully!')
    console.log('\nLogin credentials:')
    console.log('  Email:', admin.email)
    console.log('  Password: admin123')
    console.log('\n⚠️  IMPORTANT: Change the password after first login!\n')

    process.exit(0)
  } catch (error) {
    console.error('Error creating admin:', error)
    process.exit(1)
  }
}

createAdmin()
