// @ts-check
/**
 * Zod validation at the API edge (PROJECT_RULES). On failure the ZodError flows to errorHandler,
 * which emits the uniform `400 VALIDATION_FAILED` envelope. On success, req.body is the parsed data.
 * @param {import('zod').ZodSchema} schema
 */
export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(result.error);
    req.body = result.data;
    next();
  };
}
