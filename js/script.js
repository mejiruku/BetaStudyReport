// ======================================== 
// StudyReport v2.0.0 - Main JavaScript
// ======================================== 

// --- サービスワーカーの登録 ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("Service Worker Registered!", reg))
      .catch((err) => console.log("Service Worker Registration Failed", err));
  });
}

// ======================================== 
// グローバル変数
// ======================================== 

let currentUser = null;
let saveTimer = null;
let isSaving = false;
let isLoading = false;

// ストップウォッチ
let stopwatchInterval = null;
let stopwatchStartTime = null;
let stopwatchElapsed = 0; // ミリ秒

// タイマー
let timerInterval = null;
let timerEndTime = null;
let timerTotalTime = 0; // ミリ秒
let isTimerMode = false;
let timerDurationMinutes = 0;

// 教材キャッシュ
let materialsCache = [];

// 設定キャッシュ
let settingsCache = {
  timeUnit: '1min',
  specialCode: '',
  specialCodeEnabled: false
};

// カテゴリ色マッピング
const categoryColors = {
  english: '#e74c3c',
  math: '#3498db',
  japanese: '#9b59b6',
  science: '#2ecc71',
  social: '#f39c12',
  other: '#95a5a6'
};

// 教科リスト（日報用）
const subjectList = [
  "選択してください",
  "数学", "数I", "数A", "数II", "数B", "数C",
  "理科", "生物基礎", "物理基礎", "化学基礎", "生物", "化学",
  "英語", "英コミュ", "論評", "CS",
  "その他",
];
const mathSubjects = ["数学", "数I", "数A", "数II", "数B", "数C"];
const scienceSubjects = ["理科", "生物基礎", "物理基礎", "化学基礎", "生物", "化学"];
const englishSubjects = ["英語", "英コミュ", "論評", "CS"];

// ======================================== 
// カスタムポップアップ関数
// ======================================== 

function showPopup(message) {
  const modal = document.getElementById("popup-modal");
  const messageEl = document.getElementById("popup-message");
  const closeBtn = document.getElementById("popup-close-btn");

  if (!modal || !messageEl || !closeBtn) {
    alert(message);
    return;
  }

  messageEl.innerText = message;
  modal.classList.add("show");

  const closePopup = () => {
    modal.classList.remove("show");
    closeBtn.removeEventListener("click", closePopup);
    modal.removeEventListener("click", handleBackdropClick);
  };

  const handleBackdropClick = (e) => {
    if (e.target === modal) closePopup();
  };

  closeBtn.addEventListener("click", closePopup);
  modal.addEventListener("click", handleBackdropClick);
}

function showConfirm(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirm-modal");
    const messageEl = document.getElementById("confirm-message");
    const okBtn = document.getElementById("confirm-ok-btn");
    const cancelBtn = document.getElementById("confirm-cancel-btn");

    if (!modal || !messageEl || !okBtn || !cancelBtn) {
      resolve(confirm(message));
      return;
    }

    messageEl.innerText = message;
    modal.classList.add("show");

    const cleanup = () => {
      modal.classList.remove("show");
      okBtn.removeEventListener("click", handleOk);
      cancelBtn.removeEventListener("click", handleCancel);
      modal.removeEventListener("click", handleBackdropClick);
    };

    const handleOk = () => { cleanup(); resolve(true); };
    const handleCancel = () => { cleanup(); resolve(false); };
    const handleBackdropClick = (e) => { if (e.target === modal) { cleanup(); resolve(false); } };

    okBtn.addEventListener("click", handleOk);
    cancelBtn.addEventListener("click", handleCancel);
    modal.addEventListener("click", handleBackdropClick);
  });
}

function showExportConfirm() {
  return new Promise((resolve) => {
    const modal = document.getElementById("export-modal");
    const withLogsBtn = document.getElementById("export-with-logs-btn");
    const noLogsBtn = document.getElementById("export-no-logs-btn");
    const cancelBtn = document.getElementById("export-cancel-btn");

    if (!modal || !withLogsBtn || !noLogsBtn || !cancelBtn) {
      resolve("cancel");
      return;
    }

    modal.classList.add("show");

    const cleanup = () => {
      modal.classList.remove("show");
      withLogsBtn.removeEventListener("click", handleWithLogs);
      noLogsBtn.removeEventListener("click", handleNoLogs);
      cancelBtn.removeEventListener("click", handleCancel);
      modal.removeEventListener("click", handleBackdropClick);
    };

    const handleWithLogs = () => { cleanup(); resolve("with_logs"); };
    const handleNoLogs = () => { cleanup(); resolve("no_logs"); };
    const handleCancel = () => { cleanup(); resolve("cancel"); };
    const handleBackdropClick = (e) => { if (e.target === modal) { cleanup(); resolve("cancel"); } };

    withLogsBtn.addEventListener("click", handleWithLogs);
    noLogsBtn.addEventListener("click", handleNoLogs);
    cancelBtn.addEventListener("click", handleCancel);
    modal.addEventListener("click", handleBackdropClick);
  });
}

// ======================================== 
// 初期化
// ======================================== 

window.onload = () => {
  // 今日の日付をデフォルトに
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dateInputElement = document.getElementById("report-date");
  if (dateInputElement) {
    dateInputElement.value = today;
  }

  // グローバルコメント欄の自動リサイズ
  const globalCommentInput = document.getElementById("global-comment-text");
  if (globalCommentInput) {
    globalCommentInput.addEventListener("input", function () {
      autoResize(this);
      generateText();
    });
    autoResize(globalCommentInput);
  }

  // 学習記録フォームの時間オプション生成
  generateTimeOptions();

  // アプリバージョン表示
  displayAppVersion();

  // Auth State Listener
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    
    if (user) {
      // ログイン済み：認証ガードを隠してアプリを表示
      document.getElementById('auth-guard-screen').style.display = 'none';
      document.getElementById('app-container').style.display = 'flex';
      
      // ユーザー情報を表示
      updateUserDisplay(user);
      
      // データ読み込み
      loadAllData();
    } else {
      // 未ログイン：認証ガードを表示
      document.getElementById('auth-guard-screen').style.display = 'flex';
      document.getElementById('app-container').style.display = 'none';
    }
  });

  // リダイレクト結果処理
  auth.getRedirectResult().then((result) => {
    if (result.user) {
      console.log("Redirect login successful", result.user);
    }
  }).catch((error) => {
    console.error("Redirect login failed", error);
    showPopup("ログインに失敗しました: " + error.message);
  });
};

