// @ts-check
import * as medicineService from './service.js';
import { AppError } from '../../http/AppError.js';

export async function list(req, res, next) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    if (includeInactive && req.session.role !== 'admin') {
      throw new AppError('FORBIDDEN', 'Not allowed.', 403);
    }
    res.json({ data: await medicineService.list({ search: req.query.search, includeInactive }) });
  } catch (e) {
    next(e);
  }
}

export async function create(req, res, next) {
  try {
    res
      .status(201)
      .json(await medicineService.create({ data: req.body, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}

export async function update(req, res, next) {
  try {
    res.json(
      await medicineService.update({
        id: req.params.id,
        data: req.body,
        actorId: req.session.userId,
      }),
    );
  } catch (e) {
    next(e);
  }
}
