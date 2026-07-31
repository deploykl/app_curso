import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export function presignPut(key: string, contentType: string, expiresIn = 300) {
  return getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

export function presignGet(key: string, expiresIn = 300) {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), { expiresIn });
}

export async function deleteObject(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}
