# @app/shared

Types, constants, and contracts shared by `apps/api` and `apps/web` (for example, API response shapes).

- Compiled to `dist/` with `tsc`; the build runs automatically after `npm install` and in watch mode during `npm run dev`.
- Keep this package framework-free: no NestJS, React, or Prisma imports.
