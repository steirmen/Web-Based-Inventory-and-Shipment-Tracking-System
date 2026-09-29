import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection string of the test database, provided by global-setup.ts. */
    databaseUrl: string;
  }
}
