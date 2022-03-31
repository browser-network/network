// I want to use the extent EventEmitter but I need something
// that's strongly typed. There're a few implementations online,
// I chose: https://danilafe.com/blog/typescript_typesafe_events/

export default class TypedEventEmitter<T> {
  private handlers: { [eventName in keyof T]?: ((value: T[eventName]) => void)[] }

  constructor() {
    this.handlers = {}
  }

  emit<K extends keyof T>(event: K, value?: T[K]): void {
    this.handlers[event]?.forEach(h => h(value))
  }

  on<K extends keyof T>(event: K, handler: (value?: T[K]) => void): void {
    if(this.handlers[event]) {
      this.handlers[event].push(handler)
    } else {
      this.handlers[event] = [handler]
    }
  }
}
