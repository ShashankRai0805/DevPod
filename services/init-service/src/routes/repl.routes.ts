import { Router } from 'express'
import { createRepl } from '../controllers/repl.controller'

const router = Router()

router.post('/', createRepl)

export default router
