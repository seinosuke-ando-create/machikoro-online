const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const buildingMaster = {
  wheatField: { cost: 1, type: "blue", numbers: [1], amount: 1 },
  ranch: { cost: 1, type: "blue", numbers: [2], amount: 1 },
  forest: { cost: 3, type: "blue", numbers: [5], amount: 3 },
  bakery: { cost: 1, type: "green", numbers: [2, 3], amount: 1 },
  convenienceStore: { cost: 2, type: "green", numbers: [4], amount: 3 },
  cafe: { cost: 2, type: "red", numbers: [3], amount: 1 }
};

let rooms = {};

const landmarkMaster = {
  station: { cost: 4 },
  shoppingMall: { cost: 6 }
};


/* =============================
   🔥 建物発動ロジック（サーバー側）
============================= */
function nextTurn(room) {
  room.currentPlayerIndex =
    (room.currentPlayerIndex + 1) %
    room.players.length;
  room.phase = "roll";
}

function activateBuildings(room, dice) {

  const current = room.players[room.currentPlayerIndex];

  // 🔴 赤（先に処理）
  room.players.forEach(player => {
    if (player === current) return;

    Object.keys(player.buildings).forEach(key => {
      const count = player.buildings[key];
      const b = buildingMaster[key];
      if (!b || b.type !== "red") return;
      if (!b.numbers.includes(dice)) return;

      for (let i = 0; i < count; i++) {
        const amount = Math.min(b.amount, current.money);
        current.money -= amount;
        player.money += amount;
      }
    });
  });

  // 🔵 青 & 🟢 緑
  room.players.forEach(player => {
    Object.keys(player.buildings).forEach(key => {
      const count = player.buildings[key];
      const b = buildingMaster[key];
      if (!b || !b.numbers.includes(dice)) return;

      for (let i = 0; i < count; i++) {
        if (b.type === "blue") {
          player.money += b.amount;
        }

        if (b.type === "green" && player === current) {
          player.money += b.amount;
        }
      }
    });
  });
}

io.on('connection', (socket) => {

  socket.on("joinGame", ({ playerName, roomId }) => {

    const room = rooms[roomId];
    if (!room) return;

    if (room.players.length >= room.maxPlayers) return;

    const newPlayer = {
      id: room.players.length + 1,
      name: playerName,
      socketId: socket.id,
      money: 3,
      buildings: {},
      landmarks: {}
    };

    room.players.push(newPlayer);
    socket.join(roomId);

    if (room.players.length === room.maxPlayers) {
      room.phase = "roll";
    }

    io.to(roomId).emit("room", room);
  });

  socket.on("createRoom", ({ maxPlayers, playerName }) => {

    const roomId = Math.random().toString(36).substring(2, 8);

    const newRoom = {
      players: [],
      currentPlayerIndex: 0,
      phase: "waiting",
      maxPlayers: parseInt(maxPlayers)
    };

    const newPlayer = {
      id: 1,
      name: playerName,
      socketId: socket.id,
      money: 3,
      buildings: {},
      landmarks: {}
    };

    newRoom.players.push(newPlayer);

    rooms[roomId] = newRoom;

    socket.join(roomId);

    socket.emit("roomCreated", roomId);
    io.to(roomId).emit("room", newRoom);
  });

  /* 🎲 ダイス */
  socket.on('rollDice', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    const current = room.players[room.currentPlayerIndex];
    if (!current || socket.id !== current.socketId) return;
    if (room.phase !== "roll") return;

    const dice = Math.floor(Math.random() * 6) + 1;

    activateBuildings(room, dice);  // ← 修正
    room.phase = "buy";

    io.to(roomId).emit('diceResult', dice);
    io.to(roomId).emit('room', room);
  });

  /* 🛒 建物購入 */
  socket.on('buyBuilding', ({ key, roomId }) => {
    const room = rooms[roomId];
    const current = room.players[room.currentPlayerIndex];

    // 🔥 本人チェック
    if (!current || socket.id !== current.socketId) return;
    if (room.phase !== "buy") return;

    const player = room.players[room.currentPlayerIndex];
    const b = buildingMaster[key];
    if (!b) return;

    if (player.money >= b.cost) {

      player.money -= b.cost;
      player.buildings[key] =
        (player.buildings[key] || 0) + 1;

      nextTurn(room); // 🔥 即ターン終了

      io.to(roomId).emit("room", room);
    }
  });

  socket.on('buyLandmark', (key) => {
    const room = rooms[roomId];
    if (!room) return;
    const current = room.players[room.currentPlayerIndex];

    // 🔥 本人チェック
    if (!current || socket.id !== current.socketId) return;
    if (room.phase !== "buy") return;

    const player = room.players[room.currentPlayerIndex];
    const l = landmarkMaster[key];
    if (!l) return;

    if (player.money >= l.cost && !player.landmarks[key]) {

      player.money -= l.cost;
      player.landmarks[key] = true;

      nextTurn(); // 🔥 即ターン終了

      io.to(roomId).emit("room", room);
    }
  });


  /* 🔁 ターン終了 */
  socket.on('endTurn', () => {
    const room = rooms[roomId];
    if (!room) return;
    const current = room.players[room.currentPlayerIndex];

    // 🔥 本人チェック
    if (!current || socket.id !== current.socketId) return;
    if (room.phase !== "buy") return;

    room.currentPlayerIndex =
      (room.currentPlayerIndex + 1) %
      room.players.length;

    room.phase = "roll";

    io.to(roomId).emit("room", room);
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});