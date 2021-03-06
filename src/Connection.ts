import { PendingNegotiation, Negotiation } from './types.d'
import * as t from './types.d'
import Peer from 'simple-peer'
import TypedEventEmitter from './TypedEventEmitter'
import { debugFactory } from './util'
const debug = debugFactory('Connection')

const IS_NODE = typeof process !== 'undefined'

type Events = {
  'sdp': void
}

export class Connection extends TypedEventEmitter<Events> {
  // A unique ID created when the connection originally created, used to identify
  // other node connections to facilitate more coordinated answer sending.
  id: t.GUID

  // With whom is this connection established? If there is no address on the connection,
  // that means it's an "open connection", one the node is keeping around and broadcasting
  // connection information from in RTC "offer" form.
  address?: t.Address

  // This is a SimplePeer instance. This is how we do WebRTC connections, so the peer
  // object is the actual p2p connection.
  peer: Peer.Instance

  // This is the most recent negotiation the connection has received. If this is an "offer"
  // negotiation by us (with our address), it means this is our open connection. If it's an
  // "answer" by us, it means we've responded to someone else's offer. If it's an answer
  // from someone else, they've responded to our open offer.
  negotiation: PendingNegotiation | Negotiation

  constructor(id: t.GUID, initiator: boolean, negotiation: PendingNegotiation) {
    super()

    // bringing in wrtc here costs us 2kb in the build size. 0.9kb in the minified version.
    const peer = new Peer({ initiator, trickle: false, wrtc: IS_NODE ? require('wrtc') : undefined })

    Object.assign(this, { id, peer, negotiation })

    peer.on('signal', data => {
      if (['offer', 'answer'].includes(data.type)) {
        this.negotiation.sdp = data.sdp
        this.emit('sdp')
      }
    })
  }

  registerAddress(address: t.Address) {
    this.address = address
  }

  // Safely signal a peer
  signal(negotiation: Negotiation) {
    debug(5, 'signaling peer:', this.peer, negotiation)
    try {
      this.peer.signal(negotiation)
    } catch (e) {
      debug(3, 'error signaling peer:', e)
    }
  }

}
