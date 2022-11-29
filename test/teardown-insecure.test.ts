import { run } from './teardown'

// This so it looks nice and readable in the output
function* generateNiceAddresses() {
  const addies = ['A', 'B', 'C', 'D', 'E']
  for (let a of addies) {
    yield a
  }
}

const generateNiceAddress = generateNiceAddresses()

run(() => {
  return { address: generateNiceAddress.next().value as string }
})

