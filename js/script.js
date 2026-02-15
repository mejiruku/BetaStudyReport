// --- グローバル変数 ---
let activeSession = null;
let sessionInterval = null;
let currentPendingLog = null;
let currentTab = 'timeline';
let currentUser = null;
let saveTimer = null;
let isSaving = false;
let isLoading = false;

// --- 初期化 ---
window.onload = () => {
    // 日付初期化
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const dateInput = document.getElementById("report-date");
    if (dateInput) dateInput.value = today;

    // ストップウォッチ状態復元
    restoreActiveSession();

    // 認証監視
    auth.onAuthStateChanged((user) => {
        currentUser = user;
        updateAuthUI(user);
        const authGuard = document.getElementById("auth-guard-screen");
        const appContainer = document.getElementById("app-container");

        if (user) {
            if (authGuard) authGuard.style.display = "none";
            if (appContainer) appContainer.style.display = "block";
            syncDataOnLogin();
            loadSettings();
            renderMaterials();
            loadGlobalTimeline();
        } else {
            if (authGuard) authGuard.style.display = "flex";
            if (appContainer) appContainer.style.display = "none";
        }
    });

    const commentBox = document.getElementById("global-comment-text");
    if (commentBox) commentBox.addEventListener("input", function() { this.style.height = "auto"; this.style.height = this.scrollHeight + "px"; });
    
    setupEnterKey("auth-email", "auth-action-btn");
    setupEnterKey("auth-password", "auth-action-btn");

    const skipLink = document.getElementById("test-skip-link");
    if (skipLink) {
        let skipTimer = null;
        const startTimer = (e) => { e.preventDefault(); skipLink.style.opacity = "0.5"; skipTimer = setTimeout(skipAuthGuard, 5000); };
        const cancelTimer = () => { if (skipTimer) { clearTimeout(skipTimer); skipTimer = null; } skipLink.style.opacity = "1"; };
        skipLink.addEventListener("mousedown", startTimer);
        skipLink.addEventListener("touchstart", startTimer);
        skipLink.addEventListener("mouseup", cancelTimer);
        skipLink.addEventListener("touchend", cancelTimer);
    }
};

function skipAuthGuard() {
    document.getElementById("auth-guard-screen").style.display = "none";
    document.getElementById("app-container").style.display = "block";
    syncDataOnLogin();
    loadSettings();
    renderMaterials();
    loadGlobalTimeline();
}

// --- Auth Guard Actions ---
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
    try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); } 
    catch (e) { showPopup(`ログイン失敗: ${e.message}`); }
}
async function performEmailSignInGuard() {
    const email = document.getElementById("auth-email").value;
    const password = document.getElementById("auth-password").value;
    try { await auth.signInWithEmailAndPassword(email, password); } 
    catch (e) { showPopup(`ログイン失敗: ${e.message}`); }
}
async function performEmailSignUpGuard() {
    const email = document.getElementById("auth-email").value;
    const password = document.getElementById("auth-password").value;
    if(password.length < 6) return showPopup("パスワードは6文字以上で");
    try { await auth.createUserWithEmailAndPassword(email, password); showPopup("作成しました"); } 
    catch (e) { showPopup(`登録失敗: ${e.message}`); }
}
async function resetPasswordGuard() {
    const email = document.getElementById("auth-email").value;
    try { await auth.sendPasswordResetEmail(email); showPopup("送信しました"); } 
    catch (e) { showPopup(`失敗: ${e.message}`); }
}

// --- Tab Control ---
function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    const btnIndex = tabName === 'timeline' ? 0 : 1;
    document.querySelectorAll('.tab-btn')[btnIndex].classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'report') {
        loadReportDataForDate();
    } else {
        loadGlobalTimeline();
    }
}

// --- Timeline Logic ---
async function loadGlobalTimeline() {
    const listEl = document.getElementById("timeline-list");
    if (!listEl.hasChildNodes()) listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">読み込み中...</div>';

    let logs = [];
    try {
        if (currentUser) {
            const snapshot = await db.collection("users").doc(currentUser.uid)
                .collection("timeline").orderBy("createdAt", "desc").limit(50).get();
            logs = snapshot.docs.map(doc => {
                const d = doc.data();
                return { id: doc.id, ...d, startTimeObj: d.startTime.toDate ? d.startTime.toDate() : new Date(d.startTime) };
            });
        } else {
            logs = getAllLocalTimelines(); 
        }
        renderGlobalTimeline(logs);
    } catch (e) {
        console.error(e);
        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:red;">エラー</div>';
    }
}

