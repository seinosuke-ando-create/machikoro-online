let room = null;
let currentRoomId = null;

// ===== 建物マスター =====
const buildingMaster = {
  wheatField: { name: "🌾 小麦畑", cost: 1, type: "blue", activationNumbers: [1], description: "+1コイン" },
  ranch: { name: "🐄 牧場", cost: 1, type: "blue", activationNumbers: [2], description: "+1コイン" },
  forest: { name: "🌲 森", cost: 3, type: "blue", activationNumbers: [5], description: "+3コイン" },
  bakery: { name: "🥖 パン屋", cost: 1, type: "green", activationNumbers: [2, 3], description: "+1コイン" },
  convenienceStore: { name: "🏪 コンビニ", cost: 2, type: "green", activationNumbers: [4], description: "+3コイン" },
  cafe: { name: "☕ カフェ", cost: 2, type: "red", activationNumbers: [3], description: "他プレイヤーから1コイン" }
};

const landmarkMaster = {
  station: { name: "🚉 駅", cost: 4 },
  shoppingMall: { name: "🏬 モール", cost: 6 },
  themePark: { name: "🎡 テーマパーク", cost: 10 }
};

const socket = io();

document.getElementById("joinButton").onclick = () => {
  const name = document.getElementById("playerNameInput").value;
  const roomId = document.getElementById("roomIdInput").value;

  currentRoomId = roomId;

  socket.emit("joinGame", {
    playerName: name,
    roomId: roomId
  });

  document.getElementById("roomSelect").style.display = "none";
  document.getElementById("joinRoomArea").style.display = "none";
  document.getElementById("waitingRoom").style.display = "block";

  document.getElementById("displayRoomId").textContent = roomId;
};


document.getElementById("createRoomBtn").onclick = () => {
  document.getElementById("createRoomArea").style.display = "block";
};

document.getElementById("joinRoomBtn").onclick = () => {
  document.getElementById("roomSelect").style.display = "none";
  document.getElementById("createRoomArea").style.display = "none";
  document.getElementById("joinRoomArea").style.display = "block";
};

document.getElementById("backToMenuBtn").onclick = () => {
  document.getElementById("roomSelect").style.display = "block";
  document.getElementById("joinRoomArea").style.display = "none";
};

document.getElementById("createBtn").onclick = () => {
  const count = document.getElementById("playerCount").value;
  const name = document.getElementById("createPlayerNameInput").value;

  socket.emit("createRoom", {
    maxPlayers: count,
    playerName: name
  });
};

/* ==============================
   ✅ 正しい room 受信処理
================================= */
socket.on('room', (state) => {

  room = state;

  if (room.phase === "waiting") {
    document.getElementById("menuScreen").style.display = "none";
    document.getElementById("waitingRoom").style.display = "block";
  } else {
    document.getElementById("menuScreen").style.display = "none";
    document.getElementById("waitingRoom").style.display = "none";
    document.getElementById("gameScreen").style.display = "block";
  }

  updateDisplay();
});

socket.on("roomCreated", (roomId) => {
  currentRoomId = roomId;

  document.getElementById("roomSelect").style.display = "none";
  document.getElementById("createRoomArea").style.display = "none";
  document.getElementById("waitingRoom").style.display = "block";

  document.getElementById("displayRoomId").textContent = roomId;
});


socket.on('diceResult', (dice) => {
  const img = document.getElementById("diceImage");
  img.src = "images/dice" + dice + ".png";
  img.style.transform = "rotate(360deg)";
});

socket.on("gameOver", ({ winner }) => {
  alert("🏆 勝者は " + winner + " さん！");
});

/* ==============================
   初期カード生成
================================= */
function createCards() {
  const buildingArea = document.getElementById("buildingCards");
  const landmarkArea = document.getElementById("landmarkCards");

  Object.keys(buildingMaster).forEach(key => {
    const b = buildingMaster[key];
    const card = document.createElement("div");
    card.className = `card ${b.type}`;
    card.id = key + "Card";
    card.dataset.cost = b.cost;
    card.innerHTML = `
      <h3>${b.name}</h3>
      <p>コスト: ${b.cost}</p>
      <p>発動: ${b.activationNumbers.join(",")}</p>
      <p>${b.description}</p>
    `;
    card.onclick = () => buyBuilding(key);
    buildingArea.appendChild(card);
  });

  Object.keys(landmarkMaster).forEach(key => {
    const l = landmarkMaster[key];
    const card = document.createElement("div");
    card.className = "card landmark";
    card.dataset.cost = l.cost;
    card.id = key + "Landmark";
    card.innerHTML = `
      <h3>${l.name}</h3>
      <p>コスト: ${l.cost}</p>
    `;
    card.onclick = () => buyLandmark(key);
    landmarkArea.appendChild(card);
  });
}

