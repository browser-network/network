import { Negotiation } from './types.d'

// This is what's returned from network.connections().
export type Connection = {

  // A unique ID created when the connection originally created, used to identify
  // other node connections to facilitate more coordinated answer sending.
  id: t.GUID

  // With whom is this connection established? If there is no clientId on the connection,
  // that means it's an "open connection", one the node is keeping around and broadcasting
  // connection information from in RTC "offer" form.
  clientId?: t.ClientId

  // This is a SimplePeer instance. This is how we do WebRTC connections, so the peer
  // object is the actual p2p connection.
  peer: Peer.Instance

  // This is the most recent negotiation the connection has received. If this is an "offer"
  // negotiation by us (with our clientId), it means this is our open connection. If it's an
  // "answer" by us, it means we've responded to someone else's offer. If it's an answer
  // from someone else, they've responded to our open offer.
  negotiation: Negotiation
}


