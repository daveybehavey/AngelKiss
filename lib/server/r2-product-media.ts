import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

function readR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.R2_BUCKET_NAME?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

export function isR2ProductMediaUploadConfigured(): boolean {
  return readR2Config() !== null;
}

let cachedClient: S3Client | null = null;
let cachedForAccount: string | null = null;

function getS3Client(): S3Client {
  const c = readR2Config();
  if (!c) {
    throw new Error("R2 env vars are not fully configured");
  }
  if (!cachedClient || cachedForAccount !== c.accountId) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: c.accessKeyId,
        secretAccessKey: c.secretAccessKey
      }
    });
    cachedForAccount = c.accountId;
  }
  return cachedClient;
}

export async function createR2PresignedPutForCatalogObject(options: {
  objectKey: string;
  contentType: string;
  expiresSeconds?: number;
}): Promise<string> {
  const c = readR2Config();
  if (!c) {
    throw new Error("R2 not configured");
  }
  const cmd = new PutObjectCommand({
    Bucket: c.bucketName,
    Key: options.objectKey,
    ContentType: options.contentType
  });
  const client = getS3Client();
  // Presigner typings can disagree with `S3Client` when npm dedupes Smithy packages differently; runtime is valid for R2.
  return getSignedUrl(client as any, cmd, {
    expiresIn: options.expiresSeconds ?? 3600
  });
}

/** Best-effort delete when an admin removes a catalog image (mirrors Supabase remove). */
export async function deleteR2CatalogObjectIfConfigured(objectKey: string): Promise<void> {
  const c = readR2Config();
  if (!c) {
    return;
  }
  const key = objectKey.trim().replace(/^\/+/, "");
  if (!key) {
    return;
  }
  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: c.bucketName,
        Key: key
      })
    );
  } catch {
    /* non-fatal — DB row is already gone */
  }
}
