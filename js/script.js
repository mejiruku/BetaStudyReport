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
  {
    length: 11,
  },
  (_, i) => `<option value="${i}">${i}</option>`,
).join("");
const minutesOptions = Array.from(
  {
    length: 12,
  },
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
let isLoading = false;

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
    autoResize(globalCommentInput);
  }

  // Auth State Listener (Auth Guard Logic Implemented Here)
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    updateAuthUI(user);

    // Auth Guard Control
    const authGuard = document.getElementById("auth-guard-screen");
    const appContainer = document.getElementById("app-container");

    if (user) {
      // Logged In: Hide Guard, Show App
      if (authGuard) authGuard.style.display = "none";
      if (appContainer) appContainer.style.display = "block";

      syncDataOnLogin();
      loadSettings();
    } else {
      // Guest Mode: Show Guard, Hide App
      if (authGuard) authGuard.style.display = "flex";
      if (appContainer) appContainer.style.display = "none";
    }
  });

  auth
    .getRedirectResult()
    .then((result) => {
      if (result.user) console.log("Redirect login successful", result.user);
    })
    .catch((error) => {
      console.error("Redirect login failed", error);
      showPopup("ログインに失敗しました(Redirect): " + error.message);
    });
};

// Unsaved changes warning
window.addEventListener("beforeunload", (e) => {
  if (isSaving || saveTimer) {
    e.preventDefault();
    e.returnValue = "";
  }
});

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

// ====== ログインモーダル関連 (既存機能) ======
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
  const modal = document.getElementById("login-modal");
  modal.classList.remove("show");
}

function showEmailForm() {
  const methodSelect = document.getElementById("login-method-select");
  const emailForm = document.getElementById("email-login-form");
  methodSelect.style.display = "none";
  emailForm.style.display = "block";
}

function showMethodSelect() {
  const methodSelect = document.getElementById("login-method-select");
  const emailForm = document.getElementById("email-login-form");
  methodSelect.style.display = "flex";
  emailForm.style.display = "none";
}
async function login() {
  // 既存のログインボタンが押された場合（Auth Guard通過後）
  const confirmed = await showConfirm(
    "ログインすると、現在ローカルに保存されているすべてのデータは削除され、クラウド上のデータに置き換わります。\n本当によろしいですか？",
  );
  if (confirmed) openLoginModal();
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
    showPopup("ログインに失敗しました: " + err.message);
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
  auth
    .createUserWithEmailAndPassword(email, password)
    .then(() => {
      showPopup("アカウントを作成しました！");
    })
    .catch((err) => {
      console.error("Email signup failed", err);
      showPopup("アカウント作成に失敗しました: " + err.message);
    });
}

