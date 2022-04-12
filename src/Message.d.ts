// Various Message related types. The first one, Message, is inherited
// by every message type that gets broadcast into the network.
// The others are specific message types used by Network to build itself.
// Many apps being built on Network will want to create their own messages,
// so they'll have a similar collection of messages to the *Message types below.

// This is the Message type all other messages extend. So every message
// bouncing around on the network looks like this.
export type Message<T = any> = {
  id: t.GUID
  address: t.Address // source address
  appId: string
  ttl: 0 | 1 | 2 | 3 | 4 | 5 | 6 // no infinite message loops!
  type: string
  destination: t.Address | '*'
  data: T
  signatures: Signature[] // See signing scheme TODO
}

export type Signature = { signer: t.Address, signature: string }

// Various forms of network specific messages

// The regularly broadcast message that contains our open connection address
// information.
export type OfferMessage = Message<Offer> & { appId: typeof APP_ID, type: 'offer' }

// The message we craft in response to an OfferMessage like above.
export type AnswerMessage = Message<Answer> & { appId: typeof APP_ID, type: 'answer' }

// This message we will send into the network to tell everyone else that we are
// going to take the next turn of regularly communicating with the switchboard for a spell.
// If enabled, upon hearing this, the node will back off and stop sending switchboard requests
// until the specified timeout has elapsed.
export type SwitchboardVolunteerMessage = Message<{}> &
  { appId: typeof APP_ID, type: 'switchboard-volunteer', ttl: 2, destination: '*' }

// This is a kind of holdover from early development days but still seems to be usefully
// helping. The contents of this message will be logged to the console of whoever hears
// it. It needs to be enabled via the config soas to not expose the entire console as an
// attack vector.
export type LogMessage = Message<{ contents: string }> & { appId: typeof APP_ID, type: 'log' }

// Every message that supports Network as an app is below.
export type NetworkMessage =
  OfferMessage |
  AnswerMessage |
  LogMessage |
  SwitchboardVolunteerMessage