function getAllLocalTimelines() {
    let allLogs = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith("studyReportTimeline_")) {
            const arr = JSON.parse(localStorage.getItem(key));
            allLogs = allLogs.concat(arr);
        }
    }
    return allLogs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
                  .map(l => ({...l, startTimeObj: new Date(l.startTime)}));
}

function renderGlobalTimeline(logs) {
    const listEl = document.getElementById("timeline-list");
    if (logs.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:30px; color:#aaa;">まだ記録がありません。<br>「教材を追加」から学習を始めましょう！</div>';
        return;
    }
    let html = "";
    let lastDateStr = "";
    logs.forEach(log => {
        const dateStr = log.startTimeObj.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
        if (dateStr !== lastDateStr) {
            html += `<div class="timeline-date-header">${dateStr}</div>`;
            lastDateStr = dateStr;
        }
        const timeStr = log.startTimeObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        html += `
            <div class="timeline-item">
                <div class="timeline-content">
                    <div class="timeline-time">${timeStr}</div>
                    <div class="timeline-title">${log.materialName}</div>
                    <div class="timeline-detail">${log.amount ? log.amount : ''} ${log.content ? '「' + log.content + '」' : ''}</div>
                </div>
                <div class="timeline-meta">
                    <div class="timeline-duration">${log.durationMinutes}分</div>
                    <button class="timeline-delete" onclick="deleteTimelineLog('${log.id}', '${log.dateKey}')">×</button>
                </div>
            </div>`;
    });
    listEl.innerHTML = html;
}

