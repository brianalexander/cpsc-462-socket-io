const app = require("http").createServer(handler);
const io = require("socket.io")(app);
const fs = require("fs");

app.listen(3000);

const connectedUsers = [];
const connectedIds = [];

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

io.on("connection", function(socket) {
  const user = { id: socket.id };
  // Send client the userlist
  connectedUsers.push(user);
  connectedIds.push(socket.id);
  console.log(connectedUsers);
  socket.emit("initialData", { userlist: connectedUsers });

  // Let others know client logged in.
  socket.broadcast.emit("userConnect", { user: user });

  // Perform authenication
  socket.on("authenticate", msg => {});

  // messaging
  socket.on("chat message", msg => {
    if (msg[0] === "@") {
      const idRegex = /^@(.+)\s(.+)/;

      // not a typo, the first comma ignores first value
      const [, userId, message] = msg.match(idRegex);

      console.log("[" + socket.id + " -> " + userId + "]:", message);
      socket.broadcast
        .to(userId)
        .emit("whisper", { sender: socket.id, message: message });
    } else {
      io.emit("chat message", { sender: socket.id, message: msg });
    }
  });

  // Handle disconnect
  socket.on("disconnect", reason => {
    console.log(
      socket.id,
      "disconnected.",
      "socketid",
      connectedUsers.indexOf(socket.id)
    );
    io.emit("userDisconnect", { user: { id: socket.id } });
    connectedUsers.splice(connectedIds.indexOf(socket.id), 1);
    connectedIds.splice(connectedIds.indexOf(socket.id), 1);
  });
});
