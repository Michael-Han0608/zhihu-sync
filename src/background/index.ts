/**
 * Service Worker：消息中转
 * 1. content script → 打开导出页面
 * 2. Extension Page → content script 代理 API 请求（保持同源）
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'openExportPage') {
    chrome.tabs.create({ url: message.url });
    return;
  }

  if (message.action === 'startZhihuSync' && typeof message.jobId === 'string') {
    const jobId = message.jobId;
    if (/^[a-zA-Z0-9_-]{1,128}$/.test(jobId)) {
      chrome.tabs.create({ url: chrome.runtime.getURL(`src/sync/index.html?job=${encodeURIComponent(jobId)}`) })
        .then(() => sendResponse({ ok: true }))
        .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
    }
    return true;
  }

  // Extension Page 请求代理
  if (message.action === 'proxyFetch') {
    if (message.responseType === 'text') {
      // 文本请求（如获取页面 HTML）：service worker 直接 fetch，不受 CORS 限制
      fetch(message.url, { credentials: 'include' })
        .then((r) => r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err: Error) => sendResponse({ ok: false, error: err.message }));
    } else {
      // JSON API 请求：转发给知乎页面的 content script（需要 x-zse 签名）
      proxyFetchViaContentScript(message.url, message.responseType)
        .then((result) => sendResponse({ ok: true, data: result }))
        .catch((err: Error & { httpStatus?: number }) => sendResponse({ ok: false, error: err.message, status: err.httpStatus }));
    }
    return true; // 保持 sendResponse 通道
  }

  if (message.action === 'getCurrentUserToken') {
    getCurrentUserToken()
      .then((token) => sendResponse({ ok: true, token }))
      .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function getCurrentUserToken(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const tabs = await chrome.tabs.query({ url: ['https://www.zhihu.com/*'] });
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getCurrentUserToken' });
        if (typeof response?.token === 'string' && response.token) return response.token;
      } catch { /* content script 尚未就绪 */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('无法识别当前知乎账号，请使用 zhihu-sync login 重新登录');
}

/**
 * 找到一个知乎标签页，让其 content script 发起请求
 */
async function proxyFetchViaContentScript(url: string, responseType?: string): Promise<unknown> {
  let lastConnectionError = '';
  for (let attempt = 0; attempt < 20; attempt++) {
    const tabs = await chrome.tabs.query({
      url: ['https://www.zhihu.com/*', 'https://zhuanlan.zhihu.com/*'],
    });
    for (const tab of tabs) {
      try {
        return await new Promise((resolve, reject) => {
          if (!tab.id) { reject(new Error('no tab id')); return; }
          chrome.tabs.sendMessage(tab.id, {
            action: 'fetchProxy',
            url,
            responseType,
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (!response) {
              reject(new Error('content script 无响应'));
              return;
            }
            if (response.error) {
              const err = new Error(response.error) as Error & { httpStatus?: number };
              err.httpStatus = response.status;
              reject(err);
              return;
            }
            resolve(response.data);
          });
        });
      } catch (error) {
        const typed = error as Error & { httpStatus?: number };
        if (typed.httpStatus !== undefined || typed.message.includes('页面代理请求超时')) throw typed;
        lastConnectionError = typed.message;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`知乎代理页面在 5 秒内未就绪${lastConnectionError ? `：${lastConnectionError}` : ''}`);
}
