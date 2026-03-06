// ============================================
// StudyReport v2.1.0 - script.js
// SmartSRS準拠のログイン・設定実装
// ============================================

// --- グローバル変数 ---
let activeSession = null; // { material, startedAt, accumulatedSeconds, sessionStartAt }
let userCategories = []; // ★追加
let userUnits = [];      // ★追加
let sessionInterval = null;
let currentPendingLog = null;
let currentTab = "timeline";
let currentLogTab = "timer"; // 記録モーダル内のタブ
let currentUser = null;
// 教材キャッシュ（画像をタイムラインで使うため）
let materialsCache = [];
// カスタムオプション
let cachedTimelineLogs = []; // ←★追加：タイムラインのキャッシュ
let isTimelineLoaded = false; // ←★追加：読み込み済みフラグ


// ============================================
// Loading / Offline
// ============================================

function showLoading(show = true) {
  const el = document.getElementById("loading");
  if (!el) return;
  if (show) {
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

window.addEventListener("online", () => {
  const b = document.getElementById("offline-banner");
  if (b) b.style.display = "none";
});
window.addEventListener("offline", () => {
  const b = document.getElementById("offline-banner");
  if (b) b.style.display = "block";
});

if (!navigator.onLine) {
  const b = document.getElementById("offline-banner");
  if (b) b.style.display = "block";
}

// ============================================
// ビュー切り替え (SmartSRS と同じ方式)
// ============================================

function switchView(viewId) {
  const views = ["app-container", "settings-view"];
  views.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === viewId) {
      // app-containerはblock、settings-viewはflexで表示
      el.style.display = id === "app-container" ? "block" : "flex";
    } else {
      el.style.display = "none";
    }
  });
}

// ============================================
// 初期化
// ============================================

window.onload = () => {
  // Service Workerの登録
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => {
        console.log("ServiceWorkerが登録されました:", registration.scope);
      })
      .catch((err) => {
        console.error("ServiceWorkerの登録に失敗しました:", err);
      });
  }
  showLoading(true);

  // 日付初期化
  const now = new Date();
  const today = toDateKey(now);
  const dateInput = document.getElementById("report-date");
  if (dateInput) dateInput.value = today;

  // 認証監視 (SmartSRS と同じ onAuthStateChanged の使い方)
  auth.onAuthStateChanged(async (user) => {
    const authView = document.getElementById("auth-view");

    if (user) {
      currentUser = user;
      // メール表示
      const emailEl = document.getElementById("user-email-display");
      if (emailEl) emailEl.textContent = user.email || "";

      authView.style.display = "none";
      showLoading(true);

      try {
        await loadUserOptions();
        await renderMaterials();
        await loadGlobalTimeline();
      } catch (e) {
        console.error("初期化エラー:", e);
      } finally {
        showLoading(false);
        switchView("app-container");
        restoreActiveSession();
      }
    } else {
      currentUser = null;
      materialsCache = [];
      cachedTimelineLogs = []; // ←★追加
      isTimelineLoaded = false; // ←★追加
      showLoading(false);
      switchView("app-container"); // 一旦非表示
      document.getElementById("app-container").style.display = "none";
      authView.style.display = "flex";
    }
  });

 // コメント欄の自動拡張
  const commentBox = document.getElementById("global-comment-text");
  if (commentBox) {
    commentBox.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = this.scrollHeight + "px";
    });
  }

  // ▼▼ ここから追加 ▼▼
  // 出力エリア（メール本文）の自動拡張
  const outputBox = document.getElementById("output-text");
  if (outputBox) {
    outputBox.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = this.scrollHeight + "px";
    });
  }

  // ログインボタン (SmartSRS と同じロングプレスバイパス)
  const btnLogin = document.getElementById("btnLogin");
  if (btnLogin) {
    let bypassTimer;
    btnLogin.addEventListener("mousedown", () => {
      bypassTimer = setTimeout(() => {
        _bypassLogin();
      }, 5000);
    });
    btnLogin.addEventListener(
      "touchstart",
      () => {
        bypassTimer = setTimeout(() => {
          _bypassLogin();
        }, 5000);
      },
      { passive: true },
    );
    btnLogin.addEventListener("mouseup", () => clearTimeout(bypassTimer));
    btnLogin.addEventListener("mouseleave", () => clearTimeout(bypassTimer));
    btnLogin.addEventListener("touchend", () => clearTimeout(bypassTimer));
    btnLogin.addEventListener("click", async () => {
      if (!currentUser) await tryLogin();
    });
  }

  const btnSignup = document.getElementById("btnSignup");
  if (btnSignup) {
    btnSignup.addEventListener("click", async () => {
      const email = document.getElementById("email").value.trim();
      const pass = document.getElementById("password").value;
      const err = document.getElementById("auth-error");
      err.style.display = "none";
      if (!email || !pass) {
        showAuthError("メールアドレスとパスワードを入力してください");
        return;
      }
      if (pass.length < 6) {
        showAuthError("パスワードは6文字以上で入力してください");
        return;
      }
      showLoading(true);
      try {
        await auth.createUserWithEmailAndPassword(email, pass);
        // 成功時は onAuthStateChanged が呼ばれる
      } catch (e) {
        showLoading(false);
        showAuthError("登録失敗: " + e.message);
      }
    });
  }
};

function _bypassLogin() {
  console.log("Bypassing login (test mode)...");
  currentUser = null;
  const authView = document.getElementById("auth-view");
  if (authView) authView.style.display = "none";
  const appContainer = document.getElementById("app-container");
  // ここも 'flex' から 'block' に修正
  if (appContainer) appContainer.style.display = "block";
  loadUserOptions().then(() => {
    renderMaterials();
    loadGlobalTimeline();
  });
}

async function tryLogin() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value;
  if (!email || !pass) {
    showAuthError("メールアドレスとパスワードを入力してください");
    return;
  }
  showAuthError("");
  showLoading(true);
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (e) {
    showLoading(false);
    showAuthError("ログイン失敗: " + e.message);
  }
}

function showAuthError(msg) {
  const err = document.getElementById("auth-error");
  if (!err) return;
  err.textContent = msg;
  err.style.display = msg ? "block" : "none";
}

function checkLoginEnter(event) {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    tryLogin();
  }
}

function resetPassword() {
  const email = document.getElementById("email").value.trim();
  if (!email) {
    showAuthError("メールアドレスを入力してください");
    return;
  }
  auth
    .sendPasswordResetEmail(email)
    .then(() => {
      showAuthError("");
      alert("パスワード再設定メールを送信しました");
    })
    .catch((e) => showAuthError("送信失敗: " + e.message));
}

function handleLogout() {
  if (confirm("ログアウトしますか？")) {
    auth.signOut().then(() => location.reload());
  }
}

// ============================================
// 設定ページ (SmartSRS 方式)
// ============================================

function openSettings() {
  // バージョン表示
  const versionMeta = document.querySelector('meta[name="data-app-version"]');
  const appVersionEl = document.getElementById("app-version");
  if (appVersionEl && versionMeta)
    appVersionEl.textContent = versionMeta.getAttribute("content");

  switchView("settings-view");
}

function closeSettings() {
  switchView("app-container");
}

// ============================================
// Tab Control
// ============================================

