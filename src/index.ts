import axios from 'axios'

// Tried using crypto.randomUUID() but browserify like 10x's the build
// size to do it.
import { v4 as uuid } from 'uuid'

import * as t from './types.d'
import * as Mes from './Message.d'
import { debugFactory, exhaustive, getIpFromRTCSDP } from './util'
import { Repeater } from './Repeater'
import TypedEventEmitter from './TypedEventEmitter'
import BehaviorCache from './BehaviorCache'
import { NetworkConfig } from './NetworkConfig.d'
import { Connection } from './Connection'

export type Message = Mes.Message

const debug = debugFactory('Network')

// Every app, even including this network, needs a unique id to identify
// messages coming over the network. The only constraint is that you
// don't want collisions b/t app ids.
const APP_ID = 'network'

// This is a global I want to hard code. It means how long will the app hold
// on to seen message ids. So if this was too short, potentially a message
// we've already seen could come back to us and we'd register it twice. This could
// mean two chat messages, two state updates, two of whatever an application is
// using messages for. I want to hard code it because I think it makes more sense
// as a part of the network itself. It seems really fundamental to the shape of the
// network, which is a concern of the network itself.
const MEMORY_DURATION = 1000 * 60

// This one as well seems fundamental to the shape of the network and I'm going to
// leave it as a constant for now.
const SWITCHBOARD_BACKOFF_DURATION = 1000 * 10

// Same
const SWITCHBOARD_REQUEST_ITERATIONS = 15

// Object you pass in when instantiating a network
type NetworkProps = {
  // Where does the switchboard live? We'll be sending regular POST
  // requests to it to initially get into the network and to onboard
  // new folk into the network once we're already in.
  switchAddress: t.SwitchAddress

  // Identify the network we're working with. All nodes who are on this
  // network are going to be receiving the same messages. So make the network
  // id unique. Somewhat interestingly, it's only the switchboard that has to
  // do with partitioning networks. It simply doesn't set up two nodes with
  // different networkIds, and the networks never cross.
  networkId: t.NetworkId

  // The id of this one specific node. Different for each machine.
  // It's convenient to store this in `localStorage` or another local persistent
  // storage situation.
  clientId: t.ClientId

  // If nothing's passed in, the defaults will be used.
  config?: Partial<NetworkConfig>
}

// Network extends an event emitter. This is a mapping from event
// to the type it'll return. For those humans out there, your handler
// call will look like:
//
// network.on('message', ({ appId, message }) => {
//   if (appId !== myAppId) return
//
//   if (message.type === 'my-type') {
//     ...
//   }
// })
type Events = {
  'switchboard-response': t.SwitchboardBook
  'add-connection': Connection
  'destroy-connection': Connection['id']
  'broadcast-message': Mes.Message
  'message': { appId: string, message: Mes.Message }
}

// TODO Use TypedEventEmitter only as a type and not as the actual code.
export class Network extends TypedEventEmitter<Events> {
  config: NetworkConfig
  clientId: t.ClientId
  networkId: t.NetworkId
  switchAddress: t.SwitchAddress
  switchboardRequester: Repeater
  rudeIps: { [address: t.IPAddress]: t.TimeStamp } = {}
  behaviorCache: BehaviorCache

  _connections: { [connectionId: t.GUID]: Connection } = {}
  _seenMessageIds: { [id: t.GUID]: t.TimeStamp } = {}

  _switchboardVolunteerDelayTimeout: ReturnType<typeof setInterval>
  _offerBroadcastInterval: ReturnType<typeof setInterval>
  _garbageCollectInterval: ReturnType<typeof setInterval>

  constructor({ switchAddress, networkId, clientId, config = {} }: NetworkProps) {
    super()

    this.config = Object.assign(config, {
      offerBroadcastInterval: 1000 * 5,
      switchboardRequestInterval: 1000 * 3,
      garbageCollectInterval: 1000 * 5,
      respectSwitchboardVolunteerMessages: true,
      maxMessageRateBeforeRude: 100,
      maxConnections: 10
    })

    this.switchAddress = switchAddress
    this.networkId = networkId
    this.clientId = clientId
    this.startOfferBroadcastInterval()
    this.startGarbageCollectionInterval()

    // TODO We have yet to add logic for *when* to
    // broadcast that we'll take on the requesting logic
    // for a while. Or even if it's a good idea to implement
    // this... it's just a DOS waiting to happen.
    this.switchboardRequester = new Repeater({
      func: this.doSwitchboardRequest.bind(this),
      delay: this.config.switchboardRequestInterval,
      numIterations: SWITCHBOARD_REQUEST_ITERATIONS,
      onComplete: this.beginSwitchboardRequestPeriod.bind(this)
    })

    this.beginSwitchboardRequestPeriod()

    // This is our "good behavior" determination. The max message rate is
    // how many messages will we tolerate within a one second period from
    // a specific IP address before we consider that machine to be a rude fella.
    this.behaviorCache = new BehaviorCache(this.config.maxMessageRateBeforeRude)
  }

