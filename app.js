const express = require('express')

//Setea el servidor de Express
const app = express()
const http = require('http').Server(app)

// Adjunta el socket para el server

const io = require('socket.io')(http)

// Crea el directorio del servidor web
app.use(express.static('public'))

/** Administar cada conexión de cada cliente cuando se conecta*/

io.on('connection', (socket) => {
  console.log(`User Connected - Socket ID ${socket.id}`)

  //Almacena la sala a la que se ha conectado el socket del cliente

  let currentRoom = null

  /** Proceso de solicitud para unirse a la sals. */

  socket.on('JOIN', (roomName) => {
    // Obtener la información de la sala de chat
    let room = io.sockets.adapter.rooms[roomName]

    //Rechaza la conexión cuando hay más de 1 (2 clientes) conexión  
    if (room && room.length > 1) {

      // Notifica al cliente que su solicitud fue rechazada

      io.to(socket.id).emit('ROOM_FULL', null)

      // Notifica a la sala que alguien más intentó entrar

      socket.broadcast.to(roomName).emit('INTRUSION_ATTEMPT', null)
    } else {
      // Deja la sala actual
      socket.leave(currentRoom)

      // Notifica cuando el cliente deja la sala

      socket.broadcast.to(currentRoom).emit('USER_DISCONNECTED', null)

      // Se une a una nueva sala

      currentRoom = roomName
      socket.join(currentRoom)

      // Notifica al usuario que se ha unido a la sala con exito

      io.to(socket.id).emit('ROOM_JOINED', currentRoom)

      // Notifica a la sala que un usuario ha ingresado

      socket.broadcast.to(currentRoom).emit('NEW_CONNECTION', null)
    }
  })

  /** Transmitir un mensaje recibido a la sala */
  socket.on('MESSAGE', (msg) => {
    console.log(`New Message - ${msg.text}`)
    socket.broadcast.to(currentRoom).emit('MESSAGE', msg)
  })

  /** Transmitir una notificacion de nueva llave publica a la sala */
  socket.on('PUBLIC_KEY', (key) => {
    socket.broadcast.to(currentRoom).emit('PUBLIC_KEY', key)
  })

  /** Transmite una notificacion de desconexión en la sala */
  socket.on('disconnect', () => {
    socket.broadcast.to(currentRoom).emit('USER_DISCONNECTED', null)
  })
})

// Inicia el servidor
const port = process.env.PORT || 3000
http.listen(port, () => {
  console.log(`Chat server listening on port ${port}.`)
})
