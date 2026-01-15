// --- サービスワーカー（オフライン機能）の登録 ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker Registered!', reg))
            .catch(err => console.log('Service Worker Registration Failed', err));
    });
}

// --- 以下アプリ本体のロジック ---
const subjectList = ["数I", "数A", "数II", "数B", "数C", "生物基礎", "物理基礎", "化学基礎", "生物", "化学", "英語", "英コミュ", "論評", "CS", "その他"];
const mathSubjects = ["数I", "数A", "数II", "数B", "数C"];
const scienceSubjects = ["生物基礎", "物理基礎", "化学基礎", "生物", "化学"];
const englishSubjects = ["英語", "英コミュ", "論評", "CS"];

const hoursOptions = Array.from({
    length: 11
}, (_, i) => `<option value="${i}">${i}</option>`).join('');
const minutesOptions = Array.from({
    length: 12
}, (_, i) => `<option value="${i*5}">${i*5}</option>`).join('');

const container = document.getElementById('subjects-container');
const outputText = document.getElementById('output-text');
const screenTotal = document.getElementById('screen-total');
const globalCommentInput = document.getElementById('global-comment-text');

window.onload = () => loadData();

function addSubject(initialData = null) {
    const div = document.createElement('div');
    div.className = 'subject-row';
    div.innerHTML = `
            <button class="remove-btn" onclick="removeRow(this)">削除</button>
            <div class="form-group">
                <label>教科</label>
                <select class="subject-select" onchange="toggleOtherInput(this)">${subjectList.map(s => `<option value="${s}">${s}</option>`).join('')}</select>
                <input type="text" class="other-subject-input" placeholder="教科名を入力" oninput="generateText()">
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
            if (selectElement.value === "その他") { otherInput.style.display = "block"; } else { otherInput.style.display = "none"; otherInput.value = ""; }
            generateText();
        }
        function removeRow(btn) { btn.parentElement.remove(); generateText(); }

        function generateText() {
            const rows = document.querySelectorAll('.subject-row');
            let totalMinutes = 0, bodyContent = "", displayGroups = new Set(), saveDataArray = [];
            rows.forEach(row => {
                const selectValue = row.querySelector('.subject-select').value;
                const otherValue = row.querySelector('.other-subject-input').value;
                const text = row.querySelector('.subject-text').value;
                const h = parseInt(row.querySelector('.time-h').value) || 0;
                const m = parseInt(row.querySelector('.time-m').value) || 0;
                saveDataArray.push({ select: selectValue, other: otherValue, text: text, h: h, m: m });
                let subjectDisplayName = (selectValue === "その他") ? (otherValue || "その他") : selectValue;
                totalMinutes += (h * 60) + m;
                if (mathSubjects.includes(selectValue)) displayGroups.add("数学");
                else if (scienceSubjects.includes(selectValue)) displayGroups.add("理科");
                else if (englishSubjects.includes(selectValue)) displayGroups.add("英語");
                else displayGroups.add(subjectDisplayName);
                bodyContent += `\n${subjectDisplayName}\n${text}\n勉強時間 ${h}時間${m}分\n\n`;
            });

            const totalH = Math.floor(totalMinutes / 60);
            const totalM = totalMinutes % 60;
            const globalComment = globalCommentInput.value;
            let header = (displayGroups.size > 0) ? `今日は${Array.from(displayGroups).join('と')}をやりました\n` : `今日の学習報告\n`;
            let finalText = header + bodyContent;
            if (rows.length > 1) finalText += `合計勉強時間 ${totalH}時間${totalM}分\n`;
            if (globalComment.trim() !== "") finalText += `\n\n${globalComment}`;

            screenTotal.innerText = `合計: ${totalH}時間 ${totalM}分`;
            outputText.value = finalText;
            saveToLocalStorage(saveDataArray, globalComment);
        }

        function saveToLocalStorage(subjects, comment) { localStorage.setItem('studyReportData', JSON.stringify({ subjects: subjects, comment: comment })); }
        function loadData() {
            const savedData = localStorage.getItem('studyReportData');
            container.innerHTML = '';
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                globalCommentInput.value = parsedData.comment || "";
                if (parsedData.subjects && parsedData.subjects.length > 0) parsedData.subjects.forEach(sub => addSubject(sub));
                else addSubject();
            } else { addSubject(); }
        }
        function resetData() { if(confirm("入力内容をすべて消去しますか？")) { localStorage.removeItem('studyReportData'); container.innerHTML = ''; globalCommentInput.value = ''; addSubject(); } }
        function copyToClipboard() { document.getElementById("output-text").select(); document.execCommand("copy"); alert("コピーしました"); }