  // The primary means of sending a message into the network for an application.
  // You can pass in a union of your different message types for added type safety.
  broadcast<M extends { type: string, data: any, appId: string }>(message: M & Partial<Mes.Message>) {
    // TODO require: data, appId, type

    // We forbid id and clientId from being passed in.
    message.id = uuid() as string
    message.clientId = this.clientId
    type MessageSoFar = typeof message & { id: string, clientId: string }

    // TODO validate shape here
    const toBroadcast: Mes.Message = Object.assign((message as MessageSoFar), {
      ttl: 6,
      destination: '*'
    })

    this.broadcastMessage(toBroadcast)
  }

  // List of all our current connections
  connections(): (Connection)[] {
    return Object.values(this._connections)
  }

  // Given an offer/answer, do we have this person on our rude list.
  // Makes it easy to tell whether we
  isRude(ip: t.IPAddress): boolean {
    return !!this.rudeIps[ip]
  }

  // Add an ip to a rude list, which means we won't connect to then any more.
  // If an optional clientId is provided, and we're connected to that clientId,
  // we'll drop them as well.
  addToRudeList(ip: t.IPAddress, clientId?: t.ClientId) {
    this.rudeIps[ip] = Date.now()

    debug(1, 'added to rude list:', ip, clientId)

    // We can check and make sure we're aren't / don't stay connected to this person
    if (clientId) {
      const connection = this.getConnectionByClientId(clientId)
      if (!connection) { return }
      this.broadcast({
        type: 'log',
        appId: APP_ID,
        data: 'rude',
        destination: clientId
      })
      this.destroyConnection(connection)
    }
  }

  // Safely start it
  private startOfferBroadcastInterval() {
    if (this._offerBroadcastInterval) { return }
    this._offerBroadcastInterval = setInterval(this.broadcastOffer.bind(this), this.config.offerBroadcastInterval)
  }

  // // Temporarily removed but kept for safe keeping
  // private stopOfferBroadcastInterval() {
  //   clearInterval(this._offerBroadcastInterval)
  //   delete this._offerBroadcastInterval
  // }

  // Safely start it
  private startGarbageCollectionInterval() {
    if (this._garbageCollectInterval) { return }
    this._garbageCollectInterval = setInterval(this.garbageCollect.bind(this), this.config.garbageCollectInterval)
  }

  // // Temporarily removed but kept for safe keeping
  // private stopGarbageCollectionInterval() {
  //   clearInterval(this._garbageCollectInterval)
  //   delete this._garbageCollectInterval
  // }

  private rebroadcast(message: Mes.Message) {
    if (!message.ttl) { return }
    message.ttl -= 1
    this.broadcastMessage(message)
  }

  // Send message to all our connections
  private broadcastMessage(message: Mes.Message) {
    // TODO validate message shape at runtime
    // TODO make helpers for this
    this._seenMessageIds[message.id] = Date.now()

    for (const connection of this.connections()) {
      // This means this is a pending connection, we don't want to send
      // anything over that.
      if (!connection.negotiation.sdp) return

      this.send(connection, message)
    }

    this.emit('broadcast-message', message)
  }

  // Start a single round of switchboard requests. One round is
  // SWITCHBOARD_REQUEST_ITERATIONS requests sent up separated in time by
  // SWITCHBOARD_REQUEST_INTERVAL. However the requester has an onComplete
  // which, ATTOW, is being used to make it switch indefinitely. Then,
  // when we hear a switchboard-volunteer message like the one we just sent out,
  // we back off for a little while.
  // TODO It's not a good scheme. Wide open for DoS.
  private beginSwitchboardRequestPeriod() {
    this.switchboardRequester.begin()
    this.broadcastMessage({
      id: uuid(),
      appId: APP_ID,
      type: 'switchboard-volunteer',
      destination: '*',
      ttl: 2,
      clientId: this.clientId,
      data: {}
    })
  }

