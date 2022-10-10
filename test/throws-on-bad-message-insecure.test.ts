import { randomUUID } from 'crypto'
import { run } from './throws-on-bad-message'

run(() => {
  return { address: randomUUID() }
})

