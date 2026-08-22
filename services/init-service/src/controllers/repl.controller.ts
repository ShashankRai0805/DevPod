import { Request, Response } from 'express'
import { validateLanguage, validateName } from '../validators/repl.validator'
import { listTemplateObjects, projectExists, copyTemplateToProject } from '../services/s3.service'

export async function createRepl(req: Request, res: Response) {
  try {
    const { name, language } = req.body || {}
    if (!validateName(name)) return res.status(400).json({ success: false, message: 'Invalid Repl name' })
    if (!validateLanguage(language)) return res.status(400).json({ success: false, message: 'Invalid language' })

    // check duplicate
    const exists = await projectExists(name)
    if (exists) return res.status(409).json({ success: false, message: 'Repl name already exists' })

    // check template exists
    const templates = await listTemplateObjects(language)
    if (!templates.length) return res.status(404).json({ success: false, message: 'Template not found' })

    // copy
    const result = await copyTemplateToProject(language, name)

    return res.status(201).json({
      success: true,
      message: 'Repl created successfully',
      repl: { replId: name, name, language, path: `users/${name}/`, copied: result.copied }
    })
  } catch (err: any) {
    console.error('createRepl error', err)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
}
