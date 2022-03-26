import { debugFactory } from './util'

const debug = debugFactory('Repeater')

type RepeaterProps = {
  func: () => Promise<void> // What's to be repeated
  delay: number // The normal delay between invocations
  numIterations: number
  onComplete: () => void
}

// This:
// * Takes a function to run
// * Runs that function numIterations times with a delay of delay
// * Once all those times are run, it stop invoking and calls
//   onComplete callback
// * Is always cancelable by calling stop()
export class Repeater {
  private numIterations: RepeaterProps['numIterations']
  private delay: RepeaterProps['delay']
  private func: RepeaterProps['func']
  private onComplete: RepeaterProps['onComplete']

  private intervalId: ReturnType<typeof setInterval>
  private iteration: number = 1

  constructor(props: RepeaterProps) {
    Object.assign(this, props)
  }

  begin(): void {
    if (this.intervalId) { return }
    this.intervalId = setInterval(this.runFunction, this.delay)
  }

  stop(): void {
    clearTimeout(this.intervalId)
    delete this.intervalId
    this.iteration = 1
  }

  private runFunction = async () => {
    debug(5, 'running given function:', this.func.name, 'iteration:', this.iteration)
    this.func()

    if (this.iteration >= this.numIterations) {
       this.stop()
       this.onComplete()
    }

    this.iteration += 1
  }

}