  async doSwitchboardRequest() {
    debug(5, 'doSwitchboardRequest')

    const existingConnection = this.getOrGenerateOpenConnection()

    // We don't want to send switchboard requests for PendingConnections
    if (!existingConnection.negotiation.sdp) return

    // Send our offer to switch
    const resp = await this.sendNegotiationToSwitchingService({
      clientId: this.clientId,
      networkId: this.networkId,
      connectionId: existingConnection.id,
      ...(existingConnection.negotiation as t.Negotiation)
    })

    this.handleSwitchboardResponse(resp)
  }

  private async handleSwitchboardResponse(book: t.SwitchboardResponse) {
    debug(5, 'handleSwitchboardResponse, book:', book)

    if (!book) { return debug(1, 'got bad response from switchboard:', book) }

    for (const negotiation of book) {
      switch (negotiation.type) {
        case 'offer':
          const connection = this.handleOffer(negotiation)
          if (!connection) { continue }

          connection.on('sdp', () => {
            this.sendNegotiationToSwitchingService({
              connectionId: connection.id,
              timestamp: Date.now(),
              networkId: this.networkId,
              ...(connection.negotiation as t.AnswerNegotiation)
            })
          })

          break

        case 'answer':
          this.handleAnswer(negotiation)
          break

        default: exhaustive(negotiation, 'We got something from the switchboard that has a weird type'); break;;
      }
    }

    // How to type event emitter
    this.emit('switchboard-response', book)
  }

  // TODO Pull this off the proto
  private async sendNegotiationToSwitchingService(negotiation: t.Negotiation): Promise<t.SwitchboardResponse> {
    try {
      const res = await axios.post(this.switchAddress, negotiation)
      return res.data
    } catch (e) {
      debug(4, 'error w/ switch:', e)
    }
  }

  private handleMessage(message: Mes.Message) {
    // If we've already seen this message, we do nothing
    // with it.
    if (this._seenMessageIds[message.id]) { return }

    // Now we've seen this message.
    this._seenMessageIds[message.id] = Date.now()

    debug(5, 'handleMessage:', message)

    // We are only interested in our own application here.
    // The network is actually an application on the network, lolz.
    // Note we're using 'massage' here only so typescript knows
    // about the correct typing. Try getting exhaustiveness without
    // it.
    const massage = message as Mes.NetworkMessage
    if (message.appId === APP_ID) {
      switch (massage.type) {
        case 'offer': this.handleOfferMessage(massage); break;;
        case 'answer': this.handleAnswerMessage(massage); break;;
        case 'log': this.handleLogMessage(massage); break;;
        case 'switchboard-volunteer':
          this.handleSwitchboardVolunteerMessage(massage); break;;
        default: exhaustive(massage, 'Someone sent a message with our appId but of the wrong type!'); break;;
      }
    }

    this.rebroadcast(message)

    this.emit('message', { appId: message.appId, message })
  }

  private handleOfferMessage(message: Mes.OfferMessage) {
    const connection = this.handleOffer(message.data)
    if (!connection) { return }

    connection.on('sdp', () => {
      this.broadcastMessage({
        ...connection.negotiation as t.AnswerNegotiation,
        appId: APP_ID,
        id: uuid(),
        ttl: 6,
        clientId: this.clientId,
        destination: message.clientId,
        data: {
          connectionId: message.data.connectionId,
        }
      })
    })

  }

  private handleAnswerMessage(message: Mes.AnswerMessage) {
    this.handleAnswer(message.data)
  }

  private handleLogMessage(message: Mes.LogMessage) {
    // Only log messages sent to us
    if (!['*', this.clientId].includes(message.destination)) { return }

    console.log(message.clientId + ':', message.data.contents)
  }

  private handleSwitchboardVolunteerMessage(message: Mes.SwitchboardVolunteerMessage) {
    if (!this.config.respectSwitchboardVolunteerMessages) {
      debug(5, 'Switchboard Volunteer Message heard but feature is disabled. Heard from:', message.clientId)
      return
    }

    debug(3, 'heard switchboard volunteer, backing off switchboard requests:', message.clientId)
    this.switchboardRequester.stop()
    if (this._switchboardVolunteerDelayTimeout) { clearTimeout(this._switchboardVolunteerDelayTimeout) }
    this._switchboardVolunteerDelayTimeout = setTimeout(this.beginSwitchboardRequestPeriod.bind(this), SWITCHBOARD_BACKOFF_DURATION + Math.random() * 1000)
  }

