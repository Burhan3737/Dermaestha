// @ts-check
import * as bookingService from './service.js';
import * as appointmentService from './service.js';
import * as cancellationService from './service.js';
import * as videoService from '../video/service.js';

export async function lock(req, res, next) {
  try {
    const appt = await bookingService.lockSlot({ patientUserId: req.session.userId, ...req.body });
    res.status(201).json({ id: appt.id });
  } catch (e) {
    next(e);
  }
}

export async function pay(req, res, next) {
  try {
    res.json(
      await appointmentService.submitPaymentReference({
        patientUserId: req.session.userId,
        appointmentId: req.params.id,
        reference: req.body.reference,
      }),
    );
  } catch (e) {
    next(e);
  }
}

export async function list(req, res, next) {
  try {
    res.json({
      data: await appointmentService.listForRole({
        role: req.session.role,
        userId: req.session.userId,
        scope: req.query.scope,
      }),
    });
  } catch (e) {
    next(e);
  }
}

export async function detail(req, res, next) {
  try {
    res.json(
      await appointmentService.getForRole({
        id: req.params.id,
        role: req.session.role,
        userId: req.session.userId,
      }),
    );
  } catch (e) {
    next(e);
  }
}

export async function cancel(req, res, next) {
  try {
    res.json(
      await cancellationService.cancel({
        appointmentId: req.params.id,
        actorType: req.session.role,
        actorId: req.session.userId,
        reason: req.body.reason,
      }),
    );
  } catch (e) {
    next(e);
  }
}

export async function dispute(req, res, next) {
  try {
    res.json(
      await appointmentService.setDisputed({
        appointmentId: req.params.id,
        disputed: req.body.disputed,
        actorId: req.session.userId,
      }),
    );
  } catch (e) {
    next(e);
  }
}

export async function videoToken(req, res, next) {
  try {
    res.json(
      await videoService.issueAppointmentToken({
        id: req.params.id,
        role: req.session.role,
        userId: req.session.userId,
      }),
    );
  } catch (e) {
    next(e);
  }
}
