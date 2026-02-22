const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

/* =============================
   マスター
============================= */

const buildingMaster = {
  wheatField: { cost: 1, type: "blue", numbers: [1], amount: 1 },
  ranch: { cost: 1, type: "blue", numbers: [2], amount: 1 },
  forest: { cost: 3, type: "blue", numbers: [5], amount: 3 },
  bakery: { cost: 1, type: "green", numbers: [2, 3], amount: 1 },
  convenienceStore: { cost: 2, type: "green", numbers: [4], amount: 3 },
  cafe: { cost: 2, type: "red", numbers: [3], amount: 1 }
};

const landmarkMaster = {
  station: { cost: 4 },
  shoppingMall: { cost: 6 }
};

/* =============================
   🔥 ルーム管理
============================= */

let rooms = {};

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function nextTurn(room) {
  room.currentPlayerIndex =
    (room.currentPlayerIndex + 1) %
    room.players.length;

  room.phase = "roll";
}

function activateBuildings(room, dice) {

  const current = room.players[room.currentPlayerIndex];

  // 🔴 赤
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

/* =============================
   socket
============================= */

io.on('connection', (socket) => {

  /* 🏠 ルーム作成 */
  socket.on("createRoom", ({ name, maxPlayers }) => {

    const roomId = generateRoomId();

    rooms[roomId] = {
      players: [],
      maxPlayers,
      currentPlayerIndex: 0,
      phase: "waiting"
    };

    socket.join(roomId);

    socket.emit("roomCreated", roomId);

    joinRoom(socket, roomId, name);
  });

  /* 🚪 ルーム参加 */
  socket.on("joinRoom", ({ roomId, name }) => {
    joinRoom(socket, roomId, name);
  });

  function joinRoom(socket, roomId, name) {

    const room = rooms[roomId];
    if (!room) {
      socket.emit("errorMessage", "ルームが存在しません");
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      socket.emit("errorMessage", "満員です");
      return;
    }

    const newPlayer = {
      id: room.players.length + 1,
      name,
      socketId: socket.id,
      money: 3,
      buildings: {},
      landmarks: {},
      roomId
    };

    room.players.push(newPlayer);
    socket.join(roomId);

    io.to(roomId).emit("gameState", room);

    if (room.players.length === room.maxPlayers) {
      room.phase = "roll";
      io.to(roomId).emit("gameStart");
    }
  }

  /* 🎲 ダイス */
  socket.on("rollDice", () => {

    const playerRoom = getPlayerRoom(socket.id);
    if (!playerRoom) return;

    const { room } = playerRoom;
    const current = room.players[room.currentPlayerIndex];

    if (!current || current.socketId !== socket.id) return;
    if (room.phase !== "roll") return;

    const dice = Math.floor(Math.random() * 6) + 1;

    activateBuildings(room, dice);
    room.phase = "buy";

    io.to(playerRoom.roomId).emit("diceResult", dice);
    io.to(playerRoom.roomId).emit("gameState", room);
  });

  /* 🛒 建物購入 */
  socket.on("buyBuilding", (key) => {

    const playerRoom = getPlayerRoom(socket.id);
    if (!playerRoom) return;

    const { room } = playerRoom;
    const current = room.players[room.currentPlayerIndex];

    if (!current || current.socketId !== socket.id) return;
    if (room.phase !== "buy") return;

    const b = buildingMaster[key];
    if (!b) return;

    if (current.money >= b.cost) {

      current.money -= b.cost;
      current.buildings[key] =
        (current.buildings[key] || 0) + 1;

      nextTurn(room);
      io.to(playerRoom.roomId).emit("gameState", room);
    }
  });

  /* 🔁 ターン終了 */
  socket.on("endTurn", () => {

    const playerRoom = getPlayerRoom(socket.id);
    if (!playerRoom) return;

    const { room } = playerRoom;
    const current = room.players[room.currentPlayerIndex];

    if (!current || current.socketId !== socket.id) return;
    if (room.phase !== "buy") return;

    nextTurn(room);
    io.to(playerRoom.roomId).emit("gameState", room);
  });

  function getPlayerRoom(socketId) {
    for (let roomId in rooms) {
      const room = rooms[roomId];
      const player = room.players.find(p => p.socketId === socketId);
      if (player) return { roomId, room };
    }
    return null;
  }

});

/* =============================
   起動
============================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});