import { S3Client, ListObjectsV2Command, CopyObjectCommand } from '@aws-sdk/client-s3'
import { AWS_REGION, S3_BUCKET_NAME } from '../config/env'

const s3 = new S3Client({ region: AWS_REGION || undefined })

export async function listTemplateObjects(language: string) {
  const prefix = `templates/${language}/`
  const cmd = new ListObjectsV2Command({ Bucket: S3_BUCKET_NAME, Prefix: prefix })
  const resp = await s3.send(cmd)
  return resp.Contents || []
}

export async function projectExists(name: string) {
  const prefix = `users/${name}/`
  const cmd = new ListObjectsV2Command({ Bucket: S3_BUCKET_NAME, Prefix: prefix, MaxKeys: 1 })
  const resp = await s3.send(cmd)
  return !!(resp.KeyCount && resp.KeyCount > 0)
}

export async function copyTemplateToProject(language: string, name: string) {
  const templatePrefix = `templates/${language}/`
  const objects = await listTemplateObjects(language)
  if (!objects.length) return { copied: 0 }

  let copied = 0
  for (const obj of objects) {
    if (!obj.Key) continue
    const relativeKey = obj.Key.substring(templatePrefix.length)
    const destKey = `users/${name}/${relativeKey}`
    const copySource = `${S3_BUCKET_NAME}/${encodeURIComponent(obj.Key)}`
    const cmd = new CopyObjectCommand({ Bucket: S3_BUCKET_NAME, CopySource: copySource, Key: destKey })
    await s3.send(cmd)
    copied++
  }

  return { copied }
}
