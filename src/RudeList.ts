import * as t from "./types.d"

type RudeListProps = {
  maxMessageRate: number
}

/**
* @description Every time a message comes in this guy takes an address
* and keeps track of whether the sender is spamming.
*
* @todo Filter on IP again using getIpFromRTCSDP
*/
export default class RudeList {
  private _maxMessageRate: number
  private _events: { [address: string]: t.TimeStamp[] } = {}

  constructor({ maxMessageRate }: RudeListProps) {
    this._maxMessageRate = maxMessageRate
  }

  /**
  * Send every message you get that you want this guy to pay attention
  * to here. Whatever schemes RudeList is employing to determine if someone is rude
  * can go here.
  */
  registerMessage(negotiation: t.Negotiation) {
    const address = negotiation.address
    if (!this._events[address]) this._events[address] = []
    this._events[address].push(Date.now())
  }

  /**
  * Has the supplied address gone afoul of any schemes we use to judge?
  *
  * @param {string} address - Comes from SimplePeer#on('data')
  */
  isRude(address: string): boolean {
    let timestamps = this._events[address] || []
    const now = Date.now()
    timestamps = timestamps.filter(t => t < now)
    return timestamps.length > this._maxMessageRate
  }

}
