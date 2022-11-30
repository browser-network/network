import { generateSecret } from '@browser-network/crypto'
import { run } from './max-connections'

run(() => {
  return { secret: generateSecret() }
})

