// @ts-check
import * as doctorService from '../services/doctor.service.js';
import * as availabilityService from '../services/availability.service.js';
import { AppError } from '../http/AppError.js';

export async function list(req, res, next) {
  try {
    res.json(await doctorService.listActiveDoctors(req.body /* parsed query, see route */));
  } catch (e) { next(e); }
}

export async function getOne(req, res, next) {
  try {
    res.json(await doctorService.getPublicDoctor(req.params.id));
  } catch (e) { next(e); }
}

export async function slots(req, res, next) {
  try {
    res.json({ data: await availabilityService.generateSlots(req.params.id, req.query.date) });
  } catch (e) { next(e); }
}

export async function getAvailability(req, res, next) {
  try {
    if (req.session.role === 'doctor') {
      const own = await doctorService.getDoctorByUserId(req.session.userId);
      if (!own || own.id !== req.params.id) throw new AppError('NOT_FOUND', 'Not found.', 404);
    }
    res.json({ blocks: await availabilityService.getWeeklyBlocks(req.params.id) });
  } catch (e) { next(e); }
}

export async function replaceAvailability(req, res, next) {
  try {
    res.json({ blocks: await availabilityService.replaceWeeklyBlocks(req.session.userId, req.body.blocks) });
  } catch (e) { next(e); }
}
