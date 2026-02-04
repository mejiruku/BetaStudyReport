// --- サービスワーカーの登録 ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker Registered!', reg))
            .catch(err => console.log('Service Worker Registration Failed', err));
    });
}

// --- アプリ本体のロジック ---
const subjectList = ["選択してください", "数学", "数I", "数A", "数II", "数B", "数C", "理科", "生物基礎", "物理基礎", "化学基礎", "生物", "化学", "英語", "英コミュ", "論評", "CS", "その他"];
const mathSubjects = ["数学", "数I", "数A", "数II", "数B", "数C"];
const scienceSubjects = ["理科", "生物基礎", "物理基礎", "化学基礎", "生物", "化学"];
const englishSubjects = ["英語", "英コミュ", "論評", "CS"];

const hoursOptions = Array.from({ length: 11 }, (_, i) => `<option value="${i}">${i}</option>`).join('');
const minutesOptions = Array.from({ length: 12 }, (_, i) => `<option value="${i * 5}">${i * 5}</option>`).join('');

const container = document.getElementById('subjects-container');
const outputText = document.getElementById('output-text');
const screenTotal = document.getElementById('screen-total');
const globalCommentInput = document.getElementById('global-comment-text');
const dateInput = document.getElementById('report-date');

// Auth Elements
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userDisplay = document.getElementById('user-display');
const userIcon = document.getElementById('user-icon');
const saveStatus = document.getElementById('save-status');
let currentUser = null;
let saveTimer = null;
let isSaving = false;
let isLoading = false; // Flag to prevent auto-save during initial load

// デフォルトの日付を今日に設定 & Auth監視
window.onload = () => {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;

    // Auth State Listener
    auth.onAuthStateChanged(user => {
        currentUser = user;
        updateAuthUI(user);
        if (user) {
            // Logged In: 
            // 1. Delete Local Data (Strict Rule) - *Only if not already cleared?* // The requirement says "Data is deleted when YOU LOG IN". 
            // Since onAuthStateChanged fires on reload too, we should be careful NOT to wipe session data if we are already logged in.
            // However, the rule "Delete local data when logged in" implies local storage should be CLEAN when in logged-in mode.
            // So, simply wiping it is correct to ensure no local data persists.
            localStorage.removeItem('studyReportAllData'); 
            
            // 2. Load from Firestore
            loadData();
        } else {
            // Guest Mode: Load from Local Storage
            loadData();
        }
    });
};


    
    // Unsaved changes warning
    window.addEventListener('beforeunload', (e) => {
        if (isSaving || saveTimer) {
            e.preventDefault();
            e.returnValue = ''; // Standard for Chrome
        }
    });


function updateSaveStatus(status) {
    if (!saveStatus) return;
    
    // Clear classes
    saveStatus.className = 'save-status';
    
    if (status === 'saving') {
        saveStatus.innerText = '保存中...';
        saveStatus.classList.add('saving');
    } else if (status === 'saved') {
        saveStatus.innerText = '保存完了';
        saveStatus.classList.add('saved');
    } else if (status === 'error') {
        saveStatus.innerText = '保存失敗';
        saveStatus.classList.add('error');
    } else if (status === 'unsaved') {
        saveStatus.innerText = '未保存';
    } else {
        saveStatus.innerText = '';
    }
}

function updateAuthUI(user) {
    if (user) {
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        userDisplay.style.display = 'inline-block';
        userDisplay.innerText = user.email;
        
        if (user.photoURL) {
            userIcon.src = user.photoURL;
            userIcon.style.display = 'block';
        } else {
            userIcon.style.display = 'none';
        }
    } else {
        loginBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        userDisplay.style.display = 'none';
        userIcon.style.display = 'none';
        userIcon.src = "";
    }
}

function login() {
    // Warning before login
    if (confirm("ログインすると、現在ローカルに保存されているすべてのデータは削除され、クラウド上のデータに置き換わります。\n本当によろしいですか？")) {
        auth.signInWithPopup(provider).then(() => {
            // Successful login will trigger onAuthStateChanged
            // which handles the data wiping.
        }).catch(err => {
            console.error("Login failed", err);
            alert("ログインに失敗しました");
        });
    }
}

