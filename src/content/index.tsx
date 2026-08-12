import React from 'react';
import { createRoot } from 'react-dom/client';
import { setupFetchBridge } from './detector';
import { PanelHost } from './components/PanelHost';
import { FloatingButton } from './components/FloatingButton';
import { ContentApp } from './components/ContentApp';

const syncJobId = new URL(window.location.href).searchParams.get('zhihu_sync_job');
if (syncJobId && /^[a-zA-Z0-9_-]{1,128}$/.test(syncJobId)) {
  const marker = `zhihu-sync-started-${syncJobId}`;
  if (!sessionStorage.getItem(marker)) {
    void (async () => {
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          const response = await chrome.runtime.sendMessage({ action: 'startZhihuSync', jobId: syncJobId });
          if (response?.ok) {
            sessionStorage.setItem(marker, '1');
            return;
          }
        } catch { /* 扩展后台冷启动时短暂不可用 */ }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    })();
  }
}

// Initialize fetch bridge (must happen before any API calls)
setupFetchBridge();

// Create host element
const host = document.createElement('div');
host.id = 'zhihu-downloader-root';
document.body.appendChild(host);

createRoot(host).render(
  <PanelHost>
    <FloatingButton />
    <ContentApp />
  </PanelHost>
);
