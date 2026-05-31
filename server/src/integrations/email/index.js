// @ts-check
import { resendStub } from './resend.stub.js';
/**
 * @typedef {Object} EmailProvider
 * @property {(args: any) => Promise<{ providerId: string }>} send
 * @property {(req: import('express').Request) => any} parseWebhook
 */
export const emailProvider = resendStub;
