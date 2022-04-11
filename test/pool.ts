import { Network } from '../src'
import crypto from 'crypto'
import tap from 'tap'
import { ensureEventually } from './util'

const NUM_CONNECTIONS = 5
export default tap.test(`${NUM_CONNECTIONS} connections, looking for connections and messages`, async t => {
  const timeLimit = 1 * 60 * 1000

  const networks: Network[] = []

  const networkId = crypto.randomUUID()

  let numReceivedMessages = 0

  for (let i = 0; i < NUM_CONNECTIONS; i++) {
    const network = new Network({
      switchAddress: 'http://localhost:5678',
      networkId: networkId,
      clientId: crypto.randomUUID()
    })

    network.on('message', () => {
      numReceivedMessages++
    })

    networks.push(network)
  }

  const checkConnections = (networks: Network[]): boolean => {
    const network = networks[0]
    return network.connections().length >= NUM_CONNECTIONS
  }

  const checkMessages = (): boolean => {
    return numReceivedMessages > 0
  }

  await ensureEventually(timeLimit, () => {
    return checkConnections(networks) && checkMessages()
  }).then(() => {
    t.pass('Connections are made and messages are received!')
  }).catch(() => {
    t.fail('not enough connections or no messages')
  }).finally(() => {
    t.end()
  })
})

