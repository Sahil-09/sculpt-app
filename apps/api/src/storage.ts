import { S3Client, HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand } from "@aws-sdk/client-s3";

const ENDPOINT = process.env.S3_ENDPOINT ?? "http://localhost:9000";
const BUCKET = process.env.S3_BUCKET ?? "sculpt-media";

export const mediaBucket = BUCKET;

let client: S3Client | null = null;

export function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "us-east-1",
      endpoint: ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "admin",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "password123"
      }
    });
  }
  return client;
}

export function publicUrl(key: string): string {
  return `${ENDPOINT.replace(/\/$/, "")}/${BUCKET}/${key}`;
}

/** Best-effort bucket setup (public read for progress photos). Never throws. */
export async function ensureBucket(): Promise<boolean> {
  try {
    const c = s3();
    try {
      await c.send(new HeadBucketCommand({ Bucket: BUCKET }));
    } catch {
      await c.send(new CreateBucketCommand({ Bucket: BUCKET }));
    }
    await c.send(
      new PutBucketPolicyCommand({
        Bucket: BUCKET,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: ["*"] },
              Action: ["s3:GetObject"],
              Resource: [`arn:aws:s3:::${BUCKET}/*`]
            }
          ]
        })
      })
    );
    return true;
  } catch (e) {
    console.warn("media bucket unavailable", e);
    return false;
  }
}
