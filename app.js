'use strict';

// ============================================================
//  Vets SOAP Scribe — Web App
//  DB: IndexedDB  /  Settings: localStorage  /  AI: OpenAI
// ============================================================

// ─── DB ─────────────────────────────────────────────────────
var DB = (function () {
  var _db = null;
  var DB_NAME = 'VetSOAPDB';
  var DB_VER  = 2;

  function open() {
    return new Promise(function (res, rej) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('patients')) {
          var ps = d.createObjectStore('patients', { keyPath: 'id' });
          ps.createIndex('ownerName',  'ownerName',  { unique: false });
          ps.createIndex('animalName', 'animalName', { unique: false });
          ps.createIndex('chartNo',    'chartNo',    { unique: false });
        }
        if (!d.objectStoreNames.contains('visits')) {
          var vs = d.createObjectStore('visits', { keyPath: 'id' });
          vs.createIndex('patientId', 'patientId', { unique: false });
          vs.createIndex('date',      'date',      { unique: false });
        }
        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = function (e) { _db = e.target.result; res(_db); };
      req.onerror   = function (e) { rej(e.target.error); };
    });
  }

  function _tx(store, mode) {
    return _db.transaction(store, mode).objectStore(store);
  }
  function _wrap(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror   = function () { rej(req.error); };
    });
  }

  var patients = {
    getAll: function () { return _wrap(_tx('patients').getAll()); },
    get:    function (id)   { return _wrap(_tx('patients').get(id)); },
    add:    function (data) { return _wrap(_tx('patients', 'readwrite').add(data)); },
    put:    function (data) { return _wrap(_tx('patients', 'readwrite').put(data)); },
    del:    function (id)   { return _wrap(_tx('patients', 'readwrite').delete(id)); }
  };

  var visits = {
    getAll:      function ()   { return _wrap(_tx('visits').getAll()); },
    get:         function (id) { return _wrap(_tx('visits').get(id)); },
    add:         function (d)  { return _wrap(_tx('visits', 'readwrite').add(d)); },
    put:         function (d)  { return _wrap(_tx('visits', 'readwrite').put(d)); },
    del:         function (id) { return _wrap(_tx('visits', 'readwrite').delete(id)); },
    byPatient:   function (pid) {
      return _wrap(_tx('visits').index('patientId').getAll(pid));
    }
  };

  var settings = {
    get: function (key) {
      return _wrap(_tx('settings').get(key)).then(function (r) { return r ? r.value : null; });
    },
    put: function (key, value) {
      return _wrap(_tx('settings', 'readwrite').put({ key: key, value: value }));
    }
  };

  function nextChartNo(allPatients) {
    var nums = allPatients
      .map(function (p) { return parseInt((p.chartNo || '').replace(/\D/g, ''), 10); })
      .filter(function (n) { return !isNaN(n); });
    var max = nums.length ? Math.max.apply(null, nums) : 0;
    return 'P-' + String(max + 1).padStart(3, '0');
  }

  return { open: open, patients: patients, visits: visits, settings: settings, nextChartNo: nextChartNo };
})();


// ─── Settings (localStorage) ─────────────────────────────────
var Settings = {
  _k: function (k) { return 'vss_' + k; },
  get: function (k) { return localStorage.getItem(this._k(k)) || ''; },
  set: function (k, v) { localStorage.setItem(this._k(k), v); },
  load: function () {
    document.getElementById('sApiKey').value     = this.get('api_key');
    document.getElementById('sGasUrl').value     = this.get('gas_url');
    document.getElementById('sRefData').value    = this.get('ref_data');
    document.getElementById('sCustomDict').value = this.get('custom_dict');
  },
  save: function () {
    this.set('api_key',     document.getElementById('sApiKey').value.trim());
    this.set('gas_url',     document.getElementById('sGasUrl').value.trim());
    this.set('ref_data',    document.getElementById('sRefData').value.trim());
    this.set('custom_dict', document.getElementById('sCustomDict').value.trim());
  }
};


// ─── State ───────────────────────────────────────────────────
var State = {
  currentPatientId: null,
  currentPatient: null,
  audioSegments: [],   // Blob[]
  mediaStream: null,
  mediaRecorder: null,
  timerInterval: null,
  timerSeconds: 0,
  pendingVisitData: null,  // { soap, fullText } waiting to be saved
  recState: 'idle',        // 'idle' | 'recording' | 'paused'
  // 患者ごとの録音状態を保持
  _recSessions: {},  // { patientId: { audioSegments, mediaStream, timerSeconds, recState } }

  saveRecSession: function () {
    if (!this.currentPatientId) return;
    if (this.recState === 'idle' && !this.audioSegments.length) return;
    this._recSessions[this.currentPatientId] = {
      audioSegments: this.audioSegments,
      mediaStream: this.mediaStream,
      timerSeconds: this.timerSeconds,
      recState: this.recState,
      pendingVisitData: this.pendingVisitData
    };
  },

  restoreRecSession: function (patientId) {
    var s = this._recSessions[patientId];
    if (s) {
      this.audioSegments = s.audioSegments;
      this.mediaStream = s.mediaStream;
      this.timerSeconds = s.timerSeconds;
      this.recState = s.recState;
      this.pendingVisitData = s.pendingVisitData;
      return true;
    }
    return false;
  },

  clearRecSession: function (patientId) {
    delete this._recSessions[patientId || this.currentPatientId];
  },

  resetRec: function () {
    this.audioSegments = [];
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.timerInterval = null;
    this.timerSeconds = 0;
    this.recState = 'idle';
    this.pendingVisitData = null;
  }
};


