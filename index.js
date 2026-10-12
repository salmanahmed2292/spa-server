import "dotenv/config";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import connectDatabase from "./config/db.js";
import ensureSuperAdmin from "./config/superAdmin.js";
import authRoutes from "./routes/auth.js";
import reportRoutes from "./routes/reports.js";
import { checkAndRunMidnightCleanup, performMidnightImageCleanup } from "./services/dailyReports.js";
import { millisecondsUntilNextBusinessDay } from "./utils/businessDate.js";

const app = express();
const port = Number(process.env.PORT) || 5000;
const allowedOrigins = [
  ...(process.env.CLIENT_URL || "http://localhost:5173").split(",").map((origin) => origin.trim()),
  "https://sarco-trip.vercel.app",
];

const scheduleDailyReportMaintenance = () => {
  const timer = setTimeout(() => {
    scheduleDailyReportMaintenance();
    performMidnightImageCleanup().catch((error) => {
      console.error("Daily midnight image cleanup failed:", error.message);
    });
  }, millisecondsUntilNextBusinessDay());
  timer.unref();

  // Periodic heartbeat every 60 seconds to guarantee instant midnight cleanup as soon as the day changes in Pakistan
  const interval = setInterval(() => {
    checkAndRunMidnightCleanup().catch((error) => {
      console.error("Minute ticker midnight cleanup error:", error.message);
    });
  }, 60 * 1000);
  interval.unref();
};

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ success: true, data: { status: "ok" } });
});

app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 }));
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.use((error, _req, res, _next) => {
  if (error.code === 11000) {
    return res.status(409).json({ success: false, message: "An account with this email already exists." });
  }

  if (error.name === "ValidationError" || error.name === "CastError" || error.name === "MulterError") {
    return res.status(400).json({ success: false, message: error.message });
  }

  const status = error.status || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({
    success: false,
    message: status >= 500 ? "An unexpected server error occurred." : error.message,
  });
});

export { app };

const start = async () => {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required in server/.env.");
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required in server/.env.");

  await connectDatabase();
  await ensureSuperAdmin();
  scheduleDailyReportMaintenance();
  await checkAndRunMidnightCleanup();
  app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
};

if (!process.env.VERCEL) {
  start().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
