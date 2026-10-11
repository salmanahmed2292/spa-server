import dns from "node:dns";
import mongoose from "mongoose";

const dnsServers = process.env.MONGODB_DNS_SERVERS?.split(",")
  .map((server) => server.trim())
  .filter(Boolean);
if (dnsServers?.length) dns.setServers(dnsServers);

let cachedConnection = null;

const connectDatabase = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (mongoose.connection.readyState === 2 && cachedConnection) {
    return cachedConnection;
  }

  cachedConnection = mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 10,
  });

  try {
    await cachedConnection;
    console.log("Connected to MongoDB.");
    return mongoose.connection;
  } catch (error) {
    cachedConnection = null;
    throw error;
  }
};

export default connectDatabase;
