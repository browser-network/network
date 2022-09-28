import Network from '../src'
import crypto from 'crypto'
import tap from 'tap'
import { ensureEventually } from './util'

tap.test(`A and B join, A stops switchboard, C joins, and is eventually connected with A anyways`, async t => {
  t.teardown(() => {
    process.exit(0)
  })

  const timeLimit = 3 * 60 * 1000

  const networkId = crypto.randomUUID()
  const switchAddress = 'http://localhost:5678'

  const networkA = new Network({
    switchAddress, networkId,
    config: { respectSwitchboardVolunteerMessages: false },
    secret: '7e842370a488733a1f226e9686f37d8817f8960c2edfc21eddda51f6a9d7c4c4'
  })

  const networkB = new Network({
    switchAddress, networkId,
    config: { respectSwitchboardVolunteerMessages: false },
    secret: 'fb57874f4292fd138aa7cffa6f9a78bcf60518889da9f47485ad24d3c795c299'
  })

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

  const networkC = new Network({
    switchAddress, networkId,
    config: { respectSwitchboardVolunteerMessages: false },
    secret: '66110122f5153a527c27431eb14c27c3dd0061effd8b21eefec0e23a86518365'
  })

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
