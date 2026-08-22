import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

function bucketName() {
  return process.env.S3_BUCKET_NAME || process.env.S3_BUCKET || ''
}

function s3Uri(key: string) {
  const normalizedKey = key.replace(/^\/+/, '').replace(/\/+$/, '')
  return `s3://${bucketName()}/${normalizedKey}`
}

async function runAwsCommand(args: string[]) {
  if (!bucketName()) {
    throw new Error('Missing S3 bucket name')
  }

  await execFileAsync('aws', args, {
    env: process.env,
  })
}

export async function fetchS3Folder(key: string, localPath: string): Promise<void> {
  await runAwsCommand(['s3', 'sync', s3Uri(key), localPath])
}

export async function copyS3Folder(sourcePrefix: string, destinationPrefix: string): Promise<void> {
  await runAwsCommand(['s3', 'cp', s3Uri(sourcePrefix), s3Uri(destinationPrefix), '--recursive'])
}

export async function saveToS3(key: string, filePath: string, content: string): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orchestrator-s3-'))
  const tempFile = path.join(tempDir, path.basename(filePath) || 'content.txt')

  await fs.writeFile(tempFile, content, 'utf8')
  await runAwsCommand(['s3', 'cp', tempFile, s3Uri(`${key}/${filePath}`)])
  await fs.rm(tempDir, { recursive: true, force: true })
}