// ====== Auth Guard 専用ロジック (追加) ======
function toggleAuthMode(mode) {
  const title = document.getElementById("auth-modal-title");
  const btn = document.getElementById("auth-action-btn");
  const links = document.querySelectorAll(".switch-auth-link");
  const signupLink = links[0];
  if (mode === "signup") {
    title.innerText = "新規登録";
    btn.innerText = "登録して始める";
    btn.onclick = performEmailSignUpGuard;
    signupLink.innerHTML = `すでにアカウントをお持ちですか？ <a onclick="toggleAuthMode('login')">ログイン</a>`;
  } else {
    title.innerText = "ログイン";
    btn.innerText = "ログイン";
    btn.onclick = performEmailSignInGuard;
    signupLink.innerHTML = `アカウントをお持ちでないですか？ <a onclick="toggleAuthMode('signup')">新規登録</a>`;
  }
}
async function performGoogleLoginGuard() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (error) {
    console.error("Login failed", error);
    showPopup(`ログイン失敗: ${error.message}`);
  }
}
async function performEmailSignInGuard() {
  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-password").value;
  if (!email || !password) {
    showPopup("メールアドレスとパスワードを入力してください");
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (error) {
    console.error("Login failed", error);
    showPopup(`ログイン失敗: ${error.message}`);
  }
}
async function performEmailSignUpGuard() {
  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-password").value;
  if (!email || !password) {
    showPopup("メールアドレスとパスワードを入力してください");
    return;
  }
  if (password.length < 6) {
    showPopup("パスワードは6文字以上にしてください");
    return;
  }
  try {
    await auth.createUserWithEmailAndPassword(email, password);
    showPopup("アカウントを作成しました！");
  } catch (error) {
    console.error("Signup failed", error);
    showPopup(`登録失敗: ${error.message}`);
  }
}
async function resetPasswordGuard() {
  const email = document.getElementById("auth-email").value;
  if (!email) {
    showPopup("パスワードリセットのため、メールアドレスを入力してください");
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    showPopup(`パスワード再設定メールを送信しました: ${email}`);
  } catch (error) {
    console.error("Reset failed", error);
    showPopup(`送信失敗: ${error.message}`);
  }
}

async function logout() {
  const confirmed = await showConfirm("ログアウトしますか？");
  if (confirmed) {
    auth.signOut().then(() => {
      // Logout successful. onAuthStateChanged handles UI switch.
      // reloadして状態をクリーンにするのが確実
      window.location.reload();
    });
  }
}

dateInput.addEventListener("change", () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  loadData();
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

  const textarea = div.querySelector(".subject-text");
  textarea.addEventListener("input", function () {
    autoResize(this);
    generateText();
  });
  if (initialData) {
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
  if (!isLoading) generateText();
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
  if (validSubjectCount >= 2 && totalMinutes > 0) {
    let totalTimeStr = "";
    if (totalH > 0 && totalM > 0) totalTimeStr = `${totalH}時間${totalM}分`;
    else if (totalH > 0 && totalM === 0) totalTimeStr = `${totalH}時間`;
    else totalTimeStr = `${totalM}分`;
    finalText += `\n合計勉強時間 ${totalTimeStr}\n`;
  }
  if (globalComment.trim() !== "") finalText += `\n\n${globalComment}`;
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
  const changeDetail = detectChanges(dateKey, subjects, comment);
  if (currentUser) {
    saveToFirestoreWithLog(dateKey, subjects, comment, changeDetail);
  } else {
    saveToLocalStorageWithLog(dateKey, subjects, comment, changeDetail);
  }
}

function detectChanges(dateKey, newSubjects, newComment) {
  let oldData = null;
  if (currentUser) {
    oldData = window._lastLoadedData || null;
  } else {
    const allData = getAllData();
    oldData = allData[dateKey] || null;
  }
  if (!oldData) return "新規データを作成";
  const changes = [];
  const oldSubjects = oldData.subjects || [];
  const oldComment = oldData.comment || "";
  const maxLen = Math.max(newSubjects.length, oldSubjects.length);
  for (let i = 0; i < maxLen; i++) {
    const newSub = newSubjects[i];
    const oldSub = oldSubjects[i];
    if (!oldSub && newSub && newSub.select) {
      const subjectName =
        newSub.select === "その他" ? newSub.other || "その他" : newSub.select;
      changes.push(`${subjectName}を追加`);
    } else if (oldSub && !newSub) {
      const subjectName =
        oldSub.select === "その他" ? oldSub.other || "その他" : oldSub.select;
      changes.push(`${subjectName}を削除`);
    } else if (oldSub && newSub) {
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
  if (oldComment !== newComment) {
    if (!oldComment && newComment) changes.push("コメントを追加");
    else if (oldComment && !newComment) changes.push("コメントを削除");
    else changes.push("コメントを編集");
  }
  return changes.length > 0 ? changes.join(", ") : "軽微な変更";
}

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
      addSyncLog("edit", dateKey, changeDetail);
      window._lastLoadedData = {
        subjects,
        comment,
      };
    })
    .catch((err) => {
      console.error("Error saving", err);
      isSaving = false;
      updateSaveStatus("error");
    });
}

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
      updatedAt: Date.now(),
    };
    localStorage.setItem("studyReportAllData", JSON.stringify(allData));
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
  isLoading = true;
  if (currentUser) {
    const requestedDateKey = dateKey;
    db.collection("users")
      .doc(currentUser.uid)
      .collection("reports")
      .doc(dateKey)
      .get()
      .then((doc) => {
        if (dateInput.value !== requestedDateKey) return;
        if (doc.exists) {
          renderData(doc.data());
        } else {
          renderData(null);
        }
      })
      .catch((err) => {
        console.error("Error loading", err);
        if (dateInput.value === requestedDateKey) renderData(null);
      });
  } else {
    // Auth Guardがあるためここには到達しないはずだが、ロジックとして維持
    const allData = getAllData();
    renderData(allData[dateKey]);
  }
}

