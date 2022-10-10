import Network from '../src'
import { randomUUID } from 'crypto'
import tap from 'tap'
import { ensureEventually } from './util'

type GenerateAddressInfo = () => { address: string } | { secret: string }

export async function run(generateAddressInfo: GenerateAddressInfo) {
  tap.test(`A and B join, A stops switchboard, C joins, and is eventually connected with A anyways`, async t => {
    t.teardown(() => {
      process.exit(0)
    })

    const timeLimit = 3 * 60 * 1000

    const networkId = randomUUID()
    const switchAddress = 'http://localhost:5678'

    const networkA = new Network(Object.assign({
      switchAddress, networkId,
      config: { respectSwitchboardVolunteerMessages: false },
    }, generateAddressInfo()))

    const networkB = new Network(Object.assign({
      switchAddress, networkId,
      config: { respectSwitchboardVolunteerMessages: false },
    }, generateAddressInfo()))

    await ensureEventually(timeLimit, () => {
      return networkA.connections().length === 2 &&
        networkB.connections().length === 2
    }).then(() => {
      t.pass('A connected to B successfully')
    }).catch(() => {
      t.fail(`A did not connect to B after ${timeLimit / 1000} seconds`)
      t.end()
    })

    networkA.switchboardService.stop()

    const networkC = new Network(Object.assign({
      switchAddress, networkId,
      config: { respectSwitchboardVolunteerMessages: false },
    }, generateAddressInfo()))

    await ensureEventually(timeLimit, () => {
      return networkC.connections().some(con => {
        return con.address === networkA.address &&
          con.negotiation.type === 'answer' // so we know at least some exchange has happened.
      })
    }).then(() => {
      t.pass('C connected to A')
    }).catch(() => {
      t.fail(`C received no messages from A after ${timeLimit / 1000} seconds`)
    }).finally(() => {
      t.end()
    })
  })
}
