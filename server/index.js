const express = require("express");
const cors = require("cors");
const app = express();
const server = require("http").createServer(app);
const WebSocket = require("ws");

const jwtLib = require("jsonwebtoken");
const jwtDecode = require("jwt-decode");
const { v4: uuidv4 } = require("uuid");

const JWT_SECRET = "THIS_IS_A_TEST";

const wss = new WebSocket.Server({
  server,
});

app.use(express.json());
app.use(cors());

const rooms = {};
const users = {};
const games = {};

// setInterval(() => {
//   console.log("USERS", users);
//   console.log("ROOMS", rooms);
// }, 5000);

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

let game_id = -1;

function nextId() {
  game_id = game_id + 1;
  return game_id;
}

app.post("/tictactoe", (req, res, next) => {
  console.log("received");
  const { jwt, name } = req.body;
  try {
    const { username } = jwtLib.verify(jwt, JWT_SECRET);

    const game = {
      name: name,
      type: "tictactoe",
      status: "waiting",
      id: nextId(),
      players: [],
      stepNumber: 0,
      xIsNext: true,
      history: [
        {
          squares: Array(9).fill(null),
        },
      ],
      spectators: [],
      timestamp: Date.now(),
    };

    games[game.id] = game; // add game to the list of active games
    rooms[game.id] = [];

    return res.json(game);
  } catch (error) {
    console.log(error);
    return res.status(409).json({ error: "Invalid JWT." });
  }
});

wss.on("connection", (socket) => {
  // Perform authenication
  socketConnected(socket);

  // Handle messages
  socket.on("message", (data) => {
    // console.log("message before parse: ", data);
    const { type, payload } = JSON.parse(data);
    // console.log("MESSAGE: ", type, payload);
    switch (type) {
      case "connect-game":
        {
          connectGameHandler(socket, payload);
        }
        break;
      case "game-state":
        {
          gameStateHandler(socket, payload);
        }
        break;
    }
  });

  // Handle disconnect
  socket.on("close", (code, reason) => {
    console.log("USER DISCONNECT: ", socket.id, code, reason);
  });
});

// =====
// Utility Functions
// =====
function socketConnected(socket) {
  socket.id = uuidv4();

  // join personal room
  rooms[socket.id] = [];
}

function connectGameHandler(socket, payload) {
  const { jwt } = payload;
  console.log("INCOMING JWT", jwt);
  let userJwt;
  let user;

  // if jwt is valid -> it's a returning player, get previous game
  // TODO: ADD USER TO GAME ROOM

  if (jwt !== null && jwt !== undefined) {
    const { exp, data } = jwtDecode(jwt);
    user = data.user;
    userJwt = jwt;
  }

  // if jwt is invalid or null -> make a new game
  if (jwt === null || jwt === undefined) {
    user = socket.id;
    // CREATE JWT FOR USER
    userJwt = jwtLib.sign({ data: { user } }, JWT_SECRET, {
      expiresIn: "15m",
    });
  }

  if (games[user] === undefined) {
    // CREATE GAME
    const game = {
      id: nextId(),
      room: user,
      stepNumber: 0,
      xIsNext: true,
      history: [
        {
          squares: Array(9).fill(null),
        },
      ],
      timestamp: Date.now(),
    };

    // save game state
    games[user] = game;

    // add user to room
    rooms[user].push(socket);

    // TODO: SEND WS MESSAGE TO PYTHON SERVER TO CREATE AI AND CONNECT
    // TODO: SET TIMEOUT ON MESSAGE.  ON RESPONSE CANCEL TIMEOUT AND UPDATE USERS GAME
  }

  socket.send(messageMaker("connect-game-response", { jwt: userJwt }));
  console.log({ id: user, game: games[user] });
  socket.send(messageMaker("game-state", { id: user, game: games[user] }));
}

function gameStateHandler(socket, payload) {
  console.log("GAMESTATEHANDLER");
  const { jwt, state } = payload;

  const { exp, data } = jwtDecode(jwt);
  const user = data.user;

  console.log(games[user]);

  // UPDATE GAME STATE
  games[user] = { ...games[user], ...state };

  // FORWARD TO ROOM
  sendToRoom(user, messageMaker("game-state", { id: user, game: games[user] }));
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

// function registerUserHandler(socket, payload) {
//   console.log("registerUserHandler", socket.id);
//   const { jwt } = payload;
//   try {
//     const { data } = jwtLib.verify(jwt, JWT_SECRET);
//     const { username } = data;

//     username_to_socket[username] = socket;
//     socket_to_username[socket.id] = username;

//     // const connectedMessage = messageMaker("connected", { username });

//     // sendToMe(socket, connectedMessage);

//     const userlistMessage = messageMaker("userlist", {
//       users: [...wss.clients].map((client) => socket_to_username[client.id]),
//     });
//     sendToAll(wss, userlistMessage);
//   } catch (error) {
//     console.log(error);
//   }
// }

// function joinGameHandler(socket, payload) {
//   const { id, jwt } = payload;
//   try {
//     const { data } = jwtLib.verify(jwt, JWT_SECRET);
//     const { username } = data;
//     console.log("USERNAME");
//     // console.log('U TO S', username_to_socket)

//     const socket = username_to_socket[username];
//     rooms[id].push(socket);
//   } catch (error) {
//     console.log(error);
//   }
// }
