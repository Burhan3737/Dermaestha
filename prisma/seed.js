import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../server/src/lib/password/password.js';
import { ensureSettings } from '../server/src/lib/settings/ensureSettings.js';

const prisma = new PrismaClient();

const DOCTORS = [
  {
    email: 'dr.ayesha@dermestha.dev',
    fullName: 'Dr. Ayesha Khan',
    phone: '03001112233',
    pmcNumber: 'PMC-1001',
    specialization: 'Acne & Pigmentation',
    fee: 250000,
    bio: 'Consultant dermatologist focused on acne and pigmentation.',
  },
  {
    email: 'dr.bilal@dermestha.dev',
    fullName: 'Dr. Bilal Ahmed',
    phone: '03004445566',
    pmcNumber: 'PMC-1002',
    specialization: 'Eczema & Psoriasis',
    fee: 300000,
    bio: 'Specialist in chronic inflammatory skin conditions.',
  },
];

// Mon/Wed/Fri 18:00–21:00 (weekday: 0=Sun..6=Sat).
const BLOCKS = [1, 3, 5].map((weekday) => ({ weekday, startTime: '18:00', endTime: '21:00' }));

async function main() {
  await ensureSettings(prisma);

  await prisma.medicine.createMany({
    data: [
      {
        name: 'Isotretinoin',
        genericName: 'Isotretinoin',
        dosageForms: ['capsule'],
        unitPrice: 45000,
      },
      { name: 'Adapalene Gel', genericName: 'Adapalene', dosageForms: ['gel'], unitPrice: 30000 },
      {
        name: 'Clindamycin Lotion',
        genericName: 'Clindamycin',
        dosageForms: ['lotion'],
        unitPrice: 25000,
      },
    ],
    skipDuplicates: true,
  });

  const passwordHash = await hashPassword('Password123');
  for (const d of DOCTORS) {
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: {},
      create: {
        role: 'doctor',
        email: d.email,
        phone: d.phone,
        fullName: d.fullName,
        passwordHash,
        mustChangePassword: false,
      },
    });
    const doctor = await prisma.doctor.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        pmcNumber: d.pmcNumber,
        specialization: d.specialization,
        fee: d.fee,
        bio: d.bio,
        isActive: true,
        status: 'active',
      },
    });
    const count = await prisma.availabilityBlock.count({ where: { doctorId: doctor.id } });
    if (count === 0) {
      await prisma.availabilityBlock.createMany({
        data: BLOCKS.map((b) => ({ doctorId: doctor.id, ...b })),
      });
    }
  }

  await prisma.user.upsert({
    where: { email: 'admin@dermestha.dev' },
    update: {},
    create: {
      role: 'admin',
      email: 'admin@dermestha.dev',
      fullName: 'Dermestha Admin',
      passwordHash,
      mustChangePassword: false,
    },
  });

  console.log('Seed complete: settings + medicines + demo doctors + dev admin.');
}
main().finally(() => prisma.$disconnect());
