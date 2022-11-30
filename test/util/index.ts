import Network from '../../src'
import { randomUUID } from 'crypto'

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

// This is like setting a timeout, but in promise form.
// Because the test runner will not respect an extent timeout, even
// if pass has not been called yet.
// Use it like ensure that when the time limit is reached, the function returns true.
export const ensureWhen = async (timeLimit: number, fn: () => boolean): Promise<void> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const result = fn()
      if (result) {
        resolve()
      } else {
        reject()
      }
    }, timeLimit)
  })
}

type GenerateAddressInfo = () => { address: string } | { secret: string }
type PartialNetworkProps = Partial<ConstructorParameters<typeof Network>[0]>

// Housing of a network that all the tests can use. Because each test starting up its
// own network takes an unnecessarily long time to accomplish.
//
// import networks from 'util'
// await networks.untilReady()
export class Networks {
  nodes: Network[] = []
  startTime: number
  maxStartupTime: number = 2 * 60 * 1000
  numNodes: number

  constructor(numNodes: number = 5, generateAddressInfo: GenerateAddressInfo, opts: PartialNetworkProps = {}) {
    this.startTime = Date.now()
    this.numNodes = numNodes

    const commonConfig = Object.assign({
      networkId: randomUUID(),
      switchAddress: 'http://localhost:5678',
      config: {
        fastSwitchboardRequestInterval: 3000,
        slowSwitchboardRequestInterval: 3000
      }
    }, opts)

    for (let i = 0; i < this.numNodes; i++) {
      const network = new Network({
        ...commonConfig,
        ...generateAddressInfo()
      })

      this.nodes.push(network)
    }
  }

  // Has every node seen messages from every other node?
  isReady(): boolean {
    return this.nodes.every(node => {
      return node.activeConnections.length === this.numNodes - 1
    })
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
