import { v4 as uuid } from 'uuid'
import * as t from './types.d'
import Peer from 'simple-peer'
import EventEmitter from 'events'
import { Message } from './Message'
import * as bnc from '@browser-network/crypto'

const IS_NODE = typeof process !== 'undefined'

// A Node has many connections
// A connection has multiple negotiations, which can each be `pending`
// - true (there's no sdp on it)
// - false (there's sdp information on it)
// It can be either `initiated`
// - true (this connection started as our own offer negotiation)
// - false (this connection started in response to another node's open offer negotiation)

// A connection is either
// - pending (waiting for an offer negotiation to be generated)
// - open (offer negotiation is generated, waiting for answer from another new node)
// - connected (fully connected with another node)
type STATE = 'pending' | 'open' | 'connected'

type ConnectionProps = {
  networkId: t.NetworkId

  /**
  * @description the address of the network node that this connection belongs to.
  */
  selfAddress: t.Address

  /**
  * @description the address of the party on the other side of the line.
  */
  foreignAddress: t.Address

  /**
  * @description This is to be passed in when this connection is being created
  * not as an initiator. This is the negotiation that was received from a third
  * party. Its address field has the address of the other party.
  *
  */
  suppliedOfferNegotiation?: t.OfferNegotiation

  /**
  * @description If supplied, the SDP info will be encrypted with EC public key
  * encryption so that only the foreign address can read it. This is important
  * because the SDP info contains sensitive IP address related information and is
  * passed all around the network, and is publicly available on the
  * switchboard. This should always be supplied when possible, namely when the
  * network is in encrypted mode.
  */
  secret?: t.Secret
}

export class Connection extends EventEmitter {
  /**
  * A unique ID created when the connection originally created, used to identify
  * other node connections to facilitate more coordinated answer sending.
  */
  id: t.GUID

  /**
  * This is a SimplePeer instance. This is how we do WebRTC connections, so the peer
  * object is the actual p2p connection.
  */
  peer: Peer.Instance

  /**
  * @description The public key crypto address of the node on the other side of this
  * connection.
  */
  address: t.Address

  /**
  * @description Is this connection the one that initiated the connecting
  * between the two parties? This will be assigned at instantiation. It will be
  * passed to SimplePeer to instruct it whether to seek an initial SDP signal,
  * and it'll be used to help determine what state the Connection is in down
  * the line.
  *
  * If this connection is created without an offer supplied, it assumes it's
  * meant to be an open connection and generate its own offer, which will sit
  * open on the switchboard or in the memories of other nodes. In this case,
  * this connection will be the initiator. If an offer is given, it's a
  * response to some other node's open connection. `initiator` is where we
  * keep track of which it is.
  */
  initiator: boolean

  /**
  * @description The connection will always have an offer negotiation. If it was
  * supplied at instantiation, it'll be a t.OfferNegotiation guaranteed. In
  * that case, it will have come from the other party. Its address field will
  * be from the other party. If it was not supplied at instantiation, the
  * connection will be an initiator, and this offer will start off as a
  * t.PendingOfferNegotiation and await its `sdp` field. From there, the
  * Connection will emit a 'state-change' event and have its state as 'open',
  * from which point this offer can be sent to other parties
  * for them to answer.
  */
  offer: t.OfferNegotiation | t.PendingOfferNegotiation

  /**
  * @description This may or may not exist on a Connection. If there was not offer passed in at
  * instantiation, aka this connection is an initiator, there won't be an answer here until
  * somebody responds to one. If this connection is not the initiator, there will immediately
  * be populated an answer (as well as having the offer passed in), but the answer won't have
  * its `sdp` information and will be a t.PendingAnswerNegotiation until it emits the 'state-change'
  * event and becomes registered as 'open'.
  */
  answer?: t.AnswerNegotiation | t.PendingAnswerNegotiation

  private _secret: t.Secret

