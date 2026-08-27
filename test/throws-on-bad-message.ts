import tap from 'tap'
import { EventEmitter } from 'events'
import Network from '../src'
import * as bnc from '@browser-network/crypto'

type GenerateAddressInfo = () => { address: string } | { secret: string }

export async function run(generateAddressInfo: GenerateAddressInfo) {
  tap.test('Bad messages are rejected without forwarding', async t => {
    const addressInfo = generateAddressInfo()
    const network = Object.create(Network.prototype) as Network
    const emitter = new EventEmitter()
    const secure = 'secret' in addressInfo

    Object.assign(network, {
      address: secure ? bnc.derivePubKey(addressInfo.secret) : addressInfo.address,
      config: { maxMessageSize: 64 * 1024 },
      _secret: secure ? addressInfo.secret : undefined,
      _eventEmitter: emitter,
      _messageMemory: { hasSeen: () => false, add: () => undefined }
    })

    const badMessages: unknown[] = []
    emitter.on('bad-message', message => badMessages.push(message))

    await (network as any).handleMessage({
      id: 'unsigned-message',
      address: network.address,
      destination: '*',
      ttl: 0,
      appId: 'test',
      type: 'test',
      signatures: []
    })

    if (secure) {
      t.equal(badMessages.length, 1, 'rejects unsigned message in secure mode')
    } else {
      await (network as any).handleMessage({ id: 'malformed' })
      t.equal(badMessages.length, 1, 'rejects malformed message in insecure mode')
    }
  })
}
