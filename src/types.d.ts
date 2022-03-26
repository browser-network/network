export type HexString = string
export type TimeStamp = number
export type GUID = string
export type IPAddress = string

export type SDPString = string
export type SwitchAddress = string

export type PubKey = string
export type PrivKey = string
export type ClientId = string
export type NetworkId = string

export type RTCOffer = {
  type: 'offer'
  sdp: t.SDPString
}

export type RTCAnswer = {
  type: 'answer'
  sdp: t.SDPString
}


export type NegotiationCommon = {
  clientId: t.ClientId
  type: 'offer' | 'answer'
  sdp: t.SDPString
  connectionId: t.GUID
  networkId: t.NetworkId
  timestamp: t.TimeStamp
}

export type Offer = { type: 'offer' } & NegotiationCommon
export type Answer = { type: 'answer' } & NegotiationCommon
export type Negotiation = Offer | Answer

export type SwitchboardBook = Negotiation[]
export type SwitchboardResponse = SwitchboardBook | null

