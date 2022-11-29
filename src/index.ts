// Tried using crypto.randomUUID() but browserify like 10x's the build
// size to do it.
import { v4 as uuid } from 'uuid'

import * as t from './types.d'
import {
  Message,
  Signature,
  NetworkMessage,
  OfferMessage,
  AnswerMessage,
  LogMessage,
  PresenceMessage
} from './Message'

import { exhaustive } from './util'
import { NetworkConfig } from './NetworkConfig'
import { Connection, ConnectionFactory } from './Connection'
import * as bnc from '@browser-network/crypto'
import { EventEmitter } from 'events'
import RudeList from './RudeList'
import SwitchboardService from './SwitchboardService'
import MessageMemory from './MessageMemory'

// It's useful to have this so a user can nail down exactly the type
// they're working with, like:
//
// network.on('message', (message: Message<MyDataType>) => {})
export type { Message }

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

// Object you pass in when instantiating a network
type CommonNetworkProps = {
  /**
  * Identify the network we're working with. All nodes who are on this
  * network are going to be receiving the same messages. So make the network
  * id unique. Somewhat interestingly, it's only the switchboard that has to
  * do with partitioning networks. It simply doesn't set up two nodes with
  * different networkIds, and the networks never cross.
  */
  networkId: t.NetworkId

  /**
  * Where does the switchboard live? We'll be sending regular POST
  * requests to it to initially get into the network and to onboard
  * new folk into the network once we're already in.
  */
  switchAddress: t.SwitchAddress

  /**
  * If nothing's passed in, the defaults will be used.
  */
  config?: Partial<NetworkConfig>
}

type SecureNetworkProps = CommonNetworkProps & {
  /**
  * The EC private key that identifies this node on the network. From this,
  * the public key will be derived. That public key is used as the address
  * of this node.
  */
  secret: t.Secret
}

type InsecureNetworkProps = CommonNetworkProps & {
  /**
  * @description An arbitrary string used as an identifying address. If this
  * is passed in, it's not a secure network and no encryption will be used.
  */
  address: string
}

type NetworkProps = InsecureNetworkProps | SecureNetworkProps

type MinimumMessage = Partial<Message> & { type: Message['type'], appId: Message['appId'] }
// TODO I want to do something like this, to tell the compiler that if the user's appId is
// in the message they're receiving, then it's definitely their message, aka a UserMessage.
// So after they do if (message.appId !== myAppId), assuming their appIds are narrower than string,
// I want this to register that. Like:
// If appId is in keyof UserMessage['appId'] : UserMessage ? Message
export default class Network<UserMessage extends MinimumMessage = MinimumMessage> {
  config: NetworkConfig
  address: t.Address
  networkId: t.NetworkId
  switchboardService: SwitchboardService
  rudeList: RudeList

  private _secret: t.Secret
  private _connections: { [connectionId: t.GUID]: Connection } = {}
  private _messageMemory: MessageMemory = new MessageMemory(MEMORY_DURATION)
  private _switchboardTimeout: ReturnType<typeof setTimeout>
  private _presenceBroadcastInterval: ReturnType<typeof setInterval>
  private _garbageCollectInterval: ReturnType<typeof setInterval>
  private _eventEmitter: EventEmitter = new EventEmitter()

  constructor(props: NetworkProps) {
    const { networkId, switchAddress, config } = props

    // Assign ourselves a secret or address. This'll determine whether we're running
    // in message secure or insecure mode.
    if ('secret' in props) {
      this._secret = props.secret
      try {
        this.address = bnc.derivePubKey(props.secret)
      } catch (e) {
        throw new Error("Whoops, can't derive address from secret. Was secret made using browser network's crypto.generateSecret()?")
      }
    } else {
      this.address = props.address
    }

    this.networkId = networkId

    this.config = Object.assign({
      presenceBroadcastInterval: 1000 * 5,
      fastSwitchboardRequestInterval: 500,
      slowSwitchboardRequestInterval: 1000 * 3,
      garbageCollectInterval: 1000 * 5,
      maxMessageRateBeforeRude: Infinity,
      maxConnections: 10
    }, config)

    this.switchboardService = new SwitchboardService({
      networkId, switchAddress, address: this.address
    })

    // Kick off the switchboard request process. Internally it will re-trigger itself.
    this.doSwitchboardRequest()

    this.startPresenceBroadcastInterval()
    this.startGarbageCollectionInterval()

    // This is our "good behavior" determination. The max message rate is
    // how many messages will we tolerate within a one second period from
    // a specific IP address before we consider that machine to be a rude fella.
    this.rudeList = new RudeList({
      maxMessageRate: this.config.maxMessageRateBeforeRude
    })
  }

