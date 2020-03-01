const app = require("http").createServer(handler);
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");

const wss = new WebSocket.Server({
  server: app
});

const rooms = { public: [] };
const games = [];
const lobby = [];

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
      case "create-game":
        {
          createGameHandler(socket, payload);
        }
        break;
      case "join-game":
        {
          joinRoomHandler(socket, payload);
        }
        break;
      case "public":
        {
          if (payload.text !== "") {
            publicMessageHandler(socket, payload);
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
function socketConnected(socket) {
  socket.id = uuidv4();
  // join personal room
  rooms[socket.id] = [socket];

  // join public chat channel
  rooms["public"].push(socket);

  const connectedMessage = messageMaker("connected", { id: socket.id });

  sendToMe(socket, connectedMessage);

  const userlistMessage = messageMaker("userlist", {
    users: [...wss.clients].map(client => client.id)
  });
  sendToAll(wss, userlistMessage);
}

function createGameHandler(socket, payload) {
  const { name, public } = payload;
  const game = {
    name,
    id: uuidv4(),
    players: [socket.id],
    status: "WAITING",
    spectators: [],
    timestamp: Date.now()
  };

  games[game.id] = game; // add game to the list of active games
  rooms[game.id] = [socket]; // add the user to the room for that game
  if (public) {
    lobby.push(game.id); // the game is public, so add its id to the list of public games
    sendLobbyHandler();
  }
}

function sendLobbyHandler() {
  // Only send public games to the lobby
  let payload = [];
  for (gameId of lobby) {
    payload.push(games[gameId]);
  }

  sendToRoom("public", messageMaker("refresh-games", { games: payload }));
}

function joinRoomHandler(socket, payload) {
  const { gameId } = payload;
  if (games[gameId]["players"].length > 2) {
    // add user to spectators
    games[gameId]["spectators"] = [...games[gameId]["spectators"], socket.id];
  } else {
    if (gameId in games) {
      // add users to players
      games[gameId]["players"] = [...games[gameId]["players"], socket.id];
    }
  }
}

function publicMessageHandler(socket, payload) {
  const message = messageMaker("public", {
    ...payload,
    sender: socket.id,
    timestamp: Date.now()
  });

  sendToRoom("public", message);
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

function sendToAll(server, message) {
  console.log(message);
  for (const client of server.clients) {
    if (client.readyState === WebSocket.OPEN) {
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
    console.log("ROOM DOES NOT EXIST");
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

app.listen(3000);
console.log("Listening on port 3000...");

// function sendToOthers(server, socket, message) {
//   console.log("send to others");
//   for (const client of server.clients) {
//     if (client.id !== socket.id && client.readyState === WebSocket.OPEN) {
//       client.send(message);
//     }
//   }
// }
