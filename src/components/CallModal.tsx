import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  RotateCcw,
  Gauge,
  MessageSquare,
  Sparkles,
  HelpCircle,
  X,
  ChevronDown,
  ChevronUp,
  Radio,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { ChatMessage, LanguageWorkspace, StageNumber } from '../types';
import { STAGE_DEFINITIONS } from '../prompts';

interface CallModalProps {
  workspace: LanguageWorkspace;
  messages: ChatMessage[];
  isOpen: boolean;
  onCloseAndReturnToChat: (callDurationSeconds?: number, summary?: string, phrases?: string[]) => void;
  onAppendCallTurn: (turn: {
    role: 'user' | 'assistant';
    content: string;
    englishGloss?: string;
    suggestedReplies?: string[];
    updatedStage?: StageNumber;
    newlyMasteredPhrases?: string[];
  }) => void;
  onExplainWhy: (msg: ChatMessage) => void;
}

function playDialRingbackTone(): () => void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = 425;
    osc2.frequency.value = 450;

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.85);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.9);
    osc2.stop(ctx.currentTime + 0.9);

    return () => {
      ctx.close().catch(() => {});
    };
  } catch {
    return () => {};
  }
}

function findBestSpeechVoice(langCode: string): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const prefix = langCode.split('-')[0].toLowerCase();

  return (
    voices.find(
      (v) =>
        v.lang.toLowerCase().startsWith(prefix) &&
        (v.name.includes('Natural') ||
          v.name.includes('Google') ||
          v.name.includes('Online') ||
          v.name.includes('Denise') ||
          v.name.includes('Hortense') ||
          v.name.includes('Julie') ||
          v.name.includes('Paul') ||
          v.name.includes('Celine'))
    ) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ||
    null
  );
}

function speakBrowserSpeech(text: string, langCode: string, slow = false) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[*_#`~()]/g, ' ').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = langCode || 'fr-FR';
    utterance.rate = slow ? 0.82 : 0.95;
    utterance.pitch = 1.0;

    const matchedVoice = findBestSpeechVoice(langCode);
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch {
    // ignore
  }
}

