import { CATALOG_LIMITS, type CategoryListResponse, type CategoryResponse } from '@app/shared';
import { Injectable } from '@nestjs/common';
import { ActivityAction, recordActivity } from '../activity/activity-log.js';
import { isForeignKeyViolation, isUniqueViolation } from '../common/errors/prisma-errors.js';
import { escapeLikePattern } from '../common/validation/like-pattern.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { OrganizationContext } from '../organizations/organization-context.js';
import { categoryInUse, categoryNameTaken, categoryNotFound } from './catalog-errors.js';
import { CATEGORY_SELECT, toCategory } from './catalog-mappers.js';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto.js';

/**
 * Organization-scoped categories. Every query filters by the organization from
 * the verified OrganizationContext; permissions are checked by the guard.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Without `search`: every category, newest first. With `search` (the
   * product form's category picker): a case-insensitive name match, the exact
   * (case-insensitive) match first, then by name, at most `categorySearchMax`.
   */
  async list(organizationId: string, search?: string): Promise<CategoryListResponse> {
    if (!search) {
      const categories = await this.prisma.category.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: CATEGORY_SELECT,
      });
      return { categories: categories.map(toCategory) };
    }
    const [exact, matches] = await Promise.all([
      this.prisma.category.findFirst({
        // Case-insensitive equality is an ILIKE in PostgreSQL: wildcards must be escaped.
        where: {
          organizationId,
          name: { equals: escapeLikePattern(search), mode: 'insensitive' },
        },
        orderBy: { id: 'asc' },
        select: CATEGORY_SELECT,
      }),
      this.prisma.category.findMany({
        where: {
          organizationId,
          name: { contains: escapeLikePattern(search), mode: 'insensitive' },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: CATALOG_LIMITS.categorySearchMax,
        select: CATEGORY_SELECT,
      }),
    ]);
    const categories = exact
      ? [exact, ...matches.filter((category) => category.id !== exact.id)]
      : matches;
    return {
      categories: categories.slice(0, CATALOG_LIMITS.categorySearchMax).map(toCategory),
    };
  }

  async create(context: OrganizationContext, input: CreateCategoryDto): Promise<CategoryResponse> {
    const organizationId = context.organization.id;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await assertNameAvailable(tx, organizationId, input.name);
        const category = await tx.category.create({
          data: { organizationId, name: input.name, description: input.description ?? null },
          select: CATEGORY_SELECT,
        });
        await recordActivity(tx, {
          organizationId,
          actorUserId: context.user.id,
          action: ActivityAction.CATEGORY_CREATED,
          entityType: 'Category',
          entityId: category.id,
          metadata: { name: category.name },
        });
        return { category: toCategory(category) };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw categoryNameTaken();
      throw error;
    }
  }

  async update(
    context: OrganizationContext,
    categoryId: string,
    input: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    const organizationId = context.organization.id;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.category.findFirst({
          where: { id: categoryId, organizationId },
          select: CATEGORY_SELECT,
        });
        if (!current) throw categoryNotFound();

        const data: Prisma.CategoryUpdateInput = {};
        const changes: Record<string, Prisma.InputJsonValue> = {};
        if (input.name !== undefined && input.name !== current.name) {
          await assertNameAvailable(tx, organizationId, input.name, current.id);
          data.name = input.name;
          changes.name = { from: current.name, to: input.name };
        }
        if (input.description !== undefined && input.description !== current.description) {
          data.description = input.description;
          changes.description = { changed: true };
        }
        if (Object.keys(data).length === 0) {
          return { category: toCategory(current) };
        }

        const category = await tx.category.update({
          where: { id: current.id },
          data,
          select: CATEGORY_SELECT,
        });
        await recordActivity(tx, {
          organizationId,
          actorUserId: context.user.id,
          action: ActivityAction.CATEGORY_UPDATED,
          entityType: 'Category',
          entityId: category.id,
          metadata: { changes },
        });
        return { category: toCategory(category) };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw categoryNameTaken();
      throw error;
    }
  }

  /**
   * Hard delete, only when no product (active or archived) uses the category.
   * Products are never reassigned or deleted implicitly.
   */
  async remove(context: OrganizationContext, categoryId: string): Promise<void> {
    const organizationId = context.organization.id;
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.category.findFirst({
          where: { id: categoryId, organizationId },
          select: CATEGORY_SELECT,
        });
        if (!current) throw categoryNotFound();
        if (current._count.products > 0) throw categoryInUse(current._count.products);

        await tx.category.delete({ where: { id: current.id } });
        await recordActivity(tx, {
          organizationId,
          actorUserId: context.user.id,
          action: ActivityAction.CATEGORY_DELETED,
          entityType: 'Category',
          entityId: current.id,
          metadata: { name: current.name },
        });
      });
    } catch (error) {
      // A product was assigned concurrently: the RESTRICT foreign key blocked the delete.
      if (isForeignKeyViolation(error)) {
        const productCount = await this.prisma.product.count({
          where: { organizationId, categoryId },
        });
        throw categoryInUse(productCount);
      }
      throw error;
    }
  }
}

/** Category names are unique per organization, compared case-insensitively. */
async function assertNameAvailable(
  tx: Prisma.TransactionClient,
  organizationId: string,
  name: string,
  excludeId?: string,
): Promise<void> {
  const existing = await tx.category.findFirst({
    where: {
      organizationId,
      // An ILIKE in PostgreSQL: escape % and _ so they only match themselves.
      name: { equals: escapeLikePattern(name), mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw categoryNameTaken();
}
