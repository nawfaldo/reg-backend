import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { prisma } from "../../db";
import { hasPermission } from "./utils";

// Helper function to update batch totalKg from batchSources
async function updateBatchTotalKg(batchId: string) {
  const batchSources = await prisma.batchSource.findMany({
    where: { batchId },
    select: { volumeKg: true },
  });

  const totalKg = batchSources.reduce((sum, source) => sum + source.volumeKg, 0);

  await prisma.batch.update({
    where: { id: batchId },
    data: { totalKg },
  });
}

export const batchRoutes = new Elysia()
  // GET /:id/batch - Get all batches for a company
  .get("/:id/batch", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const canView = await hasPermission(session.user.id, params.id, "batch:view");
    if (!canView) {
      set.status = 403;
      return { error: "You don't have permission to view batches" };
    }

    // Get all batches for this company
    const batches = await prisma.batch.findMany({
      where: {
        companyId: params.id,
      },
      include: {
        commodity: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { batches };
  })

  // GET /:id/batch/:batchId - Get specific batch
  .get("/:id/batch/:batchId", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const canView = await hasPermission(session.user.id, params.id, "batch:view");
    if (!canView) {
      set.status = 403;
      return { error: "You don't have permission to view batches" };
    }

    // Get batch by ID and verify it belongs to this company
    const batch = await prisma.batch.findFirst({
      where: {
        id: params.batchId,
        companyId: params.id,
      },
      include: {
        commodity: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!batch) {
      set.status = 404;
      return { error: "Batch not found" };
    }

    return { batch };
  })

  // POST /:id/batch - Create new batch
  .post(
    "/:id/batch",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { userId: session.user.id, companyId: params.id },
      });

      if (!userCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      const canCreate = await hasPermission(session.user.id, params.id, "batch:create");
      if (!canCreate) {
        set.status = 403;
        return { error: "You don't have permission to create batches" };
      }

      const { commodityId, lotCode, harvestDate } = body as {
        commodityId: string;
        lotCode: string;
        harvestDate: string;
      };

      if (!commodityId || commodityId.trim().length === 0) {
        set.status = 400;
        return { error: "Commodity ID is required" };
      }

      if (!lotCode || lotCode.trim().length === 0) {
        set.status = 400;
        return { error: "Lot code is required" };
      }

      if (!harvestDate) {
        set.status = 400;
        return { error: "Harvest date is required" };
      }

      // Verify commodity exists
      const commodity = await prisma.commodity.findUnique({
        where: { id: commodityId },
      });

      if (!commodity) {
        set.status = 404;
        return { error: "Commodity not found" };
      }

      try {
        // Create batch with totalKg = 0 initially (will be calculated from batchSources)
        const batch = await prisma.batch.create({
          data: {
            companyId: params.id,
            commodityId: commodityId.trim(),
            lotCode: lotCode.trim(),
            harvestDate: new Date(harvestDate),
            totalKg: 0,
          },
          include: {
            commodity: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        });

        return { batch };
      } catch (error: any) {
        if (error.code === "P2002") {
          set.status = 409;
          return { error: "Lot code already exists for this company" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        commodityId: t.String({ minLength: 1 }),
        lotCode: t.String({ minLength: 1 }),
        harvestDate: t.String(),
      }),
    }
  )

  // PUT /:id/batch/:batchId - Update batch
  .put(
    "/:id/batch/:batchId",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { userId: session.user.id, companyId: params.id },
      });

      if (!userCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      const canUpdate = await hasPermission(session.user.id, params.id, "batch:update");
      if (!canUpdate) {
        set.status = 403;
        return { error: "You don't have permission to update batches" };
      }

      // Verify batch exists and belongs to this company
      const existingBatch = await prisma.batch.findFirst({
        where: {
          id: params.batchId,
          companyId: params.id,
        },
      });

      if (!existingBatch) {
        set.status = 404;
        return { error: "Batch not found" };
      }

      const { lotCode, harvestDate } = body as {
        lotCode?: string;
        harvestDate?: string;
      };

      const updateData: any = {};

      if (lotCode !== undefined) {
        if (lotCode.trim().length === 0) {
          set.status = 400;
          return { error: "Lot code cannot be empty" };
        }
        updateData.lotCode = lotCode.trim();
      }

      if (harvestDate !== undefined) {
        updateData.harvestDate = new Date(harvestDate);
      }

      // totalKg is auto-calculated from batchSources, cannot be updated manually

      try {
        const batch = await prisma.batch.update({
          where: { id: params.batchId },
          data: updateData,
          include: {
            commodity: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        });

        return { batch };
      } catch (error: any) {
        if (error.code === "P2002") {
          set.status = 409;
          return { error: "Lot code already exists for this company" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        lotCode: t.Optional(t.String({ minLength: 1 })),
        harvestDate: t.Optional(t.String()),
      }),
    }
  )

  // DELETE /:id/batch/:batchId - Delete batch
  .delete("/:id/batch/:batchId", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const canDelete = await hasPermission(session.user.id, params.id, "batch:delete");
    if (!canDelete) {
      set.status = 403;
      return { error: "You don't have permission to delete batches" };
    }

    // Verify batch exists and belongs to this company
    const existingBatch = await prisma.batch.findFirst({
      where: {
        id: params.batchId,
        companyId: params.id,
      },
    });

    if (!existingBatch) {
      set.status = 404;
      return { error: "Batch not found" };
    }

    // Delete all related records first (using transaction for atomicity)
    await prisma.$transaction(async (tx) => {
      // Delete batch sources
      await tx.batchSource.deleteMany({
        where: { batchId: params.batchId },
      });

      // Delete batch attributes (has cascade, but delete explicitly for safety)
      await tx.batchAttribute.deleteMany({
        where: { batchId: params.batchId },
      });

      // Delete batch relations (if any exist)
      await tx.batchRelation.deleteMany({
        where: {
          OR: [
            { parentBatchId: params.batchId },
            { childBatchId: params.batchId },
          ],
        },
      });

      // Finally delete the batch
      await tx.batch.delete({
        where: { id: params.batchId },
      });
    });

    return { success: true, message: "Batch deleted successfully" };
  })

  // ========== BATCH SOURCE ROUTES ==========

  // GET /:id/batch/:batchId/source - Get all batch sources for a batch
  .get("/:id/batch/:batchId/source", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const canView = await hasPermission(session.user.id, params.id, "batch_source:view");
    if (!canView) {
      set.status = 403;
      return { error: "You don't have permission to view batch sources" };
    }

    // Verify batch exists and belongs to this company
    const batch = await prisma.batch.findFirst({
      where: {
        id: params.batchId,
        companyId: params.id,
      },
    });

    if (!batch) {
      set.status = 404;
      return { error: "Batch not found" };
    }

    const batchSources = await prisma.batchSource.findMany({
      where: { batchId: params.batchId },
      include: {
        farmerGroup: {
          select: {
            id: true,
            name: true,
          },
        },
        land: {
          select: {
            id: true,
            name: true,
            location: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { batchSources };
  })

  // GET /:id/batch/:batchId/source/:sourceId - Get specific batch source
  .get("/:id/batch/:batchId/source/:sourceId", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const canView = await hasPermission(session.user.id, params.id, "batch_source:view");
    if (!canView) {
      set.status = 403;
      return { error: "You don't have permission to view batch sources" };
    }

    // Verify batch exists and belongs to this company
    const batch = await prisma.batch.findFirst({
      where: {
        id: params.batchId,
        companyId: params.id,
      },
    });

    if (!batch) {
      set.status = 404;
      return { error: "Batch not found" };
    }

    // Verify batch source exists
    const batchSource = await prisma.batchSource.findFirst({
      where: {
        id: params.sourceId,
        batchId: params.batchId,
      },
      include: {
        batch: {
          select: {
            id: true,
            lotCode: true,
          },
        },
        farmerGroup: {
          select: {
            id: true,
            name: true,
          },
        },
        land: {
          select: {
            id: true,
            name: true,
            location: true,
            areaHectares: true,
            latitude: true,
            longitude: true,
          },
        },
      },
    });

    if (!batchSource) {
      set.status = 404;
      return { error: "Batch source not found" };
    }

    return { batchSource };
  })

  // POST /:id/batch/:batchId/source - Create new batch source
  .post(
    "/:id/batch/:batchId/source",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { userId: session.user.id, companyId: params.id },
      });

      if (!userCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      const canCreate = await hasPermission(session.user.id, params.id, "batch_source:create");
      if (!canCreate) {
        set.status = 403;
        return { error: "You don't have permission to create batch sources" };
      }

      // Verify batch exists and belongs to this company
      const batch = await prisma.batch.findFirst({
        where: {
          id: params.batchId,
          companyId: params.id,
        },
      });

      if (!batch) {
        set.status = 404;
        return { error: "Batch not found" };
      }

      const { farmerGroupId, landId, volumeKg, landSnapshot } = body as {
        farmerGroupId: string;
        landId: string;
        volumeKg: number;
        landSnapshot?: any;
      };

      if (!farmerGroupId || farmerGroupId.trim().length === 0) {
        set.status = 400;
        return { error: "Farmer group ID is required" };
      }

      if (!landId || landId.trim().length === 0) {
        set.status = 400;
        return { error: "Land ID is required" };
      }

      if (volumeKg === undefined || volumeKg === null || volumeKg < 0) {
        set.status = 400;
        return { error: "Volume kg is required and must be >= 0" };
      }

      // Verify farmer group belongs to this company
      const farmerGroup = await prisma.farmerGroup.findFirst({
        where: {
          id: farmerGroupId,
          companyId: params.id,
        },
      });

      if (!farmerGroup) {
        set.status = 404;
        return { error: "Farmer group not found or doesn't belong to this company" };
      }

      // Verify land belongs to this company
      const land = await prisma.land.findFirst({
        where: {
          id: landId,
          companyId: params.id,
        },
      });

      if (!land) {
        set.status = 404;
        return { error: "Land not found or doesn't belong to this company" };
      }

      try {
        const batchSource = await prisma.batchSource.create({
          data: {
            batchId: params.batchId,
            farmerGroupId: farmerGroupId.trim(),
            landId: landId.trim(),
            volumeKg: volumeKg,
            landSnapshot: landSnapshot || {},
          },
          include: {
            batch: {
              select: {
                id: true,
                lotCode: true,
              },
            },
            farmerGroup: {
              select: {
                id: true,
                name: true,
              },
            },
            land: {
              select: {
                id: true,
                name: true,
                location: true,
                areaHectares: true,
              },
            },
          },
        });

        // Update batch totalKg from sum of all batchSources
        await updateBatchTotalKg(params.batchId);

        return { batchSource };
      } catch (error: any) {
        if (error.code === "P2002") {
          set.status = 409;
          return { error: "Batch source with this combination already exists" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        farmerGroupId: t.String({ minLength: 1 }),
        landId: t.String({ minLength: 1 }),
        volumeKg: t.Number({ minimum: 0 }),
        landSnapshot: t.Optional(t.Any()),
      }),
    }
  )

  // PUT /:id/batch/:batchId/source/:sourceId - Update batch source
  .put(
    "/:id/batch/:batchId/source/:sourceId",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { userId: session.user.id, companyId: params.id },
      });

      if (!userCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      const canUpdate = await hasPermission(session.user.id, params.id, "batch_source:update");
      if (!canUpdate) {
        set.status = 403;
        return { error: "You don't have permission to update batch sources" };
      }

      // Verify batch exists and belongs to this company
      const batch = await prisma.batch.findFirst({
        where: {
          id: params.batchId,
          companyId: params.id,
        },
      });

      if (!batch) {
        set.status = 404;
        return { error: "Batch not found" };
      }

      // Verify batch source exists
      const existingBatchSource = await prisma.batchSource.findFirst({
        where: {
          id: params.sourceId,
          batchId: params.batchId,
        },
      });

      if (!existingBatchSource) {
        set.status = 404;
        return { error: "Batch source not found" };
      }

      const { farmerGroupId, landId, volumeKg, landSnapshot } = body as {
        farmerGroupId?: string;
        landId?: string;
        volumeKg?: number;
        landSnapshot?: any;
      };

      const updateData: any = {};

      if (farmerGroupId !== undefined) {
        if (farmerGroupId.trim().length === 0) {
          set.status = 400;
          return { error: "Farmer group ID cannot be empty" };
        }
        // Verify farmer group belongs to this company
        const farmerGroup = await prisma.farmerGroup.findFirst({
          where: {
            id: farmerGroupId.trim(),
            companyId: params.id,
          },
        });
        if (!farmerGroup) {
          set.status = 404;
          return { error: "Farmer group not found or doesn't belong to this company" };
        }
        updateData.farmerGroupId = farmerGroupId.trim();
      }

      if (landId !== undefined) {
        if (landId.trim().length === 0) {
          set.status = 400;
          return { error: "Land ID cannot be empty" };
        }
        // Verify land belongs to this company
        const land = await prisma.land.findFirst({
          where: {
            id: landId.trim(),
            companyId: params.id,
          },
        });
        if (!land) {
          set.status = 404;
          return { error: "Land not found or doesn't belong to this company" };
        }
        updateData.landId = landId.trim();
      }

      if (volumeKg !== undefined) {
        if (volumeKg < 0) {
          set.status = 400;
          return { error: "Volume kg must be >= 0" };
        }
        updateData.volumeKg = volumeKg;
      }

      if (landSnapshot !== undefined) {
        updateData.landSnapshot = landSnapshot;
      }

      try {
        const batchSource = await prisma.batchSource.update({
          where: { id: params.sourceId },
          data: updateData,
          include: {
            batch: {
              select: {
                id: true,
                lotCode: true,
              },
            },
            farmerGroup: {
              select: {
                id: true,
                name: true,
              },
            },
            land: {
              select: {
                id: true,
                name: true,
                location: true,
                areaHectares: true,
              },
            },
          },
        });

        // Update batch totalKg from sum of all batchSources
        await updateBatchTotalKg(params.batchId);

        return { batchSource };
      } catch (error: any) {
        if (error.code === "P2002") {
          set.status = 409;
          return { error: "Batch source with this combination already exists" };
        }
        throw error;
      }
    },
    {
      body: t.Object({
        farmerGroupId: t.Optional(t.String({ minLength: 1 })),
        landId: t.Optional(t.String({ minLength: 1 })),
        volumeKg: t.Optional(t.Number({ minimum: 0 })),
        landSnapshot: t.Optional(t.Any()),
      }),
    }
  )

  // DELETE /:id/batch/:batchId/source/:sourceId - Delete batch source
  .delete("/:id/batch/:batchId/source/:sourceId", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const canDelete = await hasPermission(session.user.id, params.id, "batch_source:delete");
    if (!canDelete) {
      set.status = 403;
      return { error: "You don't have permission to delete batch sources" };
    }

    // Verify batch exists and belongs to this company
    const batch = await prisma.batch.findFirst({
      where: {
        id: params.batchId,
        companyId: params.id,
      },
    });

    if (!batch) {
      set.status = 404;
      return { error: "Batch not found" };
    }

    // Verify batch source exists
    const existingBatchSource = await prisma.batchSource.findFirst({
      where: {
        id: params.sourceId,
        batchId: params.batchId,
      },
    });

    if (!existingBatchSource) {
      set.status = 404;
      return { error: "Batch source not found" };
    }

    await prisma.batchSource.delete({
      where: { id: params.sourceId },
    });

    // Update batch totalKg from sum of all batchSources
    await updateBatchTotalKg(params.batchId);

    return { success: true, message: "Batch source deleted successfully" };
  })

  // ========== BATCH ATTRIBUTE ROUTES ==========

  // GET /:id/batch/:batchId/attribute - Get all batch attributes for a batch
  .get("/:id/batch/:batchId/attribute", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const canView = await hasPermission(session.user.id, params.id, "batch_attribute:view");
    if (!canView) {
      set.status = 403;
      return { error: "You don't have permission to view batch attributes" };
    }

    // Verify batch exists and belongs to this company
    const batch = await prisma.batch.findFirst({
      where: {
        id: params.batchId,
        companyId: params.id,
      },
    });

    if (!batch) {
      set.status = 404;
      return { error: "Batch not found" };
    }

    const batchAttributes = await prisma.batchAttribute.findMany({
      where: { batchId: params.batchId },
      orderBy: { recordedAt: "desc" },
    });

    return { batchAttributes };
  })

  // GET /:id/batch/:batchId/attribute/:attributeId - Get specific batch attribute
  .get("/:id/batch/:batchId/attribute/:attributeId", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const canView = await hasPermission(session.user.id, params.id, "batch_attribute:view");
    if (!canView) {
      set.status = 403;
      return { error: "You don't have permission to view batch attributes" };
    }

    // Verify batch exists and belongs to this company
    const batch = await prisma.batch.findFirst({
      where: {
        id: params.batchId,
        companyId: params.id,
      },
    });

    if (!batch) {
      set.status = 404;
      return { error: "Batch not found" };
    }

    // Verify batch attribute exists
    const batchAttribute = await prisma.batchAttribute.findFirst({
      where: {
        id: params.attributeId,
        batchId: params.batchId,
      },
      include: {
        batch: {
          select: {
            id: true,
            lotCode: true,
          },
        },
      },
    });

    if (!batchAttribute) {
      set.status = 404;
      return { error: "Batch attribute not found" };
    }

    return { batchAttribute };
  })

  // POST /:id/batch/:batchId/attribute - Create new batch attribute
  .post(
    "/:id/batch/:batchId/attribute",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { userId: session.user.id, companyId: params.id },
      });

      if (!userCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      const canCreate = await hasPermission(session.user.id, params.id, "batch_attribute:create");
      if (!canCreate) {
        set.status = 403;
        return { error: "You don't have permission to create batch attributes" };
      }

      // Verify batch exists and belongs to this company
      const batch = await prisma.batch.findFirst({
        where: {
          id: params.batchId,
          companyId: params.id,
        },
      });

      if (!batch) {
        set.status = 404;
        return { error: "Batch not found" };
      }

      const { key, value, unit, recordedAt } = body as {
        key: string;
        value: string;
        unit?: string;
        recordedAt?: string;
      };

      if (!key || key.trim().length === 0) {
        set.status = 400;
        return { error: "Key is required" };
      }

      if (!value || value.trim().length === 0) {
        set.status = 400;
        return { error: "Value is required" };
      }

      try {
        const batchAttribute = await prisma.batchAttribute.create({
          data: {
            batchId: params.batchId,
            key: key.trim(),
            value: value.trim(),
            unit: unit?.trim() || null,
            recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
          },
          include: {
            batch: {
              select: {
                id: true,
                lotCode: true,
              },
            },
          },
        });

        return { batchAttribute };
      } catch (error: any) {
        throw error;
      }
    },
    {
      body: t.Object({
        key: t.String({ minLength: 1 }),
        value: t.String({ minLength: 1 }),
        unit: t.Optional(t.String()),
        recordedAt: t.Optional(t.String()),
      }),
    }
  )

  // PUT /:id/batch/:batchId/attribute/:attributeId - Update batch attribute
  .put(
    "/:id/batch/:batchId/attribute/:attributeId",
    async ({ request, params, body, set }) => {
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const userCompany = await prisma.userCompany.findFirst({
        where: { userId: session.user.id, companyId: params.id },
      });

      if (!userCompany) {
        set.status = 404;
        return { error: "Company not found or access denied" };
      }

      const canUpdate = await hasPermission(session.user.id, params.id, "batch_attribute:update");
      if (!canUpdate) {
        set.status = 403;
        return { error: "You don't have permission to update batch attributes" };
      }

      // Verify batch exists and belongs to this company
      const batch = await prisma.batch.findFirst({
        where: {
          id: params.batchId,
          companyId: params.id,
        },
      });

      if (!batch) {
        set.status = 404;
        return { error: "Batch not found" };
      }

      // Verify batch attribute exists
      const existingBatchAttribute = await prisma.batchAttribute.findFirst({
        where: {
          id: params.attributeId,
          batchId: params.batchId,
        },
      });

      if (!existingBatchAttribute) {
        set.status = 404;
        return { error: "Batch attribute not found" };
      }

      const { key, value, unit, recordedAt } = body as {
        key?: string;
        value?: string;
        unit?: string;
        recordedAt?: string;
      };

      const updateData: any = {};

      if (key !== undefined) {
        if (key.trim().length === 0) {
          set.status = 400;
          return { error: "Key cannot be empty" };
        }
        updateData.key = key.trim();
      }

      if (value !== undefined) {
        if (value.trim().length === 0) {
          set.status = 400;
          return { error: "Value cannot be empty" };
        }
        updateData.value = value.trim();
      }

      if (unit !== undefined) {
        updateData.unit = unit?.trim() || null;
      }

      if (recordedAt !== undefined) {
        updateData.recordedAt = new Date(recordedAt);
      }

      try {
        const batchAttribute = await prisma.batchAttribute.update({
          where: { id: params.attributeId },
          data: updateData,
          include: {
            batch: {
              select: {
                id: true,
                lotCode: true,
              },
            },
          },
        });

        return { batchAttribute };
      } catch (error: any) {
        throw error;
      }
    },
    {
      body: t.Object({
        key: t.Optional(t.String({ minLength: 1 })),
        value: t.Optional(t.String({ minLength: 1 })),
        unit: t.Optional(t.String()),
        recordedAt: t.Optional(t.String()),
      }),
    }
  )

  // DELETE /:id/batch/:batchId/attribute/:attributeId - Delete batch attribute
  .delete("/:id/batch/:batchId/attribute/:attributeId", async ({ request, params, set }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: params.id },
    });

    if (!userCompany) {
      set.status = 404;
      return { error: "Company not found or access denied" };
    }

    const canDelete = await hasPermission(session.user.id, params.id, "batch_attribute:delete");
    if (!canDelete) {
      set.status = 403;
      return { error: "You don't have permission to delete batch attributes" };
    }

    // Verify batch exists and belongs to this company
    const batch = await prisma.batch.findFirst({
      where: {
        id: params.batchId,
        companyId: params.id,
      },
    });

    if (!batch) {
      set.status = 404;
      return { error: "Batch not found" };
    }

    // Verify batch attribute exists
    const existingBatchAttribute = await prisma.batchAttribute.findFirst({
      where: {
        id: params.attributeId,
        batchId: params.batchId,
      },
    });

    if (!existingBatchAttribute) {
      set.status = 404;
      return { error: "Batch attribute not found" };
    }

    await prisma.batchAttribute.delete({
      where: { id: params.attributeId },
    });

    return { success: true, message: "Batch attribute deleted successfully" };
  });