// ─── SOAP helpers ────────────────────────────────────────────
var SOAP = {
  parseSections: function (text) {
    var s = {};
    var keys = ['S','O','A','P','処置・処方・費用','MEMO'];
    keys.forEach(function (k, i) {
      var start = text.indexOf('[' + k + ']');
      if (start === -1) { s[k] = ''; return; }
      var nextIdx = Infinity;
      keys.slice(i + 1).forEach(function (nk) {
        var ni = text.indexOf('[' + nk + ']');
        if (ni !== -1 && ni < nextIdx) nextIdx = ni;
      });
      s[k] = text.slice(start + k.length + 2, nextIdx === Infinity ? undefined : nextIdx).trim();
    });
    s['処置'] = s['処置・処方・費用'] || '';
    return s;
  },

  clean: function (text) {
    return text
      .replace(/^[・▪]\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  },

  detectSpecialty: function (text) {
    var extra = '';
    if (/痒|かゆ|掻く|舐める|脱毛|湿疹|皮膚|アポキル|外耳炎|アトピー|膿皮|紅斑|丘疹|膿疱/.test(text)) {
      extra += '\n# 皮膚科特化指示\n[O]に皮膚所見（部位・性状・範囲）、痒みスコア(0-10)、スクレーピング所見を記載。[A]に鑑別診断リスト、[P]に外用・内服・薬浴計画を詳細に記載。';
    }
    if (/心雑音|心臓|僧帽弁|不整脈|ピモベンダン|フォルテコール|拡張型|心筋症|聴診/.test(text)) {
      extra += '\n# 循環器特化指示\n[O]に心雑音グレード・最強点・HR・CRT・RR、エコー所見(LA/Ao,LVIDd,FS%)を記載。[A]にACVIMステージを記載。';
    }
    if (/ワクチン|予防接種|狂犬病|混合ワクチン|ロット番号/.test(text)) {
      extra += '\n# 予防接種特化指示\n[P]にワクチン正式名称・メーカー・ロット番号・次回接種日・接種部位・副反応説明を必ず記載。';
    }
    if (/歯石|歯周病|スケーリング|抜歯|不正咬合|歯肉|歯肉炎|口内炎|口腔|口臭/.test(text)) {
      extra += '\n# 歯科特化指示\n[O]に口腔内所見（歯石スコア・歯肉状態・動揺歯・欠歯・口臭）、歯式を記載。[P]にスケーリング/抜歯/投薬計画を記載。';
    }
    return extra;
  },

  checkMissing: function (soapText, mode) {
    var warn = [];
    if (!/・主訴：/.test(soapText)) warn.push('⚠️ [S] 主訴が未記載です');
    if (mode === 'soap') {
      if (!/BW:/.test(soapText)) warn.push('⚠️ [O] 体重(BW)が未記載です');
      if (!/T:/.test(soapText))  warn.push('⚠️ [O] 体温(T)が未記載です');
    }
    return warn;
  },

  formatForCopy: function (soapText, title, dateStr) {
    var plain = (dateStr || '') + ' ' + (title || '') + '\n' +
      soapText
        .replace(/\[S\]/g, '\n━━━━━━━━━━━━━━━━━━━━\n[S]\n')
        .replace(/\[O\]/g, '\n━━━━━━━━━━━━━━━━━━━━\n[O]\n')
        .replace(/\[A\]/g, '\n━━━━━━━━━━━━━━━━━━━━\n[A]\n')
        .replace(/\[P\]/g, '\n━━━━━━━━━━━━━━━━━━━━\n[P]\n')
        .replace(/\[処置・処方・費用\]/g, '\n━━━━━━━━━━━━━━━━━━━━\n[処置]\n')
        .replace(/\[MEMO\]/g, '\n━━━━━━━━━━━━━━━━━━━━\n[MEMO]\n') +
      '\n━━━━━━━━━━━━━━━━━━━━\nGenerated by VSS';
    return plain;
  }
};


// ─── Recording ───────────────────────────────────────────────
var Recording = {
  start: function (stream) {
    State.audioSegments = [];
    State.mediaStream   = stream;
    State.timerSeconds  = 0;
    this._startRecorder(stream);
    this._startTimer();
  },

  _startRecorder: function (stream) {
    var chunks = [];
    var mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mr.ondataavailable = function (e) { if (e.data.size > 0) chunks.push(e.data); };
    mr.onstop = function () {
      var blob = new Blob(chunks, { type: 'audio/webm' });
      State.audioSegments.push(blob);
    };
    mr.start(1000);
    State.mediaRecorder = mr;
  },

  pause: function () {
    if (State.mediaRecorder && State.mediaRecorder.state === 'recording') {
      State.mediaRecorder.stop();
    }
    clearInterval(State.timerInterval);
    State.timerInterval = null;
  },

  resume: function () {
    if (State.mediaStream) {
      this._startRecorder(State.mediaStream);
      this._startTimer();
    }
  },

  stop: function () {
    return new Promise(function (resolve) {
      clearInterval(State.timerInterval);
      State.timerInterval = null;

      function finalize() {
        setTimeout(function () {
          var combined = new Blob(State.audioSegments, { type: 'audio/webm' });
          if (State.mediaStream) {
            State.mediaStream.getTracks().forEach(function (t) { t.stop(); });
          }
          resolve(combined);
        }, 300);
      }

      if (State.mediaRecorder && State.mediaRecorder.state === 'recording') {
        // 元の onstop（チャンクをaudioSegmentsに保存）を先に実行してから finalize
        var origOnStop = State.mediaRecorder.onstop;
        State.mediaRecorder.onstop = function () {
          if (origOnStop) origOnStop();
          finalize();
        };
        State.mediaRecorder.stop();
      } else {
        // 一時停止中 or inactive → セグメントは既に保存済み
        finalize();
      }
    });
  },

  _startTimer: function () {
    var start = Date.now() - (State.timerSeconds * 1000);
    State.timerInterval = setInterval(function () {
      State.timerSeconds = Math.floor((Date.now() - start) / 1000);
      var m = Math.floor(State.timerSeconds / 60);
      var s = State.timerSeconds % 60;
      var el = document.getElementById('recTimer');
      if (el) el.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    }, 500);
  }
};


// ─── AI ──────────────────────────────────────────────────────
var AI = {
  // Step 1: Whisper
  transcribe: async function (audioBlob, apiKey, customDict) {
    var customTerms = customDict
      ? customDict.split(/\n/).filter(function (t) { return t.trim(); }).join('、')
      : '';
    var prompt = '獣医師の診察会話です。'
      + '薬：アポキル、リブレラ、ソレンシア、シンパリカ、ネクスガード、セレニア、プレドニゾロン、ピモベンダン、フォルテコール、フロセミド、アモキシシリン、セファレキシン、ガバペンチン。'
      + '病名：歯肉炎、歯周病、口内炎、膵炎、鼻炎、外耳炎、膀胱炎、気管虚脱、僧帽弁閉鎖不全症、膝蓋骨脱臼、椎間板ヘルニア、慢性腎臓病、アトピー性皮膚炎、肥満細胞腫、糖尿病。'
      + 'ワクチン：コアワクチン、ノンコアワクチン、レプトスピラ、抗体価検査、混合ワクチン、狂犬病。'
      + '処置：スケーリング、歯石除去、抜歯、皮下輸液、細胞診、スクレーピング、フィラリア検査。'
      + 'フード：ロイヤルカナン、ヒルズ、消化器サポート、腎臓サポート。'
      + (customTerms ? '院内：' + customTerms + '。' : '');
    var fd = new FormData();
    fd.append('file', audioBlob, 'audio.webm');
    fd.append('model', 'whisper-1');
    fd.append('language', 'ja');
    fd.append('prompt', prompt.substring(0, 500));
    var res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey },
      body: fd
    });
    var data = await res.json();
    if (data.error) throw new Error('Whisper: ' + (data.error.message || JSON.stringify(data.error)));
    if (!data.text) throw new Error('音声の文字起こしが空でした。録音内容を確認してください。');
    return data.text;
  },

  // Step 2: SOAP generation（テキスト補正も統合）
  generateSOAP: async function (fullText, patient, refData, mode, apiKey) {
    var specialtyExtra = SOAP.detectSpecialty(fullText);
    var patientContext = patient
      ? '【対象患者】' + patient.ownerName + ' 様 / ' + patient.animalName
        + '（' + [patient.species, patient.breed, patient.sex].filter(Boolean).join('・') + '）'
        + (patient.chartNo ? ' カルテ番号：' + patient.chartNo : '') + '\n'
      : '';

    // テキスト補正指示（SOAP生成に統合）
    var correctionRules = '# 音声認識テキストの補正ルール（必ず適用すること）\n'
      + '入力テキストはWhisper音声認識の生出力です。以下を必ず補正してからカルテ化すること。\n'
      + '- フィラー（えー、あのー、えっと等）は無視すること\n'
      + '- 獣医療用語の誤変換を正しい用語に修正して記載すること：\n'
      + '  レッドスピラ/レットスピラ → レプトスピラ\n'
      + '  トレーター/トレイター → ドレーター（経皮吸収型鎮痛貼付剤）\n'
      + '  ときらり屋/トキラリヤ → 文脈に応じた正しい薬剤名に推測変換\n'
      + '  肺炎 → 歯肉炎（歯・口腔の話題の場合）\n'
      + '  鼻炎 → 膵炎（嘔吐・消化器の話題の場合）\n'
      + '  胃石 → 歯石（スケーリング・歯科の話題の場合）\n'
      + '  肺水腫 → 肺水腫のまま（心臓の話題）/ 廃用症候群と混同しない\n'
      + '- 数値（体重・体温・心拍数等）は正確に保持\n'
      + '- 意味不明な固有名詞は音が近い獣医療用語に推測変換すること\n\n';

    var basePrompt;
    if (mode === 'soap') {
      basePrompt = 'あなたは獣医師アシスタントです。音声認識された会話テキストからカルテを作成してください。\n'
        + '出力はJSON形式 { "soap_text": "...", "full_log": "..." } で行ってください。\n'
        + '- full_log: フィラーを除去し用語を正した会話の全文ログ\n\n'
        + correctionRules
        + '# カルテ作成ルール\n'
        + '- テンプレート説明文は出力しない。実際の内容のみ記載。\n'
        + '- 情報がない項目は「・」も含めて一切出力しない。\n'
        + '- [S]の「問診時」は必ず箇条書き（「・」で始まる短い項目）でまとめること。\n'
        + '  ❌ 長文の説明や会話の要約文は禁止。\n'
        + '  ✅ 「・フィラリア検査陰性（前日実施）」のように事実のみ簡潔に。\n'
        + '- [S]1行目は「・主訴：〇〇」の形式で来院理由を端的に1行で書くこと。\n'
        + '- 食欲/元気/排尿/排便/嘔吐は[S]下部の一覧表に集約し重複しないこと。\n\n'
        + patientContext
        + '【院内マスタDB】\n' + (refData || 'データなし') + '\n\n'
        + '# 出力フォーマット（厳守）\n\n'
        + '[S]\n・主訴：〇〇\n問診時\n・（箇条書きで簡潔に事実を列挙）\n\n食欲：　　元気：　　排尿：　　排便：　　嘔吐：\n\n'
        + '[O]\nBW: ○○ kg　　T: ○○℃　　P: ○○ bpm CM /　　R: ○○ bpm\n\n'
        + '[A]\n\n[P]\n\n[処置・処方・費用]\n\n[MEMO]\n受付：　　診察：　　検査：　　調剤：　　会計：　TEL: /　予約確定日: /'
        + specialtyExtra;
    } else {
      basePrompt = 'あなたは獣医師アシスタントです。音声認識された受付での問診・ヒアリング内容を[S]にまとめてください。\n'
        + '出力はJSON形式 { "soap_text": "...", "full_log": "..." } で行ってください。\n'
        + '- full_log: フィラーを除去し用語を正した会話の全文ログ\n\n'
        + correctionRules
        + '# カルテ作成ルール\n'
        + '- [S]1行目は「・主訴：〇〇」の形式で来院理由を書くこと。\n'
        + '- [S]の「問診時」は必ず箇条書き（「・」で始まる短い項目）で簡潔にまとめること。長文禁止。\n'
        + '- [O][A][P][処置・処方・費用]: 見出しのみ出力し中身は完全に空欄。\n'
        + '- 情報がない項目は「・」も含めて一切出力しないこと。\n\n'
        + patientContext
        + '【参照マスタDB】\n' + (refData || 'データなし') + '\n\n'
        + '# 出力フォーマット（厳守）\n\n'
        + '[S]\n・主訴：〇〇\n問診時\n・（箇条書きで簡潔に事実を列挙）\n\n食欲：　　元気：　　排尿：　　排便：　　嘔吐：\n\n'
        + '[O]\n[A]\n[P]\n[処置・処方・費用]\n[MEMO]\n受付：　　TEL: /　予約確定日: /';
    }

    var res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: basePrompt }, { role: 'user', content: fullText }]
      })
    });
    var data = await res.json();
    if (data.error) throw new Error('GPT: ' + (data.error.message || JSON.stringify(data.error)));
    var aiJson = JSON.parse(data.choices[0].message.content);
    return {
      soap_text: SOAP.clean(aiJson.soap_text || aiJson.soap || '生成エラー'),
      full_log:  aiJson.full_log || fullText
    };
  },

  // Family summary
  generateFamilySummary: async function (soapText, apiKey) {
    var sys = 'あなたは飼い主に病状をわかりやすく説明する獣医師アシスタントです。\n'
      + '以下のSOAPカルテをもとに、ご家族に手渡せる「診察のご報告」文書を作成してください。\n\n'
      + '# ルール\n'
      + '- 小学校高学年でも理解できる平易な日本語で書くこと\n'
      + '- 専門用語は使わず日常語に置き換えること\n'
      + '- どうしても専門用語が必要な場合は直後に（）で解説を添えること\n'
      + '  例：「僧帽弁閉鎖不全症（心臓の弁がうまく閉じなくなる病気）」\n'
      + '  例：「皮下輸液（皮膚の下に点滴液を注入する処置）」\n'
      + '- 「です・ます」調の丁寧な文体\n'
      + '- 不安を煽らず、温かく前向きなトーン\n'
      + '- A4一枚に収まる分量（450〜650字）\n'
      + '- 情報がない見出しは省略してよい\n\n'
      + '# 出力形式\n'
      + '## 今日の診察について\n（来院のきっかけ・主訴を平易に）\n\n'
      + '## 診察でわかったこと\n（所見・診断を平易に）\n\n'
      + '## 治療・お薬について\n（処置・処方を平易に。薬の飲ませ方も含める）\n\n'
      + '## ご自宅でのお願い\n（注意事項・日常ケア）\n\n'
      + '## 次回の診察\n（再診・予約情報）';

    var res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: soapText }]
      })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.choices[0].message.content.trim();
  }
};


