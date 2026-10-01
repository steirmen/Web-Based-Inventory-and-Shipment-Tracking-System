import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { buildDatabaseUrl, databaseOptionsFromEnv } from '../src/config/database-url.js';
import { ROOT_ENV_FILE } from '../src/config/env.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { verifyIntegrity } from './integrity.js';

/**
 * `npm run db:verify`: read-only integrity audit of the database named by
 * DB_NAME (the development database by default; set DB_NAME to audit another).
 * Prints only check names and violation counts/ids — never data or secrets.
 * Exit code 1 when any invariant is broken.
 */
loadEnv({ path: ROOT_ENV_FILE, quiet: true });
const options = databaseOptionsFromEnv(process.env);
if (!options) {
  console.error('DB_HOST, DB_NAME, and DB_USER are required (see .env.example).');
  process.exit(2);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: buildDatabaseUrl(options) }),
});

try {
  const checks = await verifyIntegrity(prisma);
  let failed = 0;
  for (const check of checks) {
    const ok = check.violations.length === 0;
    if (!ok) failed += 1;
    console.log(
      `${ok ? 'OK  ' : 'FAIL'} ${check.name}: ${check.description}` +
        (ok
          ? ''
          : ` — ${check.violations.length} violation(s): ${check.violations.slice(0, 10).join(', ')}`),
    );
  }
  console.log(
    `\nDatabase "${options.name}": ${checks.length - failed}/${checks.length} integrity checks passed.`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
} finally {
  await prisma.$disconnect();
}
