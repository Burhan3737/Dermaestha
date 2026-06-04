// @ts-check
import { dailyStub } from './daily.stub.js';
import { dailyMock } from './daily.mock.js';
import { env } from '../../config/env.js';
/**
 * @typedef {Object} VideoProvider
 * @property {(appointmentId: string) => Promise<{ roomName: string, roomUrl: string }>} createRoom
 * @property {(args: { roomName: string, role: 'patient'|'doctor', notBeforeIso: string,
 *   notAfterIso: string, displayName: string }) => Promise<{ token: string, expiresAt: string }>} issueToken
 */
// 'daily' resolves to the throwing stub until the concrete daily.js adapter is wired.
export const videoProvider = env.VIDEO_PROVIDER === 'mock' ? dailyMock : dailyStub;
