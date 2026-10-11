import mongoose from "mongoose";
import connectDatabase from "../config/db.js";
import ensureSuperAdmin from "../config/superAdmin.js";
import { app } from "../index.js";

let superAdminEnsured = false;

const prepareDatabase = async () => {
  if (mongoose.connection.readyState !== 1) {
    await connectDatabase();
  }
  if (!superAdminEnsured) {
    await ensureSuperAdmin();
    superAdminEnsured = true;
  }
};

export default async (req, res) => {
  await prepareDatabase();
  return app(req, res);
};
