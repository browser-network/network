import Network from '../../src'
import { randomUUID } from 'crypto'
import { generateSecret } from '@browser-network/crypto'
import * as t from '../../src/types'

// Give this an async function that returns true or false and a time limit.
// If your fn doesn't return true by the time timeLimit ellapses, reject.
// If it returns true before timeLimit ellapses, resolve.
export const ensureEventually = async (timeLimit: number, fn: () => boolean): Promise<void> => {
  return new Promise<void>((resolve, reject) => {

    const start = Date.now()

    const interval = setInterval(() => {
      if (fn() === true) {
        clearInterval(interval)
        return resolve()
      }

      if (Date.now() - start >= timeLimit) {
        // We've surpassed our wait time
        clearInterval(interval)
        return reject()
      }

    }, 1000)
  })

}

// Housing of a network that all the tests can use. Because each test starting up its
// own network takes an unnecessarily long time to accomplish.
//
// import networks from 'util'
// await networks.untilReady()
export class Networks {
  nodes: Network[] = []
  startTime: number
  maxStartupTime: number
  numConnections: number
  seenNetworkAddies: { [networkAddress: t.Address]: { [foreignAddress: t.Address]: true }} = {} // has that network seen messages yet

  constructor(numConnections: number = 5, maxStartupTime: number = 2 * 60 * 1000) {
    this.startTime = Date.now()
    this.numConnections = numConnections
    this.maxStartupTime = maxStartupTime

    const commonConfig = {
      networkId: randomUUID(),
      switchAddress: 'http://localhost:5678',
      config: { respectSwitchboardVolunteerMessages: false }
    }

    for (let i = 0; i < this.numConnections; i++) {
      const network = new Network({
        ...commonConfig,
        secret: generateSecret()
      })

      this.nodes.push(network)

      network.on('message', ({ message }) => {
        if (!this.seenNetworkAddies[network.address]) {
          this.seenNetworkAddies[network.address] = {}
        }

        this.seenNetworkAddies[network.address][message.address] = true
      })

    }
  }

  // Has every network seen messages from every other network?
  isReady(): boolean {
    // First we ensure there are as many addresses in our seen book
    // as we have nodes. That just means that node has heard at least
    // one message.
    if (Object.keys(this.seenNetworkAddies).length < this.numConnections) {
      return false
    }

    // For each key, that key should exist in the value of every other key.
    // That is to say, every node should have received messages from every
    // other node.
    for (const address in this.seenNetworkAddies) {
      const addresses = Object.keys(this.seenNetworkAddies[address])
      if (addresses.length < this.numConnections - 1) {
        return false
      }
    }

    return true
  }

  // usage: await networks.untilReady()
  untilReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (this.isReady()) {
          clearInterval(interval)
          resolve()
        }

        if (Date.now() - this.startTime > this.maxStartupTime) {
          clearInterval(interval)
          reject(`Networks took longer than ${this.maxStartupTime / 1000} seconds to stand up`)
        }
      }, 1000)
    })
  }


}
