import tap from 'tap'
import Network, { InsecureNetworkProps, NetworkProps, SecureNetworkProps } from '../src'
import { Networks, ensureEventually } from './util'

type GenerateAddressInfo = () => { address: string } | { secret: string }

export async function run(generateAddressInfo: GenerateAddressInfo) {
  tap.test(`The network can handle tearing down and coming back up with the same address`, async t => {
    t.teardown(() => {
      process.exit(0)
    })

    const networks = new Networks(3, generateAddressInfo)

    await networks.untilReady()

    // This is the guy we're gonna fuck with
    const network = networks.nodes[0]
    // @ts-expect-error
    const secret = network._secret
    const address = network.address
    const networkId = network.networkId
    const switchAddress =  'http://localhost:5678'
    const config = network.config

    // Straight up drop it all. No more existing, sorry bud.
    network.teardown()

    const newOpts: Partial<NetworkProps> = { networkId, switchAddress, config }

    if (secret) {
      (newOpts as SecureNetworkProps).secret = secret
    } else {
      (newOpts as InsecureNetworkProps).address = address
    }

    const newNetwork = new Network(newOpts as NetworkProps)

    const timeLimit = 3 * 60 * 1000

    await ensureEventually(timeLimit, () => {
      // Ensure the netty connects with both other still existing networks
      return newNetwork.activeConnections.length === 2
    })

  })
}

