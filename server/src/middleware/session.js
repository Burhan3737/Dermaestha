// @ts-check
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { env } from '../config/env.js';
import { SESSION_TTL_DAYS } from '../config/constants.js';

const PgStore = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgStore({
    conObject: { connectionString: env.DATABASE_URL },
    tableName: 'session',
    createTableIfMissing: false, // Prisma owns the `session` DDL (CONFIG.md §5; schema.prisma)
  }),
  name: 'dermestha.sid',
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true, // §3.6
    secure: env.NODE_ENV === 'production', // Secure in prod; off for http://localhost dev
    sameSite: 'lax', // §3.6
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  },
});