function switchTab(tabName) {
  currentTab = tabName;
  document
    .querySelectorAll(".tab-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document
    .querySelectorAll(".tab-content")
    .forEach((c) => c.classList.remove("active"));

  const btns = document.querySelectorAll(".tab-btn");
  if (tabName === "timeline") btns[0].classList.add("active");
  else btns[1].classList.add("active");

  document.getElementById(`tab-${tabName}`).classList.add("active");

  if (tabName === "report") {
    loadReportDataForDate();
    loadDailyComment();
  } else {
    loadGlobalTimeline();
  }
}

// ============================================
// Utility
// ============================================

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// キャッシュから教材の画像を取得
function getMaterialImage(materialName) {
  const found = materialsCache.find((m) => m.name === materialName);
  return found && found.image ? found.image : "img/default_book_img.png";
}

// ============================================
// Timeline
// ============================================

async function loadGlobalTimeline() {
  const listEl = document.getElementById("timeline-list");
  if (!listEl) return;

  // ▼ すでに読み込み済みなら、キャッシュを使って描画して終了（通信しない）
  if (isTimelineLoaded) {
    renderGlobalTimeline(cachedTimelineLogs);
    return;
  }

  listEl.innerHTML =
    '<div style="text-align:center;padding:20px;color:var(--text-sub)">読み込み中...</div>';

  let logs = [];
  try {
    if (currentUser) {
      const snapshot = await db
        .collection("users")
        .doc(currentUser.uid)
        .collection("timeline")
        .orderBy("createdAt", "desc")
        .limit(60)
        .get();
      logs = snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d,
          startTimeObj: d.startTime.toDate
            ? d.startTime.toDate()
            : new Date(d.startTime),
        };
      });
    } else {
      logs = getAllLocalTimelines();
    }
    
    // ▼ 取得したデータを変数に保存し、フラグを立てる
    cachedTimelineLogs = logs;
    isTimelineLoaded = true;
    
    renderGlobalTimeline(logs);
  } catch (e) {
    console.error("timeline load error:", e);
    listEl.innerHTML =
      '<div style="text-align:center;padding:20px;color:var(--danger)">読み込みエラー</div>';
  }
}

function getAllLocalTimelines() {
  let allLogs = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("studyReportTimeline_")) {
      try {
        const arr = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(arr)) allLogs = allLogs.concat(arr);
      } catch (e) {}
    }
  }
  return allLogs
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    .map((l) => ({ ...l, startTimeObj: new Date(l.startTime) }));
}

function renderGlobalTimeline(logs) {
  const listEl = document.getElementById("timeline-list");
  if (logs.length === 0) {
    listEl.innerHTML =
      '<div style="text-align:center;padding:36px 20px;color:var(--text-sub)">まだ記録がありません。<br>「教材を追加」から学習を始めましょう！</div>';
    return;
  }
  const fragment = document.createDocumentFragment();
  let lastDateStr = "";
  logs.forEach((log) => {
    const dateStr = log.startTimeObj.toLocaleDateString("ja-JP", {
      month: "long",
      day: "numeric",
      weekday: "short",
    });
    if (dateStr !== lastDateStr) {
      const header = document.createElement("div");
      header.className = "timeline-date-header";
      header.textContent = dateStr;
      fragment.appendChild(header);
      lastDateStr = dateStr;
    }
    const timeStr = log.startTimeObj.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const detail = [
      log.amount, 
      log.content ? `「${log.content}」` : "", 
      log.memo ? `(メモ: ${log.memo})` : ""
    ].filter(Boolean).join(" ");

    const item = document.createElement("div");
    item.className = "timeline-item";

    // 教材写真サムネイル
    const thumb = document.createElement("img");
    thumb.className = "timeline-thumb";
    thumb.src = getMaterialImage(log.materialName);
    thumb.alt = "";
    thumb.onerror = function () {
      this.src = "img/default_book_img.png";
    };

    const content = document.createElement("div");
    content.className = "timeline-content";
    content.innerHTML = `
            <div class="timeline-time">${timeStr}</div>
            <div class="timeline-title">${escapeHtml(log.materialName)}</div>
            <div class="timeline-detail">${escapeHtml(detail)}</div>`;

    const meta = document.createElement("div");
    meta.className = "timeline-meta";
    meta.innerHTML = `<div class="timeline-duration">${log.durationMinutes}分</div>`;

    // ⋯ メニュー
    const menuWrapper = document.createElement("div");
    menuWrapper.className = "timeline-menu-wrapper";

    const menuBtn = document.createElement("button");
    menuBtn.className = "timeline-menu-btn";
    menuBtn.textContent = "⋯";
    menuBtn.title = "メニュー";

    const dropdown = document.createElement("div");
    dropdown.className = "timeline-dropdown";

    const editItem = document.createElement("button");
    editItem.className = "timeline-dropdown-item";
    editItem.textContent = "✏️ 編集";
    editItem.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.remove("open");
      editTimelineLog(log);
    });

    const delItem = document.createElement("button");
    delItem.className = "timeline-dropdown-item danger";
    delItem.textContent = "🗑️ 削除";
    delItem.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.remove("open");
      deleteTimelineLog(log.id, log.dateKey);
    });

    dropdown.appendChild(editItem);
    dropdown.appendChild(delItem);

    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // 他の開いているメニューを閉じる
      document.querySelectorAll(".timeline-dropdown.open").forEach((d) => {
        if (d !== dropdown) d.classList.remove("open");
      });
      dropdown.classList.toggle("open");
    });

    menuWrapper.appendChild(menuBtn);
    menuWrapper.appendChild(dropdown);
    meta.appendChild(menuWrapper);

    item.appendChild(thumb);
    item.appendChild(content);
    item.appendChild(meta);
    fragment.appendChild(item);
  });
  listEl.innerHTML = "";
  listEl.appendChild(fragment);
}

// ドロップダウンを外部クリックで閉じる
document.addEventListener("click", () => {
  document
    .querySelectorAll(".timeline-dropdown.open")
    .forEach((d) => d.classList.remove("open"));
});

// タイムラインログの編集
function editTimelineLog(log) {
  const material = materialsCache.find((m) => m.name === log.materialName) || {
    name: log.materialName,
    unit: log.unit || "ページ",
    category: log.category,
  };
  const modal = document.getElementById("log-detail-modal");
  activeSession = null;
  document.getElementById("log-detail-title").textContent = `${log.materialName} の記録を編集`;

  const unit = material.unit || "ページ";
  document.querySelectorAll(".unit-display").forEach((el) => (el.textContent = unit));
  document.getElementById("unit-help-range").textContent = `単位: ${unit}`;

  // フォームへの値セット
  document.getElementById("log-duration-input").value = log.durationMinutes || "";
  document.getElementById("log-content-input").value = log.content || "";
  document.getElementById("log-memo-input").value = log.memo || ""; // ここでセットした値を保持する

  // 範囲・合計入力欄はリセット
  document.getElementById("log-range-start").value = "";
  document.getElementById("log-range-end").value = "";
  document.getElementById("log-amount-val").value = "";

  document.getElementById("progress-type-range").checked = true;
  toggleProgressInput();
  _updateTimerUI(false);
  switchLogTab("progress");
  const saveBtn = document.getElementById("log-save-btn");
  const newBtn = saveBtn.cloneNode(true);
  newBtn.textContent = "更新する";
  saveBtn.parentNode.replaceChild(newBtn, saveBtn);

  newBtn.addEventListener("click", async () => {
    const duration = parseInt(
      document.getElementById("log-duration-input").value,
    );
    if (isNaN(duration) || duration < 0) {
      alert("学習時間を正しく入力してください");
      return;
    }
   const content = document.getElementById("log-content-input").value;
    const memo = document.getElementById("log-memo-input").value; // ←★この行を追加
    showLoading(true);
    try {
      if (currentUser) {
        await db.collection("users").doc(currentUser.uid).collection("timeline").doc(log.id).update({
            durationMinutes: duration,
            content: content,
            memo: memo, // ←★この行を追加
          });
      } else {
        const logs = getLocalTimeline(log.dateKey);
        const idx = logs.findIndex((l) => l.id === log.id);
        if (idx !== -1) {
          logs[idx].durationMinutes = duration;
          logs[idx].content = content;
          logs[idx].memo = memo; // ←★この行を追加
          localStorage.setItem(
            `studyReportTimeline_${log.dateKey}`,
            JSON.stringify(logs),
          );
        }
      }
     addSyncLog(`編集: ${log.materialName} ${duration}分`);
      showPopup("更新しました！");
      document.getElementById("log-detail-modal").classList.remove("show");
      isTimelineLoaded = false; // ←★この1行を追加
      loadGlobalTimeline();
    } catch (e) {
      showPopup(`更新エラー: ${e.message}`);
    } finally {
      showLoading(false);
    }
  });
  modal.classList.add("show");
}

