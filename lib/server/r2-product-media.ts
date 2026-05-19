import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
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

/** @returns false when R2 is not configured or object is missing */
export async function headR2CatalogObjectIfConfigured(objectKey: string): Promise<boolean> {
  const c = readR2Config();
  if (!c) {
    return false;
  }
  const key = objectKey.trim().replace(/^\/+/, "");
  if (!key) {
    return false;
  }
  try {
    await getS3Client().send(
      new HeadObjectCommand({
        Bucket: c.bucketName,
        Key: key
      })
    );
    return true;
  } catch {
    return false;
  }
}

export async function getR2CatalogObjectBufferIfConfigured(
  objectKey: string
): Promise<Buffer | null> {
  const c = readR2Config();
  if (!c) {
    return null;
  }
  const key = objectKey.trim().replace(/^\/+/, "");
  if (!key) {
    return null;
  }
  try {
    const res = await getS3Client().send(
      new GetObjectCommand({
        Bucket: c.bucketName,
        Key: key
      })
    );
    const body = res.Body;
    if (!body) {
      return null;
    }
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

export async function putR2CatalogObjectBufferIfConfigured(
  objectKey: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const c = readR2Config();
  if (!c) {
    return;
  }
  const key = objectKey.trim().replace(/^\/+/, "");
  if (!key) {
    return;
  }
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: c.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );
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
