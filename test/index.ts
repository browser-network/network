import { Network } from '../src'
import crypto from 'crypto'

const INITIALIZATION_WAIT_TIME = 1 * 1000
const NUM_CONNECTIONS = 5

const networks: Network[] = []

for (let i = 0; i < NUM_CONNECTIONS; i++) {
  networks.push(new Network({
    switchAddress: 'http://localhost:5678',
    networkId: 'test-network',
    clientId: crypto.randomUUID()
  }))
}

// Logging more than one is just too much
networks[0].on('message', ({ appId, message }) => {
  console.log(appId, message)
})

networks[0].on('add-connection', (con) => {
  console.log('added connection:', con.clientId)
})

networks[0].on('switchboard-response', (book) => {
  console.log('switchboard-response book.length:', book.length)
})

// TODO This doesn't work either, as in, a browser window does
// not hear the close event
process.on('SIGINT', (...args) => {
  networks.forEach(n => {
    n.connections().forEach(c => {
      c.peer.removeAllListeners()
      c.peer.end()
      c.peer.destroy()
    })
  })

  console.log('SIGINT:', ...args)

  process.exit()
})

const checkConnections = (networks: Network[]): boolean => {
  const network = networks[0]
  return network.connections().length >= NUM_CONNECTIONS
}

// TODO this does not work
const numIterations = INITIALIZATION_WAIT_TIME / 1000
let i = 0
const values: { [test: string]: boolean } = {}
const interval = setInterval(() => {
  values.checkConnections = checkConnections(networks)

  if (Object.values(values).every(b => b)) {
    console.log('passed!')
    clearInterval(interval)
  }

  if (i >= numIterations) {
    // We've surpassed our wait time
    clearInterval(interval)

    if (Object.values(values).some(b => !b)) {
      console.log('failed')
    }
  }

}, INITIALIZATION_WAIT_TIME)
