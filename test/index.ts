// Works, but shows readout only from this file. So I mean all logs come from this file.
// It's here because otherwise the networks keep the process alive and the tests never end.
// We can't tear down the network because
Promise.all([
  require('./pool').default,
  require('./switch-free-connection').default,
]).then(() => {
  setTimeout(() => process.exit(0), 1000)
})
