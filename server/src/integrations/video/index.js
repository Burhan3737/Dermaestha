// @ts-check
import { dailyStub } from './daily.stub.js';
/**
 * @typedef {Object} VideoProvider
 * @property {(appointmentId: string) => Promise<any>} createRoom
 * @property {(args: any) => Promise<any>} issueToken
 */
export const videoProvider = dailyStub;
