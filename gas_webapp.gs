// =====================================================================
//  VET's SOAP Scribe — Google Apps Script Web App
//  対象スプレッドシート: VET's SOAP.APPカルテ自動保存ログ
//  SpreadsheetID: 12EUq1nQ_HyRDa3Q-lZDepPuv8Ogmcxhdia4ZwRcrDBE
//
//  【デプロイ手順】
//  1. 対象のGoogleスプレッドシートを開く
//  2. 拡張機能 > Apps Script を開く
//  3. このファイルの内容を貼り付けて保存
//  4. デプロイ > 新しいデプロイ > 種類：ウェブアプリ
//  5. 実行ユーザー：自分、アクセスできるユーザー：全員
//  6. デプロイ → 表示されたURLをコピー
//  7. Vets SOAP Scribe の設定 > Google Sheets Script URL に貼り付け
// =====================================================================

var SPREADSHEET_ID = '12EUq1nQ_HyRDa3Q-lZDepPuv8Ogmcxhdia4ZwRcrDBE';
var SHEET_NAME     = 'カルテログ';
var HEADERS        = ['日時', 'カルテ番号', '飼い主', '動物名', 'モード', 'SOAP本文', '会話ログ'];

// ── POST: カルテ保存 ──────────────────────────────────────────────────
function doPost(e) {
  try {
    var raw  = (e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var data = JSON.parse(raw);

    var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);

    // シートが存在しなければ作成
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    // ヘッダー行がなければ追加 & スタイル設定
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
      headerRange.setFontWeight('bold')
                 .setBackground('#1a6b9a')
                 .setFontColor('#ffffff');
      sheet.setFrozenRows(1);
      // 列幅調整
      sheet.setColumnWidth(1, 160); // 日時
      sheet.setColumnWidth(2, 90);  // カルテ番号
      sheet.setColumnWidth(3, 110); // 飼い主
      sheet.setColumnWidth(4, 110); // 動物名
      sheet.setColumnWidth(5, 70);  // モード
      sheet.setColumnWidth(6, 420); // SOAP本文
      sheet.setColumnWidth(7, 300); // 会話ログ
    }

    // データ行を追加
    var newRow = [
      data.date       || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss'),
      data.chartNo    || '',
      data.ownerName  || data.patient || '',
      data.animalName || '',
      data.mode === 'interview' ? '受付' : '診察',
      data.soap       || '',
      data.fullText   || ''
    ];
    sheet.appendRow(newRow);

    // 最終行を折り返し設定（SOAP本文・会話ログ）
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 6).setWrap(true);
    sheet.getRange(lastRow, 7).setWrap(true);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', message: '保存しました', row: lastRow }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    console.error('[VSS-GAS] Error:', err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── GET: 疎通確認用 ──────────────────────────────────────────────────
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status:  'ok',
      message: 'VET SOAP Scribe GAS is running',
      sheet:   SHEET_NAME
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
