// ============================================
// StudyReport v2.1.0 - script.js
// SmartSRS準拠のログイン・設定実装
// ============================================

// --- グローバル変数 ---
let activeSession = null;
let sessionInterval = null;
let currentPendingLog = null;
let currentTab = 'timeline';
let currentUser = null;
// 教材キャッシュ（画像をタイムラインで使うため）
let materialsCache = [];

// ============================================
// Loading / Offline
// ============================================

function showLoading(show = true) {
    const el = document.getElementById('loading');
    if (!el) return;
    if (show) { el.classList.remove('hidden'); }
    else { el.classList.add('hidden'); }
}

window.addEventListener('online', () => {
    const b = document.getElementById('offline-banner');
    if (b) b.style.display = 'none';
});
window.addEventListener('offline', () => {
    const b = document.getElementById('offline-banner');
    if (b) b.style.display = 'block';
});

if (!navigator.onLine) {
    const b = document.getElementById('offline-banner');
    if (b) b.style.display = 'block';
}

// ============================================
// ビュー切り替え (SmartSRS と同じ方式)
// ============================================

function switchView(viewId) {
    const views = ['app-container', 'settings-view'];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === viewId) {
            // app-containerはblock、settings-viewはflexで表示
            el.style.display = (id === 'app-container') ? 'block' : 'flex';
        } else {
            el.style.display = 'none';
        }
    });
}

// ============================================
// 初期化
// ============================================

window.onload = () => {

    // Service Workerの登録
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
    .then(registration => {
        console.log('ServiceWorkerが登録されました:', registration.scope);
    })
    .catch(err => {
        console.error('ServiceWorkerの登録に失敗しました:', err);
    });
}
    showLoading(true);

    // 日付初期化
    const now = new Date();
    const today = toDateKey(now);
    const dateInput = document.getElementById('report-date');
    if (dateInput) dateInput.value = today;

    restoreActiveSession();

    // 認証監視 (SmartSRS と同じ onAuthStateChanged の使い方)
    auth.onAuthStateChanged(async (user) => {
        const authView = document.getElementById('auth-view');

        if (user) {
            currentUser = user;
            // メール表示
            const emailEl = document.getElementById('user-email-display');
            if (emailEl) emailEl.textContent = user.email || '';

            authView.style.display = 'none';
            showLoading(true);

            await renderMaterials();
            await loadGlobalTimeline();

            showLoading(false);
            switchView('app-container');
        } else {
            currentUser = null;
            materialsCache = [];
            showLoading(false);
            switchView('app-container'); // 一旦非表示
            document.getElementById('app-container').style.display = 'none';
            authView.style.display = 'flex';
        }
    });

    // コメント欄の自動拡張
    const commentBox = document.getElementById('global-comment-text');
    if (commentBox) {
        commentBox.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });
    }

    // ログインボタン (SmartSRS と同じロングプレスバイパス)
    const btnLogin = document.getElementById('btnLogin');
    if (btnLogin) {
        let bypassTimer;
        btnLogin.addEventListener('mousedown', () => { bypassTimer = setTimeout(() => { _bypassLogin(); }, 5000); });
        btnLogin.addEventListener('touchstart', () => { bypassTimer = setTimeout(() => { _bypassLogin(); }, 5000); }, { passive: true });
        btnLogin.addEventListener('mouseup', () => clearTimeout(bypassTimer));
        btnLogin.addEventListener('mouseleave', () => clearTimeout(bypassTimer));
        btnLogin.addEventListener('touchend', () => clearTimeout(bypassTimer));
        btnLogin.addEventListener('click', async () => {
            if (!currentUser) await tryLogin();
        });
    }

    const btnSignup = document.getElementById('btnSignup');
    if (btnSignup) {
        btnSignup.addEventListener('click', async () => {
            const email = document.getElementById('email').value.trim();
            const pass = document.getElementById('password').value;
            const err = document.getElementById('auth-error');
            err.style.display = 'none';
            if (!email || !pass) { showAuthError('メールアドレスとパスワードを入力してください'); return; }
            if (pass.length < 6) { showAuthError('パスワードは6文字以上で入力してください'); return; }
            showLoading(true);
            try {
                await auth.createUserWithEmailAndPassword(email, pass);
                // 成功時は onAuthStateChanged が呼ばれる
            } catch (e) {
                showLoading(false);
                showAuthError('登録失敗: ' + e.message);
            }
        });
    }
};

