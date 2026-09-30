import {
  CATALOG_LIMITS,
  type ProductListResponse,
  type ProductResponse,
  type ProductSortField,
  type ProductStatus,
  type SortOrder,
} from '@app/shared';
import { Injectable } from '@nestjs/common';
import { ActivityAction, recordActivity } from '../activity/activity-log.js';
import { isForeignKeyViolation, isUniqueViolation } from '../common/errors/prisma-errors.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { OrganizationContext } from '../organizations/organization-context.js';
import {
  productArchived,
  productCategoryNotFound,
  productNotFound,
  productSkuTaken,
  productStatusInvalid,
} from './catalog-errors.js';
import {
  PRODUCT_LIST_SELECT,
  PRODUCT_SELECT,
  toMoney,
  toProduct,
  toProductListItem,
} from './catalog-mappers.js';
import type { CreateProductDto, ProductListQueryDto, UpdateProductDto } from './dto/product.dto.js';

/** Maps the whitelisted `sortBy` values to Prisma order clauses — never a raw column name. */
function orderByFor(
  field: ProductSortField,
  order: SortOrder,
): Prisma.ProductOrderByWithRelationInput[] {
  const primary: Prisma.ProductOrderByWithRelationInput =
    field === 'cost'
      ? { cost: { sort: order, nulls: 'last' } }
      : ({ [field]: order } as Prisma.ProductOrderByWithRelationInput);
  // Unique tie-breaker so pages never overlap or skip rows.
  return [primary, { id: 'asc' }];
}

