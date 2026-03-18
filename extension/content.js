// Content script: adds a floating "Read" button when text is selected
(function() {
  let floatingBtn = null;

  function createButton() {
    const btn = document.createElement('div');
    btn.id = 'avr-float-btn';
    btn.innerHTML = '📖 朗讀';
    btn.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 999999;
      background: #3b82f6; color: white;
      padding: 10px 16px; border-radius: 20px;
      font-size: 14px; font-weight: 600;
      cursor: pointer; box-shadow: 0 4px 12px rgba(59,130,246,0.4);
      transition: all 0.2s; display: none;
      font-family: -apple-system, system-ui, sans-serif;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 6px 16px rgba(59,130,246,0.5)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 12px rgba(59,130,246,0.4)';
    });
    btn.addEventListener('click', sendSelectedText);
    document.body.appendChild(btn);
    return btn;
  }

  function sendSelectedText() {
    const text = window.getSelection()?.toString();
    if (!text || text.trim().length < 10) return;

    chrome.storage.local.get('avr-reader-url', (data) => {
      const readerUrl = data['avr-reader-url'];
      if (!readerUrl) {
        alert('請先在擴充套件中設定朗讀器網址');
        return;
      }

      const title = text.slice(0, 30).replace(/\n/g, ' ');
      const addUrl = `${readerUrl}/add?title=${encodeURIComponent(title)}&content=${encodeURIComponent(text)}`;

      if (addUrl.length > 8000) {
        chrome.storage.local.set({
          'avr-pending-article': {
            title,
            content: text,
            sourceUrl: window.location.href,
            timestamp: Date.now(),
          }
        }, () => {
          window.open(`${readerUrl}/add?from=extension`, '_blank');
        });
      } else {
        window.open(addUrl, '_blank');
      }
    });
  }

  // Show button when text is selected
  document.addEventListener('selectionchange', () => {
    if (!floatingBtn) floatingBtn = createButton();
    const text = window.getSelection()?.toString();
    floatingBtn.style.display = (text && text.trim().length > 20) ? 'block' : 'none';
  });
})();
