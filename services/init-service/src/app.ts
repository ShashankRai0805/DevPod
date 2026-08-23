import express from 'express'
import cors from 'cors'
import { FRONTEND_URL } from './config/env'
import replRoutes from './routes/repl.routes'

const app = express()

app.use(express.json())
app.use(cors({ origin: FRONTEND_URL }))

app.use('/api/repls', replRoutes)

app.get('/', (req, res) => res.json({ ok: true }))
app.get('/health', (req, res) => res.json({ status: 'ok' }))

export default app
