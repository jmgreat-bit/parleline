import React, { useState, useRef, useEffect } from 'react';
import {
  Phone,
  PhoneOff,
  Send,
  Mic,
  Square,
  Volume2,
  VolumeX,
  HelpCircle,
  PauseCircle,
  Plus,
  Terminal,
  X,
  ArrowRight,
  BookOpen,
  Sparkles,
  ChevronDown,
  Languages,
  Clock,
  CheckCircle2,
  Trash2,
  Radio,
  User,
  Smartphone,
} from 'lucide-react';
import {
  ChatMessage,
  GrammarSideNote,
  LanguageWorkspace,
  StageNumber,
  UserMemoryState,
  CallRecord,
  UserProfile,
} from './types';
import {
  INITIAL_MEMORY_STATE,
  INITIAL_MESSAGES_BY_WORKSPACE,
  STAGE_DEFINITIONS,
} from './prompts';
import { CallModal } from './components/CallModal';
import { PromptMemoryInspector } from './components/PromptMemoryInspector';
import { AuthModal } from './components/AuthModal';

const STORAGE_MEMORY_KEY = 'parleline_memory_v5';
const STORAGE_MESSAGES_KEY = 'parleline_messages_v5';

const AVAILABLE_NEW_LANGUAGES = [
  {
    id: 'portuguese',
    name: 'Portuguese',
    flag: '🇧🇷',
    code: 'pt-BR',
    companion_name: 'Lucas',
    companion_role: 'Bossa Nova Guitarist',
    city_line: 'São Paulo',
    dial_code: '+55 11 3082',
    greeting: 'Oi! Tudo bem?',
  },
  {
    id: 'japanese',
    name: 'Japanese',
    flag: '🇯🇵',
    code: 'ja-JP',
    companion_name: 'Haru',
    companion_role: 'Industrial Designer',
    city_line: 'Tokyo',
    dial_code: '+81 3 5431',
    greeting: 'こんにちは (Konnichiwa)!',
  },
  {
    id: 'german',
    name: 'German',
    flag: '🇩🇪',
    code: 'de-DE',
    companion_name: 'Klara',
    companion_role: 'Sound Engineer',
    city_line: 'Berlin',
    dial_code: '+49 30 6120',
    greeting: 'Hallo! Wie geht’s?',
  },
  {
    id: 'italian',
    name: 'Italian',
    flag: '🇮🇹',
    code: 'it-IT',
    companion_name: 'Lorenzo',
    companion_role: 'Restorer & Barista',
    city_line: 'Bologna',
    dial_code: '+39 051 239',
    greeting: 'Ciao! Come stai?',
  },
  {
    id: 'yoruba',
    name: 'Yoruba',
    flag: '🇳🇬',
    code: 'yo-NG',
    companion_name: 'Tunde',
    companion_role: 'Creative Director',
    city_line: 'Lagos',
    dial_code: '+234 1 271',
    greeting: 'Báwo ni!',
  },
  {
    id: 'arabic',
    name: 'Arabic',
    flag: '🇯🇴',
    code: 'ar-SA',
    companion_name: 'Nour',
    companion_role: 'Archivist',
    city_line: 'Amman',
    dial_code: '+962 6 461',
    greeting: 'مرحبا (Marhaban)!',
  },
];

const LANGUAGE_FLAGS: Record<string, string> = {
  french: '🇫🇷',
  swahili: '🇹🇿',
  spanish: '🇪🇸',
  mandarin: '🇨🇳',
  portuguese: '🇧🇷',
  japanese: '🇯🇵',
  german: '🇩🇪',
  italian: '🇮🇹',
  yoruba: '🇳🇬',
  arabic: '🇯🇴',
};

