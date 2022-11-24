import axios from "axios"
import * as t from "./types"

// New
type SwitchboardServiceProps = {
  switchAddress: t.SwitchAddress
  networkId: t.NetworkId
  address: t.Address
}

type SwitchboardRequest = {
  networkId: t.NetworkId
  address: t.Address // our (sender's) addy
  negotiationItems: {
    for: t.Address
    from: t.Address
    negotiation: t.Negotiation
  }[]
}

// The switchboard's actions
// Upon getting a request:
// 1) Take the address, and bring it into our list of addresses
//   { address: string, lastSeen: number }
//   { [address: string]: number }
// 2) Add the negotiationItems to an array
//  * Don't need to dedup or nothin, each will only be sent once.
// 3) Cull the expired addresses
// 4) Accumulate negotiationItems for the requesting address
// 5) Send back response with all addresses and accumulated negotiationItems

// * We always send the same request type. This allows for a simpler switchboard implementation
// * When it's the periodic send, negotiationItems will always be empty. It's only populated when
//   we send it back immediately after getting a response.
// * An empty negotiationItems is equivalent to the 'presence' message idea
export default class SwitchboardService {
  props: SwitchboardServiceProps
  requestTimer: ReturnType<typeof setInterval>

  /**
  * @description The SwitchboardService knows about sending requests to the switchboard. It knows
  * what requests look like and how to get at the switchboard. The rest is taken care of by network
  * itself.
  */
  constructor(props: SwitchboardServiceProps) {
    this.props = props
  }

  /**
  * @description Send what amounts to a 'presence' request to the switchboard.
  * This is the only thing that should be called periodically.
  */
  async sendEmptyRequest(): Promise<t.SwitchboardResponse> {
    const req: SwitchboardRequest = {
      networkId: this.props.networkId,
      address: this.props.address,
      negotiationItems: []
    }

    const resp = await axios.post(this.props.switchAddress, req)
    return resp.data
  }

  /**
  * @description Send a request to the switchboard that contains negotiation items in response to either
  * a new address we haven't seen yet, in which case it'd be an offer negotiation, or an offer, in which
  * case it'd be an answer negotiation.
  *
  * This can send multiple because theoretically that's what'll happen - A node will see a multitude of new
  * addresses in the beginning, for which it'll create a multitude of new connections and send their offers.
  * Next, we'll send another empty request, and in response we should see a whole bunch of answers, which we'd
  * then signal individually. Alternatively, if we're already in the network, and a multitude of others join
  * the network in between our periodic requests, we'll send a periodic request, and in the response will be
  * a multitude of offers. Then we'd send an answer for each of those offers in one of these sendReturnRequest's.
  */
  async sendReturnRequest(items: { for: t.Address, negotiation: t.Negotiation }[]): Promise<t.SwitchboardResponse> {
    const req: SwitchboardRequest = {
      networkId: this.props.networkId,
      address: this.props.address,
      negotiationItems: items.map(item => {
        return { from: this.props.address, for: item.for, negotiation: item.negotiation }
      })
    }

    const resp = await axios.post(this.props.switchAddress, req)
    return resp.data
  }

}