function _bypassLogin() {
    console.log('Bypassing login (test mode)...');
    currentUser = null;
    const authView = document.getElementById('auth-view');
    if (authView) authView.style.display = 'none';
    const appContainer = document.getElementById('app-container');
    // ここも 'flex' から 'block' に修正
    if (appContainer) appContainer.style.display = 'block'; 
    renderMaterials();
    loadGlobalTimeline();
}

async function tryLogin() {
    const email = document.getElementById('email').value.trim();
    const pass = document.getElementById('password').value;
    if (!email || !pass) { showAuthError('メールアドレスとパスワードを入力してください'); return; }
    showAuthError('');
    showLoading(true);
    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (e) {
        showLoading(false);
        showAuthError('ログイン失敗: ' + e.message);
    }
}

function showAuthError(msg) {
    const err = document.getElementById('auth-error');
    if (!err) return;
    err.textContent = msg;
    err.style.display = msg ? 'block' : 'none';
}

function checkLoginEnter(event) {
    if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        tryLogin();
    }
}

function resetPassword() {
    const email = document.getElementById('email').value.trim();
    if (!email) { showAuthError('メールアドレスを入力してください'); return; }
    auth.sendPasswordResetEmail(email)
        .then(() => { showAuthError(''); alert('パスワード再設定メールを送信しました'); })
        .catch(e => showAuthError('送信失敗: ' + e.message));
}

function handleLogout() {
    if (confirm('ログアウトしますか？')) {
        auth.signOut().then(() => location.reload());
    }
}

// ============================================
// 設定ページ (SmartSRS 方式)
// ============================================

function openSettings() {
    // バージョン表示
    const versionMeta = document.querySelector('meta[name="data-app-version"]');
    const appVersionEl = document.getElementById('app-version');
    if (appVersionEl && versionMeta) appVersionEl.textContent = versionMeta.getAttribute('content');

    switchView('settings-view');
}

function closeSettings() {
    switchView('app-container');
}

// ============================================
// Tab Control
// ============================================

function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const btns = document.querySelectorAll('.tab-btn');
    if (tabName === 'timeline') btns[0].classList.add('active');
    else btns[1].classList.add('active');

    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'report') {
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
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// キャッシュから教材の画像を取得
function getMaterialImage(materialName) {
    const found = materialsCache.find(m => m.name === materialName);
    return (found && found.image) ? found.image : 'img/default_book_img.png';
}

// ============================================
// Timeline
// ============================================

async function loadGlobalTimeline() {
    const listEl = document.getElementById('timeline-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-sub)">読み込み中...</div>';

    let logs = [];
    try {
        if (currentUser) {
            const snapshot = await db.collection('users').doc(currentUser.uid)
                .collection('timeline').orderBy('createdAt', 'desc').limit(60).get();
            logs = snapshot.docs.map(doc => {
                const d = doc.data();
                return { id: doc.id, ...d, startTimeObj: d.startTime.toDate ? d.startTime.toDate() : new Date(d.startTime) };
            });
        } else {
            logs = getAllLocalTimelines();
        }
        renderGlobalTimeline(logs);
    } catch (e) {
        console.error('timeline load error:', e);
        listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger)">読み込みエラー</div>';
    }
}

function getAllLocalTimelines() {
    let allLogs = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('studyReportTimeline_')) {
            try {
                const arr = JSON.parse(localStorage.getItem(key));
                if (Array.isArray(arr)) allLogs = allLogs.concat(arr);
            } catch (e) { }
        }
    }
    return allLogs
        .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
        .map(l => ({ ...l, startTimeObj: new Date(l.startTime) }));
}

