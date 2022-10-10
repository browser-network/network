import { generateSecret } from '@browser-network/crypto'
import { run } from './throws-on-bad-message'

run(() => {
  return { secret: generateSecret() }
})


