export type HexString = string
export type TimeStamp = number
export type GUID = string
export type IPAddress = string

export type SDPString = string
export type EncryptedSDPString = string
export type SwitchAddress = string

export type PubKey = string
export type Secret = string
export type Address = PubKey
export type NetworkId = string

export type RTCOfferSdp = {
  type: 'offer'
  sdp: SDPString
}

export type RTCAnswerSdp = {
  type: 'answer'
  sdp: SDPString
}

export type RTCSdp = RTCOfferSdp | RTCAnswerSdp

export type NegotiationCommon = {
  address: Address // This is the address of the node that created this negotiation
  type: 'offer' | 'answer'
  sdp: SDPString | EncryptedSDPString
  connectionId: GUID
  networkId: NetworkId
  timestamp: TimeStamp
}

export type OfferNegotiation = { type: 'offer' } & NegotiationCommon
export type AnswerNegotiation = { type: 'answer' } & NegotiationCommon
export type Negotiation = OfferNegotiation | AnswerNegotiation

export type PendingOfferNegotiation = OfferNegotiation & { sdp: null }
export type PendingAnswerNegotiation = AnswerNegotiation & { sdp: null }

// Briefly b/t Connection instantiation & 'signal' event
export type PendingNegotiation = PendingOfferNegotiation | PendingAnswerNegotiation

export type SwitchboardResponse = {
  addresses: Address[] // all the addresses the switchboard has on book
  negotiationItems: {
    for: Address
    from: Address
    negotiation: Negotiation
  }[]
}

