self.window = self // REQUERIDO POR LA LIBRERIA JSENCRYPT

// IMPORTA LA LIBRERIA JSENCRYPT
self.importScripts('https://cdnjs.cloudflare.com/ajax/libs/jsencrypt/2.3.1/jsencrypt.min.js');

let crypt = null
let privateKey = null

/** WEBWORKER DE LOS MENSAJES ENVIADOS */
onmessage = function(e) {
  const [ messageType, messageId, text, key ] = e.data
  let result
  switch (messageType) {
    case 'generate-keys':
      result = generateKeypair()
      break
    case 'encrypt':
      result = encrypt(text, key)
      break
    case 'decrypt':
      result = decrypt(text)
      break
  }

  // RETORNA LOS RESULTADOS A LA PANTALLA DEL CLIENTE
  postMessage([ messageId, result ])
}

/** GENERA Y ALMACENA LAS LLAVES PUBLICAS */
function generateKeypair () {
  crypt = new JSEncrypt({default_key_size: 2056})
  privateKey = crypt.getPrivateKey()

  // SOLO RETORNA LA LLAVE PUBLICA DEL USUARIO, LA PRIVADA LA MANTIENE
  return crypt.getPublicKey()
}

/** ENCRIPTA LAS CADENAS RECIBIDAS Y LAS ALMACENA JUNTO CON LA LLAVE PUBLICA DE SU EMISOR */
function encrypt (content, publicKey) {
  crypt.setKey(publicKey)
  return crypt.encrypt(content)
}

/** DESENCRIPTA LOS MENSAJES */
function decrypt (content) {
  crypt.setKey(privateKey)
  return crypt.decrypt(content)
}
