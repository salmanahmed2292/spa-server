import "dotenv/config";
import mongoose from "mongoose";
import connectDatabase from "../config/db.js";
import Report from "../models/Report.js";

const run = async () => {
  console.log("Connecting to database...");
  await connectDatabase();

  const allReports = await Report.find().sort({ updatedAt: -1, createdAt: -1 }).lean();
  console.log(`Total reports in database: ${allReports.length}`);

  const vehicleMap = new Map();
  const duplicateIds = [];

  for (const report of allReports) {
    const key = `${report.owner}:${String(report.vehicleNo || "")
      .trim()
      .toLowerCase()}`;
    if (!vehicleMap.has(key)) {
      vehicleMap.set(key, report);
    } else {
      duplicateIds.push(report._id);
    }
  }

  console.log(`Unique vehicles: ${vehicleMap.size}`);
  console.log(`Duplicate documents to delete: ${duplicateIds.length}`);

  if (duplicateIds.length > 0) {
    const deleteResult = await Report.deleteMany({ _id: { $in: duplicateIds } });
    console.log(`Deleted ${deleteResult.deletedCount} duplicate documents.`);
  }

  // Drop old index if exists
  const existingIndexes = await Report.collection.indexes();
  console.log(
    "Existing indexes:",
    existingIndexes.map((i) => i.name),
  );

  const oldIndex = existingIndexes.find((i) => i.name === "owner_1_date_1_vehicleNo_1");
  if (oldIndex) {
    console.log("Dropping old index owner_1_date_1_vehicleNo_1...");
    await Report.collection.dropIndex("owner_1_date_1_vehicleNo_1");
    console.log("Old index dropped.");
  }

  // Ensure new unique index on (owner, vehicleNo)
  const hasNewIndex = existingIndexes.find((i) => i.name === "owner_1_vehicleNo_1");
  if (!hasNewIndex) {
    console.log("Creating unique index on { owner: 1, vehicleNo: 1 }...");
    await Report.collection.createIndex({ owner: 1, vehicleNo: 1 }, { unique: true, name: "owner_1_vehicleNo_1" });
    console.log("Unique index created.");
  }

  const finalCount = await Report.countDocuments();
  console.log(`Final count in database: ${finalCount} unique vehicles.`);
  console.log("Deduplication completed successfully!");

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((error) => {
  console.error("Migration error:", error);
  process.exit(1);
});
