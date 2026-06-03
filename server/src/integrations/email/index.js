// @ts-check
import { resendStub } from './resend.stub.js';
import { consoleEmail } from './console.dev.js';
import { env } from '../../config/env.js';

/**
 * @typedef {Object} EmailProvider
 * @property {(args: any) => Promise<{ providerId: string }>} send
 * @property {(req: import('express').Request) => any} parseWebhook
 */
export const emailProvider = env.EMAIL_PROVIDER === 'console' ? consoleEmail : resendStub;
