import { generateSecret } from '@browser-network/crypto'
import { run } from './teardown'

run(() => {
  return { secret: generateSecret() }
})