  /**
  * @description A Connection represents the linking between two network nodes.
  * Each node has many connections. A connection can be in one of three states:
  * pending, open, or connected. It can also be either an initiator or not. If
  * it's pending and an initiator, it'll have an offer connection that has no
  * `sdp` info yet. If it's pending and not an initiator, it'll have an offer,
  * and an answer, the answer having no sdp info yet. If it's the initiator and
  * it's open, it'll have an offer with sdp info waiting for someone to send
  * over an answer for it. If it's not the initiator and it's open, it'll have
  * an offer from a foreign party, a self generated answer, and be waiting for
  * that answer to be sent and the foreign party to signal it thus completing
  * the connection.
  */
  constructor(props: ConnectionProps) {
    super()

    const { networkId, selfAddress, foreignAddress, suppliedOfferNegotiation, secret } = props

    this.id = uuid()
    this.address = foreignAddress
    this._secret = secret

    // bringing in wrtc here costs us 2kb in the build size. 0.9kb in the minified version.
    this.peer = new Peer({
      initiator: !suppliedOfferNegotiation,
      trickle: false,
      wrtc: IS_NODE ? require('wrtc') : undefined
    })

    this.peer.on('signal', async (data: t.RTCSdp) => {
      if (data.type === 'offer') {
        this.offer.sdp = await this._conditionallyEncryptSdp(data.sdp)
        this.emit('state-change')
      } else if (data.type === 'answer') {
        this.answer.sdp = await this._conditionallyEncryptSdp(data.sdp)
        this.emit('state-change')
      }
    })

    this.peer.on('data', (data: Uint8Array) => {
      const str = data.toString()
      try {
        const message = JSON.parse(str) as Message
        this.emit('message', message)
      } catch (e) {
        this.emit('bad-message', str)
      }
    })

    if (!!suppliedOfferNegotiation) { // We're an answer response connection, not the initiator
      this.initiator = false

      this.offer = suppliedOfferNegotiation

      this.answer = {
        type: 'answer',
        address: selfAddress,
        connectionId: this.offer.connectionId,
        sdp: null,
        networkId: networkId,
        timestamp: Date.now()
      } as t.PendingAnswerNegotiation

      this._conditionallyDecryptSdp(suppliedOfferNegotiation.sdp).then(sdp => {
        const processed = { ...suppliedOfferNegotiation }
        processed.sdp = sdp
        this.peer.signal(processed)
      })


    } else { // We're fixing to be an open connection until another node answers us
      this.initiator = true
      this.offer = {
        type: 'offer',
        connectionId: this.id,
        sdp: null,
        address: selfAddress,
        networkId: networkId,
        timestamp: Date.now()
      }
    }

  }

  /**
  * @description A connection can be in one of three states: pending, open, or connected.
  * It can also be either an initiator or not. If it's pending and an initiator, it'll have an
  * offer connection that has no `sdp` info yet. If it's pending and not an initiator, it'll have
  * an offer, and an answer, the answer having no sdp info yet. If it's the initiator and it's open,
  * it'll have an offer with sdp info waiting for someone to send over an answer for it. If it's not
  * the initiator and it's open, it'll have an offer from a foreign party, a self generated answer,
  * and be waiting for that answer to be sent and the foreign party to signal it thus completing the connection.
  */
  get state(): STATE {
    if (this._isPending) return 'pending' // waiting for sdp info
    if (!this._isPending && !this.peer.connected) return 'open' // waiting for another node to answer our offer
    if (this.peer.connected) return 'connected' // finished with process and has node on other side
  }

  async _handleAnswerNegotiation(answer: t.AnswerNegotiation) {
    // Store our answer in encrypted form
    this.answer = answer

    // If we're in encrypted mode, unencrypt the sdp, otherwise just return it
    answer.sdp = await this._conditionallyDecryptSdp(answer.sdp)

    // Punch through that nat
    this.peer.signal(answer)
  }

  private get _isPending() {
    return (
      // we initiated and are still waiting for the stun server to return the sdp info for our open offer
      (this.initiator && this.offer.sdp === null) ||

      // we are a connection made in response to a foreign offer and are waiting for the reply sdp information
      // from the stun server
      (!this.initiator && this.answer.sdp === null)
    )
  }

  /**
  * @description If the network is running in encrypted mode, we're encrypting our SDP. So this
  * encrypts it if we're in encrypted mode.
  */
  private async _conditionallyEncryptSdp(sdp: string): Promise<string> {
    if (!this._secret) return sdp

    return bnc.encrypt(sdp, this.address)
  }

  /**
  * @description Similar to above.
  */
  private async _conditionallyDecryptSdp(sdp: string): Promise<string> {
    if (!this._secret) return sdp

    return bnc.decrypt(sdp, this._secret)
  }

}

/**
* @description A helper mainly for creating multiple connections simultaneously and waiting for them
* to move out of their pending state in convenient promise form
*
* TODO Can we just have a method on connection itself called untilReady() that resolves a promise when
* it's in a ready state?
*/
export abstract class ConnectionFactory {
  public static async new(props: ConnectionProps): Promise<Connection> {
    const connection = new Connection(props)

    return new Promise(resolve => {
      connection.on('state-change', () => resolve(connection))
    })
  }
}
