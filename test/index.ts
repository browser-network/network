import { Network } from '../src'
import crypto from 'crypto'
import test from 'tape'

const INITIALIZATION_WAIT_TIME = 30 * 1000
const NUM_CONNECTIONS = 5

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

const clean = (networks: Network[]) => {
  networks.forEach(n => {
    n.connections().forEach(c => {
      c.peer.removeAllListeners()
      c.peer.end()
      c.peer.destroy()
    })
  })

  process.exit()
}

process.on('SIGINT', (...args) => {
  console.log('SIGINT:', ...args)
  clean(networks)
})

const checkConnections = (networks: Network[]): boolean => {
  const network = networks[0]
  return network.connections().length >= NUM_CONNECTIONS
}

const checkMessages = (): boolean => {
  return numReceivedMessages > 0
}

const numIterations = INITIALIZATION_WAIT_TIME / 1000
let i = 0
const values: { [test: string]: boolean } = {}
test('the thing', t => {
  const interval = setInterval(() => {
    values.checkConnections = checkConnections(networks)
    values.checkMessages = checkMessages()

    console.log('checked, values:', values, networks[0].connections().map(c => [c.clientId, c.peer.connected]))

    if (Object.values(values).every(v => v)) {
      clearInterval(interval)
      t.pass()
      t.end()
      clean(networks)
    }

    if (i >= numIterations) {
      // We've surpassed our wait time
      clearInterval(interval)
      t.fail('not all values are true')
      clean(networks)
    }

    i++
  }, 1000)
})
