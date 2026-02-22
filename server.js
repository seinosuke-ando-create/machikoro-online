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

const landmarkMaster = {
  station: { cost: 4 },
  shoppingMall: { cost: 6 }
};

let gameState = {
  players: [],
  currentPlayerIndex: 0,
  phase: "waiting"  // ← 最初は待機
};


/* =============================
   🔥 建物発動ロジック（サーバー側）
============================= */
function nextTurn() {
  gameState.currentPlayerIndex =
    (gameState.currentPlayerIndex + 1) %
    gameState.players.length;

  gameState.phase = "roll";
}

function activateBuildings(dice) {

  const current = gameState.players[gameState.currentPlayerIndex];

  // 🔴 赤（先に処理）
  gameState.players.forEach(player => {
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
  gameState.players.forEach(player => {
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

  socket.emit('gameState', gameState);

  socket.on("joinGame", (playerName) => {

    let gameState = {
      players: [],
      currentPlayerIndex: 0,
      phase: "waiting",
      maxPlayers: null
    };

    socket.on("joinGame", ({ name, playerCount }) => {

      if (!gameState.maxPlayers) {
        gameState.maxPlayers = playerCount;
      }

      gameState.players.push(newPlayer);

      if (gameState.players.length === gameState.maxPlayers) {
        gameState.phase = "roll";
        io.emit("gameStart");
      }

      io.emit("gameState", gameState);
    });


    const newPlayer = {
      id: gameState.players.length + 1,
      name: playerName,
      socketId: socket.id,
      money: 3,
      buildings: {},
      landmarks: {}
    };

    gameState.players.push(newPlayer);

    // 2人揃ったら開始
    if (gameState.players.length === 2) {
      gameState.phase = "roll";
    }

    io.emit("gameState", gameState);
  });

  /* 🎲 ダイス */
  socket.on('rollDice', () => {
    const current = gameState.players[gameState.currentPlayerIndex];

    // 🔥 本人チェック
    if (!current || socket.id !== current.socketId) return;
    if (gameState.phase !== "roll") return;

    const dice = Math.floor(Math.random() * 6) + 1;

    activateBuildings(dice);   // 🔥 サーバーで発動

    gameState.phase = "buy";

    io.emit('diceResult', dice);
    io.emit('gameState', gameState);
  });

  /* 🛒 建物購入 */
  socket.on('buyBuilding', (key) => {
    const current = gameState.players[gameState.currentPlayerIndex];

    // 🔥 本人チェック
    if (!current || socket.id !== current.socketId) return;
    if (gameState.phase !== "buy") return;

    const player = gameState.players[gameState.currentPlayerIndex];
    const b = buildingMaster[key];
    if (!b) return;

    if (player.money >= b.cost) {

      player.money -= b.cost;
      player.buildings[key] =
        (player.buildings[key] || 0) + 1;

      nextTurn(); // 🔥 即ターン終了

      io.emit('gameState', gameState);
    }
  });

  socket.on('buyLandmark', (key) => {
    const current = gameState.players[gameState.currentPlayerIndex];

    // 🔥 本人チェック
    if (!current || socket.id !== current.socketId) return;
    if (gameState.phase !== "buy") return;

    const player = gameState.players[gameState.currentPlayerIndex];
    const l = landmarkMaster[key];
    if (!l) return;

    if (player.money >= l.cost && !player.landmarks[key]) {

      player.money -= l.cost;
      player.landmarks[key] = true;

      nextTurn(); // 🔥 即ターン終了

      io.emit('gameState', gameState);
    }
  });


  /* 🔁 ターン終了 */
  socket.on('endTurn', () => {
    const current = gameState.players[gameState.currentPlayerIndex];

    // 🔥 本人チェック
    if (!current || socket.id !== current.socketId) return;
    if (gameState.phase !== "buy") return;

    gameState.currentPlayerIndex =
      (gameState.currentPlayerIndex + 1) %
      gameState.players.length;

    gameState.phase = "roll";

    io.emit('gameState', gameState);
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port " + PORT);
});
