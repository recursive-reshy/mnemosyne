// Express
import { Router } from 'express'
// Controllers
import { createBackup } from '../controllers/backups.controller.js'

export const backupsRoutes: Router = Router()

backupsRoutes.post( '/backups', createBackup )
