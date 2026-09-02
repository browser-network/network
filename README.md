# Browser Network

Browser Network is a small WebRTC peer mesh. It uses an HTTP Switchboard only
for initial peer discovery; connected peers gossip application messages.

## Installation

```sh
npm install @browser-network/network @browser-network/crypto
```

Script-tag builds expose `window.Network` and `window.Bnc`:

```html
<script src="https://unpkg.com/@browser-network/crypto/umd/crypto.min.js"></script>
<script src="https://unpkg.com/@browser-network/network/umd/network.min.js"></script>
```

## Usage

```ts
import Network from '@browser-network/network'
import { generateSecret } from '@browser-network/crypto'

const network = new Network({
  switchAddress: 'https://browser-network-switchboard.herokuapp.com/',
  networkId: 'unique-application-network-id',
  secret: generateSecret()
})

network.on('message', message => console.log(message))
network.broadcast({ type: 'hello', appId: 'my-app', data: { text: 'hello' } })
```

With UMD bundles use the constructors directly:

```js
const network = new Network({ switchAddress, networkId, secret: Bnc.generateSecret() })
```

Supplying `secret` enables signed messages and encrypted negotiation SDP. Its
derived public key is the peer address. Supplying an arbitrary `address` instead
creates an insecure network and is appropriate only for trusted/testing uses.

Call `network.teardown()` before unloading an application or disposing a peer.

## Connectivity and delivery

Browser Network is intentionally **STUN-only**. It does not operate or configure
TURN relays. Direct WebRTC connectivity can fail behind restrictive NATs,
firewalls, corporate networks, mobile networks, or when UDP/WebRTC is blocked.
Applications must tolerate unavailable peers and partitions.

Gossip is best-effort across peers connected when a message is broadcast. A live
WebRTC data channel is reliable and ordered per connection, but Browser Network
does not guarantee end-to-end delivery, global ordering, exactly-once processing,
persistence, or delivery during a partition. Duplicate relays are deduplicated
for one minute. Applications requiring receipts, durable offline delivery, or
strict ordering must implement them.

## Switchboard

The Switchboard stores short-lived in-memory negotiation records. Negotiation
submissions are idempotent within a network; recipients acknowledge records after
processing. A Switchboard restart loses pending negotiations, so peers must keep
polling/retrying and tolerate a new connection attempt.

Use the deployed service above or run your own:

```sh
cd switchboard && npm install && npm start
```

A `networkId` partitions discovery only; it is not authentication or authorization.
