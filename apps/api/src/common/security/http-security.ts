import type { ApiErrorBody } from '@app/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Methods that never change state (RFC 9110 "safe"); every other method is checked. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const CSRF_REJECTED: ApiErrorBody = {
  statusCode: 403,
  code: 'CSRF_ORIGIN_REJECTED',
  message: 'This request did not come from an allowed origin.',
};

/** The origin (scheme://host[:port]) of a Referer URL, or null if it isn't a valid URL. */
function originOf(referer: string): string | null {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF protection for the cookie session: every state-changing request
 * (POST/PUT/PATCH/DELETE) must come from an allowed web-app origin.
 *
 * Why SameSite=Lax alone is not enough: it only stops CROSS-SITE requests.
 * Other origins on the same site (another port on localhost, a sibling
 * subdomain) still send the cookie, and an HTML form can post to the API
 * without any CORS preflight. Browsers attach `Origin` to every POST, PUT,
 * PATCH, and DELETE (as "null" from sandboxed or privacy-stripped contexts),
 * so checking it against API_CORS_ORIGINS closes that gap.
 *
 * - `Origin` present → it must be allowed ("null" never is).
 * - No `Origin` but a `Referer` → the Referer's origin must be allowed.
 * - Neither header → allowed: browsers always send at least one of them on
 *   these methods, so such a request comes from a non-browser client (curl,
 *   tests, server-to-server), which cannot ride a victim's cookie anyway.
 *
 * GET, HEAD, and OPTIONS are never checked: they don't change state (CORS
 * preflights are answered before this runs).
 */
export function csrfOriginCheck(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (request: Request, response: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }
    const origin = request.get('origin');
    const referer = request.get('referer');
    const source = origin ?? (referer === undefined ? undefined : originOf(referer));
    if (source === undefined || (source !== null && allowed.has(source))) {
      next();
      return;
    }
    response.status(403).json(CSRF_REJECTED);
  };
}

/**
 * Security headers for every API response. The API serves only JSON and CSV
 * downloads, so the content security policy denies everything: nothing it
 * returns is ever meant to be rendered, framed, or to run scripts.
 * HSTS is sent only in production (HTTPS is required there, see env.ts).
 */
export function securityHeaders(production: boolean): RequestHandler {
  return (_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    if (production) {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    next();
  };
}