// ─── UI helpers ──────────────────────────────────────────────
var UI = {
  toast: function (msg, type) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = type || 'info';
    el.style.display = 'block';
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(function () { el.style.display = 'none'; }, 3000);
  },

  showView: function (viewId) {
    ['viewWelcome', 'viewPatient'].forEach(function (id) {
      var el = document.getElementById(id);
      el.classList.toggle('active', id === viewId);
    });
  },

  showModal: function (which) {
    var overlay = document.getElementById('modalOverlay');
    overlay.classList.add('active');
    ['patientFormModal', 'settingsModal', 'familySummaryModal', 'csvMappingModal'].forEach(function (id) {
      document.getElementById(id).style.display = id === which ? 'block' : 'none';
    });
  },

  hideModal: function () {
    document.getElementById('modalOverlay').classList.remove('active');
  },

  setProcessing: function (msg) {
    var el = document.getElementById('processingStatus');
    if (msg) {
      el.textContent = '⚙️ ' + msg;
      el.classList.add('active');
    } else {
      el.classList.remove('active');
      el.textContent = '';
    }
  },

  setRecordingState: function (state) {
    var startBtn   = document.getElementById('recStartBtn');
    var pauseBtn   = document.getElementById('recPauseBtn');
    var resumeBtn  = document.getElementById('recResumeBtn');
    var stopBtn    = document.getElementById('recStopBtn');
    var recStatus  = document.getElementById('recordingStatus');
    var pausedSt   = document.getElementById('recPausedStatus');

    startBtn.style.display  = state === 'idle'    ? 'block'  : 'none';
    pauseBtn.style.display  = state === 'recording' ? 'block' : 'none';
    resumeBtn.style.display = state === 'paused'  ? 'block'  : 'none';
    stopBtn.style.display   = state !== 'idle'    ? 'block'  : 'none';
    recStatus.classList.toggle('active', state === 'recording');
    pausedSt.classList.toggle('active',  state === 'paused');
    if (state === 'idle') document.getElementById('recTimer').textContent = '00:00';
  },

  renderPatientList: async function () {
    var all  = await DB.patients.getAll();
    var q    = (document.getElementById('searchInput').value || '').trim().toLowerCase();
    var list = q ? all.filter(function (p) {
      return (p.chartNo    || '').toLowerCase().includes(q) ||
             (p.ownerName  || '').toLowerCase().includes(q) ||
             (p.animalName || '').toLowerCase().includes(q) ||
             (p.breed      || '').toLowerCase().includes(q) ||
             (p.species    || '').toLowerCase().includes(q);
    }) : all;
    list.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });

    var el = document.getElementById('patientList');
    if (!list.length) {
      el.innerHTML = '<div class="no-patients">' + (q ? '該当患者なし' : '患者を登録してください') + '</div>';
      return;
    }
    el.innerHTML = list.map(function (p) {
      var active = p.id === State.currentPatientId ? ' active' : '';
      var chartLabel = p.chartNo ? p.chartNo : '';
      return '<div class="patient-item' + active + '" data-id="' + p.id + '">'
        + '<div class="pt-chart-line">' + chartLabel + '</div>'
        + '<div class="pt-name">' + (p.ownerName || '') + '　<b>' + (p.animalName || '') + '</b></div>'
        + '</div>';
    }).join('');
  },

  renderPatientView: async function (patientId) {
    var p = await DB.patients.get(patientId);
    if (!p) return;

    // 現在の患者の録音状態を保存（別の患者に切り替える前に）
    if (State.currentPatientId && State.currentPatientId !== patientId) {
      // 録音中なら一時停止してから保存
      if (State.recState === 'recording') {
        Recording.pause();
        State.recState = 'paused';
      }
      State.saveRecSession();
    }

    State.currentPatientId = patientId;
    State.currentPatient   = p;

    // まずビューを切り替え
    UI.showView('viewPatient');

    // Header
    var chartLabel = p.chartNo ? 'カルテNo.' + p.chartNo : '';
    document.getElementById('ptHeaderName').textContent = (p.ownerName || '') + '　' + (p.animalName || '');
    var details = [chartLabel, p.species, p.breed, p.sex,
      p.birthDate ? (new Date()).getFullYear() - new Date(p.birthDate).getFullYear() + '歳' : '',
      p.weight ? p.weight + 'kg' : ''
    ].filter(Boolean);
    document.getElementById('ptHeaderDetails').innerHTML =
      details.map(function (d) { return '<span>' + d + '</span>'; }).join('');

    // 録音状態を復元 or リセット
    if (State.restoreRecSession(patientId)) {
      // 保存済みセッションがある → 復元した状態でUI表示
      UI.setRecordingState(State.recState);
      if (State.recState === 'paused') {
        // タイマー表示を復元
        var m = Math.floor(State.timerSeconds / 60);
        var s = State.timerSeconds % 60;
        document.getElementById('recTimer').textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
      }
      // 保留中のSOAP結果があれば表示
      if (State.pendingVisitData) {
        document.getElementById('resSoap').value = State.pendingVisitData.soap;
        document.getElementById('resFull').value = State.pendingVisitData.fullText;
        document.getElementById('soapResult').style.display = 'block';
      } else {
        document.getElementById('soapResult').style.display = 'none';
      }
    } else {
      // 新規 → リセット
      State.resetRec();
      UI.setRecordingState('idle');
      document.getElementById('soapResult').style.display = 'none';
      document.getElementById('saveVisitBtn').textContent = '💾 カルテに保存';
      document.getElementById('saveVisitBtn').disabled = false;
    }
    UI.setProcessing(null);

    // Visit history
    try {
      var visits = await DB.visits.byPatient(patientId);
      visits.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      var vl = document.getElementById('visitList');
      if (!visits.length) {
        vl.innerHTML = '<div class="no-visits">診察履歴はまだありません</div>';
      } else {
        vl.innerHTML = visits.map(function (v) { return UI._visitCardHtml(v); }).join('');
      }
    } catch (e) {
      console.warn('[VSS] 診察履歴の読み込みエラー:', e);
      document.getElementById('visitList').innerHTML = '<div class="no-visits">診察履歴はまだありません</div>';
    }

    UI.renderPatientList();
  },

  _visitCardHtml: function (v) {
    var d   = new Date(v.date || v.createdAt);
    var days = ['日','月','火','水','木','金','土'];
    var dateStr = d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日（' + days[d.getDay()] + '）';
    var modeBadge = v.mode === 'interview'
      ? '<span class="visit-mode-badge interview">🗣 受付</span>'
      : '<span class="visit-mode-badge soap">🩺 診察</span>';
    var preview = (v.soap || '').split('\n').find(function (l) { return /・主訴：/.test(l); }) || (v.soap || '').split('\n')[0] || '';
    preview = preview.replace(/・主訴：/, '').trim();
    return '<div class="visit-card" data-visit-id="' + v.id + '">'
      + '<div class="visit-card-header">'
      + '<span class="visit-date">' + dateStr + '</span>'
      + modeBadge
      + '<span class="visit-preview">' + preview + '</span>'
      + '<span class="visit-toggle">▼</span>'
      + '</div>'
      + '<div class="visit-card-body">'
      + '<div class="section-copy-btns" data-visit-id="' + v.id + '">'
      + ['S','O','A','P','処置','MEMO'].map(function (s) {
        return '<button class="section-copy-btn" data-section="' + s + '">' + s + '</button>';
      }).join('')
      + '</div>'
      + '<label class="result-label">カルテ (SOAP)</label>'
      + '<textarea class="visit-soap-text">' + (v.soap || '') + '</textarea>'
      + '<label class="result-label mt-8">会話ログ</label>'
      + '<textarea class="visit-full-text" readonly>' + (v.fullText || '') + '</textarea>'
      + '<div class="visit-actions">'
      + '<button class="btn-sm btn-secondary visit-family-btn" data-visit-id="' + v.id + '">📄 ご家族向け要約</button>'
      + (v.familySummary ? '<button class="btn-sm btn-secondary visit-show-summary-btn" data-visit-id="' + v.id + '">📋 保存済み要約</button>' : '')
      + '<button class="btn-sm btn-danger visit-delete-btn" data-visit-id="' + v.id + '">🗑️ 削除</button>'
      + '</div>'
      + '</div>'
      + '</div>';
  },

  prependVisitCard: function (visit) {
    var vl = document.getElementById('visitList');
    var noVisits = vl.querySelector('.no-visits');
    if (noVisits) noVisits.remove();
    vl.insertAdjacentHTML('afterbegin', UI._visitCardHtml(visit));
    vl.querySelector('.visit-card').classList.add('expanded');
  }
};


