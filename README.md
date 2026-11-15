# ParleLine — Bilingual Call & Chat Language Companion

An adaptive, bilingual conversational companion that lets you speak and chat naturally in your target language, calibrated to your current stage, with live hands-free phone calls, simultaneous subtitles with English translation, and zero unsolicited grammar drills.

---

## Key Features

- **Hands-Free Phone Calls**: Real-time phone call experience with silence pause detection (~1.3s), audio reactive equalizer, and classic phone controls (Mute, Slow Voice, Switch to Chat, End Call).
- **Simultaneous Subtitles & Translation**: Displays the companion's foreign speech in high-contrast text alongside instant English translations and word-by-word user speech transcription.
- **Natural Voice Output**: Powered by Gemini speech synthesis (`gemini-3.8-flash-tts` with voice `Aoede` for French) rather than robotic operating system text-to-speech.
- **Strict Language Workspace Isolation**: French, Swahili, Spanish, and Mandarin memories, stages, and vocabularies remain strictly segregated.
- **Stage-Gated Bilingual Progression**:
  - **Stage 1**: Warm greetings & low-pressure short replies (1–3 words).
  - **Stage 2**: Everyday routines & closed conversational questions (2–4 words).
  - **Stage 3**: Full sentences & opinions.
  - **Stage 4**: Advanced expression & unlocked grammar discussions.
- **Persistent Cloud Database & Mobile Access**:
  - User registration and login with session tokens.
  - Automatic call session logging (duration, studied topics, newly mastered phrases).
  - Phone sync: open on your mobile browser over Wi-Fi (`http://<local-ip>:3000`).

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide Icons, Web Audio API, Web Speech API
- **Backend**: Express.js, TypeScript (`tsx`), Google GenAI SDK (`@google/genai`)
- **AI Models**: Gemini 2.5 Flash / Gemini 3.8 Flash TTS
- **Storage**: JSON-based persistent file database (`data/users.json` and `data/data_<userId>.json`)

---

## Getting Started

### Prerequisites

- Node.js 18+
- Gemini API Key ([Get one free from Google AI Studio](https://aistudio.google.com/))

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/jmgreat-bit/parleline.git
   cd parleline
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Copy `.env.example` to `.env` and insert your Gemini API Key:
   ```bash
   GEMINI_API_KEY="your-gemini-api-key"
   ```

4. Start the application:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deploying

### Option 1: Vercel
Connect this GitHub repository to [Vercel](https://vercel.com) and add the environment variable:
- `GEMINI_API_KEY`: Your Google Gemini API Key

### Option 2: Render / Railway / Docker
Deploy as a Node.js web service running `npm start`.

---

## License

Apache-2.0