// ============================================
// Stopwatch & Record
// ============================================

function selectMaterial(m) {
  if (activeSession) {
    alert("現在計測中です。終了してから新しい学習を始めてください。");
    return;
  }
  startSession(m);
}

// ============================================
// Firebase Session Persistence
// ============================================

async function saveSessionToCloud() {
  if (!currentUser || !activeSession) return;
  try {
    await db
      .collection("users")
      .doc(currentUser.uid)
      .set(
        {
          activeSession: {
            material: activeSession.material,
            startedAt: activeSession.startedAt,
            accumulatedSeconds: activeSession.accumulatedSeconds,
            sessionStartAt: activeSession.sessionStartAt, // nullなら停止中
            updatedAt: Date.now(),
          },
        },
        { merge: true },
      );
  } catch (e) {
    console.error("セッション保存エラー:", e);
  }
}

async function clearSessionFromCloud() {
  if (!currentUser) return;
  try {
    await db.collection("users").doc(currentUser.uid).update({
      activeSession: firebase.firestore.FieldValue.delete(),
    });
  } catch (e) {
    console.error("セッション削除エラー:", e);
  }
}

// ============================================
// Session Management
// ============================================

function startSession(m) {
  activeSession = {
    material: m,
    startedAt: Date.now(),
    accumulatedSeconds: 0,
    sessionStartAt: Date.now(), // 即座に開始
  };
  _persistSession();
  
  if (!sessionInterval) {
    sessionInterval = setInterval(updateSessionTimer, 1000);
  }

  currentPendingLog = {
    material: m,
    startTime: activeSession.startedAt,
    isManual: false,
  };
  openLogDetailModal(currentPendingLog);
}

function _persistSession() {
  // localStorageに保存
  if (activeSession) {
    localStorage.setItem(
      "studyReportActiveSession",
      JSON.stringify(activeSession),
    );
  } else {
    localStorage.removeItem("studyReportActiveSession");
  }
  // Firestoreにも保存（非同期・失敗しても続行）
  saveSessionToCloud();
}

// タイマーを開始（スタートボタン）
function startTimer() {
  if (!activeSession || activeSession.sessionStartAt) return; // 既に走行中
  activeSession.sessionStartAt = Date.now();
  _persistSession();
  // interval が無ければ開始
  if (!sessionInterval) {
    sessionInterval = setInterval(updateSessionTimer, 1000);
  }
  _updateTimerUI(true);
}

// タイマーを一時停止（ストップボタン）
function pauseTimer() {
  if (!activeSession || !activeSession.sessionStartAt) return; // 停止中
  const elapsed = Math.floor(
    (Date.now() - activeSession.sessionStartAt) / 1000,
  );
  activeSession.accumulatedSeconds += elapsed;
  activeSession.sessionStartAt = null;
  _persistSession();
  // intervalは止めない（表示更新で停止表示にする）
  _updateTimerUI(false);
  // 進捗タブの分入力欄も更新
  const mins = Math.floor(activeSession.accumulatedSeconds / 60);
  const durInput = document.getElementById("log-duration-input");
  if (durInput) durInput.value = mins > 0 ? mins : "";
}

// 手動時間入力 → accumulatedSecondsに反映
function onManualTimeInput() {
  const val =
    parseInt(document.getElementById("log-duration-input").value) || 0;
  if (activeSession) {
    // タイマー走行中なら一旦停止
    if (activeSession.sessionStartAt) {
      clearInterval(sessionInterval);
      sessionInterval = null;
      activeSession.sessionStartAt = null;
      _updateTimerUI(false);
    }
    activeSession.accumulatedSeconds = val * 60;
    _persistSession();
  }
  updateSessionTimer(); // 表示をすぐ更新
}

