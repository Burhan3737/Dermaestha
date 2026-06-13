import { describe, it, expect, vi, beforeEach } from 'vitest';
import { track } from './track.js';
import { api } from '../apiClient/apiClient.js';

vi.mock('../apiClient/apiClient.js', () => ({ api: { post: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('track', () => {
  it('posts { type, networkType, meta } to /analytics/events', () => {
    api.post.mockResolvedValue(null);
    track('video_join_attempt', { appointmentId: 'a1', role: 'patient' });
    expect(api.post).toHaveBeenCalledWith('/analytics/events', {
      type: 'video_join_attempt',
      networkType: expect.any(String),
      meta: { appointmentId: 'a1', role: 'patient' },
    });
  });

  it('swallows a rejected POST (endpoint not deployed yet)', async () => {
    api.post.mockRejectedValue(new Error('404'));
    expect(() => track('video_join_success', { appointmentId: 'a1', role: 'doctor' })).not.toThrow();
    await Promise.resolve(); // let the rejected promise settle; no unhandled rejection
  });

  it('defaults meta to an empty object', () => {
    api.post.mockResolvedValue(null);
    track('landing_view');
    expect(api.post).toHaveBeenCalledWith('/analytics/events', {
      type: 'landing_view',
      networkType: expect.any(String),
      meta: {},
    });
  });
});
