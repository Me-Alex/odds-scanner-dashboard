import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/password'

const db = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create admin users
  const adminEmails = [
    { email: 'admin@arbdesk.com', name: 'Admin', password: 'Admin123!' },
    { email: 'me.alex.21.3@gmail.com', name: 'Alex', password: 'Admin123!' },
  ]

  for (const admin of adminEmails) {
    const existing = await db.user.findUnique({ where: { email: admin.email } })
    if (!existing) {
      const passwordHash = await hashPassword(admin.password)
      await db.user.create({
        data: {
          email: admin.email,
          name: admin.name,
          passwordHash,
          role: 'admin',
          subscriptionTier: 'enterprise',
          isActive: true,
        },
      })
      console.log(`Created admin user: ${admin.email}`)
    } else {
      console.log(`Admin user already exists: ${admin.email}`)
    }
  }

  // Create a demo regular user
  const testUser = await db.user.findUnique({ where: { email: 'test@example.com' } })
  if (!testUser) {
    const passwordHash = await hashPassword('Test123!')
    await db.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        passwordHash,
        role: 'user',
        subscriptionTier: 'free',
        isActive: true,
      },
    })
    console.log('Created test user: test@example.com')
  }

  // Create demo scraping logs
  const providers = ['winner', 'superbet', 'fortuna', 'digitain', 'nsoft', 'egt']
  const statuses: Array<'success' | 'error' | 'partial'> = ['success', 'success', 'success', 'partial', 'error', 'success']

  for (let i = 0; i < providers.length; i++) {
    const existing = await db.scrapingLog.findFirst({
      where: { provider: providers[i] },
    })
    if (!existing) {
      await db.scrapingLog.create({
        data: {
          provider: providers[i],
          status: statuses[i],
          eventsFound: statuses[i] === 'error' ? 0 : 40 + Math.floor(Math.random() * 60),
          durationMs: statuses[i] === 'error' ? null : 800 + Math.floor(Math.random() * 2000),
          createdAt: new Date(Date.now() - i * 7200000),
        },
      })
    }
  }

  console.log('Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })