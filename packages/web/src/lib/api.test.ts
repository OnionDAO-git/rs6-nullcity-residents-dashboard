import { describe, expect, test } from 'bun:test';
import { dashboardApiHeaders } from './api';

describe('dashboardApiHeaders', () => {
  test('adds the city csrf token to unsafe generic dashboard API requests', () => {
    const headers = dashboardApiHeaders({ method: 'POST' }, 'csrf-token-123');

    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-csrf-token')).toBe('csrf-token-123');
  });

  test('does not add csrf to safe generic dashboard API reads', () => {
    const headers = dashboardApiHeaders({ method: 'GET' }, 'csrf-token-123');

    expect(headers.get('x-csrf-token')).toBeNull();
  });
});
