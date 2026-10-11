import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  { url: { type: String, required: true }, publicId: { type: String, required: true } },
  { _id: false },
);

const reportSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, default: () => new Date().toISOString().slice(0, 10) },
    amo: { type: String, required: true, trim: true, maxlength: 150 },
    uc: { type: String, required: true, trim: true, maxlength: 50 },
    tcp: { type: String, trim: true, maxlength: 100, default: "" },
    supervisor: { type: String, required: true, trim: true, maxlength: 150 },
    vehicleNo: { type: String, required: true, trim: true, maxlength: 80 },
    remarks: { type: String, trim: true, maxlength: 2000, default: "" },
    trip1Image: { type: imageSchema, default: null },
    trip2Image: { type: imageSchema, default: null },
    trip3Image: { type: imageSchema, default: null },
    trip4Image: { type: imageSchema, default: null },
    trip5Image: { type: imageSchema, default: null },
  },
  { timestamps: true },
);

reportSchema.index({ owner: 1, vehicleNo: 1 }, { unique: true });

const Report = mongoose.model("Report", reportSchema);

export default Report;