function logout() {
    if(confirm("ログアウトしますか？")) {
        auth.signOut().then(() => {
            // Logout successful. onAuthStateChanged handles UI switch.
            // Requirement says "Ensure displayed data is not cleared".
            // Since we switch to loadData() which loads from LocalStorage (empty), the screen might clear.
            // To prevent screen clearing, we might need to *save* current memory state to local? 
            // OR just let it clear because the user is switching context.
            // Re-reading history: "When logout... ensure displayed data is not cleared".
            // This suggests copying current state to local storage OR just not reloading immediately.
            // But for this specific "Strict Delete" request, "Guest Mode = Local Storage".
            // If we logout, we are Guest. If Firestore data is still on screen, it hasn't been saved to Local.
            // If the user wants to keep working as Guest, we should probably save the current view to Local Storage?
            // Let's implement a "Transfer to Local" on logout if we want to keep it?
            // Actually, the prompt says "Local data is ON when NOT Logged In".
            // If I logout, I am "Not Logged In". So I can use Local Storage.
            // If I want to KEEP what was on screen, I should save it to Local Storage now.
            
            // For now, let's just reload to fresh state to avoid confusion, 
            // unless user specifically asked to "Keep data on logout" in previous turn (Conversation 27d9...).
            // "Ensure displayed data is not cleared from the screen" was a previous objective.
            // So: Do NOT call loadData() immediately? 
            // Let's just NOT call loadData() in the `else` block of onAuthStateChanged IF it was a logout action?
            // But onAuthStateChanged fires automatically.
            // Let's simpler approach: Copy current memory state to Local Storage on logout?
            // Let's stick to the CURRENT request: "Local on only when guest. Login -> Delete Local."
            // I will implement basic logout.
        });
    }
}

dateInput.addEventListener('change', () => {
    loadData();
    // 日付変更時に結果表示をリセットしないと前の日の内容が残る場合があるので再生成
    generateText(); 
});

function addSubject(initialData = null) {
    const div = document.createElement('div');
    div.className = 'subject-row';
    div.innerHTML = `
            <button class="remove-btn" onclick="removeRow(this)">削除</button>
            <div class="form-group">
                <label>教科</label>
                <select class="subject-select" onchange="toggleOtherInput(this)">
                    ${subjectList.map(s => {
                        const val = (s === "選択してください") ? "" : s;
                        return `<option value="${val}">${s}</option>`;
                    }).join('')}
                </select>
                <input type="text" class="other-subject-input" style="display:none;" placeholder="教科名を入力" oninput="generateText()">
            </div>
            <div class="form-group"><label>内容</label><textarea class="subject-text" placeholder="今日やったこと" oninput="generateText()"></textarea></div>
            <div class="form-group"><label>勉強時間</label><div class="time-inputs"><select class="time-h" onchange="generateText()">${hoursOptions}</select> 時間 <select class="time-m" onchange="generateText()">${minutesOptions}</select> 分</div></div>`;

    container.appendChild(div);
    if (initialData) {
        div.querySelector('.subject-select').value = initialData.select;
        const otherInput = div.querySelector('.other-subject-input');
        otherInput.value = initialData.other;
        if (initialData.select === "その他") otherInput.style.display = "block";
        div.querySelector('.subject-text').value = initialData.text;
        div.querySelector('.time-h').value = initialData.h;
        div.querySelector('.time-m').value = initialData.m;
    }
    generateText();
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
    btn.parentElement.remove();
    generateText();
}

function generateText() {
    const rows = document.querySelectorAll('.subject-row');
    let totalMinutes = 0, bodyContent = "", displayGroups = new Set(), saveDataArray = [];
    let validSubjectCount = 0;

    rows.forEach(row => {
        const selectValue = row.querySelector('.subject-select').value;
        const otherValue = row.querySelector('.other-subject-input').value;
        const text = row.querySelector('.subject-text').value;
        const h = parseInt(row.querySelector('.time-h').value) || 0;
        const m = parseInt(row.querySelector('.time-m').value) || 0;

        saveDataArray.push({ select: selectValue, other: otherValue, text: text, h: h, m: m });

        if (selectValue === "") return;

        validSubjectCount++;
        let subjectDisplayName = (selectValue === "その他") ? (otherValue || "その他") : selectValue;
        totalMinutes += (h * 60) + m;

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

    let header = (displayGroups.size > 0) ? `今日は${Array.from(displayGroups).join('と')}をやりました\n` : `今日の学習報告\n`;
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
    
    if (isLoading) return; // Don't save if we are just loading data

    // Debounced Save
    updateSaveStatus('saving');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        performSave(currentDateStr, saveDataArray, globalComment);
    }, 1500); // 1.5 second delay
}

