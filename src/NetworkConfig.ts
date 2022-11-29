// Below are the types for the network config object, that which is passed
// in as `config` to new Network(...)

export type NetworkConfig = {
  /**
  * How often to broadcast our presence to the network.
  * Periodically we broadcast that we're on the network. If another party who's
  * on the network who we don't share a connection with hears this, they will send us an
  * offer message, to which we'll return an answer. This is how the network is self healing.
  */
  presenceBroadcastInterval: number

  /**
  * How frequently do we POST to the switchboard when we have no active connections?
  * As above, we periodically send information about our open connection
  * to the switchboard service (github.com/browser-network/switchboard).
  * This option dictates how often we do that.
  */
  fastSwitchboardRequestInterval: number

  /**
  * How frequently do we POST to the switchboard when do have active connections?
  * We can afford to be a lot slower once we're already in the network and save
  * on bandwidth for ourselves and the switchboard. The node will connect to
  * other nodes in the network primarily by inter network messages from here
  * on out.
  */
  slowSwitchboardRequestInterval: number

  /**
  * How frequently do we run GC
  * Periodically we need to do cleaning - at the time this comment was written,
  * both old or duplicate connections and old message IDs are subject to collection.
  * You will most likely not have to adjust this unless you're fine tuning memory
  * performance.
  */
  garbageCollectInterval: number

  /**
  * How often can a machine send us a message before we call them rude
  * We don't want to stay connected to a node that's misbehaving - sending us
  * bogus messages or spamming us. This option is for spamming. How many
  * messages are we willing to accept from a node in one second before we consider them
  * to be spamming us?
  */
  maxMessageRateBeforeRude: number

  /**
  * How many connections is a node allowed to have?
  * If this was set to Infinity, the network would be a "connected graph",
  * or a totally connected network where all nodes are connected to all other
  * nodes. If this was set to 3, the network would be essentially linear.
  * However it also would be highly prone to partitions as geometric shapes would
  * appear. Note this includes the ever present 'open connection', so if this is set
  * to 2, the node will only want to find one other node to connect with.
  */
  maxConnections: number
}
