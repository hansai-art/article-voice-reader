const STORAGE_KEY = 'avr-reader-url';
const DEFAULT_URL = '';

document.addEventListener('DOMContentLoaded', async () => {
  const sendBtn = document.getElementById('sendBtn');
  const selectBtn = document.getElementById('selectBtn');
  const status = document.getElementById('status');
  const preview = document.getElementById('preview');
  const readerUrlInput = document.getElementById('readerUrl');

  // Load saved URL
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  readerUrlInput.value = stored[STORAGE_KEY] || DEFAULT_URL;

  // Save URL on change
  readerUrlInput.addEventListener('change', () => {
    chrome.storage.local.set({ [STORAGE_KEY]: readerUrlInput.value.trim() });
  });

  function getReaderUrl() {
    const url = readerUrlInput.value.trim();
    if (!url) {
      status.textContent = '⚠️ 請先填入朗讀器網址';
      status.className = 'status error';
      return null;
    }
    return url;
  }

  // Send full article
  sendBtn.addEventListener('click', async () => {
    const readerUrl = getReaderUrl();
    if (!readerUrl) return;

    status.textContent = '擷取文章中...';
    status.className = 'status';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractArticle,
      });

      const result = results[0]?.result;
      if (!result || !result.content) {
        status.textContent = '❌ 無法擷取文章內容';
        status.className = 'status error';
        return;
      }

      // Show preview
      preview.textContent = result.content.slice(0, 200) + '...';
      preview.style.display = 'block';

      // Send to reader app
      const addUrl = `${readerUrl}/add?title=${encodeURIComponent(result.title)}&content=${encodeURIComponent(result.content)}`;

      // If URL is too long, use postMessage approach
      if (addUrl.length > 8000) {
        // Store in extension storage, open reader, let it read from storage
        await chrome.storage.local.set({
          'avr-pending-article': {
            title: result.title,
            content: result.content,
            sourceUrl: tab.url,
            timestamp: Date.now(),
          }
        });
        chrome.tabs.create({ url: `${readerUrl}/add?from=extension` });
      } else {
        chrome.tabs.create({ url: addUrl });
      }

      status.textContent = '✅ 已送出！';
      status.className = 'status success';
    } catch (e) {
      status.textContent = `❌ ${e.message}`;
      status.className = 'status error';
    }
  });

  // Send selected text
  selectBtn.addEventListener('click', async () => {
    const readerUrl = getReaderUrl();
    if (!readerUrl) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString() || '',
      });

      const selectedText = results[0]?.result;
      if (!selectedText || selectedText.trim().length < 10) {
        status.textContent = '⚠️ 請先選取要朗讀的文字';
        status.className = 'status error';
        return;
      }

      preview.textContent = selectedText.slice(0, 200) + '...';
      preview.style.display = 'block';

      const title = selectedText.slice(0, 30).replace(/\n/g, ' ');
      const addUrl = `${readerUrl}/add?title=${encodeURIComponent(title)}&content=${encodeURIComponent(selectedText)}`;

      if (addUrl.length > 8000) {
        await chrome.storage.local.set({
          'avr-pending-article': {
            title,
            content: selectedText,
            sourceUrl: tab.url,
            timestamp: Date.now(),
          }
        });
        chrome.tabs.create({ url: `${readerUrl}/add?from=extension` });
      } else {
        chrome.tabs.create({ url: addUrl });
      }

      status.textContent = '✅ 已送出！';
      status.className = 'status success';
    } catch (e) {
      status.textContent = `❌ ${e.message}`;
      status.className = 'status error';
    }
  });
});

// This function runs in the context of the web page
function extractArticle() {
  // Simple readability extraction without external libraries
  const title = document.title;

  // Try to find article content
  const selectors = [
    'article', '[role="main"]', 'main',
    '.post-content', '.article-content', '.entry-content',
    '.content', '#content', '.post-body',
  ];

  let articleEl = null;
  for (const sel of selectors) {
    articleEl = document.querySelector(sel);
    if (articleEl) break;
  }

  if (!articleEl) {
    articleEl = document.body;
  }

  // Extract text from paragraphs
  const paragraphs = articleEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
  const texts = [];

  for (const p of paragraphs) {
    const text = p.textContent?.trim();
    if (text && text.length > 5) {
      texts.push(text);
    }
  }

  const content = texts.join('\n\n');

  return { title, content };
}
