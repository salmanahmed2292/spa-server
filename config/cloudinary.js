import { v2 as cloudinary } from "cloudinary";

let isConfigured = false;

const getCloudinary = () => {
  if (!isConfigured) {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      const error = new Error("Cloudinary credentials are required for report image uploads.");
      error.status = 503;
      throw error;
    }

    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
    isConfigured = true;
  }

  return cloudinary;
};

export const uploadImage = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = getCloudinary().uploader.upload_stream(
      { folder: "spa-trip-reports/images/", resource_type: "image" },
      (error, result) => {
        if (error) return reject(error);
        return resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });

export const deleteImage = (publicId) => {
  if (!publicId) return Promise.resolve();
  return getCloudinary().uploader.destroy(publicId, { resource_type: "image" });
};

export const deleteAllTripImages = async () => {
  try {
    return await getCloudinary().api.delete_resources_by_prefix("spa-trip-reports/images/");
  } catch (error) {
    console.error("Cloudinary bulk folder delete failed:", error.message);
    return null;
  }
};

