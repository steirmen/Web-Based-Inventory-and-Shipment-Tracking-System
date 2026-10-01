import {
  APPEARANCE_FIELDS,
  APPEARANCE_LIMITS,
  type AppearanceConfig,
  type AppearanceProfile,
  type AppearanceProfileListResponse,
  type AppearanceProfileResponse,
  type AppearanceResponse,
  DEFAULT_APPEARANCE,
} from '@app/shared';
import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../common/errors/prisma-errors.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  appearanceProfileLimit,
  appearanceProfileNameTaken,
  appearanceProfileNotFound,
} from './appearance-errors.js';
import type {
  AppearanceConfigDto,
  CreateAppearanceProfileDto,
  UpdateAppearanceProfileDto,
} from './dto/appearance.dto.js';

type Tx = Prisma.TransactionClient;

const CONFIG_SELECT = Object.fromEntries(APPEARANCE_FIELDS.map((field) => [field, true])) as Record<
  (typeof APPEARANCE_FIELDS)[number],
  true
>;

const PROFILE_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  ...CONFIG_SELECT,
} as const;

/** Only the known fields, in a fixed shape — never whatever else a row or body holds. */
function toConfig(source: Record<(typeof APPEARANCE_FIELDS)[number], string>): AppearanceConfig {
  return Object.fromEntries(
    APPEARANCE_FIELDS.map((field) => [field, source[field]]),
  ) as unknown as AppearanceConfig;
}

function toProfile(row: Prisma.AppearanceProfileGetPayload<{ select: typeof PROFILE_SELECT }>) {
  return {
    id: row.id,
    name: row.name,
    appearance: toConfig(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } satisfies AppearanceProfile;
}

/**
 * User-level appearance and saved appearance profiles. Ownership always comes
 * from the authenticated user (the id passed in by the controller), never
 * from the request body; profile lookups include the user id, so another
 * user's profile answers exactly like an unknown one (404).
 */
@Injectable()
export class AppearanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** The saved appearance, or the defaults when the user never saved one. */
  async get(userId: string): Promise<AppearanceResponse> {
    const row = await this.prisma.userAppearance.findUnique({
      where: { userId },
      select: { ...CONFIG_SELECT, updatedAt: true },
    });
    return row
      ? { appearance: toConfig(row), updatedAt: row.updatedAt.toISOString() }
      : { appearance: { ...DEFAULT_APPEARANCE }, updatedAt: null };
  }

  /** Replaces the whole configuration (validated by AppearanceConfigDto). */
  async update(userId: string, config: AppearanceConfigDto): Promise<AppearanceResponse> {
    await this.save(this.prisma, userId, toConfig(config));
    return this.get(userId);
  }

  /** Back to DEFAULT_APPEARANCE: the row is removed, so future default changes apply too. */
  async reset(userId: string): Promise<AppearanceResponse> {
    await this.prisma.userAppearance.deleteMany({ where: { userId } });
    return this.get(userId);
  }

  async listProfiles(userId: string): Promise<AppearanceProfileListResponse> {
    const rows = await this.prisma.appearanceProfile.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: PROFILE_SELECT,
    });
    return { profiles: rows.map(toProfile) };
  }

  async createProfile(
    userId: string,
    input: CreateAppearanceProfileDto,
  ): Promise<AppearanceProfileResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serializes this user's profile creates, so the limit can't be raced past.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const count = await tx.appearanceProfile.count({ where: { userId } });
        if (count >= APPEARANCE_LIMITS.profilesMax) throw appearanceProfileLimit();
        await this.assertNameFree(tx, userId, input.name);
        const row = await tx.appearanceProfile.create({
          data: { userId, name: input.name, ...toConfig(input.appearance) },
          select: PROFILE_SELECT,
        });
        return { profile: toProfile(row) };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw appearanceProfileNameTaken();
      throw error;
    }
  }

  /** Rename and/or replace the stored configuration. */
  async updateProfile(
    userId: string,
    profileId: string,
    input: UpdateAppearanceProfileDto,
  ): Promise<AppearanceProfileResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.appearanceProfile.findFirst({
          where: { id: profileId, userId },
          select: { id: true, name: true },
        });
        if (!current) throw appearanceProfileNotFound();
        if (input.name !== undefined && input.name.toLowerCase() !== current.name.toLowerCase()) {
          await this.assertNameFree(tx, userId, input.name);
        }
        const row = await tx.appearanceProfile.update({
          where: { id: current.id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.appearance ? toConfig(input.appearance) : {}),
          },
          select: PROFILE_SELECT,
        });
        return { profile: toProfile(row) };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw appearanceProfileNameTaken();
      throw error;
    }
  }

  async deleteProfile(userId: string, profileId: string): Promise<void> {
    const { count } = await this.prisma.appearanceProfile.deleteMany({
      where: { id: profileId, userId },
    });
    if (count === 0) throw appearanceProfileNotFound();
  }

  /** Makes the profile's configuration the user's current appearance. */
  async applyProfile(userId: string, profileId: string): Promise<AppearanceResponse> {
    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.appearanceProfile.findFirst({
        where: { id: profileId, userId },
        select: CONFIG_SELECT,
      });
      if (!profile) throw appearanceProfileNotFound();
      await this.save(tx, userId, toConfig(profile));
    });
    return this.get(userId);
  }

  private async save(client: Tx | PrismaService, userId: string, config: AppearanceConfig) {
    await client.userAppearance.upsert({
      where: { userId },
      create: { userId, ...config },
      update: config,
    });
  }

  private async assertNameFree(tx: Tx, userId: string, name: string): Promise<void> {
    const taken = await tx.appearanceProfile.findFirst({
      where: { userId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (taken) throw appearanceProfileNameTaken();
  }
}
