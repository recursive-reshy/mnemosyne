// App
import { app } from './app.js'
// Config
import { config } from './config.js'
// Worker
import { startWorker } from './worker/worker.js'

startWorker()

app.listen( config.port, () => {
  console.log( `Mnemosyne server listening on http://localhost:${ config.port }` )
} )
