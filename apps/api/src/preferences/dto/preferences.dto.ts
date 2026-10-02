import { type Language, LANGUAGES, type UpdatePreferencesRequest } from '@app/shared';
import { IsIn } from 'class-validator';

/** Only the language; anything else (userId, …) is rejected by the ValidationPipe. */
export class UpdatePreferencesDto implements UpdatePreferencesRequest {
  @IsIn(LANGUAGES, { message: `language must be one of: ${LANGUAGES.join(', ')}.` })
  language: Language;
}
