const socket = io();

let myRoomId = null;

/* =====================
   ルーム作成
===================== */

function createRoom() {
  const name = document.getElementById("createName").value;
  const maxPlayers = parseInt(
    document.getElementById("maxPlayers").value
  );

  if (!name) return alert("名前を入力してください");

  socket.emit("createRoom", { name, maxPlayers });
}

socket.on("roomCreated", (roomId) => {
  myRoomId = roomId;

  document.getElementById("startScreen").style.display = "none";
  document.getElementById("lobbyScreen").style.display = "block";
  document.getElementById("roomIdDisplay").innerText = roomId;
});

/* =====================
   ルーム参加
===================== */

function joinRoom() {
  const name = document.getElementById("joinName").value;
  const roomId = document.getElementById("roomIdInput").value;

  if (!name || !roomId)
    return alert("名前とルームIDを入力してください");

  myRoomId = roomId;
  socket.emit("joinRoom", { roomId, name });
}

/* =====================
   ゲーム開始
===================== */

socket.on("gameStart", () => {
  document.getElementById("lobbyScreen").style.display = "none";
  document.getElementById("gameScreen").style.display = "block";
});

/* =====================
   ゲーム状態更新
===================== */

socket.on("gameState", (room) => {

  if (!myRoomId) {
    myRoomId = room.roomId;
  }

  // ロビー更新
  const playerList = document.getElementById("playerList");
  playerList.innerHTML = "";

  room.players.forEach(p => {
    const li = document.createElement("li");
    li.innerText = p.name;
    playerList.appendChild(li);
  });

  // ゲーム画面更新
  const playersDiv = document.getElementById("players");
  playersDiv.innerHTML = "";

  room.players.forEach(p => {
    const div = document.createElement("div");
    div.innerHTML = `
      <strong>${p.name}</strong> |
      所持金: ${p.money}
    `;
    playersDiv.appendChild(div);
  });

  const phaseText =
    room.phase === "waiting" ? "待機中" :
    room.phase === "roll" ? "ダイスフェーズ" :
    "購入フェーズ";

  document.getElementById("phaseDisplay").innerText =
    "現在フェーズ: " + phaseText;
});

/* =====================
   ダイス
===================== */

function rollDice() {
  socket.emit("rollDice");
}

socket.on("diceResult", (dice) => {
  alert("ダイス結果: " + dice);
});

/* =====================
   購入
===================== */

function buyBuilding(key) {
  socket.emit("buyBuilding", key);
}

function endTurn() {
  socket.emit("endTurn");
}

/* =====================
   エラー
===================== */

socket.on("errorMessage", (msg) => {
  alert(msg);
});