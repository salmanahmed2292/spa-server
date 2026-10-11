import AppConfig from "../models/AppConfig.js";
import Report from "../models/Report.js";
import { deleteImage } from "../config/cloudinary.js";
import { businessDate } from "../utils/businessDate.js";

const imageFields = ["trip1Image", "trip2Image", "trip3Image", "trip4Image", "trip5Image"];

export const performMidnightImageCleanup = async (cleanupDate = businessDate()) => {
  console.log(`Starting midnight Cloudinary image cleanup for date ${cleanupDate}...`);

  // Find all reports having at least one trip image
  const reportsWithImages = await Report.find({
    $or: [
      { "trip1Image.publicId": { $exists: true, $ne: null } },
      { "trip2Image.publicId": { $exists: true, $ne: null } },
      { "trip3Image.publicId": { $exists: true, $ne: null } },
      { "trip4Image.publicId": { $exists: true, $ne: null } },
      { "trip5Image.publicId": { $exists: true, $ne: null } },
    ],
  })
    .select("trip1Image trip2Image trip3Image trip4Image trip5Image vehicleNo")
    .lean();

  const publicIdsToDelete = new Set();
  for (const report of reportsWithImages) {
    for (const field of imageFields) {
      const publicId = report[field]?.publicId;
      if (publicId) publicIdsToDelete.add(publicId);
    }
  }

  let deletedCount = 0;
  let failedCount = 0;

  const publicIdList = [...publicIdsToDelete];
  for (let i = 0; i < publicIdList.length; i += 5) {
    const chunk = publicIdList.slice(i, i + 5);
    const results = await Promise.allSettled(chunk.map((id) => deleteImage(id)));
    for (const res of results) {
      if (res.status === "fulfilled") {
        deletedCount += 1;
      } else {
        failedCount += 1;
        console.error("Cloudinary image deletion failed:", res.reason?.message);
      }
    }
  }

  // Reset all vehicle trip images in MongoDB (keep vehicle records permanently!)
  const updateResult = await Report.updateMany(
    {},
    {
      $set: {
        trip1Image: null,
        trip2Image: null,
        trip3Image: null,
        trip4Image: null,
        trip5Image: null,
      },
    },
  );

  // Update AppConfig tracking
  await AppConfig.updateOne(
    { key: "lastMidnightImageCleanupDate" },
    { $set: { value: cleanupDate } },
    { upsert: true },
  );

  console.log(
    `Midnight image cleanup completed: ${deletedCount} images deleted from Cloudinary (${failedCount} failed), ${updateResult.modifiedCount} vehicle records reset for new day trips.`,
  );

  return {
    deletedImages: deletedCount,
    failedImages: failedCount,
    modifiedRecords: updateResult.modifiedCount,
    date: cleanupDate,
  };
};

export const checkAndRunMidnightCleanup = async () => {
  const today = businessDate();
  const config = await AppConfig.findOne({ key: "lastMidnightImageCleanupDate" }).lean();

  if (!config || config.value !== today) {
    console.log(`New business day detected (${today}). Running automatic midnight image cleanup...`);
    try {
      return await performMidnightImageCleanup(today);
    } catch (error) {
      console.error("Automatic midnight image cleanup failed:", error.message);
    }
  }
  return null;
};

export const runDailyReportMaintenance = async () => {
  const today = businessDate();
  await performMidnightImageCleanup(today);
  return today;
};