// ─── Family summary ──────────────────────────────────────────
var FamilySummary = {
  _currentVisitId: null,
  _currentSoapText: null,

  open: async function (soapText, visitId) {
    this._currentVisitId = visitId || null;
    this._currentSoapText = soapText;
    document.getElementById('familySummaryContent').style.display = 'none';
    document.getElementById('familySummaryContent').value = '';
    document.getElementById('familySummaryLoading').style.display = 'block';
    document.getElementById('familySummaryActions').style.display = 'none';
    UI.showModal('familySummaryModal');

    var apiKey = Settings.get('api_key');
    if (!apiKey) { UI.toast('APIキーを設定してください', 'error'); UI.hideModal(); return; }

    try {
      var text = await AI.generateFamilySummary(soapText, apiKey);
      document.getElementById('familySummaryContent').value = text;
      document.getElementById('familySummaryLoading').style.display = 'none';
      document.getElementById('familySummaryContent').style.display = 'block';
      document.getElementById('familySummaryActions').style.display = 'flex';

      // Auto-save to visit record
      if (visitId) {
        var v = await DB.visits.get(visitId);
        if (v) { v.familySummary = text; await DB.visits.put(v); }
      }
    } catch (e) {
      UI.toast('エラー: ' + e.message, 'error');
      UI.hideModal();
    }
  },

  print: function () {
    var content = document.getElementById('familySummaryContent').value;
    if (!content) return;
    var patient = State.currentPatient;
    var title = patient ? patient.ownerName + '　' + patient.animalName : '患者名';
    var today  = new Date();
    var dateStr = today.getFullYear() + '年' + (today.getMonth()+1) + '月' + today.getDate() + '日';

    var toHtml = function (text) {
      return text
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/^## (.+)$/gm,'<h2>$1</h2>')
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
        .replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');
    };

    var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">'
      + '<title>診察のご報告</title><style>'
      + '@page{size:A4;margin:22mm 20mm 20mm 20mm}'
      + '*{margin:0;padding:0;box-sizing:border-box}'
      + 'body{font-family:"Hiragino Kaku Gothic ProN","メイリオ",sans-serif;font-size:11pt;line-height:2;color:#222}'
      + '.hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1a6b9a;padding-bottom:8px;margin-bottom:16px}'
      + '.hdr h1{font-size:15pt;color:#1a6b9a}'
      + '.hdr .d{font-size:9pt;color:#666}'
      + '.body p{margin-bottom:10px}'
      + '.body h2{font-size:11pt;color:#1a6b9a;border-left:4px solid #1a6b9a;padding-left:8px;margin:14px 0 5px;font-weight:bold}'
      + '.ftr{position:fixed;bottom:12mm;left:20mm;right:20mm;border-top:1px solid #eee;padding-top:6px;font-size:8pt;color:#aaa;text-align:center}'
      + '</style></head><body>'
      + '<div class="hdr"><h1>🐾 診察のご報告　' + title + '</h1><div class="d">' + dateStr + '</div></div>'
      + '<div class="body"><p>' + toHtml(content) + '</p></div>'
      + '<div class="ftr">Vets SOAP Scribe にて自動生成 — ご不明な点はスタッフにお声がけください</div>'
      + '<script>window.onload=function(){window.print()}<\/script>'
      + '</body></html>';

    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
};


// ─── Main recording flow ──────────────────────────────────────
async function runProcessWithAI(audioBlob) {
  var apiKey  = Settings.get('api_key');
  var refData = Settings.get('ref_data');
  var mode    = document.getElementById('modeSelect').value;
  var patient = State.currentPatient;

  if (!apiKey) { UI.toast('設定からAPIキーを入力してください', 'error'); return; }

  try {
    UI.setProcessing('Whisperで音声を文字起こし中...');
    var rawText = await AI.transcribe(audioBlob, apiKey, Settings.get('custom_dict'));

    UI.setProcessing('SOAPカルテを生成中...');
    var result = await AI.generateSOAP(rawText, patient, refData, mode, apiKey);

    UI.setProcessing(null);

    // Show result（保存ボタンをリセット）
    document.getElementById('resSoap').value = result.soap_text;
    document.getElementById('resFull').value = result.full_log;
    document.getElementById('soapResult').style.display = 'block';
    document.getElementById('saveVisitBtn').textContent = '💾 カルテに保存';
    document.getElementById('saveVisitBtn').disabled = false;

    var warnings = SOAP.checkMissing(result.soap_text, mode);
    var warnEl = document.getElementById('missingWarning');
    if (warnings.length) { warnEl.innerHTML = warnings.join('<br>'); warnEl.style.display = 'block'; }
    else { warnEl.style.display = 'none'; }

    // Save to state for later DB save
    State.pendingVisitData = { soap: result.soap_text, fullText: result.full_log, mode: mode };

    // Auto-save if patient is selected
    if (patient) await saveCurrentVisit();

    // Cloud sync — Google Sheets 自動保存
    var gasUrl = Settings.get('gas_url');
    if (gasUrl) {
      var pt = patient || {};
      fetch(gasUrl, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date:       new Date().toLocaleString('ja-JP'),
          chartNo:    pt.chartNo    || '',
          ownerName:  pt.ownerName  || '',
          animalName: pt.animalName || '',
          mode:       mode,
          soap:       result.soap_text,
          fullText:   result.full_log
        })
      }).catch(function (err) {
        console.warn('[VSS] GAS送信エラー:', err);
      });
    }

  } catch (e) {
    UI.setProcessing(null);
    UI.toast('エラー: ' + e.message, 'error');
    console.error('[VSS]', e);
  }
}

