import OpenSSL from '@superhero/openssl'
import Channel from '@superhero/tcp-record-channel'
import assert  from 'node:assert'
import { suite, test, beforeEach, afterEach } from 'node:test'

suite('@superhero/tcp-record-channel', async () =>
{
  const 
    openssl     = new OpenSSL(),
    rootCA      = await openssl.root(),
    serverICA   = await openssl.intermediate(rootCA),
    serverLeaf  = await openssl.leaf(serverICA),
    serverChain = serverLeaf.cert + serverICA.cert

  test('Application Level Authorization', async () =>
  {
    const
      serverConfig  = { cert:serverChain, key:serverLeaf.key, ca:rootCA.cert },
      serverChannel = new Channel(),
      serverSocket  = serverChannel.createTlsServer(serverConfig, (clientSocket) => clientSocket.authorized = true)

    serverSocket.listen()

    const
      host          = 'localhost',
      port          = serverSocket.address().port,
      clientChannel = new Channel(),
      clientConfig  = { ca:rootCA.cert, host, port },
      clientSocket  = await clientChannel.createTlsClient(clientConfig)

    clientChannel.transmit(clientSocket, [ 'client', 'test', '123' ])
    const clientRecord = await new Promise((resolve) => serverChannel.on('record', resolve))
    assert.deepEqual(clientRecord, [ 'client', 'test', '123' ])

    clientSocket.end()
    serverSocket.close()
  })

  suite('Mutual TLS Authorization', async () =>
  {
    const
      clientICA   = await openssl.intermediate(rootCA),
      clientLeaf  = await openssl.leaf(clientICA),
      clientChain = clientLeaf.cert + clientICA.cert

    test('Server and Client is Authorized', async () =>
    {
      const
        serverConfig  = { cert:serverChain, key:serverLeaf.key, ca:rootCA.cert, requestCert:true },
        serverChannel = new Channel(),
        group         = [],
        serverSocket  = serverChannel.createTlsServer(serverConfig, (clientSocket) => group.push(clientSocket))
  
      serverSocket.listen()
  
      const
        host          = 'localhost',
        port          = serverSocket.address().port,
        clientChannel = new Channel(),
        clientConfig  = { cert:clientChain, key:clientLeaf.key, ca:rootCA.cert, host, port },
        clientSocket  = await clientChannel.createTlsClient(clientConfig)
  
      clientChannel.transmit(clientSocket, [ 'client', 'test', '123' ])
      const clientRecord = await new Promise((resolve) => serverChannel.on('record', resolve))
      assert.deepEqual(clientRecord, [ 'client', 'test', '123' ])
  
      serverChannel.broadcast(group, [ 'server', 'test', '456' ])
      const serverRecord = await new Promise((resolve) => clientChannel.on('record', resolve))
      assert.deepEqual(serverRecord, [ 'server', 'test', '456' ])
  
      clientSocket.end()
      serverSocket.close()
    })

    suite('Server Unauthorized', () =>
    {
      const host = 'localhost'

      test('Missing CA', async () =>
      {
        const
          serverConfig  = { cert:serverChain, key:serverLeaf.key, requestCert:true },
          serverChannel = new Channel(),
          serverSocket  = serverChannel.createTlsServer(serverConfig)

        assert.ok(serverSocket)
        await new Promise((resolve) => serverSocket.listen(resolve))

        const
          port          = serverSocket.address().port,
          clientConfig  = { cert:clientChain, key:clientLeaf.key, ca:rootCA.cert, host, port },
          clientChannel = new Channel()

        await assert.rejects(
          clientChannel.createTlsClient(clientConfig),
          (error) => 
          {
            assert.equal(error.code, 'E_TCP_RECORD_CHANNEL_CLIENT_CONNECT')
            assert.equal(error.cause.code, 'E_TCP_RECORD_CHANNEL_CLOSED_BEFORE_READY')
            return true
          })

        serverSocket.close()
      })
  
      test('Missing Server Intermediate CA', async () =>
      {
        const 
          serverConfig  = { cert:serverLeaf.cert, key:serverLeaf.key, ca:rootCA.cert },
          serverChannel = new Channel(),
          serverSocket  = serverChannel.createTlsServer(serverConfig)
    
        assert.ok(serverSocket)
        await new Promise((resolve) => serverSocket.listen(resolve))

        const
          port          = serverSocket.address().port,
          clientConfig  = { cert:clientChain, key:clientLeaf.key, ca:rootCA.cert, host, port },
          clientChannel = new Channel()

        await assert.rejects(
          clientChannel.createTlsClient(clientConfig),
          (error) => 
          {
            assert.equal(error.code, 'E_TCP_RECORD_CHANNEL_CLIENT_CONNECT')
            assert.equal(error.cause.code, 'UNABLE_TO_VERIFY_LEAF_SIGNATURE')
            return true
          })

        serverSocket.close()
      })
  
      test('Missing Root CA', async () =>
      {
        const
          serverConfig  = { cert:serverChain, key:serverLeaf.key },
          serverChannel = new Channel(),
          serverSocket  = serverChannel.createTlsServer(serverConfig)
    
        assert.ok(serverSocket)
        await new Promise((resolve) => serverSocket.listen(resolve))

        const
          port          = serverSocket.address().port,
          clientConfig  = { cert:clientChain, key:clientLeaf.key, ca:rootCA.cert, host, port },
          clientChannel = new Channel()
          
        await assert.rejects(
          clientChannel.createTlsClient(clientConfig),
          (error) => 
          {
            assert.equal(error.code, 'E_TCP_RECORD_CHANNEL_CLIENT_CONNECT')
            assert.equal(error.cause.code, 'E_TCP_RECORD_CHANNEL_CLOSED_BEFORE_READY')
            return true
          })

        serverSocket.close()
      })
  
      test('Client Unauthorized by Server', async () =>
      {
        const
          serverConfig  = { cert:serverChain, key:serverLeaf.key, ca:rootCA.cert },
          serverChannel = new Channel(),
          serverSocket  = serverChannel.createTlsServer(serverConfig, (socket) => socket.authorized = false)

        assert.ok(serverSocket)
        await new Promise((resolve) => serverSocket.listen(resolve))

        const
          port          = serverSocket.address().port,
          clientConfig  = { cert:clientChain, key:clientLeaf.key, ca:rootCA.cert, host, port },
          clientChannel = new Channel()
          
        await assert.rejects(
          clientChannel.createTlsClient(clientConfig),
          (error) => 
          {
            assert.equal(error.code, 'E_TCP_RECORD_CHANNEL_CLIENT_CONNECT')
            assert.equal(error.cause.code, 'E_TCP_RECORD_CHANNEL_CLOSED_BEFORE_READY')
            return true
          })

        serverSocket.close()
      })
    })
  
    suite('Client Unauthorized', () =>
    {
      const 
        serverConfig  = { cert:serverChain, key:serverLeaf.key, ca:rootCA.cert },
        serverChannel = new Channel(),
        serverSocket  = serverChannel.createTlsServer(serverConfig),
        host          = 'localhost'
  
      let port
  
      beforeEach(() => new Promise((resolve) => serverSocket.listen(() => { port = serverSocket.address().port; resolve() })))
      afterEach( () => new Promise((resolve) => serverSocket.close (resolve)))
  
      test('Missing root CA in the client', async () =>
      {
        const
          clientConfig  = { cert:clientChain, key:clientLeaf.key, host, port },
          clientChannel = new Channel()

        await assert.rejects(
          clientChannel.createTlsClient(clientConfig),
          (error) => 
          {
            assert.equal(error.code, 'E_TCP_RECORD_CHANNEL_CLIENT_CONNECT')
            assert.equal(error.cause.code, 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY')
            return true
          })
      })
  
      test('Missing client CA in the client certificate chain', async () =>
      {
        const
          clientConfig  = { cert:clientLeaf.cert, key:clientLeaf.key, ca:rootCA.cert, host, port },
          clientChannel = new Channel()
          
        await assert.rejects(
          clientChannel.createTlsClient(clientConfig),
          (error) => 
          {
            assert.equal(error.code, 'E_TCP_RECORD_CHANNEL_CLIENT_CONNECT')
            assert.equal(error.cause.code, 'E_TCP_RECORD_CHANNEL_CLOSED_BEFORE_READY')
            return true
          })
      })
  
      test('Missing Root CA in the client', async () =>
      {
        const
          clientConfig  = { cert:clientChain, key:clientLeaf.key, host, port },
          clientChannel = new Channel()

        await assert.rejects(
          clientChannel.createTlsClient(clientConfig),
          (error) => 
          {
            assert.equal(error.code, 'E_TCP_RECORD_CHANNEL_CLIENT_CONNECT')
            assert.equal(error.cause.code, 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY')
            return true
          })
      })
    })
  })
})