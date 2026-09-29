/** Overall API health. `degraded` means the API is up but a dependency is not. */
export type HealthStatus = 'ok' | 'degraded';

/** Reachability of a single dependency such as the database. */
export type DependencyStatus = 'up' | 'down';

/** Response body of `GET /health`. */
export interface HealthResponse {
  status: HealthStatus;
  /** ISO-8601 timestamp of when the check ran. */
  timestamp: string;
  /** Process uptime in whole seconds. */
  uptime: number;
  checks: {
    database: DependencyStatus;
  };
}
