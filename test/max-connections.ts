import tap from 'tap'
import Network from '../src'
import { ensureWhen, Networks } from './util'

type GenerateAddressInfo = () => { address: string } | { secret: string }

export async function run(generateAddressInfo: GenerateAddressInfo) {
  tap.test(`The network respects the maxConnections field`, async t => {
    t.teardown(() => {
      process.exit(0)
    })

    const networks = new Networks(3, generateAddressInfo, {
      config: {
        maxConnections: 2,
        fastSwitchboardRequestInterval: 3000,
        slowSwitchboardRequestInterval: 3000
      }
    })

    await networks.untilReady()

    // Make another and hope it never connects
    const newNetwork = new Network({
      ...generateAddressInfo(),
      ...{
        networkId: networks.nodes[0].networkId,
        switchAddress: 'http://localhost:5678'
      }
    })

    // We can check the switchboard responses. Nobody should
    // be responding to this poor fella, they're all busy with
    // each other.
    newNetwork.on('switchboard-response', resp => {
      if (resp.negotiationItems.length) {
        console.log(networks.nodes.map(n => n.activeConnections.length))
        console.log(networks.nodes.map(n => n.config.maxConnections))
        t.fail('Network connected when it shouldnt have been able to')
        t.end()
        t.done()
      }
    })

    // We'll wait this long after the completion of the network forming.
    const timeLimit = 10 * 1000

    await ensureWhen(timeLimit, () => true)

    t.pass('Detected no switchboard responses! Our lonely network is as isolated as he should be.')
    t.end()
  })
}


