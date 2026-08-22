export type ReplStatus = 'provisioning' | 'starting' | 'ready' | 'failed'

export interface ReplJobState {
  replId: string
  status: ReplStatus
  message?: string
  resourceNames?: {
    deployment: string
    service: string
    ingress: string
  }
  createdAt: string
  updatedAt: string
}
