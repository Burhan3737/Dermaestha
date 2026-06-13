// @ts-check
import * as adminService from './service.js';

export async function records(req, res, next) {
  try {
    res.json(await adminService.listRecords(req.query));
  } catch (e) {
    next(e);
  }
}

export async function recordDetail(req, res, next) {
  try {
    res.json(await adminService.getRecordDetail(req.params.id));
  } catch (e) {
    next(e);
  }
}

export async function auditEntries(req, res, next) {
  try {
    res.json(await adminService.listAuditEntries(req.query));
  } catch (e) {
    next(e);
  }
}

export async function resendEmail(req, res, next) {
  try {
    res.json(await adminService.resendEmail({ jobId: req.params.jobId, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}

export async function alerts(_req, res, next) {
  try {
    res.json({ data: await adminService.listAlerts() });
  } catch (e) {
    next(e);
  }
}

export async function getSettings(_req, res, next) {
  try {
    res.json(await adminService.getSettings());
  } catch (e) {
    next(e);
  }
}

export async function putSettings(req, res, next) {
  try {
    res.json(await adminService.updateSettings({ data: req.body, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}

export async function recordRefund(req, res, next) {
  try {
    res.json(
      await adminService.recordManualRefund({
        appointmentId: req.params.appointmentId,
        refundRef: req.body.refundRef,
        amount: req.body.amount,
        actorId: req.session.userId,
      }),
    );
  } catch (e) {
    next(e);
  }
}
