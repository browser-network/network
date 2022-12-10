# Browser Network

<img
  align='right'
  height=300
  width=300
  src='https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/4-connected_graph.svg/800px-4-connected_graph.svg.png'>

### A direct peer to peer network between browser windows

The Network is a peer to peer, decentralized, browser based
network. It uses WebRTC to connect directly from browser to browser.
Every browser window connects to many others, creating a robust network
through which messages can be sent.

---

### The goal
#### to enable easy to use, truly serverless app development, that:
* Does not rely on the concept of a coin or token to incentivise network participation
  > Using the app _is_ participating in the network.
* Is not compute resource intensive
  > There's nothing to mine.
* Makes no assumptions about node uptime
  > The network is designed to have an arbitrary number of nodes come up and down for an arbitrary length of time
* Cryptographically secure messaging ensures against spoofing
  > Messages are mathematically guaranteed to come from who they say they're from
* Does not rely on websockets
  > Therefore is not hampered by the switchboard's ability to simultaneously hold
    many websocket connections. This is a huge drawback of networks that do use
    a websocket switchboard. The network can only be as big as that switchboard's
    address space, and if the switchboard goes down, the network will start to fall
    apart. They're still distributed networks, but they rely heavily on a single
    server entity. This network still relies on a server switchboard, but its self
    healing quality leads to a robust network even if the switchboard goes down.

