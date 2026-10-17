// Shared
import { ListModelsResponse } from '@mnemosyne/shared'
// App
import { request } from './request'

export const listModels = async (): Promise< ListModelsResponse > => {
  return request( '/api/models', ListModelsResponse )
}