function renderData(dayData) {
  isLoading = true;
  container.innerHTML = "";
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
    globalCommentInput.value = "";
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
  isLoading = true;
  container.innerHTML = "";
  globalCommentInput.value = "";
  addSubject();
  isLoading = false;
  generateText();
}

function copyToClipboard() {
  const copyTarget = document.getElementById("output-text");
  navigator.clipboard
    .writeText(copyTarget.value)
    .then(() => {
      const specialCode = getSpecialCode();
      const isSpecialCodeEnabled = getSpecialCodeEnabled();
      if (isSpecialCodeEnabled && specialCode && specialCode.trim() !== "") {
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

function getSpecialCodeEnabled() {
  if (currentUser) {
    return window._cachedSpecialCodeEnabled !== false;
  } else {
    return localStorage.getItem("studyReportSpecialCodeEnabled") === "true";
  }
}

function getSpecialCode() {
  if (currentUser) {
    return window._cachedSpecialCode || "";
  } else {
    return localStorage.getItem("studyReportSpecialCode") || "";
  }
}

function openSettings() {
  const modal = document.getElementById("settings-modal");
  const codeInput = document.getElementById("special-code-input");
  const toggle = document.getElementById("special-code-toggle");
  const versionDisplay = document.getElementById("app-version-display");
  if (versionDisplay) {
    const metaVersion = document.querySelector('meta[name="data-app-version"]');
    const version = metaVersion ? metaVersion.getAttribute("content") : "";
    if (version) versionDisplay.textContent = `Ver. ${version}`;
  }
  codeInput.value = getSpecialCode();
  toggle.checked = getSpecialCodeEnabled();
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

function closeSettings() {
  const modal = document.getElementById("settings-modal");
  modal.classList.remove("show");
}
async function saveSettings() {
  const codeInput = document.getElementById("special-code-input");
  const toggle = document.getElementById("special-code-toggle");
  const specialCode = codeInput.value;
  const isEnabled = toggle.checked;
  if (currentUser) {
    try {
      await db.collection("users").doc(currentUser.uid).set(
        {
          specialCode: specialCode,
          specialCodeEnabled: isEnabled,
        },
        {
          merge: true,
        },
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
    localStorage.setItem("studyReportSpecialCode", specialCode);
    localStorage.setItem("studyReportSpecialCodeEnabled", isEnabled);
  }
  closeSettings();
  showPopup("設定を保存しました");
}
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

async function exportData() {
  const exportOption = await showExportConfirm();
  if (exportOption === "cancel") return;
  const includeLogs = exportOption === "with_logs";
  updateSaveStatus("saving");
  try {
    let reportsData = {};
    let logsData = [];
    if (currentUser) {
      const reportsSnapshot = await db
        .collection("users")
        .doc(currentUser.uid)
        .collection("reports")
        .get();
      reportsSnapshot.forEach((doc) => {
        reportsData[doc.id] = doc.data();
      });
      if (includeLogs) {
        const logsSnapshot = await db
          .collection("users")
          .doc(currentUser.uid)
          .collection("logs")
          .get();
        logsData = logsSnapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            ...d,
            createdAt: d.createdAt
              ? d.createdAt.toMillis
                ? d.createdAt.toMillis()
                : d.createdAt
              : null,
          };
        });
      }
    } else {
      const localReports = localStorage.getItem("studyReportAllData");
      if (localReports) {
        reportsData = JSON.parse(localReports);
      }
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
  const blob = new Blob([jsonStr], {
    type: "application/json",
  });
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
          localStorage.setItem(
            "studyReportAllData",
            JSON.stringify(parsed.data.reports),
          );
          saveSyncLogs(parsed.data.logs);
          loadData();
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
    input.value = "";
  };
  reader.readAsText(file);
}

async function importToCloud(dataContainer) {
  updateSaveStatus("saving");
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
    for (const log of logs) {
      const newLog = { ...log };
      if (newLog.createdAt && typeof newLog.createdAt === "number") {
        try {
          newLog.createdAt = new Date(newLog.createdAt);
          if (isNaN(newLog.createdAt.getTime()))
            throw new Error("Invalid Date");
        } catch (e) {
          newLog.createdAt = new Date();
        }
      } else {
        newLog.createdAt = new Date();
      }
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

async function syncDataOnLogin() {
  updateSaveStatus("saving");
  const localData = getAllData();
  if (Object.keys(localData).length === 0) {
    loadData();
    return;
  }
  try {
    const cloudData = await fetchAllCloudData();
    const { toUpload, toDownload } = compareAndMerge(localData, cloudData);
    if (Object.keys(toUpload).length > 0) {
      await uploadToCloud(toUpload);
    }
    localStorage.removeItem("studyReportAllData");
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
  const allDates = new Set([
    ...Object.keys(localData),
    ...Object.keys(cloudData),
  ]);
  allDates.forEach((dateKey) => {
    const local = localData[dateKey];
    const cloud = cloudData[dateKey];
    if (local && !cloud) {
      toUpload[dateKey] = local;
      addSyncLog("upload", dateKey, "ローカルからクラウドへアップロード");
    } else if (!local && cloud) {
      toDownload[dateKey] = cloud;
    } else if (local && cloud) {
      const localTime = local.updatedAt || 0;
      let cloudTime = 0;
      if (cloud.updatedAt) {
        if (cloud.updatedAt.toMillis) {
          cloudTime = cloud.updatedAt.toMillis();
        } else if (typeof cloud.updatedAt === "number") {
          cloudTime = cloud.updatedAt;
        }
      }
      if (localTime > cloudTime) {
        toUpload[dateKey] = local;
        addSyncLog("upload", dateKey, "ローカルが新しいためアップロード");
      } else {
        toDownload[dateKey] = cloud;
      }
    }
  });
  return {
    toUpload,
    toDownload,
  };
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
  // 修正: テンプレートリテラルの閉じ忘れを修正しました
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const logData = {
    timestamp: timestamp,
    action: action,
    date: dateKey || "",
    detail: detail || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (currentUser) {
    db.collection("users")
      .doc(currentUser.uid)
      .collection("logs")
      .add(logData)
      .then(() => console.log("Log added to cloud"))
      .catch((err) => console.error("Failed to add cloud log", err));
  } else {
    const logs = getSyncLogs();
    delete logData.createdAt;
    logs.unshift(logData);
    saveSyncLogs(logs);
  }
}

async function showSyncLog() {
  const modal = document.getElementById("sync-log-modal");
  const logList = document.getElementById("sync-log-list");
  logList.innerHTML = '<div class="sync-log-empty">読み込み中...</div>';
  modal.classList.add("show");
  let logs = [];
  if (currentUser) {
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
          timestamp: data.timestamp,
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
        showSyncLog();
      } catch (err) {
        console.error("Failed to delete logs", err);
        showPopup("ログの削除に失敗しました");
      }
    } else {
      localStorage.removeItem("studyReportSyncLogs");
      showSyncLog();
      showPopup("操作ログを削除しました");
    }
  }
}

// --- エンターキーでのログイン実行 ---
function setupEnterKey(inputId, buttonId) {
  const input = document.getElementById(inputId);
  const button = document.getElementById(buttonId);
  if (!input || !button) return;

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      button.click();
    }
  });
}

// 画面ロード時に設定
document.addEventListener("DOMContentLoaded", () => {
  // Auth Guard Screen (メール/パスワード)
  setupEnterKey("auth-email", "auth-action-btn");
  setupEnterKey("auth-password", "auth-action-btn");

  // Login Modal (メール/パスワード)
  setupEnterKey("login-email", "email-signin-btn");
  setupEnterKey("login-password", "email-signin-btn");
});
