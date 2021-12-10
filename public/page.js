/** Nucleo controlador de la interfaz UI */
const vm = new Vue ({
  el: '#vue-instance',
  data () {
    return {
      cliente: null,
      socket: null,
      originPublicKey: null,
      destinationPublicKey: null,
      messages: [],
      notifications: [],
      currentRoom: null,
      pendingRoom: Math.floor(Math.random()*1000),
      draft: ''
    }
  },
  async created () {
    this.addNotification('Bienvenido, generando llaves...')

    // INICIA EL HILO
    this.cliente = new Worker('ClienteRunner.js')

    // GENERA UN PAR DE LLAVES Y SE UNE A LA SALA POR DEFECTO
    this.originPublicKey = await this.getWebWorkerResponse('generate-keys')
    this.addNotification(`Llaves generadas - ${this.getKeySnippet(this.originPublicKey)}`)

    // INICIALIZA EL SOCKET
    this.socket = io()
    this.setupSocketListeners()
  },
  methods: {
    /** SETEA EL SOCKET Y LOS EVENTOS LISTENERS */
    setupSocketListeners () {
      // AUTOMATICAMENTE SE UNE A UNA SALA POR DEFECTO
      this.socket.on('connect', () => {
        this.addNotification('Conectado al servidor.')
        this.joinRoom()
      })

      // NOTIFICA AL USUARIO QUE HA PERDIDO LA CONEXIÓN
      this.socket.on('disconnect', () => this.addNotification('Conexión perdida.'))

      // DESENCRIPTA LOS MENSAJES RECIBIDOS
      this.socket.on('MESSAGE', async (message) => {
        // SOLO DESENCRIPTA MENSAJES QUE COINCIDEN CON LA LLAVE PUBLICA DEL CLIENTE
        if (message.recipient === this.originPublicKey) {
          // DESENCRIPTA EL MENSAJE Y LO MUESTRA EN LA SALA DE CHAT
          message.text = await this.getWebWorkerResponse('decrypt', message.text)
          this.messages.push(message)
        }
      })

      // CUANDO UN USUARIO ENTRA EN LA SALA RECIBE LA LLAVE PUBLICA DEL OTRO
      this.socket.on('NEW_CONNECTION', () => {
        this.addNotification('Otro usuario ha entrado en la sala.')
        this.sendPublicKey()
      })

      // TRANSMITE LA LLAVE PUBLICA CUANDO EL CLIENTE ENTRA EN LA SALA
      this.socket.on('ROOM_JOINED', (newRoom) => {
        this.currentRoom = newRoom
        this.addNotification(`Has entrado a la sala. - ${this.currentRoom}`)
        this.sendPublicKey()
      })

      // GUARDA LA LLAVE PUBLICA DEL DESTINO CUANDO INGRESA A LA SALA
      this.socket.on('PUBLIC_KEY', (key) => {
        this.addNotification(`Llave pública recibida - ${this.getKeySnippet(key)}`)
        this.destinationPublicKey = key
      })

      // LIMPIA LAS LLAVES DE DESTINO CUANDO EL CLIENTE DEJA LA SALA
      this.socket.on('user disconnected', () => {
        this.notify(`Usuario desconectado - ${this.getKeySnippet(this.destinationKey)}`)
        this.destinationPublicKey = null
      })

      // NOTIFICA AL CLIENTE QUE LA SALA YA ESTÁ LLENA
      this.socket.on('ROOM_FULL', () => {
        this.addNotification(`No te puedes unir a ${this.pendingRoom}, la sala está llena.`)

        // SE UNE A UNA NUEVA SALA POR DEFECTO, DE MANERA RANDOM
        this.pendingRoom = Math.floor(Math.random() * 1000)
        this.joinRoom()
      })

      // NOTIFICA A LA SALA QUE ALGUIEN ESTÁ INTENTANDO ENTRAR
      this.socket.on('INTRUSION_ATTEMPT', () => {
        this.addNotification('Un tercer usuario está intentando entrar a la sala.')
      })
    },

    /** PROCESO DE ENCRIPTADO DEL MENSAJE */
    async sendMessage () {
      // NO ENVIA LOS MENSAJES SI EL ESPACIO ESTÁ EN BLANCO
      if (!this.draft || this.draft === '') { return }

      // USA DATOS INMUTABLES PARA EVITAR PERDIDA O INFORMACIÓN MEZCLADA
      let message = Immutable.Map({
        text: this.draft,
        recipient: this.destinationPublicKey,
        sender: this.originPublicKey
      })

      // RESETEA EL INPUT DE MENSAJES
      this.draft = ''

      // AÑADE EL MENSAJE ENVIADO POR EL CLIENTE AL CHAT
      this.addMessage(message.toObject())

      if (this.destinationPublicKey) {
        // ENCRIPTA EL MENSAJE CON LA LLAVE DEL DESTINATARIO
        const encryptedText = await this.getWebWorkerResponse(
          'encrypt', [ message.get('text'), this.destinationPublicKey ])
        const encryptedMsg = message.set('text', encryptedText)

        // EMITE EL MENSAJE ENCRIPTADO
        this.socket.emit('MESSAGE', encryptedMsg.toObject())
      }
    },

    /** PROCESO PARA UNIRSE A LA SALA */
    joinRoom () {
      if (this.pendingRoom !== this.currentRoom && this.originPublicKey) {
        this.addNotification(`Conectando a la sala - ${this.pendingRoom}`)

        // RESETEA LAS VARIABLES 
        this.messages = []
        this.destinationPublicKey = null

        // EMITE SOLICITUD DE UNIRSE A LA SALA
        this.socket.emit('JOIN', this.pendingRoom)
      }
    },

    /** AGREGA EL MENSAJE A LA SALA CON UN SCROLL */
    addMessage (message) {
      this.messages.push(message)
      this.autoscroll(this.$refs.chatContainer)
    },

    /** AGREGA LOS MENSAJES A LA BARRA DE NOTIFICACIONES */
    addNotification (message) {
      const timestamp = new Date().toLocaleTimeString()
      this.notifications.push({ message, timestamp })
      this.autoscroll(this.$refs.notificationContainer)
    },

    /** Post a message to the webworker, and return a promise that will resolve with the response.  */
    getWebWorkerResponse (messageType, messagePayload) {
      return new Promise((resolve, reject) => {
        // Generate a random message id to identify the corresponding event callback
        const messageId = Math.floor(Math.random() * 100000)

        // Post the message to the webworker
        this.cliente.postMessage([messageType, messageId].concat(messagePayload))

        // Create a handler for the webworker message event
        const handler = function (e) {
          // Only handle messages with the matching message id
          if (e.data[0] === messageId) {
            // Remove the event listener once the listener has been called.
            e.currentTarget.removeEventListener(e.type, handler)

            // Resolve the promise with the message payload.
            resolve(e.data[1])
          }
        }

        // Assign the handler to the webworker 'message' event.
        this.cliente.addEventListener('message', handler)
      })
    },

    /** COMPARTE LA LLAVE PUBLICA A LOS CLIENTES DE LA SALA */
    sendPublicKey () {
      if (this.originPublicKey) {
        this.socket.emit('PUBLIC_KEY', this.originPublicKey)
      }
    },

    /** Get key snippet for display purposes */
    getKeySnippet (key) {
      return key.slice(400, 416)
    },

    /** Autoscoll DOM element to bottom */
    autoscroll (element) {
      if (element) { element.scrollTop = element.scrollHeight }
    }
  }
})
