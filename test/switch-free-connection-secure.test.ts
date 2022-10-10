import { generateSecret } from '@browser-network/crypto'
import { run } from './switch-free-connection'

run(() => {
  return { secret: generateSecret() }
})
