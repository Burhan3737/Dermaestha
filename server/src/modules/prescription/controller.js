// @ts-check
import * as prescriptionService from './service.js';

export async function create(req, res, next) {
  try {
    const created = await prescriptionService.submit({
      appointmentId: req.params.id,
      doctorUserId: req.session.userId,
      ...req.body,
    });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
}

export async function list(req, res, next) {
  try {
    res.json({
      data: await prescriptionService.listByAppointment({
        appointmentId: req.params.id,
        role: req.session.role,
        userId: req.session.userId,
      }),
    });
  } catch (e) {
    next(e);
  }
}