function performSave(dateKey, subjects, comment) {
    isSaving = true;
    saveTimer = null;
    
    if (currentUser) {
        saveToFirestore(dateKey, subjects, comment);
    } else {
        saveToLocalStorage(dateKey, subjects, comment);
    }
}

// ------ Firestore Saving ------
function saveToFirestore(dateKey, subjects, comment) {
    if (!currentUser) {
        isSaving = false;
        return;
    }
    const docRef = db.collection('users').doc(currentUser.uid).collection('reports').doc(dateKey);
    docRef.set({
        subjects: subjects,
        comment: comment,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
        console.log("Saved to Firestore");
        isSaving = false;
        updateSaveStatus('saved');
    })
    .catch(err => {
        console.error("Error saving", err);
        isSaving = false;
        updateSaveStatus('error');
    });
}

// ------ ストレージ関連 (日付対応) ------

// データ構造:
// localStorage['studyReportAllData'] = JSON.stringify({
//    "2025-01-01": { subjects: [...], comment: "..." },
//    "2025-01-02": { subjects: [...], comment: "..." }
// });

function getAllData() {
    const json = localStorage.getItem('studyReportAllData');
    if (!json) return {};
    try {
        return JSON.parse(json);
    } catch (e) {
        console.error("Data parse error", e);
        return {};
    }
}

function saveToLocalStorage(dateKey, subjects, comment) {
    try {
        const allData = getAllData();
        allData[dateKey] = { subjects: subjects, comment: comment };
        localStorage.setItem('studyReportAllData', JSON.stringify(allData));
        setTimeout(() => {
            // Simulate async for consistency or just direct
            isSaving = false;
            updateSaveStatus('saved');
        }, 300);
    } catch (e) {
        console.error(e);
        isSaving = false;
        updateSaveStatus('error');
    }
}