/* ==============================
   発動処理
================================= */
/* ==============================
   表示更新（null完全ガード版）
================================= */
function updateDisplay() {

  if (!room || !room.players) return;

  const player = room.players[room.currentPlayerIndex];
  if (!player) return;

  document.getElementById("currentPlayer").textContent = player.id;
  document.getElementById("moneyResult").textContent = player.money;
  document.getElementById("phaseDisplay").textContent =
    room.phase === "roll" ? "🎲 ダイスフェーズ" : "🛒 購入フェーズ";

  // 所持建物
  const owned = document.getElementById("ownedBuildings");
  owned.innerHTML = "";
  Object.keys(player.buildings || {}).forEach(key => {
    if (player.buildings[key] > 0) {
      owned.innerHTML +=
        `<span class="small-card">${buildingMaster[key].name} ×${player.buildings[key]}</span>`;
    }
  });

  // 所持ランドマーク
  const ownedLandmarks = document.getElementById("ownedLandmarks");
  ownedLandmarks.innerHTML = "";
  Object.keys(player.landmarks || {}).forEach(key => {
    if (player.landmarks[key]) {
      ownedLandmarks.innerHTML +=
        `<span class="small-card">${landmarkMaster[key].name}</span>`;
    }
  });

  const mySocketId = socket.id;
  const currentPlayer = room.players[room.currentPlayerIndex];

  const isMyTurn = currentPlayer &&
    currentPlayer.socketId === mySocketId;

  // カード有効無効
  document.querySelectorAll(".card").forEach(card => {
    const cost = parseInt(card.dataset.cost || 0);

    if (player.money < cost || room.phase !== "buy") {
      card.classList.add("disabled");
    } else {
      card.classList.remove("disabled");
    }
  });

  document.getElementById("rollButton").disabled =
    room.phase !== "roll";
  document.getElementById("rollButton").disabled =
    !isMyTurn || room.phase !== "roll";

  document.querySelectorAll(".card").forEach(card => {
    if (!isMyTurn || room.phase !== "buy") {
      card.classList.add("disabled");
    }
  });
  const allArea = document.getElementById("allPlayersInfo");
  allArea.innerHTML = "";

  room.players.forEach(p => {

    let buildings = "";
    Object.keys(p.buildings).forEach(key => {
      if (p.buildings[key] > 0) {
        buildings += buildingMaster[key].name + "×" + p.buildings[key] + " ";
      }
    });

    let landmarks = "";
    Object.keys(p.landmarks).forEach(key => {
      if (p.landmarks[key]) {
        landmarks += landmarkMaster[key].name + " ";
      }
    });

    allArea.innerHTML += `
    <div class="playerCard">
      <h3>${p.name}</h3>
      💰 ${p.money}<br>
      🏠 ${buildings || "なし"}<br>
      🏰 ${landmarks || "なし"}
    </div>
  `;
  });

}

/* ==============================
   その他
================================= */
function flashCard(key) {
  const el = document.getElementById(key + "Card");
  if (!el) return;
  el.classList.add("highlight");
  setTimeout(() => el.classList.remove("highlight"), 500);
}

function skipPurchase() {
  if (!room || room.phase !== "buy") return;
  socket.emit('endTurn', { roomId: currentRoomId });
}

function buyBuilding(key) { socket.emit('buyBuilding', { key, roomId: currentRoomId }); }
function buyLandmark(key) { socket.emit('buyLandmark', { key, roomId: currentRoomId }); }
function playTurn() { socket.emit('rollDice', { roomId: currentRoomId }); }

/* ==============================
   初期化
================================= */
document.getElementById("rollButton").addEventListener("click", playTurn);
document.getElementById("skipCard").addEventListener("click", skipPurchase);

createCards();