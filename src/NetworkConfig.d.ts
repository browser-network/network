// Below are the types for the network config object.

export type NetworkConfig = {
  // How often to broadcast our offer message to the network.
  // We always maintain a single open connection. We periodically
  // send that connection's info to both the switching service and
  // via a message into the network. If another node on the network
  // who we are not yet connected to hears it, they will send back
  // into the network a response. If we see that response, then we've
  // just created a new connection with that person. Note that each response
  // is specific to the original open connection and won't work with
  // a different connection.
  offerBroadcastInterval: number

  // How frequently do we POST to the switchboard
  // As above, we periodically send information about our open connection
  // to the switchboard service (github.com/browser-network/switchboard).
  // This option dictates how often we do that.
  switchboardRequestInterval: number

  // How frequently do we run GC
  // Periodically we need to do cleaning - at the time this comment was written,
  // both old or duplicate connections and old message IDs are subject to collection.
  // You will most likely not have to adjust this unless you're fine tuning memory
  // performance.
  garbageCollectInterval: number

  // Do we stop sending messages to a switchboard if we get a volunteer message
  // In an effort to further reduce the already minimal load to a switchboard,
  // I've come up with a somewhat cocamamy scheme to have only one node on
  // a network be hitting the switchboard at a time. The rest of the connections
  // to the network come from the message level.
  respectSwitchboardVolunteerMessages: boolean

  // How often can a machine send us a message before we call them rude
  // We don't want to stay connected to a node that's misbehaving - sending us
  // bogus messages or spamming us. This option is for spamming. How many
  // messages are we willing to accept from a node in one second before we consider them
  // to be spamming us?
  maxMessageRateBeforeRude: number

  // How many connections is a node allowed to have?
  // If this was set to Infinity, the network would be a "connected graph",
  // or a totally connected network where all nodes are connected to all other
  // nodes. If this was set to 3, the network would be essentially linear.
  // However it also would be highly prone to partitions as geometric shapes would
  // appear. Note this includes the ever present 'open connection', so if this is set
  // to 2, the node will only want to find one other node to connect with.
  maxConnections: number
}
