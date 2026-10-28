// Express
import { Router } from 'express'
// Controllers
import { createTestSession } from '../controllers/testSession.controller.js'

// Mounted by app.ts only when E2E_TEST_SIGNIN is set (TRD §11.4)
export const testSessionRoutes: Router = Router()

testSessionRoutes.post( '/test/session', createTestSession )