The Network can be dropped into any web app via
[npm](//npmjs.org/package/@browser-network/network) or
[cdn](//unpkg.com/@browser-network/network/umd/network.min.js) and the app will
become an interconnected network of all the users who currently have the app
open.

### What can be done with it
A million and one things can be done with such a network. The original impetus
for writing this was to create a [decentralized database of
sorts](//github.com/browser-network/database) to enable truly serverless real
time state updates on the web. This could be used for something like a social
network to great effect. It'd mean no intermediary between users and their
data. Each user does some of the work of saving states and communicating on the
network. The incentive to run the code is to use the app.

Really anything that requires real time capabilities will work with this.
What immediately comes to mind:

- A whole array of video/audio/messaging room based situations
- Real time multiplayer games
- Parallel computation coordination
- Trustless decentralized state machine
- Cryptocurrency

### Features

* Self Healing - when a connection breaks, a node on the network establishes a
  new connection with another node. The network internally gossips WebRTC
  handshake information to (re)establish connections with disconnected nodes.

* Lightening fast - the network establishes many connections usually within
  one second of starting up.

* The only external reliance is on a lightweight http only switching service
  which has a small resource footprint. Note it does not rely on websockets,
  just regular http requests.

* This software can be run in both browsers and in node.js. That means you can
  have a permanent network node set up somewhere headless in a node.js process
  if you want.

* This software defines a set of message protocols that can be used with any other
  webRTC enabled hardware. This means one network is not limited to having
  browsers and node.js instances only - [phones implement webRTC in
  browsers](https://caniuse.com/?search=webrtc), and webRTC is enabled natively
  for both [Android](https://webrtc.github.io/webrtc-org/native-code/android/)
  and [iOS](https://webrtc.github.io/webrtc-org/native-code/ios/).

* If you do want full uptime and a similar user experience to an app with a server,
  you can just leave a browser window of your app open. Another way of saying this,
  is the only programming you have to do to have a real server is opening up a
  browser window :P Note that if you wish to do _slightly more programming_, you can
  also run a node.js node with the same `networkId`, and it will act as a headless
  browser window, fulfilling all the same functionality as a browser window would.

* Cryptographic security - Network uses elliptic curve public key encryption to:
    - Ensure the veracity of messages: It's cryptographically difficult to
      spoof or modify a message that's not your own.
    - Encrypt sensitive IP information: The network passes around SDP strings, information
      pertaining to WebRTC connections, which contains IP addresses. These are passed
      through nodes to get to a node that another is not directly connected to.
      To ensure no snooping, ECIES is used to encrypt the SDP information so that only
      the recipient it's meant for can read it.
    - These features can be turned on for more security or off for faster
      performance if your network doesn't care about these security features and
      it needs to rapidly send messages, for whatever reason.


### How it works

When you first open the webpage, the app does need some way to find at least
one node on the network. So we have a [switching service](#the-switching-service).

Once we connect to another node that's in a network we'll start to hear
[messages](#messages) from the whole network, including nodes we're not connected to.

Some of the messages we'll be hearing will be from nodes we're not directly
connected to. In that case, the we'll rapidly negotiate a connection with them
by relaying our negotiation via the nodes we are mutually connected to. It's by
this means that the network is self healing.

### The Switching Service

The switching service can facilitate a connection between any two nodes that
are not already connected.  So if you're a node who isn't yet connected to the
network, you'll ping the switching service and find and connect to one node
who's already in the network. Then immediately you'll start receiving
connection information from other nodes in the network and you'll rapidly
bolster your connectivity.

Once a node is connected to the network, it slows way down on its checking in
with the switchboard. This helps regulate traffic to the switchboard while ensuring
a speedy initial connection with the network. Once that initial connection is made,
the node doesn't need to communicate with the switchboard at all, except to help
future nodes discover the network.

The switching service has negligable processing and memory footprints. It
operates only in memory, it doesn't need a database or write to disk in any
way. The switching service will be exchanging small JSON data with various
nodes in the network so it will use some small bandwidth. But it's important to
note that this is not anything like a cryptocurrency miner, the resource usage
of the switching service is meant to be as small as possible.

One service can handle multiple apps so you will probably not have to run one.
However if you do want to run a switching service, a node.js implementation is
available [here](//github.com/browser-network/switchboard).

## Installation

```sh
npm install @browser-network/network
```

or

```html
<script src="//unpkg.com/@browser-network/network/umd/network.min.js"></script>
```

## Quick Start

This is about the simplest app I could come up with - it lets you send and see
messages in the browser console.

```html
<!doctype html>

<html lang="en">
  <body>
    <script src="//unpkg.com/@browser-network/network/umd/network.min.js"></script>
    <script>

      const network = window.network = new Network.default({
        switchAddress: 'http://localhost:5678', // Run npx `@browser-network/switchboard` to get this running locally
        address: 'my-address-' + Date.now(), // Each window should have its own address, hence the Date.now()
        networkId: 'test-network' // Everyone using this id on the same switchboard will receive messages from each other
      })

      network.on('message', console.log)

      let counter = 0
      setInterval(() => {
        counter += 1

        network.broadcast({
          // Fer message differentiation
          type: 'amazing-hello-message',

          // Pass around data
          data: 'This is message number ' + counter,

          // identifier for the library or subsystem using this message.
          // Allows for a complex system to not have to worry about message
          // type collisions, or to be bombarded by network or library level
          // messages.
          appId: 'my-cool-app-id'
        })
      }, 1000)

    </script>
  </body>
</html>
```

Copy and paste that html into some html file of your choosing on your machine.
Then in one terminal:

```sh
npx @browser-network/switchboard
```

And in at least two more, open your html file. You should start to see messages being
passed back and forth in the console.

## Usage

First up, instantiate a Network.

```ts
// If you're cool bringing Browserify into your build process, you can require
// these straight up:
import Network from '@browser-network/network'
import { generateSecret } from '@browser-network/crypto'

// However, if you don't want to use Browserify in your build, and you're cool
// with statically linking to these libraries (which means any libraries you and
// Network share will be duplicated in your final build), you can do this, which
// is what I normally do using Network:
import type Network from '@browser-network/network'
import type { generateSecret as GenerateSecret } from '@browser-network/crypto'

const Net = require('@browser-network/network/umd/network').default as typeof Network
const { generateSecret } = require('@browser-network/crypto/umd/crypto') as { generateSecret: typeof GenerateSecret }

// One of the goals for this library is to be really nicely typed. As such, TypeScript
// users can pass in what kind of messages they'll be sending/receiving, and the library
// will help you out a ton when sending messages and receiving them. Note when you receive
// a message, it'll always by of type `MyMessage & Message`, where `Message` is defined internally
// in Network. It's exported for convenience.
type MyMessages = {
  type: 'hello-message',
  data: { greet: 'Hello!' }
  appId: 'my-app-id'
} | {
  type: 'goodbye-message',
  data: { part: 'Goodbye :(' }
  appId: 'my-app-id'
}

// `new Net` if you're statically linking Network, otherwise if you're importing like regular, `new Network`.
const network = new Net<MyMessages>({
  // default address of switchboard
  switchAddress: 'http://localhost:5678',

  // By passing in secret instead of `address`, we're telling network to cryptographically ensure all messages
  // against spoofing. For a less secure network but a little performance gain, pass in `address` instead, with
  // a unique address per node.
  secret: generateSecret(),

  // This needs to be unique enough to avoid collisions between different apps. If your `networkId`
  // is the same as some other app that's using the same switchboard, the two apps will start to
  // hear each other's messages!
  networkId: 'a87wyr-awfhoiaw7yr-3hikauweawef-ryaiw73yriawrh-faweflawe',

  // See more below...
  config: {}
})
```

See the [network config type](src/NetworkConfig.d.ts) for more info on the config object.

---

Network is essentially a message event emitter, so listening for messages will
be your main interaction with the network.

```ts
...

network.on('message', (mes) => {
  // You'll usually want to ensure the message is for your app. It's
  // just a way to namespace your messages amongst the sea of other
  // messages on the network.
  if (mes.appId !== myAppId) return

  // Now you can specify that this message is one of yours. I'd like this to
  // be a little cleaner and not require this specification, but the lack of runtime types
  // makes it hard:
  const message = mes as MyMessage // MyMessage is declared above

  switch (message.type) {
    case 'hello-message': {
      console.log(message.data.greet)
      break
    }
    case 'goodbye-message': {
      console.log(message.data.part)
      break
    }
  }
})
```

See more about [the Message type](src/Message.d.ts)

Aside from listening to messages, you'll of course also want to send messages:

```ts
network.broadcast({
  type: 'hello-message',
  appId: 'my-app-id',
  data: { greet: 'Hello!' }
})
```

The network will fill in all properties from `Message` that were not passed in aside
from what's above, which is required.

---

Network also exposes a getter to see all of the connections currently established:

```ts
network.activeConnections // -> Connection[]
```

See more about [the Connection type](src/Connection.d.ts)

## Building

If you're building with this project for the browser, the best way to build
your project, (and how this project builds its CDN exports), is with
[Browserify](https://browserify.org/).

See the [package.json](./package.json) for how this project builds for CDN vs
ESM library style.

TODO
* Conditional messaging - a preflight is sent before sending a bigger message
  asking if a node wants to accept it. A broken boundary is rude.
* Tunable involvement parameters - allow network / disc usage to be modulated
* Assess how much of our inter peer data could be represented with buffers
* if a broadcast is made with a specific address, and we're connected to that address,
  just go ahead and send directly to that address instead of broadcasting to everyone.
* Log message config param - toggle for whether to respect log messages. Might be
  a security vulnerability.
* Ability to export an offer/answer into an easily exchanged, reasonably sized string.
  This would allow any switch at all to be used to create a connection, easily, breaking
  the reliance on any specific switchboard mechanism.