async function saveCurrentVisit() {
  if (!State.pendingVisitData || !State.currentPatientId) return;
  var visit = {
    id:        crypto.randomUUID(),
    patientId: State.currentPatientId,
    date:      new Date().toISOString(),
    soap:      State.pendingVisitData.soap,
    fullText:  State.pendingVisitData.fullText,
    mode:      State.pendingVisitData.mode,
    familySummary: '',
    createdAt: new Date().toISOString()
  };
  await DB.visits.add(visit);

  // Update patient updatedAt
  var p = await DB.patients.get(State.currentPatientId);
  if (p) { p.updatedAt = new Date().toISOString(); await DB.patients.put(p); }

  UI.prependVisitCard(visit);
  UI.toast('カルテに保存しました ✅', 'success');
  State.pendingVisitData = null;
  // 保存後も結果を表示し続ける（コピー・確認できるように）
  var saveBtn = document.getElementById('saveVisitBtn');
  saveBtn.textContent = '✅ 保存済み';
  saveBtn.disabled = true;
  UI.renderPatientList();
}


// ─── CSV Sync ─────────────────────────────────────────────────
var CSVSync = {
  _fileHandle: null,
  _headers: [],
  _rows: [],
  _mapping: null,
  _autoTimer: null,
  _interval: 120,

  loadConfig: async function () {
    try {
      var handle   = await DB.settings.get('csvFileHandle');
      var mapping  = await DB.settings.get('csvMapping');
      var interval = await DB.settings.get('csvInterval');
      if (handle)   this._fileHandle = handle;
      if (mapping)  this._mapping = mapping;
      if (interval != null) this._interval = interval;
      if (this._fileHandle && this._mapping) {
        this.updateStatus('設定済み — 同期待機中');
        this.startAutoSync();
      }
    } catch (e) { /* ignore on first launch */ }
  },

  handleDroppedFile: async function (file) {
    try {
      var text = await this._readFileText(file);
      var parsed = this._parseCSV(text);
      this._headers = parsed.headers;
      this._rows    = parsed.rows;
      this._fileHandle = null;

      if (!this._rows.length) { UI.toast('CSVが空です', 'error'); return; }

      // 自動検出を試みる
      var autoMap = this._detectColumns(this._headers);

      // 飼い主名 or 動物名が検出できた → 即インポート（マッピングモーダルをスキップ）
      if (autoMap.ownerName >= 0 || autoMap.animalName >= 0) {
        this._mapping = autoMap;
        await DB.settings.put('csvMapping', autoMap);
        var result = await this.upsertPatients();
        var msg = file.name + ' — 追加:' + result.added + '件　更新:' + result.updated + '件';
        this.updateStatus('✅ ' + msg);
        UI.toast('CSV読み込み完了 — 追加:' + result.added + '件 更新:' + result.updated + '件', 'success');
        await UI.renderPatientList();
        // ドロップゾーンを読み込み済み表示に
        var dropZone = document.getElementById('csvDropZone');
        if (dropZone) {
          dropZone.classList.add('loaded');
          dropZone.innerHTML = '<span class="drop-icon">✅</span>'
            + file.name
            + '<div class="csv-patient-count">' + this._rows.length + '件の患者データ読み込み済み</div>';
        }
        // 検索フィールドにフォーカス
        var searchEl = document.getElementById('searchInput');
        if (searchEl) { searchEl.focus(); searchEl.placeholder = '🔍 カルテ番号 / 飼い主名 / 動物名 で検索'; }
      } else {
        // 自動検出できない場合はマッピングモーダルを表示
        this.showMappingModal();
        var fileInfo = document.getElementById('csvFileInfo');
        if (fileInfo) fileInfo.textContent = '📄 ' + file.name + '　（' + this._rows.length + '行 / ' + this._headers.length + '列）';
      }
    } catch (e) {
      UI.toast('CSV読み込みエラー: ' + e.message, 'error');
    }
  },

  pickFile: async function () {
    if (!window.showOpenFilePicker) {
      UI.toast('このブラウザはFile System Access APIに対応していません。Chromeをお使いください。', 'error');
      return;
    }
    try {
      var handles = await window.showOpenFilePicker({
        types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'], 'text/plain': ['.csv'] } }],
        multiple: false
      });
      this._fileHandle = handles[0];
      await DB.settings.put('csvFileHandle', this._fileHandle);
      var ok = await this.readAndParse();
      if (ok) this.showMappingModal();
    } catch (e) {
      if (e.name !== 'AbortError') UI.toast('ファイル選択エラー: ' + e.message, 'error');
    }
  },

  readAndParse: async function () {
    if (!this._fileHandle) return false;
    try {
      var file = await this._fileHandle.getFile();
      var text = await this._readFileText(file);
      var parsed = this._parseCSV(text);
      this._headers = parsed.headers;
      this._rows    = parsed.rows;
      return true;
    } catch (e) {
      this.updateStatus('⚠️ ファイル読み込みエラー');
      console.warn('[CSVSync] readAndParse error:', e);
      return false;
    }
  },

  _readFileText: function (file) {
    return new Promise(function (resolve, reject) {
      // Try Shift_JIS first (common in Japanese vet software)
      var r1 = new FileReader();
      r1.onload = function (e) {
        var text = e.target.result;
        // Heuristic: if Shift_JIS decode produced replacement chars, retry as UTF-8
        if (text.indexOf('\uFFFD') !== -1) {
          var r2 = new FileReader();
          r2.onload = function (e2) { resolve(e2.target.result); };
          r2.onerror = function () { reject(new Error('ファイル読み込み失敗')); };
          r2.readAsText(file, 'UTF-8');
        } else {
          resolve(text);
        }
      };
      r1.onerror = function () { reject(new Error('ファイル読み込み失敗')); };
      r1.readAsText(file, 'Shift_JIS');
    });
  },

  _parseCSV: function (text) {
    var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
      .filter(function (l) { return l.trim(); });
    if (!lines.length) return { headers: [], rows: [] };

    var parseRow = function (line) {
      var result = [];
      var current = '';
      var inQuotes = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else { inQuotes = !inQuotes; }
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim()); current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };

    var headers = parseRow(lines[0]);
    var rows    = lines.slice(1).map(parseRow);
    return { headers: headers, rows: rows };
  },

  _detectColumns: function (headers) {
    // ハロペ・各社電カル対応パターン
    var patterns = {
      chartNo:    /^karte_number$|カルテ番号|カルテNo|患者番号|患者No|診察券/i,
      ownerName:  /^owner_name$|飼い主名|飼主名|飼い主|飼主|オーナー名/i,
      animalName: /^pet_name$|動物名|患者名|ペット名/i,
      species:    /^species$|種別|種類|動物種|犬猫/i,
      breed:      /^breed$|品種|犬種|猫種/i,
      sex:        /^sex$|^gender$|性別/i,
      birthDate:  /^birth|生年月日|誕生日/i,
      weight:     /^weight$|体重/i,
      // ハロペ固有: カルテ番号生成用
      ownerNumber: /^owner_number$|飼主番号|顧客番号|オーナー番号/i
    };
    var mapping = {};
    Object.keys(patterns).forEach(function (key) {
      var idx = -1;
      for (var i = 0; i < headers.length; i++) {
        if (patterns[key].test(headers[i])) { idx = i; break; }
      }
      mapping[key] = idx;
    });
    return mapping;
  },

  showMappingModal: function () {
    if (!this._headers.length) { UI.toast('CSVが空です', 'error'); return; }

    var autoMap = this._detectColumns(this._headers);
    var fname   = this._fileHandle ? this._fileHandle.name : '';
    var fileInfo = document.getElementById('csvFileInfo');
    if (fileInfo) fileInfo.textContent = '📄 ' + fname + '　（' + this._rows.length + '行 / ' + this._headers.length + '列）';

    var optHtml = '<option value="-1">（使用しない）</option>'
      + this._headers.map(function (h, i) {
        return '<option value="' + i + '">' + h + '</option>';
      }).join('');

    var fields = ['chartNo','ownerName','animalName','species','breed','sex','birthDate','weight'];
    fields.forEach(function (f) {
      var sel = document.getElementById('map-' + f);
      if (!sel) return;
      sel.innerHTML = optHtml;
      sel.value = autoMap[f] >= 0 ? String(autoMap[f]) : '-1';
    });

    this._renderPreview();

    var intervalSel = document.getElementById('csvIntervalSelect');
    if (intervalSel) intervalSel.value = String(this._interval);

    UI.showModal('csvMappingModal');
  },

  _renderPreview: function () {
    var headers = this._headers;
    var rows    = this._rows.slice(0, 5);
    var html = '<thead><tr>'
      + headers.map(function (h) { return '<th>' + h + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr>' + headers.map(function (_, i) {
          return '<td>' + (r[i] || '') + '</td>';
        }).join('') + '</tr>';
      }).join('')
      + '</tbody>';
    var tbl = document.getElementById('csvPreviewTable');
    if (tbl) tbl.innerHTML = html;
  },

  importWithMapping: async function () {
    var fields = ['chartNo','ownerName','animalName','species','breed','sex','birthDate','weight'];
    var mapping = {};
    fields.forEach(function (f) {
      var sel = document.getElementById('map-' + f);
      mapping[f] = sel ? parseInt(sel.value, 10) : -1;
    });
    // ownerNumber は自動検出から引き継ぐ（マッピングモーダルに表示しない）
    var autoMap = this._detectColumns(this._headers);
    if (autoMap.ownerNumber >= 0) mapping.ownerNumber = autoMap.ownerNumber;
    var interval = parseInt((document.getElementById('csvIntervalSelect') || {}).value, 10) || 0;

    this._mapping  = mapping;
    this._interval = interval;
    await DB.settings.put('csvMapping', mapping);
    await DB.settings.put('csvInterval', interval);

    var result = await this.upsertPatients();
    UI.hideModal();

    var msg = '追加:' + result.added + '件　更新:' + result.updated + '件';
    this.updateStatus('✅ ' + msg);
    UI.toast('CSV読み込み完了 — ' + msg, 'success');
    await UI.renderPatientList();

    // 検索フィールドにフォーカス
    var searchEl = document.getElementById('searchInput');
    if (searchEl) { searchEl.focus(); searchEl.placeholder = '🔍 カルテ番号 / 飼い主名 / 動物名 で検索'; }

    this.startAutoSync();
  },

  upsertPatients: async function () {
    if (!this._rows.length || !this._mapping) return { added: 0, updated: 0 };
    var m   = this._mapping;
    var all = await DB.patients.getAll();
    var added = 0, updated = 0;

    for (var i = 0; i < this._rows.length; i++) {
      var row       = this._rows[i];
      var chartNo   = m.chartNo    >= 0 ? (row[m.chartNo]    || '').trim() : '';
      var ownerName = m.ownerName  >= 0 ? (row[m.ownerName]  || '').trim() : '';
      var animalName = m.animalName >= 0 ? (row[m.animalName] || '').trim() : '';
      // 飼い主名・動物名の両方が空、または「新患」「初診」「テスト」「サポート」行はスキップ
      if (!ownerName && !animalName) continue;
      if (/^(初診|新患|テスト|aniwa)/i.test(ownerName)) continue;

      // カルテ番号を XXXXX-XX 形式に正規化（0埋め）
      if (chartNo) {
        var parts = chartNo.match(/^(\d+)-(\d+)$/);
        if (parts) {
          chartNo = parts[1].padStart(5, '0') + '-' + parts[2].padStart(2, '0');
        }
      }

      // ハロペ: karte_numberが空の場合、owner_number から生成を試みる
      if (!chartNo && m.ownerNumber >= 0) {
        var ownerNum = (row[m.ownerNumber] || '').trim();
        if (ownerNum) {
          var sameOwnerCount = 0;
          for (var j = 0; j < i; j++) {
            var prevOwnerNum = (this._rows[j][m.ownerNumber] || '').trim();
            if (prevOwnerNum === ownerNum) sameOwnerCount++;
          }
          chartNo = ownerNum.padStart(5, '0') + '-' + String(sameOwnerCount + 1).padStart(2, '0');
        }
      }

      // Find existing patient by chartNo, then by name pair
      var existing = null;
      if (chartNo) {
        existing = all.find(function (p) { return p.chartNo === chartNo; }) || null;
      }
      if (!existing && ownerName && animalName) {
        existing = all.find(function (p) {
          return p.ownerName === ownerName && p.animalName === animalName;
        }) || null;
      }

      var sex       = m.sex       >= 0 ? this._normalizeSex(row[m.sex]           || '') : '';
      var species   = m.species   >= 0 ? this._normalizeSpecies(row[m.species]   || '') : '';
      var birthDate = m.birthDate >= 0 ? this._normalizeBirthDate(row[m.birthDate] || '') : '';
      var weight    = m.weight    >= 0 ? (parseFloat(row[m.weight]) || 0) : 0;
      var breed     = m.breed     >= 0 ? (row[m.breed] || '').trim() : '';
      var now       = new Date().toISOString();

      if (existing) {
        var changed = false;
        var upd = function (field, val) { if (val && existing[field] !== val) { existing[field] = val; changed = true; } };
        upd('chartNo', chartNo); upd('ownerName', ownerName); upd('animalName', animalName);
        upd('species', species); upd('breed', breed); upd('sex', sex);
        upd('birthDate', birthDate);
        if (weight && existing.weight !== weight) { existing.weight = weight; changed = true; }
        if (changed) { existing.updatedAt = now; await DB.patients.put(existing); updated++; }
      } else {
        var np = {
          id: crypto.randomUUID(),
          chartNo:   chartNo || DB.nextChartNo(all),
          ownerName: ownerName, animalName: animalName,
          species: species, breed: breed, sex: sex,
          birthDate: birthDate, weight: weight,
          notes: '', createdAt: now, updatedAt: now
        };
        await DB.patients.add(np);
        all.push(np);
        added++;
      }
    }
    return { added: added, updated: updated };
  },

  sync: async function () {
    if (!this._fileHandle || !this._mapping) return;
    var ok = await this.readAndParse();
    if (!ok) return;
    var result = await this.upsertPatients();
    var now     = new Date();
    var timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    this.updateStatus(timeStr + ' 同期済 追加:' + result.added + ' 更新:' + result.updated);
    if (result.added > 0 || result.updated > 0) {
      await UI.renderPatientList();
      UI.toast('CSV自動同期: 追加' + result.added + '件・更新' + result.updated + '件', 'info');
    }
  },

  startAutoSync: function () {
    this.stopAutoSync();
    if (this._interval > 0) {
      var self = this;
      this._autoTimer = setInterval(function () { self.sync(); }, this._interval * 1000);
    }
  },

  stopAutoSync: function () {
    if (this._autoTimer) { clearInterval(this._autoTimer); this._autoTimer = null; }
  },

  updateStatus: function (msg) {
    var el = document.getElementById('csvSyncStatus');
    if (el) el.textContent = msg;
  },

  _normalizeSex: function (s) {
    s = s.trim();
    if (/去勢/.test(s)) return '雄（去勢済）';
    if (/不妊|避妊/.test(s)) return '雌（避妊済）';
    if (/^[MmＭｍ]$|^male$|^雄$|^オス$/i.test(s) || /^[MmＭｍ男]/.test(s)) return '雄';
    if (/^[FfＦｆ]$|^female$|^雌$|^メス$/i.test(s) || /^[FfＦｆ女]/.test(s)) return '雌';
    return s;
  },

  _normalizeSpecies: function (s) {
    s = s.trim();
    if (/犬|dog|ドッグ/i.test(s)) return '犬';
    if (/猫|cat|ネコ|ねこ/i.test(s)) return '猫';
    if (/うさぎ|ウサギ|rabbit/i.test(s)) return 'うさぎ';
    if (/鳥|バード|bird|インコ|オウム/i.test(s)) return '鳥';
    return s;
  },

  _normalizeBirthDate: function (s) {
    s = s.trim();
    var m;
    m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m) return m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0');
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
    if (m) return m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0');
    return s;
  }
};


