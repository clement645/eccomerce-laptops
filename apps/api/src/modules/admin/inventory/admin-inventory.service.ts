import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@repo/database';
import type {
  InventoryMovementEntry,
  InventoryRow,
  Paginated,
  StockLevel,
} from '@repo/shared-types';
import type { InventoryQuery, StockAdjustmentInput } from '@repo/validation';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { StockChangeNotifier } from '../../orders/stock-change.notifier.js';
import { notFound } from '../admin-errors.js';

interface Row {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  isActive: boolean;
  onHand: number;
  reserved: number;
  lowStockThreshold: number;
  updatedAt: Date;
}

const LEVEL_SQL = {
  OUT_OF_STOCK: Prisma.sql`i."onHand" - i.reserved <= 0`,
  LOW_STOCK: Prisma.sql`i."onHand" - i.reserved > 0 AND i."onHand" - i.reserved <= i."lowStockThreshold"`,
  IN_STOCK: Prisma.sql`i."onHand" - i.reserved > i."lowStockThreshold"`,
} as const;

export function stockLevel(available: number, threshold: number): StockLevel {
  if (available <= 0) return 'OUT_OF_STOCK';
  return available <= threshold ? 'LOW_STOCK' : 'IN_STOCK';
}

@Injectable()
export class AdminInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockChangeNotifier,
  ) {}

  /** Stock per variant. Lowest availability first, so problems are at the top. */
  async list(query: InventoryQuery): Promise<Paginated<InventoryRow>> {
    const filters: Prisma.Sql[] = [Prisma.sql`p.status <> 'ARCHIVED'`];
    if (query.level) filters.push(LEVEL_SQL[query.level]);
    if (query.q) {
      const like = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      filters.push(
        Prisma.sql`(v.sku ILIKE ${like} OR p.name ILIKE ${like} OR v.name ILIKE ${like})`,
      );
    }
    const where = Prisma.join(filters, ' AND ');
    const from = Prisma.sql`FROM inventory i
      JOIN product_variants v ON v.id = i."variantId"
      JOIN products p ON p.id = v."productId"
      WHERE ${where}`;
    const [count] = await this.prisma.client.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT count(*) AS total ${from}`,
    );
    const rows = await this.prisma.client.$queryRaw<Row[]>(Prisma.sql`
      SELECT v.id AS "variantId", v.sku, p.id AS "productId", p.name AS "productName", p.slug AS "productSlug",
        v.name AS "variantName", v."isActive", i."onHand", i.reserved, i."lowStockThreshold", i."updatedAt"
      ${from}
      ORDER BY (i."onHand" - i.reserved) ASC, p.name ASC, v."sortOrder" ASC
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
    return {
      items: rows.map((r) => toRow(r)),
      page: query.page,
      pageSize: query.pageSize,
      total: Number(count?.total ?? 0),
    };
  }

  /**
   * Adds or removes units on hand. The update is conditional, so stock can never drop below what is
   * already reserved for open orders, even with concurrent checkouts.
   */
  async adjust(
    variantId: string,
    input: StockAdjustmentInput,
    actorId: string,
  ): Promise<InventoryRow> {
    const variant = await this.prisma.client.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { slug: true } } },
    });
    if (!variant) throw notFound('Variant');
    await this.prisma.client.$transaction(async (tx) => {
      await tx.inventory.upsert({ where: { variantId }, create: { variantId }, update: {} });
      const rows = await tx.$queryRaw<{ onHand: number; reserved: number }[]>(Prisma.sql`
        UPDATE inventory SET "onHand" = "onHand" + ${input.delta},
          "lowStockThreshold" = COALESCE(${input.lowStockThreshold ?? null}::int, "lowStockThreshold"),
          "updatedAt" = now()
        WHERE "variantId" = ${variantId}::uuid AND "onHand" + ${input.delta} >= reserved
        RETURNING "onHand", reserved`);
      const after = rows[0];
      if (!after) {
        const current = await tx.inventory.findUnique({ where: { variantId } });
        throw new ConflictException({
          code: 'INSUFFICIENT_STOCK',
          message: 'That would leave fewer units than are reserved for open orders',
          details: { onHand: current?.onHand ?? 0, reserved: current?.reserved ?? 0 },
        });
      }
      await tx.inventoryMovement.create({
        data: {
          variantId,
          delta: input.delta,
          reason: input.reason,
          onHandAfter: after.onHand,
          reservedAfter: after.reserved,
          actorId,
          note: input.note || null,
        },
      });
    });
    await this.stock.stockChanged([variant.product.slug]);
    return this.row(variantId);
  }

  async movements(variantId: string): Promise<InventoryMovementEntry[]> {
    const rows = await this.prisma.client.inventoryMovement.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        order: { select: { orderNumber: true } },
        actor: { select: { email: true } },
      },
    });
    return rows.map((m) => ({
      id: m.id,
      delta: m.delta,
      reason: m.reason,
      onHandAfter: m.onHandAfter,
      reservedAfter: m.reservedAfter,
      orderNumber: m.order?.orderNumber ?? null,
      actor: m.actor?.email ?? null,
      note: m.note,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  private async row(variantId: string): Promise<InventoryRow> {
    const [row] = await this.prisma.client.$queryRaw<Row[]>(Prisma.sql`
      SELECT v.id AS "variantId", v.sku, p.id AS "productId", p.name AS "productName", p.slug AS "productSlug",
        v.name AS "variantName", v."isActive", i."onHand", i.reserved, i."lowStockThreshold", i."updatedAt"
      FROM inventory i JOIN product_variants v ON v.id = i."variantId" JOIN products p ON p.id = v."productId"
      WHERE v.id = ${variantId}::uuid`);
    if (!row) throw notFound('Variant');
    return toRow(row);
  }
}

function toRow(r: Row): InventoryRow {
  const available = r.onHand - r.reserved;
  return {
    variantId: r.variantId,
    sku: r.sku,
    productId: r.productId,
    productName: r.productName,
    variantName: r.variantName,
    isActive: r.isActive,
    onHand: r.onHand,
    reserved: r.reserved,
    available,
    lowStockThreshold: r.lowStockThreshold,
    level: stockLevel(available, r.lowStockThreshold),
    updatedAt: r.updatedAt.toISOString(),
  };
}
