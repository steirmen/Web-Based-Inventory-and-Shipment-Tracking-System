import {
  CUSTOMER_LIMITS,
  type CustomerListResponse,
  type CustomerResponse,
  type CustomerSortField,
  type SortOrder,
} from '@app/shared';
import { Injectable } from '@nestjs/common';
import { ActivityAction, recordActivity } from '../activity/activity-log.js';
import { escapeLikePattern } from '../common/validation/like-pattern.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { OrganizationContext } from '../organizations/organization-context.js';
import { customerNotFound, customerStatusInvalid } from './customer-errors.js';
import { CUSTOMER_SELECT, toCustomer } from './customer-mappers.js';
import type {
  CreateCustomerDto,
  CustomerListQueryDto,
  UpdateCustomerDto,
} from './dto/customer.dto.js';

type Client = Prisma.TransactionClient | PrismaService;

const EDITABLE_FIELDS = ['name', 'companyName', 'email', 'phone', 'address', 'notes'] as const;

/** Maps the whitelisted `sortBy` values to Prisma order clauses — never a raw column name. */
function orderByFor(
  field: CustomerSortField,
  order: SortOrder,
): Prisma.CustomerOrderByWithRelationInput[] {
  const primary: Prisma.CustomerOrderByWithRelationInput =
    field === 'companyName'
      ? { companyName: { sort: order, nulls: 'last' } }
      : ({ [field]: order } as Prisma.CustomerOrderByWithRelationInput);
  // Unique tie-breaker so pages never overlap or skip rows.
  return [primary, { id: 'asc' }];
}

/**
 * Organization-scoped customers. Customers are archived (isActive = false),
 * never deleted: orders keep referencing them. Every query filters by the
 * organization from the verified OrganizationContext.
 */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: CustomerListQueryDto): Promise<CustomerListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? CUSTOMER_LIMITS.pageSizeDefault;
    const search = query.search ? escapeLikePattern(query.search) : undefined;
    const where: Prisma.CustomerWhereInput = {
      organizationId,
      ...(query.status ? { isActive: query.status === 'ACTIVE' } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { companyName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [totalItems, rows] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: orderByFor(query.sortBy ?? 'name', query.sortOrder ?? 'asc'),
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: CUSTOMER_SELECT,
      }),
    ]);
    return {
      items: rows.map(toCustomer),
      pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
    };
  }

  get(organizationId: string, customerId: string): Promise<CustomerResponse> {
    return this.read(this.prisma, organizationId, customerId);
  }

  create(context: OrganizationContext, input: CreateCustomerDto): Promise<CustomerResponse> {
    const organizationId = context.organization.id;
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          organizationId,
          name: input.name,
          companyName: input.companyName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          notes: input.notes ?? null,
        },
        select: CUSTOMER_SELECT,
      });
      await recordActivity(tx, {
        organizationId,
        actorUserId: context.user.id,
        action: ActivityAction.CUSTOMER_CREATED,
        entityType: 'Customer',
        entityId: customer.id,
        metadata: { name: customer.name },
      });
      return { customer: toCustomer(customer) };
    });
  }

  /** Partial update. Logs only real changes, and only the NAMES of changed contact fields. */
  async update(
    context: OrganizationContext,
    customerId: string,
    input: UpdateCustomerDto,
  ): Promise<CustomerResponse> {
    if (input.isActive !== undefined) throw customerStatusInvalid();
    const organizationId = context.organization.id;

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.customer.findFirst({
        where: { id: customerId, organizationId },
        select: CUSTOMER_SELECT,
      });
      if (!current) throw customerNotFound();

      // `name` is never null here: the DTO rejects a null name.
      const data: Record<string, string | null> = {};
      for (const field of EDITABLE_FIELDS) {
        const value = input[field];
        if (value !== undefined && value !== current[field]) data[field] = value;
      }
      const changedFields = Object.keys(data);
      if (changedFields.length === 0) return { customer: toCustomer(current) };

      await tx.customer.update({ where: { id: current.id }, data });
      await recordActivity(tx, {
        organizationId,
        actorUserId: context.user.id,
        action: ActivityAction.CUSTOMER_UPDATED,
        entityType: 'Customer',
        entityId: current.id,
        metadata: { name: data.name ?? current.name, changedFields },
      });
      return this.read(tx, organizationId, current.id);
    });
  }

  archive(context: OrganizationContext, customerId: string): Promise<CustomerResponse> {
    return this.transition(context, customerId, false);
  }

  restore(context: OrganizationContext, customerId: string): Promise<CustomerResponse> {
    return this.transition(context, customerId, true);
  }

  /**
   * Idempotent status change with a conditional update, logged only on a real
   * transition. Archived customers keep their orders; they just can't be put
   * on new or draft orders, or on orders being confirmed.
   */
  private async transition(
    context: OrganizationContext,
    customerId: string,
    isActive: boolean,
  ): Promise<CustomerResponse> {
    const organizationId = context.organization.id;
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.customer.findFirst({
        where: { id: customerId, organizationId },
        select: { id: true, name: true, isActive: true },
      });
      if (!current) throw customerNotFound();

      if (current.isActive !== isActive) {
        const { count } = await tx.customer.updateMany({
          where: { id: current.id, organizationId, isActive: !isActive },
          data: { isActive },
        });
        if (count === 1) {
          await recordActivity(tx, {
            organizationId,
            actorUserId: context.user.id,
            action: isActive ? ActivityAction.CUSTOMER_RESTORED : ActivityAction.CUSTOMER_ARCHIVED,
            entityType: 'Customer',
            entityId: current.id,
            metadata: { name: current.name },
          });
        }
      }
      return this.read(tx, organizationId, current.id);
    });
  }

  private async read(
    client: Client,
    organizationId: string,
    customerId: string,
  ): Promise<CustomerResponse> {
    const customer = await client.customer.findFirst({
      where: { id: customerId, organizationId },
      select: CUSTOMER_SELECT,
    });
    if (!customer) throw customerNotFound();
    return { customer: toCustomer(customer) };
  }
}
