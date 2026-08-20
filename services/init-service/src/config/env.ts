import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

export const PORT = process.env.INIT_SERVICE_PORT ? Number(process.env.INIT_SERVICE_PORT) : 4000
export const AWS_REGION = process.env.AWS_REGION || ''
export const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || ''
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
