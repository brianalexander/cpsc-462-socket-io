const app = require("http").createServer(handler);
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");

const wss = new WebSocket.Server({
  server: app
});

app.listen(3000);

const rooms = {};

wss.on("connection", socket => {
  // Perform authenication
  // socket.on("authenticate", msg => {});
  socketConnected(socket);

  // Handle messages
  socket.on("message", data => {
    console.log("message before parse: ", data);
    const { type, payload } = JSON.parse(data);
    console.log("MESSAGE: ", type, payload);
    switch (type) {
      case "public":
        {
          if (payload.text !== "") {
            publicMessageHandler(wss, socket, payload);
          }
        }
        break;
      case "private":
        {
          if (payload.text !== "") {
            privateMessageHandler(socket, payload);
          }
        }
        break;
    }
  });

  // Handle disconnect
  socket.on("close", (code, reason) => {
    const message = messageMaker("userlist", {
      users: [...wss.clients].map(client => client.id)
    });
    sendToAll(wss, message);
  });
});

// =====
// Utility Functions
// =====
function publicMessageHandler(wss, socket, payload) {
  const message = messageMaker("public", {
    ...payload,
    sender: socket.id,
    timestamp: Date.now()
  });

  sendToOthers(wss, socket, message);
}

function privateMessageHandler(socket, payload) {
  const { target, ...rest } = payload;
  const message = messageMaker("private", {
    ...rest,
    sender: socket.id,
    timestamp: Date.now()
  });

  sendToRoom(target, message);
}

function socketConnected(socket) {
  socket.id = uuidv4();
  rooms[socket.id] = [socket];

  const connectedMessage = messageMaker("connected", { id: socket.id });

  sendToMe(socket, connectedMessage);

  const userlistMessage = messageMaker("userlist", {
    users: [...wss.clients].map(client => client.id)
  });
  sendToAll(wss, userlistMessage);
}

function sendToAll(server, message) {
  console.log(message);
  for (const client of server.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function sendToOthers(server, socket, message) {
  console.log("send to others");
  for (const client of server.clients) {
    if (client.id !== socket.id && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function sendToMe(socket, message) {
  sendToRoom(socket.id, message);
}

function sendToRoom(room, message) {
  if (room in rooms) {
    for (user of rooms[room]) {
      user.send(message);
    }
  } else {
    console.log("USER DOES NTO EXIST");
  }
}

function messageMaker(type, payload) {
  return JSON.stringify({ type, payload });
}

function handler(req, res) {
  fs.readFile(__dirname + "/local_test.html", function(err, data) {
    if (err) {
      res.writeHead(500);
      return res.end("Error loading index.html");
    }

    res.writeHead(200);
    res.end(data);
  });
}
