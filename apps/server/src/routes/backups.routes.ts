// Express
import { Router } from 'express'
// Middleware
import { requireAdmin } from '../middleware/auth.js'
// Controllers
import { createBackup } from '../controllers/backups.controller.js'

export const backupsRoutes: Router = Router()

backupsRoutes.post( '/backups', requireAdmin, createBackup )