// タイマー表示を更新（intervalから呼ばれる）
function updateSessionTimer() {
  let totalSeconds = 0;
  if (activeSession) {
    totalSeconds = activeSession.accumulatedSeconds;
    if (activeSession.sessionStartAt) {
      totalSeconds += Math.floor(
        (Date.now() - activeSession.sessionStartAt) / 1000,
      );
    }
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const logTimer = document.getElementById("log-session-timer");
  if (logTimer) logTimer.textContent = timeStr;
  // 旧カードタイマーも念のため
  const cardTimer = document.getElementById("session-timer");
  if (cardTimer) cardTimer.textContent = timeStr;
}

// ボタンと状態ラベルのUI更新
function _updateTimerUI(isRunning) {
  const startBtn = document.getElementById("timer-start-btn");
  const stopBtn = document.getElementById("timer-stop-btn");
  const label = document.getElementById("timer-status-label");
  if (startBtn) startBtn.style.display = isRunning ? "none" : "inline-block";
  if (stopBtn) stopBtn.style.display = isRunning ? "inline-block" : "none";
  if (label) {
    label.textContent = isRunning ? "計測中" : "停止中";
    label.className = isRunning
      ? "timer-status-label running"
      : "timer-status-label";
  }
}

// モーダル内タブ切り替え
function switchLogTab(tabName) {
  currentLogTab = tabName;
  document
    .querySelectorAll(".log-tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById(`log-tab-${tabName}-btn`).classList.add("active");

  document.getElementById("log-tab-timer").style.display =
    tabName === "timer" ? "block" : "none";
  document.getElementById("log-tab-progress").style.display =
    tabName === "progress" ? "block" : "none";

  if (tabName === "progress" && activeSession) {
    // 進捗タブ表示時：現在の累積時間を分で入力欄に反映
    let totalSec = activeSession.accumulatedSeconds;
    if (activeSession.sessionStartAt) {
      totalSec += Math.floor(
        (Date.now() - activeSession.sessionStartAt) / 1000,
      );
    }
    const mins = Math.floor(totalSec / 60);
    const durInput = document.getElementById("log-duration-input");
    if (durInput && durInput.value === "")
      durInput.value = mins > 0 ? mins : "";
  }
}

async function restoreActiveSession() {
  // まずFirestoreから復元を試みる（ログイン時のみ）
  if (currentUser) {
    try {
      const doc = await db.collection("users").doc(currentUser.uid).get();
      if (doc.exists && doc.data().activeSession) {
        const saved = doc.data().activeSession;
        activeSession = {
          material: saved.material,
          startedAt: saved.startedAt,
          accumulatedSeconds: saved.accumulatedSeconds || 0,
          sessionStartAt: null, // 復元後は停止状態から始める
        };
        // 走行中だった場合、離席中の経過分をaccumulatedに追加
        if (saved.sessionStartAt) {
          const absentSec = Math.floor(
            (Date.now() - saved.sessionStartAt) / 1000,
          );
          activeSession.accumulatedSeconds += absentSec;
        }
        localStorage.setItem(
          "studyReportActiveSession",
          JSON.stringify(activeSession),
        );
        // intervalを開始して表示を維持
        if (!sessionInterval)
          sessionInterval = setInterval(updateSessionTimer, 1000);
        updateSessionTimer();
        // モーダルを開いてセッション継続を案内
        currentPendingLog = {
          material: activeSession.material,
          startTime: activeSession.startedAt,
          isManual: false,
        };
        openLogDetailModal(currentPendingLog);
        return;
      }
    } catch (e) {
      console.error("セッション復元エラー:", e);
    }
  }
  // localStorageからフォールバック
  const stored = localStorage.getItem("studyReportActiveSession");
  if (stored) {
    try {
      const saved = JSON.parse(stored);
      activeSession = {
        material: saved.material,
        startedAt: saved.startedAt || saved.startTime || Date.now(),
        accumulatedSeconds: saved.accumulatedSeconds || 0,
        sessionStartAt: null,
      };
      if (!sessionInterval)
        sessionInterval = setInterval(updateSessionTimer, 1000);
      updateSessionTimer();
      currentPendingLog = {
        material: activeSession.material,
        startTime: activeSession.startedAt,
        isManual: false,
      };
      openLogDetailModal(currentPendingLog);
    } catch (e) {
      localStorage.removeItem("studyReportActiveSession");
    }
  }
}

// ============================================
// Log Detail Modal
// ============================================



function openLogDetailModal(logData) {
  const modal = document.getElementById("log-detail-modal");
  document.getElementById("log-detail-title").textContent =
    `${logData.material.name} の記録`;
  const unit = logData.material.unit || "ページ";
  document
    .querySelectorAll(".unit-display")
    .forEach((el) => (el.textContent = unit));
  document.getElementById("unit-help-range").textContent = `単位: ${unit}`;

  // フォームリセット
  document.getElementById("log-range-start").value = "";
  document.getElementById("log-range-end").value = "";
  document.getElementById("log-amount-val").value = "";
  document.getElementById("log-content-input").value = "";
  document.getElementById("log-duration-input").value = "";
  document.getElementById("progress-type-range").checked = true;
  toggleProgressInput();

  // タイマーUI初期化
  const isLiveSession = !!activeSession;
  _updateTimerUI(isLiveSession && !!activeSession?.sessionStartAt);
  updateSessionTimer();

  // タイマータブをデフォルト表示
  currentLogTab = "timer";
  switchLogTab("timer");

  // 保存ボタンを新しくして再バインド
  const saveBtn = document.getElementById("log-save-btn");
  const newBtn = saveBtn.cloneNode(true);
  newBtn.textContent = "記録する";
  saveBtn.parentNode.replaceChild(newBtn, saveBtn);

  newBtn.addEventListener("click", async () => {
    // タイマー走行中なら停止
    if (activeSession && activeSession.sessionStartAt) {
      const elapsed = Math.floor(
        (Date.now() - activeSession.sessionStartAt) / 1000,
      );
      activeSession.accumulatedSeconds += elapsed;
      activeSession.sessionStartAt = null;
    }
    // 学習時間を確定
    let durationMinutes;
    if (activeSession) {
      durationMinutes = Math.max(
        1,
        Math.floor(activeSession.accumulatedSeconds / 60),
      );
    } else {
      durationMinutes =
        parseInt(document.getElementById("log-duration-input").value) || 0;
      if (durationMinutes <= 0) {
        showPopup("学習時間を入力してください");
        switchLogTab("progress");
        return;
      }
    }
    // 進捗を取得
    // 進捗を取得
    const type = document.querySelector(
      'input[name="progress-type"]:checked',
    ).value;
    let amountStr = "";
    if (type === "range") {
      const start = document.getElementById("log-range-start").value;
      const end = document.getElementById("log-range-end").value;
      if (unit === "ページ") {
        if (start && end) {
          amountStr = start === end ? `p${start}` : `p${start} - ${end}`;
        } else if (start) {
          amountStr = `p${start} -`;
        }
      } else if (unit === "問") {
        if (start && end) {
          amountStr = start === end ? `問${start}` : `問${start} - ${end}`;
        } else if (start) {
          amountStr = `問${start} -`;
        }
      } else {
        if (start && end) {
          amountStr = start === end ? `${start}${unit}` : `${start} - ${end}${unit}`;
        } else if (start) {
          amountStr = `${start}${unit} -`;
        }
      }
    } else {
      const val = document.getElementById("log-amount-val").value;
      if (val) {
        if (unit === "ページ") amountStr = `${val}p`;
        else amountStr = `${val}${unit}`;
      }
    }
    const content = document.getElementById("log-content-input").value;
    const memo = document.getElementById("log-memo-input").value; 
    const finalLog = {
      materialName: logData.material.name,
      category: logData.material.category,
      unit: logData.material.unit,
      startTime: logData.startTime,
      endTime: Date.now(),
      durationMinutes,
      content,
      memo, 
      amount: amountStr,
    };
    // 保存処理
    if (sessionInterval) {
      clearInterval(sessionInterval);
      sessionInterval = null;
    }
    await saveTimelineLog(finalLog);
    activeSession = null;
    localStorage.removeItem("studyReportActiveSession");
    clearSessionFromCloud();
    document.getElementById("log-detail-modal").classList.remove("show");
    document.body.style.overflow = "";
  });

  modal.classList.add("show");
  document.body.style.overflow = "hidden";
}

function toggleProgressInput() {
  const type = document.querySelector(
    'input[name="progress-type"]:checked',
  ).value;
  document.getElementById("progress-input-range").style.display =
    type === "range" ? "block" : "none";
  document.getElementById("progress-input-amount").style.display =
    type === "amount" ? "block" : "none";
}

function closeLogDetailModal() {
  // タイマー走行中なら一時停止して確認
  const isRunning = activeSession && activeSession.sessionStartAt;
  if (activeSession) {
    showConfirm("計測を中断しますか？").then((ok) => {
      if (ok) {
        if (sessionInterval) {
          clearInterval(sessionInterval);
          sessionInterval = null;
        }
        activeSession = null;
        localStorage.removeItem("studyReportActiveSession");
        clearSessionFromCloud();
        document.getElementById("log-detail-modal").classList.remove("show");
        document.body.style.overflow = "";
      }
    });
  } else {
    document.getElementById("log-detail-modal").classList.remove("show");
    document.body.style.overflow = "";
  }
}

// stopSession, cancelSession は後方互換のため残す（active-session-cardから呼ばれる場合）
function stopSession() {
  if (activeSession)
    openLogDetailModal(
      currentPendingLog || {
        material: activeSession.material,
        startTime: activeSession.startedAt,
        isManual: false,
      },
    );
}
function cancelSession() {
  closeLogDetailModal();
}

// ============================================
// Data & Sync
// ============================================

async function saveTimelineLog(logData) {
  const d = new Date(logData.startTime);
  const dateKey = toDateKey(d);
  const newLog = { ...logData, dateKey, createdAt: Date.now() };
  showLoading(true);
  try {
    if (currentUser) {
      await db
        .collection("users")
        .doc(currentUser.uid)
        .collection("timeline")
        .add({
          ...newLog,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } else {
      const logs = getLocalTimeline(dateKey);
      newLog.id = `local_${Date.now()}`;
      logs.push(newLog);
      localStorage.setItem(
        `studyReportTimeline_${dateKey}`,
        JSON.stringify(logs),
      );
    }
 addSyncLog(`記録: ${logData.materialName} ${logData.durationMinutes}分`);
    showPopup("記録しました！");
    isTimelineLoaded = false; // ←★この1行を追加
    loadGlobalTimeline();
  } catch (e) {
    console.error("save error:", e);
    showPopup(`保存エラー: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

function getLocalTimeline(dateKey) {
  try {
    const json = localStorage.getItem(`studyReportTimeline_${dateKey}`);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    return [];
  }
}

async function deleteTimelineLog(id, dateKey) {
  if (!(await showConfirm("この記録を削除しますか？"))) return;
  showLoading(true);
  try {
    if (currentUser) {
      await db
        .collection("users")
        .doc(currentUser.uid)
        .collection("timeline")
        .doc(id)
        .delete();
    } else {
      let logs = getLocalTimeline(dateKey);
      logs = logs.filter((l) => l.id !== id);
      localStorage.setItem(
        `studyReportTimeline_${dateKey}`,
        JSON.stringify(logs),
      );
    }
   addSyncLog(`削除: ログ ${id}`);
    isTimelineLoaded = false; // ←★この1行を追加
    loadGlobalTimeline();
  } catch (e) {
    showPopup(`削除エラー: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

// ============================================
// Report Tab
// ============================================

async function loadReportDataForDate() {
  const dateKey = document.getElementById("report-date").value;
  if (!dateKey) return;
  showLoading(true);
  try {
    let logs = [];
    if (currentUser) {
      const snapshot = await db
        .collection("users")
        .doc(currentUser.uid)
        .collection("timeline")
        .where("dateKey", "==", dateKey)
        .get();
      logs = snapshot.docs.map((doc) => doc.data());
    } else {
      logs = getLocalTimeline(dateKey);
    }
    syncTimelineToReportForm(logs);
    loadDailyComment();
  } catch (e) {
    showPopup(`読み込みエラー: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

function syncTimelineToReportForm(logs) {
  const container = document.getElementById("subjects-container");
  container.innerHTML = "";
  const aggregated = {};
  logs.forEach((log) => {
    const name = log.materialName;
    if (!aggregated[name]) {
      aggregated[name] = {
        name,
        category: log.category || "未分類",
        unit: log.unit,
        minutes: 0,
        contents: [],
        amounts: [],
      };
    }
   aggregated[name].minutes += parseInt(log.durationMinutes || 0);
    if (log.content) aggregated[name].contents.push(log.content);
    // メモは日報に含めないため無視します
    if (log.amount) aggregated[name].amounts.push(log.amount);
  });
  Object.values(aggregated).forEach((item) => {
    const h = Math.floor(item.minutes / 60);
    const m = item.minutes % 60;
    addSubject({
      other: item.name,
      category: item.category,
      unit: item.unit,
      text: item.contents.join("、"),
      amount: item.amounts.join(", "),
      h,
      m,
    });
  });
  if (logs.length === 0) addSubject();
  generateText();
}

// ============================================
// Daily Comment
// ============================================

function getDailyCommentKey(dateKey) {
  const uid = currentUser ? currentUser.uid : "local";
  return `studyReportComment_${uid}_${dateKey}`;
}

function loadDailyComment() {
  const dateKey = document.getElementById("report-date").value;
  if (!dateKey) return;
  const saved = localStorage.getItem(getDailyCommentKey(dateKey)) || "";
  const textarea = document.getElementById("global-comment-text");
  if (textarea) {
    textarea.value = saved;
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }
  generateText();
}

function onCommentInput() {
  const textarea = document.getElementById("global-comment-text");
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
  const dateKey = document.getElementById("report-date").value;
  if (dateKey)
    localStorage.setItem(getDailyCommentKey(dateKey), textarea.value);
  generateText();
}

// ============================================
// Subject Rows
// ============================================

function addSubject(data = null) {
  const div = document.createElement("div");
  div.className = "subject-row";
  const unit = data ? data.unit || "任意" : "任意";
  div.innerHTML = `
        <div class="row-controls">
            <div class="move-btns">
                <button class="move-btn" onclick="moveSubjectUp(this)" title="上へ">▲</button>
                <button class="move-btn" onclick="moveSubjectDown(this)" title="下へ">▼</button>
            </div>
            <button class="remove-btn" onclick="removeRow(this)">削除</button>
        </div>
        <div class="form-group">
            <label>カテゴリ</label>
            <input type="text" class="subject-category-input" value="${data ? escapeHtml(data.category || "") : ""}" placeholder="カテゴリ">
        </div>
        <div class="form-group">
            <label>教材名</label>
            <input type="text" class="subject-select-input" value="${data ? escapeHtml(data.other || "") : ""}" placeholder="教材名">
        </div>
        <div class="form-group">
            <label>内容</label>
            <textarea class="subject-text" placeholder="内容">${data ? escapeHtml(data.text) : ""}</textarea>
        </div>
        <div class="form-group">
            <label>進捗 (${unit})</label>
            <input type="text" class="subject-amount" value="${data ? escapeHtml(data.amount) : ""}" placeholder="進捗">
        </div>
        <div class="form-group">
            <label>時間</label>
            <div class="time-inputs">
                <input type="number" class="time-h" value="${data ? data.h : 0}" min="0">
                <span>時間</span>
                <input type="number" class="time-m" value="${data ? data.m : 0}" min="0" max="59">
                <span>分</span>
            </div>
        </div>`;
  div
    .querySelectorAll("input, textarea")
    .forEach((el) => el.addEventListener("input", generateText));
  document.getElementById("subjects-container").appendChild(div);
}

function removeRow(btn) {
  btn.closest(".subject-row").remove();
  generateText();
}

function moveSubjectUp(btn) {
  const row = btn.closest(".subject-row");
  const prev = row.previousElementSibling;
  if (prev && prev.classList.contains("subject-row")) {
    row.parentNode.insertBefore(row, prev);
    generateText();
  }
}

function moveSubjectDown(btn) {
  const row = btn.closest(".subject-row");
  const next = row.nextElementSibling;
  if (next && next.classList.contains("subject-row")) {
    row.parentNode.insertBefore(next, row);
    generateText();
  }
}

function generateText() {
  const rows = document.querySelectorAll(".subject-row");
  let totalM = 0;
  let body = "";
  let subjectNames = [];
  let validCount = 0;
  rows.forEach((row) => {
    const name = row.querySelector(".subject-select-input").value;
    if (!name) return;
    validCount++;
    const category = row.querySelector(".subject-category-input").value || "未分類";
    const text = row.querySelector(".subject-text").value;
    const amount = row.querySelector(".subject-amount").value;
    const h = parseInt(row.querySelector(".time-h").value) || 0;
    const m = parseInt(row.querySelector(".time-m").value) || 0;
    totalM += h * 60 + m;
    subjectNames.push(name);
    let timeStr = "";
    if (h > 0 && m > 0) timeStr = `${h}時間${m}分`;
    else if (h > 0 && m === 0) timeStr = `${h}時間`;
    else if (h === 0 && m > 0) timeStr = `${m}分`;
    else timeStr = "0分";
    
    // 内容と進捗をまとめる (進捗がある場合は括弧なしで追記)
    let contentStr = text ? `${text}` : "";
    if (amount) {
      contentStr += contentStr ? ` ${amount}` : `${amount}`;
    }
    // 教材名と内容をスペースで繋ぐ
    let nameAndContent = contentStr ? `${name} ${contentStr}` : name;
    
    body += `\n${category}\n${nameAndContent}\n勉強時間 ${timeStr}\n`;
  });


  const th = Math.floor(totalM / 60);
  const tm = totalM % 60;
  const totalEl = document.getElementById("screen-total");
  if (totalEl) totalEl.textContent = `合計: ${th}時間 ${tm}分`;
  const comment = document.getElementById("global-comment-text").value;
  // ヘッダー: 科目がある場合は「今日は〇〇をやりました」形式
  let header =
    subjectNames.length > 0
      ? `今日は${subjectNames.join("と")}をやりました\n`
      : `勉強報告\n`;
  let final = header + body;
  // 合計時間は2科目以上のときのみ表示
 if (validCount >= 2 && totalM > 0) {
    let totalTimeStr = "";
    if (th > 0 && tm > 0) totalTimeStr = `${th}時間${tm}分`;
    else if (th > 0 && tm === 0) totalTimeStr = `${th}時間`;
    else totalTimeStr = `${tm}分`;
    final += `\n合計勉強時間 ${totalTimeStr}\n`;
  }
  if (comment && comment.trim() !== "") final += `\n\n${comment}`;
  const outputEl = document.getElementById("output-text");
  if (outputEl) {
    outputEl.value = final;
    // ▼ テキストをセットした直後に高さを自動調整する
    outputEl.style.height = "auto";
    outputEl.style.height = outputEl.scrollHeight + "px";
  }
}

function copyToClipboard() {
  const t = document.getElementById("output-text");
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(t.value)
      .then(() => showPopup("コピーしました！"));
  } else {
    t.select();
    document.execCommand("copy");
    showPopup("コピーしました！");
  }
}

function resetData() {
  showConfirm("この日の入力をクリアしますか？").then((ok) => {
    if (!ok) return;
    document.getElementById("subjects-container").innerHTML = "";
    addSubject();
    generateText();
  });
}

// ============================================
// Materials
// ============================================

function openMaterialModal(editId = null) {
  document.getElementById("material-modal-title").textContent = editId ? "教材を編集" : "教材を追加";
  document.getElementById("edit-material-id").value = editId || "";
  
  if (editId) {
    const mat = materialsCache.find(m => m.id === editId);
    if (mat) {
      document.getElementById("material-name").value = mat.name || "";
      document.getElementById("material-category").value = mat.category || "英語";
      document.getElementById("material-unit").value = mat.unit || "ページ";
      document.getElementById("preview-img").src = mat.image || "img/default_book_img.png";
    }
  } else {
    document.getElementById("material-name").value = "";
    document.getElementById("material-category").value = "英語";
    document.getElementById("material-unit").value = "ページ";
    document.getElementById("preview-img").src = "img/default_book_img.png";
  }
  
  document.getElementById("material-modal").classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeMaterialModal() {
  document.getElementById("material-modal").classList.remove("show");
  document.body.style.overflow = "";
}

function previewMaterialImage(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const r = new FileReader();
    
    r.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 最大サイズを指定（これ以上大きい画像は縮小されます）
        const MAX_WIDTH = 400;
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;

        // 縦横の比率を保ったままサイズを計算
        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round(height * (MAX_WIDTH / width));
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round(width * (MAX_HEIGHT / height));
            height = MAX_HEIGHT;
          }
        }

        // Canvasを使って画像を縮小描画
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // JPEG形式で圧縮（0.7 は 70%の画質を意味します）
        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.7);
        
        // プレビュー画像にセット（保存時にもこの軽いデータが使われます）
        document.getElementById("preview-img").src = compressedDataUrl;
      };
      img.src = e.target.result;
    };
    
    r.readAsDataURL(file);
  }
}

async function saveMaterial() {
  const name = document.getElementById("material-name").value.trim();
  if (!name) {
    showPopup("教材名を入力してください");
    return;
  }
  showLoading(true);
  const editId = document.getElementById("edit-material-id").value;
  const imgSrc = document.getElementById("preview-img").src;
  const isDefault = imgSrc.includes("default_book_img");
  
  const payload = {
    name,
    category: document.getElementById("material-category").value,
    unit: document.getElementById("material-unit").value,
    image: isDefault ? "img/default_book_img.png" : imgSrc,
    updatedAt: Date.now(),
  };

  if (!editId) {
    payload.createdAt = Date.now();
    payload.order = materialsCache.length; // 新規は末尾
  }
  try {
    if (currentUser) {
      if (editId) {
        await db.collection("users").doc(currentUser.uid).collection("materials").doc(editId).update(payload);
        addSyncLog(`教材編集: ${name}`);
      } else {
        await db.collection("users").doc(currentUser.uid).collection("materials").add(payload);
        addSyncLog(`教材追加: ${name}`);
      }
    } else {
      let list = JSON.parse(localStorage.getItem("studyReportMaterials") || "[]");
      if (editId) {
        list = list.map(item => item.id === editId ? { ...item, ...payload } : item);
        addSyncLog(`教材編集(ローカル): ${name}`);
      } else {
        payload.id = `local_${Date.now()}`;
        list.push(payload);
        addSyncLog(`教材追加(ローカル): ${name}`);
      }
      localStorage.setItem("studyReportMaterials", JSON.stringify(list));
    }
    
    closeMaterialModal();
    await renderMaterials();
    // 管理モーダルが開いていれば再描画
    if (document.getElementById("manage-materials-modal").classList.contains("show")) {
      renderManageMaterialsList();
    }
  } catch (e) {
    showPopup(`保存エラー: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

async function renderMaterials() {
  const displayArea = document.getElementById("materials-section");
  if (!displayArea) return;
  displayArea.innerHTML =
    '<div style="text-align:center;padding:16px;color:var(--text-sub);font-size:0.88rem;">読み込み中...</div>';

  let materials = [];
  try {
    if (currentUser) {
      const s = await db
        .collection("users")
        .doc(currentUser.uid)
        .collection("materials")
        .orderBy("createdAt", "desc")
        .get();
      materials = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    } else {
      const json = localStorage.getItem("studyReportMaterials");
      materials = json ? JSON.parse(json) : [];
    }
  } catch (e) {
    displayArea.innerHTML =
      '<div style="text-align:center;padding:16px;color:var(--danger)">読み込みエラー</div>';
    return;
  }

  // 並び順（order）でソート、無ければcreatedAt等
  materials.sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : 9999;
    const orderB = b.order !== undefined ? b.order : 9999;
    if (orderA !== orderB) return orderA - orderB;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  // キャッシュ更新（タイムライン画像取得用など）
  materialsCache = materials;

  if (materials.length === 0) {
    displayArea.innerHTML =
      '<p style="text-align:center;color:var(--text-sub);font-size:0.88em;padding:16px 0;">教材がありません。「＋ 教材追加」から追加してください。</p>';
    return;
  }

  // カテゴリーグループ化
  const grouped = {};
  materials.forEach((m) => {
    const cat = m.category || "その他";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m);
  });

  displayArea.innerHTML = "";
  Object.entries(grouped).forEach(([cat, items]) => {
    const group = document.createElement("div");
    group.className = "category-group";
    group.innerHTML = `<div class="category-title">${escapeHtml(cat)}</div>`;
    const grid = document.createElement("div");
    grid.className = "materials-grid";
    items.forEach((m) => {
      const card = document.createElement("div");
      card.className = "material-card";
      card.innerHTML = `
                <img src="${m.image || "img/default_book_img.png"}" class="material-thumb" onerror="this.src='img/default_book_img.png'">
                <div class="material-name">${escapeHtml(m.name)}</div>`;
      card.addEventListener("click", () => selectMaterial(m));
      // （※長押し削除処理などを廃止し、通常選択のみにするためコメントアウト）
      // card.addEventListener("contextmenu", (e) => {
      //   e.preventDefault();
      //   deleteMaterial(m);
      // });
      grid.appendChild(card);
    });
    group.appendChild(grid);
    displayArea.appendChild(group);
  });
}

// ----------------------------------------------------
// 教材の管理モーダル
// ----------------------------------------------------

async function openManageMaterialsModal() {
  await renderMaterials(); // 再取得してキャッシュを新しくする
  renderManageMaterialsList();
  document.getElementById("manage-materials-modal").classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeManageMaterialsModal() {
  document.getElementById("manage-materials-modal").classList.remove("show");
  document.body.style.overflow = "";
}

function renderManageMaterialsList() {
  const listContainer = document.getElementById("manage-materials-list");
  if (!listContainer) return;

  if (materialsCache.length === 0) {
    listContainer.innerHTML = '<p style="text-align:center;color:var(--text-sub);padding:20px;">教材がありません</p>';
    return;
  }

  // materialsCacheはすでにorder順にソートされている前提
  listContainer.innerHTML = materialsCache.map((m, index) => `
    <div class="manage-item" data-id="${m.id}">
      <div class="manage-item-drag">
        <button onclick="moveMaterialOrder(${index}, -1)" ${index === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
        <button onclick="moveMaterialOrder(${index}, 1)" ${index === materialsCache.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
      </div>
      <div class="manage-item-content">
        <img src="${m.image || 'img/default_book_img.png'}" class="manage-item-img" onerror="this.src='img/default_book_img.png'">
        <div class="manage-item-text">
          <div class="manage-item-title">${escapeHtml(m.name)}</div>
          <div class="manage-item-meta">${escapeHtml(m.category || 'その他')} | ${escapeHtml(m.unit || 'ページ')}</div>
        </div>
      </div>
      <div class="manage-item-actions">
        <button class="manage-action-btn edit" onclick="openMaterialModal('${m.id}')">編集</button>
        <button class="manage-action-btn delete" onclick="deleteMaterialFromManage('${m.id}')">削除</button>
      </div>
    </div>
  `).join("");
}

async function moveMaterialOrder(currentIndex, direction) {
  const newIndex = currentIndex + direction;
  if (newIndex < 0 || newIndex >= materialsCache.length) return;

  // 配列上で要素を入れ替え
  const temp = materialsCache[currentIndex];
  materialsCache[currentIndex] = materialsCache[newIndex];
  materialsCache[newIndex] = temp;

  // order を振り直して保存
  showLoading(true);
  try {
    for (let i = 0; i < materialsCache.length; i++) {
      materialsCache[i].order = i;
    }

    if (currentUser) {
      // 順番待ちの一括更新 (バッチ)
      const batch = db.batch();
      materialsCache.forEach((m) => {
        const ref = db.collection("users").doc(currentUser.uid).collection("materials").doc(m.id);
        batch.update(ref, { order: m.order });
      });
      await batch.commit();
    } else {
      localStorage.setItem("studyReportMaterials", JSON.stringify(materialsCache));
    }
  } catch (e) {
    showPopup(`並び替え保存エラー: ${e.message}`);
  } finally {
    showLoading(false);
  }

  renderManageMaterialsList();
  renderMaterials(); // トップページの描画も更新しておく
}

async function deleteMaterialFromManage(id) {
  const mat = materialsCache.find(m => m.id === id);
  if (!mat) return;

  if (!(await showConfirm(`「${mat.name}」を削除しますか？\n(過去の記録は消えません)`))) return;

  showLoading(true);
  try {
    if (currentUser) {
      await db.collection("users").doc(currentUser.uid).collection("materials").doc(id).delete();
    } else {
      let list = JSON.parse(localStorage.getItem("studyReportMaterials") || "[]");
      list = list.filter(item => item.id !== id);
      localStorage.setItem("studyReportMaterials", JSON.stringify(list));
    }
    addSyncLog(`教材削除: ${mat.name}`);
    await renderMaterials();
    renderManageMaterialsList();
  } catch (e) {
    showPopup(`削除エラー: ${e.message}`);
  } finally {
    showLoading(false);
  }
}


// ============================================
// Export / Import
// ============================================

async function exportData() {
  document.getElementById("export-modal").classList.add("show");
  document.getElementById("export-with-logs-btn").onclick = () =>
    doExport(true);
  document.getElementById("export-no-logs-btn").onclick = () => doExport(false);
  document.getElementById("export-cancel-btn").onclick = () =>
    document.getElementById("export-modal").classList.remove("show");
}

async function doExport(includeLogs) {
  document.getElementById("export-modal").classList.remove("show");
  showLoading(true);
  try {
    let materials = [];
    let timelines = {};
    if (currentUser) {
      const ms = await db
        .collection("users")
        .doc(currentUser.uid)
        .collection("materials")
        .get();
      materials = ms.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (includeLogs) {
        const tl = await db
          .collection("users")
          .doc(currentUser.uid)
          .collection("timeline")
          .orderBy("createdAt", "desc")
          .limit(500)
          .get();
        tl.docs.forEach((d) => {
          const data = d.data();
          const dk = data.dateKey || "";
          if (!timelines[dk]) timelines[dk] = [];
          timelines[dk].push({ id: d.id, ...data });
        });
      }
    } else {
      const json = localStorage.getItem("studyReportMaterials");
      materials = json ? JSON.parse(json) : [];
      if (includeLogs) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("studyReportTimeline_")) {
            const dk = key.replace("studyReportTimeline_", "");
            try {
              timelines[dk] = JSON.parse(localStorage.getItem(key));
            } catch (e) {}
          }
        }
      }
    }
    const exportObj = {
      version: "2.1.0",
      exportedAt: new Date().toISOString(),
      materials,
      timelines,
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `StudyReport_backup_${toDateKey(new Date())}.rep`;
    a.click();
    URL.revokeObjectURL(url);
    addSyncLog("データ書き出し完了");
    showPopup("書き出しました！");
  } catch (e) {
    showPopup(`書き出しエラー: ${e.message}`);
  } finally {
    showLoading(false);
  }
}

async function importData(fileInput) {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.materials) {
        showPopup("不正なファイル形式です");
        return;
      }
      if (
        !(await showConfirm(
          `バックアップを読み込みますか？\n教材: ${data.materials.length}件`,
        ))
      )
        return;
      showLoading(true);
      if (currentUser) {
        const batch = db.batch();
        const ref = db
          .collection("users")
          .doc(currentUser.uid)
          .collection("materials");
        data.materials.forEach((m) => {
          const { id, ...mData } = m;
          batch.set(ref.doc(), { ...mData, createdAt: Date.now() });
        });
        await batch.commit();
        if (data.timelines) {
          const tlRef = db
            .collection("users")
            .doc(currentUser.uid)
            .collection("timeline");
          for (const [, logs] of Object.entries(data.timelines)) {
            for (const log of logs || []) {
              const { id, ...logData } = log;
              await tlRef.add({ ...logData, createdAt: Date.now() });
            }
          }
        }
      } else {
        const existing = JSON.parse(
          localStorage.getItem("studyReportMaterials") || "[]",
        );
        data.materials.forEach((m) => {
          m.id = `local_${Date.now()}_${Math.random()}`;
          existing.push(m);
        });
        localStorage.setItem("studyReportMaterials", JSON.stringify(existing));
      }
      addSyncLog("データ読み込み完了");
      showPopup("読み込みました！");
      await renderMaterials();
      await loadGlobalTimeline();
    } catch (err) {
      showPopup(`読み込みエラー: ${err.message}`);
    } finally {
      showLoading(false);
      fileInput.value = "";
    }
  };
  reader.readAsText(file);
}

// ============================================
// Sync Log
// ============================================

function addSyncLog(msg) {
  const logs = JSON.parse(localStorage.getItem("studyReportSyncLog") || "[]");
  const now = new Date().toLocaleString("ja-JP");
  logs.unshift(`[${now}] ${msg}`);
  if (logs.length > 50) logs.length = 50;
  localStorage.setItem("studyReportSyncLog", JSON.stringify(logs));
}

function showSyncLog() {
  const logs = JSON.parse(localStorage.getItem("studyReportSyncLog") || "[]");
  const listEl = document.getElementById("sync-log-list");
  listEl.innerHTML =
    logs.length === 0
      ? "<p>ログがありません</p>"
      : logs.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
  closeSettings();
  document.getElementById("sync-log-modal").classList.add("show");
}

function closeSyncLogModal() {
  document.getElementById("sync-log-modal").classList.remove("show");
}

// ============================================
// UI Helpers
// ============================================

function showPopup(msg) {
  document.getElementById("popup-message").textContent = msg;
  const modal = document.getElementById("popup-modal");
  modal.classList.add("show");
  document.getElementById("popup-close-btn").onclick = () =>
    modal.classList.remove("show");
}

function showConfirm(msg) {
  return new Promise((resolve) => {
    document.getElementById("confirm-message").textContent = msg;
    const modal = document.getElementById("confirm-modal");
    modal.classList.add("show");
    document.getElementById("confirm-ok-btn").onclick = () => {
      modal.classList.remove("show");
      resolve(true);
    };
    document.getElementById("confirm-cancel-btn").onclick = () => {
      modal.classList.remove("show");
      resolve(false);
    };
  });
}

// ============================================
// Manage Options (Categories & Units)
// ============================================

const DEFAULT_CATEGORIES = ["数学", "理科","英語"];
const DEFAULT_UNITS = ["ページ", "問", "PART"];

// アプリの起動時・ログイン時に呼ばれる初期化関数
async function loadUserOptions() {
  if (currentUser) {
    try {
      const doc = await db.collection("users").doc(currentUser.uid).get();
      if (doc.exists) {
        const data = doc.data();
        if (data.categories) userCategories = data.categories;
        else userCategories = [...DEFAULT_CATEGORIES];

        if (data.units) userUnits = data.units;
        else userUnits = [...DEFAULT_UNITS];
      } else {
        userCategories = [...DEFAULT_CATEGORIES];
        userUnits = [...DEFAULT_UNITS];
      }
    } catch (e) {
      console.error("オプション読み込みエラー", e);
      _loadLocalOptions();
    }
  } else {
    _loadLocalOptions();
  }
  updateSelectOptions();
}

function _loadLocalOptions() {
  userCategories =
    JSON.parse(localStorage.getItem("studyReportCategories")) || [
      ...DEFAULT_CATEGORIES,
    ];
  userUnits = JSON.parse(localStorage.getItem("studyReportUnits")) || [
    ...DEFAULT_UNITS,
  ];
}

async function saveUserOptions() {
  if (currentUser) {
    try {
      await db
        .collection("users")
        .doc(currentUser.uid)
        .set(
          {
            categories: userCategories,
            units: userUnits,
          },
          { merge: true }
        );
    } catch (e) {
      console.error("オプション保存エラー", e);
    }
  } else {
    localStorage.setItem(
      "studyReportCategories",
      JSON.stringify(userCategories)
    );
    localStorage.setItem("studyReportUnits", JSON.stringify(userUnits));
  }
  updateSelectOptions();
}

function updateSelectOptions() {
  const catHtml = userCategories
    .map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("");
  const unitHtml = userUnits
    .map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`)
    .join("");

  const mCat = document.getElementById("material-category");
  if (mCat) {
    const prev = mCat.value;
    mCat.innerHTML = catHtml;
    if (userCategories.includes(prev)) mCat.value = prev;
  }

  const mUnit = document.getElementById("material-unit");
  if (mUnit) {
    const prev = mUnit.value;
    mUnit.innerHTML = unitHtml;
    if (userUnits.includes(prev)) mUnit.value = prev;
  }
}

// モーダル開閉
function openManageOptionsModal() {
  renderManageOptionsLists();
  document.getElementById("manage-options-modal").classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeManageOptionsModal() {
  document.getElementById("manage-options-modal").classList.remove("show");
  document.body.style.overflow = "";
}

// 描画
function renderManageOptionsLists() {
  const catList = document.getElementById("manage-category-list");
  const unitList = document.getElementById("manage-unit-list");
  if (!catList || !unitList) return;

  catList.innerHTML = userCategories
    .map(
      (c, idx) => `
    <li class="manage-option-item">
      <div class="manage-item-drag">
        <button onclick="moveOption('category', ${idx}, -1)" ${idx === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
        <button onclick="moveOption('category', ${idx}, 1)" ${idx === userCategories.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
      </div>
      <span class="option-name">${escapeHtml(c)}</span>
      <div class="manage-item-actions">
        <button class="manage-action-btn edit" onclick="editOption('category', ${idx})">編集</button>
        <button class="manage-action-btn delete" onclick="removeOption('category', ${idx})">削除</button>
      </div>
    </li>
  `
    )
    .join("");

  unitList.innerHTML = userUnits
    .map(
      (u, idx) => `
    <li class="manage-option-item">
      <div class="manage-item-drag">
        <button onclick="moveOption('unit', ${idx}, -1)" ${idx === 0 ? 'disabled style="opacity:0.3"' : ''}>▲</button>
        <button onclick="moveOption('unit', ${idx}, 1)" ${idx === userUnits.length - 1 ? 'disabled style="opacity:0.3"' : ''}>▼</button>
      </div>
      <span class="option-name">${escapeHtml(u)}</span>
      <div class="manage-item-actions">
        <button class="manage-action-btn edit" onclick="editOption('unit', ${idx})">編集</button>
        <button class="manage-action-btn delete" onclick="removeOption('unit', ${idx})">削除</button>
      </div>
    </li>
  `
    )
    .join("");
}

// オプションの並び替え
async function moveOption(type, currentIndex, direction) {
  const arr = type === "category" ? userCategories : userUnits;
  const newIndex = currentIndex + direction;
  if (newIndex < 0 || newIndex >= arr.length) return;

  const temp = arr[currentIndex];
  arr[currentIndex] = arr[newIndex];
  arr[newIndex] = temp;

  await saveUserOptions();
  renderManageOptionsLists();
}

// オプションの編集
async function editOption(type, index) {
  const arr = type === "category" ? userCategories : userUnits;
  const oldVal = arr[index];
  const newVal = prompt("新しい名前を入力してください:\n(※すでに設定済みの教材には影響しません)", oldVal);

  if (newVal !== null && newVal.trim() !== "" && newVal !== oldVal) {
    if (arr.includes(newVal.trim())) {
      showPopup("すでに同じ名前が存在します");
      return;
    }
    arr[index] = newVal.trim();
    await saveUserOptions();
    renderManageOptionsLists();
  }
}

// アクション
async function addCustomCategory() {
  const input = document.getElementById("new-category-input");
  const val = input.value.trim();
  if (!val) return;
  if (userCategories.includes(val)) {
    showPopup("すでにそのカテゴリは存在します");
    return;
  }
  userCategories.push(val);
  input.value = "";
  await saveUserOptions();
  renderManageOptionsLists();
}

async function addCustomUnit() {
  const input = document.getElementById("new-unit-input");
  const val = input.value.trim();
  if (!val) return;
  if (userUnits.includes(val)) {
    showPopup("すでにその単位は存在します");
    return;
  }
  userUnits.push(val);
  input.value = "";
  await saveUserOptions();
  renderManageOptionsLists();
}

// 削除アクション（標準のものも削除可能に）
async function removeOption(type, index) {
  const confirmMsg =
    "この項目を削除しますか？\n(※すでに使用済みの教材には影響しません)";
  if (!(await showConfirm(confirmMsg))) return;

  if (type === "category") {
    userCategories.splice(index, 1);
  } else if (type === "unit") {
    userUnits.splice(index, 1);
  }
  await saveUserOptions();
  renderManageOptionsLists();
}

// ==========================================
// 日報の手動入力表示の切り替え設定
// ==========================================

// デフォルトはfalse（非表示）。保存された設定があれば読み込む
let isManualInputEnabled = localStorage.getItem("setting_manual_input") === "true";

// 画面の表示状態を更新する関数
function applyManualInputSetting() {
    const container = document.getElementById("subjects-container");
    const controls = document.querySelector("#tab-report .controls");
    const checkbox = document.getElementById("setting-manual-input");
    
    if (checkbox) checkbox.checked = isManualInputEnabled;
    
    if (isManualInputEnabled) {
        if (container) container.style.display = "block";
        if (controls) controls.style.display = "flex";
    } else {
        if (container) container.style.display = "none";
        if (controls) controls.style.display = "none";
    }
}

// チェックボックスを押した時の処理
function toggleManualInput(checked) {
    isManualInputEnabled = checked;
    localStorage.setItem("setting_manual_input", checked ? "true" : "false");
    applyManualInputSetting();
}

// ページ読み込み時に1回実行して初期状態をセット
document.addEventListener("DOMContentLoaded", () => {
    applyManualInputSetting();
});