// ページ離脱警告
window.addEventListener("beforeunload", (e) => {
  if (isSaving || saveTimer || stopwatchInterval) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ======================================== 
// ユーザー表示更新
// ======================================== 

function updateUserDisplay(user) {
  // ヘッダー
  const userIcon = document.getElementById("user-icon");
  const userDisplay = document.getElementById("user-display");
  
  if (userIcon && user.photoURL) {
    userIcon.src = user.photoURL;
    userIcon.style.display = "block";
  }
  if (userDisplay) {
    userDisplay.innerText = user.email || "";
    userDisplay.style.display = "inline-block";
  }

  // 設定タブ
  const settingsUserIcon = document.getElementById("settings-user-icon");
  const settingsUserEmail = document.getElementById("settings-user-email");
  
  if (settingsUserIcon) {
    settingsUserIcon.src = user.photoURL || "";
    settingsUserIcon.style.display = user.photoURL ? "block" : "none";
  }
  if (settingsUserEmail) {
    settingsUserEmail.innerText = user.email || "";
  }
}

function displayAppVersion() {
  const versionDisplay = document.getElementById("app-version-display");
  if (versionDisplay) {
    const metaVersion = document.querySelector('meta[name="data-app-version"]');
    const version = metaVersion ? metaVersion.getAttribute("content") : "2.0.0";
    versionDisplay.textContent = `Ver. ${version}`;
  }
}

// ======================================== 
// タブ切り替え
// ======================================== 

function switchTab(tabName) {
  // タブコンテンツ切り替え
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  document.getElementById(`tab-${tabName}`).classList.add('active');

  // ナビゲーションボタン切り替え
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    }
  });

  // タブ固有の処理
  if (tabName === 'stats') {
    updateStatsDisplay();
    renderWeeklyChart();
  } else if (tabName === 'materials') {
    renderMaterialsList();
  } else if (tabName === 'settings') {
    loadSettingsUI();
  }
}

// ======================================== 
// 全データ読み込み
// ======================================== 

async function loadAllData() {
  if (!currentUser) return;

  // 設定読み込み
  await loadSettings();

  // 教材読み込み
  await loadMaterials();

  // 日報データ読み込み
  loadData();

  // 統計更新
  updateStatsDisplay();

  // タイムライン更新
  renderTimeline();
}

// ======================================== 
// ストップウォッチ & タイマー機能
// ======================================== 

function toggleTimerMode() {
  isTimerMode = !isTimerMode;
  
  const widget = document.getElementById('stopwatch-widget');
  const display = document.getElementById('stopwatch-display');
  const timerInput = document.getElementById('timer-input-area');
  const modeBtn = document.getElementById('sw-mode-btn');
  
  if (isTimerMode) {
    widget.classList.add('timer-mode');
    display.style.display = 'none';
    timerInput.style.display = 'flex';
    modeBtn.innerText = '⏱'; // 時計アイコン
  } else {
    widget.classList.remove('timer-mode');
    display.style.display = 'block';
    timerInput.style.display = 'none';
    modeBtn.innerText = '⏱';
  }
  
  // モード切替時はリセット
  resetStopwatch();
  resetTimer();
}

function toggleTimerAction() {
  if (isTimerMode) {
    startTimer();
  } else {
    if (stopwatchInterval) {
      pauseStopwatch();
    } else {
      startStopwatch();
    }
  }
}

function resetTimerAction() {
  if (isTimerMode) {
    resetTimer();
  } else {
    resetStopwatch();
  }
}

// --- ストップウォッチ ---

function startStopwatch() {
  if (stopwatchInterval) return;
  
  stopwatchStartTime = Date.now() - stopwatchElapsed;
  stopwatchInterval = setInterval(updateStopwatchDisplay, 100);
  
  document.getElementById('sw-start-btn').innerText = '⏸';
  document.getElementById('sw-start-btn').classList.remove('start');
  document.getElementById('sw-start-btn').classList.add('pause');
}

function pauseStopwatch() {
  if (!stopwatchInterval) return;
  
  clearInterval(stopwatchInterval);
  stopwatchInterval = null;
  stopwatchElapsed = Date.now() - stopwatchStartTime;
  
  document.getElementById('sw-start-btn').innerText = '▶';
  document.getElementById('sw-start-btn').classList.remove('pause');
  document.getElementById('sw-start-btn').classList.add('start');

  // 1分以上なら記録を提案
  if (stopwatchElapsed > 60000) {
    // ユーザー体験を損なわないよう、自動で開くかは検討が必要だが、
    // ここではボタン状態が変わるだけにしておく（ユーザーが記録ボタンを押す）
    // または、明確に「停止して記録」ボタンを設けるのが良いが、
    // 今回は「停止」したタイミングで、記録ボタンを押せば時間が反映されるようにする
  }
}

function resetStopwatch() {
  clearInterval(stopwatchInterval);
  stopwatchInterval = null;
  stopwatchElapsed = 0;
  stopwatchStartTime = null;
  
  document.getElementById('stopwatch-display').innerText = '00:00:00';
  document.getElementById('sw-start-btn').innerText = '▶';
  document.getElementById('sw-start-btn').classList.remove('pause');
  document.getElementById('sw-start-btn').classList.add('start');
}

