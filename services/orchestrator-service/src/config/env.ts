import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

export const ORCHESTRATOR_PORT = Number(process.env.ORCHESTRATOR_PORT || 4100)
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
export const K8S_NAMESPACE = process.env.K8S_NAMESPACE || 'replit'
export const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || ''
export const AWS_REGION = process.env.AWS_REGION || ''
export const REPL_BASE_DOMAIN = process.env.REPL_BASE_DOMAIN || 'example.com'