function renderGlobalTimeline(logs) {
    const listEl = document.getElementById('timeline-list');
    if (logs.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:36px 20px;color:var(--text-sub)">まだ記録がありません。<br>「教材を追加」から学習を始めましょう！</div>';
        return;
    }
    const fragment = document.createDocumentFragment();
    let lastDateStr = '';
    logs.forEach(log => {
        const dateStr = log.startTimeObj.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
        if (dateStr !== lastDateStr) {
            const header = document.createElement('div');
            header.className = 'timeline-date-header';
            header.textContent = dateStr;
            fragment.appendChild(header);
            lastDateStr = dateStr;
        }
        const timeStr = log.startTimeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const detail = [log.amount, log.content ? `「${log.content}」` : ''].filter(Boolean).join(' ');

        const item = document.createElement('div');
        item.className = 'timeline-item';

        // 教材写真サムネイル
        const thumb = document.createElement('img');
        thumb.className = 'timeline-thumb';
        thumb.src = getMaterialImage(log.materialName);
        thumb.alt = '';
        thumb.onerror = function () { this.src = 'img/default_book_img.png'; };

        const content = document.createElement('div');
        content.className = 'timeline-content';
        content.innerHTML = `
            <div class="timeline-time">${timeStr}</div>
            <div class="timeline-title">${escapeHtml(log.materialName)}</div>
            <div class="timeline-detail">${escapeHtml(detail)}</div>`;

        const meta = document.createElement('div');
        meta.className = 'timeline-meta';
        meta.innerHTML = `<div class="timeline-duration">${log.durationMinutes}分</div>`;

        const delBtn = document.createElement('button');
        delBtn.className = 'timeline-delete';
        delBtn.textContent = '×';
        delBtn.title = '削除';
        delBtn.addEventListener('click', () => deleteTimelineLog(log.id, log.dateKey));
        meta.appendChild(delBtn);

        item.appendChild(thumb);
        item.appendChild(content);
        item.appendChild(meta);
        fragment.appendChild(item);
    });
    listEl.innerHTML = '';
    listEl.appendChild(fragment);
}

// ============================================
// Stopwatch & Record
// ============================================

function selectMaterial(m) {
    if (activeSession) { alert('現在計測中です。終了してから新しい学習を始めてください。'); return; }
    showConfirm(`「${m.name}」の学習を始めますか？\n\n[OK] ストップウォッチ開始\n[キャンセル] 手動で記録`).then(isTimer => {
        if (isTimer) startSession(m);
        else openManualLogModal(m);
    });
}

function startSession(m) {
    activeSession = { startTime: Date.now(), material: m };
    localStorage.setItem('studyReportActiveSession', JSON.stringify(activeSession));
    document.getElementById('active-session-card').style.display = 'block';
    document.getElementById('session-material-name').textContent = m.name;
    if (sessionInterval) clearInterval(sessionInterval);
    updateSessionTimer();
    sessionInterval = setInterval(updateSessionTimer, 1000);
}