  /**
  * @description Listen for events happening on the network. These will be network internal
  * events and messages from the network itself, libraries using the network, or your app,
  * each differentiated via the 'appId' field.
  *
  * The events:
  * 'message' - any message coming from a different node on the network
  * 'broadcast-message' - fired any time this node broadcasts or rebroadcasts a message
  * 'bad-message' - when this node receives a malformed message
  * 'add-connection' - when this node connects to another
  * 'destroy-connection' - when this node disconnects from another
  * 'switchboard-response' - upon receiving a response from the switchboard
  * 'connection-error' - when there's an RTC error this will be called. Usually follows up
  * with the connection self destructing.
  * 'connection-process' - Sometimes it's helpful to see what's happening in the connection
  * process. This will come with a string description at various stages of connection.
  */
  on(type: 'message', handler: (message: UserMessage & Message<unknown>) => void): void
  on(type: 'broadcast-message', handler: (message: UserMessage & Message<unknown>) => void): void
  on(type: 'bad-message', handler: (badMessage: any) => void): void
  on(type: 'add-connection', handler: (connection: Connection) => void): void
  on(type: 'destroy-connection', handler: (id: Connection['id']) => void): void
  on(type: 'switchboard-response', handler: (book: t.SwitchboardResponse) => void): void
  on(type: 'connection-error', handler: ({ description: string, error: Error }) => void): void
  on(type: 'connection-process', handler: (description: string) => void): void
  on(type: never, handler: never): void
  on(type: string, handler: (data: any) => void) {
    this._eventEmitter.on(type, handler)
  }

  // Even though these are private I think it's handy to have them here next
  // to their counterparts
  private _emit(type: 'message', message: Message): void
  private _emit(type: 'broadcast-message', message: Message): void
  private _emit(type: 'bad-message', message: Message): void
  private _emit(type: 'add-connection', connection: Connection): void
  private _emit(type: 'destroy-connection', id: Connection['id']): void
  private _emit(type: 'switchboard-response', book: t.SwitchboardResponse): void
  private _emit(type: 'connection-error', { description: string, error: Error }): void
  private _emit(type: 'connection-process', description: string): void
  private _emit(type: string, data: any) {
    this._eventEmitter.emit(type, data)
  }

  /**
  * @description Delegated to native EventEmitter. Use this to stop listening to certain events.
  */
  removeListener(type: 'message', handler: Function): void
  removeListener(type: 'broadcast-message', handler: Function): void
  removeListener(type: 'bad-message', handler: Function): void
  removeListener(type: 'add-connection', handler: Function): void
  removeListener(type: 'destroy-connection', handler: Function): void
  removeListener(type: 'switchboard-response', handler: Function): void
  removeListener(type: 'connection-error', handler: Function): void
  removeListener(type: 'connection-process', handler: (description: string) => void): void
  removeListener(type: never, handler: never): void
  removeListener(type: never, handler: never) {
    this._eventEmitter.removeListener(type, handler)
  }

  /**
  * @description List of all our current connections, active and pending
  */
  get connections(): Connection[] {
    return Object.values(this._connections)
  }

  /**
  * @description List all of our active connections
  *
  * @todo Make this a getter - it doesn't make semantic sense for it to be a method
  */
  get activeConnections(): Connection[] {
    return this.connections.filter(con => {
      return (
        // The connection has its sdp information already
        con.state === 'connected' &&

        // This is how simplePeer knows
        con.peer.connected
      )
    })
  }

