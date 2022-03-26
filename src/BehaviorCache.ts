import * as t from "./types.d"

type BehaviorDefinition = {
  events: MessageEvent[]
}

type MessageEvent = {
  timestamp: t.TimeStamp
}

// This class creates an in memory cache of behaviors by ip addresses.
// It is used to detect abusive behavior. Every time a message comes in,
// give the ip to BehaviorCache.isOnGoodBehavior. If it returns true,
// then proceed with your message processing. If it returns false, then
// you can put the ip address into your rude list.
export default class BehaviorCache {
  maxMessageRate: number
  cache: { [ip: t.IPAddress]: BehaviorDefinition } = {}

  constructor(maxMessageRate: number) {
    this.maxMessageRate = maxMessageRate
  }

  isOnGoodBehavior(ip: t.IPAddress): boolean {
    const behavior = this.cache[ip]

    // We'll just initialize a new one if we haven't seen this machine yet
    if (!behavior) {
      this.cache[ip] = {
        events: [],
      }
    }

    // Add a new "event"
    this.cache[ip].events.push({
      timestamp: Date.now()
    })

    return !this.hasIpSurpassedRateLimit(ip)
  }

  private hasIpSurpassedRateLimit(ip: t.IPAddress): boolean {
    const behavior = this.cache[ip]

    const now = Date.now()
    const events = behavior.events

    // Remove any events that are too old
    events.forEach((event, index) => {
      if (now - event.timestamp > 1000) {
        events.splice(index, 1)
      }
    })

    // If we still have too many events, this machine is rude.
    return events.length > this.maxMessageRate
  }

}
