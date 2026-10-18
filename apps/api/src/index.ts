import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import { connectDb } from "./db.js";
import { apiRouter } from "./routes.js";
import { ensureBucket } from "./storage.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/v1", apiRouter);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("unhandled route error", err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = Number(process.env.PORT ?? "4000");

connectDb()
  .then(async () => {
    await ensureBucket();
    app.listen(PORT, () => console.log(`api listening on :${PORT} (mongodb)`));
  })
  .catch((e) => {
    console.error("mongo connect failed", e);
    process.exit(1);
  });
