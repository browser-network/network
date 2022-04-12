import tap from 'tap'
import { Networks } from './util'

tap.test(`Bad messages`, async t => {

  t.teardown(() => {
    process.exit(0)
  })

  const networks = new Networks(5)

  try {
    await networks.untilReady()
  } catch (e) {
    console.log('catch block networks.untilReady failed', e)
    t.end()
    return
  }

  networks.nodes[0].on('bad-message', () => {
    t.pass('Network identified a bad message')
    t.end()
  })

  networks.nodes[1].broadcast({
    id: 'malformed-signature-message',
    ttl: 6,
    appId: 'random_app',
    type: 'dont mattah',
    data: {},
    signatures: [{ signer: 'bogus', signature: '123454321'}]
  })

})