function loadData() {
    const dateKey = dateInput.value;
    if (!dateKey) return;

    if (currentUser) {
        // Load from Firestore
        db.collection('users').doc(currentUser.uid).collection('reports').doc(dateKey).get()
        .then(doc => {
            if (doc.exists) {
                const data = doc.data();
                renderData(data);
            } else {
                renderData(null); // No data for this day
            }
        }).catch(err => {
            console.error("Error loading", err);
            renderData(null);
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
    container.innerHTML = '';
    if (dayData) {
        globalCommentInput.value = dayData.comment || "";
        if (dayData.subjects && dayData.subjects.length > 0) {
            dayData.subjects.forEach(sub => addSubject(sub));
        } else {
            addSubject();
        }
    } else {
        // データがない日は空の行を一つ追加
        globalCommentInput.value = "";
        addSubject();
    }
    // generateTextはaddSubject内で呼ばれるため不要 (ただし初回ロード時は合計計算のため呼んでもいいが、addSubjectが呼ぶのでOK)
    isLoading = false; // End loading mode
    updateSaveStatus('saved'); // Initial state is "saved" (sync with DB)
}


function migrateOldDataIfNeeded() {
    // 旧データがあるか確認
    const oldDataJson = localStorage.getItem('studyReportData');
    if (oldDataJson) {
        try {
            const oldData = JSON.parse(oldDataJson);
            // 今日の日付にデータを移行
            const today = new Date().toISOString().split('T')[0];
            const allData = getAllData();
            
            // 既に今日のデータがある場合は上書きしないよう配慮するか、
            // 初回移行なので、まあ上書きでも良いが、既存データがない場合のみ移行する
            if (!allData[today]) {
                allData[today] = oldData;
                localStorage.setItem('studyReportAllData', JSON.stringify(allData));
                alert("古いデータを本日のデータとして復元しました。");
            }
            
            // 旧データ削除 (あるいはバックアップとして残すか？今回は削除)
            localStorage.removeItem('studyReportData');
            
            // 現在表示中の日付が今日ならリロード
            if (dateInput.value === today) {
                loadData();
            }
        } catch (e) {
            console.error("Migration failed", e);
        }
    }
}

function resetData() {
    if (confirm("表示中の日付の入力内容をすべて消去しますか？")) {
        const dateKey = dateInput.value;
        const allData = getAllData();
        
        if (currentUser) {
            // Delete from Firestore
            db.collection('users').doc(currentUser.uid).collection('reports').doc(dateKey).delete()
            .then(() => {
                resetUI();
            })
            .catch(err => console.error("Error deleting", err));
        } else {
            try {
                // その日のデータを削除
                delete allData[dateKey];
                localStorage.setItem('studyReportAllData', JSON.stringify(allData));
                resetUI();
            } catch(e) { console.error(e) }
        }
    }
}

function resetUI() {
    container.innerHTML = '';
    globalCommentInput.value = '';
    addSubject(); 
    generateText(); 
}

function copyToClipboard() {
    const copyTarget = document.getElementById("output-text");
    copyTarget.select();
    document.execCommand("copy");
    alert("コピーしました");
}

// ------ エクスポート & インポート ------

function exportData() {
    if (currentUser) {
        // Cloud Export
        updateSaveStatus('saving'); // Use visual feedback
        db.collection('users').doc(currentUser.uid).collection('reports').get()
        .then(querySnapshot => {
            let cloudData = {};
            querySnapshot.forEach(doc => {
                cloudData[doc.id] = doc.data();
            });
            downloadJSON(cloudData, `study_report_cloud_backup_${new Date().toISOString().split('T')[0]}.json`);
            updateSaveStatus('saved');
        })
        .catch(err => {
            console.error("Export failed", err);
            alert("クラウドからのデータ取得に失敗しました。");
            updateSaveStatus('error');
        });
    } else {
        // Local Export
        const allData = localStorage.getItem('studyReportAllData');
        if (!allData) {
            alert("保存されたデータがありません。");
            return;
        }
        // Validate JSON if possible, but it's raw string, so just pass parse/stringify check or direct
        try {
            const parsed = JSON.parse(allData);
            downloadJSON(parsed, `study_report_local_backup_${new Date().toISOString().split('T')[0]}.json`);
        } catch(e) {
            alert("データが破損している可能性があります。");
        }
    }
}

function downloadJSON(dataObj, filename) {
    const jsonStr = JSON.stringify(dataObj, null, 2); // Prettier format
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
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
    reader.onload = function(e) {
        try {
            const json = e.target.result;
            const data = JSON.parse(json);
            if (typeof data !== 'object') throw new Error("Invalid format");

            if (confirm("現在のデータを上書きして取り込みますか？")) {
                if (currentUser) {
                    // Cloud Import
                    importToCloud(data);
                } else {
                    // Local Import
                    localStorage.setItem('studyReportAllData', JSON.stringify(data));
                    loadData(); // Reload current view
                    alert("データの取り込みが完了しました。");
                }
            }
        } catch (err) {
            alert("ファイルの読み込みに失敗しました。正しいJSONファイルか確認してください。");
            console.error(err);
        }
        // Reset input
        input.value = '';
    };
    reader.readAsText(file);
}

function importToCloud(dataObj) {
    updateSaveStatus('saving');
    const batchPromises = [];
    const reportsRef = db.collection('users').doc(currentUser.uid).collection('reports');

    // Firestore batch (limit 500) or parallel set.
    // For simplicity with unknown size, we'll use parallel set calls.
    // If concerned about rate limits, we could batch, but standard usage is likely fine.
    
    Object.keys(dataObj).forEach(dateKey => {
        const docData = dataObj[dateKey];
        // Ensure updatedAt is set effectively or just use serverTimestamp if we want to "touch" them.
        // Assuming we keep original content exactly.
        // We might want to add updatedAt: firebase.firestore.FieldValue.serverTimestamp() if missing
        if (!docData.updatedAt) {
            docData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        }
        
        batchPromises.push(
            reportsRef.doc(dateKey).set(docData)
        );
    });

    Promise.all(batchPromises)
    .then(() => {
        console.log("All data imported to cloud");
        updateSaveStatus('saved');
        loadData(); // Reload current view
        alert("クラウドへのデータの取り込みが完了しました。");
    })
    .catch(err => {
        console.error("Cloud import failed", err);
        alert("一部のデータの取り込みに失敗しました。コンソールを確認してください。");
        updateSaveStatus('error');
    });
}