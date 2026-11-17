/**
 * Laya App 商店截图生成器 - 可选 Google Apps Script (Code.gs) Gemini API 代理
 * 作用：若正式上线后希望隐藏前端 API Key 或绕过部分网络环境对 Google API 的浏览器跨域限制，
 *       可将本文件部署为「网页应用程式 (Web App)」，并将生成的 /exec 地址填入前端「高级 API 设置」。
 */

const DEFAULT_GEMINI_KEY = '';

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ status: 'ok', service: 'Laya Gemini Copywriting Proxy' })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '{}';
    const body = JSON.parse(raw);

    const scriptKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    const apiKey = String(body.apiKey || scriptKey || DEFAULT_GEMINI_KEY).trim();
    const payload = body.payload || {};

    const encKey = encodeURIComponent(apiKey);
    const vertexUrls = [
      'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent?key=' + encKey,
      'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.0-flash:generateContent?key=' + encKey
    ];
    const studioUrls = [
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encKey,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encKey
    ];

    const urls = apiKey.indexOf('AQ.') === 0
      ? vertexUrls.concat(studioUrls)
      : studioUrls.concat(vertexUrls);

    let lastRespText = '';
    for (var i = 0; i < urls.length; i++) {
      var res = UrlFetchApp.fetch(urls[i], {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      lastRespText = res.getContentText();
      if (code >= 200 && code < 300) {
        return ContentService.createTextOutput(lastRespText).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(
      lastRespText || JSON.stringify({ error: { message: 'All Gemini endpoints returned non-200' } })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: { message: String(err && err.message ? err.message : err) } })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