function updateSessionTimer() {
    if (!activeSession) return;
    const diff = Date.now() - activeSession.startTime;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById('session-timer').textContent =
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function stopSession() {
    if (!activeSession) return;
    const now = Date.now();
    const minutes = Math.max(1, Math.floor((now - activeSession.startTime) / 60000));
    currentPendingLog = {
        material: activeSession.material,
        startTime: activeSession.startTime,
        endTime: now,
        durationMinutes: minutes,
        isManual: false
    };
    clearInterval(sessionInterval);
    sessionInterval = null;
    openLogDetailModal(currentPendingLog);
}

function cancelSession() {
    showConfirm('計測中のデータを破棄しますか？').then(ok => {
        if (ok) {
            clearInterval(sessionInterval);
            sessionInterval = null;
            activeSession = null;
            localStorage.removeItem('studyReportActiveSession');
            document.getElementById('active-session-card').style.display = 'none';
        }
    });
}

function restoreActiveSession() {
    const stored = localStorage.getItem('studyReportActiveSession');
    if (stored) {
        try {
            activeSession = JSON.parse(stored);
            document.getElementById('active-session-card').style.display = 'block';
            document.getElementById('session-material-name').textContent = activeSession.material.name;
            updateSessionTimer();
            sessionInterval = setInterval(updateSessionTimer, 1000);
        } catch (e) {
            localStorage.removeItem('studyReportActiveSession');
        }
    }
}

// ============================================
// Log Detail Modal
// ============================================

function openManualLogModal(material) {
    currentPendingLog = { material, startTime: Date.now(), endTime: Date.now(), durationMinutes: 0, isManual: true };
    openLogDetailModal(currentPendingLog);
}

function openLogDetailModal(logData) {
    const modal = document.getElementById('log-detail-modal');
    document.getElementById('log-detail-title').textContent = `${logData.material.name} の記録`;
    const unit = logData.material.unit || 'ページ';
    document.querySelectorAll('.unit-display').forEach(el => el.textContent = unit);
    document.getElementById('unit-help-range').textContent = `単位: ${unit}`;

    document.getElementById('log-range-start').value = '';
    document.getElementById('log-range-end').value = '';
    document.getElementById('log-amount-val').value = '';
    document.getElementById('log-content-input').value = '';

    const timeInput = document.getElementById('log-duration-input');
    timeInput.value = (logData.durationMinutes === 0 && logData.isManual) ? '' : logData.durationMinutes;
    if (logData.isManual) setTimeout(() => timeInput.focus(), 100);

    document.getElementById('progress-type-range').checked = true;
    toggleProgressInput();

    const saveBtn = document.getElementById('log-save-btn');
    const newBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newBtn, saveBtn);

    newBtn.addEventListener('click', async () => {
        const duration = parseInt(document.getElementById('log-duration-input').value);
        if (isNaN(duration) || duration < 0) { alert('学習時間を正しく入力してください'); return; }

        const type = document.querySelector('input[name="progress-type"]:checked').value;
        let amountStr = '';
        if (type === 'range') {
            const start = document.getElementById('log-range-start').value;
            const end = document.getElementById('log-range-end').value;
            const prefix = unit === 'ページ' ? 'P' : (unit === '問' ? 'No.' : '');
            if (start && end) amountStr = `${prefix}${start}〜${prefix}${end}`;
            else if (start) amountStr = `${prefix}${start}〜`;
        } else {
            const val = document.getElementById('log-amount-val').value;
            if (val) amountStr = `${val}${unit}`;
        }
        const content = document.getElementById('log-content-input').value;
        const finalLog = {
            materialName: logData.material.name,
            category: logData.material.category,
            unit: logData.material.unit,
            startTime: logData.startTime,
            endTime: Date.now(),
            durationMinutes: duration,
            content,
            amount: amountStr
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
    document.getElementById('progress-input-range').style.display = type === 'range' ? 'block' : 'none';
    document.getElementById('progress-input-amount').style.display = type === 'amount' ? 'block' : 'none';
}

function closeLogDetailModal() {
    document.getElementById('log-detail-modal').classList.remove('show');
    if (activeSession && !sessionInterval) {
        sessionInterval = setInterval(updateSessionTimer, 1000);
    }
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
            await db.collection('users').doc(currentUser.uid).collection('timeline').add({
                ...newLog,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            const logs = getLocalTimeline(dateKey);
            newLog.id = `local_${Date.now()}`;
            logs.push(newLog);
            localStorage.setItem(`studyReportTimeline_${dateKey}`, JSON.stringify(logs));
        }
        addSyncLog(`記録: ${logData.materialName} ${logData.durationMinutes}分`);
        showPopup('記録しました！');
        loadGlobalTimeline();
    } catch (e) {
        console.error('save error:', e);
        showPopup(`保存エラー: ${e.message}`);
    } finally {
        showLoading(false);
    }
}

function getLocalTimeline(dateKey) {
    try {
        const json = localStorage.getItem(`studyReportTimeline_${dateKey}`);
        return json ? JSON.parse(json) : [];
    } catch (e) { return []; }
}

async function deleteTimelineLog(id, dateKey) {
    if (!await showConfirm('この記録を削除しますか？')) return;
    showLoading(true);
    try {
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid).collection('timeline').doc(id).delete();
        } else {
            let logs = getLocalTimeline(dateKey);
            logs = logs.filter(l => l.id !== id);
            localStorage.setItem(`studyReportTimeline_${dateKey}`, JSON.stringify(logs));
        }
        addSyncLog(`削除: ログ ${id}`);
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
    const dateKey = document.getElementById('report-date').value;
    if (!dateKey) return;
    showLoading(true);
    try {
        let logs = [];
        if (currentUser) {
            const snapshot = await db.collection('users').doc(currentUser.uid)
                .collection('timeline').where('dateKey', '==', dateKey).get();
            logs = snapshot.docs.map(doc => doc.data());
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
    const container = document.getElementById('subjects-container');
    container.innerHTML = '';
    const aggregated = {};
    logs.forEach(log => {
        const name = log.materialName;
        if (!aggregated[name]) {
            aggregated[name] = { name, category: log.category, unit: log.unit, minutes: 0, contents: [], amounts: [] };
        }
        aggregated[name].minutes += parseInt(log.durationMinutes || 0);
        if (log.content) aggregated[name].contents.push(log.content);
        if (log.amount) aggregated[name].amounts.push(log.amount);
    });
    Object.values(aggregated).forEach(item => {
        const h = Math.floor(item.minutes / 60);
        const m = item.minutes % 60;
        addSubject({ other: item.name, unit: item.unit, text: item.contents.join('、'), amount: item.amounts.join(', '), h, m });
    });
    if (logs.length === 0) addSubject();
    generateText();
}

// ============================================
// Daily Comment
// ============================================

function getDailyCommentKey(dateKey) {
    const uid = currentUser ? currentUser.uid : 'local';
    return `studyReportComment_${uid}_${dateKey}`;
}

function loadDailyComment() {
    const dateKey = document.getElementById('report-date').value;
    if (!dateKey) return;
    const saved = localStorage.getItem(getDailyCommentKey(dateKey)) || '';
    const textarea = document.getElementById('global-comment-text');
    if (textarea) {
        textarea.value = saved;
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }
    generateText();
}

function onCommentInput() {
    const textarea = document.getElementById('global-comment-text');
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    const dateKey = document.getElementById('report-date').value;
    if (dateKey) localStorage.setItem(getDailyCommentKey(dateKey), textarea.value);
    generateText();
}

// ============================================
// Subject Rows
// ============================================

function addSubject(data = null) {
    const div = document.createElement('div');
    div.className = 'subject-row';
    const unit = data ? (data.unit || '任意') : '任意';
    div.innerHTML = `
        <div class="row-controls">
            <div class="move-btns">
                <button class="move-btn" onclick="moveSubjectUp(this)" title="上へ">▲</button>
                <button class="move-btn" onclick="moveSubjectDown(this)" title="下へ">▼</button>
            </div>
            <button class="remove-btn" onclick="removeRow(this)">削除</button>
        </div>
        <div class="form-group">
            <label>教材名</label>
            <input type="text" class="subject-select-input" value="${data ? escapeHtml(data.other || '') : ''}" placeholder="教材名">
        </div>
        <div class="form-group">
            <label>内容</label>
            <textarea class="subject-text" placeholder="内容">${data ? escapeHtml(data.text) : ''}</textarea>
        </div>
        <div class="form-group">
            <label>進捗 (${unit})</label>
            <input type="text" class="subject-amount" value="${data ? escapeHtml(data.amount) : ''}" placeholder="進捗">
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
    div.querySelectorAll('input, textarea').forEach(el => el.addEventListener('input', generateText));
    document.getElementById('subjects-container').appendChild(div);
}

function removeRow(btn) { btn.closest('.subject-row').remove(); generateText(); }

function moveSubjectUp(btn) {
    const row = btn.closest('.subject-row');
    const prev = row.previousElementSibling;
    if (prev && prev.classList.contains('subject-row')) { row.parentNode.insertBefore(row, prev); generateText(); }
}

function moveSubjectDown(btn) {
    const row = btn.closest('.subject-row');
    const next = row.nextElementSibling;
    if (next && next.classList.contains('subject-row')) { row.parentNode.insertBefore(next, row); generateText(); }
}

function generateText() {
    const rows = document.querySelectorAll('.subject-row');
    let totalM = 0;
    let body = '';
    rows.forEach(row => {
        const name = row.querySelector('.subject-select-input').value;
        if (!name) return;
        const text = row.querySelector('.subject-text').value;
        const amount = row.querySelector('.subject-amount').value;
        const h = parseInt(row.querySelector('.time-h').value) || 0;
        const m = parseInt(row.querySelector('.time-m').value) || 0;
        totalM += h * 60 + m;
        let timeStr = '';
        if (h > 0) timeStr += `${h}時間`;
        if (m > 0) timeStr += `${m}分`;
        if (!timeStr) timeStr = '0分';
        body += `\n【${name}】\n${text}\n${amount ? amount + ' ' : ''}勉強時間 ${timeStr}\n`;
    });
    const th = Math.floor(totalM / 60);
    const tm = totalM % 60;
    const totalEl = document.getElementById('screen-total');
    if (totalEl) totalEl.textContent = `合計: ${th}時間 ${tm}分`;
    const comment = document.getElementById('global-comment-text').value;
    const date = document.getElementById('report-date').value;
    let final = `勉強報告 (${date})\n${body}\n合計勉強時間 ${th}時間${tm}分`;
    if (comment) final += `\n\n${comment}`;
    const outputEl = document.getElementById('output-text');
    if (outputEl) outputEl.value = final;
}

function copyToClipboard() {
    const t = document.getElementById('output-text');
    if (navigator.clipboard) {
        navigator.clipboard.writeText(t.value).then(() => showPopup('コピーしました！'));
    } else {
        t.select();
        document.execCommand('copy');
        showPopup('コピーしました！');
    }
}

function resetData() {
    showConfirm('この日の入力をクリアしますか？').then(ok => {
        if (!ok) return;
        document.getElementById('subjects-container').innerHTML = '';
        addSubject();
        generateText();
    });
}

// ============================================
// Materials
// ============================================

function openMaterialModal() {
    document.getElementById('material-name').value = '';
    document.getElementById('material-category').value = '英語';
    document.getElementById('material-unit').value = 'ページ';
    document.getElementById('preview-img').src = 'img/default_book_img.png';
    document.getElementById('material-modal').classList.add('show');
}

function closeMaterialModal() { document.getElementById('material-modal').classList.remove('show'); }

function previewMaterialImage(input) {
    if (input.files && input.files[0]) {
        const r = new FileReader();
        r.onload = e => { document.getElementById('preview-img').src = e.target.result; };
        r.readAsDataURL(input.files[0]);
    }
}

async function saveMaterial() {
    const name = document.getElementById('material-name').value.trim();
    if (!name) { showPopup('教材名を入力してください'); return; }
    showLoading(true);
    const imgSrc = document.getElementById('preview-img').src;
    const isDefault = imgSrc.includes('default_book_img');
    const m = {
        name,
        category: document.getElementById('material-category').value,
        unit: document.getElementById('material-unit').value,
        image: isDefault ? 'img/default_book_img.png' : imgSrc,
        createdAt: Date.now()
    };
    try {
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid).collection('materials').add(m);
        } else {
            const list = JSON.parse(localStorage.getItem('studyReportMaterials') || '[]');
            m.id = `local_${Date.now()}`;
            list.push(m);
            localStorage.setItem('studyReportMaterials', JSON.stringify(list));
        }
        addSyncLog(`教材追加: ${name}`);
        closeMaterialModal();
        await renderMaterials();
    } catch (e) {
        showPopup(`保存エラー: ${e.message}`);
    } finally {
        showLoading(false);
    }
}

async function renderMaterials() {
    const displayArea = document.getElementById('materials-section');
    if (!displayArea) return;
    displayArea.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-sub);font-size:0.88rem;">読み込み中...</div>';

    let materials = [];
    try {
        if (currentUser) {
            const s = await db.collection('users').doc(currentUser.uid).collection('materials').orderBy('createdAt', 'desc').get();
            materials = s.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
            const json = localStorage.getItem('studyReportMaterials');
            materials = json ? JSON.parse(json) : [];
        }
    } catch (e) {
        displayArea.innerHTML = '<div style="text-align:center;padding:16px;color:var(--danger)">読み込みエラー</div>';
        return;
    }

    // キャッシュ更新（タイムライン画像取得用）
    materialsCache = materials;

    if (materials.length === 0) {
        displayArea.innerHTML = '<p style="text-align:center;color:var(--text-sub);font-size:0.88em;padding:16px 0;">教材がありません。「＋ 教材追加」から追加してください。</p>';
        return;
    }

    // カテゴリーグループ化
    const grouped = {};
    materials.forEach(m => {
        const cat = m.category || 'その他';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(m);
    });

    displayArea.innerHTML = '';
    Object.entries(grouped).forEach(([cat, items]) => {
        const group = document.createElement('div');
        group.className = 'category-group';
        group.innerHTML = `<div class="category-title">${escapeHtml(cat)}</div>`;
        const grid = document.createElement('div');
        grid.className = 'materials-grid';
        items.forEach(m => {
            const card = document.createElement('div');
            card.className = 'material-card';
            card.innerHTML = `
                <img src="${m.image || 'img/default_book_img.png'}" class="material-thumb" onerror="this.src='img/default_book_img.png'">
                <div class="material-name">${escapeHtml(m.name)}</div>`;
            card.addEventListener('click', () => selectMaterial(m));
            card.addEventListener('contextmenu', e => { e.preventDefault(); deleteMaterial(m); });
            grid.appendChild(card);
        });
        group.appendChild(grid);
        displayArea.appendChild(group);
    });
}

async function deleteMaterial(m) {
    if (!await showConfirm(`教材「${m.name}」を削除しますか？`)) return;
    showLoading(true);
    try {
        if (currentUser) {
            await db.collection('users').doc(currentUser.uid).collection('materials').doc(m.id).delete();
        } else {
            let list = JSON.parse(localStorage.getItem('studyReportMaterials') || '[]');
            list = list.filter(item => item.id !== m.id && item.createdAt !== m.createdAt);
            localStorage.setItem('studyReportMaterials', JSON.stringify(list));
        }
        addSyncLog(`教材削除: ${m.name}`);
        await renderMaterials();
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
    document.getElementById('export-modal').classList.add('show');
    document.getElementById('export-with-logs-btn').onclick = () => doExport(true);
    document.getElementById('export-no-logs-btn').onclick = () => doExport(false);
    document.getElementById('export-cancel-btn').onclick = () => document.getElementById('export-modal').classList.remove('show');
}

async function doExport(includeLogs) {
    document.getElementById('export-modal').classList.remove('show');
    showLoading(true);
    try {
        let materials = [];
        let timelines = {};
        if (currentUser) {
            const ms = await db.collection('users').doc(currentUser.uid).collection('materials').get();
            materials = ms.docs.map(d => ({ id: d.id, ...d.data() }));
            if (includeLogs) {
                const tl = await db.collection('users').doc(currentUser.uid).collection('timeline').orderBy('createdAt', 'desc').limit(500).get();
                tl.docs.forEach(d => {
                    const data = d.data();
                    const dk = data.dateKey || '';
                    if (!timelines[dk]) timelines[dk] = [];
                    timelines[dk].push({ id: d.id, ...data });
                });
            }
        } else {
            const json = localStorage.getItem('studyReportMaterials');
            materials = json ? JSON.parse(json) : [];
            if (includeLogs) {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('studyReportTimeline_')) {
                        const dk = key.replace('studyReportTimeline_', '');
                        try { timelines[dk] = JSON.parse(localStorage.getItem(key)); } catch (e) { }
                    }
                }
            }
        }
        const exportObj = { version: '2.1.0', exportedAt: new Date().toISOString(), materials, timelines };
        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `StudyReport_backup_${toDateKey(new Date())}.rep`;
        a.click();
        URL.revokeObjectURL(url);
        addSyncLog('データ書き出し完了');
        showPopup('書き出しました！');
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
            if (!data.materials) { showPopup('不正なファイル形式です'); return; }
            if (!await showConfirm(`バックアップを読み込みますか？\n教材: ${data.materials.length}件`)) return;
            showLoading(true);
            if (currentUser) {
                const batch = db.batch();
                const ref = db.collection('users').doc(currentUser.uid).collection('materials');
                data.materials.forEach(m => { const { id, ...mData } = m; batch.set(ref.doc(), { ...mData, createdAt: Date.now() }); });
                await batch.commit();
                if (data.timelines) {
                    const tlRef = db.collection('users').doc(currentUser.uid).collection('timeline');
                    for (const [, logs] of Object.entries(data.timelines)) {
                        for (const log of (logs || [])) { const { id, ...logData } = log; await tlRef.add({ ...logData, createdAt: Date.now() }); }
                    }
                }
            } else {
                const existing = JSON.parse(localStorage.getItem('studyReportMaterials') || '[]');
                data.materials.forEach(m => { m.id = `local_${Date.now()}_${Math.random()}`; existing.push(m); });
                localStorage.setItem('studyReportMaterials', JSON.stringify(existing));
            }
            addSyncLog('データ読み込み完了');
            showPopup('読み込みました！');
            await renderMaterials();
            await loadGlobalTimeline();
        } catch (err) {
            showPopup(`読み込みエラー: ${err.message}`);
        } finally {
            showLoading(false);
            fileInput.value = '';
        }
    };
    reader.readAsText(file);
}

// ============================================
// Sync Log
// ============================================

function addSyncLog(msg) {
    const logs = JSON.parse(localStorage.getItem('studyReportSyncLog') || '[]');
    const now = new Date().toLocaleString('ja-JP');
    logs.unshift(`[${now}] ${msg}`);
    if (logs.length > 50) logs.length = 50;
    localStorage.setItem('studyReportSyncLog', JSON.stringify(logs));
}

function showSyncLog() {
    const logs = JSON.parse(localStorage.getItem('studyReportSyncLog') || '[]');
    const listEl = document.getElementById('sync-log-list');
    listEl.innerHTML = logs.length === 0
        ? '<p>ログがありません</p>'
        : logs.map(l => `<p>${escapeHtml(l)}</p>`).join('');
    closeSettings();
    document.getElementById('sync-log-modal').classList.add('show');
}

function closeSyncLogModal() { document.getElementById('sync-log-modal').classList.remove('show'); }

// ============================================
// UI Helpers
// ============================================

function showPopup(msg) {
    document.getElementById('popup-message').textContent = msg;
    const modal = document.getElementById('popup-modal');
    modal.classList.add('show');
    document.getElementById('popup-close-btn').onclick = () => modal.classList.remove('show');
}

function showConfirm(msg) {
    return new Promise(resolve => {
        document.getElementById('confirm-message').textContent = msg;
        const modal = document.getElementById('confirm-modal');
        modal.classList.add('show');
        document.getElementById('confirm-ok-btn').onclick = () => { modal.classList.remove('show'); resolve(true); };
        document.getElementById('confirm-cancel-btn').onclick = () => { modal.classList.remove('show'); resolve(false); };
    });
}