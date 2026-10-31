import { Router } from "express";
import multer from "multer";
import auth from "../middleware/auth.js";
import Report from "../models/Report.js";
import { deleteImage, uploadImage } from "../config/cloudinary.js";
import { checkAndRunMidnightCleanup, performMidnightImageCleanup } from "../services/dailyReports.js";
import { asyncHandler, reportFields, sendSuccess } from "../utils/global.js";

const router = Router();
const imageFields = new Set(["trip1Image", "trip2Image", "trip3Image", "trip4Image", "trip5Image"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      const error = new Error("Only image files can be uploaded.");
      error.status = 400;
      return callback(error);
    }
    return callback(null, true);
  },
});

// Public cron endpoint for Vercel Cron or scheduled trigger at midnight (12:00 AM)
router.get(
  "/cron/midnight-cleanup",
  asyncHandler(async (_req, res) => {
    const result = await performMidnightImageCleanup();
    return sendSuccess(res, result, 200, "Midnight image cleanup completed.");
  }),
);

router.use(auth);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    // Check and trigger midnight image cleanup if a new day has arrived
    await checkAndRunMidnightCleanup();

    // Return permanent records sorted by AMO, UC, and Vehicle No
    const reports = await Report.find().sort({ amo: 1, uc: 1, vehicleNo: 1 });
    return sendSuccess(res, reports);
  }),
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const fields = reportFields(req.body);
    const existing = await Report.findOne({ owner: req.user.id, vehicleNo: fields.vehicleNo });
    if (existing) {
      const error = new Error(`Vehicle ${fields.vehicleNo} already exists in database.`);
      error.status = 409;
      throw error;
    }

    const report = await Report.create({ ...fields, owner: req.user.id });
    return sendSuccess(res, report, 201, "Vehicle record created.");
  }),
);

router.patch(
  "/amo/update",
  asyncHandler(async (req, res) => {
    const { oldAmo, newAmo, tcp } = req.body;
    if (!oldAmo || !newAmo) {
      const error = new Error("Both old and new AMO names are required.");
      error.status = 400;
      throw error;
    }
    const trimmedOld = String(oldAmo).trim();
    const trimmedNew = String(newAmo).trim();
    if (!trimmedNew) {
      const error = new Error("New AMO name cannot be empty.");
      error.status = 400;
      throw error;
    }
    const updateQuery = { amo: trimmedNew };
    if (tcp !== undefined && typeof tcp === "string" && tcp.trim()) {
      updateQuery.tcp = tcp.trim();
    }
    const result = await Report.updateMany({ amo: trimmedOld }, { $set: updateQuery });
    return sendSuccess(
      res,
      { modifiedCount: result.modifiedCount, oldAmo: trimmedOld, newAmo: trimmedNew },
      200,
      `AMO updated for ${result.modifiedCount} vehicle records.`,
    );
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const fields = reportFields(req.body);

    const report = await Report.findOneAndUpdate(
      { _id: req.params.id },
      { $set: fields },
      { new: true, runValidators: true },
    );
    if (!report) {
      const error = new Error("Report not found.");
      error.status = 404;
      throw error;
    }
    return sendSuccess(res, report, 200, "Vehicle record updated.");
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const report = await Report.findOneAndDelete({ _id: req.params.id });
    if (!report) {
      const error = new Error("Report not found.");
      error.status = 404;
      throw error;
    }

    await Promise.all(
      [report.trip1Image, report.trip2Image, report.trip3Image, report.trip4Image, report.trip5Image]
        .filter(Boolean)
        .map(({ publicId }) => deleteImage(publicId).catch(() => undefined)),
    );
    return sendSuccess(res, { id: report.id }, 200, "Vehicle record deleted.");
  }),
);

router.post(
  "/:id/images/:tripField",
  upload.single("image"),
  asyncHandler(async (req, res) => {
    if (!imageFields.has(req.params.tripField)) {
      const error = new Error("Unknown trip image field.");
      error.status = 400;
      throw error;
    }

    const report = await Report.findOne({ _id: req.params.id });
    if (!report) {
      const error = new Error("Report not found.");
      error.status = 404;
      throw error;
    }
    if (!req.file) {
      const error = new Error("An image file is required.");
      error.status = 400;
      throw error;
    }

    const field = req.params.tripField;
    const previousImage = report[field];
    const uploadedImage = await uploadImage(req.file.buffer);
    report[field] = uploadedImage;
    try {
      await report.save();
    } catch (error) {
      await deleteImage(uploadedImage.publicId).catch(() => undefined);
      throw error;
    }
    if (previousImage?.publicId) await deleteImage(previousImage.publicId).catch(() => undefined);

    return sendSuccess(res, report, 200, "Image uploaded.");
  }),
);

router.delete(
  "/:id/images/:tripField",
  asyncHandler(async (req, res) => {
    if (!imageFields.has(req.params.tripField)) {
      const error = new Error("Unknown trip image field.");
      error.status = 400;
      throw error;
    }

    const report = await Report.findOne({ _id: req.params.id });
    if (!report) {
      const error = new Error("Report not found.");
      error.status = 404;
      throw error;
    }

    const field = req.params.tripField;
    const previousImage = report[field];
    report[field] = null;
    await report.save();
    if (previousImage?.publicId) await deleteImage(previousImage.publicId).catch(() => undefined);

    return sendSuccess(res, report, 200, "Image removed.");
  }),
);

export default router;