// ─── Events ──────────────────────────────────────────────────
function bindEvents() {

  // Settings
  document.getElementById('settingsBtn').addEventListener('click', function () {
    Settings.load();
    UI.showModal('settingsModal');
  });
  document.getElementById('saveSettingsBtn').addEventListener('click', function () {
    Settings.save();
    UI.hideModal();
    UI.toast('設定を保存しました', 'success');
  });

  // 診療項目CSV ドラッグ＆ドロップ
  (function () {
    var refDropZone    = document.getElementById('refDataDropZone');
    var refFileInput   = document.getElementById('refDataFileInput');
    var refDataTextarea = document.getElementById('sRefData');
    if (!refDropZone || !refFileInput || !refDataTextarea) return;

    function loadRefDataCSV(file) {
      CSVSync._readFileText(file).then(function (text) {
        var cleaned = text.replace(/^\uFEFF/, '');
        var lines = cleaned.split(/\r?\n/).filter(function (l) { return l.trim(); });
        if (!lines.length) { UI.toast('CSVが空です', 'error'); return; }
        var hasHeader = lines[0] && !/^\d/.test(lines[0].trim());
        var dataLines = hasHeader ? lines.slice(1) : lines;
        var formatted = dataLines.map(function (l) { return l.trim(); }).filter(Boolean).join('\n');
        if (refDataTextarea.value.trim()) {
          refDataTextarea.value = refDataTextarea.value.trim() + '\n' + formatted;
        } else {
          refDataTextarea.value = formatted;
        }
        Settings.save();
        UI.toast(file.name + ' — ' + dataLines.length + '件の診療項目を読み込みました', 'success');
        refDropZone.classList.add('loaded');
        refDropZone.innerHTML = '<span class="drop-icon">✅</span>' + file.name + '（' + dataLines.length + '件）';
      }).catch(function (e) {
        UI.toast('CSV読み込みエラー: ' + e.message, 'error');
      });
    }

    refDropZone.addEventListener('dragover', function (e) { e.preventDefault(); refDropZone.classList.add('dragover'); });
    refDropZone.addEventListener('dragleave', function (e) { e.preventDefault(); refDropZone.classList.remove('dragover'); });
    refDropZone.addEventListener('drop', function (e) {
      e.preventDefault(); refDropZone.classList.remove('dragover');
      var files = e.dataTransfer.files;
      if (files.length && /\.csv$/i.test(files[0].name)) { loadRefDataCSV(files[0]); }
      else { UI.toast('CSVファイルをドロップしてください', 'error'); }
    });
    refDropZone.addEventListener('click', function () { refFileInput.click(); });
    refFileInput.addEventListener('change', function (e) {
      if (e.target.files[0]) loadRefDataCSV(e.target.files[0]);
      refFileInput.value = '';
    });
  })();

  // New patient
  document.getElementById('newPatientBtn').addEventListener('click', async function () {
    var all = await DB.patients.getAll();
    document.getElementById('fChartNo').value     = DB.nextChartNo(all);
    document.getElementById('fOwnerName').value   = '';
    document.getElementById('fAnimalName').value  = '';
    document.getElementById('fBreed').value       = '';
    document.getElementById('fSpecies').value     = '犬';
    document.getElementById('fSex').value         = '';
    document.getElementById('fBirthDate').value   = '';
    document.getElementById('fWeight').value      = '';
    document.getElementById('fNotes').value       = '';
    document.getElementById('patientFormTitle').textContent = '新規患者登録';
    document.getElementById('savePatientBtn').dataset.editId = '';
    UI.showModal('patientFormModal');
  });

  // Edit patient
  document.getElementById('editPatientBtn').addEventListener('click', async function () {
    var p = State.currentPatient;
    if (!p) return;
    document.getElementById('fChartNo').value     = p.chartNo    || '';
    document.getElementById('fOwnerName').value   = p.ownerName  || '';
    document.getElementById('fAnimalName').value  = p.animalName || '';
    document.getElementById('fBreed').value       = p.breed      || '';
    document.getElementById('fSpecies').value     = p.species    || '犬';
    document.getElementById('fSex').value         = p.sex        || '';
    document.getElementById('fBirthDate').value   = p.birthDate  || '';
    document.getElementById('fWeight').value      = p.weight     || '';
    document.getElementById('fNotes').value       = p.notes      || '';
    document.getElementById('patientFormTitle').textContent = '患者情報編集';
    document.getElementById('savePatientBtn').dataset.editId = p.id;
    UI.showModal('patientFormModal');
  });

  // Save patient
  document.getElementById('savePatientBtn').addEventListener('click', async function () {
    var owner  = document.getElementById('fOwnerName').value.trim();
    var animal = document.getElementById('fAnimalName').value.trim();
    if (!owner || !animal) { UI.toast('飼い主名と動物名は必須です', 'error'); return; }

    var editId = this.dataset.editId;
    var now    = new Date().toISOString();
    if (editId) {
      var existing = await DB.patients.get(editId);
      Object.assign(existing, {
        chartNo: document.getElementById('fChartNo').value.trim(),
        ownerName: owner, animalName: animal,
        species: document.getElementById('fSpecies').value,
        breed:   document.getElementById('fBreed').value.trim(),
        sex:     document.getElementById('fSex').value,
        birthDate: document.getElementById('fBirthDate').value,
        weight: parseFloat(document.getElementById('fWeight').value) || 0,
        notes: document.getElementById('fNotes').value.trim(),
        updatedAt: now
      });
      await DB.patients.put(existing);
      UI.toast('患者情報を更新しました', 'success');
      UI.hideModal();
      await UI.renderPatientView(editId);
    } else {
      var patient = {
        id: crypto.randomUUID(),
        chartNo:   document.getElementById('fChartNo').value.trim(),
        ownerName: owner, animalName: animal,
        species:   document.getElementById('fSpecies').value,
        breed:     document.getElementById('fBreed').value.trim(),
        sex:       document.getElementById('fSex').value,
        birthDate: document.getElementById('fBirthDate').value,
        weight:    parseFloat(document.getElementById('fWeight').value) || 0,
        notes:     document.getElementById('fNotes').value.trim(),
        createdAt: now, updatedAt: now
      };
      await DB.patients.add(patient);
      UI.toast('患者を登録しました', 'success');
      UI.hideModal();
      await UI.renderPatientView(patient.id);
    }
    await UI.renderPatientList();
  });

  // Modal close buttons
  document.querySelectorAll('[data-close]').forEach(function (btn) {
    btn.addEventListener('click', UI.hideModal);
  });
  document.getElementById('modalOverlay').addEventListener('click', function (e) {
    if (e.target === this) UI.hideModal();
  });

  // Patient list click (delegated)
  document.getElementById('patientList').addEventListener('click', function (e) {
    var item = e.target.closest('.patient-item');
    if (item) UI.renderPatientView(item.dataset.id);
  });

  // Search
  var searchTimeout;
  document.getElementById('searchInput').addEventListener('input', function () {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(UI.renderPatientList, 250);
  });

  // Recording
  document.getElementById('recStartBtn').addEventListener('click', async function () {
    if (!Settings.get('api_key')) { UI.toast('設定からAPIキーを入力してください', 'error'); return; }
    // 一時停止中の再開
    if (State.recState === 'paused' && State.mediaStream) {
      Recording.resume();
      State.recState = 'recording';
      UI.setRecordingState('recording');
      return;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      Recording.start(stream);
      State.recState = 'recording';
      UI.setRecordingState('recording');
    } catch (e) {
      UI.toast('マイクのアクセスが拒否されました: ' + e.message, 'error');
    }
  });

  document.getElementById('recPauseBtn').addEventListener('click', function () {
    Recording.pause();
    State.recState = 'paused';
    UI.setRecordingState('paused');
  });

  document.getElementById('recResumeBtn').addEventListener('click', function () {
    Recording.resume();
    State.recState = 'recording';
    UI.setRecordingState('recording');
  });

  document.getElementById('recStopBtn').addEventListener('click', async function () {
    State.recState = 'idle';
    UI.setRecordingState('idle');
    var blob = await Recording.stop();
    State.clearRecSession();
    console.log('[VSS] 録音停止: blob.size=' + blob.size + ', segments=' + State.audioSegments.length);
    if (blob.size < 100) {
      UI.toast('録音データがありません。もう一度お試しください。', 'error');
      return;
    }
    await runProcessWithAI(blob);
  });

  // Section copy (new visit result)
  document.getElementById('soapResult').addEventListener('click', function (e) {
    var btn = e.target.closest('.section-copy-btn');
    if (!btn) return;
    var sections = SOAP.parseSections(document.getElementById('resSoap').value);
    var content  = sections[btn.dataset.section] || '';
    if (!content.trim()) return;
    navigator.clipboard.writeText(content.trim()).then(function () {
      btn.classList.add('copied');
      var orig = btn.textContent;
      btn.textContent = '✅';
      setTimeout(function () { btn.classList.remove('copied'); btn.textContent = orig; }, 1500);
    });
  });

  // Copy all (Stock)
  document.getElementById('copyStockBtn').addEventListener('click', async function () {
    var soap   = document.getElementById('resSoap').value;
    var patient = State.currentPatient;
    var d = new Date();
    var days = ['日','月','火','水','木','金','土'];
    var dateStr = d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '（' + days[d.getDay()] + '）';
    var plain = SOAP.formatForCopy(soap, patient ? patient.ownerName + '　' + patient.animalName : '', dateStr);
    try {
      await navigator.clipboard.writeText(plain);
      UI.toast('コピーしました', 'success');
    } catch (e) { UI.toast('コピー失敗', 'error'); }
  });

  // Save visit
  document.getElementById('saveVisitBtn').addEventListener('click', saveCurrentVisit);

  // Family summary (new result)
  document.getElementById('familySummaryNewBtn').addEventListener('click', function () {
    var soap = document.getElementById('resSoap').value;
    if (!soap.trim()) return;
    FamilySummary.open(soap, null);
  });

  // Visit card events (delegated to visitList)
  document.getElementById('visitList').addEventListener('click', async function (e) {
    // Toggle expand
    var header = e.target.closest('.visit-card-header');
    if (header) {
      header.closest('.visit-card').classList.toggle('expanded');
      return;
    }
    // Section copy (in history)
    var copyBtn = e.target.closest('.section-copy-btn');
    if (copyBtn) {
      var body  = copyBtn.closest('.visit-card-body');
      var soap  = body.querySelector('.visit-soap-text').value;
      var sections = SOAP.parseSections(soap);
      var content  = sections[copyBtn.dataset.section] || '';
      if (!content.trim()) return;
      navigator.clipboard.writeText(content.trim()).then(function () {
        copyBtn.classList.add('copied');
        var orig = copyBtn.textContent;
        copyBtn.textContent = '✅';
        setTimeout(function () { copyBtn.classList.remove('copied'); copyBtn.textContent = orig; }, 1500);
      });
      return;
    }
    // Family summary
    var familyBtn = e.target.closest('.visit-family-btn');
    if (familyBtn) {
      var vid  = familyBtn.dataset.visitId;
      var v    = await DB.visits.get(vid);
      if (v) FamilySummary.open(v.soap, vid);
      return;
    }
    // Show saved summary
    var showBtn = e.target.closest('.visit-show-summary-btn');
    if (showBtn) {
      var vid  = showBtn.dataset.visitId;
      var v    = await DB.visits.get(vid);
      if (v && v.familySummary) {
        document.getElementById('familySummaryContent').value = v.familySummary;
        document.getElementById('familySummaryLoading').style.display = 'none';
        document.getElementById('familySummaryContent').style.display = 'block';
        document.getElementById('familySummaryActions').style.display = 'flex';
        UI.showModal('familySummaryModal');
      }
      return;
    }
    // Delete
    var delBtn = e.target.closest('.visit-delete-btn');
    if (delBtn) {
      if (!confirm('この診察記録を削除しますか？')) return;
      var vid = delBtn.dataset.visitId;
      await DB.visits.del(vid);
      delBtn.closest('.visit-card').remove();
      if (!document.querySelector('.visit-card')) {
        document.getElementById('visitList').innerHTML = '<div class="no-visits">診察履歴はまだありません</div>';
      }
      UI.toast('削除しました', 'info');
    }
  });

  // Family summary modal actions
  document.getElementById('printFamilySummaryBtn').addEventListener('click', function () { FamilySummary.print(); });
  document.getElementById('copyFamilySummaryBtn').addEventListener('click', async function () {
    var text = document.getElementById('familySummaryContent').value;
    await navigator.clipboard.writeText(text);
    UI.toast('コピーしました', 'success');
  });

  // CSV drag & drop (患者CSV)
  (function () {
    var csvDropZone = document.getElementById('csvDropZone');
    var csvFileInputHidden = document.getElementById('csvFileInputHidden');
    if (!csvDropZone || !csvFileInputHidden) return;

    csvDropZone.addEventListener('dragover', function (e) { e.preventDefault(); csvDropZone.classList.add('dragover'); });
    csvDropZone.addEventListener('dragleave', function (e) { e.preventDefault(); csvDropZone.classList.remove('dragover'); });
    csvDropZone.addEventListener('drop', function (e) {
      e.preventDefault(); csvDropZone.classList.remove('dragover');
      var files = e.dataTransfer.files;
      if (files.length && /\.csv$/i.test(files[0].name)) { CSVSync.handleDroppedFile(files[0]); }
      else { UI.toast('CSVファイルをドロップしてください', 'error'); }
    });
    csvDropZone.addEventListener('click', function () { csvFileInputHidden.click(); });
    csvFileInputHidden.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (file) CSVSync.handleDroppedFile(file);
      csvFileInputHidden.value = '';
    });
  })();

  // CSV import / sync
  document.getElementById('csvPickBtn').addEventListener('click', function () {
    CSVSync.pickFile();
  });
  document.getElementById('csvRefreshBtn').addEventListener('click', async function () {
    if (!CSVSync._fileHandle) { UI.toast('まずCSVファイルを選択してください', 'error'); return; }
    if (!CSVSync._mapping) {
      var ok = await CSVSync.readAndParse();
      if (ok) CSVSync.showMappingModal();
    } else {
      CSVSync.updateStatus('同期中…');
      await CSVSync.sync();
    }
  });
  document.getElementById('csvDoImportBtn').addEventListener('click', function () {
    CSVSync.importWithMapping();
  });
  // csvMapping close buttons handled by generic [data-close] listener above

  // CSV export
  document.getElementById('exportCsvBtn').addEventListener('click', async function () {
    var patients = await DB.patients.getAll();
    var visits   = await DB.visits.getAll();
    var ptMap    = {};
    patients.forEach(function (p) { ptMap[p.id] = p; });
    var c = function (t) { return '"' + (t||'').replace(/"/g,'""') + '"'; };
    var csv = '\uFEFF日時,カルテ番号,飼い主,動物名,モード,SOAP,会話ログ\n';
    visits.sort(function (a,b) { return (b.date||'').localeCompare(a.date||''); });
    visits.forEach(function (v) {
      var p = ptMap[v.patientId] || {};
      csv += [c(v.date), c(p.chartNo), c(p.ownerName), c(p.animalName), c(v.mode), c(v.soap), c(v.fullText)].join(',') + '\n';
    });
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    var a = document.createElement('a');
    a.href = url; a.download = 'vss_' + new Date().toISOString().slice(0,10) + '.csv'; a.click();
    URL.revokeObjectURL(url);
  });
}


// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
  if (location.protocol === 'file:') {
    document.querySelector('#viewWelcome p:last-child').style.background = '#fff3cd';
    document.querySelector('#viewWelcome p:last-child').style.padding = '10px';
    document.querySelector('#viewWelcome p:last-child').style.borderRadius = '6px';
  }

  try {
    await DB.open();
    Settings.load();
    try { bindEvents(); } catch (e) { console.error('[VSS] bindEventsエラー:', e); }
    await UI.renderPatientList();
    UI.showView('viewWelcome');
    try { await CSVSync.loadConfig(); } catch (e) { console.error('[VSS] CSVSync初期化エラー:', e); }
    console.log('[VSS] 起動完了');
  } catch (e) {
    console.error('[VSS] 起動エラー:', e);
    alert('初期化エラー: ' + e.message);
  }
});
