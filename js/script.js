// --- サービスワーカーの登録 ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("Service Worker Registered!", reg))
      .catch((err) => console.log("Service Worker Registration Failed", err));
  });
}

// --- カスタムポップアップ関数 ---
function showPopup(message) {
  const modal = document.getElementById("popup-modal");
  const messageEl = document.getElementById("popup-message");
  const closeBtn = document.getElementById("popup-close-btn");

  if (!modal || !messageEl || !closeBtn) {
    // Fallback to native alert if elements don't exist
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
    if (e.target === modal) {
      closePopup();
    }
  };

  closeBtn.addEventListener("click", closePopup);
  modal.addEventListener("click", handleBackdropClick);
}

// --- カスタム確認ダイアログ関数 ---
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

    const handleOk = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    const handleBackdropClick = (e) => {
      if (e.target === modal) {
        cleanup();
        resolve(false);
      }
    };

    okBtn.addEventListener("click", handleOk);
    cancelBtn.addEventListener("click", handleCancel);
    modal.addEventListener("click", handleBackdropClick);
  });
}

// --- 書き出しオプションダイアログ関数 ---
function showExportConfirm() {
  return new Promise((resolve) => {
    const modal = document.getElementById("export-modal");
    const withLogsBtn = document.getElementById("export-with-logs-btn");
    const noLogsBtn = document.getElementById("export-no-logs-btn");
    const cancelBtn = document.getElementById("export-cancel-btn");

    if (!modal || !withLogsBtn || !noLogsBtn || !cancelBtn) {
      // Fallback
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

    const handleWithLogs = () => {
      cleanup();
      resolve("with_logs");
    };

    const handleNoLogs = () => {
      cleanup();
      resolve("no_logs");
    };

    const handleCancel = () => {
      cleanup();
      resolve("cancel");
    };

    const handleBackdropClick = (e) => {
      if (e.target === modal) {
        cleanup();
        resolve("cancel");
      }
    };

    withLogsBtn.addEventListener("click", handleWithLogs);
    noLogsBtn.addEventListener("click", handleNoLogs);
    cancelBtn.addEventListener("click", handleCancel);
    modal.addEventListener("click", handleBackdropClick);
  });
}

// --- アプリ本体のロジック ---
const subjectList = [
  "選択してください",
  "数学",
  "数I",
  "数A",
  "数II",
  "数B",
  "数C",
  "理科",
  "生物基礎",
  "物理基礎",
  "化学基礎",
  "生物",
  "化学",
  "英語",
  "英コミュ",
  "論評",
  "CS",
  "その他",
];
const mathSubjects = ["数学", "数I", "数A", "数II", "数B", "数C"];
const scienceSubjects = [
  "理科",
  "生物基礎",
  "物理基礎",
  "化学基礎",
  "生物",
  "化学",
];
const englishSubjects = ["英語", "英コミュ", "論評", "CS"];

const hoursOptions = Array.from(
  { length: 11 },
  (_, i) => `<option value="${i}">${i}</option>`,
).join("");
const minutesOptions = Array.from(
  { length: 12 },
  (_, i) => `<option value="${i * 5}">${i * 5}</option>`,
).join("");

const container = document.getElementById("subjects-container");
const outputText = document.getElementById("output-text");
const screenTotal = document.getElementById("screen-total");
const globalCommentInput = document.getElementById("global-comment-text");
const dateInput = document.getElementById("report-date");

// Auth Elements
const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userDisplay = document.getElementById("user-display");
const userIcon = document.getElementById("user-icon");
const saveStatus = document.getElementById("save-status");
let currentUser = null;
let saveTimer = null;
let isSaving = false;
let isLoading = false; // Flag to prevent auto-save during initial load

// デフォルトの日付を今日に設定 & Auth監視
window.onload = () => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const dateInputElement = document.getElementById("report-date");
  if (dateInputElement) {
    dateInputElement.value = today;
  }

  // グローバルコメント欄の自動リサイズ
  if (globalCommentInput) {
    globalCommentInput.addEventListener("input", function () {
      autoResize(this);
      generateText();
    });
    // 初期化
    autoResize(globalCommentInput);
  }

  // Auth State Listener
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    updateAuthUI(user);
    if (user) {
      // Logged In: Perform bidirectional sync
      syncDataOnLogin();
      // 閲覧モード設定を読み込み
      loadViewModePreference();
      // 特殊コード設定を読み込み
      loadSettings();
    } else {
      // Guest Mode: Load from Local Storage
      loadData();
      // 閲覧モード設定を読み込み
      loadViewModePreference();
    }
  });
};

// Unsaved changes warning
window.addEventListener("beforeunload", (e) => {
  if (isSaving || saveTimer) {
    e.preventDefault();
    e.returnValue = ""; // Standard for Chrome
  }
});

function updateSaveStatus(status) {
  if (!saveStatus) return;

  // Clear classes
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
  } else if (status === "unsaved") {
    saveStatus.innerText = "未保存";
  } else {
    saveStatus.innerText = "";
  }
}