// --- Stopwatch & Record ---
function selectMaterial(m) {
    if (activeSession) { showPopup("現在計測中です"); return; }
    showConfirm(`「${m.name}」の学習を始めますか？\n\n[OK] ストップウォッチ開始\n[キャンセル] 手動で記録`).then(isTimer => {
        if (isTimer) startSession(m); else openManualLogModal(m);
    });
}
function startSession(m) {
    activeSession = { startTime: Date.now(), material: m };
    localStorage.setItem('studyReportActiveSession', JSON.stringify(activeSession));
    document.getElementById('active-session-card').style.display = 'block';
    document.getElementById('session-material-name').innerText = m.name;
    if(sessionInterval) clearInterval(sessionInterval);
    updateSessionTimer();
    sessionInterval = setInterval(updateSessionTimer, 1000);
}
function updateSessionTimer() {
    if (!activeSession) return;
    const diff = Date.now() - activeSession.startTime;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById('session-timer').innerText = 
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function stopSession() {
    if (!activeSession) return;
    const now = Date.now();
    const minutes = Math.floor((now - activeSession.startTime) / 60000);
    currentPendingLog = { material: activeSession.material, startTime: activeSession.startTime, endTime: now, durationMinutes: minutes < 1 ? 1 : minutes, isManual: false };
    clearInterval(sessionInterval);
    openLogDetailModal(currentPendingLog);
}
function cancelSession() {
    showConfirm("計測中のデータを破棄しますか？").then(ok => {
        if (ok) {
            clearInterval(sessionInterval);
            activeSession = null;
            localStorage.removeItem('studyReportActiveSession');
            document.getElementById('active-session-card').style.display = 'none';
        }
    });
}
function restoreActiveSession() {
    const stored = localStorage.getItem('studyReportActiveSession');
    if (stored) {
        activeSession = JSON.parse(stored);
        document.getElementById('active-session-card').style.display = 'block';
        document.getElementById('session-material-name').innerText = activeSession.material.name;
        updateSessionTimer();
        sessionInterval = setInterval(updateSessionTimer, 1000);
    }
}

// --- Record Modal ---
function openManualLogModal(material) {
    currentPendingLog = { material: material, startTime: Date.now(), endTime: Date.now(), durationMinutes: 0, isManual: true };
    openLogDetailModal(currentPendingLog);
}
function openLogDetailModal(logData) {
    const modal = document.getElementById('log-detail-modal');
    document.getElementById('log-detail-title').innerText = `${logData.material.name} の記録`;
    const unit = logData.material.unit || "ページ";
    document.querySelectorAll('.unit-display').forEach(el => el.innerText = unit);
    document.getElementById('unit-help-range').innerText = `単位: ${unit}`;
    
    document.getElementById('log-range-start').value = "";
    document.getElementById('log-range-end').value = "";
    document.getElementById('log-amount-val').value = "";
    document.getElementById('log-content-input').value = "";
    
    const timeInput = document.getElementById('log-duration-input');
    timeInput.value = logData.durationMinutes === 0 && logData.isManual ? "" : logData.durationMinutes;
    if(logData.isManual) setTimeout(() => timeInput.focus(), 100);

    document.getElementById('progress-type-range').checked = true;
    toggleProgressInput();

    const saveBtn = document.getElementById('log-save-btn');
    const newBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newBtn, saveBtn);

    newBtn.addEventListener('click', async () => {
        const duration = parseInt(document.getElementById('log-duration-input').value);
        if (isNaN(duration) || duration < 0) { alert("時間を正しく入力してください"); return; }
        const type = document.querySelector('input[name="progress-type"]:checked').value;
        let amountStr = "";
        if (type === 'range') {
            const start = document.getElementById('log-range-start').value;
            const end = document.getElementById('log-range-end').value;
            let prefix = unit === "ページ" ? "P" : (unit === "問" ? "No." : "");
            if (start && end) amountStr = `${prefix}${start}〜${prefix}${end}`;
            else if (start) amountStr = `${prefix}${start}〜`;
        } else {
            const val = document.getElementById('log-amount-val').value;
            if (val) amountStr = `${val}${unit}`;
        }
        const content = document.getElementById('log-content-input').value;
        const finalLog = {
            materialName: logData.material.name, category: logData.material.category, unit: logData.material.unit,
            startTime: logData.startTime, endTime: Date.now(), durationMinutes: duration, content: content, amount: amountStr
        };
        await saveTimelineLog(finalLog);
        if (!logData.isManual) {
            activeSession = null;
            localStorage.removeItem('studyReportActiveSession');
            document.getElementById('active-session-card').style.display = 'none';
        }
        closeLogDetailModal();
    });
    modal.classList.add('show');
}
function toggleProgressInput() {
    const type = document.querySelector('input[name="progress-type"]:checked').value;
    if (type === 'range') {
        document.getElementById('progress-input-range').style.display = 'block';
        document.getElementById('progress-input-amount').style.display = 'none';
    } else {
        document.getElementById('progress-input-range').style.display = 'none';
        document.getElementById('progress-input-amount').style.display = 'block';
    }
}
function closeLogDetailModal() {
    document.getElementById('log-detail-modal').classList.remove('show');
    if (activeSession && !sessionInterval) sessionInterval = setInterval(updateSessionTimer, 1000);
}

