import tls          from 'node:tls'
import net          from 'node:net'
import EventEmitter from 'node:events'

/**
 * A class that provides a simple interface for transmitting and receiving
 * records over a TLS socket.
 * 
 * @extends EventEmitter
 * @emits record
 */
export default class Channel extends EventEmitter
{
  #buffer = new WeakMap

  /**
   * Default to ASCII Delimited Encoding.
   * 
   * @param {Object} [config]
   * @param {string} [config.RECORD_SEPARATOR]  default: '\x1E'
   * @param {string} [config.UNIT_SEPARATOR]    default: '\x1F'
   * @param {number} [config.KEEP_ALIVE]        default: 60e3
   */
  constructor(config)
  {
    super()

    config = Object.assign(
    {
      'RECORD_SEPARATOR' : '\x1E',
      'UNIT_SEPARATOR'   : '\x1F',
      'KEEP_ALIVE'       : 60e3
    }, config)

    this.config = config
  }

  /**
   * @see https://nodejs.org/api/tls.html#class-tlsserver
   * @returns {tls.Server}
   */
  createTlsServer(config, onConnection)
  {
    const server = tls.createServer(config)
    server.on('secureConnection', this.onConnection.bind(this, onConnection))
    return server
  }

  /**
   * @see https://nodejs.org/api/net.html#net_class_net_server
   * @returns {net.Server}
   */
  createNetServer(config, onConnection)
  {
    const server = net.createServer(config)
    server.on('connection', this.onConnection.bind(this, onConnection))
    return server
  }

  async onConnection(plugin, socket)
  {    
    plugin && await plugin(socket)

    if(socket.authorized)
    {
      this.init(socket)
      socket.on('data', this.buffer.bind(this, socket))
      socket.setKeepAlive(true, this.config.KEEP_ALIVE)
      socket.resume()
    }
    else
    {
      socket.destroy()
    }
  }

  /**
   * @see https://nodejs.org/api/tls.html#class-tlstlssocket
   * @returns {tls.TLSSocket}
   */
  createTlsClient(config)
  {
    const socket = tls.connect(config)
    this.init(socket)
    socket.on('data', this.buffer.bind(this, socket))
    socket.setKeepAlive(true, this.config.KEEP_ALIVE)
    return socket
  }

  /**
   * @see https://nodejs.org/api/net.html#net_class_net_socket
   * @returns {net.Socket}
   */
  createNetClient(config)
  {
    const socket = net.connect(config)
    this.init(socket)
    socket.on('data', this.buffer.bind(this, socket))
    socket.setKeepAlive(true, this.config.KEEP_ALIVE)
    return socket
  }

  /**
   * Initiate the weak map for buffered message fragments
   * with an empty buffer instance to prevent repeated conditions 
   * on data processing.
   * 
   * @param {tls.TLSSocket} socket
   * @returns {void}
   */
  init(socket)
  {
    this.#buffer.set(socket, Buffer.from(''))
  }

  /**
   * Encodes a record from units.
   * 
   * @param {string[]} units
   * @returns {Buffer} record
   */
  encode(units)
  {
    const record = units.join(this.config.UNIT_SEPARATOR)
    return Buffer.from(record + this.config.RECORD_SEPARATOR)
  }

  /**
   * Generates the buffered units of the record once the record separator is found in the buffer.
   * 
   * @param {tls.TLSSocket} socket
   * @param {Buffer} buffer
   * @returns {Generator} 
   */
  * decode(socket, buffer)
  {
    this.#buffer.set(socket, Buffer.concat([ this.#buffer.get(socket), buffer ]))

    for(let index = this.#findRecordSeparator(socket); -1 !== index; 
            index = this.#findRecordSeparator(socket))
    {
      const 
        buffered = this.#buffer.get(socket),
        record   = buffered.slice(0, index),
        units    = record.toString().split(this.config.UNIT_SEPARATOR)

      this.#buffer.set(socket, buffered.slice(index + 1))

      yield units
    }
  }

  #findRecordSeparator(socket)
  {
    return this.#buffer.get(socket).indexOf(this.config.RECORD_SEPARATOR)
  }

  /**
   * Buffers the record and emits when a complete record is found.
   * 
   * @param {tls.TLSSocket} socket
   * @param {Buffer} buffer
   * @returns {void}
   * @emits record
   */
  buffer(socket, buffer)
  {
    for(const units of this.decode(socket, buffer))
    {
      this.emit('record', units, socket)
    }
  }

  /**
   * Encodes and transmits units as a transmittable record over a TLS socket.
   * 
   * @param {tls.TLSSocket} socket
   * @param {string[]} units
   * @returns {void}
   * @throws {Error} E_TLS_TRANSMIT
   */
  transmit(socket, units)
  {
    const record = this.encode(units)

    try
    {
      this.#transmit(socket, record)
    }
    catch(error)
    {
      if('E_TLS_TRANSMIT' === error.code)
      {
        error.record = units
      }

      throw error
    }
  }

  /**
   * Encodes and transmits units as a transmittable record over all TLS sockets.
   * 
   * @param {tls.TLSSocket[]} sockets
   * @param {string[]} units
   * @returns {void}
   * @throws {Error} E_TLS_BROADCAST
   */
  broadcast(sockets, units)
  {
    const 
      reasons = [],
      record  = this.encode(units)

    for(const socket of sockets)
    {
      try
      {
        this.#transmit(socket, record)
      }
      catch(reason)
      {
        reasons.push(reason)
      }
    }

    if(reasons.length)
    {
      const error  = new Error('Could not broadcast record to all sockets')
      error.code   = 'E_TLS_BROADCAST'
      error.record = units
      error.cause  = reasons
      throw error
    }
  }

  #transmit(socket, record)
  {
    if(socket.writable)
    {
      socket.write(record)
    }
    else
    {
      const error = new Error('Could not write record to socket')
      error.code  = 'E_TLS_TRANSMIT'
      error.cause = 'Socket is not writable'
      // Define the socket property on the error object as non-enumerable.
      Object.defineProperty(error, 'socket', { value: socket })
      throw error
    }
  }
}