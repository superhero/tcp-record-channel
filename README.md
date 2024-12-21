# @superhero/tcp-record-channel

TCP Record Channel is a lightweight library for low-level, bidirectional TCP socket communication, supporting both plain TCP and TLS. It uses ASCII delimited encoding to transmit and decode structured records.

## Features

- **ASCII Delimited Encoding**: Encode and decode structured records with configurable delimiters.
- **TLS and Plain TCP Support**: Provides methods for creating secure and non-secure socket connections.
- **Server and Client Support**: Create servers and clients for secure or plain communication.
- **Event-Driven Architecture**: Emits events for complete records, simplifying integration into event-based systems.
- **Keep-Alive Support**: Automatically configures sockets with keep-alive settings for improved stability.
- **Broadcast Functionality**: Transmit data to multiple sockets.

## Installation

```bash
npm install @superhero/tcp-record-channel
```

## Usage

### Basic Usage

#### Server Example
```javascript
import Channel from '@superhero/tcp-record-channel';

const serverChannel = new Channel();
const serverConfig  = { cert: 'path/to/cert.pem', key: 'path/to/key.pem', ca: 'path/to/ca.pem' };

const server = serverChannel.createTlsServer(serverConfig, (clientSocket) => {
  clientSocket.authorized = true;
});

server.listen(443, () => console.log('Server listening on port 443'));

serverChannel.on('record', (record, socket) => {
  console.log('Received record:', record);
});
```

#### Client Example
```javascript
import Channel from '@superhero/tcp-record-channel';

const clientChannel = new Channel();
const clientConfig  = { host: 'localhost', port: 443, ca: 'path/to/ca.pem' };
const clientSocket  = await clientChannel.createTlsClient(clientConfig);

clientChannel.transmit(clientSocket, ['example', 'data', '123']);

clientChannel.on('record', (record) => {
  console.log('Received record from server:', record);
});
```

### Configuration

The `Channel` constructor accepts an optional configuration object:

| Option                  | Default Value | Description                              |
|-------------------------|---------------|------------------------------------------|
| `START_OF_TRANSMISSION` | `\x02`        | ASCII character to indicate ready state. |
| `RECORD_SEPARATOR`      | `\x1E`        | ASCII character to separate records.     |
| `UNIT_SEPARATOR`        | `\x1F`        | ASCII character to separate units.       |
| `KEEP_ALIVE`            | `60000`       | Keep-alive interval in milliseconds.     |

### API

#### `createTlsServer(config, onConnection)`
Creates a TLS server.
- **Parameters**:
  - `config`: TLS configuration object (e.g., `cert`, `key`, `ca`).
  - `onConnection`: Callback invoked for each client connection.
- **Returns**: `tls.Server`

#### `createNetServer(config, onConnection)`
Creates a plain TCP server.
- **Parameters**:
  - `config`: TCP configuration object.
  - `onConnection`: Callback invoked for each client connection.
- **Returns**: `net.Server`

#### `createTlsClient(config)`
Creates a TLS client.
- **Parameters**:
  - `config`: TLS connection options (e.g., `host`, `port`, `ca`).
- **Returns**: `tls.TLSSocket`

#### `createNetClient(config)`
Creates a plain TCP client.
- **Parameters**:
  - `config`: TCP connection options (e.g., `host`, `port`).
- **Returns**: `net.Socket`

#### `transmit(socket, units)`
Encodes and sends a record over a socket.
- **Parameters**:
  - `socket`: The target socket.
  - `units`: An array of strings representing the record units.

#### `broadcast(sockets, units)`
Sends a record to multiple sockets.
- **Parameters**:
  - `sockets`: An array of sockets.
  - `units`: An array of strings representing the record units.

## Events

### `record`
Emitted when a complete record is received.
- **Parameters**:
  - `units`: An array of strings representing the record.
  - `socket`: The socket from which the record was received.

## Testing

Run the test suite using:

```bash
npm test
```

The tests include scenarios for both application-level and mutual TLS authorization, handling unauthorized clients and servers, and validating record transmission.

### Test Coverage

```
▶ @superhero/tcp-record-channel
  ✔ Application Level Authorization (92.98876ms)

  ▶ Mutual TLS Authorization
    ✔ Server and Client is Authorized (15.082166ms)

    ▶ Server Unauthorized
      ✔ Missing CA (15.014342ms)
      ✔ Missing Server CA (11.170845ms)
      ✔ Missing Root CA (11.32546ms)
      ✔ Client Unauthorized by Server (10.849463ms)
    ✔ Server Unauthorized (49.865721ms)

    ▶ Client Unauthorized
      ✔ Missing root CA in the client (9.39734ms)
      ✔ Missing client CA in the client certificate chain (10.045138ms)
      ✔ Missing Root CA in the client (8.474439ms)
    ✔ Client Unauthorized (28.702489ms)
  ✔ Mutual TLS Authorization (94.056886ms)
✔ @superhero/tcp-record-channel (209.480811ms)

tests 9
suites 4
pass 9

---------------------------------------------------------------------------------------------
file            | line % | branch % | funcs % | uncovered lines
---------------------------------------------------------------------------------------------
index.js        |  84.98 |    80.95 |   86.67 | 54-58 95-101 191-198 222-224 229-234 243-251
index.test.js   | 100.00 |   100.00 |  100.00 | 
---------------------------------------------------------------------------------------------
all files       |  92.20 |    93.75 |   96.49 | 
---------------------------------------------------------------------------------------------
```

## License

This project is licensed under the MIT License.

## Contributing

Feel free to submit issues or pull requests for improvements or additional features.