// --- Data & Sync ---
async function saveTimelineLog(logData) {
    const d = new Date(logData.startTime);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const newLog = { ...logData, dateKey: dateKey, createdAt: Date.now() };
    if (currentUser) {
        await db.collection("users").doc(currentUser.uid).collection("timeline").add({ ...newLog, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    } else {
        const logs = getLocalTimeline(dateKey); newLog.id = Date.now().toString(); logs.push(newLog);
        localStorage.setItem(`studyReportTimeline_${dateKey}`, JSON.stringify(logs));
    }
    loadGlobalTimeline(); showPopup("記録しました！");
}
function getLocalTimeline(dateKey) {
    const json = localStorage.getItem(`studyReportTimeline_${dateKey}`);
    return json ? JSON.parse(json) : [];
}
async function deleteTimelineLog(id, dateKey) {
    if (!await showConfirm("削除しますか？")) return;
    if (currentUser) await db.collection("users").doc(currentUser.uid).collection("timeline").doc(id).delete();
    else { let logs = getLocalTimeline(dateKey); logs = logs.filter(l => l.id !== id); localStorage.setItem(`studyReportTimeline_${dateKey}`, JSON.stringify(logs)); }
    loadGlobalTimeline();
}

async function loadReportDataForDate() {
    const dateKey = document.getElementById("report-date").value;
    let logs = [];
    if (currentUser) {
        const snapshot = await db.collection("users").doc(currentUser.uid).collection("timeline").where("dateKey", "==", dateKey).get();
        logs = snapshot.docs.map(doc => doc.data());
    } else {
        logs = getLocalTimeline(dateKey);
    }
    syncTimelineToReportForm(logs);
}

function syncTimelineToReportForm(logs) {
    const container = document.getElementById("subjects-container");
    container.innerHTML = "";
    const aggregated = {};
    logs.forEach(log => {
        const name = log.materialName;
        if (!aggregated[name]) aggregated[name] = { name: name, category: log.category, unit: log.unit, minutes: 0, contents: [], amounts: [] };
        aggregated[name].minutes += parseInt(log.durationMinutes || 0);
        if (log.content) aggregated[name].contents.push(log.content);
        if (log.amount) aggregated[name].amounts.push(log.amount);
    });
    Object.values(aggregated).forEach(item => {
        const h = Math.floor(item.minutes / 60);
        const m = item.minutes % 60;
        addSubject({ select: "その他", other: item.name, unit: item.unit, text: item.contents.join("、"), amount: item.amounts.join(", "), h: h, m: m });
    });
    if (logs.length === 0) addSubject();
    generateText();
}

// --- Subject Row Helper (Restored Reorder & CSS) ---
function addSubject(data = null) {
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
            <label>教材名</label>
            <input type="text" class="subject-select-input" value="${data ? (data.other || data.select) : ''}" placeholder="教材名">
        </div>
        <div class="form-group">
            <label>内容</label>
            <textarea class="subject-text" placeholder="内容">${data ? data.text : ''}</textarea>
        </div>
        <div class="form-group">
            <label>進捗 (${data ? data.unit : '任意'})</label>
            <input type="text" class="subject-amount" value="${data ? data.amount : ''}" placeholder="進捗">
        </div>
        <div class="form-group">
            <label>時間</label>
            <div class="time-inputs">
                <input type="number" class="time-h" value="${data ? data.h : 0}" style="width:60px; text-align:center;"> 時間 
                <input type="number" class="time-m" value="${data ? data.m : 0}" style="width:60px; text-align:center;"> 分
            </div>
        </div>
    `;
    div.querySelectorAll('input, textarea').forEach(el => el.addEventListener('input', generateText));
    document.getElementById("subjects-container").appendChild(div);
}

function removeRow(btn) { btn.closest(".subject-row").remove(); generateText(); }

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
    rows.forEach(row => {
        const name = row.querySelector(".subject-select-input").value;
        if (!name) return;
        const text = row.querySelector(".subject-text").value;
        const amount = row.querySelector(".subject-amount").value;
        const h = parseInt(row.querySelector(".time-h").value) || 0;
        const m = parseInt(row.querySelector(".time-m").value) || 0;
        totalM += h * 60 + m;
        let timeStr = "";
        if (h > 0) timeStr += `${h}時間`;
        if (m > 0) timeStr += `${m}分`;
        if (!timeStr) timeStr = "0分";
        body += `\n【${name}】\n${text}\n${amount ? amount + ' ' : ''}勉強時間 ${timeStr}\n`;
    });
    const th = Math.floor(totalM / 60);
    const tm = totalM % 60;
    document.getElementById("screen-total").innerText = `合計: ${th}時間 ${tm}分`;
    const comment = document.getElementById("global-comment-text").value;
    const date = document.getElementById("report-date").value;
    let final = `勉強報告 (${date})\n${body}\n合計勉強時間 ${th}時間${tm}分`;
    if (comment) final += `\n\n${comment}`;
    document.getElementById("output-text").value = final;
}

function copyToClipboard() {
    const t = document.getElementById("output-text");
    t.select();
    document.execCommand("copy");
    showPopup("コピーしました");
}
function resetData() {
    if(confirm("入力をクリアしますか？")) {
        document.getElementById("subjects-container").innerHTML = "";
        addSubject();
        generateText();
    }
}

// 汎用UI関数 (省略せず記載)
function showPopup(msg) {
    document.getElementById("popup-message").innerText = msg;
    document.getElementById("popup-modal").classList.add("show");
    document.getElementById("popup-close-btn").onclick = () => document.getElementById("popup-modal").classList.remove("show");
}
function showConfirm(msg) {
    return new Promise(resolve => {
        document.getElementById("confirm-message").innerText = msg;
        document.getElementById("confirm-modal").classList.add("show");
        document.getElementById("confirm-ok-btn").onclick = () => { document.getElementById("confirm-modal").classList.remove("show"); resolve(true); };
        document.getElementById("confirm-cancel-btn").onclick = () => { document.getElementById("confirm-modal").classList.remove("show"); resolve(false); };
    });
}
function openMaterialModal() { document.getElementById("material-modal").classList.add("show"); }
function closeMaterialModal() { document.getElementById("material-modal").classList.remove("show"); }
function previewMaterialImage(input) {
    if (input.files && input.files[0]) {
        const r = new FileReader();
        r.onload = e => document.getElementById("preview-img").src = e.target.result;
        r.readAsDataURL(input.files[0]);
    }
}
async function saveMaterial() {
    const name = document.getElementById("material-name").value;
    if(!name) return alert("名前を入力してください");
    const m = {
        name: name, category: document.getElementById("material-category").value,
        unit: document.getElementById("material-unit").value, image: document.getElementById("preview-img").src, createdAt: Date.now()
    };
    if (currentUser) {
        await db.collection("users").doc(currentUser.uid).collection("materials").add(m);
    } else {
        const list = JSON.parse(localStorage.getItem("studyReportMaterials") || "[]");
        list.push(m);
        localStorage.setItem("studyReportMaterials", JSON.stringify(list));
    }
    closeMaterialModal(); renderMaterials();
}
async function renderMaterials() {
    const displayArea = document.getElementById("materials-section");
    displayArea.innerHTML = "";
    let materials = [];
    if (currentUser) {
        const s = await db.collection("users").doc(currentUser.uid).collection("materials").orderBy("createdAt", "desc").get();
        materials = s.docs.map(d => ({id:d.id, ...d.data()}));
    } else {
        const json = localStorage.getItem("studyReportMaterials"); materials = json ? JSON.parse(json) : [];
    }
    if (materials.length === 0) {
        displayArea.innerHTML = '<p style="text-align:center; color:#999; font-size:0.9em;">教材がありません。「＋」ボタンから追加してください。</p>'; return;
    }
    const grid = document.createElement("div"); grid.className = "materials-grid";
    materials.forEach(m => {
        const card = document.createElement("div"); card.className = "material-card";
        card.innerHTML = `<img src="${m.image || 'img/default_book_img.png'}" class="material-thumb"><div class="material-name">${m.name}</div>`;
        card.onclick = () => selectMaterial(m);
        card.oncontextmenu = (e) => { e.preventDefault(); deleteMaterial(m); };
        grid.appendChild(card);
    });
    displayArea.appendChild(grid);
}
async function deleteMaterial(m) {
    if(!await showConfirm(`教材「${m.name}」を削除しますか？`)) return;
    if(currentUser) { await db.collection("users").doc(currentUser.uid).collection("materials").doc(m.id).delete(); } 
    else { let list = JSON.parse(localStorage.getItem("studyReportMaterials") || "[]"); list = list.filter(item => item.createdAt !== m.createdAt); localStorage.setItem("studyReportMaterials", JSON.stringify(list)); }
    renderMaterials();
}
function setupEnterKey(inputId, buttonId) {
  const input = document.getElementById(inputId); const button = document.getElementById(buttonId);
  if (!input || !button) return;
  input.addEventListener("keydown", function (event) { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); button.click(); } });
}
function updateAuthUI(user) {
    document.getElementById("user-icon").style.display = user ? "block" : "none";
    if(user) document.getElementById("user-icon").src = user.photoURL || "";
    document.getElementById("logout-btn").style.display = user ? "block" : "none";
}
function logout() { auth.signOut().then(() => location.reload()); }
function openSettings() { document.getElementById("settings-modal").classList.add("show"); document.getElementById("app-version-display").innerText = "Ver. 3.3.0"; }
function closeSettings() { document.getElementById("settings-modal").classList.remove("show"); }
async function exportData() {} async function importData(e) {} function showSyncLog() {} function closeSyncLogModal() { document.getElementById("sync-log-modal").classList.remove("show"); }
function syncDataOnLogin() {}