  // handleAnswer assumes it's getting an answer for an open offer of ours.
  private handleAnswer(answer: t.AnswerNegotiation): void {
    const connection = this._connections[answer.connectionId]

    // We may have retired this connection; or
    // Somebody else may have already used it, or we don't
    // want to connect to this person.
    if (
      // The connection's already been retired
      !connection ||
      // Somebody else already got to this open connection
      connection.clientId ||
      // The ip trying to connect is on our naughty list or not presenting an sdp string
      !answer.sdp || this.isRude(getIpFromRTCSDP(answer.sdp)) ||
      // We've reached our max number of allowed connections
      this.connections().length >= this.config.maxConnections
    ) { return null }

    debug(3, 'handling answer:', answer)

    // Now we know who is at the other end of the open offer we'd previously created.
    connection.clientId = answer.clientId

    // Punch through that nat
    connection.signal(answer)
  }

  private handleOffer(offer: t.OfferNegotiation): Connection | null {
    // We're only concerned with offers from others
    // we're not already connected to, who are not on
    // our rude list, and if we aren't already maxed out.
    if (
      // It's ourselves
      offer.clientId === this.clientId ||
      // We're are already connected to this client
      this.hasConnection(offer.clientId) ||
      // They're on our rude list or not presenting an sdp string
      !offer.sdp || this.isRude(getIpFromRTCSDP(offer.sdp)) ||
      // We have the max number of connections
      this.connections().length >= this.config.maxConnections
    ) { return null }

    // There's an offer in the book for a client to whom we're not connected.
    debug(3, 'fielding an offer from', offer.clientId)

    // Generate the answer response to peer's answer (new peer object)
    // Always will be present b/c it's new
    const connection = this.generateAnswerConnection(offer)
    this.addConnection(connection, offer.clientId)

    return connection
  }

  private generateOfferConnection(): Connection {
    const id = uuid()

    const negotiation: t.PendingNegotiation = {
      type: 'offer',
      clientId: this.clientId,
      connectionId: id,
      sdp: null,
      networkId: this.networkId,
      timestamp: Date.now()
    }

    return new Connection(id, true, negotiation)
  }

  private generateAnswerConnection(offer: t.OfferNegotiation): Connection {
    debug(5, 'generateAnswerConnection called for offer:', offer.clientId, offer.connectionId)

    const negotiation: t.PendingNegotiation = {
      type: 'answer',
      clientId: this.clientId,
      connectionId: offer.connectionId,
      sdp: null,
      networkId: this.networkId,
      timestamp: Date.now()
    }

    const connection = new Connection(uuid(), false, negotiation)
    connection.signal(offer)
    return connection
  }

  private addConnection(connection: Connection, clientId?: t.ClientId) {
    // This always needs to happen when we add the connection to our pool,
    // lest we're adding an offer.
    if (clientId) connection.registerClientId(clientId)

    this._connections[connection.id] = connection
    this.registerRTCEventHandlers(connection)

    this.emit('add-connection', connection)
  }

  private registerRTCEventHandlers(connection: Connection) {
    const { peer } = connection
    peer.on('connect', () => {
      debug(2, 'CONNECT', connection.clientId)

      // Send a welcome log message for the warm fuzzies
      this.broadcastMessage({
        type: 'log',
        clientId: this.clientId,
        appId: APP_ID,
        id: uuid(),
        ttl: 1,
        destination: connection.clientId,
        data: {
          contents: 'you are now proudly connected to ' + this.clientId,
        }
      })
    })

    peer.on('data', (data: Uint8Array) => {
      const { clientId, negotiation } = connection

      const peerAddress = getIpFromRTCSDP((negotiation as t.Negotiation).sdp)
      debug(5, 'got message from:', peerAddress, clientId)

      // Ensure the machine on the other end of this connection is behaving themselves
      if (!this.behaviorCache.isOnGoodBehavior(peerAddress)) {
        debug(1, 'whoops, the machine belonging to', clientId, 'is exhibiting bad behavior!')
        this.addToRudeList(peerAddress, clientId)
        return
      }

      const str = data.toString()

      let message: Mes.Message
      try { message = JSON.parse(str) }
      catch (e) { return debug(3, 'failed to parse message from', clientId + ':', str, e) }

      this.handleMessage(message)
    })

    peer.on('close', () => { this.destroyConnection(connection) })

    peer.on('end', () => { debug(5, 'p.on("end") fired for client', connection.clientId) })
    peer.on('writable', () => { debug(5, 'p.on("writable") fired for client', connection.clientId) })
    peer.on('error', (err: any) => { debug(4, `p.on(error) handler for ${connection.clientId}:`, err) })
  }

  private garbageCollect() {
    this.garbageCollectSeenMessages()
    this.garbageCollectConnections()
  }

