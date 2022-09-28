import axios from "axios"
import { Connection } from "./Connection"
import { AnswerNegotiation, Negotiation, NetworkId, OfferNegotiation, SwitchAddress, SwitchboardBook, SwitchboardResponse } from "./types"
import { exhaustive } from "./util"

type OnOffer = (offer: OfferNegotiation) => Connection | null
type OnAnswer = (answer: AnswerNegotiation) => void
type OnBook = (book: SwitchboardBook) => void

type SwitchboardServiceProps = {
  switchAddress: SwitchAddress
  onOffer: OnOffer
  onAnswer: OnAnswer
  onBook: OnBook
  networkId: NetworkId
  interval: number
  getOpenConnection: () => Connection
}

export default class SwitchboardService {
  switchAddress: SwitchAddress
  onOffer: OnOffer
  onAnswer: OnAnswer
  onBook: OnBook
  networkId: NetworkId
  interval: number
  requestTimer: ReturnType<typeof setInterval>
  getOpenConnection: () => Connection

  constructor(props: SwitchboardServiceProps) {
    this.switchAddress = props.switchAddress
    this.onOffer = props.onOffer
    this.onAnswer = props.onAnswer
    this.onBook = props.onBook
    this.networkId = props.networkId
    this.getOpenConnection = props.getOpenConnection
    this.interval = props.interval
  }

  /**
  * @description Start making periodic requests to the switchboard.
  *
  * @returns {SwitchboardService} for startup convenience:
  * const sbs = new SwitchboardService({...}).start()
  */
  start = (): SwitchboardService => {
    this.requestTimer = setInterval(this.doSwitchboardRequest, this.interval)
    return this
  }

  /**
  * @description Stop making periodic requests
  */
  stop = () => {
    clearInterval(this.requestTimer)
  }

  private doSwitchboardRequest = async () => {
    const openConnection = this.getOpenConnection()

    // We don't want to send switchboard requests for pending connections
    // TODO make a method for this
    if (!openConnection.negotiation.sdp) return

    // Send our offer to switch
    const resp = await this.sendNegotiationToSwitchingService({
      address: this.switchAddress,
      networkId: openConnection.negotiation.networkId,
      connectionId: openConnection.id,
      ...(openConnection.negotiation as Negotiation)
    })

    this.handleSwitchboardResponse(resp)
  }

  private async sendNegotiationToSwitchingService(negotiation: Negotiation): Promise<SwitchboardResponse> {
    try {
      const res = await axios.post(this.switchAddress, negotiation)
      return res.data
    } catch (e) {
      // debug(4, 'error w/ switch:', e) // TODO
    }
  }

  private async handleSwitchboardResponse(book: SwitchboardResponse) {
    if (!book) { throw new Error('got bad response from switchboard') }

    for (const negotiation of book) {
      switch (negotiation.type) {
        case 'offer':
          const connection = this.onOffer(negotiation)
          if (!connection) { continue }

          connection.on('sdp', () => {
            this.sendNegotiationToSwitchingService({
              connectionId: connection.id,
              timestamp: Date.now(),
              networkId: this.networkId,
              ...(connection.negotiation as AnswerNegotiation)
            })
          })

          break

        case 'answer':
          this.onAnswer(negotiation)
          break

        default: exhaustive(negotiation, 'We got something from the switchboard that has a weird type'); break;;
      }
    }

    this.onBook(book)
  }

}
