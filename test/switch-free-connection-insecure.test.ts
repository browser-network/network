import { randomUUID } from 'crypto'
import { run } from './switch-free-connection'

run(() => {
  return { address: randomUUID() }
})
