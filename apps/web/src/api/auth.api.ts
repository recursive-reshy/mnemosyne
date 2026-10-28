// App
import { send } from './request'

export const signOut = async (): Promise< void > => {
  await send( '/api/auth/signout', { method: 'POST' } )
}