function updateStopwatchDisplay() {
  const elapsed = Date.now() - stopwatchStartTime;
  const totalSeconds = Math.floor(elapsed / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  document.getElementById('stopwatch-display').innerText = 
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// --- タイマー ---

function startTimer() {
  if (timerInterval) {
    // 動作中は一時停止（今回はシンプルに停止→リセット扱いにするか、一時停止にするか）
    // シンプルに「一時停止」機能を実装
    pauseTimer();
    return;
  }

  // 新規開始の場合
  if (!timerTotalTime) {
    const minutesInput = document.getElementById('timer-minutes');
    const minutes = parseInt(minutesInput.value);
    
    if (!minutes || minutes <= 0) {
      showPopup('時間を設定してください');
      return;
    }
    
    timerDurationMinutes = minutes;
    timerTotalTime = minutes * 60 * 1000;
  }

  // 開始処理
  timerEndTime = Date.now() + timerTotalTime;
  timerInterval = setInterval(updateTimerDisplay, 100);
  
  // 入力欄を隠して時間を表示
  document.getElementById('timer-input-area').style.display = 'none';
  document.getElementById('stopwatch-display').style.display = 'block';
  
  document.getElementById('sw-start-btn').innerText = '⏸';
  document.getElementById('sw-start-btn').classList.remove('start');
  document.getElementById('sw-start-btn').classList.add('pause');
  
  updateTimerDisplay(); // 即時更新
}

function pauseTimer() {
  if (!timerInterval) return;
  
  clearInterval(timerInterval);
  timerInterval = null;
  
  // 残り時間を保持
  const remaining = timerEndTime - Date.now();
  timerTotalTime = remaining > 0 ? remaining : 0;
  
  document.getElementById('sw-start-btn').innerText = '▶';
  document.getElementById('sw-start-btn').classList.remove('pause');
  document.getElementById('sw-start-btn').classList.add('start');
}

function resetTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerTotalTime = 0;
  timerEndTime = null;
  
  // 入力欄を表示
  document.getElementById('timer-input-area').style.display = 'flex';
  document.getElementById('stopwatch-display').style.display = 'none';
  document.getElementById('stopwatch-display').innerText = '00:00:00';
  document.getElementById('timer-minutes').value = '';
  
  document.getElementById('sw-start-btn').innerText = '▶';
  document.getElementById('sw-start-btn').classList.remove('pause');
  document.getElementById('sw-start-btn').classList.add('start');
}

function updateTimerDisplay() {
  const remaining = timerEndTime - Date.now();
  
  if (remaining <= 0) {
    // タイマー終了
    finishTimer();
    return;
  }
  
  const totalSeconds = Math.ceil(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  document.getElementById('stopwatch-display').innerText = 
    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function finishTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerTotalTime = 0;
  
  document.getElementById('stopwatch-display').innerText = '00:00:00';
  document.getElementById('sw-start-btn').innerText = '▶';
  document.getElementById('sw-start-btn').classList.remove('pause');
  document.getElementById('sw-start-btn').classList.add('start');
  
  showPopup('タイマーが終了しました！\n学習を記録しますか？');
  
  // 終了後に記録モーダルを開く
  // showPopupは非同期ではないので、ユーザーアクションを待つ仕組みが必要だが、
  // ここでは簡易的にConfirmを使うか、別途モーダルを作る。
  // 既存のshowConfirmを使う
  setTimeout(async () => {
    const confirmed = await showConfirm(`タイマー終了！\n${timerDurationMinutes}分の学習を記録しますか？`);
    if (confirmed) {
      openRecordModalWithTimer(timerDurationMinutes);
      resetTimer();
    }
  }, 500);
}


// ======================================== 
// 学習記録機能
// ======================================== 

function generateTimeOptions() {
  const hoursSelect = document.getElementById('record-hours');
  const minutesSelect = document.getElementById('record-minutes');
  
  if (hoursSelect) {
    hoursSelect.innerHTML = '';
    for (let i = 0; i <= 12; i++) {
      hoursSelect.innerHTML += `<option value="${i}">${i}</option>`;
    }
  }
  
  if (minutesSelect) {
    minutesSelect.innerHTML = '';
    // 1分単位で生成（設定に応じて表示は変わる）
    for (let i = 0; i < 60; i++) {
      minutesSelect.innerHTML += `<option value="${i}">${i}</option>`;
    }
  }
}

function openRecordModal() {
  const modal = document.getElementById('record-modal');
  const materialSelect = document.getElementById('record-material');
  const datetimeInput = document.getElementById('record-datetime');
  
  // 教材選択肢を更新
  materialSelect.innerHTML = '<option value="">教材を選択してください</option>';
  materialsCache.forEach(m => {
    materialSelect.innerHTML += `<option value="${m.id}" data-unit="${m.unitType}">${m.title}</option>`;
  });
  
  // デフォルト日時を現在に
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  datetimeInput.value = now.toISOString().slice(0, 16);
  
  // 時間リセット
  document.getElementById('record-hours').value = 0;
  document.getElementById('record-minutes').value = 0;
  document.getElementById('record-amount').value = '';
  document.getElementById('record-comment').value = '';
  
  modal.classList.add('show');

  // 教材選択時に単位ラベル更新
  materialSelect.onchange = function() {
    const selected = this.options[this.selectedIndex];
    const unit = selected.dataset.unit || 'ページ';
    document.getElementById('record-unit-label').innerText = unit;
  };
}

function openRecordModalWithStopwatch() {
  openRecordModal();
  
  // ストップウォッチの時間を入力
  const totalMinutes = Math.floor(stopwatchElapsed / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  document.getElementById('record-hours').value = hours;
  document.getElementById('record-minutes').value = minutes;
}

function openRecordModalWithTimer(durationMinutes) {
  openRecordModal();
  
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  
  document.getElementById('record-hours').value = hours;
  document.getElementById('record-minutes').value = minutes;
}

function closeRecordModal() {
  document.getElementById('record-modal').classList.remove('show');
}

async function saveStudyRecord() {
  const materialId = document.getElementById('record-material').value;
  const datetime = document.getElementById('record-datetime').value;
  const hours = parseInt(document.getElementById('record-hours').value) || 0;
  const minutes = parseInt(document.getElementById('record-minutes').value) || 0;
  const amount = parseInt(document.getElementById('record-amount').value) || 0;
  const comment = document.getElementById('record-comment').value;
  
  if (!materialId) {
    showPopup('教材を選択してください');
    return;
  }
  
  if (hours === 0 && minutes === 0) {
    showPopup('学習時間を入力してください');
    return;
  }
  
  // 時間単位設定に応じて切り上げ
  let finalMinutes = hours * 60 + minutes;
  if (settingsCache.timeUnit === '5min') {
    finalMinutes = Math.ceil(finalMinutes / 5) * 5;
  }
  
  const material = materialsCache.find(m => m.id === materialId);
  
  const record = {
    materialId: materialId,
    materialTitle: material ? material.title : '',
    category: material ? material.category : 'other',
    startAt: firebase.firestore.Timestamp.fromDate(new Date(datetime)),
    endAt: firebase.firestore.Timestamp.fromDate(new Date()),
    durationMinutes: finalMinutes,
    amount: amount,
    unit: material ? material.unitType : 'ページ',
    comment: comment,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  try {
    await db.collection('users').doc(currentUser.uid).collection('study_records').add(record);
    
    showPopup('学習記録を保存しました');
    closeRecordModal();
    resetStopwatch();
    
    // 再読み込み
    updateStatsDisplay();
    renderTimeline();
  } catch (err) {
    console.error('Failed to save record', err);
    showPopup('保存に失敗しました');
  }
}

// ======================================== 
// タイムライン表示
// ======================================== 

async function renderTimeline() {
  if (!currentUser) return;
  
  const container = document.getElementById('timeline-list');
  if (!container) return;
  
  try {
    const snapshot = await db.collection('users').doc(currentUser.uid)
      .collection('study_records')
      .orderBy('startAt', 'desc')
      .limit(10)
      .get();
    
    if (snapshot.empty) {
      container.innerHTML = '<p class="empty-message">まだ学習記録がありません</p>';
      return;
    }
    
    let html = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const material = materialsCache.find(m => m.id === data.materialId);
      const color = categoryColors[data.category] || categoryColors.other;
      const startDate = data.startAt ? data.startAt.toDate() : new Date();
      const dateStr = `${startDate.getMonth() + 1}/${startDate.getDate()} ${startDate.getHours()}:${String(startDate.getMinutes()).padStart(2, '0')}`;
      
      html += `
        <div class="timeline-item">
          <div class="timeline-image placeholder" style="background: ${color};">📚</div>
          <div class="timeline-content">
            <div class="timeline-title">${data.materialTitle || '不明な教材'}</div>
            <div class="timeline-meta">
              <span class="timeline-time">${formatDuration(data.durationMinutes)}</span>
              ${data.amount ? `・${data.amount}${data.unit}` : ''}
            </div>
            <div class="timeline-meta">${dateStr}</div>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
  } catch (err) {
    console.error('Failed to load timeline', err);
    container.innerHTML = '<p class="empty-message">読み込みに失敗しました</p>';
  }
}

function formatDuration(minutes) {
  if (!minutes) return '0分';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}時間${m}分`;
  if (h > 0) return `${h}時間`;
  return `${m}分`;
}

// ======================================== 
// 教材管理
// ======================================== 

async function loadMaterials() {
  if (!currentUser) return;
  
  try {
    const snapshot = await db.collection('users').doc(currentUser.uid)
      .collection('materials')
      .orderBy('createdAt', 'desc')
      .get();
    
    materialsCache = [];
    snapshot.forEach(doc => {
      materialsCache.push({ id: doc.id, ...doc.data() });
    });
  } catch (err) {
    console.error('Failed to load materials', err);
  }
}

function renderMaterialsList() {
  const container = document.getElementById('materials-list');
  if (!container) return;
  
  if (materialsCache.length === 0) {
    container.innerHTML = '<p class="empty-message">教材が登録されていません</p>';
    return;
  }
  
  let html = '';
  materialsCache.forEach(m => {
    const color = categoryColors[m.category] || categoryColors.other;
    html += `
      <div class="material-card" onclick="editMaterial('${m.id}')">
        <div class="material-image placeholder" style="background: ${color};">📖</div>
        <div class="material-info">
          <div class="material-title">${m.title}</div>
          <div class="material-meta">${m.unitType}</div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function openMaterialModal() {
  const modal = document.getElementById('material-modal');
  document.getElementById('material-modal-title').innerText = '📚 教材を追加';
  document.getElementById('material-title').value = '';
  document.getElementById('material-category').value = 'english';
  document.getElementById('material-unit').value = 'ページ';
  document.getElementById('material-image-preview').innerHTML = '';
  document.getElementById('material-edit-id').value = '';
  
  modal.classList.add('show');
}

function editMaterial(id) {
  const material = materialsCache.find(m => m.id === id);
  if (!material) return;
  
  const modal = document.getElementById('material-modal');
  document.getElementById('material-modal-title').innerText = '📚 教材を編集';
  document.getElementById('material-title').value = material.title;
  document.getElementById('material-category').value = material.category;
  document.getElementById('material-unit').value = material.unitType;
  document.getElementById('material-edit-id').value = id;
  
  if (material.imageData) {
    document.getElementById('material-image-preview').innerHTML = 
      `<img src="${material.imageData}" alt="Preview">`;
  } else {
    document.getElementById('material-image-preview').innerHTML = '';
  }
  
  modal.classList.add('show');
}

function closeMaterialModal() {
  document.getElementById('material-modal').classList.remove('show');
}

function previewMaterialImage(input) {
  const preview = document.getElementById('material-image-preview');
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

async function saveMaterial() {
  const title = document.getElementById('material-title').value.trim();
  const category = document.getElementById('material-category').value;
  const unitType = document.getElementById('material-unit').value;
  const editId = document.getElementById('material-edit-id').value;
  const imageInput = document.getElementById('material-image');
  
  if (!title) {
    showPopup('教材名を入力してください');
    return;
  }
  
  let imageData = '';
  if (imageInput.files && imageInput.files[0]) {
    imageData = await readFileAsDataURL(imageInput.files[0]);
  } else if (editId) {
    const existing = materialsCache.find(m => m.id === editId);
    imageData = existing ? existing.imageData : '';
  }
  
  const materialData = {
    title: title,
    category: category,
    unitType: unitType,
    imageData: imageData,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  
  try {
    if (editId) {
      await db.collection('users').doc(currentUser.uid).collection('materials').doc(editId).update(materialData);
    } else {
      materialData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('users').doc(currentUser.uid).collection('materials').add(materialData);
    }
    
    showPopup('教材を保存しました');
    closeMaterialModal();
    await loadMaterials();
    renderMaterialsList();
  } catch (err) {
    console.error('Failed to save material', err);
    showPopup('保存に失敗しました');
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ======================================== 
// 統計機能
// ======================================== 

async function updateStatsDisplay() {
  if (!currentUser) return;
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  try {
    const snapshot = await db.collection('users').doc(currentUser.uid)
      .collection('study_records')
      .get();
    
    let todayMinutes = 0;
    let monthMinutes = 0;
    let totalMinutes = 0;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const duration = data.durationMinutes || 0;
      const startDate = data.startAt ? data.startAt.toDate() : null;
      
      totalMinutes += duration;
      
      if (startDate) {
        if (startDate >= todayStart) {
          todayMinutes += duration;
        }
        if (startDate >= monthStart) {
          monthMinutes += duration;
        }
      }
    });
    
    // HOME統計
    document.getElementById('stat-today').innerText = formatDuration(todayMinutes);
    document.getElementById('stat-month').innerText = formatDuration(monthMinutes);
    document.getElementById('stat-total').innerText = formatDuration(totalMinutes);
    
    // 分析タブ統計
    document.getElementById('stats-today-detail').innerText = formatDuration(todayMinutes);
    document.getElementById('stats-month-detail').innerText = formatDuration(monthMinutes);
    document.getElementById('stats-total-detail').innerText = formatDuration(totalMinutes);
    
  } catch (err) {
    console.error('Failed to load stats', err);
  }
}

async function renderWeeklyChart() {
  if (!currentUser) return;
  
  const chartContainer = document.getElementById('weekly-chart');
  const legendContainer = document.getElementById('chart-legend');
  if (!chartContainer) return;
  
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  weekAgo.setHours(0, 0, 0, 0);
  
  try {
    const snapshot = await db.collection('users').doc(currentUser.uid)
      .collection('study_records')
      .where('startAt', '>=', firebase.firestore.Timestamp.fromDate(weekAgo))
      .get();
    
    // 日付ごと・教材ごとにグループ化
    const dayData = {};
    const materialTotals = {};
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekAgo);
      d.setDate(d.getDate() + i);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      dayData[key] = {};
    }
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const startDate = data.startAt ? data.startAt.toDate() : null;
      if (!startDate) return;
      
      const key = `${startDate.getMonth() + 1}/${startDate.getDate()}`;
      const category = data.category || 'other';
      const duration = data.durationMinutes || 0;
      
      if (dayData[key]) {
        dayData[key][category] = (dayData[key][category] || 0) + duration;
      }
      materialTotals[category] = (materialTotals[category] || 0) + duration;
    });
    
    // 最大値を計算
    let maxMinutes = 0;
    Object.values(dayData).forEach(day => {
      const total = Object.values(day).reduce((sum, v) => sum + v, 0);
      if (total > maxMinutes) maxMinutes = total;
    });
    if (maxMinutes === 0) maxMinutes = 60;
    
    // グラフ描画
    let chartHtml = '';
    Object.keys(dayData).forEach(day => {
      const categories = dayData[day];
      let barHtml = '';
      
      Object.keys(categoryColors).forEach(cat => {
        if (categories[cat]) {
          const height = (categories[cat] / maxMinutes) * 100;
          barHtml += `<div class="chart-bar-segment" style="height: ${height}%; background: ${categoryColors[cat]};"></div>`;
        }
      });
      
      chartHtml += `
        <div class="chart-bar-container">
          <div class="chart-bar">${barHtml || '<div class="chart-bar-segment" style="height: 2px; background: #eee;"></div>'}</div>
          <span class="chart-day-label">${day}</span>
        </div>
      `;
    });
    chartContainer.innerHTML = chartHtml;
    
    // 凡例
    let legendHtml = '';
    Object.keys(materialTotals).forEach(cat => {
      const labels = { english: '英語', math: '数学', japanese: '国語', science: '理科', social: '社会', other: 'その他' };
      legendHtml += `
        <div class="legend-item">
          <span class="legend-color" style="background: ${categoryColors[cat]};"></span>
          <span>${labels[cat] || cat}</span>
        </div>
      `;
    });
    if (legendContainer) legendContainer.innerHTML = legendHtml;
    
  } catch (err) {
    console.error('Failed to render chart', err);
  }
}

// ======================================== 
// 設定機能
// ======================================== 

async function loadSettings() {
  if (!currentUser) return;
  
  try {
    const doc = await db.collection('users').doc(currentUser.uid).get();
    if (doc.exists) {
      const data = doc.data();
      settingsCache.timeUnit = data.timeUnit || '1min';
      settingsCache.specialCode = data.specialCode || '';
      settingsCache.specialCodeEnabled = data.specialCodeEnabled === true;
    }
  } catch (err) {
    console.error('Failed to load settings', err);
  }
}

function loadSettingsUI() {
  // 時間単位
  const timeUnitRadios = document.querySelectorAll('input[name="time-unit"]');
  timeUnitRadios.forEach(radio => {
    radio.checked = radio.value === settingsCache.timeUnit;
  });
  
  // 特殊コード
  document.getElementById('special-code-toggle').checked = settingsCache.specialCodeEnabled;
  document.getElementById('special-code-input').value = settingsCache.specialCode;
}

async function saveAllSettings() {
  if (!currentUser) return;
  
  const timeUnit = document.querySelector('input[name="time-unit"]:checked').value;
  const specialCodeEnabled = document.getElementById('special-code-toggle').checked;
  const specialCode = document.getElementById('special-code-input').value;
  
  try {
    await db.collection('users').doc(currentUser.uid).set({
      timeUnit: timeUnit,
      specialCodeEnabled: specialCodeEnabled,
      specialCode: specialCode
    }, { merge: true });
    
    settingsCache.timeUnit = timeUnit;
    settingsCache.specialCodeEnabled = specialCodeEnabled;
    settingsCache.specialCode = specialCode;
    
    showPopup('設定を保存しました');
  } catch (err) {
    console.error('Failed to save settings', err);
    showPopup('保存に失敗しました');
  }
}

// ======================================== 
// ログイン関連
// ======================================== 

function login() {
  openLoginModal();
}

function openLoginModal() {
  const modal = document.getElementById("login-modal");
  const methodSelect = document.getElementById("login-method-select");
  const emailForm = document.getElementById("email-login-form");

  methodSelect.style.display = "flex";
  emailForm.style.display = "none";
  document.getElementById("login-email").value = "";
  document.getElementById("login-password").value = "";

  modal.classList.add("show");
}

function closeLoginModal() {
  document.getElementById("login-modal").classList.remove("show");
}

function showEmailForm() {
  document.getElementById("login-method-select").style.display = "none";
  document.getElementById("email-login-form").style.display = "block";
}

function showMethodSelect() {
  document.getElementById("login-method-select").style.display = "flex";
  document.getElementById("email-login-form").style.display = "none";
}

function performGoogleLogin() {
  closeLoginModal();
  auth.signInWithPopup(provider).catch((err) => {
    console.error("Google login failed", err);
    showPopup("Googleログインに失敗しました");
  });
}

function performEmailSignIn() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    showPopup("メールアドレスとパスワードを入力してください");
    return;
  }

  closeLoginModal();
  auth.signInWithEmailAndPassword(email, password).catch((err) => {
    console.error("Email login failed", err);
    if (err.code === "auth/user-not-found") {
      showPopup("このメールアドレスは登録されていません");
    } else if (err.code === "auth/wrong-password") {
      showPopup("パスワードが間違っています");
    } else {
      showPopup("ログインに失敗しました: " + err.message);
    }
  });
}

function performEmailSignUp() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  if (!email || !password) {
    showPopup("メールアドレスとパスワードを入力してください");
    return;
  }

  if (password.length < 6) {
    showPopup("パスワードは6文字以上にしてください");
    return;
  }

  closeLoginModal();
  auth.createUserWithEmailAndPassword(email, password).then(() => {
    showPopup("アカウントを作成しました！");
  }).catch((err) => {
    console.error("Email signup failed", err);
    if (err.code === "auth/email-already-in-use") {
      showPopup("このメールアドレスは既に使用されています");
    } else {
      showPopup("アカウント作成に失敗しました: " + err.message);
    }
  });
}

async function logout() {
  const confirmed = await showConfirm("ログアウトしますか？");
  if (confirmed) {
    auth.signOut();
  }
}

// ======================================== 
// 日報機能（既存機能の維持）
// ======================================== 

const container = document.getElementById("subjects-container");
const outputText = document.getElementById("output-text");
const screenTotal = document.getElementById("screen-total");
const globalCommentInput = document.getElementById("global-comment-text");
const dateInput = document.getElementById("report-date");
const saveStatus = document.getElementById("save-status");

// 時間オプション生成（日報用）
function getHoursOptions() {
  return Array.from({ length: 13 }, (_, i) => `<option value="${i}">${i}</option>`).join("");
}

function getMinutesOptions() {
  // 設定に応じて1分単位か5分単位か
  if (settingsCache.timeUnit === '5min') {
    return Array.from({ length: 12 }, (_, i) => `<option value="${i * 5}">${i * 5}</option>`).join("");
  } else {
    return Array.from({ length: 60 }, (_, i) => `<option value="${i}">${i}</option>`).join("");
  }
}

if (dateInput) {
  dateInput.addEventListener("change", () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    loadData();
  });
}

function addSubject(initialData = null) {
  if (!container) return;
  
  const div = document.createElement("div");
  div.className = "subject-row";
  div.innerHTML = `
    <div class="row-controls">
      <div class="move-btns">
        <button class="move-btn move-up" onclick="moveSubjectUp(this)" title="上へ移動">▲</button>
        <button class="move-btn move-down" onclick="moveSubjectDown(this)" title="下へ移動">▼</button>
      </div>
      <button class="remove-btn" onclick="removeRow(this)">削除</button>
    </div>
    <div class="form-group">
      <label>教科</label>
      <select class="subject-select" onchange="toggleOtherInput(this)">
        ${subjectList.map((s) => {
          const val = s === "選択してください" ? "" : s;
          return `<option value="${val}">${s}</option>`;
        }).join("")}
      </select>
      <input type="text" class="other-subject-input" style="display:none;" placeholder="教科名を入力" oninput="generateText()">
    </div>
    <div class="form-group"><label>内容</label><textarea class="subject-text" placeholder="今日やったこと"></textarea></div>
    <div class="form-group"><label>勉強時間</label><div class="time-inputs"><select class="time-h" onchange="generateText()">${getHoursOptions()}</select> 時間 <select class="time-m" onchange="generateText()">${getMinutesOptions()}</select> 分</div></div>
  `;

  container.appendChild(div);

  const textarea = div.querySelector(".subject-text");
  textarea.addEventListener("input", function () {
    autoResize(this);
    generateText();
  });
  
  if (initialData) {
    setTimeout(() => autoResize(textarea), 0);
    div.querySelector(".subject-select").value = initialData.select;
    const otherInput = div.querySelector(".other-subject-input");
    otherInput.value = initialData.other;
    if (initialData.select === "その他") otherInput.style.display = "block";
    div.querySelector(".subject-text").value = initialData.text;
    div.querySelector(".time-h").value = initialData.h;
    div.querySelector(".time-m").value = initialData.m;
  } else {
    autoResize(textarea);
  }
  
  if (!isLoading) {
    generateText();
  }
}

function toggleOtherInput(selectElement) {
  const otherInput = selectElement.nextElementSibling;
  if (selectElement.value === "その他") {
    otherInput.style.display = "block";
  } else {
    otherInput.style.display = "none";
    otherInput.value = "";
  }
  generateText();
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
  if (!container || !outputText || !screenTotal) return;
  
  const rows = document.querySelectorAll(".subject-row");
  let totalMinutes = 0, bodyContent = "", displayGroups = new Set(), saveDataArray = [];
  let validSubjectCount = 0;

  rows.forEach((row) => {
    const selectValue = row.querySelector(".subject-select").value;
    const otherValue = row.querySelector(".other-subject-input").value;
    const text = row.querySelector(".subject-text").value;
    const h = parseInt(row.querySelector(".time-h").value) || 0;
    let m = parseInt(row.querySelector(".time-m").value) || 0;
    
    // 5分単位設定時は切り上げ
    if (settingsCache.timeUnit === '5min') {
      m = Math.ceil(m / 5) * 5;
      if (m >= 60) { m = 55; }
    }

    saveDataArray.push({ select: selectValue, other: otherValue, text: text, h: h, m: m });

    if (selectValue === "") return;

    validSubjectCount++;
    let subjectDisplayName = selectValue === "その他" ? otherValue || "その他" : selectValue;
    totalMinutes += h * 60 + m;

    if (mathSubjects.includes(selectValue)) displayGroups.add("数学");
    else if (scienceSubjects.includes(selectValue)) displayGroups.add("理科");
    else if (englishSubjects.includes(selectValue)) displayGroups.add("英語");
    else displayGroups.add(subjectDisplayName);

    let timeStr = "";
    if (h > 0 && m > 0) timeStr = `${h}時間${m}分`;
    else if (h > 0 && m === 0) timeStr = `${h}時間`;
    else if (h === 0 && m > 0) timeStr = `${m}分`;
    else timeStr = `0分`;

    bodyContent += `\n${subjectDisplayName}\n${text}\n勉強時間 ${timeStr}\n`;
  });

  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;
  const globalComment = globalCommentInput ? globalCommentInput.value : "";
  const currentDateStr = dateInput ? dateInput.value : "";

  let header = displayGroups.size > 0
    ? `今日は${Array.from(displayGroups).join("と")}をやりました\n`
    : `勉強報告\n`;
  let finalText = header + bodyContent;

  if (validSubjectCount >= 2 && totalMinutes > 0) {
    let totalTimeStr = "";
    if (totalH > 0 && totalM > 0) totalTimeStr = `${totalH}時間${totalM}分`;
    else if (totalH > 0 && totalM === 0) totalTimeStr = `${totalH}時間`;
    else totalTimeStr = `${totalM}分`;
    finalText += `\n合計勉強時間 ${totalTimeStr}\n`;
  }

  if (globalComment.trim() !== "") {
    finalText += `\n\n${globalComment}`;
  }

  screenTotal.innerText = `合計: ${totalH}時間 ${totalM}分`;
  outputText.value = finalText;
  autoResize(outputText);

  if (isLoading) return;

  updateSaveStatus("saving");
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    performSave(currentDateStr, saveDataArray, globalComment);
  }, 1500);
}

function performSave(dateKey, subjects, comment) {
  isSaving = true;
  saveTimer = null;
  const changeDetail = "データを更新";

  if (currentUser) {
    saveToFirestore(dateKey, subjects, comment);
  } else {
    saveToLocalStorage(dateKey, subjects, comment);
  }
}

function saveToFirestore(dateKey, subjects, comment) {
  if (!currentUser) {
    isSaving = false;
    return;
  }
  const docRef = db.collection("users").doc(currentUser.uid).collection("reports").doc(dateKey);
  docRef.set({
    subjects: subjects,
    comment: comment,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }).then(() => {
    console.log("Saved to Firestore");
    isSaving = false;
    updateSaveStatus("saved");
  }).catch((err) => {
    console.error("Error saving", err);
    isSaving = false;
    updateSaveStatus("error");
  });
}

function getAllData() {
  const json = localStorage.getItem("studyReportAllData");
  if (!json) return {};
  try { return JSON.parse(json); }
  catch (e) { return {}; }
}

function saveToLocalStorage(dateKey, subjects, comment) {
  try {
    const allData = getAllData();
    allData[dateKey] = { subjects: subjects, comment: comment, updatedAt: Date.now() };
    localStorage.setItem("studyReportAllData", JSON.stringify(allData));
    setTimeout(() => { isSaving = false; updateSaveStatus("saved"); }, 300);
  } catch (e) {
    console.error(e);
    isSaving = false;
    updateSaveStatus("error");
  }
}

function loadData() {
  if (!dateInput) return;
  const dateKey = dateInput.value;
  if (!dateKey) return;

  isLoading = true;

  if (currentUser) {
    const requestedDateKey = dateKey;
    db.collection("users").doc(currentUser.uid).collection("reports").doc(dateKey).get().then((doc) => {
      if (dateInput.value !== requestedDateKey) return;
      renderData(doc.exists ? doc.data() : null);
    }).catch((err) => {
      console.error("Error loading", err);
      if (dateInput.value === requestedDateKey) renderData(null);
    });
  } else {
    const allData = getAllData();
    renderData(allData[dateKey]);
  }
}

function renderData(dayData) {
  if (!container) return;
  isLoading = true;
  container.innerHTML = "";

  if (dayData) {
    if (globalCommentInput) globalCommentInput.value = dayData.comment || "";
    if (dayData.subjects && dayData.subjects.length > 0) {
      dayData.subjects.forEach((sub) => addSubject(sub));
    } else {
      addSubject();
    }
  } else {
    if (globalCommentInput) globalCommentInput.value = "";
    addSubject();
  }

  generateText();
  document.querySelectorAll("textarea").forEach((textarea) => {
    autoResize(textarea);
    setTimeout(() => autoResize(textarea), 0);
  });

  isLoading = false;
  updateSaveStatus("saved");
}

function autoResize(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}

async function resetData() {
  const confirmed = await showConfirm("表示中の日付の入力内容をすべて消去しますか？");
  if (!confirmed) return;
  
  const dateKey = dateInput.value;
  
  if (currentUser) {
    db.collection("users").doc(currentUser.uid).collection("reports").doc(dateKey).delete().then(() => {
      resetUI();
    }).catch((err) => console.error("Error deleting", err));
  } else {
    const allData = getAllData();
    delete allData[dateKey];
    localStorage.setItem("studyReportAllData", JSON.stringify(allData));
    resetUI();
  }
}

function resetUI() {
  if (!container) return;
  isLoading = true;
  container.innerHTML = "";
  if (globalCommentInput) globalCommentInput.value = "";
  addSubject();
  isLoading = false;
  generateText();
}

function copyToClipboard() {
  const copyTarget = document.getElementById("output-text");
  if (!copyTarget) return;

  navigator.clipboard.writeText(copyTarget.value).then(() => {
    if (settingsCache.specialCodeEnabled && settingsCache.specialCode.trim() !== "") {
      const newWindow = window.open("", "_blank");
      if (newWindow) {
        newWindow.document.write(settingsCache.specialCode);
        newWindow.document.close();
        showPopup("コピーしました");
      } else {
        showPopup("ポップアップがブロックされました。");
      }
    } else {
      showPopup("コピーしました");
    }
  }).catch((err) => {
    console.error("Failed to copy text: ", err);
    showPopup("コピーに失敗しました");
  });
}

function updateSaveStatus(status) {
  if (!saveStatus) return;
  saveStatus.className = "save-status";
  if (status === "saving") {
    saveStatus.innerText = "保存中...";
    saveStatus.classList.add("saving");
  } else if (status === "saved") {
    saveStatus.innerText = "保存完了";
    saveStatus.classList.add("saved");
  } else if (status === "error") {
    saveStatus.innerText = "保存失敗";
    saveStatus.classList.add("error");
  } else {
    saveStatus.innerText = "";
  }
}

// ======================================== 
// 同期ログ機能
// ======================================== 

function showSyncLog() {
  const modal = document.getElementById("sync-log-modal");
  const listContainer = document.getElementById("sync-log-list");
  
  if (currentUser) {
    db.collection("users").doc(currentUser.uid).collection("logs")
      .orderBy("timestamp", "desc").limit(50).get().then((snapshot) => {
        if (snapshot.empty) {
          listContainer.innerHTML = '<div class="sync-log-empty">ログがありません</div>';
        } else {
          let html = '';
          snapshot.forEach(doc => {
            const data = doc.data();
            const time = data.timestamp ? data.timestamp.toDate().toLocaleString('ja-JP') : '';
            html += `
              <div class="sync-log-item">
                <span class="log-time">${time}</span>
                <span class="log-action ${data.action}">${data.action}</span>
                <div class="log-detail">${data.detail || ''}</div>
              </div>
            `;
          });
          listContainer.innerHTML = html;
        }
      }).catch(err => {
        console.error(err);
        listContainer.innerHTML = '<div class="sync-log-empty">読み込みに失敗しました</div>';
      });
  } else {
    listContainer.innerHTML = '<div class="sync-log-empty">ログイン後に利用可能です</div>';
  }
  
  modal.classList.add("show");
}

function closeSyncLogModal() {
  document.getElementById("sync-log-modal").classList.remove("show");
}

async function clearSyncLog() {
  const confirmed = await showConfirm("すべてのログを削除しますか？");
  if (!confirmed || !currentUser) return;
  
  const snapshot = await db.collection("users").doc(currentUser.uid).collection("logs").get();
  const batch = db.batch();
  snapshot.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  
  document.getElementById("sync-log-list").innerHTML = '<div class="sync-log-empty">ログがありません</div>';
}

// ======================================== 
// エクスポート/インポート
// ======================================== 

async function exportData() {
  const exportOption = await showExportConfirm();
  if (exportOption === "cancel") return;

  updateSaveStatus("saving");
  try {
    let reportsData = {};
    let logsData = [];

    if (currentUser) {
      const reportsSnapshot = await db.collection("users").doc(currentUser.uid).collection("reports").get();
      reportsSnapshot.forEach((doc) => { reportsData[doc.id] = doc.data(); });

      if (exportOption === "with_logs") {
        const logsSnapshot = await db.collection("users").doc(currentUser.uid).collection("logs").get();
        logsData = logsSnapshot.docs.map((doc) => doc.data());
      }
    } else {
      reportsData = getAllData();
    }

    const exportObj = {
      version: "2.0.0",
      exportedAt: new Date().toISOString(),
      reports: reportsData,
      logs: logsData,
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `studyreport_backup_${new Date().toISOString().slice(0, 10)}.rep`;
    a.click();
    URL.revokeObjectURL(url);

    updateSaveStatus("saved");
    showPopup("データを書き出しました");
  } catch (err) {
    console.error("Export failed", err);
    updateSaveStatus("error");
    showPopup("書き出しに失敗しました");
  }
}

async function importData(input) {
  if (!input.files || !input.files[0]) return;

  const file = input.files[0];
  const text = await file.text();

  try {
    const data = JSON.parse(text);
    if (!data.reports) {
      showPopup("無効なファイル形式です");
      return;
    }

    const confirmed = await showConfirm("データをインポートしますか？既存のデータは上書きされます。");
    if (!confirmed) return;

    if (currentUser) {
      const batch = db.batch();
      Object.keys(data.reports).forEach((dateKey) => {
        const docRef = db.collection("users").doc(currentUser.uid).collection("reports").doc(dateKey);
        batch.set(docRef, data.reports[dateKey]);
      });
      await batch.commit();
    } else {
      localStorage.setItem("studyReportAllData", JSON.stringify(data.reports));
    }

    showPopup("データをインポートしました");
    loadData();
  } catch (err) {
    console.error("Import failed", err);
    showPopup("インポートに失敗しました");
  }

  input.value = "";
}
