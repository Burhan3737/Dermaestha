// @ts-check
const fmt = (level, msg, meta) =>
  JSON.stringify({ at: new Date().toISOString(), level, msg, ...(meta ?? {}) });
export const logger = {
  info: (msg, meta) => console.log(fmt('info', msg, meta)),
  warn: (msg, meta) => console.warn(fmt('warn', msg, meta)),
  error: (msg, meta) => console.error(fmt('error', msg, meta)),
};