/**
 * Escapes LIKE wildcards so user input is matched literally ("50%" finds "50%",
 * not everything). The value is still sent as a bound parameter by Prisma.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/**
 * Organization-scoped product catalog. Products are archived, never deleted.
 * Every query filters by the organization from the verified OrganizationContext.
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: ProductListQueryDto): Promise<ProductListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? CATALOG_LIMITS.pageSizeDefault;

    if (query.categoryId) {
      await this.assertCategoryInOrganization(this.prisma, organizationId, query.categoryId);
    }

    const search = query.search ? escapeLikePattern(query.search) : undefined;
    const where: Prisma.ProductWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [totalItems, items] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: orderByFor(query.sortBy ?? 'createdAt', query.sortOrder ?? 'desc'),
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: PRODUCT_LIST_SELECT,
      }),
    ]);

    return {
      items: items.map(toProductListItem),
      pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
    };
  }

  async get(organizationId: string, productId: string): Promise<ProductResponse> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      select: PRODUCT_SELECT,
    });
    if (!product) throw productNotFound();
    return { product: toProduct(product) };
  }

  async create(context: OrganizationContext, input: CreateProductDto): Promise<ProductResponse> {
    const organizationId = context.organization.id;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (input.categoryId) {
          await this.assertCategoryInOrganization(tx, organizationId, input.categoryId);
        }
        const product = await tx.product.create({
          data: {
            organizationId,
            name: input.name,
            sku: input.sku,
            description: input.description ?? null,
            categoryId: input.categoryId ?? null,
            price: input.price,
            cost: input.cost,
            minimumStock: input.minimumStock,
          },
          select: PRODUCT_SELECT,
        });
        await recordActivity(tx, {
          organizationId,
          actorUserId: context.user.id,
          action: ActivityAction.PRODUCT_CREATED,
          entityType: 'Product',
          entityId: product.id,
          metadata: { name: product.name, sku: product.sku },
        });
        return { product: toProduct(product) };
      });
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  /** Partial update of catalog fields. Status is changed only via archive/restore. */
  async update(
    context: OrganizationContext,
    productId: string,
    input: UpdateProductDto,
  ): Promise<ProductResponse> {
    if (input.status !== undefined) throw productStatusInvalid();
    const organizationId = context.organization.id;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.product.findFirst({
          where: { id: productId, organizationId },
          select: { ...PRODUCT_SELECT, categoryId: true },
        });
        if (!current) throw productNotFound();
        if (current.status === 'ARCHIVED') throw productArchived();

        const data: Prisma.ProductUncheckedUpdateInput = {};
        const changes: Record<string, Prisma.InputJsonValue> = {};
        const track = (
          field: string,
          from: Prisma.InputJsonValue | null,
          to: Prisma.InputJsonValue | null,
        ) => {
          changes[field] = { from, to } as Prisma.InputJsonValue;
        };

        if (input.name !== undefined && input.name !== current.name) {
          data.name = input.name;
          track('name', current.name, input.name);
        }
        if (input.sku !== undefined && input.sku !== current.sku) {
          data.sku = input.sku;
          track('sku', current.sku, input.sku);
        }
        if (input.description !== undefined && input.description !== current.description) {
          data.description = input.description;
          changes.description = { changed: true };
        }
        if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
          if (input.categoryId) {
            await this.assertCategoryInOrganization(tx, organizationId, input.categoryId);
          }
          data.categoryId = input.categoryId;
          track('categoryId', current.categoryId, input.categoryId);
        }
        if (input.price !== undefined && !current.price.equals(input.price)) {
          data.price = input.price;
          track('price', toMoney(current.price), toMoney(new Prisma.Decimal(input.price)));
        }
        if (input.cost !== undefined && !(current.cost?.equals(input.cost) ?? false)) {
          data.cost = input.cost;
          track(
            'cost',
            current.cost ? toMoney(current.cost) : null,
            toMoney(new Prisma.Decimal(input.cost)),
          );
        }
        if (input.minimumStock !== undefined && input.minimumStock !== current.minimumStock) {
          data.minimumStock = input.minimumStock;
          track('minimumStock', current.minimumStock, input.minimumStock);
        }

        if (Object.keys(data).length === 0) {
          return { product: toProduct(current) };
        }

        // Conditional on ACTIVE so a concurrent archive is not overwritten.
        const { count } = await tx.product.updateMany({
          where: { id: current.id, organizationId, status: 'ACTIVE' },
          data,
        });
        if (count !== 1) throw productArchived();

        await recordActivity(tx, {
          organizationId,
          actorUserId: context.user.id,
          action: ActivityAction.PRODUCT_UPDATED,
          entityType: 'Product',
          entityId: current.id,
          metadata: { sku: input.sku ?? current.sku, changes },
        });

        const updated = await tx.product.findUniqueOrThrow({
          where: { id: current.id },
          select: PRODUCT_SELECT,
        });
        return { product: toProduct(updated) };
      });
    } catch (error) {
      throw this.translateWriteError(error);
    }
  }

  archive(context: OrganizationContext, productId: string): Promise<ProductResponse> {
    return this.transition(context, productId, 'ARCHIVED');
  }

  restore(context: OrganizationContext, productId: string): Promise<ProductResponse> {
    return this.transition(context, productId, 'ACTIVE');
  }

  /**
   * Explicit status transition. Idempotent: if the product already has the
   * target status nothing is written and no activity is recorded.
   */
  private async transition(
    context: OrganizationContext,
    productId: string,
    target: ProductStatus,
  ): Promise<ProductResponse> {
    const organizationId = context.organization.id;

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.product.findFirst({
        where: { id: productId, organizationId },
        select: PRODUCT_SELECT,
      });
      if (!current) throw productNotFound();
      if (current.status === target) return { product: toProduct(current) };

      const { count } = await tx.product.updateMany({
        where: { id: current.id, organizationId, status: current.status },
        data: { status: target },
      });
      if (count === 1) {
        await recordActivity(tx, {
          organizationId,
          actorUserId: context.user.id,
          action:
            target === 'ARCHIVED'
              ? ActivityAction.PRODUCT_ARCHIVED
              : ActivityAction.PRODUCT_RESTORED,
          entityType: 'Product',
          entityId: current.id,
          metadata: { name: current.name, sku: current.sku },
        });
      }

      const updated = await tx.product.findUniqueOrThrow({
        where: { id: current.id },
        select: PRODUCT_SELECT,
      });
      return { product: toProduct(updated) };
    });
  }

  private async assertCategoryInOrganization(
    client: Prisma.TransactionClient | PrismaService,
    organizationId: string,
    categoryId: string,
  ): Promise<void> {
    const category = await client.category.findFirst({
      where: { id: categoryId, organizationId },
      select: { id: true },
    });
    if (!category) throw productCategoryNotFound();
  }

  private translateWriteError(error: unknown): unknown {
    if (isUniqueViolation(error)) return productSkuTaken();
    // The category was deleted between the check and the write.
    if (isForeignKeyViolation(error)) return productCategoryNotFound();
    return error;
  }
}