function updateAuthUI(user) {
  if (user) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    userDisplay.style.display = "inline-block";
    userDisplay.innerText = user.email;

    if (user.photoURL) {
      userIcon.src = user.photoURL;
      userIcon.style.display = "block";
    } else {
      userIcon.style.display = "none";
    }
  } else {
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    userDisplay.style.display = "none";
    userIcon.style.display = "none";
    userIcon.src = "";
  }
}

async function login() {
  // Warning before login
  const confirmed = await showConfirm(
    "ログインすると、現在ローカルに保存されているすべてのデータは削除され、クラウド上のデータに置き換わります。\n本当によろしいですか？",
  );
  if (confirmed) {
    auth
      .signInWithPopup(provider)
      .then(() => {
        // Successful login will trigger onAuthStateChanged
        // which handles the data wiping.
      })
      .catch((err) => {
        console.error("Login failed", err);
        showPopup("ログインに失敗しました");
      });
  }
}

async function logout() {
  const confirmed = await showConfirm("ログアウトしますか？");
  if (confirmed) {
    auth.signOut().then(() => {
      // Logout successful. onAuthStateChanged handles UI switch.
    });
  }
}

dateInput.addEventListener("change", () => {
  // 日付変更前に保存タイマーをキャンセル（古いデータが新しい日付に保存されるのを防ぐ）
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  loadData();
  // generateTextはloadData -> renderData -> addSubjectで呼ばれるため不要
});

