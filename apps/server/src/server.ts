// App
import { app } from './app.js'

const port = 3000

app.listen( port, () => {
  console.log( `Mnemosyne server listening on http://localhost:${ port }` )
} )