  /**
  * Stop all listeners, intervals, and connections, so that a process running
  * a network can gracefully stop its own process.
  */
  teardown() {
    this.stopPresenceBroadcastInterval()
    this.stopGarbageCollectionInterval()
    this.stopSwitchboardRequests()

    for (let c of this.connections) {
      this.destroyConnection(c)
    }

    this._eventEmitter.removeAllListeners()
  }

  /**
  * The primary means of sending a message into the network for an application.
  * You can pass in a union of your different message types for added type safety.
  * Also, if you pass in custom message types to Network, like:
  * new Network<{ type: 'hello', appId: string }>(...)
  * then you can be sure when you broadcast you're obeying your own types
  */
  async broadcast(message: UserMessage) {
    this._broadcastInternal(message as Partial<Message> & { type: string, appId: string })
  }

  /**
  * @description Stop hitting the switchboard for new connections. Connections will still
  * be made via messages. To start the hitting the switchboard again, call doSwitchboardRequest().
  */
  stopSwitchboardRequests() {
    clearTimeout(this._switchboardTimeout)
  }

  /**
  * The purpose of having a broadcast separate from broadcast internal is one of typing.
  * I'm allowing this since this app (Network) is the only app that uses Network that doesn't
  * instantiate Network thereby giving it the instantiation time typing of UserMessage.
  */
  private async _broadcastInternal(message: Partial<Message> & { type: string, appId: string }) {
    // required: type, appId
    if (!message.type || !message.appId) {
      throw new TypeError('Must supply at least `type` and `appId`')
    }

    let toBroadcast: Message = Object.assign({
      id: uuid(),
      address: this.address,
      ttl: 6 as 5, // lol
      destination: '*',
      signatures: [],
    }, message)

    if (this._secret) {
      toBroadcast.signatures.push({
        signer: this.address,
        signature: await bnc.sign(this._secret, toBroadcast)
      })
    } else {
      // If we're in insecure mode, we're still going to use the items in this
      // array to count how many times the message has bounced around.
      toBroadcast.signatures.push({
        signer: this.address,
        signature: ''
      })
    }

    this._messageMemory.add(toBroadcast.id)

    for (const connection of this.activeConnections) {
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
        // connection.peer.write(JSON.stringify(toBroadcast))
        connection.peer.send(JSON.stringify(toBroadcast))
      } catch (error) {
        const description = 'an error has occured attempted to broadcast a message to ' + connection.address
        this._emit('connection-error', { description, error })
      }
    }

