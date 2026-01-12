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
let isUpdatingFromFirestore = false;
let unsubscribe = null;
let saveTimeout = null;
let currentUser = null;

// デフォルトの日付を今日に設定
window.onload = () => {
    // Auth State Listener
    firebase.auth().onAuthStateChanged((user) => {
        currentUser = user;
        updateAuthUI(user);
        loadData(); // ユーザー切り替え時にデータを再ロード
    });

    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    // listener内でloadData呼ぶのでここは削除でもいいが、初期表示のチラつき防止で残してもよい。
    // ただしAuth初期化前はnullなので、Auth listenerに任せたほうが安全。
};

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

        bodyContent += `\n${subjectDisplayName}\n${text}\n勉強時間 ${timeStr}\n\n`;
    });

    const totalH = Math.floor(totalMinutes / 60);
    const totalM = totalMinutes % 60;
    const globalComment = globalCommentInput.value;
    const currentDateStr = dateInput.value;

    let header = (displayGroups.size > 0) ? `今日は${Array.from(displayGroups).join('と')}をやりました\n` : `今日の学習報告\n`;
    let finalText = header + bodyContent;

    // 2教科以上かつ合計が0より大きい場合のみ合計時間を表示 (古い仕様も維持しつつ、ヘッダーにも追加したので重複するが、本文用として残すか検討。一旦残す)
    if (validSubjectCount >= 2 && totalMinutes > 0) {
        let totalTimeStr = (totalM === 0) ? `${totalH}時間` : `${totalH}時間${totalM}分`;
        finalText += `合計勉強時間 ${totalTimeStr}\n`;
    }

    if (globalComment.trim() !== "") {
        finalText += `\n\n${globalComment}`;
    }

    screenTotal.innerText = `合計: ${totalH}時間 ${totalM}分`;
    outputText.value = finalText;
    
    // 現在の日付に対して保存
    saveToLocalStorage(currentDateStr, saveDataArray, globalComment);
    
    // Firebaseに保存 (デバウンス処理: 1秒後に保存)
    if (!isUpdatingFromFirestore) {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveToFirestore(currentDateStr, saveDataArray, globalComment);
        }, 1000);
    }
}

// ------ ストレージ関連 (日付対応 & Firebase) ------

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
    const allData = getAllData();
    // 空データでも保存して、その日の記録として残す（あるいは削除するロジックにするか？今回は上書き保存）
    // もし完全に空ならキーを削除する手もあるが、シンプルに保存する
    allData[dateKey] = { subjects: subjects, comment: comment };
    localStorage.setItem('studyReportAllData', JSON.stringify(allData));
}

function saveToFirestore(dateKey, subjects, comment) {
    if (!db) return;
    
    // ログインしていなければ保存しない（あるいは「未ログイン」というコレクションに入れる？）
    // ここではログイン必須とする
    if (!currentUser) {
        console.log("Not logged in. Skipping Firestore save.");
        return;
    }

    // ユーザーごとのパス: users/{uid}/reports/{dateKey}
    db.collection("users").doc(currentUser.uid).collection("reports").doc(dateKey).set({
        subjects: subjects,
        comment: comment,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => console.log("Document successfully written!"))
    .catch((error) => console.error("Error writing document: ", error));
}

function loadData() {
    const dateKey = dateInput.value;
    if (!dateKey) return;

    const allData = getAllData();
    const dayData = allData[dateKey];
    
    // Firebaseのリスナーを設定
    setupRealtimeListener(dateKey);

    renderData(dayData);
}

function setupRealtimeListener(dateKey) {
    if (unsubscribe) unsubscribe(); // 前のリスナーを解除

    if (!db || !currentUser) return; // ログインしていなければリスナー設定しない

    // ユーザーごとのパス
    unsubscribe = db.collection("users").doc(currentUser.uid).collection("reports").doc(dateKey)
        .onSnapshot((doc) => {
            if (doc.metadata.hasPendingWrites) {
                return;
            }

            const data = doc.data();
            if (data) {
                isUpdatingFromFirestore = true;
                saveToLocalStorage(dateKey, data.subjects, data.comment);
                renderData(data);
                isUpdatingFromFirestore = false;
            }
        });
}

// --- Auth Functions ---
function login() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            console.log("Logged in:", result.user);
            // リロードせずともAuth Listenerが検知してUI更新 & データロードする
        }).catch((error) => {
            console.error(error);
            alert("ログインに失敗しました");
        });
}

function logout() {
    firebase.auth().signOut().then(() => {
        console.log("Logged out");
        alert("ログアウトしました");
    }).catch((error) => {
        console.error(error);
    });
}

function updateAuthUI(user) {
    const loginBtn = document.getElementById('login-btn');
    const userInfo = document.getElementById('user-info');
    const userIcon = document.getElementById('user-icon');
    const userName = document.getElementById('user-name');

    if (user) {
        loginBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        userIcon.src = user.photoURL;
        userName.textContent = user.displayName;
    } else {
        loginBtn.style.display = 'block';
        userInfo.style.display = 'none';
        userIcon.src = '';
        userName.textContent = '';
    }
}

function renderData(dayData) {
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
        
        // その日のデータを削除
        delete allData[dateKey];
        localStorage.setItem('studyReportAllData', JSON.stringify(allData));

        container.innerHTML = '';
        globalCommentInput.value = '';
        addSubject(); 
        generateText(); 
    }
}

function copyToClipboard() {
    const copyTarget = document.getElementById("output-text");
    copyTarget.select();
    document.execCommand("copy");
    alert("コピーしました");
}

// ------ エクスポート & インポート ------

function exportData() {
    const allData = localStorage.getItem('studyReportAllData');
    if (!allData) {
        alert("保存されたデータがありません。");
        return;
    }
    const blob = new Blob([allData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study_report_backup_${new Date().toISOString().split('T')[0]}.json`;
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
            // JSONのバリデーションを簡易的に行う
            const data = JSON.parse(json);
            if (typeof data !== 'object') throw new Error("Invalid format");

            if (confirm("現在のデータを上書きして取り込みますか？")) {
                localStorage.setItem('studyReportAllData', JSON.stringify(data));
                loadData();
                alert("データの取り込みが完了しました。");
            }
        } catch (err) {
            alert("ファイルの読み込みに失敗しました。正しいJSONファイルか確認してください。");
            console.error(err);
        }
        // inputをリセット
        input.value = '';
    };
    reader.readAsText(file);
}