  private garbageCollectSeenMessages() {
    for (const messageId in this._seenMessageIds) {
      const timestamp = this._seenMessageIds[messageId]
      if (Date.now() - timestamp > MEMORY_DURATION) {
        debug(5, 'garbage collect messageId:', messageId)
        delete this._seenMessageIds[messageId]
      }
    }
  }

  private garbageCollectConnections() {
    // TODO we're keeping track of duplicate clients here so we can garbage collect them.
    // But it'd be better if we weren't having duplicate clients at all.
    const seenClientIds = {}

    // The actual garbage collection action
    const collect = (connection: Connection) => {
      debug(5, 'garbage collect connection:', connection)
      this.destroyConnection(connection)
    }

    for (const connectionId in this._connections) {
      const connection = this._connections[connectionId]
      const { clientId, peer: { destroyed } } = connection
      if (destroyed) {
        return collect(connection)
      }

      // After we clean destroyed connections, let's make sure we don't have any duplicates.
      // Sometimes there are race conditions. The idea here is that if it wasn't destroyed,
      // there's two valid connections, and we can remove one.
      //
      // Sometimes one node will have multiple connections pointing to
      // the same neighbor and that neighbor will only have one. There's a difference in
      // the two connections: One has a channelName and the other does not. If peer.channelName
      // is null then that's the connection that should be removed. I think this is some race
      // condition in SimplePeer. This will increase stability lots.
      // Also I tried specifying manually the same channel name at Peer instantiation time,
      // but that did not seem to have any effect.

      // This reads "if we've seen this clientId already, assess if either of the connections
      // have no channelName and remove it if it doesn't."
      const seenConnectionId = seenClientIds[clientId]
      if (seenConnectionId) {

        // These two mean if either has no channelName, remove it.
        // @ts-ignore -- not in the types, but not underscore prefixed..
        if (connection.peer.channelName === null) {
          return collect(connection)
        }
        // @ts-ignore
        if (this._connections[seenConnectionId].peer.channelName === null) {
          return collect(this._connections[seenConnectionId])
        }
      }
      seenClientIds[clientId] = connection.id
    }
  }

  private destroyConnection(connection: Connection) {
    debug(4, 'destroying connection', connection.clientId)
    const { peer } = connection
    peer.removeAllListeners()
    peer.end()
    peer.destroy()
    delete this._connections[connection.id]
    this.emit('destroy-connection', connection.id)
  }

  // Send message to a specific connection
  private send(connection: Connection, message: Mes.Message) {
    try {
      // The difference between write and send is that write queues, send
      // throws if it's not writable yet. Previously there was a race
      // condition here leading to many initial connections when
      // using write. Once we removed the asynchronicity from connection
      // creation, that race condition went away and we're free to use .write
      // again. However, ephemerality is built into the network, so it's understood
      // that messages won't always make it. With our rudeness checking on, maybe
      // it's best not to queue up messages before sending, and just send when
      // we're connected.
      // connection.peer.write(JSON.stringify(message))
      if (!connection.peer.connected) { return }
      connection.peer.send(JSON.stringify(message))
      debug(5, 'sending', message, 'to', connection.clientId)
    } catch (e) {
      debug(3, 'got error trying to send to', connection.clientId, e)
    }
  }

  private async broadcastOffer() {
    const openConnection = this.getOrGenerateOpenConnection()

    const offer: Mes.OfferMessage = {
      id: uuid(),
      ttl: 6,
      type: 'offer',
      clientId: this.clientId,
      appId: APP_ID,
      destination: '*',
      data: {
        timestamp: Date.now(),
        connectionId: openConnection.id,
        ...(openConnection.negotiation as t.OfferNegotiation)
      }
    }

    this.broadcastMessage(offer)
  }

  private hasConnection(clientId: t.ClientId): boolean {
    return !!this.getConnectionByClientId(clientId)
  }

  private getConnectionByClientId(clientId: t.ClientId): Connection | undefined {
    return this.connections().find(con => con.clientId === clientId)
  }

  // If we have an open connection in the pool, return that.
  // Otherwise, generate an open connection.
  private getOrGenerateOpenConnection(): Connection {
    // return this.connections().find(con => con.negotiation.type === 'offer') // TODO
    // let oc = this.connections().find(con => !con.peer.connected) // TODO
    let oc = this.connections().find(con => !con.clientId) // TODO
    if (!oc) {
      oc = this.generateOfferConnection()
      this.addConnection(oc)
    }

    return oc
  }
}