export const CallModal: React.FC<CallModalProps> = ({
  workspace,
  messages,
  isOpen,
  onCloseAndReturnToChat,
  onAppendCallTurn,
  onExplainWhy,
}) => {
  const [callState, setCallState] = useState<
    'connecting' | 'speaking' | 'listening' | 'thinking'
  >('connecting');
  const [secondsOnCall, setSecondsOnCall] = useState(0);
  const [slowPlayback, setSlowPlayback] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [showEnglishSubtitle, setShowEnglishSubtitle] = useState(true);
  const [showInspirationHints, setShowInspirationHints] = useState(false);
  const [micVolume, setMicVolume] = useState<number>(0);
  const [bars, setBars] = useState<number[]>(Array.from({ length: 24 }, () => 14));
  const [livePartnerCaption, setLivePartnerCaption] = useState<string>('');
  const [livePartnerGloss, setLivePartnerGloss] = useState<string>('');
  const [liveUserCaption, setLiveUserCaption] = useState<string>('');
  const [whisperReplies, setWhisperReplies] = useState<string[]>([]);
  const [lastAudioBase64, setLastAudioBase64] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Call turns and phrases tracking for database logging
  const callPhrasesRef = useRef<Set<string>>(new Set());
  const callTurnCountRef = useRef(0);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const slowPlaybackRef = useRef(slowPlayback);
  const isOpenRef = useRef(isOpen);
  const isMicMutedRef = useRef(isMicMuted);

  // Web Audio Analyser
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Live browser speech recognition
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const accumulatedTranscriptRef = useRef<string>('');
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    slowPlaybackRef.current = slowPlayback;
    if (currentAudioRef.current) {
      currentAudioRef.current.playbackRate = slowPlayback ? 0.85 : 1.0;
    }
  }, [slowPlayback]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  // Sync latest assistant message when opening
  useEffect(() => {
    setAvatarFailed(false);
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant) {
      setLivePartnerCaption(lastAssistant.content);
      setLivePartnerGloss(lastAssistant.englishGloss || '');
      setWhisperReplies(
        lastAssistant.suggestedReplies || STAGE_DEFINITIONS[workspace.current_stage].samplePrompts
      );
    }
  }, [workspace.id, messages.length]);

  // Call timer
  useEffect(() => {
    if (!isOpen || callState === 'connecting') {
      if (!isOpen) {
        setSecondsOnCall(0);
        callPhrasesRef.current.clear();
        callTurnCountRef.current = 0;
      }
      return;
    }
    const interval = setInterval(() => {
      setSecondsOnCall((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, callState]);

  // Visualizer loop
  useEffect(() => {
    if (callState === 'speaking' || callState === 'connecting') {
      const id = setInterval(() => {
        setBars(
          Array.from({ length: 24 }, (_, i) => {
            const centerWeight = 1 - Math.abs(i - 11.5) / 12;
            const rand = Math.random() * 68 * centerWeight + 16;
            return Math.min(95, Math.max(14, Math.round(rand)));
          })
        );
      }, 75);
      return () => clearInterval(id);
    } else if (callState === 'listening' && analyserRef.current && !isMicMuted) {
      const analyser = analyserRef.current;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const renderRealMicBars = () => {
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        const newBars: number[] = [];
        const step = Math.floor(dataArray.length / 24);

        for (let i = 0; i < 24; i++) {
          const val = dataArray[i * step] || 0;
          sum += val;
          const pct = Math.min(100, Math.max(14, Math.round((val / 255) * 100 * 1.6)));
          newBars.push(pct);
        }

        const avg = Math.round(sum / 24);
        setMicVolume(Math.min(100, Math.round((avg / 255) * 100 * 2)));
        setBars(newBars);

        animFrameRef.current = requestAnimationFrame(renderRealMicBars);
      };

      animFrameRef.current = requestAnimationFrame(renderRealMicBars);
      return () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      };
    } else {
      setBars(Array.from({ length: 24 }, () => 14));
      setMicVolume(0);
    }
  }, [callState, isMicMuted]);

  const stopAllAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, [stopAllAudio]);

  const playPartnerAudio = useCallback(
    async (base64Wav: string | null, fallbackText?: string) => {
      if (!base64Wav && !fallbackText) {
        setCallState('listening');
        startContinuousMic();
        return;
      }

      setCallState('speaking');

      const onPlaybackDone = () => {
        if (!isOpenRef.current) return;
        setCallState('listening');
        startContinuousMic();
      };

      if (base64Wav) {
        setLastAudioBase64(base64Wav);
        if (currentAudioRef.current) {
          currentAudioRef.current.pause();
        }

        try {
          const audio = new Audio(`data:audio/wav;base64,${base64Wav}`);
          audio.playbackRate = slowPlaybackRef.current ? 0.85 : 1.0;
          currentAudioRef.current = audio;

          audio.onended = onPlaybackDone;
          audio.onerror = () => {
            if (fallbackText) {
              speakBrowserSpeech(fallbackText, workspace.language_code, slowPlaybackRef.current);
            }
            onPlaybackDone();
          };
          await audio.play();
          return;
        } catch {
          if (fallbackText) {
            speakBrowserSpeech(fallbackText, workspace.language_code, slowPlaybackRef.current);
          }
          onPlaybackDone();
          return;
        }
      }

      if (fallbackText) {
        speakBrowserSpeech(fallbackText, workspace.language_code, slowPlaybackRef.current);
        onPlaybackDone();
      }
    },
    [workspace.language_code]
  );

  const processCallUserTurn = async (spokenText: string) => {
    if (!spokenText.trim()) return;
    setLiveUserCaption(spokenText.trim());
    setCallState('thinking');
    setStatusNotice(`${workspace.companion_name} is listening & thinking...`);
    callTurnCountRef.current += 1;

    onAppendCallTurn({
      role: 'user',
      content: spokenText.trim(),
    });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace,
          messages: [
            ...messages.slice(-12).map((m) => ({
              role: m.role,
              content: m.content,
            })),
            { role: 'user', content: spokenText.trim() },
          ],
          userMessage: spokenText.trim(),
          includeAudio: true,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Voice turn failed');
      }

      setStatusNotice(null);
      setLivePartnerCaption(data.reply);
      setLivePartnerGloss(data.englishGloss || '');
      if (Array.isArray(data.suggestedReplies) && data.suggestedReplies.length > 0) {
        setWhisperReplies(data.suggestedReplies);
      }
      if (Array.isArray(data.newlyMasteredPhrases)) {
        data.newlyMasteredPhrases.forEach((p: string) => callPhrasesRef.current.add(p));
      }

      onAppendCallTurn({
        role: 'assistant',
        content: data.reply,
        englishGloss: data.englishGloss,
        suggestedReplies: data.suggestedReplies,
        updatedStage: data.updatedStage,
        newlyMasteredPhrases: data.newlyMasteredPhrases,
      });

      await playPartnerAudio(data.audioBase64 || null, data.reply);
    } catch (err: any) {
      setStatusNotice('Voice turn interrupted. Speak naturally or tap below.');
      setCallState('listening');
      startContinuousMic();
    }
  };

  // Continuous Hands-Free Microphone: stays live, detects pauses naturally without button clicks
  const startContinuousMic = async () => {
    if (isMicMutedRef.current || !isOpenRef.current) return;

    try {
      if (!mediaStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        mediaStreamRef.current = stream;

        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          audioCtxRef.current = audioCtx;
          analyserRef.current = analyser;
        } catch {
          // ignore
        }
      }

      accumulatedTranscriptRef.current = '';
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang =
            workspace.id === 'french'
              ? 'fr-FR'
              : workspace.id === 'spanish'
              ? 'es-ES'
              : workspace.id === 'mandarin'
              ? 'zh-CN'
              : 'en-US';

          recognition.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                accumulatedTranscriptRef.current += event.results[i][0].transcript + ' ';
              } else {
                interim += event.results[i][0].transcript;
              }
            }
            const currentText = (accumulatedTranscriptRef.current + interim).trim();
            if (currentText) {
              setLiveUserCaption(currentText);

              // Natural conversational silence detection: 1.3s pause triggers companion reply
              if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = setTimeout(() => {
                const finalSpeech = (accumulatedTranscriptRef.current + interim).trim();
                try {
                  recognition.stop();
                } catch {
                  // ignore
                }
                if (finalSpeech) {
                  processCallUserTurn(finalSpeech);
                }
              }, 1300);
            }
          };

          recognition.onerror = () => {};
          recognition.start();
          recognitionRef.current = recognition;
        } catch {
          // ignore
        }
      }

      setCallState('listening');
      setStatusNotice(null);
    } catch {
      setStatusNotice('Microphone access needed for live phone call.');
      setCallState('listening');
    }
  };

  // Pickup on open
  useEffect(() => {
    if (!isOpen) {
      stopAllAudio();
      return;
    }

    let cancelled = false;
    setCallState('connecting');
    setStatusNotice(`Calling ${workspace.companion_name} in ${workspace.city_line}...`);
    const stopRing = playDialRingbackTone();

    async function pickupLine() {
      try {
        const res = await fetch('/api/call-pickup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace,
            recentMessages: messages.slice(-6).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        stopRing();
        setStatusNotice(null);

        if (data.reply) {
          setLivePartnerCaption(data.reply);
          setLivePartnerGloss(data.englishGloss || '');
          if (Array.isArray(data.suggestedReplies) && data.suggestedReplies.length > 0) {
            setWhisperReplies(data.suggestedReplies);
          }
          onAppendCallTurn({
            role: 'assistant',
            content: data.reply,
            englishGloss: data.englishGloss,
            suggestedReplies: data.suggestedReplies,
          });
          setCallState('speaking');
          await playPartnerAudio(data.audioBase64 || null, data.reply);
        } else {
          setCallState('listening');
          startContinuousMic();
        }
      } catch {
        if (!cancelled) {
          stopRing();
          setStatusNotice(null);
          setCallState('listening');
          startContinuousMic();
        }
      }
    }

    const timer = setTimeout(() => {
      pickupLine();
    }, 1100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopRing();
      stopAllAudio();
    };
  }, [isOpen, workspace.id]);

  const handleEndCall = () => {
    const summary = livePartnerCaption || 'Practiced speaking with ' + workspace.companion_name;
    const phrases = Array.from(callPhrasesRef.current);
    stopAllAudio();
    onCloseAndReturnToChat(secondsOnCall, summary, phrases);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#090807]/98 backdrop-blur-xl flex flex-col justify-between p-4 sm:p-6 text-[#F5F2EB] select-none">
      {/* Top Status Header */}
      <div className="max-w-xl w-full mx-auto flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              callState === 'connecting'
                ? 'bg-amber-400 animate-ping'
                : 'bg-emerald-400 animate-pulse'
            }`}
          />
          <span className="font-mono tabular-nums text-white font-medium">
            {callState === 'connecting' ? 'Calling...' : formatTimer(secondsOnCall)}
          </span>
          <span className="text-white/30">·</span>
          <span className="text-[#A39C8E]">{workspace.city_line}</span>
          <span className="text-white/30">·</span>
          <span className="text-emerald-400 font-medium">Live Hands-Free Call</span>
        </div>

        <button
          type="button"
          onClick={handleEndCall}
          className="p-1.5 text-[#A39C8E] hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
          title="Return to Chat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Calling Presence */}
      <div className="max-w-md w-full mx-auto flex flex-col items-center text-center my-auto py-2">
        {/* Companion Avatar with Live Sound-Reactive Pulsing Rings */}
        <div className="relative mb-4 flex items-center justify-center">
          {/* Animated visualizer rings when companion speaks */}
          {callState === 'speaking' && (
            <div className="absolute w-44 h-44 sm:w-52 sm:h-52 rounded-full bg-emerald-500/20 animate-ping duration-1000" />
          )}

          {/* Real microphone reaction: Ring expands proportionally to your actual voice volume! */}
          {callState === 'listening' && micVolume > 15 && (
            <div
              className="absolute rounded-full bg-rose-500/25 transition-all duration-75"
              style={{
                width: `${140 + micVolume * 0.9}px`,
                height: `${140 + micVolume * 0.9}px`,
              }}
            />
          )}

          <div
            className={`relative z-10 w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden border-2 transition-all duration-150 shadow-2xl ${
              callState === 'speaking'
                ? 'border-emerald-400 shadow-[0_0_45px_rgba(52,211,153,0.4)] scale-105'
                : callState === 'listening' && micVolume > 15
                ? 'border-rose-400 shadow-[0_0_45px_rgba(244,63,94,0.45)] scale-105'
                : 'border-white/20'
            }`}
          >
            {!avatarFailed ? (
              <img
                src={workspace.avatar_url}
                alt={workspace.companion_name}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[#1C1A17] flex items-center justify-center text-4xl font-serif font-bold text-white">
                {workspace.companion_name.charAt(0)}
              </div>
            )}
          </div>
        </div>

        {/* Companion Identity */}
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-tight">
          {workspace.companion_name}
        </h2>
        <p className="text-xs sm:text-sm text-[#A39C8E] mt-0.5">
          {workspace.companion_role} · {workspace.target_language} Line
        </p>

        {/* Live Audio Reactive Waveform */}
        <div className="my-3.5 h-10 flex items-center justify-center gap-1.5 w-full max-w-xs">
          {bars.map((pct, idx) => (
            <div
              key={idx}
              className={`w-1 sm:w-1.5 rounded-full transition-all duration-75 ${
                callState === 'speaking'
                  ? 'bg-emerald-400'
                  : callState === 'listening' && micVolume > 15
                  ? 'bg-rose-400'
                  : callState === 'connecting'
                  ? 'bg-amber-400/60'
                  : 'bg-white/15'
              }`}
              style={{ height: `${pct}%` }}
            />
          ))}
        </div>

        {/* Active Speech Status Indicator */}
        <div className="mb-2 min-h-[1.5rem] flex items-center justify-center">
          {callState === 'connecting' ? (
            <span className="text-xs text-amber-300">Connecting to {workspace.companion_name}...</span>
          ) : callState === 'speaking' ? (
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {workspace.companion_name} is speaking...
            </span>
          ) : callState === 'thinking' ? (
            <span className="text-xs text-amber-300 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              {workspace.companion_name} is thinking...
            </span>
          ) : micVolume > 15 ? (
            <span className="text-xs text-rose-300 font-medium flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              Hearing your voice... Speak naturally
            </span>
          ) : (
            <span className="text-xs text-[#A39C8E]">
              Hands-free: speak in {workspace.target_language} or English whenever you want
            </span>
          )}
        </div>

        {/* Live Spoken Captions & Simultaneous Translation Card */}
        <div className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-2xl p-4 text-left transition-all shadow-xl">
          <div className="flex items-center justify-between text-[11px] text-[#8F887B] mb-1.5">
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              <span>{workspace.companion_name}</span>
              <span className="text-[10px] text-white/40 font-normal">(Live Captions)</span>
            </span>
            <div className="flex items-center gap-2.5">
              {lastAudioBase64 && (
                <button
                  type="button"
                  onClick={() => playPartnerAudio(lastAudioBase64, livePartnerCaption)}
                  className="text-[#D97757] hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Replay
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowEnglishSubtitle((s) => !s)}
                className="hover:text-white cursor-pointer transition-colors"
              >
                {showEnglishSubtitle ? 'Hide English' : 'Show English'}
              </button>
              {lastAssistantMsg && (
                <button
                  type="button"
                  onClick={() => {
                    onExplainWhy(lastAssistantMsg);
                    handleEndCall();
                  }}
                  className="text-amber-300 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <HelpCircle className="w-3 h-3" />
                  Why?
                </button>
              )}
            </div>
          </div>

          {/* Large, High-Contrast Spoken Sentence */}
          <p className="text-base font-medium text-white leading-relaxed">
            {livePartnerCaption || `“Allô ! Comment ça va aujourd'hui ?”`}
          </p>

          {/* Real-Time English Translation Always Visible by Default */}
          {showEnglishSubtitle && livePartnerGloss && (
            <div className="pt-2 mt-2 border-t border-white/10 text-xs text-amber-200/90 leading-relaxed font-sans">
              <span className="text-white/40 block text-[10px] uppercase tracking-wider mb-0.5">
                English Meaning:
              </span>
              “{livePartnerGloss}”
            </div>
          )}

          {/* Live User Caption: Updates word-by-word in real time as you speak! */}
          {liveUserCaption && (
            <div className="pt-2 mt-2 border-t border-white/10 text-xs text-emerald-300 flex items-center gap-1.5">
              <span className="text-[#8F887B]">You: </span>
              <span className="font-medium text-white">“{liveUserCaption}”</span>
              {micVolume > 15 && (
                <span className="inline-block w-1.5 h-3 bg-emerald-400 animate-pulse ml-0.5" />
              )}
            </div>
          )}
        </div>

        {/* Subtle Inspiration Drawer */}
        <div className="mt-2.5 w-full">
          <button
            type="button"
            onClick={() => setShowInspirationHints((h) => !h)}
            className="text-[11px] text-[#A39C8E] hover:text-white flex items-center justify-center gap-1 mx-auto cursor-pointer transition-colors py-1"
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>{showInspirationHints ? 'Hide suggestions' : 'Need phrase inspiration?'}</span>
            {showInspirationHints ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>

          {showInspirationHints && (
            <div className="mt-2 flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
              {whisperReplies.slice(0, 3).map((reply, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={callState === 'thinking' || callState === 'connecting'}
                  onClick={() => processCallUserTurn(reply)}
                  className="w-full text-left px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-[#E6E1D6] transition-colors flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span className="truncate">“{reply}”</span>
                  <span className="text-[10px] text-emerald-400 shrink-0">Tap to answer</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Real Phone Call Bottom Dock: NO "Done Speaking" or "Send Voice" buttons! */}
      <div className="max-w-md w-full mx-auto flex items-center justify-center gap-4 pb-2">
        {/* Mute / Unmute Microphone */}
        <button
          type="button"
          onClick={() => setIsMicMuted((m) => !m)}
          className={`w-14 h-14 rounded-full flex flex-col items-center justify-center gap-1 text-xs font-medium border transition-all cursor-pointer ${
            isMicMuted
              ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
              : 'bg-white/10 hover:bg-white/15 border-white/15 text-white'
          }`}
          title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 text-emerald-400" />}
          <span className="text-[9px]">{isMicMuted ? 'Muted' : 'Mute'}</span>
        </button>

        {/* Slow Voice Toggle (0.85x) */}
        <button
          type="button"
          onClick={() => setSlowPlayback((s) => !s)}
          className={`w-14 h-14 rounded-full flex flex-col items-center justify-center gap-1 text-xs font-medium border transition-all cursor-pointer ${
            slowPlayback
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
              : 'bg-white/10 hover:bg-white/15 border-white/15 text-white'
          }`}
          title="Slow down companion speech for clarity"
        >
          <Gauge className="w-5 h-5 text-amber-300" />
          <span className="text-[9px]">{slowPlayback ? '0.85x' : 'Speed'}</span>
        </button>

        {/* Switch to Chat */}
        <button
          type="button"
          onClick={handleEndCall}
          className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white flex flex-col items-center justify-center gap-1 text-xs font-medium transition-all cursor-pointer"
          title="Return to Chat"
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[9px]">Chat</span>
        </button>

        {/* Big Red End Call Hangup Button */}
        <button
          type="button"
          onClick={handleEndCall}
          className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex flex-col items-center justify-center gap-1 shadow-xl shadow-rose-950/60 transition-all cursor-pointer active:scale-95"
          title="End Call and Save Progress"
        >
          <PhoneOff className="w-6 h-6 fill-current" />
          <span className="text-[9px] font-bold uppercase tracking-wider">End</span>
        </button>
      </div>
    </div>
  );
};
