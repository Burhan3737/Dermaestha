// @ts-check
/** Coded application error. `code` is a stable SCREAMING_SNAKE string (API.md §1.1). */
export class AppError extends Error {
  /** @param {string} code @param {string} message @param {number} status @param {object} [details] */
  constructor(code, message, status, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
