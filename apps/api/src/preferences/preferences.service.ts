import { isLanguage, type Language, type PreferencesResponse } from '@app/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

/** The signed-in user's interface preferences (Phase 10.1): only the language. */
@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async update(userId: string, language: Language): Promise<PreferencesResponse> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { language },
      select: { language: true },
    });
    return { language: isLanguage(user.language) ? user.language : null };
  }
}
