// @ts-check
import * as doctorService from './service.js';
import * as availabilityService from './service.js';
import { AppError } from '../../http/AppError.js';
import * as adminService from './admin.service.js';

export async function list(req, res, next) {
  try {
    // includeInactive (A-01) is admin-only; the public listing path is unchanged.
    // req.body contains the parsed query (the route does req.body = req.query before calling here).
    if (req.body.includeInactive === 'true') {
      if (!['admin', 'superadmin'].includes(req.session?.role)) throw new AppError('FORBIDDEN', 'Not allowed.', 403);
      return res.json({ data: await adminService.listAllDoctors() });
    }
    res.json(await doctorService.listActiveDoctors(req.body /* parsed query, see route */));
  } catch (e) {
    next(e);
  }
}

export async function getOne(req, res, next) {
  try {
    res.json(await doctorService.getPublicDoctor(req.params.id));
  } catch (e) {
    next(e);
  }
}

export async function slots(req, res, next) {
  try {
    // Active-doctor gate (404-no-leak, parity with the profile endpoint): an inactive or
    // unknown doctor must not expose bookable slots.
    await doctorService.getPublicDoctor(req.params.id);
    res.json({ data: await availabilityService.generateSlots(req.params.id, req.query.date) });
  } catch (e) {
    next(e);
  }
}

export async function getAvailability(req, res, next) {
  try {
    if (req.session.role === 'doctor') {
      const own = await doctorService.getDoctorByUserId(req.session.userId);
      if (!own || own.id !== req.params.id) throw new AppError('NOT_FOUND', 'Not found.', 404);
    }
    res.json({ blocks: await availabilityService.getWeeklyBlocks(req.params.id) });
  } catch (e) {
    next(e);
  }
}

export async function replaceAvailability(req, res, next) {
  try {
    res.json({
      blocks: await availabilityService.replaceWeeklyBlocks(req.session.userId, req.body.blocks),
    });
  } catch (e) {
    next(e);
  }
}

export async function create(req, res, next) {
  try {
    res.status(201).json(await adminService.createDoctor({ data: req.body, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}

export async function update(req, res, next) {
  try {
    await adminService.updateDoctor({ id: req.params.id, data: req.body, actorId: req.session.userId });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function deactivate(req, res, next) {
  try {
    res.json(await adminService.setDoctorActive({ id: req.params.id, isActive: false, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}

export async function reactivate(req, res, next) {
  try {
    res.json(await adminService.setDoctorActive({ id: req.params.id, isActive: true, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}

export async function resetPassword(req, res, next) {
  try {
    await adminService.resetDoctorPassword({
      id: req.params.id,
      newPassword: req.body.newPassword,
      actorId: req.session.userId,
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function photo(req, res, next) {
  try {
    if (!req.file?.buffer) throw new AppError('INVALID_FILE', 'Attach a photo file.', 400);
    res.json(await adminService.saveDoctorPhoto({ id: req.params.id, buffer: req.file.buffer, actorId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}

export async function adminReplaceAvailability(req, res, next) {
  try {
    res.json({
      blocks: await adminService.adminReplaceBlocks({
        doctorId: req.params.id,
        blocks: req.body.blocks,
        actorId: req.session.userId,
      }),
    });
  } catch (e) {
    next(e);
  }
}
