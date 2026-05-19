function readR2Env() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.R2_BUCKET_NAME?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

async function getR2Client() {
  const env = readR2Env();
  if (!env) {
    throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME must be set");
  }
  const { S3Client } = await import("@aws-sdk/client-s3");
  return {
    client: new S3Client({
      region: "auto",
      endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey
      }
    }),
    bucketName: env.bucketName
  };
}

/**
 * Shared R2 S3-compatible upload for Node scripts (import-studio-prints, sync script).
 * @param {import("@aws-sdk/client-s3").PutObjectCommandInput} input
 */
export async function putCatalogObjectToR2(input) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { client, bucketName } = await getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: input.Key,
      Body: input.Body,
      ContentType: input.ContentType
    })
  );
}

/** @param {string} objectKey */
export async function getCatalogObjectFromR2(objectKey) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { client, bucketName } = await getR2Client();
  const key = String(objectKey ?? "").trim();
  if (!key) {
    throw new Error("object key required");
  }
  const res = await client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    })
  );
  const body = res.Body;
  if (!body) {
    throw new Error("empty R2 object body");
  }
  const bytes = await body.transformToByteArray();
  return {
    buffer: Buffer.from(bytes),
    contentType: typeof res.ContentType === "string" ? res.ContentType : "application/octet-stream"
  };
}

export function isR2CatalogUploadConfigured() {
  return readR2Env() !== null;
}

/** @param {string} objectKey */
export async function headCatalogObjectInR2(objectKey) {
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const env = readR2Env();
  if (!env) {
    return false;
  }
  const key = String(objectKey ?? "").trim();
  if (!key) {
    return false;
  }
  const { S3Client } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey
    }
  });
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: env.bucketName,
        Key: key
      })
    );
    return true;
  } catch {
    return false;
  }
}

export async function deleteCatalogObjectFromR2(objectKey) {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  if (!isR2CatalogUploadConfigured()) {
    return;
  }
  const { client, bucketName } = await getR2Client();
  const key = String(objectKey ?? "").trim();
  if (!key) {
    return;
  }
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key
    })
  );
}
