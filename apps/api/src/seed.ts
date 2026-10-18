import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { ExerciseTemplateModel } from "./models.js";
import { connectDb } from "./db.js";
import { ensureBucket, mediaBucket, s3 } from "./storage.js";
import { EXERCISE_DATASET } from "@sculpt/shared";

const DATASET_DIR = process.env.EXERCISE_DATASET_DIR ?? "E:\\dev\\Forks\\exercise-dataset";
const SKIP_MEDIA = process.argv.includes("--skip-media");
const UPLOAD_VIDEOS = !process.argv.includes("--thumbnails-only");

async function uploadFolder(kind: "images" | "videos", contentType: string): Promise<number> {
  const folder = join(DATASET_DIR, kind);
  let files: string[];
  try {
    files = (await readdir(folder)).filter((f) => /\.(jpg|gif)$/i.test(f));
  } catch {
    console.warn(`Dataset media folder not found at ${folder}; skipping ${kind} upload.`);
    return 0;
  }
  const client = s3();
  const concurrency = 32;
  let uploaded = 0;
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (file) => {
        const body = await readFile(join(folder, file));
        await client.send(
          new PutObjectCommand({
            Bucket: mediaBucket,
            Key: `exercises/${kind}/${file}`,
            Body: body,
            ContentType: contentType
          })
        );
        uploaded++;
      })
    );
  }
  return uploaded;
}

async function main() {
  await connectDb();

  // 1. Reseed ExerciseTemplate collection with all 1,324 records from EXERCISE_DATASET
  const deleted = await ExerciseTemplateModel.deleteMany({ isCustom: { $ne: true } });
  const docs = EXERCISE_DATASET.map((e) => ({
    datasetId: e.id,
    name: e.name,
    category: e.category ?? null,
    bodyPart: e.bodyPart ?? null,
    equipment: e.equipment ?? null,
    primaryMuscle: e.primaryMuscle,
    secondaryMuscles: [...(e.secondaryMuscles ?? [])],
    type: e.type,
    isCustom: false,
    ownerId: null,
    mediaId: e.mediaId ?? null,
    mediaUrl: e.mediaId ? `/v1/exercise-media/images/${e.id}-${e.mediaId}.jpg` : null,
    gifUrl: e.mediaId ? `/v1/exercise-media/videos/${e.id}-${e.mediaId}.gif` : null,
    instructions: e.instructions ?? undefined
  }));

  await ExerciseTemplateModel.insertMany(docs, { ordered: false });
  const total = await ExerciseTemplateModel.countDocuments({ isCustom: { $ne: true } });
  console.log(
    `Reseeded ExerciseTemplate collection: removed ${deleted.deletedCount} old rows, inserted ${total}/${EXERCISE_DATASET.length} dataset entries.`
  );

  // 2. Upload media to MinIO S3 bucket
  if (!SKIP_MEDIA) {
    const bucketReady = await ensureBucket();
    if (bucketReady) {
      const imgs = await uploadFolder("images", "image/jpeg");
      console.log(`Uploaded ${imgs} thumbnail images to MinIO (${mediaBucket}/exercises/images/).`);
      if (UPLOAD_VIDEOS) {
        const vids = await uploadFolder("videos", "image/gif");
        console.log(`Uploaded ${vids} animation GIFs to MinIO (${mediaBucket}/exercises/videos/).`);
      }
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
