// Various Message related types. The first one, Message, is inherited
// by every message type that gets broadcast into the network.
// The others are specific message types used by Network to build itself.
// Many apps being built on Network will want to create their own messages,
// so they'll have a similar collection of messages to the *Message types below.

import * as t from './types.d'

/**
* This is the Message type all other messages extend. So every message
* bouncing around on the network looks like this.
*/
export type Message<T = any> = {
  id: t.GUID
  address: t.Address // source address
  appId: string
  ttl: 0 | 1 | 2 | 3 | 4 | 5 | 6
  type: string
  destination: t.Address | '*'
  data?: T
  signatures: Signature[] // See signing scheme TODO
}

export type Signature = { signer: t.Address, signature: string }

// Various forms of network specific messages

/**
* @description Periodically we broadcast that we're on the network. If another party who's
* on the network who we don't share a connection with hears this, they will send us an
* offer message, to which we'll return an answer. This is how the network is self healing.
*/
export type PresenceMessage = Message<{ address: t.Address }> & { appId: string, type: 'presence' }

/**
* A message we craft in response to hearing a presence message from another party on
* the network. This is the first stage in creating a connection with another party.
*/
export type OfferMessage = Message<t.OfferNegotiation> & { appId: string, type: 'offer' }

/**
* The message we craft in response to an OfferMessage like above. This is the second stage
* in creating a connection with another party.
*/
export type AnswerMessage = Message<t.AnswerNegotiation> & { appId: string, type: 'answer' }

/**
* This is a kind of holdover from early development days but still seems to be usefully
* helping. The contents of this message will be logged to the console of whoever hears
* it. It needs to be enabled via the config soas to not expose the entire console as an
* attack vector.
*/
export type LogMessage = Message<{ contents: string }> & { appId: string, type: 'log' }

/**
* Every message that supports Network as an app on Network
*/
export type NetworkMessage =
  PresenceMessage |
  OfferMessage |
  AnswerMessage |
  LogMessage


