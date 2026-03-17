

# Article Voice Reader — Implementation Plan

## Overview
A mobile-first PWA that lets users paste text or upload files (TXT/PDF/DOCX/MD) and listen to them via the browser's Web Speech API. Core value: simple, fast, resumable.

## Pages & Navigation

### 1. Home — Article List
- App title with bilingual header
- "Add Article" button (prominent, top)
- List of saved articles showing: title, word count, progress %, last read time
- Swipe or button to delete articles
- "Resume Reading" banner if there's a last-played article

### 2. Add Article
- File upload dropzone (TXT, PDF, DOCX, MD) with dashed border per design brief
- "Or" divider
- Large textarea for pasting content
- Preview with word count + estimated read time after input
- "Start Reading" button
- File parsing: pdfjs-dist for PDF, mammoth for DOCX, raw read for TXT/MD

### 3. Player / Reading View
- **Header:** Back button + truncated article title
- **Body:** Scrollable article content with paragraphs; active paragraph highlighted with amber left-border and tinted background, auto-scrolled to center viewport
- **Fixed Bottom Dock:**
  - Progress bar (draggable, full-width)
  - Time display (elapsed / total)
  - Transport controls: Skip Back (prev paragraph) | Play/Pause (large) | Skip Forward (next paragraph)
  - Speed selector (0.5x–2.0x)
  - Voice selector (filtered for Chinese voices by default)

## Core Engine

### TTS Architecture
- Abstract TTS interface for future extensibility
- Web Speech API implementation: split text by paragraphs (`\n\n`), then by sentences
- Read one sentence at a time via `SpeechSynthesisUtterance`, auto-chain to next
- Handle `voiceschanged` event for async voice loading

### Persistence (localStorage)
- Save per article: content, title, paragraph index, sentence offset, speed, voice, last played timestamp
- Auto-save on every paragraph change and on pause/close
- On app open: detect last session, show "Resume Reading" prompt

## i18n
- Simple key-value translation system (zh-TW default, English toggle)
- Language preference stored in localStorage
- Settings toggle accessible from home page header

## Design System Updates
- Update CSS variables per design brief: `--primary: 221 83% 53%`, `--accent: 35 92% 50%`, light/dark mode values
- Add Geist Sans (UI) and Newsreader (prose) fonts
- Matte Ceramic surfaces, 48px min touch targets, 24px mobile margins
- Active paragraph highlight with Framer Motion `layoutId` animation
- Button press effect (scale 0.96)
- The Dock: solid background, top border, soft upward shadow

## PWA Setup
- Add `manifest.json` with app name, icons, theme color
- Register service worker for basic offline caching

## Edge Cases
- Sentence-level chunking to avoid SpeechSynthesis long-text cutoff
- Screen-off warning toast
- 10MB file size warning for PDFs
- "No voices available" fallback message
- Graceful handling of unsupported file types

