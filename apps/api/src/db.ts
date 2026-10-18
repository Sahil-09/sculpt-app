import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/sculpt";

let cached = false;

export async function connectDb(): Promise<void> {
  if (cached && mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGODB_URI);
  cached = true;
}
