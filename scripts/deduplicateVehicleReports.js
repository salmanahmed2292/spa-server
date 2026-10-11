import "dotenv/config";
import connectDatabase from "../config/db.js";
import { deleteImage } from "../config/cloudinary.js";
import Report from "../models/Report.js";
import { businessDate } from "../utils/businessDate.js";

const imageFields = ["trip1Image", "trip2Image", "trip3Image", "trip4Image", "trip5Image"];

const run = async () => {
  const today = businessDate();
  const reports = await Report.find().sort({ date: -1, updatedAt: -1, createdAt: -1 }).lean();
  const groups = new Map();

  for (const report of reports) {
    const vehicleKey = String(report.vehicleNo || "")
      .trim()
      .toLocaleLowerCase();
    const key = `${report.owner}:${vehicleKey}`;
    const group = groups.get(key);
    if (group) group.push(report);
    else groups.set(key, [report]);
  }

  const canonicalReports = [];
  const duplicateIds = [];
  for (const group of groups.values()) {
    group.sort((left, right) => {
      const dateOrder = String(right.date).localeCompare(String(left.date));
      if (dateOrder) return dateOrder;
      return new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt);
    });
    canonicalReports.push(group[0]);
    duplicateIds.push(...group.slice(1).map((report) => report._id));
  }

  const retainedImageIds = new Set();
  for (const report of canonicalReports) {
    if (report.date === today) {
      for (const field of imageFields) {
        if (report[field]?.publicId) retainedImageIds.add(report[field].publicId);
      }
    }
  }

  const imagesToDelete = new Set();
  for (const report of reports) {
    if (report.date === today && canonicalReports.some((canonical) => String(canonical._id) === String(report._id))) {
      continue;
    }
    for (const field of imageFields) {
      const publicId = report[field]?.publicId;
      if (publicId && !retainedImageIds.has(publicId)) imagesToDelete.add(publicId);
    }
  }

  const staleCanonical = canonicalReports.filter((report) => report.date !== today);
  console.log(
    `${process.argv.includes("--execute") ? "Migration:" : "Dry run:"} ${reports.length} documents, ${groups.size} unique vehicles, ${duplicateIds.length} duplicate documents, ${staleCanonical.length} existing vehicle records to advance to ${today}, ${imagesToDelete.size} expired images to delete.`,
  );

  if (!process.argv.includes("--execute")) return;
  if (!canonicalReports.length) throw new Error("No vehicle records found; refusing to run migration.");

  const imageIds = [...imagesToDelete];
  for (let index = 0; index < imageIds.length; index += 5) {
    const results = await Promise.allSettled(imageIds.slice(index, index + 5).map(deleteImage));
    if (results.some((result) => result.status === "rejected")) {
      throw new Error("Cloudinary cleanup failed; database documents were not changed. Retry the migration.");
    }
  }

  if (duplicateIds.length) await Report.deleteMany({ _id: { $in: duplicateIds } });
  for (const report of staleCanonical) {
    await Report.updateOne(
      { _id: report._id },
      {
        $set: {
          date: today,
          trip1Image: null,
          trip2Image: null,
          trip3Image: null,
          trip4Image: null,
          trip5Image: null,
        },
      },
    );
  }

  await Report.collection.createIndex({ owner: 1, vehicleNo: 1 }, { unique: true, name: "owner_1_vehicleNo_1" });
  const indexes = await Report.collection.indexes();
  if (indexes.some((index) => index.name === "owner_1_date_1_vehicleNo_1")) {
    await Report.collection.dropIndex("owner_1_date_1_vehicleNo_1");
  }

  console.log(`Migration complete: ${groups.size} unique vehicle records remain, dated ${today}.`);
};

try {
  await connectDatabase();
  await run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await Report.db?.close().catch(() => {});
}
