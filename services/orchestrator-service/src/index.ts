import cors from 'cors'
import express from 'express'
import { z } from 'zod'
import { FRONTEND_URL, ORCHESTRATOR_PORT } from './config/env'
import { getProvisioningStatus, startProvisioning } from './services/k8s.service'

const app = express()
const paramsSchema = z.object({ replId: z.string().min(1) })

app.use(express.json())
app.use(cors({ origin: FRONTEND_URL }))

app.get('/healthz', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/repls/:replId/start', async (req, res) => {
  const parsed = paramsSchema.safeParse(req.params)
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid repl id' })
  }

  const state = await startProvisioning(parsed.data.replId)
  return res.status(202).json({ success: true, status: state.status, replId: parsed.data.replId })
})

app.get('/api/repls/:replId/status', async (req, res) => {
  const parsed = paramsSchema.safeParse(req.params)
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid repl id' })
  }

  const state = await getProvisioningStatus(parsed.data.replId)
  return res.status(200).json({ success: true, ...state })
})

app.listen(ORCHESTRATOR_PORT, () => {
  console.log(`Orchestrator Service listening on http://localhost:${ORCHESTRATOR_PORT}`)
})

export default app
