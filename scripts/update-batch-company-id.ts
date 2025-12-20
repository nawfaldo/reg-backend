import { prisma } from '../src/db';

async function updateBatchCompanyIds() {
  console.log('Updating batch companyIds from batchSources...');
  
  // Get all batches
  const batches = await prisma.batch.findMany({
    include: {
      batchSources: {
        include: {
          farmerGroup: {
            select: {
              companyId: true,
            },
          },
        },
      },
    },
  });

  console.log(`Found ${batches.length} batches to check`);

  let updated = 0;
  for (const batch of batches) {
    // Skip if batch already has companyId
    if (batch.companyId) {
      continue;
    }

    // Try to get companyId from batchSources
    if (batch.batchSources.length > 0) {
      const companyId = batch.batchSources[0].farmerGroup?.companyId;
      if (companyId) {
        await prisma.batch.update({
          where: { id: batch.id },
          data: { companyId },
        });
        console.log(`Updated batch ${batch.id} (lotCode: ${batch.lotCode}) with companyId: ${companyId}`);
        updated++;
      } else {
        console.log(`Warning: Batch ${batch.id} has no companyId in batchSources`);
      }
    } else {
      console.log(`Warning: Batch ${batch.id} (lotCode: ${batch.lotCode}) has no batchSources, cannot determine companyId`);
    }
  }

  console.log(`Done! Updated ${updated} batches`);
}

updateBatchCompanyIds()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

