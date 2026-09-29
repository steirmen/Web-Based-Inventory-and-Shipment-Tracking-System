import type { HealthResponse } from '@app/shared';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { HealthCheckPage } from './health-check-page';

const API_BASE_URL = 'http://api.test';

function healthResponse(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: 'ok',
    timestamp: '2026-01-01T12:00:00.000Z',
    uptime: 42,
    checks: { database: 'up' },
    ...overrides,
  };
}

describe('HealthCheckPage', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', API_BASE_URL);
  });

  it('shows a loading state, then the healthy result', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(healthResponse()));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<HealthCheckPage />);

    expect(screen.getByText('Contacting the API…')).toBeInTheDocument();

    expect(await screen.findAllByText('Operational')).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/health`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('reports a degraded system when the database is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(healthResponse({ status: 'degraded', checks: { database: 'down' } })),
        ),
    );

    renderWithProviders(<HealthCheckPage />);

    expect(await screen.findByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('Database unreachable')).toBeInTheDocument();
  });

  it('shows a failure state when the API cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')),
    );

    renderWithProviders(<HealthCheckPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('API unreachable');
    expect(
      screen.getByText(`The API at ${API_BASE_URL} could not be reached.`),
    ).toBeInTheDocument();
  });
});
