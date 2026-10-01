import { execSync } from 'node:child_process';
import { E2E_DATABASE, REPO_ROOT } from './config.js';

/**
 * After every E2E run: the read-only integrity audit (prisma/integrity.ts) over
 * everything the tests did through the real UI and API — ledger, orders, SALE
 * movements, tenant relations, order numbers, owners. A broken invariant fails
 * the run. Only the E2E database is read.
 */
export default function globalTeardown(): void {
  const output = execSync('npx tsx prisma/verify-integrity.ts', {
    cwd: `${REPO_ROOT}apps/api`,
    env: { ...process.env, DB_NAME: E2E_DATABASE },
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const summary = output.trim().split('\n').at(-1);
  console.log(`\n[e2e] ${summary}`);
}
