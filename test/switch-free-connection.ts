import { Network } from '../src'
import crypto from 'crypto'
import tap from 'tap'
import { ensureEventually } from './util'

export default tap.test(`A and B join, A stops switchboard, C joins, and is eventually connected with A anyways`, async t => {
  const timeLimit = 3 * 60 * 1000

  const networkId = crypto.randomUUID()
  const switchAddress = 'http://localhost:5678'

  const networkA = new Network({
    clientId: 'A',
    switchAddress, networkId,
    config: { respectSwitchboardVolunteerMessages: false }
  })

  const networkB = new Network({
    clientId: 'B',
    switchAddress, networkId,
    config: { respectSwitchboardVolunteerMessages: false }
  })

  await ensureEventually(timeLimit, () => {
    return networkA.connections().length === 2 &&
      networkB.connections().length === 2
  }).then(() => {
    t.pass('A connected to B successfully')
  }).catch(() => {
    t.fail('A did not connect to B')
    t.end()
  })

  networkA.switchboardRequester.stop()

  const networkC = new Network({
    clientId: 'C',
    switchAddress, networkId,
    config: { respectSwitchboardVolunteerMessages: false }
  })

  let receivedFromA = false
  networkC.on('message', ({message}) => {
    if (message.clientId === networkA.clientId) {
      receivedFromA = true
    }
  })

  networkC.on('add-connection', (con) => {
    console.log('C added connection:', con.id)
  })

  await ensureEventually(timeLimit, () => {
    return receivedFromA
  }).then(() => {
    t.pass('C connected to A')
  }).catch(() => {
    t.fail('C received no messages from A')
  }).finally(() => {
    t.end()
  })
})
