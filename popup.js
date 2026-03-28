document.addEventListener('DOMContentLoaded', async function() {
  console.log("[VSS] DOMContentLoaded - 初期化開始");

  // ■ UI要素
  const recBtn = document.getElementById("recBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const stopBtn = document.getElementById("stopBtn");
  const mainStatus = document.getElementById("mainStatus");
  const previewBox = document.getElementById("previewBox");
  const resultArea = document.getElementById("resultArea");
  const cloudMsg = document.getElementById("cloudMsg");
  const currentTitleEdit = document.getElementById("currentTitleEdit");
  const modeSelect = document.getElementById("modeSelect");
  const mainArea = document.getElementById("mainArea");

  const apiKeyInput = document.getElementById("apiKey");
  const gasUrlInput = document.getElementById("gasUrl");
  const refDataInput = document.getElementById("refData");
  const customDictInput = document.getElementById("customDict");
  const settingsArea = document.getElementById("settingsArea");
  const settingsBtn = document.getElementById("settingsBtn");
  const toggleKeyBtn = document.getElementById("toggleKeyBtn");
  const apiKeySaved = document.getElementById("apiKeySaved");
  const csvUploadBtn = document.getElementById("csvUploadBtn");
  const csvFileInput = document.getElementById("csvFileInput");
  const csvStatus = document.getElementById("csvStatus");
  const recordingIndicator = document.getElementById("recordingIndicator");
  const missingWarning = document.getElementById("missingWarning");
  const llmProviderSelect = document.getElementById("llmProvider");
  const anthropicApiKeyInput = document.getElementById("anthropicApiKey");
  const toggleAnthropicKeyBtn = document.getElementById("toggleAnthropicKeyBtn");
  const anthropicKeySaved = document.getElementById("anthropicKeySaved");
  const anthropicKeyGroup = document.getElementById("anthropicKeyGroup");
  const familySummaryBtn = document.getElementById("familySummaryBtn");
  const familySummaryOverlay = document.getElementById("familySummaryOverlay");
  const familySummaryLoading = document.getElementById("familySummaryLoading");
  const familySummaryContent = document.getElementById("familySummaryContent");
  const familySummaryActions = document.getElementById("familySummaryActions");
  const closeFamilySummaryBtn = document.getElementById("closeFamilySummaryBtn");
  const printFamilySummaryBtn = document.getElementById("printFamilySummaryBtn");
  const copyFamilySummaryBtn = document.getElementById("copyFamilySummaryBtn");

  // 要素の存在確認ログ
  console.log("[VSS] settingsBtn:", !!settingsBtn, "settingsArea:", !!settingsArea);

  // ■ 状態管理
  let slots = {
    '1': { blobs: [], textLog: "", conversationLog: [], state: "empty", title: "カルテ A" },
    '2': { blobs: [], textLog: "", conversationLog: [], state: "empty", title: "カルテ B" },
    '3': { blobs: [], textLog: "", conversationLog: [], state: "empty", title: "カルテ C" }
  };
  let currentSpeaker = "獣医師";
  let currentSlotId = '1';
  let mediaRecorder = null;
  let recognition = null;
  let tempAudioChunks = [];
  let micLabel = "Unknown";

  // ■ 獣医療用語辞書（Whisper認識精度向上用）
  const vetDictionary = [
    // 一般用語
    "獣医師", "飼い主", "診察", "検査", "血液検査", "レントゲン", "エコー", "処方", "投薬", "注射",
    "ワクチン", "フィラリア", "体重", "体温", "心拍数", "呼吸数", "食欲", "元気", "排尿", "排便",
    "嘔吐", "下痢", "軟便", "低血糖", "腸内環境", "脱水",
    // 薬品名
    "アポキル", "リブレラ", "ソレンシア", "シンパリカ", "ネクスガード", "ブラベクト",
    "クレデリオ", "レボリューション", "アドボケート", "フロントライン", "ドロンタール",
    "メタカム", "オンシオール", "プレビコックス", "トラマドール", "ガバペンチン",
    "セレニア", "プリンペラン", "ファモチジン", "スクラルファート", "メトロニダゾール",
    "アモキシシリン", "セファレキシン", "エンロフロキサシン", "マルボフロキサシン",
    "プレドニゾロン", "デキサメタゾン", "シクロスポリン", "アザチオプリン",
    "フォルテコール", "ベナゼプリル", "ピモベンダン", "フロセミド", "スピロノラクトン",
    "アテノロール", "ジルチアゼム", "アムロジピン",
    // フード
    "ロイヤルカナン", "ヒルズ", "ピュリナ", "ユーカヌバ",
    "ドッグフード", "キャットフード", "サプリメント", "ミルク", "ぶどう糖",
    "i/d", "z/d", "d/d", "k/d", "s/d", "w/d", "t/d", "c/d", "j/d", "u/d",
    "消化器サポート", "スキンサポート", "腎臓サポート", "pHコントロール", "満腹感サポート",
    // 犬種・猫種
    "ダックスフンド", "チワワ", "トイプードル", "柴犬", "ポメラニアン", "フレンチブルドッグ",
    "ゴールデンレトリバー", "ラブラドール", "コーギー", "シーズー", "マルチーズ", "ヨークシャーテリア",
    "アメリカンショートヘア", "スコティッシュフォールド", "マンチカン", "ラグドール", "ペルシャ",
    // 病名・症状
    "膝蓋骨脱臼", "パテラ", "椎間板ヘルニア", "僧帽弁閉鎖不全症", "拡張型心筋症",
    "慢性腎臓病", "甲状腺機能低下症", "甲状腺機能亢進症", "クッシング症候群", "アジソン病",
    "アトピー性皮膚炎", "外耳炎", "膀胱炎", "尿路結石", "糖尿病", "てんかん",
    "リンパ腫", "肥満細胞腫", "乳腺腫瘍", "歯周病", "不正咬合",
    // 処置
    "避妊手術", "去勢手術", "歯石除去", "スケーリング", "抜歯", "切削",
    "皮下輸液", "静脈点滴", "麻酔", "鎮静", "入院", "退院",
    "細胞診", "病理検査", "尿検査", "糞便検査", "皮膚検査", "スクレーピング"
  ].join("、");

  // ■ 初期化
  try {
    loadSettings();
    updateSlotUI();
    updateTitleInput();
    setTimeout(fetchCloudMasterData, 500);
    console.log("[VSS] 初期化完了");
  } catch(e) {
    console.error("[VSS] 初期化エラー:", e);
  }

  // ■ イベントリスナー

  if (settingsBtn && settingsArea) {
    settingsBtn.addEventListener('click', () => {
      console.log("[VSS] 設定ボタンクリック");
      const isHidden = settingsArea.style.display === 'none' || settingsArea.style.display === '' || window.getComputedStyle(settingsArea).display === 'none';
      settingsArea.style.display = isHidden ? 'block' : 'none';
    });
    console.log("[VSS] 設定ボタン リスナー登録完了");
  } else {
    console.error("[VSS] 設定ボタンまたは設定エリアが見つかりません");
  }

  // モード切替（診察 / 受付）
  modeSelect.addEventListener('change', () => {
    mainArea.classList.remove("mode-interview");
    if (modeSelect.value === 'interview') mainArea.classList.add("mode-interview");
  });

  currentTitleEdit.addEventListener('input', () => {
    const newVal = currentTitleEdit.value;
    slots[currentSlotId].title = newVal;
    document.querySelector(`.slot-card[data-id="${currentSlotId}"] div`).innerText = newVal || `カルテ ${String.fromCharCode(64 + parseInt(currentSlotId))}`;
  });

  document.querySelectorAll('.slot-card').forEach(card => {
    card.addEventListener('click', async () => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        await pauseRecording(true);
      }
      currentSlotId = card.dataset.id;
      document.querySelectorAll('.slot-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      restoreScreenState();
      updateTitleInput();
    });
  });

  // ■ APIキー show/hide トグル
  if (toggleKeyBtn) {
    toggleKeyBtn.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      toggleKeyBtn.textContent = isPassword ? '隠す' : '表示';
    });
  }

  // ■ LLMプロバイダー切り替え
  if (llmProviderSelect) {
    llmProviderSelect.addEventListener('change', () => {
      anthropicKeyGroup.style.display = llmProviderSelect.value === 'claude' ? 'block' : 'none';
      saveToStorage('llm_provider', llmProviderSelect);
    });
  }
  if (toggleAnthropicKeyBtn) {
    toggleAnthropicKeyBtn.addEventListener('click', () => {
      const isPassword = anthropicApiKeyInput.type === 'password';
      anthropicApiKeyInput.type = isPassword ? 'text' : 'password';
      toggleAnthropicKeyBtn.textContent = isPassword ? '隠す' : '表示';
    });
  }

  // ■ CSVアップロード
  if (csvUploadBtn && csvFileInput) {
    csvUploadBtn.addEventListener('click', () => csvFileInput.click());
    csvFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target.result;
          // BOM除去
          const cleaned = text.replace(/^\uFEFF/, '');
          const lines = cleaned.split(/\r?\n/).filter(l => l.trim() !== '');
          // ヘッダー行を検出（最初の行が数字で始まらない場合はスキップ）
          const dataLines = lines[0] && /^\d/.test(lines[0].trim()) ? lines : lines.slice(1);
          const parsed = dataLines.map(l => l.trim()).filter(Boolean).join('\n');
          refDataInput.value = (refDataInput.value ? refDataInput.value + '\n' : '') + parsed;
          saveToStorage('ref_data', refDataInput);
          csvStatus.style.display = 'inline';
          csvStatus.textContent = `✓ ${dataLines.length}件 読み込み完了`;
          setTimeout(() => { csvStatus.style.display = 'none'; }, 3000);
        } catch(err) {
          console.error("[VSS] CSV読み込みエラー:", err);
          alert("CSVの読み込みに失敗しました。");
        }
        csvFileInput.value = '';
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  // 設定保存（change + blur で確実に保存）
  const saveToStorage = (key, el) => {
    try { chrome.storage.local.set({ [key]: el.value }); console.log("[VSS] 保存:", key); }
    catch(e) { console.error("[VSS] 保存エラー:", key, e); }
  };
  apiKeyInput.addEventListener('change', () => { saveToStorage('openai_api_key', apiKeyInput); if (apiKeyInput.value) apiKeySaved.style.display = 'block'; });
  apiKeyInput.addEventListener('blur', () => { saveToStorage('openai_api_key', apiKeyInput); if (apiKeyInput.value) apiKeySaved.style.display = 'block'; });
  gasUrlInput.addEventListener('change', () => { saveToStorage('gas_script_url', gasUrlInput); fetchCloudMasterData(); });
  gasUrlInput.addEventListener('blur', () => saveToStorage('gas_script_url', gasUrlInput));
  refDataInput.addEventListener('change', () => saveToStorage('ref_data', refDataInput));
  refDataInput.addEventListener('blur', () => saveToStorage('ref_data', refDataInput));
  customDictInput.addEventListener('change', () => saveToStorage('custom_dict', customDictInput));
  customDictInput.addEventListener('blur', () => saveToStorage('custom_dict', customDictInput));
  anthropicApiKeyInput.addEventListener('change', () => { saveToStorage('anthropic_api_key', anthropicApiKeyInput); if (anthropicApiKeyInput.value) anthropicKeySaved.style.display = 'block'; });
  anthropicApiKeyInput.addEventListener('blur', () => { saveToStorage('anthropic_api_key', anthropicApiKeyInput); if (anthropicApiKeyInput.value) anthropicKeySaved.style.display = 'block'; });

  // 録音開始
  recBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value;
    if (!apiKey) { alert("OpenAI APIキー（音声認識用）を設定してください"); settingsArea.style.display='block'; return; }
    if (llmProviderSelect.value === 'claude' && !anthropicApiKeyInput.value) { alert("Anthropic APIキーを設定してください"); settingsArea.style.display='block'; return; }
    resultArea.style.display = "none"; cloudMsg.style.display = "none"; missingWarning.style.display = "none";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      const devices = await navigator.mediaDevices.enumerateDevices();
      const device = devices.find(d => d.deviceId === track.getSettings().deviceId);
      micLabel = device ? device.label : "Default Mic";

      mediaRecorder = new MediaRecorder(stream);
      tempAudioChunks = [];
      mediaRecorder.ondataavailable = (e) => tempAudioChunks.push(e.data);

      mediaRecorder.onstop = () => {
        const blob = new Blob(tempAudioChunks, { type: "audio/webm" });
        slots[currentSlotId].blobs.push(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      startRecognition();
      mediaRecorder.start();

      slots[currentSlotId].state = "recording";
      updateScreenState("recording");
      updateSlotUI();
    } catch (err) { alert("マイクエラー: " + err.message); }
  });

  pauseBtn.addEventListener('click', async () => { await pauseRecording(true); });

  stopBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") await pauseRecording(false);
    const currentData = slots[currentSlotId];

    if (currentData.blobs.length === 0) {
      alert("録音データがありません。"); return;
    }

    mainStatus.innerText = "カルテ作成中... (音声解析中)";
    recBtn.style.display = "none"; pauseBtn.style.display = "none"; stopBtn.style.display = "none";

    const finalBlob = new Blob(currentData.blobs, { type: "audio/webm" });
    const selectedMode = modeSelect.value;
    await processWithAI(finalBlob, apiKeyInput.value, refDataInput.value, selectedMode);
  });

  // ■ セクション別コピーボタン
  document.querySelectorAll('.section-copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const soapText = document.getElementById("resSoap").value;
      const sectionKey = btn.dataset.section;
      const sections = parseSoapSections(soapText);
      const content = (sections[sectionKey] || "").replace(/^[・▪■]\s*/gm, '').trim();
      if (!content) { return; }
      try {
        await navigator.clipboard.writeText(content);
        btn.classList.add("copied");
        const orig = btn.textContent;
        btn.textContent = "✅";
        setTimeout(() => { btn.classList.remove("copied"); btn.textContent = orig; }, 1500);
      } catch (e) {}
    });
  });

  // ■ Stock全体コピー
  const copyBtn = document.getElementById("copyStockBtn");
  if(copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        const soapRaw = cleanSoapText(document.getElementById("resSoap").value);
        const title = slots[currentSlotId].title;
        const d = new Date();
        const days = ["日", "月", "火", "水", "木", "金", "土"];
        const dateStr = `[${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}]（${days[d.getDay()]}）`;
        const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

        const formatToPlain = (text) => {
          return text
            .replace(/\[S\]/g, '\n━━━━━━━━━━━━━━━━━━━━\n[S]\n')
            .replace(/\[O\]/g, '\n━━━━━━━━━━━━━━━━━━━━\n[O]\n')
            .replace(/\[A\]/g, '\n━━━━━━━━━━━━━━━━━━━━\n[A]\n')
            .replace(/\[P\]/g, '\n━━━━━━━━━━━━━━━━━━━━\n[P]\n')
            .replace(/\[処置・処方・費用\]/g, '\n━━━━━━━━━━━━━━━━━━━━\n[処置・処方・費用]\n')
            .replace(/\[MEMO\]/g, '\n━━━━━━━━━━━━━━━━━━━━\n[MEMO]\n')
            .replace(/■/g, '');
        };

        const plainContent = `${dateStr} ${timeStr}\n${formatToPlain(soapRaw)}\n━━━━━━━━━━━━━━━━━━━━\nGenerated by VSS`;

        const formatToHtml = (text) => {
          let html = text
            .replace(/\n/g, '<br>')
            .replace(/\[S\]/g, '<hr><h1>[S]</h1>')
            .replace(/\[O\]/g, '<hr><h1>[O]</h1>')
            .replace(/\[A\]/g, '<hr><h1>[A]</h1>')
            .replace(/\[P\]/g, '<hr><h1>[P]</h1>')
            .replace(/\[処置・処方・費用\]/g, '<hr><h2>[処置・処方・費用]</h2>')
            .replace(/\[MEMO\]/g, '<hr><h2>[MEMO]</h2>')
            .replace(/主訴：/g, '<b>主訴：</b>')
            .replace(/問診時/g, '<b>問診時</b>')
            .replace(/■/g, '');

          const vitalMatch = text.match(/BW:\s*([^\s]*)\s*kg\s+T:\s*([^\s]*)\s*℃\s+P:\s*([^\s]*)\s*bpm\s*CM\s*\/\s+R:\s*([^\s]*)\s*bpm/i);
          if (vitalMatch) {
            const vitalTable = `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;"><tr><td>BW: ${vitalMatch[1] || '○○'} kg</td><td>T: ${vitalMatch[2] || '○○'}℃</td><td>P: ${vitalMatch[3] || '○○'} bpm CM /</td><td>R: ${vitalMatch[4] || '○○'} bpm</td></tr></table>`;
            html = html.replace(/BW:\s*[^\s]*\s*kg[^<]*bpm/gi, vitalTable);
          }
          return html;
        };

        const htmlContent = `<meta charset="utf-8"><hr><h1>${dateStr} ${timeStr}</h1><hr>${formatToHtml(soapRaw)}<hr><br><small>Generated by VSS</small>`;

        const blobHtml = new Blob([htmlContent], { type: "text/html" });
        const blobText = new Blob([plainContent], { type: "text/plain" });
        await navigator.clipboard.write([new ClipboardItem({ "text/html": blobHtml, "text/plain": blobText })]);

        const originalText = copyBtn.innerText;
        copyBtn.innerText = "✅ Stockにコピー完了！";
        copyBtn.style.background = "#2ecc71";
        setTimeout(() => { copyBtn.innerText = originalText; copyBtn.style.background = "#2c3e50"; }, 2000);
      } catch (err) { alert("コピー失敗: " + err.message); }
    });
  }

  // ■ ご家族向け要約
  familySummaryBtn.addEventListener('click', generateFamilySummary);

  closeFamilySummaryBtn.addEventListener('click', () => {
    familySummaryOverlay.style.display = 'none';
  });

  familySummaryOverlay.addEventListener('click', (e) => {
    if (e.target === familySummaryOverlay) familySummaryOverlay.style.display = 'none';
  });

  copyFamilySummaryBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(familySummaryContent.value);
      const orig = copyFamilySummaryBtn.innerText;
      copyFamilySummaryBtn.innerText = "✅ コピー完了！";
      copyFamilySummaryBtn.style.background = "#2ecc71";
      setTimeout(() => { copyFamilySummaryBtn.innerText = orig; copyFamilySummaryBtn.style.background = "#3498db"; }, 2000);
    } catch (e) { alert("コピー失敗: " + e.message); }
  });

  printFamilySummaryBtn.addEventListener('click', printFamilySummary);

  document.getElementById("downloadLog").addEventListener("click", () => {
      chrome.storage.local.get(['vet_history'], (r) => {
      const arr = r.vet_history || [];
      if (!arr.length) { alert("履歴なし"); return; }
      let csv = "\uFEFF日時,タイトル,マイク,SOAP要約,全文ログ\n";
      arr.forEach(a => { const c = (t) => `"${(t||"").replace(/"/g, '""')}"`; csv += `${c(a.date)},${c(a.title)},${c(a.mic)},${c(a.soap)},${c(a.full)}\n`; });
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a"); a.href = url; a.download = `vet_log_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    });
  });

  // ■ 内部ロジック

  // SOAP テキストから「・」だけの空行を除去するクリーンアップ
  function cleanSoapText(text) {
    return text
      .replace(/^[・▪■]\s*$/gm, '')   // 記号だけの行を削除（万が一残った場合のフォールバック）
      .replace(/\n{3,}/g, '\n\n')      // 3行以上の連続空行を2行に圧縮
      .trim();
  }

  async function pauseRecording(generateTitle = false) {
    return new Promise((resolve) => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mainStatus.innerText = "データ保存中...";
        mediaRecorder.onstop = async () => {
          const blob = new Blob(tempAudioChunks, { type: "audio/webm" });
          slots[currentSlotId].blobs.push(blob);

          if (recognition) recognition.stop();

          slots[currentSlotId].state = "paused";
          updateScreenState("paused");
          updateSlotUI();
          if (generateTitle) await generateTempTitle(slots[currentSlotId].textLog, refDataInput.value);
          resolve();
        };
        mediaRecorder.stop();
      } else { resolve(); }
    });
  }

  // ■ 音声認識（重複防止付き）
  function startRecognition() {
    if (!('webkitSpeechRecognition' in window)) return;
    if(recognition) try { recognition.stop(); } catch(e){}

    recognition = new webkitSpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (e) => {
      let final = ''; let interim = '';
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (final) {
        const trimmed = final.trim();
        const existingLog = slots[currentSlotId].textLog.trim();
        if (trimmed && !existingLog.endsWith(trimmed)) {
          slots[currentSlotId].textLog += final + " ";
          const speaker = estimateSpeaker(final);
          const timestamp = new Date().toTimeString().slice(0, 8);
          slots[currentSlotId].conversationLog.push({ speaker: speaker, text: trimmed, timestamp: timestamp });
        }
      }
      previewBox.innerHTML = `<div style="color:#333">${slots[currentSlotId].textLog}</div><div style="color:#aaa">${interim}</div>`;
      previewBox.scrollTop = previewBox.scrollHeight;
    };

    recognition.onend = () => {
      if (slots[currentSlotId].state === "recording") {
        setTimeout(() => {
          if (slots[currentSlotId].state === "recording") {
            try { recognition.start(); } catch(e){}
          }
        }, 200);
      }
    };

    try { recognition.start(); } catch(e){}
  }

  async function fetchCloudMasterData() {
    const gasUrl = gasUrlInput.value;
    if (!gasUrl) return;
    refDataInput.placeholder = "クラウドから最新データを取得中...";
    try {
      const res = await fetch(gasUrl);
      const data = await res.json();
      if (data.master_data) {
        refDataInput.value = data.master_data;
        chrome.storage.local.set({ 'ref_data': data.master_data });
      }
    } catch (e) {} finally { refDataInput.placeholder = "例: 1001, 田中..."; }
  }

  function updateTitleInput() {
    currentTitleEdit.value = slots[currentSlotId].title;
  }

  async function generateTempTitle(text, refData) {
    if (!text || text.length < 5) return;
    const cardDiv = document.querySelector(`.slot-card[data-id="${currentSlotId}"] div`);
    cardDiv.innerText = "解析...";
    try {
      const newTitle = (await callLLM(
        `会話から『飼い主名 - 動物名』を10文字以内で抽出せよ。\n必ず以下の【マスタDB】を検索し、一致する患者がいればその「漢字表記」と「ID」を使用せよ。\n# マスタDB\n${refData}`,
        text
      )).trim();
      slots[currentSlotId].title = newTitle;
      cardDiv.innerText = newTitle;
      if (currentSlotId === document.querySelector('.slot-card.active').dataset.id) {
        currentTitleEdit.value = newTitle;
      }
    } catch (e) { cardDiv.innerText = slots[currentSlotId].title; }
  }

  // ■ SOAPセクションパーサー
  function parseSoapSections(text) {
    const sections = { S: "", O: "", A: "", P: "", "処置": "", MEMO: "" };
    const markers = [
      { key: "S", regex: /\[S\]/ },
      { key: "O", regex: /\[O\]/ },
      { key: "A", regex: /\[A\]/ },
      { key: "P", regex: /\[P\]/ },
      { key: "処置", regex: /\[処置・処方・費用\]/ },
      { key: "MEMO", regex: /\[MEMO\]/ }
    ];

    // 各セクションの開始位置を探す
    const positions = [];
    markers.forEach(m => {
      const match = text.match(m.regex);
      if (match) positions.push({ key: m.key, index: match.index, headerLen: match[0].length });
    });
    positions.sort((a, b) => a.index - b.index);

    for (let i = 0; i < positions.length; i++) {
      const start = positions[i].index + positions[i].headerLen;
      const end = (i + 1 < positions.length) ? positions[i + 1].index : text.length;
      sections[positions[i].key] = text.substring(start, end).trim();
    }
    return sections;
  }

  // ■ 記載漏れチェック
  function checkMissingItems(soapText, mode) {
    const warnings = [];
    const sections = parseSoapSections(soapText);

    // 主訴チェック（全モード共通）
    if (!sections.S || !sections.S.match(/主訴/)) {
      warnings.push("⚠️ 主訴が記載されていません");
    }

    // 診察モードのみチェック
    if (mode !== 'interview') {
      // 体重チェック
      if (sections.O && !sections.O.match(/BW:\s*\d/)) {
        warnings.push("⚠️ 体重(BW)が未記入です");
      }
      // 体温チェック
      if (sections.O && !sections.O.match(/T:\s*\d/)) {
        warnings.push("⚠️ 体温(T)が未記入です");
      }

      // 専門科固有チェック（SOAP内容から自動判定）
      if (soapText.match(/皮膚|アトピー|外耳炎|痒/) && !soapText.match(/痒み|掻|かゆ|スクレーピング|皮膚所見/)) {
        warnings.push("⚠️ 皮膚科: 痒みスコアまたは皮膚所見の記載を確認してください");
      }
      if (soapText.match(/心臓|僧帽弁|心筋/) && !soapText.match(/聴診|雑音|心音|心拍/)) {
        warnings.push("⚠️ 循環器: 聴診所見の記載を確認してください");
      }
      if (soapText.match(/予防接種|ワクチン/) && !soapText.match(/ロット|接種部位|次回/)) {
        warnings.push("⚠️ 予防接種: ロット番号・接種部位の記載を確認してください");
      }
    }

    return warnings;
  }

  // ■ 診療科自動判定（会話内容から該当する専門指示を自動付与）
  function detectSpecialtyFromText(text) {
    let extra = "";

    // 皮膚科キーワード検出
    if (text.match(/痒|かゆ|掻く|舐める|脱毛|湿疹|皮膚|アポキル|外耳炎|アトピー|膿皮|紅斑|丘疹|膿疱/)) {
      extra += `
      # 皮膚科特化指示（会話内容から自動検出）
      以下の項目を[O]セクションで重点的に記載すること：
      皮膚所見（部位・範囲・性状：紅斑、丘疹、膿疱、痂皮、脱毛等）
      痒みスコア（0-10）：飼い主の申告に基づく
      スキンスクレーピング/毛検査所見（実施した場合）
      細胞診所見（実施した場合）
      [A]では鑑別診断リストを記載し、[P]では薬浴/外用薬/内服の計画を詳細に記載すること。
      `;
    }

    // 循環器キーワード検出
    if (text.match(/心雑音|心臓|僧帽弁|不整脈|ピモベンダン|フォルテコール|拡張型|心筋症|心拍|聴診/)) {
      extra += `
      # 循環器特化指示（会話内容から自動検出）
      以下の項目を[O]セクションで重点的に記載すること：
      聴診所見：心雑音の有無、グレード（I-VI）、最強点（僧帽弁/三尖弁/大動脈弁/肺動脈弁）
      心拍数（HR）と不整脈の有無
      呼吸数（RR）と努力呼吸の有無
      粘膜色、CRT（毛細血管再充満時間）
      エコー所見（LA/Ao比、LVIDd/s、FS%等）があれば記載
      [A]ではISACHC/ACVIMステージ分類を記載すること。
      `;
    }

    // 予防接種キーワード検出
    if (text.match(/ワクチン|予防接種|狂犬病|混合ワクチン|ロット番号|接種/)) {
      extra += `
      # 予防接種特化指示（会話内容から自動検出）
      以下の項目を必ず記載すること：
      [O]に接種前の一般身体検査所見（接種可能な状態か確認）
      [P]に接種したワクチンの正式名称、メーカー名
      ロット番号・有効期限（会話に含まれている場合）
      次回接種予定日
      接種部位
      副反応の観察指示（飼い主への説明内容）
      [処置・処方・費用]にワクチン名と費用を記載すること。
      `;
    }

    // 歯科キーワード検出
    if (text.match(/歯石|歯周病|スケーリング|抜歯|不正咬合|歯肉|歯肉炎|口内炎|口腔|口臭|歯式|動揺歯/)) {
      extra += `
      # 歯科特化指示（会話内容から自動検出）
      以下の項目を[O]セクションで重点的に記載すること：
      口腔内所見（歯石の程度、歯肉の状態、動揺歯、欠歯）
      歯石スコア（軽度/中等度/重度）
      不正咬合の有無と種類
      口臭の程度
      歯式（該当歯の記録）があれば記載
      [P]ではスケーリング、抜歯、投薬等の処置計画を記載すること。
      `;
    }

    if (extra) console.log("[VSS] 自動検出された診療科指示あり");
    return extra;
  }

  // ■ LLM統一呼び出し（OpenAI / Claude 切り替え）
  async function callLLM(systemPrompt, userContent) {
    const provider = llmProviderSelect ? llmProviderSelect.value : 'openai';

    if (provider === 'claude') {
      const anthropicKey = anthropicApiKeyInput.value;
      if (!anthropicKey) throw new Error("Anthropic APIキーが設定されていません");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error("Claude エラー: " + (data.error.message || JSON.stringify(data.error)));
      if (!data.content || !data.content[0]) throw new Error("Claude からの応答が不正です");
      // マークダウンコードフェンスを除去
      return data.content[0].text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    } else {
      const apiKey = apiKeyInput.value;
      if (!apiKey) throw new Error("OpenAI APIキーが設定されていません");
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
          ]
        })
      });
      const data = await res.json();
      if (data.error) throw new Error("GPT エラー: " + (data.error.message || JSON.stringify(data.error)));
      if (!data.choices || !data.choices[0]) throw new Error("GPTからの応答が不正です");
      return data.choices[0].message.content.trim();
    }
  }

  // ■ AI処理
  async function processWithAI(audioBlob, apiKey, refData, selectedMode) {
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "whisper-1");
      formData.append("language", "ja");

      // Whisperプロンプト最適化：文脈付きの自然な文章形式で認識精度を向上
      const customDict = customDictInput.value.trim();
      const customTerms = customDict ? customDict.split(/\n/).filter(t => t.trim()).join("、") : "";

      // 優先度の高い用語を先に配置（Whisperは冒頭のプロンプトをより重視する）
      // ※病名は混同されやすいペアを優先して収録
      const whisperPrompt = `獣医師の診察会話です。`
        + `薬：アポキル、リブレラ、ソレンシア、シンパリカ、ネクスガード、セレニア、プレドニゾロン、ピモベンダン、フォルテコール、フロセミド、アモキシシリン、セファレキシン、ガバペンチン、メトロニダゾール、ミルベマイシン、アンチノール。`
        + `病名：僧帽弁閉鎖不全症、膝蓋骨脱臼、椎間板ヘルニア、変形性関節症、反応性過形成、子宮蓄膿症、甲状腺機能亢進症、副腎皮質機能亢進症、糖尿病、慢性腎臓病、膵炎、肝リピドーシス、肥満細胞腫、リンパ腫、血管肉腫、乳腺腫瘍。`
        + `検査：細胞診、病理検査、血液検査、生化学検査、エコー、レントゲン、心電図、尿検査、皮下輸液、涙管洗浄。`
        + `解剖：僧帽弁、三尖弁、肛門腺、甲状腺、副腎、脾臓、膀胱、前立腺、靭帯、前十字靭帯、盲腸便。`
        + (customTerms ? `院内：${customTerms}。` : "");
      formData.append("prompt", whisperPrompt.substring(0, 500));

      const res1 = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { "Authorization": `Bearer ${apiKey}` }, body: formData });
      const data1 = await res1.json();
      if (data1.error) { throw new Error("Whisperエラー: " + (data1.error.message || JSON.stringify(data1.error))); }
      const rawText = data1.text;
      if (!rawText) { throw new Error("音声の文字起こしが空でした。録音内容を確認してください。"); }

      // ■ LLMテキスト補正パイプライン（Whisper出力のクリーニング）
      mainStatus.innerText = "カルテ作成中... (テキスト補正中)";
      console.log("[VSS] テキスト補正開始 - 元テキスト文字数:", rawText.length);

      const correctionPrompt = `あなたは獣医療専門のテキスト校正アシスタントです。
以下の音声認識テキストを校正してください。

# ルール
- 意味を絶対に変えないこと
- 「えー」「あのー」「えっと」「うーん」等のフィラー（言い淀み）を除去
- 「ご視聴ありがとうございました」等の配信・動画由来のフレーズは音声認識のノイズなので削除すること
- 獣医療の専門用語を正しい表記に修正（例：あぽきる→アポキル、ぴもべんだん→ピモベンダン）
- 薬品名・病名・検査名のカタカナ/漢字表記を正確に修正
- 数値（体重・体温・心拍数等）は正確に保持
- 句読点を適切に補正し読みやすくする
- 話し言葉の構造はそのまま維持（敬語・口語の変換はしない）
- 校正後のテキストのみを出力すること（説明や注釈は不要）
- 前後の文脈と無関係に唐突に出現する単語やフレーズは音声認識の誤認識である可能性が極めて高い。会話全体の流れ（来院理由・診察内容）と整合しない話題が突然現れた場合、その単語を無理に残さず、前後の文脈から最も自然な語に置き換えること。置き換え先が判断できない場合はその部分を削除すること。

# 音声認識で特に混同されやすい獣医療用語（前後の文脈を必ず参照して正しい方に修正すること）

## 循環器
- 「べん」「便」→「弁」：心臓の話題 → 弁（僧帽弁、三尖弁、大動脈弁、肺動脈弁）
- 「僧帽便」「総帽弁」→「僧帽弁」
- 「三尖便」「山泉弁」→「三尖弁」
- 「弁膜賞」「便膜症」→「弁膜症」
- 「心雑音」「心臓音」：雑音のグレードや聴診の話題 → 心雑音
- 「肺水腫」↔「廃用症候群」：心臓・呼吸困難の話題 → 肺水腫
- 「不整脈」「付正薬」→「不整脈」

## 整形外科
- 「股関節」↔「肩関節」：前肢の話題 → 肩関節、後肢の話題 → 股関節
- 「靭帯」「人体」「仁帯」→「靭帯」：関節・膝の話題 → 靭帯
- 「前十字人体」→「前十字靭帯」
- 「膝蓋骨」「失敗骨」「漆外骨」→「膝蓋骨」
- 「脱臼」「脱球」「脱旧」→「脱臼」
- 「変形性関節症」「変形性間接症」→「変形性関節症」
- 「椎間板」「追完版」「追間板」→「椎間板」

## 口腔・歯科
- 「肺炎」↔「歯肉炎」：歯・口腔・スケーリング・歯石の話題 → 歯肉炎
- 「胃石」↔「歯石」：歯・口腔・スケーリングの話題 → 歯石
- 「抜糸」↔「抜歯」：歯の話題 → 抜歯、術後の話題 → 抜糸
- 「不正交合」「不正咬合」→「不正咬合」

## 消化器・内科
- 「鼻炎」↔「膵炎」：嘔吐・腹痛・消化器・リパーゼの話題 → 膵炎
- 「大腸炎」↔「腸炎」：下痢・血便の話題は文脈に応じて選択
- 「肝臓」「感想」「幹層」→「肝臓」
- 「腎臓」「神蔵」「人造」→「腎臓」
- 「膵臓」「推測」「水蔵」→「膵臓」
- 「脾臓」「非蔵」「疲労」→「脾臓」：エコー・腫瘍・摘出の話題 → 脾臓
- 「胆嚢」「たんのう」→「胆嚢」
- 「黄疸」「応弾」「横断」→「黄疸」：肝臓・胆管・ビリルビンの話題 → 黄疸
- 「嘔吐」「応答」→「嘔吐」：吐く・気持ち悪いの話題 → 嘔吐

## 泌尿器・生殖器
- 「膀胱」「暴行」→「膀胱」
- 「膀胱炎」「暴行炎」→「膀胱炎」
- 「尿管」「入館」→「尿管」
- 「前立腺」「前立線」→「前立腺」
- 「子宮蓄膿症」「子宮畜膿症」→「子宮蓄膿症」
- 「去勢」「虚勢」→「去勢」
- 「避妊」「避任」→「避妊」

## 内分泌
- 「甲状腺」「甲状線」「校情腺」→「甲状腺」
- 「副腎」「服人」「副人」「副神」→「副腎」
- 「クッシング」「くっしんぐ」→「クッシング」：副腎・多飲多尿の話題 → クッシング症候群

## 腫瘍・病理
- 「反応性化形成」「反応性過計性」→「反応性過形成」
- 「腫瘤」「腫瘍」：塊・しこりの話題 → 腫瘤、悪性・転移の話題 → 腫瘍
- 「肥満細胞腫」「肥満再暴走」→「肥満細胞腫」
- 「リンパ腫」「リンパ種」→「リンパ腫」
- 「血管肉腫」「血管肉種」→「血管肉腫」
- 「乳腺腫瘍」「入腺腫瘍」→「乳腺腫瘍」
- 「転移」「天移」「展示」→「転移」：がん・腫瘍の話題 → 転移
- 「生検」「性検」「正検」→「生検」
- 「細胞診」「再暴診」→「細胞診」
- 「病理」「秒理」→「病理」

## 検査・処置
- 「採血」「採決」→「採血」
- 「点滴」「天敵」→「点滴」
- 「点鼻」「検治」「点鼻検治」→「点鼻」：鼻に薬を入れる話題 → 点鼻
- 「ネブライザー」「ウェブライザー」「エレモライザー」→「ネブライザー」
- 「麻酔」「間瀬」「真正」→「麻酔」
- 「鎮痛」「沈痛」→「鎮痛」
- 「皮下輸液」「日下輸液」→「皮下輸液」
- 「肛門腺」「肛門線」「校門腺」→「肛門腺」
- 「粘膜」「年膜」→「粘膜」
- 「抗生剤」「抗生材」「更生剤」→「抗生剤」

## 皮膚
- 「膿皮症」「農皮症」→「膿皮症」
- 「痂皮」「カヒ」→「痂皮」

## ウサギ・エキゾチック
- 「毛虫腑」「毛中部」「盲腸分」→「盲腸便」：ウサギの糞・お尻・栄養・食べ残しの話題 → 盲腸便
- 「類幹」「涙幹」「流感」→「涙管」：目・目頭・詰まり・洗浄の話題 → 涙管（鼻涙管）
- 「牧草」の誤認識（「墓層」「幕僧」等）→「牧草」：ウサギ・ペレット・チモシーの話題 → 牧草
- 「毛球症」「毛急症」→「毛球症」
- 「胃腸うっ滞」「胃腸鬱体」→「胃腸うっ滞」`;

      let fullText = rawText; // フォールバック: 補正失敗時は元テキストを使用
      try {
        fullText = await callLLM(correctionPrompt, rawText);
        console.log("[VSS] テキスト補正完了 - 補正後文字数:", fullText.length);
      } catch (corrErr) {
        console.warn("[VSS] テキスト補正失敗 - 元テキストを使用:", corrErr.message);
      }

      const today = new Date();
      const days = ["日", "月", "火", "水", "木", "金", "土"];
      const dateStr = `[${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}]（${days[today.getDay()]}）`;

      // ベースプロンプト
      let systemPrompt = `
      あなたは獣医師アシスタントです。会話テキストから厳格なフォーマットでカルテを作成してください。
      出力はJSON形式 { "soap_text": "...", "full_log": "..." } で行ってください。
      - soap_text: 整形されたカルテ（SOAP形式）
      - full_log: 会話の全文ログ。入力テキストの内容を一切省略・要約せず、全文をそのまま収録すること。話者の発言を改行で区切り読みやすく整形するが、内容の削除や圧縮は絶対に行わないこと。次回予定・日時・処置の説明・飼い主への指導内容など、すべての発言を漏れなく含めること。

      # 重要ルール
      - テンプレート説明文（「主訴を箇条書きで記載」等）は絶対に出力しないこと。実際の内容のみを記載すること。
      - 各セクションでは、会話から得られた具体的な情報のみを記載すること。会話中に言及されていない情報を「正常」「問題なし」等と推測で補完してはならない。
      - 情報がない項目は一切出力しないこと。内容がない場合はセクション見出し行のみ残すこと。
      - 箇条書きの行頭に「・」や「▪」などの記号をつけないこと。改行で項目を区切ること。
      - [S]セクションの構成ルール：
        1行目は必ず「主訴：〇〇」の形式で、飼い主がなぜ来院したかの理由を端的に1行で書くこと。
        「問診時」セクションには経過・状況の詳細を記載するが、食欲/元気/排尿/排便/嘔吐に関する内容は下の一覧表に集約するのでここでは重複記載しないこと。
        「食欲：…嘔吐：」の一覧表には、会話中で明確に言及された情報のみを記入すること。会話に言及がない項目は空欄のままにすること。「正常」「問題なし」「なし言及」「言及なし」等の文言で埋めることは禁止。

      # 重要：院内マスタデータベースの参照
      以下のデータは、当院の「全患者リスト」および「全会計・薬剤マスタ」です。
      1. 【患者名・ID】会話に登場する名前がマスタにある場合、必ずマスタの表記を使用してください。
      2. 【会計チェック】処置・検査・薬の名前は、マスタ内の「正式な課金項目名」に変換してください。

      【 院内マスタDB 】
      ${refData || "データなし"}

      # 出力フォーマット（厳守）

      [S]
      主訴：〇〇（来院理由を端的に1行で）
      問診時
      （経過・状況の詳細。食欲/元気/排尿/排便/嘔吐は下の一覧に集約するのでここには書かない）

      食欲：　　元気：　　排尿：　　排便：　　嘔吐：

      [O]
      BW: ○○ kg　　T: ○○℃　　P: ○○ bpm CM /　　R: ○○ bpm
      （身体検査所見の具体的内容を改行区切りで記載）

      [A]
      （診断名・鑑別診断・病態の評価のみを記載すること。治療方針や処置内容は[P]に書くこと。[A]には「何の病気か・何が起きているか」だけを書き、「何をするか」は書かない）

      [P]
      （治療計画・処方・飼い主への指導・次回予定を記載。[A]の診断に対して「何をするか」を書く）

      [処置・処方・費用]
      処置名@金額

      [MEMO]
      受付：　　診察：　　検査：　　調剤：　　会計：　TEL:　/　予約確定日: /
      （[MEMO]の各項目は会話中で明確に言及された情報のみを記入すること。推測で埋めないこと。言及がなければ空欄のまま）
      `;

      // 受付問診モード
      if (selectedMode === 'interview') {
        systemPrompt = `
        あなたは獣医師アシスタントです。今は受付での「問診・ヒアリング」のフェーズです。
        会話の内容はすべて「飼い主からの聴取事項」として、[S]の項目に詳細にまとめてください。
        出力はJSON形式 { "soap_text": "...", "full_log": "..." } で行ってください。
        - full_log: 入力テキストの内容を一切省略・要約せず、全文をそのまま収録すること。話者の発言を改行で区切り読みやすく整形するが、内容の削除や圧縮は絶対に行わないこと。

        # 重要ルール
        - テンプレート説明文は絶対に出力しないこと。実際の内容のみを記載すること。
        - [S]セクションの構成ルール：
          1行目は必ず「主訴：〇〇」の形式で、来院理由を端的に1行で書くこと。
          「問診時」には経過・状況の詳細を記載。食欲/元気/排尿/排便/嘔吐は下の一覧表に集約し重複しないこと。
          一覧表には会話中で明確に言及された情報のみを記入し、言及がない項目は空欄のままにすること。「正常」「問題なし」「なし言及」「言及なし」等の文言で埋めることは禁止。
        - [O][A][P][処置・処方・費用]: セクション見出しだけ出力し、中身は完全に空欄にすること。
        - [MEMO]: 会話から得られた事務的情報があれば記載。なければ空欄のまま。
        - 参照マスタDB：【 ${refData || "データなし"} 】
        - 会話に登場する名前がマスタにある場合、必ずマスタの表記を使用すること。

        # 出力フォーマット（厳守）

        [S]
        主訴：〇〇（来院理由を端的に1行で）
        問診時
        （経過・状況の詳細。食欲/元気/排尿/排便/嘔吐は下の一覧に集約）

        食欲：　　元気：　　排尿：　　排便：　　嘔吐：

        [O]
        BW: ○○ kg　　T: ○○℃　　P: ○○ bpm CM /　　R: ○○ bpm

        [A]

        [P]

        [処置・処方・費用]

        [MEMO] （会話から得られた追加情報）
        受付：　　診察：　　検査：　　調剤：　　会計：　TEL:　/　予約確定日: /
        `;
      }

      // 診療科自動判定（会話内容から該当する専門指示を自動付与）
      const specialtyPrompt = detectSpecialtyFromText(fullText);
      if (specialtyPrompt) {
        systemPrompt += specialtyPrompt;
      }

      mainStatus.innerText = "カルテ作成中... (SOAP生成中)";
      const soapResult = await callLLM(systemPrompt, fullText);
      const aiJson = JSON.parse(soapResult);
      const soapText = aiJson.soap_text || aiJson.soap || "生成エラー";

      const finalTitle = slots[currentSlotId].title;
      const cleanedSoap = cleanSoapText(soapText);
      document.getElementById("resTitle").value = finalTitle;
      document.getElementById("resSoap").value = cleanedSoap;
      document.getElementById("resFull").value = fullText;
      resultArea.style.display = "block";
      mainStatus.innerText = "完了";

      // 記載漏れチェック
      const warnings = checkMissingItems(cleanedSoap, selectedMode);
      if (warnings.length > 0) {
        missingWarning.innerHTML = warnings.join("<br>");
        missingWarning.style.display = "block";
      } else {
        missingWarning.style.display = "none";
      }

      // 保存処理を並列実行（ローカル保存+クラウド保存+会話ログ保存を同時に）
      const savePromises = [saveAll(finalTitle, cleanedSoap, fullText, micLabel)];
      if (slots[currentSlotId].conversationLog.length > 0) {
        savePromises.push(saveConversationLogToDrive(slots[currentSlotId].conversationLog, finalTitle));
      }
      await Promise.all(savePromises);

      slots[currentSlotId] = { blobs: [], textLog: "", conversationLog: [], state: "empty", title: `カルテ ${String.fromCharCode(64 + parseInt(currentSlotId))}` };
      updateSlotUI();
      updateTitleInput();
      document.querySelector(`.slot-card[data-id="${currentSlotId}"] div`).innerText = slots[currentSlotId].title;
      recBtn.style.display = "block"; recBtn.innerText = "🎙 次の診察を開始";
    } catch (e) {
      console.error("[VSS] processWithAI エラー:", e);
      alert("エラー: " + e.message);
      mainStatus.innerText = "エラー発生";
      recBtn.style.display = "block";
      recBtn.innerText = "🎙 録音開始";
      pauseBtn.style.display = "none";
      stopBtn.style.display = "none";
    }
  }

  async function saveAll(title, soap, full, mic) {
    const record = { date: new Date().toLocaleString(), title: title, soap: soap, full: full, mic: mic };
    chrome.storage.local.get(['vet_history'], (r) => { const arr = r.vet_history || []; arr.unshift(record); chrome.storage.local.set({ 'vet_history': arr }); });
    const gasUrl = gasUrlInput.value.trim();
    if (gasUrl) { try { mainStatus.innerText = "クラウドへ送信中..."; await fetch(gasUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) }); cloudMsg.style.display = "block"; mainStatus.innerText = "✅ 全て完了"; } catch (e) { mainStatus.innerText = "⚠️ クラウド送信失敗"; } } else { mainStatus.innerText = "✅ 完了 (ローカルのみ)"; }
  }

  function loadSettings() {
    try {
      chrome.storage.local.get(['openai_api_key', 'gas_script_url', 'ref_data', 'custom_dict', 'llm_provider', 'anthropic_api_key'], (r) => {
        try {
          if (r.openai_api_key) { apiKeyInput.value = r.openai_api_key; if (apiKeySaved) apiKeySaved.style.display = 'block'; }
          if (r.gas_script_url) gasUrlInput.value = r.gas_script_url;
          if (r.ref_data) refDataInput.value = r.ref_data;
          if (r.custom_dict) customDictInput.value = r.custom_dict;
          if (r.llm_provider) { llmProviderSelect.value = r.llm_provider; anthropicKeyGroup.style.display = r.llm_provider === 'claude' ? 'block' : 'none'; }
          if (r.anthropic_api_key) { anthropicApiKeyInput.value = r.anthropic_api_key; anthropicKeySaved.style.display = 'block'; }
          console.log("[VSS] 設定読み込み完了");
        } catch(e) {
          console.error("[VSS] 設定適用エラー:", e);
        }
      });
    } catch(e) {
      console.error("[VSS] chrome.storage アクセスエラー:", e);
    }
  }

  function updateScreenState(state) {
    if (state === "recording") {
      mainStatus.innerText = "● 録音中...";
      mainStatus.classList.add("recording");
      recBtn.style.display = "none";
      pauseBtn.style.display = "block";
      stopBtn.style.display = "block";
      recordingIndicator.classList.add("active");
    } else if (state === "paused") {
      mainStatus.innerText = "⏸ 一時停止中";
      mainStatus.classList.remove("recording");
      recBtn.style.display = "block";
      recBtn.innerText = "🎙 録音再開";
      pauseBtn.style.display = "none";
      stopBtn.style.display = "block";
      recordingIndicator.classList.remove("active");
    } else {
      mainStatus.innerText = "準備完了";
      mainStatus.classList.remove("recording");
      recBtn.style.display = "block";
      recBtn.innerText = "🎙 録音開始";
      pauseBtn.style.display = "none";
      stopBtn.style.display = "none";
      recordingIndicator.classList.remove("active");
      previewBox.innerHTML = '<div style="color:#ccc;">会話内容がここに表示されます...</div>';
    }
  }

  function restoreScreenState() {
    const s = slots[currentSlotId];
    previewBox.innerHTML = s.textLog ? `<div style="color:#333">${s.textLog}</div>` : '<div style="color:#ccc;">会話内容がここに表示されます...</div>';
    updateScreenState(s.state);
  }

  function updateSlotUI() {
    Object.keys(slots).forEach(id => {
      const el = document.querySelector(`.slot-card[data-id="${id}"]`);
      if (slots[id].state === 'empty') el.classList.remove('has-data'); else el.classList.add('has-data');
    });
  }

  // ■ 話者推定（拡充版）
  function estimateSpeaker(text) {
    const vetKeywords = [
      // 診察・処置
      '診察', '検査', '処方', '薬', '投薬', '注射', '治療', '手術', '麻酔', '鎮静',
      '症状', '診断', '所見', '経過', 'バイタル', '体温', '体重', '聴診', '触診', '視診',
      '血液検査', 'レントゲン', 'エコー', 'CT', 'MRI', '細胞診', '病理', '尿検査', '糞便検査',
      '処置', 'ワクチン', '予防', 'フィラリア', 'ノミ', 'ダニ', '駆虫',
      '不正咬合', '切削', '入院', '退院', '手術', '避妊', '去勢', 'スケーリング', '抜歯',
      'お薬', '内服', '点眼', '点滴', '輸液', '皮下注', '筋注', '静注',
      // 医学用語
      '炎症', '腫瘍', '感染', '免疫', '抗生剤', '抗菌薬', 'ステロイド', '鎮痛',
      '心雑音', '不整脈', '腎臓', '肝臓', '膵臓', '甲状腺', '副腎',
      '紅斑', '丘疹', '膿疱', '脱毛', '痂皮', '浮腫',
      // 獣医師の話し方
      '今日は', 'では', '確認', '様子', '状態', '見てみましょう', '診てみます',
      'させてもらいます', '思います', 'かなと', 'なんですけど',
      '経過観察', '再診', '来週', '2週間後', 'まず', 'それと',
      '大丈夫', '問題ない', '心配ない', '良さそう', '改善',
      // 看護師・受付スタッフ（獣医師側に分類）
      'お預かり', 'お会計', 'お薬お渡し', 'ご案内', 'お待ちください', 'お呼び',
      '受付', '待合', '診察室', '入院室', 'カルテ'
    ];

    const ownerKeywords = [
      // 症状の訴え
      'うちの子', 'この子', '家では', '最近', '昨日', '一昨日', 'おととい', '先週', '先月',
      '食べない', '食べた', '食べなくなった', '元気がない', '元気ない', '吐いた', '吐く', '下痢', '便が', 'うんちが',
      '心配', '大丈夫ですか', 'ご飯', 'おやつ', '散歩', '遊ぶ', '寝てばかり', 'ぐったり',
      '痛がる', '痒がる', '掻く', '舐める', '咳', 'くしゃみ', '震える', 'ふらつく',
      '血が出', '腫れ', 'しこり', 'できもの', '目やに', '涙', '耳が臭い', 'よだれ',
      // 質問・確認
      'いつから', 'どのくらい', 'どうしたら', 'なんで', 'なぜ',
      '気になる', '普段', 'いつも', '突然', '急に', 'だんだん', '徐々に',
      '何日', '何回', 'ずっと', 'ときどき', 'たまに', '毎日',
      // 飼い主の返答パターン
      'はい', 'そうです', 'そうなんです', 'えっと', 'あの', 'ちょっと',
      'わかりました', '了解', 'ありがとう', 'お願いします',
      // 生活環境
      '家の中', '外', '多頭飼い', '他の犬', '他の猫', '子供', '赤ちゃん',
      '引っ越し', 'ペットショップ', 'ブリーダー', '保護',
      'フード', '変えた', '新しい'
    ];

    let vetScore = 0;
    let ownerScore = 0;

    vetKeywords.forEach(kw => { if (text.includes(kw)) vetScore++; });
    ownerKeywords.forEach(kw => { if (text.includes(kw)) ownerScore++; });

    if (text.match(/[？?]$/)) ownerScore += 0.5;
    if (text.match(/(ですね|しましょう|いたします|ございます|させてもらい|見てみ|診てみ)/)) vetScore += 1;
    if (text.match(/(なんですけど|なんですが|んですよね|かなと思)/)) vetScore += 0.5;
    if (text.match(/(そうなんです|そうです|はい|お願いします|わかりました)/)) ownerScore += 0.5;

    if (vetScore > ownerScore) currentSpeaker = "獣医師";
    else if (ownerScore > vetScore) currentSpeaker = "飼い主";

    return currentSpeaker;
  }

  // ■ 会話ログフォーマット（Google Drive保存用）
  function formatConversationLog(conversationLog, title) {
    const d = new Date();
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    const dateStr = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${days[d.getDay()]}）`;
    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

    let log = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 会話ログ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
タイトル: ${title}
日時: ${dateStr} ${timeStr}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

    conversationLog.forEach((entry) => {
      const speakerIcon = entry.speaker === "獣医師" ? "🩺" : "👤";
      log += `[${entry.timestamp}] ${speakerIcon} ${entry.speaker}:\n`;
      log += `    ${entry.text}\n\n`;
    });

    log += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated by Vets SOAP Scribe
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    return log;
  }

  // ■ ご家族向け要約生成
  async function generateFamilySummary() {
    const soapText = document.getElementById("resSoap").value;
    if (!soapText.trim()) { alert("先にカルテを作成してください。"); return; }
    const provider = llmProviderSelect ? llmProviderSelect.value : 'openai';
    if (provider === 'claude') {
      if (!anthropicApiKeyInput.value.trim()) { alert("Anthropic APIキーを設定してください。"); return; }
    } else {
      if (!apiKeyInput.value.trim()) { alert("OpenAI APIキーを設定してください。"); return; }
    }

    familySummaryOverlay.style.display = 'flex';
    familySummaryLoading.style.display = 'block';
    familySummaryContent.style.display = 'none';
    familySummaryActions.style.display = 'none';
    familySummaryBtn.disabled = true;

    const systemPrompt = `あなたは飼い主に病状をわかりやすく説明する獣医師アシスタントです。
以下の診察カルテ（SOAP形式）をもとに、ご家族に手渡せる「診察のご報告」文書を作成してください。

# ルール
- 必ず平易な日本語で書くこと（小学校高学年でも理解できるレベル）
- 専門用語・医学用語はできる限り使わず、日常的な言葉に置き換えること
- どうしても専門用語が必要な場合は、直後に（）で分かりやすい説明を添えること
  例：「僧帽弁閉鎖不全症（心臓の弁がうまく閉じなくなる病気）」
  例：「皮下輸液（皮膚の下に点滴液を注入する処置）」
- 「です・ます」調の丁寧な文体で書くこと
- 不安を煽らず、温かく前向きなトーンで書くこと
- A4一枚に収まる分量（本文は450〜650字程度）にまとめること
- 情報がない見出しは省略してよい

# 出力形式（以下の見出しを使うこと）
## 今日の診察について
（来院のきっかけ・主訴を平易に記述）

## 診察でわかったこと
（身体検査所見・診断を平易に記述）

## 治療・お薬について
（処置・処方内容を平易に記述。薬の飲ませ方・使い方も含める）

## ご自宅でのお願い
（飼い主への注意事項・日常ケア）

## 次回の診察
（再診・予約情報）`;

    try {
      const summaryText = await callLLM(systemPrompt, soapText);

      familySummaryContent.value = summaryText;
      familySummaryLoading.style.display = 'none';
      familySummaryContent.style.display = 'block';
      familySummaryActions.style.display = 'flex';
    } catch (e) {
      alert("要約生成エラー: " + e.message);
      familySummaryOverlay.style.display = 'none';
    } finally {
      familySummaryBtn.disabled = false;
    }
  }

  // ■ ご家族向け要約を印刷プレビューで開く
  function printFamilySummary() {
    const content = familySummaryContent.value;
    if (!content.trim()) return;

    const title = document.getElementById("resTitle").value || "診察報告";
    const today = new Date();
    const dateStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日`;

    // Markdownの見出し・強調をHTMLに変換
    const toHtml = (text) => text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    const htmlContent = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>診察のご報告 - ${title}</title>
  <style>
    @page { size: A4; margin: 22mm 20mm 20mm 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Hiragino Kaku Gothic ProN", "メイリオ", "游ゴシック Medium", sans-serif;
      font-size: 11pt; line-height: 2; color: #222;
    }
    .page-header {
      display: flex; justify-content: space-between; align-items: flex-end;
      border-bottom: 3px solid #2c6e9a; padding-bottom: 8px; margin-bottom: 18px;
    }
    .page-header h1 { font-size: 15pt; color: #2c6e9a; font-weight: bold; }
    .page-header .meta { font-size: 9pt; color: #666; text-align: right; }
    .content p { margin-bottom: 10px; }
    .content h2 {
      font-size: 11pt; color: #2c6e9a;
      border-left: 4px solid #2c6e9a; padding-left: 8px;
      margin: 16px 0 6px; font-weight: bold;
    }
    .content h3 { font-size: 10pt; margin: 10px 0 4px; }
    .page-footer {
      position: fixed; bottom: 12mm; left: 20mm; right: 20mm;
      border-top: 1px solid #ddd; padding-top: 6px;
      font-size: 8pt; color: #aaa; text-align: center;
    }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>🐾 診察のご報告　<span style="font-size:12pt;color:#555;">${title}</span></h1>
    <div class="meta">${dateStr}</div>
  </div>
  <div class="content"><p>${toHtml(content)}</p></div>
  <div class="page-footer">Vets SOAP Scribe にて自動生成 — ご不明な点はスタッフにお気軽にお声がけください</div>
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ■ Google Driveに会話ログを保存
  async function saveConversationLogToDrive(conversationLog, title) {
    const gasUrl = gasUrlInput.value.trim();
    if (!gasUrl) return;

    const formattedLog = formatConversationLog(conversationLog, title);
    const d = new Date();
    const fileName = `会話ログ_${title}_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;

    const payload = {
      type: 'conversation_log',
      fileName: fileName,
      content: formattedLog,
      title: title,
      date: d.toLocaleString()
    };

    try {
      await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      mainStatus.innerText = "✅ 会話ログ保存完了";
    } catch (e) {
      mainStatus.innerText = "⚠️ 会話ログ保存失敗";
    }
  }
});