    this._emit('broadcast-message', toBroadcast)
  }

  /**
  * @description This is the main guy for communicating with the switchboard.
  * Call this once and it'll recursively call itself indefinitely, on a timeout.
  * That timeout is assigned based on network state:
  *
  * If there are no active connections, it'll make rapid requests. If there are
  * active connections, it'll ease back and request more slowly. This enables really
  * fast connection on startup, especially with empty networks, while preserving
  * bandwidth for the clients and the switchboard.
  *
  * @TODO Currenty if it encounters an error, it won't get to the end and won't
  * set itself up to be called again. This means a single problem with parsing
  * or reaching the switchboard will permanently stop switchboard requests
  * until the app is restarted or doSwitchboardRequest is called again.
  */
  private async doSwitchboardRequest() {
    // First we send an 'empty' request, which is like a 'presence' message. It declares
    // to the switchboard that we're here, and people can send us offers if they want.
    const resp = await this.switchboardService.sendEmptyRequest()

    this._emit('switchboard-response', resp)

    const numOffers = resp.negotiationItems.filter(item => item.negotiation.type === 'offer').length
    const numAnswers = resp.negotiationItems.filter(item => item.negotiation.type === 'answer').length
    this._emit('connection-process', `received switchboard response with ${numOffers} offers and ${numAnswers} answers`)

    // A response will have potentially offers for people who saw us, or answers
    // for offers we've sent up.
    // Upon getting a response:
    // 1) Go through negotiationItems first:
    //   * If we see an offer for us, we send up an answer
    //   * If we see an answer for us, we signal it
    // 2) Go through addresses:
    //   * If we see one we don't have a connection for, create an offer, send it up.

    const newAnswerConnections = resp.negotiationItems.map(item => {
      // Create a new answer connection for each foreign offer
      if (item.negotiation.type === 'offer') {

        // If we have an active connection with a homie, we don't need to make another.
        // However if it's not fully connected yet, we'll go ahead and make another
        // connection to avoid "the offer loop", a situation that happens, mostly in
        // tests, where both parties have an open offer to each other and therefore
        // refuse to make another. Everybody just sits around with their open offer waiting
        // for the other to do something. This way results in potential duplicate connections,
        // but those can always be garbage collected, and better to be connected redundantly
        // than not at all.
        if (this.getActiveConnectionByAddress(item.from)) { return }

        // Sometimes if both parties create an offer in the same go, they can get stuck
        // in an offer loop whereby both are waiting for the other to make an answer.
        // If we allow an answer to be made on both sides then maybe 2 connections will
        // be made, but that's better than none.
        this._emit('connection-process', `switchboard process: creating new non-initiator connection to ${item.from}`)

        return ConnectionFactory.new({
          networkId: this.networkId,
          selfAddress: this.address,
          foreignAddress: item.from,
          suppliedOfferNegotiation: item.negotiation
        })

      } else {
        // For answer negotiations, signal each one that's not fully connected
        // We're kinda piggybacking in this loop
        const con = this.getConnectionByAddress(item.from)
        if (con?.state === 'open') {
          this._emit('connection-process', `Signaling initiator connection to ${item.from}, connectionId: ${con.id}`)
          con._handleAnswerNegotiation(item.negotiation)
        }
      }

    }).filter(Boolean)

    // Now we go through each address and create a new offer connection
    const newOfferConnections = resp.addresses.map(address => {
      // No sense in making an offer to ourselves
      if (address === this.address) return

      // Definitely don't want to send an offer to someone we're already connected to
      if (this.getConnectionByAddress(address)) return

      this._emit('connection-process', `switchboard process: creating new initiator connection to ${address}`)

      return ConnectionFactory.new({
        networkId: this.networkId,
        selfAddress: this.address,
        foreignAddress: address
      })
    }).filter(Boolean)

    // All these are now in the 'open' state
    const answerConnections = await Promise.all(newAnswerConnections)
    const offerConnections = await Promise.all(newOfferConnections)

    answerConnections.forEach(con => this.registerConnection(con))
    offerConnections.forEach(con => this.registerConnection(con))

    // Send our response negotiations back up. So clean,
    // one request down and one up.
    this.switchboardService.sendReturnRequest([
      ...answerConnections.map(con => {
        return {
          for: con.address,
          negotiation: con.answer
        }
      }),
      ...offerConnections.map(con => {
        return {
          for: con.address,
          negotiation: con.offer
        }
      })

    ])

    // Call ourselves recursively so we can adjust the timing based on network state
    const interval = this.activeConnections.length
      ? this.config.slowSwitchboardRequestInterval
      : this.config.fastSwitchboardRequestInterval

    this._switchboardTimeout = setTimeout(() => this.doSwitchboardRequest(), interval)
  }

  // Safely start it
  private startPresenceBroadcastInterval() {
    if (this._presenceBroadcastInterval) { return }

    // Stagger this a little bit. This helps in testing primarily when many
    // tabs all restart at precisely the same time, a very rare race condition can
    // happen whereby both parties create an initiator connection and send them
    // to each other.
    const interval = this.config.presenceBroadcastInterval + (Math.random() * 100)

    this._presenceBroadcastInterval = setInterval(() => {
      this._broadcastInternal({
        type: 'presence',
        appId: APP_ID,
        destination: '*',
        data: { address: this.address }
      })
    }, interval)
  }

  private stopPresenceBroadcastInterval() {
    clearInterval(this._presenceBroadcastInterval)
    delete this._presenceBroadcastInterval
  }

  // Safely start it
  private startGarbageCollectionInterval() {
    if (this._garbageCollectInterval) { return }
    this._garbageCollectInterval = setInterval(this.garbageCollect.bind(this), this.config.garbageCollectInterval)
  }

  private stopGarbageCollectionInterval() {
    clearInterval(this._garbageCollectInterval)
    delete this._garbageCollectInterval
  }

  private async handleMessage(message: Message) {
    // If we've already seen this message, we do nothing
    // with it.
    if (this._messageMemory.hasSeen(message.id)) { return }

    // Now we've seen this message.
    this._messageMemory.add(message.id)

    // Only handle messages meant for either us or everybody
    if (!['*', this.address].includes(message.destination)) { return }

    // Ensure the message is cryptographically sound

    // Now, if we're in secure message mode, we go through each signature, in
    // reverse order, popping it out as we go, ensuring each is valid for the
    // resulting rest of the message.
    if (this._secret) {

      // Firstly, if there are no signatures, it is not sound.
      if (message.signatures.length === 0) {
        this._emit('bad-message', message)
      }

      let signatures: Signature[] = []
      while (message.signatures.length !== 0) {
        const signature = message.signatures.pop()
        signatures.unshift(signature)
        const isValidSignature = await bnc.verifySignature(message, signature.signature, signature.signer)
        if (!isValidSignature) {
          this._emit('bad-message', message)
          return
        }
      }

      // Now we repair the mutation from above
      message.signatures = signatures
    }

    // We are only interested in our own application here.
    // The network is actually an application on the network, lolz.
    // Note we're using 'massage' here only so typescript knows
    // about the correct typing. Try getting exhaustiveness without
    // it.
    const massage = message as NetworkMessage
    if (message.appId === APP_ID) {
      switch (massage.type) {
        case 'presence': this.handlePresenceMessage(massage); break
        case 'offer': this.handleOfferMessage(massage); break
        case 'answer': this.handleAnswerMessage(massage); break
        case 'log': this.handleLogMessage(massage); break
        default: exhaustive(massage, 'Someone sent a message with our appId but of the wrong type!'); break;;
      }
    }

    // Instead of decrementing the ttl value, since the signatures depend on it
    // staying the same, we count the signatures to see how many hops the message
    // has taken.
    if (message.signatures.length < message.ttl) {
      this._broadcastInternal(message)
    }

    this._emit('message', message)
  }

  private async handlePresenceMessage(message: PresenceMessage) {
    if (this.getActiveConnectionByAddress(message.address)) { return }

    this._emit('connection-process', `fielding presence message from ${message.address}`)

    const extentConnections = this.connections.filter(con => {
      return con.address === message.address
    })

    // If there are half open connections, we want to prioritize our own, because
    // from here on out it's essentially instant to connect with another.
    for (let con of extentConnections) {
      if (con.state === 'connected') {
        return // We already have a connection and don't need to go further
      } else {
        this._emit('connection-process', `destroying extent but inactive connection ${con.id.slice(0, 5)}... to ${con.address} in favor of new one`)
        this.destroyConnection(con)
      }
    }

    // If we've made it this far, we either are seeing a new person or we're
    // hijacking the connection process from the slower switchboard.

    // Create a new connection dedicated to this person
    const connection = await ConnectionFactory.new({
      networkId: this.networkId,
      selfAddress: this.address,
      foreignAddress: message.address
    })

    this.registerConnection(connection)

    this._emit('connection-process', `broadcasting offer message to ${message.address}, connectionId: ${connection.id.slice(0, 5)}...`)
    this._broadcastInternal({ appId: APP_ID, type: 'offer', data: connection.offer })
  }

  private async handleOfferMessage(message: OfferMessage) {
    // If they've sent us an offer but we're already connected, let's ignore that
    // in favor of the connection we already have. Dunno why they'd be sending an
    // offer anyways.
    if (this.getActiveConnectionByAddress(message.address)) { return }

    this._emit('connection-process', `received offer message from ${message.address}`)

    const inactiveConnections = this.connections.filter(con => {
      return con.address === message.address &&
        con.state !== 'connected'
    })

    // If we have existing non active connections for this person already, we'll let that one
    // go in favor of creating one for this message. Messages create connections way faster
    // than the switchboard, which these are assumed to be for.
    inactiveConnections.forEach(con => {
      this._emit('connection-process', `destroying extent but inactive connection ${con.id.slice(0, 5)}... to ${con.address} in favor of new one`)
      this.destroyConnection(con)
    })

    const connection = await ConnectionFactory.new({
      networkId: this.networkId,
      selfAddress: this.address,
      foreignAddress: message.address,
      suppliedOfferNegotiation: message.data
    })

    this.registerConnection(connection)

    this._emit('connection-process', `broadcasting answer message to ${message.address}, connectionId: ${connection.id.slice(0, 5)}...`)
    this._broadcastInternal({ appId: APP_ID, type: 'answer', data: connection.answer })
  }

  private handleAnswerMessage(message: AnswerMessage) {
    // We only want to go through with this if we have a connection that is
    // open and is the initiator. If there's an active connection already, we
    // dont want to proceed.
    if (this.getActiveConnectionByAddress(message.address)) { return }

    const connection = this.connections.find(con => {
      return con.address === message.address && // for us
        con.state === 'open' && con.initiator && // open and ready for an answer
        con.id === message.data.connectionId // message was meant for this connection
    })

    // If there's no connection here, it means somehow the answer message was sent
    // to us in error or maybe after this connection expired.
    if (!connection) { return }

    this._emit('connection-process', `received answer message from and signaling to ${message.address}, connectionId: ${connection.id.slice(0, 5)}`)

    // I think what's going on here is that we're calling _handleAnswerNegotiation
    // for a connection that something else spawned, like, just not the right one.
    connection._handleAnswerNegotiation(message.data)
  }

  private handleLogMessage(message: LogMessage) {
    console.log(message.address + ':', message.data.contents)
  }

  private registerConnection(connection: Connection) {
    this._connections[connection.id] = connection

    connection.peer.on('connect', () => {
      this._emit('add-connection', connection)

      // Let's take this opportunity to remove any other connections with the
      // same address that aren't connected. Keep the place clean. It's possible
      // for there to be duplicate connections made in the switchboard process.
      this.connections.forEach(con => {
        if (con.address === connection.address && con.id !== connection.id) {
          this.destroyConnection(con)
        }
      })

      // Send a welcome log message for the warm fuzzies
      this._broadcastInternal({
        type: 'log',
        address: this.address,
        appId: APP_ID,
        id: uuid(),
        ttl: 1,
        destination: connection.address,
        data: {
          contents: 'Heyo!'
        }
      })
    })

    connection.on('message', (message: Message) => {
      // TODO Add rudelist here
      // const { address, negotiation } = connection
      // this.rudeList.registerMessage(connection.negotiation)
      // if (this.rudeList.isRude(connection.address)) { ... }
      this.handleMessage(message)
    })

    connection.on('bad-message', (message: string) => console.error('Network received a malformed message:', message))
    connection.peer.on('close', () => this.destroyConnection(connection))
    connection.peer.on('error', (error: Error) => {
      const description = `Error in connection with ${connection.address}. connectionId: ${connection.id}`
      this._emit('connection-error', { description, error })
    })
  }

  private garbageCollect() {
    this.garbageCollectSeenMessages()
    this.garbageCollectConnections()
  }

  private garbageCollectSeenMessages() {
    this._messageMemory.garbageCollect()
  }

  private garbageCollectConnections() {
    // Just go through and remove the ones that have been
    // deemed unfit by SimplePeer
    for (const connectionId in this._connections) {
      const connection = this._connections[connectionId]
      if (connection.peer.destroyed) {
        this.destroyConnection(connection)
      }
    }
  }

  private destroyConnection(connection: Connection) {
    const { peer } = connection
    peer.removeAllListeners()
    peer.end()
    peer.destroy()
    delete this._connections[connection.id]
    this._emit('destroy-connection', connection.id)
  }

  // Get ANY connection we have, no matter the state it's in.
  private getConnectionByAddress(address: t.Address): Connection | undefined {
    return this.connections.find(con => con.address === address)
  }

  // Get only an active connection
  private getActiveConnectionByAddress(address: t.Address): Connection | undefined {
    return this.connections.find(con => con.address === address && con.state === 'connected')
  }
}
