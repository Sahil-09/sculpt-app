import mongoose from "mongoose";

const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/sculpt";
await mongoose.connect(uri);
const db = mongoose.connection.db;
if (!db) throw new Error("no db");
for (const c of ["routines", "routinefolders", "users", "workouts"]) {
  try {
    await db.collection(c).drop();
    console.log("dropped", c);
  } catch {
    console.log("missing", c);
  }
}
await mongoose.disconnect();
