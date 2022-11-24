import tap from 'tap'
import { Networks, ensureEventually } from './util'

type GenerateAddressInfo = () => { address: string } | { secret: string }

export async function run(generateAddressInfo: GenerateAddressInfo) {
  tap.test(`The network is able to connect via messages and not the switchboard`, async t => {
    t.teardown(() => {
      process.exit(0)
    })

    const networks = new Networks(3, generateAddressInfo)

    // networks.nodes[0].on('connection-error', console.log)
    // networks.nodes[0].on('connection-process', console.log.bind(console, 'A'))

    await networks.untilReady()

    // This is the guy we're gonna fuck with
    const network = networks.nodes[0]

    // Disconnect from switchboard and nuke three out of its 5 connections
    network.stopSwitchboardRequests()
    const severedConnectionAddress = network.activeConnections[0].address
    network.activeConnections[0].peer.destroy()

    const timeLimit = 3 * 60 * 1000

    await ensureEventually(timeLimit, () => {
      return network.activeConnections.some(con => con.address === severedConnectionAddress)
    })

  })
}
