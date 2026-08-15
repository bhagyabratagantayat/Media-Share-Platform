import { PrismaClient, OrgType, Role } from '@prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { env } from '../src/config/env';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting safe development database seeding...');

  const adminEmail = env.SEED_ADMIN_EMAIL.toLowerCase().trim();
  const adminPassword = env.SEED_ADMIN_PASSWORD;
  const adminPasswordHash = await hashPassword(adminPassword);

  // 1. Create or update Platform Admin User
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'Platform Administrator',
      email: adminEmail,
      passwordHash: adminPasswordHash,
      isPlatformAdmin: true,
      emailVerifiedAt: new Date(),
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Platform Admin verified: ${adminUser.email}`);

  // 2. Create Demo User
  const demoUserEmail = 'student@example.test';
  const demoUserPasswordHash = await hashPassword('StudentPassword123!');
  const demoUser = await prisma.user.upsert({
    where: { email: demoUserEmail },
    update: {},
    create: {
      name: 'Demo Student',
      email: demoUserEmail,
      passwordHash: demoUserPasswordHash,
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Demo User verified: ${demoUser.email}`);

  // 3. Create Demo Organisation A
  const orgASlug = 'demo-college';
  const orgAPassHash = await hashPassword('CollegeAccessPass2026!');
  const orgA = await prisma.organisation.upsert({
    where: { slug: orgASlug },
    update: {},
    create: {
      name: 'Demo Engineering College',
      slug: orgASlug,
      type: OrgType.COLLEGE,
      officialEmail: 'info@demo-college.test',
      description: 'A prestigious engineering college campus for media demo testing.',
      status: 'ACTIVE',
      accessSettings: {
        create: {
          passwordHash: orgAPassHash,
          enabled: true,
        },
      },
      members: {
        create: [
          {
            userId: adminUser.id,
            role: Role.ORGANISATION_OWNER,
            status: 'ACTIVE',
          },
          {
            userId: demoUser.id,
            role: Role.USER,
            status: 'ACTIVE',
          },
        ],
      },
    },
  });
  console.log(`✅ Demo Organisation A verified: ${orgA.slug}`);

  // 4. Create Demo Organisation B (for cross-tenant isolation testing)
  const orgBSlug = 'demo-university';
  const orgBPassHash = await hashPassword('UniversityAccessPass2026!');
  const orgB = await prisma.organisation.upsert({
    where: { slug: orgBSlug },
    update: {},
    create: {
      name: 'Demo State University',
      slug: orgBSlug,
      type: OrgType.UNIVERSITY,
      officialEmail: 'info@demo-university.test',
      description: 'A separate isolated university media tenant.',
      status: 'ACTIVE',
      accessSettings: {
        create: {
          passwordHash: orgBPassHash,
          enabled: true,
        },
      },
      members: {
        create: [
          {
            userId: adminUser.id,
            role: Role.ORGANISATION_OWNER,
            status: 'ACTIVE',
          },
        ],
      },
    },
  });
  console.log(`✅ Demo Organisation B verified: ${orgB.slug}`);

  console.log('🎉 Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