export default function App() {
  const [memoryState, setMemoryState] = useState<UserMemoryState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_MEMORY_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_MEMORY_STATE;
  });

  const [messagesByWorkspace, setMessagesByWorkspace] = useState<
    Record<string, ChatMessage[]>
  >(() => {
    try {
      const saved = localStorage.getItem(STORAGE_MESSAGES_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_MESSAGES_BY_WORKSPACE;
  });

  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Cloud Account & Call History
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [callLogs, setCallLogs] = useState<CallRecord[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Active Voice Note Recording State
  const [isRecordingVoiceNote, setIsRecordingVoiceNote] = useState(false);
  const [voiceNoteSeconds, setVoiceNoteSeconds] = useState(0);
  const [voiceNoteBars, setVoiceNoteBars] = useState<number[]>(Array.from({ length: 18 }, () => 14));
  const [liveVoiceNoteTranscript, setLiveVoiceNoteTranscript] = useState<string>('');
  const [isTranscribingNote, setIsTranscribingNote] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceNoteTimerRef = useRef<any>(null);
  const voiceNoteAudioCtxRef = useRef<AudioContext | null>(null);
  const voiceNoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceNoteAnimRef = useRef<number | null>(null);
  const voiceNoteRecogRef = useRef<any>(null);
  const voiceNoteStreamRef = useRef<MediaStream | null>(null);

  // TTS audio playback & cache
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());

  // Revealed translations map
  const [revealedGlossIds, setRevealedGlossIds] = useState<Record<string, boolean>>({});

  // "Why?" On-Demand Grammar Side Sheet
  const [selectedWhyMessageId, setSelectedWhyMessageId] = useState<string | null>(null);
  const [isLoadingWhy, setIsLoadingWhy] = useState(false);
  const [customWhyQuestion, setCustomWhyQuestion] = useState('');

  // Modals
  const [showPromptInspector, setShowPromptInspector] = useState(false);
  const [showStageRoadmap, setShowStageRoadmap] = useState(false);
  const [showAddLanguageModal, setShowAddLanguageModal] = useState(false);

  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  const activeWorkspaceId = memoryState.active_workspace;
  const activeWorkspace =
    memoryState.workspaces[activeWorkspaceId] ||
    Object.values(memoryState.workspaces)[0];
  const activeMessages = messagesByWorkspace[activeWorkspace.id] || [];
  const currentStageDef = STAGE_DEFINITIONS[activeWorkspace.current_stage];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MEMORY_KEY, JSON.stringify(memoryState));
    } catch {
      // ignore
    }
  }, [memoryState]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messagesByWorkspace));
    } catch {
      // ignore
    }
  }, [messagesByWorkspace]);

  useEffect(() => {
    const token = localStorage.getItem('parleline_auth_token');
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.user) {
            setCurrentUser(data.user);
            if (data.callLogs) setCallLogs(data.callLogs);
            if (data.memoryState) setMemoryState(data.memoryState);
            if (data.messagesByWorkspace) setMessagesByWorkspace(data.messagesByWorkspace);
          }
        })
        .catch(() => {});
    }
  }, []);

  const syncStateToServer = async (
    customMem?: UserMemoryState,
    customMsgs?: Record<string, ChatMessage[]>
  ) => {
    const token = localStorage.getItem('parleline_auth_token');
    if (!token) return;
    try {
      await fetch('/api/user/state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          memoryState: customMem || memoryState,
          messagesByWorkspace: customMsgs || messagesByWorkspace,
        }),
      });
    } catch {
      // offline fallback
    }
  };

  const handleLoginSuccess = (user: UserProfile, token: string, data: any) => {
    setCurrentUser(user);
    if (data?.callLogs) setCallLogs(data.callLogs);
    if (data?.memoryState) setMemoryState(data.memoryState);
    if (data?.messagesByWorkspace) setMessagesByWorkspace(data.messagesByWorkspace);
    showToast(`Welcome back, ${user.name}! Cloud database connected.`);
  };

  const handleLogout = () => {
    localStorage.removeItem('parleline_auth_token');
    setCurrentUser(null);
    showToast('Signed out of cloud account.');
  };

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, activeWorkspaceId]);

  const showToast = (msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const updateActiveWorkspace = (updates: Partial<LanguageWorkspace>) => {
    setMemoryState((prev) => ({
      ...prev,
      workspaces: {
        ...prev.workspaces,
        [activeWorkspace.id]: {
          ...prev.workspaces[activeWorkspace.id],
          ...updates,
          updated_at: new Date().toISOString(),
        },
      },
    }));
  };

  const handleSwitchWorkspace = (workspaceId: string) => {
    if (isCallModalOpen) {
      setIsCallModalOpen(false);
    }
    if (isRecordingVoiceNote) {
      handleCancelVoiceNote();
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPlayingMessageId(null);
    setSelectedWhyMessageId(null);
    setMemoryState((prev) => ({
      ...prev,
      active_workspace: workspaceId,
    }));
  };

  const formatNowTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const toggleGloss = (id: string) => {
    setRevealedGlossIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAppendCallTurn = (turn: {
    role: 'user' | 'assistant';
    content: string;
    englishGloss?: string;
    suggestedReplies?: string[];
    updatedStage?: StageNumber;
    newlyMasteredPhrases?: string[];
  }) => {
    const nextStage = turn.updatedStage || activeWorkspace.current_stage;
    const newPhrases = Array.isArray(turn.newlyMasteredPhrases) ? turn.newlyMasteredPhrases : [];

    if (turn.updatedStage || newPhrases.length > 0) {
      const mergedPhrases = Array.from(
        new Set([...activeWorkspace.mastered_phrases, ...newPhrases])
      );
      updateActiveWorkspace({
        current_stage: nextStage,
        grammar_unlocked: nextStage === 4 ? true : activeWorkspace.grammar_unlocked,
        mastered_phrases: mergedPhrases,
      });

      if (turn.updatedStage && turn.updatedStage !== activeWorkspace.current_stage) {
        showToast(
          `${activeWorkspace.companion_name} moved you to Stage ${turn.updatedStage}: ${STAGE_DEFINITIONS[turn.updatedStage].shortLabel}`
        );
      }
    }

    const msg: ChatMessage = {
      id: `${activeWorkspace.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      workspaceId: activeWorkspace.id,
      role: turn.role,
      content: turn.content,
      englishGloss: turn.englishGloss,
      suggestedReplies: turn.suggestedReplies,
      timestamp: formatNowTime(),
      mode: 'call',
      stageAtTurn: nextStage,
      detectedPhrases: newPhrases.length > 0 ? newPhrases : undefined,
    };

    setMessagesByWorkspace((prev) => ({
      ...prev,
      [activeWorkspace.id]: [...(prev[activeWorkspace.id] || []), msg],
    }));
  };

  const handleCloseCallAndRecordSession = async (
    durationSeconds?: number,
    summary?: string,
    phrases?: string[]
  ) => {
    setIsCallModalOpen(false);

    if (durationSeconds && durationSeconds > 1) {
      const durFormatted =
        durationSeconds >= 60
          ? `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`
          : `${durationSeconds}s`;

      const callSummary =
        summary ||
        `Spoke with ${activeWorkspace.companion_name} for ${durFormatted}. Practiced everyday conversation in ${activeWorkspace.target_language}.`;

      // 1. Post to backend persistent database
      try {
        const token = localStorage.getItem('parleline_auth_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/calls/log', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            workspaceId: activeWorkspace.id,
            companionName: activeWorkspace.companion_name,
            durationSeconds,
            stageAtCall: activeWorkspace.current_stage,
            summary: callSummary,
            phrasesMastered: phrases || [],
          }),
        });
        const data = await res.json();
        if (res.ok && data.callLogs) {
          setCallLogs(data.callLogs);
        }
      } catch {
        // guest mode local record
        const guestRec: CallRecord = {
          id: `call_${Date.now()}`,
          userId: currentUser?.id || 'guest',
          workspaceId: activeWorkspace.id,
          companionName: activeWorkspace.companion_name,
          durationSeconds,
          timestamp: new Date().toISOString(),
          stageAtCall: activeWorkspace.current_stage,
          summary: callSummary,
          phrasesMastered: phrases || [],
        };
        setCallLogs((prev) => [guestRec, ...prev]);
      }

      // 2. Append visual Call Record in chat thread
      const callRecordMsg: ChatMessage = {
        id: `${activeWorkspace.id}-call-ended-${Date.now()}`,
        workspaceId: activeWorkspace.id,
        role: 'assistant',
        content: `📞 Phone Call Ended (${durFormatted})`,
        englishGloss: callSummary,
        timestamp: formatNowTime(),
        mode: 'call',
        stageAtTurn: activeWorkspace.current_stage,
        detectedPhrases: phrases && phrases.length > 0 ? phrases : undefined,
      };

      setMessagesByWorkspace((prev) => {
        const updated = {
          ...prev,
          [activeWorkspace.id]: [...(prev[activeWorkspace.id] || []), callRecordMsg],
        };
        syncStateToServer(undefined, updated);
        return updated;
      });

      // 3. Update memory state with summary of this call
      updateActiveWorkspace({
        last_session_summary: callSummary,
        mastered_phrases:
          phrases && phrases.length > 0
            ? Array.from(new Set([...activeWorkspace.mastered_phrases, ...phrases]))
            : activeWorkspace.mastered_phrases,
      });

      showToast(`Call ended (${durFormatted}). Conversation memory saved.`);
    }
  };

  const handleSendMessage = async (overrideText?: string, mode: 'chat' | 'call' = 'chat') => {
    const textToSend = (overrideText !== undefined ? overrideText : inputText).trim();
    if (!textToSend || isSending) return;

    if (overrideText === undefined) {
      setInputText('');
    }

    const userMsg: ChatMessage = {
      id: `${activeWorkspace.id}-${Date.now()}-u`,
      workspaceId: activeWorkspace.id,
      role: 'user',
      content: textToSend,
      timestamp: formatNowTime(),
      mode,
      stageAtTurn: activeWorkspace.current_stage,
    };

    const updatedHistory = [...activeMessages, userMsg];
    setMessagesByWorkspace((prev) => ({
      ...prev,
      [activeWorkspace.id]: updatedHistory,
    }));

    setIsSending(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: activeWorkspace,
          messages: updatedHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          userMessage: textToSend,
          includeAudio: false,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      const nextStage: StageNumber = data.updatedStage || activeWorkspace.current_stage;
      const newPhrases: string[] = Array.isArray(data.newlyMasteredPhrases)
        ? data.newlyMasteredPhrases
        : [];

      if (data.updatedStage || newPhrases.length > 0) {
        const mergedPhrases = Array.from(
          new Set([...activeWorkspace.mastered_phrases, ...newPhrases])
        );
        updateActiveWorkspace({
          current_stage: nextStage,
          grammar_unlocked: nextStage === 4 ? true : activeWorkspace.grammar_unlocked,
          mastered_phrases: mergedPhrases,
        });

        if (data.updatedStage && data.updatedStage !== activeWorkspace.current_stage) {
          showToast(
            `Leveled up to Stage ${data.updatedStage}: ${
              STAGE_DEFINITIONS[data.updatedStage as StageNumber].shortLabel
            }`
          );
        }
      }

      const aiMsg: ChatMessage = {
        id: `${activeWorkspace.id}-${Date.now()}-a`,
        workspaceId: activeWorkspace.id,
        role: 'assistant',
        content: data.reply,
        englishGloss: data.englishGloss,
        suggestedReplies: data.suggestedReplies,
        timestamp: formatNowTime(),
        mode,
        stageAtTurn: nextStage,
        detectedPhrases: newPhrases.length > 0 ? newPhrases : undefined,
      };

      setMessagesByWorkspace((prev) => ({
        ...prev,
        [activeWorkspace.id]: [...(prev[activeWorkspace.id] || []), aiMsg],
      }));
    } catch (err: any) {
      showToast(err?.message || 'Connection error. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handlePauseAndSummarize = async () => {
    if (isCallModalOpen) {
      setIsCallModalOpen(false);
    }
    if (activeMessages.length === 0 || isSummarizing) return;

    setIsSummarizing(true);
    try {
      const response = await fetch('/api/summarize-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: activeWorkspace,
          messages: activeMessages,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not summarize session');
      }

      const mergedPhrases = Array.from(
        new Set([
          ...activeWorkspace.mastered_phrases,
          ...(Array.isArray(data.new_mastered_phrases) ? data.new_mastered_phrases : []),
        ])
      );

      const recStage = Number(data.recommended_stage);
      const validStage: StageNumber =
        recStage >= 1 && recStage <= 4 ? (recStage as StageNumber) : activeWorkspace.current_stage;

      updateActiveWorkspace({
        last_session_summary: data.last_session_summary || activeWorkspace.last_session_summary,
        mastered_phrases: mergedPhrases,
        active_practice_topics:
          Array.isArray(data.active_practice_topics) && data.active_practice_topics.length > 0
            ? data.active_practice_topics
            : activeWorkspace.active_practice_topics,
        current_stage: validStage,
        grammar_unlocked: validStage === 4 ? true : activeWorkspace.grammar_unlocked,
      });

      showToast(
        `${activeWorkspace.companion_name}’s memory updated — resume anytime via call or chat.`
      );
    } catch (err: any) {
      showToast(err?.message || 'Session saved.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleExplainWhy = async (msg: ChatMessage, customQuestion?: string) => {
    setSelectedWhyMessageId(msg.id);
    if (msg.whyNote && !customQuestion) {
      return;
    }

    setIsLoadingWhy(true);
    try {
      const response = await fetch('/api/explain-why', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: activeWorkspace,
          messageContent: msg.content,
          userQuestion: customQuestion,
        }),
      });
      const note: GrammarSideNote = await response.json();
      if (!response.ok) {
        throw new Error('Could not load grammar explanation');
      }

      setMessagesByWorkspace((prev) => ({
        ...prev,
        [activeWorkspace.id]: (prev[activeWorkspace.id] || []).map((item) =>
          item.id === msg.id ? { ...item, whyNote: note } : item
        ),
      }));
    } catch (err: any) {
      showToast(err?.message || 'Failed to load grammar side-note.');
    } finally {
      setIsLoadingWhy(false);
    }
  };

  const handlePlayMessageAudio = async (msg: ChatMessage) => {
    if (playingMessageId === msg.id) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setPlayingMessageId(null);
      return;
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setPlayingMessageId(msg.id);

    // Check memory cache first
    const cached = audioCacheRef.current.get(msg.content);
    if (cached) {
      try {
        const audio = new Audio(`data:audio/wav;base64,${cached}`);
        currentAudioRef.current = audio;
        audio.onended = () => setPlayingMessageId(null);
        audio.onerror = () => setPlayingMessageId(null);
        await audio.play();
        return;
      } catch {
        // Fallback below
      }
    }

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: msg.content,
          voiceName: activeWorkspace.voice_name || 'Zephyr',
        }),
      });
      const data = await response.json();
      if (response.ok && data.audioBase64) {
        audioCacheRef.current.set(msg.content, data.audioBase64);
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        currentAudioRef.current = audio;
        audio.onended = () => setPlayingMessageId(null);
        audio.onerror = () => {
          playSpeechSynthesisFallback(msg.content);
        };
        await audio.play();
        return;
      }
    } catch {
      // Fallback to speech synthesis
    }

    playSpeechSynthesisFallback(msg.content);
  };

  const playSpeechSynthesisFallback = (text: string) => {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const clean = text.replace(/[*_#`~()]/g, ' ').trim();
        const utter = new SpeechSynthesisUtterance(clean);
        const langCode = activeWorkspace.language_code || 'fr-FR';
        utter.lang = langCode;
        utter.rate = 0.92;

        const voices = window.speechSynthesis.getVoices();
        const prefix = langCode.split('-')[0].toLowerCase();
        const matchedVoice =
          voices.find(
            (v) =>
              v.lang.toLowerCase().startsWith(prefix) &&
              (v.name.includes('Natural') ||
                v.name.includes('Google') ||
                v.name.includes('Online') ||
                v.name.includes('Denise') ||
                v.name.includes('Hortense') ||
                v.name.includes('Julie') ||
                v.name.includes('Celine'))
          ) || voices.find((v) => v.lang.toLowerCase().startsWith(prefix));

        if (matchedVoice) {
          utter.voice = matchedVoice;
        }

        utter.onend = () => setPlayingMessageId(null);
        utter.onerror = () => setPlayingMessageId(null);
        window.speechSynthesis.speak(utter);
      } catch {
        setPlayingMessageId(null);
      }
    } else {
      setPlayingMessageId(null);
    }
  };

  // --- WhatsApp-Quality Interactive Voice Note Recorder ---
  const handleStartVoiceNote = async () => {
    if (isRecordingVoiceNote) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      voiceNoteStreamRef.current = stream;

      // 1. Web Audio Analyser for live reactive waveform
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        voiceNoteAudioCtxRef.current = audioCtx;
        voiceNoteAnalyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVisualizer = () => {
          analyser.getByteFrequencyData(dataArray);
          const newBars: number[] = [];
          const step = Math.floor(dataArray.length / 18);
          for (let i = 0; i < 18; i++) {
            const val = dataArray[i * step] || 0;
            const pct = Math.min(100, Math.max(14, Math.round((val / 255) * 100 * 1.6)));
            newBars.push(pct);
          }
          setVoiceNoteBars(newBars);
          voiceNoteAnimRef.current = requestAnimationFrame(updateVisualizer);
        };
        voiceNoteAnimRef.current = requestAnimationFrame(updateVisualizer);
      } catch {
        // fallback
      }

      // 2. Real-Time Speech Recognition Preview
      setLiveVoiceNoteTranscript('');
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang =
            activeWorkspace.id === 'french'
              ? 'fr-FR'
              : activeWorkspace.id === 'spanish'
              ? 'es-ES'
              : activeWorkspace.id === 'mandarin'
              ? 'zh-CN'
              : 'en-US';

          recognition.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              interim += event.results[i][0].transcript;
            }
            if (interim) {
              setLiveVoiceNoteTranscript(interim.trim());
            }
          };

          recognition.start();
          voiceNoteRecogRef.current = recognition;
        } catch {
          // ignore
        }
      }

      // 3. MediaRecorder
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();

      setIsRecordingVoiceNote(true);
      setVoiceNoteSeconds(0);
      voiceNoteTimerRef.current = setInterval(() => {
        setVoiceNoteSeconds((s) => s + 1);
      }, 1000);
    } catch {
      showToast('Microphone access denied or unavailable.');
    }
  };

  const stopVoiceNoteSensors = () => {
    if (voiceNoteTimerRef.current) {
      clearInterval(voiceNoteTimerRef.current);
      voiceNoteTimerRef.current = null;
    }
    if (voiceNoteAnimRef.current) {
      cancelAnimationFrame(voiceNoteAnimRef.current);
      voiceNoteAnimRef.current = null;
    }
    if (voiceNoteAudioCtxRef.current) {
      voiceNoteAudioCtxRef.current.close().catch(() => {});
      voiceNoteAudioCtxRef.current = null;
    }
    if (voiceNoteRecogRef.current) {
      try {
        voiceNoteRecogRef.current.stop();
      } catch {
        // ignore
      }
      voiceNoteRecogRef.current = null;
    }
    if (voiceNoteStreamRef.current) {
      voiceNoteStreamRef.current.getTracks().forEach((t) => t.stop());
      voiceNoteStreamRef.current = null;
    }
    setIsRecordingVoiceNote(false);
  };

  const handleCancelVoiceNote = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopVoiceNoteSensors();
    setLiveVoiceNoteTranscript('');
    audioChunksRef.current = [];
    showToast('Voice note cancelled.');
  };

  const handleFinishAndSendVoiceNote = async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    const capturedText = liveVoiceNoteTranscript.trim();

    mediaRecorderRef.current.onstop = async () => {
      stopVoiceNoteSensors();

      // If speech recognition already grabbed clean text, immediately send!
      if (capturedText) {
        await handleSendMessage(capturedText, 'chat');
        setLiveVoiceNoteTranscript('');
        return;
      }

      const audioBlob = new Blob(audioChunksRef.current, {
        type: mediaRecorderRef.current?.mimeType || 'audio/webm',
      });
      if (audioBlob.size < 400) {
        showToast('Voice note was too short.');
        return;
      }

      setIsTranscribingNote(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        if (!base64Audio) {
          setIsTranscribingNote(false);
          return;
        }
        try {
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64,
              mimeType: audioBlob.type || 'audio/webm',
              targetLanguage: activeWorkspace.target_language,
            }),
          });
          const data = await res.json();
          if (data.transcript && data.transcript.trim()) {
            await handleSendMessage(data.transcript.trim(), 'chat');
          } else {
            showToast('Could not recognize voice note, please try again.');
          }
        } catch {
          showToast('Voice transcription failed.');
        } finally {
          setIsTranscribingNote(false);
          setLiveVoiceNoteTranscript('');
        }
      };
      reader.readAsDataURL(audioBlob);
    };

    mediaRecorderRef.current.stop();
  };

  const handleAddNewLanguage = (lang: (typeof AVAILABLE_NEW_LANGUAGES)[0]) => {
    if (memoryState.workspaces[lang.id]) {
      handleSwitchWorkspace(lang.id);
      setShowAddLanguageModal(false);
      return;
    }

    const newWs: LanguageWorkspace = {
      id: lang.id,
      target_language: lang.name,
      language_code: lang.code,
      anchor_language: 'English',
      companion_name: lang.companion_name,
      companion_role: lang.companion_role,
      city_line: lang.city_line,
      dial_code: lang.dial_code,
      avatar_url: `/src/assets/images/avatar_${lang.id}_default.jpg`,
      current_stage: 1,
      mastered_phrases: [lang.greeting.split(' ')[0]],
      active_practice_topics: ['greetings', 'icebreakers'],
      grammar_unlocked: false,
      last_session_summary: `Started learning ${lang.name} with ${lang.companion_name}. Keep exchanges ultra-short with greetings.`,
      voice_name: 'Zephyr',
      updated_at: new Date().toISOString(),
    };

    const starterMsg: ChatMessage = {
      id: `${lang.id}-init`,
      workspaceId: lang.id,
      role: 'assistant',
      content: `${lang.greeting} It’s ${lang.companion_name} in ${lang.city_line}! Happy to connect. Let’s start with a simple greeting.`,
      englishGloss: `Hello! Happy to connect.`,
      suggestedReplies: [lang.greeting, 'Hello!', 'How are you?'],
      timestamp: formatNowTime(),
      mode: 'chat',
      stageAtTurn: 1,
      detectedPhrases: [lang.greeting],
    };

    setMemoryState((prev) => ({
      ...prev,
      active_workspace: lang.id,
      workspaces: {
        ...prev.workspaces,
        [lang.id]: newWs,
      },
    }));

    setMessagesByWorkspace((prev) => ({
      ...prev,
      [lang.id]: [starterMsg],
    }));

    setShowAddLanguageModal(false);
    showToast(`Connected ${lang.name} line with ${lang.companion_name}.`);
  };

  const selectedWhyMessage = activeMessages.find((m) => m.id === selectedWhyMessageId);
  const lastAiMsg = [...activeMessages].reverse().find((m) => m.role === 'assistant');
  const quickReplies =
    lastAiMsg?.suggestedReplies && lastAiMsg.suggestedReplies.length > 0
      ? lastAiMsg.suggestedReplies
      : currentStageDef.samplePrompts;

  return (
    <div className="h-screen flex flex-col bg-[#0F0E0D] text-[#EDE8DF] overflow-hidden antialiased">
      {/* Top Bar: Luxury Communications Deck */}
      <header className="bg-[#141210] border-b border-white/10 px-4 sm:px-6 py-3 shrink-0 z-10 shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          {/* Active Companion Identity */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-full overflow-hidden border border-white/20 shrink-0 bg-[#24211D]">
                <img
                  src={activeWorkspace.avatar_url}
                  alt={activeWorkspace.companion_name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#141210]" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif font-bold text-base text-white tracking-tight">
                  {activeWorkspace.companion_name}
                </h1>
                <span className="text-xs text-[#9E978C] hidden sm:inline">
                  · {activeWorkspace.city_line}
                </span>
              </div>
              <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1.5">
                <span>{LANGUAGE_FLAGS[activeWorkspace.id] || '🌐'}</span>
                <span>{activeWorkspace.target_language} Line</span>
                <span className="text-white/20">·</span>
                <span className="text-[#A39C8E]">Active</span>
              </p>
            </div>
          </div>

          {/* Center Workspace Switcher Tabs */}
          <div className="hidden md:flex items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10">
            {Object.values(memoryState.workspaces).map((ws) => {
              const isSelected = ws.id === activeWorkspace.id;
              const flag = LANGUAGE_FLAGS[ws.id] || '🌐';
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleSwitchWorkspace(ws.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-white/15 text-white border border-white/20 shadow-xs font-semibold'
                      : 'text-[#9E978C] hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>{flag}</span>
                  <span>{ws.target_language}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowAddLanguageModal(true)}
              className="px-2.5 py-1.5 text-xs text-[#9E978C] hover:text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1"
              title="Add language workspace"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Stage Pill */}
            <button
              type="button"
              onClick={() => setShowStageRoadmap(true)}
              className="px-2.5 sm:px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-medium text-[#D1C9BA] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="font-mono text-[11px] text-amber-400 font-semibold">
                S{activeWorkspace.current_stage}
              </span>
              <span className="hidden sm:inline">
                {STAGE_DEFINITIONS[activeWorkspace.current_stage].shortLabel.split(' · ')[1]}
              </span>
              <ChevronDown className="w-3 h-3 text-[#9E978C]" />
            </button>

            {/* Big Green Phone Call Button */}
            <button
              type="button"
              onClick={() => setIsCallModalOpen(true)}
              className="px-3.5 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-950/40 active:scale-95"
            >
              <Phone className="w-4 h-4 fill-current" />
              <span className="hidden sm:inline">Call {activeWorkspace.companion_name}</span>
            </button>

            {/* Pause & Save Memory */}
            <button
              type="button"
              onClick={handlePauseAndSummarize}
              disabled={isSummarizing}
              className="p-2 sm:px-3 sm:py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-medium text-[#D1C9BA] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Pause and update companion memory"
            >
              <PauseCircle className="w-4 h-4 text-[#D97757]" />
              <span className="hidden lg:inline">{isSummarizing ? 'Saving...' : 'Pause'}</span>
            </button>

            {/* Master Prompt & JSON Inspector */}
            <button
              type="button"
              onClick={() => setShowPromptInspector(true)}
              className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-medium text-[#9E978C] hover:text-white cursor-pointer"
              title="Inspect Master System Prompt & Workspace JSON"
            >
              <Terminal className="w-4 h-4" />
            </button>

            {/* User Profile / Mobile Phone Sync / Cloud Database */}
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className={`px-2.5 sm:px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                currentUser
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                  : 'bg-white/5 hover:bg-white/10 text-[#D1C9BA] border border-white/10'
              }`}
              title={
                currentUser
                  ? `Logged in as ${currentUser.name} (${currentUser.username})`
                  : 'Log in with password / Sync on Mobile Phone'
              }
            >
              <User className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline font-sans">
                {currentUser ? currentUser.name.split(' ')[0] : 'Sign In'}
              </span>
              <Smartphone className="w-3.5 h-3.5 text-[#9E978C] hidden sm:inline" />
              {currentUser && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </button>
          </div>
        </div>

        {/* Mobile Language Switcher Row */}
        <div className="flex md:hidden items-center gap-1.5 overflow-x-auto pt-2 border-t border-white/5 mt-2">
          {Object.values(memoryState.workspaces).map((ws) => {
            const isSelected = ws.id === activeWorkspace.id;
            const flag = LANGUAGE_FLAGS[ws.id] || '🌐';
            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => handleSwitchWorkspace(ws.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                  isSelected
                    ? 'bg-white/20 text-white font-semibold'
                    : 'bg-white/5 text-[#9E978C]'
                }`}
              >
                <span>{flag}</span>
                <span>{ws.target_language}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowAddLanguageModal(true)}
            className="px-2 py-1 text-xs text-[#9E978C] bg-white/5 rounded-lg shrink-0 flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {statusBanner && (
        <div className="bg-emerald-900/90 text-emerald-200 border-b border-emerald-700/50 px-4 py-2 text-xs font-medium text-center shrink-0">
          {statusBanner}
        </div>
      )}

      {/* Main Chat Thread Area */}
      <div className="flex-1 max-w-4xl w-full mx-auto flex overflow-hidden relative">
        <main className="flex-1 min-w-0 flex flex-col h-full bg-[#12110F] border-x border-white/5">
          {/* Subtle Memory Context Ribbon */}
          <div className="px-4 py-2 bg-white/[0.02] border-b border-white/5 flex items-center justify-between text-xs text-[#8C8476] min-w-0">
            <span className="truncate min-w-0 flex-1 mr-3 text-[11px]">
              {activeWorkspace.last_session_summary || 'Practicing natural check-ins and daily flow.'}
            </span>
            <span className="shrink-0 text-[11px] font-mono tabular-nums text-emerald-400">
              {activeWorkspace.mastered_phrases.length} phrases mastered
            </span>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-5">
            {activeMessages.map((msg) => {
              if (msg.content.startsWith('📞 Phone Call Ended')) {
                return (
                  <div
                    key={msg.id}
                    className="mx-auto my-3 max-w-md w-full bg-[#181614] border border-emerald-500/30 rounded-2xl p-4 text-center shadow-lg"
                  >
                    <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-400">
                      <Phone className="w-3.5 h-3.5 fill-current" />
                      <span>{msg.content}</span>
                      <span className="text-white/20">·</span>
                      <span className="text-[#A39C8E] font-normal">{msg.timestamp}</span>
                    </div>
                    {msg.englishGloss && (
                      <p className="text-xs text-[#D1C9BA] mt-2 leading-relaxed">
                        {msg.englishGloss}
                      </p>
                    )}
                    {msg.detectedPhrases && msg.detectedPhrases.length > 0 && (
                      <div className="mt-2.5 flex items-center justify-center flex-wrap gap-1.5">
                        <span className="text-[10px] text-emerald-400 font-medium">Logged:</span>
                        {msg.detectedPhrases.map((phrase, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-200"
                          >
                            {phrase}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              const isUser = msg.role === 'user';
              const isWhyActive = selectedWhyMessageId === msg.id;
              const isGlossRevealed = revealedGlossIds[msg.id];

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  {/* Sender & Timestamp */}
                  <div className="flex items-center gap-2 text-[11px] text-[#7A7367] mb-1 px-1">
                    <span className="font-medium text-[#A39C8E]">
                      {isUser ? 'You' : activeWorkspace.companion_name}
                    </span>
                    <span className="text-white/20">·</span>
                    <span>
                      {msg.mode === 'call' ? '📞 Call Transcript' : '💬 Message'}
                    </span>
                    <span className="text-white/20">·</span>
                    <span className="font-mono tabular-nums">{msg.timestamp}</span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed transition-all shadow-sm ${
                      isUser
                        ? 'bg-[#2E2A25] text-white border border-white/10'
                        : isWhyActive
                        ? 'bg-[#1C1A17] text-[#EDE8DF] border-2 border-amber-400/80 shadow-[0_0_20px_rgba(251,191,36,0.15)]'
                        : 'bg-[#191715] text-[#EDE8DF] border border-white/10'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* Optional Revealed English Translation */}
                    {!isUser && msg.englishGloss && isGlossRevealed && (
                      <p className="mt-2 pt-2 border-t border-white/10 text-xs text-[#9E978C] italic animate-in fade-in duration-150">
                        “{msg.englishGloss}”
                      </p>
                    )}
                  </div>

                  {/* Voice Listen Button & Why Note Trigger */}
                  {!isUser && (
                    <div className="flex items-center gap-3 mt-1.5 px-1 text-xs">
                      {/* Audio Button */}
                      <button
                        type="button"
                        onClick={() => handlePlayMessageAudio(msg)}
                        className="text-[#9E978C] hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{playingMessageId === msg.id ? 'Playing...' : 'Listen'}</span>
                      </button>

                      <span className="text-white/20">·</span>

                      {/* Translation Toggle */}
                      {msg.englishGloss && (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleGloss(msg.id)}
                            className="text-[#9E978C] hover:text-white cursor-pointer transition-colors"
                          >
                            {isGlossRevealed ? 'Hide translation' : 'Translate'}
                          </button>
                          <span className="text-white/20">·</span>
                        </>
                      )}

                      {/* "Why?" Margin Note */}
                      <button
                        type="button"
                        onClick={() => handleExplainWhy(msg)}
                        className={`flex items-center gap-1 cursor-pointer transition-colors ${
                          isWhyActive
                            ? 'text-amber-400 font-semibold'
                            : 'text-[#9E978C] hover:text-white'
                        }`}
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span>Why this phrasing?</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {isSending && (
              <div className="flex flex-col items-start">
                <div className="text-[11px] text-[#7A7367] mb-1 px-1">
                  {activeWorkspace.companion_name} is replying...
                </div>
                <div className="bg-[#191715] border border-white/10 rounded-2xl px-4 py-3 text-xs text-[#9E978C]">
                  Thinking naturally in {activeWorkspace.target_language} + English...
                </div>
              </div>
            )}

            {isTranscribingNote && (
              <div className="flex flex-col items-end">
                <div className="text-[11px] text-rose-400 mb-1 px-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                  <span>Transcribing your voice note...</span>
                </div>
              </div>
            )}

            <div ref={threadEndRef} />
          </div>

          {/* Quick Conversational Reply Chips */}
          <div className="px-4 sm:px-6 py-2.5 bg-[#141210] border-t border-white/5 flex items-center gap-2 overflow-x-auto">
            <span className="text-[11px] font-medium text-[#7A7367] whitespace-nowrap shrink-0">
              Suggestions:
            </span>
            {quickReplies.map((reply, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(reply, 'chat')}
                disabled={isSending || isRecordingVoiceNote}
                className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-[#EDE8DF] border border-white/10 rounded-xl whitespace-nowrap shrink-0 transition-colors cursor-pointer disabled:opacity-50"
              >
                {reply}
              </button>
            ))}
          </div>

          {/* Floating Interim Speech Recognition Feedback Bar (Above Composer) */}
          {isRecordingVoiceNote && liveVoiceNoteTranscript && (
            <div className="px-5 py-2 bg-rose-950/60 border-t border-rose-700/50 text-xs text-rose-200 flex items-center gap-2 animate-in slide-in-from-bottom-2">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse shrink-0" />
              <span className="text-[#A39C8E] shrink-0 font-medium">Hearing you:</span>
              <span className="font-semibold text-white truncate">
                “{liveVoiceNoteTranscript}”
              </span>
            </div>
          )}

          {/* WhatsApp-Quality Active Audio Composer */}
          <div className="p-3 sm:p-4 bg-[#141210] border-t border-white/5">
            {isRecordingVoiceNote ? (
              /* Active Voice Recording Console: Real-time visualizer + live timer */
              <div className="flex items-center justify-between gap-3 bg-[#1B1815] border border-rose-500/50 rounded-2xl px-4 py-2.5 text-sm animate-in fade-in duration-150 shadow-lg shadow-rose-950/30">
                {/* Left: Pulsing red dot + Recording Timer */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  <span className="font-mono text-xs font-bold text-rose-300 tabular-nums">
                    {formatTimer(voiceNoteSeconds)}
                  </span>
                </div>

                {/* Center: Live Audio Frequency Waveform (Directly animated by your actual voice!) */}
                <div className="flex-1 max-w-xs h-7 flex items-center justify-center gap-1 mx-2">
                  {voiceNoteBars.map((pct, idx) => (
                    <div
                      key={idx}
                      className="w-1 rounded-full bg-rose-400 transition-all duration-75"
                      style={{ height: `${pct}%` }}
                    />
                  ))}
                </div>

                {/* Right: Trash / Cancel + Send Voice Note */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCancelVoiceNote}
                    className="p-2 text-[#9E978C] hover:text-rose-400 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                    title="Cancel voice note"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleFinishAndSendVoiceNote}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md shadow-rose-950/50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Standard Text + Voice Note Trigger Bar */
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                {/* Voice Note Button */}
                <button
                  type="button"
                  onClick={handleStartVoiceNote}
                  disabled={isTranscribingNote || isSending}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[#EDE8DF] transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
                  title="Record a voice note with live soundwave reaction"
                >
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">
                    {isTranscribingNote ? 'Transcribing...' : 'Voice Note'}
                  </span>
                </button>

                <input
                  ref={textInputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Chat with ${activeWorkspace.companion_name} in ${activeWorkspace.target_language} or English...`}
                  className="flex-1 min-h-[44px] bg-[#1A1815] border border-white/10 rounded-xl px-4 py-2 text-sm text-[#EDE8DF] placeholder:text-[#6E675C] focus:outline-none focus:border-emerald-500/80 transition-colors"
                />

                <button
                  type="submit"
                  disabled={!inputText.trim() || isSending}
                  className="min-h-[44px] px-4 sm:px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-950/40"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            )}
          </div>
        </main>

        {/* On-Demand "Why?" Side Sheet */}
        {selectedWhyMessage && (
          <aside className="w-80 sm:w-96 border-l border-white/10 bg-[#161412] h-full flex flex-col shadow-2xl z-20 animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <BookOpen className="w-4 h-4" />
                <span>On-Demand Grammar Note</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWhyMessageId(null)}
                className="p-1 text-[#9E978C] hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
              {isLoadingWhy ? (
                <p className="text-xs text-[#9E978C]">
                  Asking {activeWorkspace.companion_name} for a friendly breakdown...
                </p>
              ) : selectedWhyMessage.whyNote ? (
                <>
                  <div>
                    <span className="text-[11px] text-[#7A7367] block">Target Phrase</span>
                    <p className="text-base font-serif font-semibold text-white mt-0.5">
                      {selectedWhyMessage.whyNote.phrase}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-white/5">
                    <span className="text-[11px] text-[#7A7367] block">
                      Literal Word-for-Word
                    </span>
                    <p className="text-xs font-medium text-emerald-400 mt-0.5">
                      “{selectedWhyMessage.whyNote.literalMeaning}”
                    </p>
                  </div>

                  <div className="pt-2 border-t border-white/5">
                    <span className="text-[11px] text-[#7A7367] block">Why It Works</span>
                    <p className="text-xs text-[#D1C9BA] leading-relaxed mt-0.5">
                      {selectedWhyMessage.whyNote.naturalExplanation}
                    </p>
                  </div>

                  <div className="bg-white/5 p-3.5 rounded-xl border border-white/10">
                    <span className="font-semibold text-amber-300 block">Pattern Tip:</span>
                    <p className="text-xs text-[#EDE8DF] mt-1">
                      {selectedWhyMessage.whyNote.patternTip}
                    </p>
                    {selectedWhyMessage.whyNote.examples?.length > 0 && (
                      <div className="mt-2 space-y-1 text-[#9E978C]">
                        {selectedWhyMessage.whyNote.examples.map((ex, i) => (
                          <div key={i}>• {ex}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!customWhyQuestion.trim()) return;
                      handleExplainWhy(selectedWhyMessage, customWhyQuestion.trim());
                      setCustomWhyQuestion('');
                    }}
                    className="pt-2 flex gap-1.5"
                  >
                    <input
                      type="text"
                      value={customWhyQuestion}
                      onChange={(e) => setCustomWhyQuestion(e.target.value)}
                      placeholder="Ask about this phrase..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="submit"
                      className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl cursor-pointer shrink-0"
                    >
                      Ask
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </aside>
        )}
      </div>

      {/* Full-Screen Phone Call Modal */}
      <CallModal
        workspace={activeWorkspace}
        messages={activeMessages}
        isOpen={isCallModalOpen}
        onCloseAndReturnToChat={handleCloseCallAndRecordSession}
        onAppendCallTurn={handleAppendCallTurn}
        onExplainWhy={(msg) => handleExplainWhy(msg)}
      />

      {/* Cloud Account & Mobile Phone Sync & Call History Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        currentUser={currentUser}
        callLogs={callLogs}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
      />

      {/* Master Prompt & Memory Inspector Modal */}
      <PromptMemoryInspector
        isOpen={showPromptInspector}
        memoryState={memoryState}
        activeWorkspace={activeWorkspace}
        onClose={() => setShowPromptInspector(false)}
        onUpdateWorkspace={updateActiveWorkspace}
      />

      {/* Stage Roadmap Modal */}
      {showStageRoadmap && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#191715] border border-white/15 rounded-2xl max-w-lg w-full p-6 text-[#EDE8DF] shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-serif font-bold text-lg text-white">
                4-Stage Bilingual Progression
              </h3>
              <button
                type="button"
                onClick={() => setShowStageRoadmap(false)}
                className="p-1 text-[#9E978C] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {([1, 2, 3, 4] as StageNumber[]).map((stageNum) => {
                const def = STAGE_DEFINITIONS[stageNum];
                const isCurrent = activeWorkspace.current_stage === stageNum;
                const isPast = activeWorkspace.current_stage > stageNum;

                return (
                  <div
                    key={stageNum}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isCurrent
                        ? 'bg-emerald-950/30 border-emerald-500/50'
                        : isPast
                        ? 'bg-white/5 border-white/10 opacity-75'
                        : 'bg-white/[0.02] border-white/5 opacity-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            isCurrent
                              ? 'bg-emerald-500 text-black'
                              : isPast
                              ? 'bg-white/20 text-white'
                              : 'bg-white/10 text-[#7A7367]'
                          }`}
                        >
                          {stageNum}
                        </span>
                        <span className="font-semibold text-sm text-white">{def.title}</span>
                      </div>
                      {isCurrent && (
                        <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                          Current Stage
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#A39C8E] mt-1.5 leading-relaxed">
                      {def.description}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-3 border-t border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => setShowStageRoadmap(false)}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-xl"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Language Modal */}
      {showAddLanguageModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#191715] border border-white/15 rounded-2xl max-w-md w-full p-6 text-[#EDE8DF] shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-serif font-bold text-lg text-white">Add Language Line</h3>
              <button
                type="button"
                onClick={() => setShowAddLanguageModal(false)}
                className="p-1 text-[#9E978C] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#9E978C] mt-2">
              Each language has its own companion, dial code, and strictly isolated memory.
            </p>

            <div className="mt-4 space-y-2 max-h-72 overflow-y-auto">
              {AVAILABLE_NEW_LANGUAGES.map((lang) => {
                const alreadyExists = !!memoryState.workspaces[lang.id];
                return (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => handleAddNewLanguage(lang)}
                    className="w-full text-left p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{lang.flag}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{lang.name}</p>
                        <p className="text-xs text-[#9E978C]">
                          {lang.companion_name} · {lang.city_line}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-emerald-400">
                      {alreadyExists ? 'Switch' : 'Connect'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
