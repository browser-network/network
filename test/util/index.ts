export const ensureEventually = async (timeLimit: number, fn: () => boolean) => {
  return new Promise<void>((resolve, reject) => {

    const start = Date.now()

    const interval = setInterval(() => {
      if (fn() === true) {
        clearInterval(interval)
        return resolve()
      }

      if (Date.now() - start >= timeLimit) {
        // We've surpassed our wait time
        clearInterval(interval)
        return reject()
      }

    }, 1000)
  })

}

