// @ts-check
import * as medicineService from './service.js';

export async function list(req, res, next) {
  try {
    res.json({ data: await medicineService.list({ search: req.query.search }) });
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
