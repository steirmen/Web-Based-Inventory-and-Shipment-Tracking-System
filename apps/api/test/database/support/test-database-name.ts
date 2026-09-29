/** Database tests only ever run against a database whose name ends in `_test`. */
const TEST_DATABASE_NAME = /^[a-z0-9_]+_test$/;

export const DEFAULT_TEST_DATABASE_NAME = 'app_test';

export function assertIsTestDatabase(name: string, developmentName?: string): void {
  if (!TEST_DATABASE_NAME.test(name) || name === developmentName) {
    throw new Error(
      `Refusing to use database "${name}" for tests: the test database name must end in "_test" ` +
        'and differ from DB_NAME. Set DB_TEST_NAME in .env.',
    );
  }
}
