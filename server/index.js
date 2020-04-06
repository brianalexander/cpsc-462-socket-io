const express = require("express");
const cors = require("cors");
const app = express();
const server = require("http").createServer(app);
const WebSocket = require("ws");

const jwtLib = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

const JWT_SECRET = "THIS_IS_A_TEST";

const wss = new WebSocket.Server({
  server
});

app.use(express.json());
app.use(cors());

const username_to_socket = {};
const socket_to_username = {};

const rooms = { public: [] };
const users = {};
const games = [];
const lobby = [];

app.post("/user", (req, res, next) => {
  const { username } = req.body;
  if (username in users) {
    if (Date.now() - users[username] > 5000) {
      delete users[username];
    } else {
      return res.status(409).json({ error: "Username taken." });
    }
  }

  users[username] = Date.now();
  return res.json(
    jwtLib.sign({ data: req.body }, JWT_SECRET, { expiresIn: "15m" })
  );
});

app.post("/tictactoe", (req, res, next) => {
  const { jwt, roomName } = req.body;
  try {
    const { username } = jwtLib.verify(jwt, JWT_SECRET);

    const game = {
      roomName,
      type: "tictactoe",
      id: uuidv4(),
      players: [username],
      status: "waiting",
      spectators: [],
      timestamp: Date.now()
    };

    games[game.id] = game; // add game to the list of active games
    rooms[game.id] = [socket]; // add the user to the room for that game
    if (public) {
      lobby.push(game.id); // the game is public, so add its id to the list of public games
      sendLobbyHandler();
    }

    return res.json(
      jwt.sign({ data: req.body }, JWT_SECRET, { expiresIn: "15m" })
    );
  } catch (error) {
    return res.status(409).json({ error: "Invalid JWT." });
  }
});

wss.on("connection", socket => {
  // Perform authenication
  socketConnected(socket);

  // Handle messages
  socket.on("message", data => {
    console.log("message before parse: ", data);
    const { type, payload } = JSON.parse(data);
    console.log("MESSAGE: ", type, payload);
    switch (type) {
      case "register-user":
        {
          registerUserHandler(socket, payload);
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
}

function registerUserHandler(socket, payload) {
  const { jwt } = payload;
  try {
    const { username } = jwtLib.verify(jwt, JWT_SECRET);
    username_to_socket[username] = socket.id;
    socket_to_username[socket.id] = username;

    const connectedMessage = messageMaker("connected", { username });

    // sendToMe(socket, connectedMessage);

    const userlistMessage = messageMaker("userlist", {
      users: [...wss.clients].map(client => socket_to_username[client.id])
    });
    sendToAll(wss, userlistMessage);
  } catch (error) {
    console.log(error);
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

server.listen(3000);
console.log("Listening on port 3000...");

// function sendToOthers(server, socket, message) {
//   console.log("send to others");
//   for (const client of server.clients) {
//     if (client.id !== socket.id && client.readyState === WebSocket.OPEN) {
//       client.send(message);
//     }
//   }
// }