function addSubject(initialData = null) {
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
                    ${subjectList
                      .map((s) => {
                        const val = s === "選択してください" ? "" : s;
                        return `<option value="${val}">${s}</option>`;
                      })
                      .join("")}
                </select>
                <input type="text" class="other-subject-input" style="display:none;" placeholder="教科名を入力" oninput="generateText()">
            </div>
            <div class="form-group"><label>内容</label><textarea class="subject-text" placeholder="今日やったこと"></textarea></div>
            <div class="form-group"><label>勉強時間</label><div class="time-inputs"><select class="time-h" onchange="generateText()">${hoursOptions}</select> 時間 <select class="time-m" onchange="generateText()">${minutesOptions}</select> 分</div></div>`;

  container.appendChild(div);

  // テキストエリアの自動リサイズと更新処理の設定
  const textarea = div.querySelector(".subject-text");
  textarea.addEventListener("input", function () {
    autoResize(this);
    generateText();
  });
  // 初期化時にリサイズ
  if (initialData) {
    // 値セット後にリサイズが必要
    setTimeout(() => autoResize(textarea), 0);
  } else {
    autoResize(textarea);
  }
  if (initialData) {
    div.querySelector(".subject-select").value = initialData.select;
    const otherInput = div.querySelector(".other-subject-input");
    otherInput.value = initialData.other;
    if (initialData.select === "その他") otherInput.style.display = "block";
    div.querySelector(".subject-text").value = initialData.text;
    div.querySelector(".time-h").value = initialData.h;
    div.querySelector(".time-m").value = initialData.m;
  }
  // isLoading中はgenerateTextを呼ばない（保存が発生しない純粋な表示更新は後でまとめて行う）
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

// 教科行を上に移動
function moveSubjectUp(btn) {
  const row = btn.closest(".subject-row");
  const prev = row.previousElementSibling;
  if (prev && prev.classList.contains("subject-row")) {
    row.parentNode.insertBefore(row, prev);
    generateText();
  }
}

// 教科行を下に移動
function moveSubjectDown(btn) {
  const row = btn.closest(".subject-row");
  const next = row.nextElementSibling;
  if (next && next.classList.contains("subject-row")) {
    row.parentNode.insertBefore(next, row);
    generateText();
  }
}

// 閲覧モード状態
let isViewMode = false;

// 閲覧モード切り替え
function toggleViewMode() {
  isViewMode = !isViewMode;
  applyViewMode(isViewMode);
  saveViewModePreference(isViewMode);
}

// 閲覧モードを適用する
function applyViewMode(viewMode) {
  isViewMode = viewMode;
  const container = document.querySelector(".container");
  const toggleBtn = document.getElementById("view-mode-btn");

  if (viewMode) {
    container.classList.add("view-mode");
    toggleBtn.textContent = "編集モードに戻る";
    toggleBtn.classList.add("active");
    // 閲覧モード時はコピーボタンを本文の下に移動
    const copyBtn = document.querySelector(".copy-btn");
    const outputText = document.getElementById("output-text");
    if (copyBtn && outputText) {
      outputText.parentNode.insertBefore(copyBtn, outputText.nextSibling);
    }
  } else {
    container.classList.remove("view-mode");
    toggleBtn.textContent = "閲覧モード";
    toggleBtn.classList.remove("active");
    // 編集モードに戻すときはコピーボタンを元の位置（本文の上）に戻す
    const copyBtn = document.querySelector(".copy-btn");
    const outputText = document.getElementById("output-text");
    if (copyBtn && outputText) {
      outputText.parentNode.insertBefore(copyBtn, outputText);
    }
  }
}

// 閲覧モード設定を保存
function saveViewModePreference(viewMode) {
  if (currentUser) {
    // クラウドに保存
    db.collection("users")
      .doc(currentUser.uid)
      .set(
        {
          viewMode: viewMode,
        },
        { merge: true },
      )
      .then(() => console.log("View mode saved to cloud"))
      .catch((err) => console.error("Failed to save view mode", err));
  } else {
    // ローカルに保存
    localStorage.setItem("studyReportViewMode", viewMode ? "true" : "false");
  }
}

// 閲覧モード設定を読み込み
async function loadViewModePreference() {
  let viewMode = false;

  if (currentUser) {
    // クラウドから読み込み
    try {
      const doc = await db.collection("users").doc(currentUser.uid).get();
      if (doc.exists && doc.data().viewMode !== undefined) {
        viewMode = doc.data().viewMode;
      }
    } catch (err) {
      console.error("Failed to load view mode", err);
    }
  } else {
    // ローカルから読み込み
    const saved = localStorage.getItem("studyReportViewMode");
    viewMode = saved === "true";
  }

  if (viewMode) {
    applyViewMode(true);
  }
}

// 画面表示のみ更新（保存処理なし）- データロード時に使用

function generateText() {
  const rows = document.querySelectorAll(".subject-row");
  let totalMinutes = 0,
    bodyContent = "",
    displayGroups = new Set(),
    saveDataArray = [];
  let validSubjectCount = 0;

  rows.forEach((row) => {
    const selectValue = row.querySelector(".subject-select").value;
    const otherValue = row.querySelector(".other-subject-input").value;
    const text = row.querySelector(".subject-text").value;
    const h = parseInt(row.querySelector(".time-h").value) || 0;
    const m = parseInt(row.querySelector(".time-m").value) || 0;

    saveDataArray.push({
      select: selectValue,
      other: otherValue,
      text: text,
      h: h,
      m: m,
    });

    if (selectValue === "") return;

    validSubjectCount++;
    let subjectDisplayName =
      selectValue === "その他" ? otherValue || "その他" : selectValue;
    totalMinutes += h * 60 + m;

    if (mathSubjects.includes(selectValue)) displayGroups.add("数学");
    else if (scienceSubjects.includes(selectValue)) displayGroups.add("理科");
    else if (englishSubjects.includes(selectValue)) displayGroups.add("英語");
    else displayGroups.add(subjectDisplayName);

    // 時間の文字列作成（0分を隠す）
    let timeStr = "";
    if (h > 0 && m > 0) timeStr = `${h}時間${m}分`;
    else if (h > 0 && m === 0) timeStr = `${h}時間`;
    else if (h === 0 && m > 0) timeStr = `${m}分`;
    else timeStr = `0分`;

    bodyContent += `\n${subjectDisplayName}\n${text}\n勉強時間 ${timeStr}\n`;
  });

  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;
  const globalComment = globalCommentInput.value;
  const currentDateStr = dateInput.value;

  let header =
    displayGroups.size > 0
      ? `今日は${Array.from(displayGroups).join("と")}をやりました\n`
      : `勉強報告\n`;
  let finalText = header + bodyContent;

  // 2教科以上かつ合計が0より大きい場合のみ合計時間を表示 (ヘッダーと重複するが本文用)
  if (validSubjectCount >= 2 && totalMinutes > 0) {
    let totalTimeStr = "";
    if (totalH > 0 && totalM > 0) totalTimeStr = `${totalH}時間${totalM}分`;
    else if (totalH > 0 && totalM === 0) totalTimeStr = `${totalH}時間`;
    else totalTimeStr = `${totalM}分`;
    // 【修正箇所】先頭に \n を追加して改行を入れています
    finalText += `\n合計勉強時間 ${totalTimeStr}\n`;
  }

  if (globalComment.trim() !== "") {
    finalText += `\n\n${globalComment}`;
  }

  screenTotal.innerText = `合計: ${totalH}時間 ${totalM}分`;
  outputText.value = finalText;
  autoResize(outputText);

  if (isLoading) return; // Don't save if we are just loading data

  // Debounced Save
  updateSaveStatus("saving");
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    performSave(currentDateStr, saveDataArray, globalComment);
  }, 1500); // 1.5 second delay
}

function performSave(dateKey, subjects, comment) {
  isSaving = true;
  saveTimer = null;

  // 変更内容を検出してログに記録
  const changeDetail = detectChanges(dateKey, subjects, comment);

  if (currentUser) {
    saveToFirestoreWithLog(dateKey, subjects, comment, changeDetail);
  } else {
    saveToLocalStorageWithLog(dateKey, subjects, comment, changeDetail);
  }
}

// 変更内容を検出する関数
function detectChanges(dateKey, newSubjects, newComment) {
  let oldData = null;

  if (currentUser) {
    // クラウドの場合は直前のキャッシュから取得（ない場合は新規扱い）
    oldData = window._lastLoadedData || null;
  } else {
    // ローカルの場合
    const allData = getAllData();
    oldData = allData[dateKey] || null;
  }

  if (!oldData) {
    return "新規データを作成";
  }

  const changes = [];
  const oldSubjects = oldData.subjects || [];
  const oldComment = oldData.comment || "";

  // 教科の変更を検出
  const maxLen = Math.max(newSubjects.length, oldSubjects.length);
  for (let i = 0; i < maxLen; i++) {
    const newSub = newSubjects[i];
    const oldSub = oldSubjects[i];

    if (!oldSub && newSub && newSub.select) {
      // 新規追加
      const subjectName =
        newSub.select === "その他" ? newSub.other || "その他" : newSub.select;
      changes.push(`${subjectName}を追加`);
    } else if (oldSub && !newSub) {
      // 削除
      const subjectName =
        oldSub.select === "その他" ? oldSub.other || "その他" : oldSub.select;
      changes.push(`${subjectName}を削除`);
    } else if (oldSub && newSub) {
      // 変更を検出
      const oldName =
        oldSub.select === "その他" ? oldSub.other || "その他" : oldSub.select;
      const newName =
        newSub.select === "その他" ? newSub.other || "その他" : newSub.select;

      if (oldSub.select !== newSub.select || oldSub.other !== newSub.other) {
        changes.push(`教科を「${oldName}」→「${newName}」に変更`);
      } else if (oldSub.text !== newSub.text) {
        changes.push(`${newName}: 内容を編集`);
      } else if (oldSub.h !== newSub.h || oldSub.m !== newSub.m) {
        changes.push(`${newName}: 時間を変更`);
      }
    }
  }

  // コメントの変更を検出
  if (oldComment !== newComment) {
    if (!oldComment && newComment) {
      changes.push("コメントを追加");
    } else if (oldComment && !newComment) {
      changes.push("コメントを削除");
    } else {
      changes.push("コメントを編集");
    }
  }

  return changes.length > 0 ? changes.join(", ") : "軽微な変更";
}

// ------ Firestore Saving ------
function saveToFirestoreWithLog(dateKey, subjects, comment, changeDetail) {
  if (!currentUser) {
    isSaving = false;
    return;
  }
  const docRef = db
    .collection("users")
    .doc(currentUser.uid)
    .collection("reports")
    .doc(dateKey);
  docRef
    .set({
      subjects: subjects,
      comment: comment,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .then(() => {
      console.log("Saved to Firestore");
      isSaving = false;
      updateSaveStatus("saved");

      // 変更詳細をログに記録
      addSyncLog("edit", dateKey, changeDetail);

      // 現在のデータをキャッシュ
      window._lastLoadedData = { subjects, comment };
    })
    .catch((err) => {
      console.error("Error saving", err);
      isSaving = false;
      updateSaveStatus("error");
    });
}

// ------ ストレージ関連 (日付対応) ------

// データ構造:
// localStorage['studyReportAllData'] = JSON.stringify({
//    "2025-01-01": { subjects: [...], comment: "..." },
//    "2025-01-02": { subjects: [...], comment: "..." }
// });

function getAllData() {
  const json = localStorage.getItem("studyReportAllData");
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch (e) {
    console.error("Data parse error", e);
    return {};
  }
}

function saveToLocalStorageWithLog(dateKey, subjects, comment, changeDetail) {
  try {
    const allData = getAllData();
    allData[dateKey] = {
      subjects: subjects,
      comment: comment,
      updatedAt: Date.now(), // ミリ秒タイムスタンプ
    };
    localStorage.setItem("studyReportAllData", JSON.stringify(allData));

    // 変更詳細をログに記録
    addSyncLog("edit", dateKey, changeDetail);

    setTimeout(() => {
      isSaving = false;
      updateSaveStatus("saved");
    }, 300);
  } catch (e) {
    console.error(e);
    isSaving = false;
    updateSaveStatus("error");
  }
}

function loadData() {
  const dateKey = dateInput.value;
  if (!dateKey) return;

  // ロード開始時にisLoadingをセット（レースコンディション防止）
  isLoading = true;

  if (currentUser) {
    // Load from Firestore
    const requestedDateKey = dateKey; // クロージャでキャプチャ
    db.collection("users")
      .doc(currentUser.uid)
      .collection("reports")
      .doc(dateKey)
      .get()
      .then((doc) => {
        // ロード中に日付が変わった場合は無視
        if (dateInput.value !== requestedDateKey) {
          return;
        }
        if (doc.exists) {
          const data = doc.data();
          renderData(data);
        } else {
          renderData(null); // No data for this day
        }
      })
      .catch((err) => {
        console.error("Error loading", err);
        if (dateInput.value === requestedDateKey) {
          renderData(null);
        }
      });
  } else {
    // Load from LocalStorage
    const allData = getAllData();
    const dayData = allData[dateKey];
    renderData(dayData);
  }
}

function renderData(dayData) {
  isLoading = true; // Start loading mode
  container.innerHTML = "";

  // 変更検出用にロードしたデータをキャッシュ
  if (dayData) {
    window._lastLoadedData = {
      subjects: dayData.subjects || [],
      comment: dayData.comment || "",
    };
  } else {
    window._lastLoadedData = null;
  }

  if (dayData) {
    globalCommentInput.value = dayData.comment || "";
    if (dayData.subjects && dayData.subjects.length > 0) {
      dayData.subjects.forEach((sub) => addSubject(sub));
    } else {
      addSubject();
    }
  } else {
    // データがない日は空の行を一つ追加
    globalCommentInput.value = "";
    addSubject();
  }

  // データロード完了後、表示を更新（保存はしない）
  generateText();

  // すべてのテキストエリアの高さを調整
  document.querySelectorAll("textarea").forEach((textarea) => {
    autoResize(textarea);
    // DOM描画完了後に確実にリサイズされるように遅延実行
    setTimeout(() => autoResize(textarea), 0);
  });

  isLoading = false; // End loading mode
  updateSaveStatus("saved"); // Initial state is "saved" (sync with DB)
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}

async function resetData() {
  const confirmed = await showConfirm(
    "表示中の日付の入力内容をすべて消去しますか？",
  );
  if (confirmed) {
    const dateKey = dateInput.value;
    const allData = getAllData();

    if (currentUser) {
      // Delete from Firestore
      db.collection("users")
        .doc(currentUser.uid)
        .collection("reports")
        .doc(dateKey)
        .delete()
        .then(() => {
          resetUI();
        })
        .catch((err) => console.error("Error deleting", err));
    } else {
      try {
        // その日のデータを削除
        delete allData[dateKey];
        localStorage.setItem("studyReportAllData", JSON.stringify(allData));
        resetUI();
      } catch (e) {
        console.error(e);
      }
    }
  }
}

function resetUI() {
  isLoading = true; // 保存を防止
  container.innerHTML = "";
  globalCommentInput.value = "";
  addSubject();
  isLoading = false;
  // addSubjectはisLoading=falseの後に呼ばれるのでgenerateTextが実行される
  // 明示的に呼び出す
  generateText();
}

function copyToClipboard() {
  const copyTarget = document.getElementById("output-text");

  navigator.clipboard
    .writeText(copyTarget.value)
    .then(() => {
      // 特殊コードが設定されていれば表示
      const specialCode = getSpecialCode();
      const isSpecialCodeEnabled = getSpecialCodeEnabled();
      if (isSpecialCodeEnabled && specialCode && specialCode.trim() !== "") {
        // 新しいタブで表示
        const newWindow = window.open("", "_blank");
        if (newWindow) {
          newWindow.document.write(specialCode);
          newWindow.document.close();
          showPopup("コピーしました");
        } else {
          showPopup(
            "ポップアップがブロックされました。設定を確認してください。",
          );
        }
      } else {
        showPopup("コピーしました");
      }
    })
    .catch((err) => {
      console.error("Failed to copy text: ", err);
      showPopup("コピーに失敗しました");
    });
}

// ------ 設定機能 ------

// 特殊コード機能が有効かどうかを取得
function getSpecialCodeEnabled() {
  if (currentUser) {
    return window._cachedSpecialCodeEnabled !== false; // Default true if undefined? Or false? Let's say default false if not set, or maintain current behavior (which was always enabled if code existed).
    // Actually, previously it was always enabled if code existed. So default should be true?
    // Let's assume default false for new feature, or true to not break existing user workflow?
    // If I default to true, existing users keep their popup.
    return window._cachedSpecialCodeEnabled === true;
  } else {
    return localStorage.getItem("studyReportSpecialCodeEnabled") === "true";
  }
}

// 特殊コードを取得
function getSpecialCode() {
  if (currentUser) {
    // キャッシュから取得（loadSettingsで読み込み済み）
    return window._cachedSpecialCode || "";
  } else {
    return localStorage.getItem("studyReportSpecialCode") || "";
  }
}

// 設定モーダルを開く
function openSettings() {
  const modal = document.getElementById("settings-modal");
  const codeInput = document.getElementById("special-code-input");
  const toggle = document.getElementById("special-code-toggle");

  codeInput.value = getSpecialCode();
  toggle.checked = getSpecialCodeEnabled();

  // トグルの状態に合わせてテキストエリアの有効/無効を切り替え
  toggleSpecialCodeInput();
  toggle.onchange = toggleSpecialCodeInput;

  modal.classList.add("show");
}

function toggleSpecialCodeInput() {
  const toggle = document.getElementById("special-code-toggle");
  const codeInput = document.getElementById("special-code-input");
  if (toggle.checked) {
    codeInput.disabled = false;
    codeInput.style.opacity = "1";
  } else {
    codeInput.disabled = true;
    codeInput.style.opacity = "0.5";
  }
}

// 設定モーダルを閉じる
function closeSettings() {
  const modal = document.getElementById("settings-modal");
  modal.classList.remove("show");
}

// 設定を保存
async function saveSettings() {
  const codeInput = document.getElementById("special-code-input");
  const toggle = document.getElementById("special-code-toggle");
  const specialCode = codeInput.value;
  const isEnabled = toggle.checked;

  if (currentUser) {
    // クラウドに保存
    try {
      await db.collection("users").doc(currentUser.uid).set(
        {
          specialCode: specialCode,
          specialCodeEnabled: isEnabled,
        },
        { merge: true },
      );
      window._cachedSpecialCode = specialCode;
      window._cachedSpecialCodeEnabled = isEnabled;
      console.log("Settings saved to cloud");
    } catch (err) {
      console.error("Failed to save settings", err);
      showPopup("設定の保存に失敗しました");
      return;
    }
  } else {
    // ローカルに保存
    localStorage.setItem("studyReportSpecialCode", specialCode);
    localStorage.setItem("studyReportSpecialCodeEnabled", isEnabled);
  }

  closeSettings();
  showPopup("設定を保存しました");
}

// 設定を読み込み（ページロード時）
async function loadSettings() {
  if (currentUser) {
    try {
      const doc = await db.collection("users").doc(currentUser.uid).get();
      if (doc.exists) {
        window._cachedSpecialCode = doc.data().specialCode || "";
        window._cachedSpecialCodeEnabled =
          doc.data().specialCodeEnabled === true;
      } else {
        window._cachedSpecialCode = "";
        window._cachedSpecialCodeEnabled = false;
      }
    } catch (err) {
      console.error("Failed to load settings", err);
      window._cachedSpecialCode = "";
    }
  }
}

// ------ エクスポート & インポート ------

async function exportData() {
  // Show export options modal
  const exportOption = await showExportConfirm();
  if (exportOption === "cancel") return;
  const includeLogs = exportOption === "with_logs";

  updateSaveStatus("saving");
  try {
    let reportsData = {};
    let logsData = [];

    if (currentUser) {
      // Cloud Export
      const reportsSnapshot = await db
        .collection("users")
        .doc(currentUser.uid)
        .collection("reports")
        .get();
      reportsSnapshot.forEach((doc) => {
        reportsData[doc.id] = doc.data();
      });

      // Check if user wants logs
      if (includeLogs) {
        const logsSnapshot = await db
          .collection("users")
          .doc(currentUser.uid)
          .collection("logs")
          .get();
        logsData = logsSnapshot.docs.map((doc) => {
          const d = doc.data();
          // 復元時にタイムスタンプ等を正しく扱えるように整形
          return {
            ...d,
            // Firestore Timestamp to easy JSON, though JSON.stringify handles basic objects,
            // importing back needs care if we want serverTimestamp again.
            // For export, we just dump what we have.
            // createdAt might be a complex object, simplify if needed or trust restore logic.
            createdAt: d.createdAt
              ? d.createdAt.toMillis
                ? d.createdAt.toMillis()
                : d.createdAt
              : null,
          };
        });
      }
    } else {
      // Local Export
      const localReports = localStorage.getItem("studyReportAllData");
      if (localReports) {
        reportsData = JSON.parse(localReports);
      }
      // Check if user wants logs
      if (includeLogs) {
        logsData = getSyncLogs();
      }
    }

    const exportObj = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      data: {
        reports: reportsData,
        logs: logsData,
      },
    };

    downloadJSON(
      exportObj,
      `study_report_backup_${new Date().toISOString().split("T")[0]}.rep`,
    );
    updateSaveStatus("saved");
  } catch (err) {
    console.error("Export failed", err);
    showPopup("データ書き出しに失敗しました。");
    updateSaveStatus("error");
  }
}

function downloadJSON(dataObj, filename) {
  const jsonStr = JSON.stringify(dataObj, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const json = e.target.result;
      const parsed = JSON.parse(json);

      // Strict Validation
      if (
        !parsed.data ||
        !parsed.data.reports ||
        !Array.isArray(parsed.data.logs)
      ) {
        throw new Error("Invalid format");
      }

      const confirmed = await showConfirm(
        "現在のデータを上書きして取り込みますか？\n(.rep のファイルのみ対応しています)",
      );
      if (confirmed) {
        if (currentUser) {
          await importToCloud(parsed.data);
        } else {
          // Local Import
          localStorage.setItem(
            "studyReportAllData",
            JSON.stringify(parsed.data.reports),
          );
          saveSyncLogs(parsed.data.logs);

          loadData(); // Reload current view
          showPopup("データの取り込みが完了しました。");
        }
      }
    } catch (err) {
      console.error(err);
      if (err.message === "Invalid format") {
        showPopup(
          "無効なファイル形式です。\n新しい .rep 形式のファイルのみ読み込めます。",
        );
      } else {
        showPopup("ファイルの読み込みに失敗しました。");
      }
    }
    // Reset input
    input.value = "";
  };
  reader.readAsText(file);
}

async function importToCloud(dataContainer) {
  updateSaveStatus("saving");
  // reports and logs
  const reports = dataContainer.reports;
  const logs = dataContainer.logs;

  const reportsRef = db
    .collection("users")
    .doc(currentUser.uid)
    .collection("reports");
  const logsRef = db
    .collection("users")
    .doc(currentUser.uid)
    .collection("logs");

  try {
    const batchSize = 500;
    let batch = db.batch();
    let count = 0;

    // Import Reports
    for (const dateKey of Object.keys(reports)) {
      const docData = reports[dateKey];
      if (!docData.updatedAt) {
        docData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      }
      batch.set(reportsRef.doc(dateKey), docData);
      count++;
      if (count >= batchSize) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }

    // Import Logs (Append)
    for (const log of logs) {
      // Restore timestamp for server
      // If it was exported as millis, convert back to valid timestamp or keep as number
      // Firestore log sort relies on createdAt (serverTimestamp).
      // We'll generate a new serverTimestamp for sorting order in new DB,
      // OR try to respect original createdAt if we can.
      // For now, let's treat them as new entries or just dump data.
      // To avoid complexity, just add() them.

      const newLog = { ...log };
      // Override createdAt so they appear "recently imported" OR keep original?
      // User likely wants to see history.
      // But 'createdAt' usage in showSyncLog is for sorting.
      // Let's use the original 'timestamp' string for display,
      // and use serverTimestamp() for physical sort order if we want them at top?
      // No, we want to maintain history.
      // If we have createdAt from export (millis), use it?
      // Firestore data from JSON will be just numbers.
      // Let's just strip createdAt and let Firestore assign new one?
      // NO, that makes old logs appear new.
      // Let's rely on 'timestamp' string which is YYYY-MM-DD HH:mm.
      // But showSyncLog sorts by 'createdAt'.
      // Simple fix: delete createdAt and let Firestore assign new one (effectively "imported just now"),
      // BUT this loses the chronological sort if multiple logs imported at once.
      // Better: use the numeric value if available.
      if (newLog.createdAt && typeof newLog.createdAt === "number") {
        // Convert millis back to date
        try {
          newLog.createdAt = new Date(newLog.createdAt);
          if (isNaN(newLog.createdAt.getTime())) {
            throw new Error("Invalid Date");
          }
        } catch (e) {
          newLog.createdAt = new Date(); // Fallback
        }
      } else {
        newLog.createdAt = new Date(); // Fallback
      }

      // Generate ID to prevent full duplication? add() auto-generates.
      // Just use add.
      const ref = logsRef.doc();
      batch.set(ref, newLog);
      count++;
      if (count >= batchSize) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    console.log("All data imported to cloud");
    updateSaveStatus("saved");
    loadData();
    showPopup("クラウドへのデータの取り込みが完了しました。");
  } catch (err) {
    console.error("Cloud import failed", err);
    showPopup("一部のデータの取り込みに失敗しました。");
    updateSaveStatus("error");
  }
}

// ------ 双方向同期機能 ------

async function syncDataOnLogin() {
  updateSaveStatus("saving");

  // 1. ローカルデータを取得
  const localData = getAllData();

  // 2. ローカルデータが空なら同期不要、クラウドから読み込むだけ
  if (Object.keys(localData).length === 0) {
    loadData();
    return;
  }

  try {
    // 3. クラウドの全データを取得
    const cloudData = await fetchAllCloudData();

    // 4. 日付ごとにマージ（新しい方を採用）
    const { toUpload, toDownload } = compareAndMerge(localData, cloudData);

    // 5. ローカル → クラウドへアップロード
    if (Object.keys(toUpload).length > 0) {
      await uploadToCloud(toUpload);
    }

    // 6. マージ完了後、ローカルストレージをクリア
    localStorage.removeItem("studyReportAllData");

    // 7. 同期完了ログ
    if (
      Object.keys(toUpload).length > 0 ||
      Object.keys(toDownload).length > 0
    ) {
      addSyncLog(
        "sync",
        "",
        `同期完了: ${Object.keys(toUpload).length}件アップロード, ${Object.keys(toDownload).length}件はクラウドを優先`,
      );
    }

    // 8. 現在の日付のデータを読み込み
    loadData();
  } catch (err) {
    console.error("Sync failed", err);
    updateSaveStatus("error");
    showPopup("同期に失敗しました。クラウドからデータを読み込みます。");
    localStorage.removeItem("studyReportAllData");
    loadData();
  }
}

async function fetchAllCloudData() {
  if (!currentUser) return {};

  const snapshot = await db
    .collection("users")
    .doc(currentUser.uid)
    .collection("reports")
    .get();
  const cloudData = {};
  snapshot.forEach((doc) => {
    cloudData[doc.id] = doc.data();
  });
  return cloudData;
}

function compareAndMerge(localData, cloudData) {
  const toUpload = {};
  const toDownload = {};

  // すべての日付キーを取得
  const allDates = new Set([
    ...Object.keys(localData),
    ...Object.keys(cloudData),
  ]);

  allDates.forEach((dateKey) => {
    const local = localData[dateKey];
    const cloud = cloudData[dateKey];

    if (local && !cloud) {
      // ローカルにのみ存在 → アップロード
      toUpload[dateKey] = local;
      addSyncLog("upload", dateKey, "ローカルからクラウドへアップロード");
    } else if (!local && cloud) {
      // クラウドにのみ存在 → ダウンロード（ログイン後はクラウドから読み込むので何もしない）
      toDownload[dateKey] = cloud;
    } else if (local && cloud) {
      // 両方に存在 → タイムスタンプ比較
      const localTime = local.updatedAt || 0;
      // Firestoreのタイムスタンプをミリ秒に変換
      let cloudTime = 0;
      if (cloud.updatedAt) {
        if (cloud.updatedAt.toMillis) {
          cloudTime = cloud.updatedAt.toMillis();
        } else if (typeof cloud.updatedAt === "number") {
          cloudTime = cloud.updatedAt;
        }
      }

      if (localTime > cloudTime) {
        // ローカルが新しい → アップロード
        toUpload[dateKey] = local;
        addSyncLog("upload", dateKey, "ローカルが新しいためアップロード");
      } else {
        // クラウドが新しいまたは同じ → クラウドを優先
        toDownload[dateKey] = cloud;
      }
    }
  });

  return { toUpload, toDownload };
}

async function uploadToCloud(dataToUpload) {
  if (!currentUser) return;

  const reportsRef = db
    .collection("users")
    .doc(currentUser.uid)
    .collection("reports");
  const promises = [];

  Object.keys(dataToUpload).forEach((dateKey) => {
    const data = dataToUpload[dateKey];
    promises.push(
      reportsRef.doc(dateKey).set({
        subjects: data.subjects,
        comment: data.comment,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }),
    );
  });

  await Promise.all(promises);
}

// ------ 操作ログ機能 ------

function getSyncLogs() {
  const logsJson = localStorage.getItem("studyReportSyncLogs");
  if (!logsJson) return [];
  try {
    return JSON.parse(logsJson);
  } catch (e) {
    return [];
  }
}

function saveSyncLogs(logs) {
  localStorage.setItem("studyReportSyncLogs", JSON.stringify(logs));
}

function addSyncLog(action, dateKey, detail) {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const logData = {
    timestamp: timestamp,
    action: action,
    date: dateKey || "",
    detail: detail || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(), // For cloud sorting
  };

  if (currentUser) {
    // Cloud Log
    db.collection("users")
      .doc(currentUser.uid)
      .collection("logs")
      .add(logData)
      .then(() => console.log("Log added to cloud"))
      .catch((err) => console.error("Failed to add cloud log", err));
  } else {
    // Local Log
    const logs = getSyncLogs();
    // createdAtはローカル保存時は不要または別形式になるため、ここでは除外または無視
    delete logData.createdAt;
    logs.unshift(logData);
    saveSyncLogs(logs);
  }
}

async function showSyncLog() {
  const modal = document.getElementById("sync-log-modal");
  const logList = document.getElementById("sync-log-list");

  // Clear current list and show loading if needed
  logList.innerHTML = '<div class="sync-log-empty">読み込み中...</div>';
  modal.classList.add("show");

  let logs = [];

  if (currentUser) {
    // Fetch from Cloud
    try {
      const snapshot = await db
        .collection("users")
        .doc(currentUser.uid)
        .collection("logs")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();

      logs = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          timestamp: data.timestamp, // Display string
          action: data.action,
          date: data.date,
          detail: data.detail,
        };
      });
    } catch (err) {
      console.error("Failed to fetch logs", err);
      logList.innerHTML =
        '<div class="sync-log-empty">ログの取得に失敗しました</div>';
      return;
    }
  } else {
    // Fetch from Local
    logs = getSyncLogs();
  }

  if (logs.length === 0) {
    logList.innerHTML =
      '<div class="sync-log-empty">操作ログはありません</div>';
  } else {
    logList.innerHTML = logs
      .map((log) => {
        const actionLabel =
          log.action === "upload"
            ? "アップロード"
            : log.action === "download"
              ? "ダウンロード"
              : log.action === "edit"
                ? "編集"
                : log.action === "sync"
                  ? "同期"
                  : log.action;
        return `
                <div class="sync-log-item">
                    <span class="log-time">${log.timestamp}</span>
                    <span class="log-action ${log.action}">[${actionLabel}]</span>
                    ${log.date ? `<span class="log-date">${log.date}</span>` : ""}
                    <div class="log-detail">${log.detail}</div>
                </div>
            `;
      })
      .join("");
  }
}

function closeSyncLogModal() {
  const modal = document.getElementById("sync-log-modal");
  modal.classList.remove("show");
}

async function clearSyncLog() {
  const confirmed = await showConfirm("すべての操作ログを削除しますか？");
  if (confirmed) {
    if (currentUser) {
      // Clear Cloud Logs
      try {
        const collectionRef = db
          .collection("users")
          .doc(currentUser.uid)
          .collection("logs");
        const snapshot = await collectionRef.get();
        const batch = db.batch();

        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });

        await batch.commit();
        showPopup("操作ログを削除しました");
        showSyncLog(); // Reload
      } catch (err) {
        console.error("Failed to delete logs", err);
        showPopup("ログの削除に失敗しました");
      }
    } else {
      // Clear Local Logs
      localStorage.removeItem("studyReportSyncLogs");
      showSyncLog(); // Reload
      showPopup("操作ログを削除しました");
    }
  }
}
