import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';

// Rely on default credential provider chain (IAM role / IRSA)
const s3 = new S3Client({});
const bucketName = process.env.S3_BUCKET_NAME || 'shashank-replit-projects'; // or from env
const replId = process.env.REPL_ID;

if (!replId) {
  console.warn('WARNING: REPL_ID environment variable is not set!');
}

export async function uploadToS3(localPath: string, relativePath: string) {
  if (!replId) {
    console.warn('Skipping S3 upload because REPL_ID is missing');
    return;
  }
  const key = `users/${replId}/${relativePath}`;
  try {
    const fileContent = await fs.readFile(localPath);
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileContent
    }));
    console.log(`Successfully uploaded ${relativePath} to s3://${bucketName}/${key}`);
  } catch (err) {
    console.error(`Failed to upload ${relativePath} to S3:`, err);
  }
}
