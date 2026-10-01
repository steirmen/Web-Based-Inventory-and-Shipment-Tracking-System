import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PERMISSIONS } from '@app/shared';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { IS_PUBLIC_KEY } from '../../auth/decorators.js';
import { OrganizationAccessGuard } from '../../organizations/organization-access.guard.js';
import { REQUIRED_PERMISSIONS_KEY } from '../../organizations/organization-context.js';

/**
 * Route-level security, checked on the real controller metadata so a new
 * route can't silently skip it:
 * - only the intended routes are public (everything else needs a session);
 * - every organization-scoped route runs OrganizationAccessGuard AND declares
 *   at least one known permission (an empty list would admit every member).
 */

const SRC = fileURLToPath(new URL('../..', import.meta.url));

function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : controllerFiles(path);
    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

type Controller = (new (...args: never[]) => unknown) & Record<string, unknown>;

interface RouteInfo {
  route: string;
  isPublic: boolean;
  orgScoped: boolean;
  guarded: boolean;
  permissions: string[];
}

async function allRoutes(): Promise<RouteInfo[]> {
  const routes: RouteInfo[] = [];
  for (const file of controllerFiles(SRC)) {
    const module = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    for (const exported of Object.values(module)) {
      if (typeof exported !== 'function') continue;
      const controller = exported as Controller;
      const base = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined;
      if (base === undefined) continue; // not a controller class
      const classGuards = (Reflect.getMetadata(GUARDS_METADATA, controller) ?? []) as unknown[];
      const classPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
      const prototype = controller.prototype as Record<string, object>;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[name]!;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (name === 'constructor' || method === undefined) continue;
        const path = (Reflect.getMetadata(PATH_METADATA, handler) as string).replace(/^\/$/, '');
        const guards = [
          ...classGuards,
          ...((Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[]),
        ];
        routes.push({
          route: `${RequestMethod[method]} /${base}${path ? `/${path.replace(/^\//, '')}` : ''}`,
          isPublic: classPublic || Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true,
          orgScoped: base.includes(':organizationId'),
          guarded: guards.includes(OrganizationAccessGuard),
          permissions: (Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler) ?? []) as string[],
        });
      }
    }
  }
  return routes;
}

describe('route security', () => {
  it('finds the controllers', async () => {
    const files = controllerFiles(SRC).map((file) => relative(SRC, file).replaceAll('\\', '/'));
    expect(files).toEqual(
      expect.arrayContaining(['auth/auth.controller.ts', 'orders/orders.controller.ts']),
    );
    expect((await allRoutes()).length).toBeGreaterThan(60);
  });

  it('exposes only the intended public routes; everything else requires a session', async () => {
    const publicRoutes = (await allRoutes())
      .filter((route) => route.isPublic)
      .map((route) => route.route)
      .sort();
    expect(publicRoutes).toEqual([
      'GET /health',
      'GET /invitations/:token',
      'POST /auth/login',
      'POST /auth/logout',
      'POST /auth/register',
    ]);
  });

  it('guards every organization route with membership AND a declared, known permission', async () => {
    const orgRoutes = (await allRoutes()).filter((route) => route.orgScoped);
    expect(orgRoutes.length).toBeGreaterThan(50);

    const problems = orgRoutes.flatMap((route) => {
      const issues: string[] = [];
      if (route.isPublic) issues.push('is public');
      if (!route.guarded) issues.push('lacks OrganizationAccessGuard');
      if (route.permissions.length === 0) issues.push('declares no permission');
      for (const permission of route.permissions) {
        if (!(PERMISSIONS as readonly string[]).includes(permission)) {
          issues.push(`unknown permission ${permission}`);
        }
      }
      return issues.map((issue) => `${route.route} ${issue}`);
    });
    expect(problems).toEqual([]);
  });

  it('never accepts an organization id outside the route', async () => {
    // Organization-scoped data is only reachable under /organizations/:organizationId.
    const elsewhere = (await allRoutes()).filter(
      (route) => !route.orgScoped && /:(organizationId|orgId)\b/.test(route.route),
    );
    expect(elsewhere).toEqual([]);
  });
});
