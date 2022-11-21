import * as t from './types.d'

export default class MessageMemory {
  private mem: { [messageId: t.GUID]: t.TimeStamp } = {}
  private memoryDuration: number

  /**
  * @description This is designed to keep track of which messages have been seen so far.
  *
  * @param {number} memoryDuration How long (in ms) will a memory's id last in our storage
  * before we free it for garbage collection.
  */
  constructor(memoryDuration: number) {
    this.memoryDuration = memoryDuration
  }

  /**
  * @description Mark this message as having been seen
  */
  add(messageId: t.GUID) {
    this.mem[messageId] = Date.now()
  }

  /**
  * @description Has this message been seen by us?
  */
  hasSeen(messageId: t.GUID) {
    return !!this.mem[messageId]
  }

  /**
  * @description Free all the old message ids for javascript's actual garbage collector
  */
  garbageCollect() {
    for (const messageId in this.mem) {
      const date = this.mem[messageId]
      if (Date.now() - date > this.memoryDuration) {
        delete this.mem[messageId]
      }
    }
  }
}


