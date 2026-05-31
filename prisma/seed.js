import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  await prisma.medicine.createMany({
    data: [
      { name: 'Isotretinoin', genericName: 'Isotretinoin', dosageForms: ['capsule'], unitPrice: 45000 },
      { name: 'Adapalene Gel', genericName: 'Adapalene', dosageForms: ['gel'], unitPrice: 30000 },
      { name: 'Clindamycin Lotion', genericName: 'Clindamycin', dosageForms: ['lotion'], unitPrice: 25000 },
    ],
    skipDuplicates: true,
  });

  console.log('Seed complete: settings + medicines.');
}
main().finally(() => prisma.$disconnect());
