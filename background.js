// 拡張機能アイコンをクリックしたときに別ウィンドウで開く
chrome.action.onClicked.addListener(() => {
  chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 520,
    height: 700
  });
});
