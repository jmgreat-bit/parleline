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

function base64ToFloat32Array(base64: string): Float32Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const float32 = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32[i] = int16Array[i] / 32768.0;
  }
  return float32;
}

function float32ToInt16Base64(input: Float32Array, inputSampleRate: number): string {
  const targetSampleRate = 16000;
  let samples: Float32Array;
  if (inputSampleRate === targetSampleRate) {
    samples = input;
  } else {
    const ratio = inputSampleRate / targetSampleRate;
    const newLength = Math.round(input.length / ratio);
    samples = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIndex = Math.min(Math.floor(i * ratio), input.length - 1);
      samples[i] = input[srcIndex];
    }
  }

  const pcm16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function isMostlyEnglish(text: string): boolean {
  const frenchWordCount = (
    text.match(
      /\b(le|la|les|un|une|des|est|sont|c'est|j'ai|je|tu|il|elle|nous|vous|ils|elles|avec|pour|dans|qui|que|pas|mon|ma|mes|ton|ta|tes|son|sa|ses|du|de|au|aux|bonjour|salut|coucou|comment|ça|va|merci|oui|non)\b/gi
    ) || []
  ).length;
  const englishWordCount = (
    text.match(
      /\b(the|is|are|was|were|a|an|in|on|at|to|for|with|you|i|we|they|he|she|it|that|this|have|has|had|do|does|did|will|would|can|could|so|and|but|or|not|hello|hi|what|how|where|when|why)\b/gi
    ) || []
  ).length;
  return englishWordCount > frenchWordCount;
}

function findBestSpeechVoice(langCode: string): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const prefix = langCode.split('-')[0].toLowerCase();

  // Strict male voice filter to eliminate any robotic male narrator like Microsoft Paul or David
  const isMaleVoice = (name: string) =>
    /\b(paul|david|mark|george|claude|thomas|alain|male|guy|stefan|henri|richard|james|homme)\b/i.test(
      name
    );

  const femaleKeywords = [
    'julie',
    'hortense',
    'denise',
    'celine',
    'céline',
    'amelie',
    'amélie',
    'virginie',
    'lea',
    'chloe',
    'camille',
    'audrey',
    'aurelie',
    'aurélie',
    'samantha',
    'karen',
    'jenny',
    'zira',
    'victoria',
    'female',
    'natural',
    'online',
  ];

  // 1. High priority: confirmed female voice matching language
  const femaleVoice = voices.find(
    (v) =>
      v.lang.toLowerCase().startsWith(prefix) &&
      !isMaleVoice(v.name) &&
      femaleKeywords.some((k) => v.name.toLowerCase().includes(k))
  );
  if (femaleVoice) return femaleVoice;

  // 2. Any voice for this language that is NOT male
  const anyNonMale = voices.find(
    (v) => v.lang.toLowerCase().startsWith(prefix) && !isMaleVoice(v.name)
  );
  if (anyNonMale) return anyNonMale;

  // 3. Fallback: language match but never a male voice if avoidable
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix) && !isMaleVoice(v.name)) ||
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
    const effectiveLang = isMostlyEnglish(cleanText) ? 'en-US' : (langCode || 'fr-FR');
    utterance.lang = effectiveLang;
    utterance.rate = slow ? 0.82 : 0.94;
    utterance.pitch = 1.08; // Warm, natural feminine pitch

    const matchedVoice = findBestSpeechVoice(effectiveLang);
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
  const [isLiveNativeSession, setIsLiveNativeSession] = useState(false);

  // Gemini Live Native Full-Duplex Audio Streaming Refs
  const wsRef = useRef<WebSocket | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const liveMicCtxRef = useRef<AudioContext | null>(null);
  const liveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const isLiveWsActiveRef = useRef<boolean>(false);
  const livePartnerAccumRef = useRef<string>('');
  const liveUserAccumRef = useRef<string>('');
  const lastVolUpdateRef = useRef<number>(0);
  const hasSpokenInCurrentTurnRef = useRef<boolean>(false);
  const lastSpokenTimeRef = useRef<number>(0);

  // Call turns and phrases tracking for database logging
  const callPhrasesRef = useRef<Set<string>>(new Set());
  const callTurnCountRef = useRef(0);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const slowPlaybackRef = useRef(slowPlayback);
  const isOpenRef = useRef(isOpen);
  const isMicMutedRef = useRef(isMicMuted);
  const callStateRef = useRef(callState);

  // Web Audio Analyser
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Live browser speech recognition & rolling MediaRecorder VAD
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const accumulatedTranscriptRef = useRef<string>('');
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const isSpeakingDetectedRef = useRef(false);
  const speechStartTimeRef = useRef(0);
  const lastSoundTimeRef = useRef(0);
  const isProcessingTurnRef = useRef(false);
  const callMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const callAudioChunksRef = useRef<Blob[]>([]);

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

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Sync latest conversational assistant message when opening
  useEffect(() => {
    setAvatarFailed(false);
    const lastAssistant = [...messages]
      .reverse()
      .find(
        (m) =>
          m.role === 'assistant' &&
          !m.content.includes('Phone Call Ended') &&
          !m.content.includes('Call Duration')
      );
    if (lastAssistant) {
      setLivePartnerCaption(lastAssistant.content);
      setLivePartnerGloss(lastAssistant.englishGloss || '');
      setWhisperReplies(
        lastAssistant.suggestedReplies || STAGE_DEFINITIONS[workspace.current_stage].samplePrompts
      );
    } else {
      setLivePartnerCaption('');
      setLivePartnerGloss('');
      setWhisperReplies(STAGE_DEFINITIONS[workspace.current_stage].samplePrompts);
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
        const currentVol = Math.min(100, Math.round((avg / 255) * 100 * 2));
        setMicVolume(currentVol);
        setBars(newBars);

        // --- Dual-Track Voice Activity Detection (VAD) ---
        // Allows true natural conversational flow without requiring manual button presses
        if (!isProcessingTurnRef.current && callStateRef.current === 'listening') {
          const now = Date.now();
          if (currentVol >= 15) {
            // Active voice detected
            if (!isSpeakingDetectedRef.current) {
              isSpeakingDetectedRef.current = true;
              speechStartTimeRef.current = now;
            }
            lastSoundTimeRef.current = now;
          } else if (isSpeakingDetectedRef.current && now - lastSoundTimeRef.current > 1150) {
            // Conversational pause: 1.15s of silence after speaking for at least 350ms
            if (lastSoundTimeRef.current - speechStartTimeRef.current > 350) {
              isSpeakingDetectedRef.current = false;
              triggerCallUserTurn();
            } else {
              isSpeakingDetectedRef.current = false;
            }
          }
        }

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

  const stopLivePlayback = useCallback(() => {
    activeSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    activeSourcesRef.current = [];
    if (playbackCtxRef.current) {
      nextPlayTimeRef.current = playbackCtxRef.current.currentTime;
    } else {
      nextPlayTimeRef.current = 0;
    }
  }, []);

  const playLivePcmChunk = useCallback((base64Data: string) => {
    try {
      const float32 = base64ToFloat32Array(base64Data);
      if (!playbackCtxRef.current || playbackCtxRef.current.state === 'closed') {
        playbackCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000,
        });
      }
      const ctx = playbackCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = slowPlaybackRef.current ? 0.85 : 1.0;
      source.connect(ctx.destination);

      const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current);
      source.start(startTime);
      nextPlayTimeRef.current =
        startTime + audioBuffer.duration / (slowPlaybackRef.current ? 0.85 : 1.0);

      activeSourcesRef.current.push(source);
      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        if (activeSourcesRef.current.length === 0 && callStateRef.current === 'speaking') {
          setCallState('listening');
        }
      };
    } catch (err) {
      console.warn('playLivePcmChunk error:', err);
    }
  }, []);

  const startLiveMicStreaming = useCallback(
    (stream: MediaStream) => {
      try {
        const micCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const sourceNode = micCtx.createMediaStreamSource(stream);

        const analyser = micCtx.createAnalyser();
        analyser.fftSize = 64;
        sourceNode.connect(analyser);
        audioCtxRef.current = micCtx;
        analyserRef.current = analyser;

        const processor = micCtx.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
          if (!isLiveWsActiveRef.current || isMicMutedRef.current || !wsRef.current) return;
          if (wsRef.current.readyState !== WebSocket.OPEN) return;

          const inputBuffer = e.inputBuffer.getChannelData(0);

          let sum = 0;
          for (let i = 0; i < inputBuffer.length; i++) {
            sum += inputBuffer[i] * inputBuffer[i];
          }
          const rms = Math.sqrt(sum / inputBuffer.length);
          // Noise floor subtraction: ambient room hiss is typically 0.03 - 0.05 RMS
          const NOISE_FLOOR = 0.036;
          const cleanRms = Math.max(0, rms - NOISE_FLOOR);
          const vol = Math.min(100, Math.round(cleanRms * 320));

          // Throttle volume state updates to eliminate millisecond UI jitter
          const now = Date.now();
          if (now - lastVolUpdateRef.current > 120) {
            lastVolUpdateRef.current = now;
            setMicVolume(vol);
          }

          // 1. If partner (Camille) is speaking:
          if (callStateRef.current === 'speaking') {
            // Drop ambient noise packets so Gemini Live VAD doesn't self-interrupt Camille!
            // Only allow intentional loud barge-in (vol > 48)
            if (vol > 48) {
              stopLivePlayback();
              setCallState('listening');
              hasSpokenInCurrentTurnRef.current = true;
              lastSpokenTimeRef.current = now;
              const pcm16Base64 = float32ToInt16Base64(inputBuffer, micCtx.sampleRate);
              wsRef.current.send(
                JSON.stringify({
                  type: 'audio',
                  audio: pcm16Base64,
                })
              );
            }
            return;
          }

          // 2. If in listening mode:
          if (vol > 15) {
            // User is actively speaking
            hasSpokenInCurrentTurnRef.current = true;
            lastSpokenTimeRef.current = now;
            const pcm16Base64 = float32ToInt16Base64(inputBuffer, micCtx.sampleRate);
            wsRef.current.send(
              JSON.stringify({
                type: 'audio',
                audio: pcm16Base64,
              })
            );
          } else {
            // User is silent
            if (hasSpokenInCurrentTurnRef.current) {
              // User was speaking and just stopped/paused.
              // Stream zeroed silence chunks for up to 800ms so Gemini's VAD triggers turn complete immediately:
              if (now - lastSpokenTimeRef.current < 800) {
                const zeroBuffer = new Float32Array(inputBuffer.length);
                const silenceBase64 = float32ToInt16Base64(zeroBuffer, micCtx.sampleRate);
                wsRef.current.send(
                  JSON.stringify({
                    type: 'audio',
                    audio: silenceBase64,
                  })
                );
              } else {
                hasSpokenInCurrentTurnRef.current = false;
              }
            }
          }
        };

        // Connect through silent gain to keep processor active without audio feedback
        const silentGain = micCtx.createGain();
        silentGain.gain.value = 0;
        sourceNode.connect(processor);
        processor.connect(silentGain);
        silentGain.connect(micCtx.destination);

        liveMicCtxRef.current = micCtx;
        liveProcessorRef.current = processor;

        // Browser speech recognition safety net in Live Mode
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          try {
            if (recognitionRef.current) {
              try {
                recognitionRef.current.stop();
              } catch {}
            }
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
              let finalChunk = '';
              for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                  finalChunk += event.results[i][0].transcript + ' ';
                } else {
                  interim += event.results[i][0].transcript;
                }
              }
              const currentSpeech = (finalChunk || interim).trim();
              if (currentSpeech) {
                setLiveUserCaption(currentSpeech);

                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = setTimeout(() => {
                  // After pause, nudge Gemini if model hasn't already started speaking
                  if (
                    callStateRef.current !== 'speaking' &&
                    wsRef.current &&
                    wsRef.current.readyState === WebSocket.OPEN
                  ) {
                    wsRef.current.send(
                      JSON.stringify({
                        type: 'text_nudge',
                        text: currentSpeech,
                      })
                    );
                  }
                }, 1100);
              }
            };

            recognition.onerror = () => {};
            recognition.start();
            recognitionRef.current = recognition;
          } catch {
            // ignore speech recognition error
          }
        }
      } catch (err) {
        console.warn('startLiveMicStreaming error:', err);
      }
    },
    [stopLivePlayback, workspace.id]
  );

  const stopAllAudio = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    isLiveWsActiveRef.current = false;
    stopLivePlayback();
    if (liveProcessorRef.current) {
      try {
        liveProcessorRef.current.disconnect();
      } catch {}
      liveProcessorRef.current = null;
    }
    if (liveMicCtxRef.current) {
      liveMicCtxRef.current.close().catch(() => {});
      liveMicCtxRef.current = null;
    }
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close().catch(() => {});
      playbackCtxRef.current = null;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (callMediaRecorderRef.current && callMediaRecorderRef.current.state !== 'inactive') {
      try {
        callMediaRecorderRef.current.stop();
      } catch {}
      callMediaRecorderRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
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
    isProcessingTurnRef.current = false;
    isSpeakingDetectedRef.current = false;
  }, [stopLivePlayback]);

  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, [stopAllAudio]);

  const playPartnerAudio = useCallback(
    async (base64Wav: string | null, fallbackText?: string) => {
      // Pause incoming recorder while partner speaks to prevent echo feedback
      if (callMediaRecorderRef.current && callMediaRecorderRef.current.state !== 'inactive') {
        try {
          callMediaRecorderRef.current.stop();
        } catch {}
      }
      callAudioChunksRef.current = [];
      isSpeakingDetectedRef.current = false;

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

  // Triggers turn from speech recognition or falls back to Gemini audio transcription
  const triggerCallUserTurn = async (forcedText?: string) => {
    if (isLiveWsActiveRef.current) {
      const textToSend = forcedText || liveUserCaption.trim() || accumulatedTranscriptRef.current.trim();
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        if (textToSend) {
          wsRef.current.send(
            JSON.stringify({
              type: 'text_nudge',
              text: textToSend,
            })
          );
        } else {
          // Send explicit silence to signal pause/end of turn immediately
          const silenceBuffer = new Float32Array(2048);
          const silenceBase64 = float32ToInt16Base64(silenceBuffer, 16000);
          wsRef.current.send(
            JSON.stringify({
              type: 'audio',
              audio: silenceBase64,
            })
          );
        }
      }
      return;
    }
    if (isProcessingTurnRef.current) return;
    isProcessingTurnRef.current = true;

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    const textCandidate = forcedText || (accumulatedTranscriptRef.current || '').trim();
    accumulatedTranscriptRef.current = '';

    // Track 1: Browser Speech Recognition yielded words
    if (textCandidate) {
      await processCallUserTurn(textCandidate);
      isProcessingTurnRef.current = false;
      return;
    }

    // Track 2: Speech Recognition returned empty (e.g. mobile browser or English spoken on French line)
    // Transcribe the recorded audio chunks directly via Gemini Multimodal Audio
    setCallState('thinking');
    setLiveUserCaption('Transcribing your voice...');

    try {
      if (callMediaRecorderRef.current && callMediaRecorderRef.current.state !== 'inactive') {
        try {
          callMediaRecorderRef.current.requestData();
        } catch {}
      }

      await new Promise((r) => setTimeout(r, 90));

      const chunks = [...callAudioChunksRef.current];
      callAudioChunksRef.current = [];

      if (chunks.length > 0) {
        const audioBlob = new Blob(chunks, {
          type: callMediaRecorderRef.current?.mimeType || 'audio/webm',
        });

        if (audioBlob.size > 500) {
          const reader = new FileReader();
          const base64: string = await new Promise((resolve) => {
            reader.onloadend = () => {
              const res = ((reader.result as string) || '').split(',')[1] || '';
              resolve(res);
            };
            reader.readAsDataURL(audioBlob);
          });

          if (base64) {
            const res = await fetch('/api/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64,
                mimeType: audioBlob.type || 'audio/webm',
                targetLanguage: workspace.target_language,
              }),
            });
            const data = await res.json();
            if (data.transcript && data.transcript.trim()) {
              await processCallUserTurn(data.transcript.trim());
              isProcessingTurnRef.current = false;
              return;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Call transcribe fallback warning:', err);
    }

    // If nothing transcribed, smoothly resume listening
    isProcessingTurnRef.current = false;
    setLiveUserCaption('');
    setCallState('listening');
    startContinuousMic();
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

      // Initialize / Restart Rolling MediaRecorder buffer
      try {
        if (callMediaRecorderRef.current && callMediaRecorderRef.current.state !== 'inactive') {
          try {
            callMediaRecorderRef.current.stop();
          } catch {}
        }
        let chosenMime = '';
        if (typeof MediaRecorder !== 'undefined') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            chosenMime = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            chosenMime = 'audio/mp4';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            chosenMime = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/aac')) {
            chosenMime = 'audio/aac';
          }
        }
        const rec = new MediaRecorder(
          mediaStreamRef.current!,
          chosenMime ? { mimeType: chosenMime } : undefined
        );
        callAudioChunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            callAudioChunksRef.current.push(e.data);
            if (callAudioChunksRef.current.length > 150) {
              callAudioChunksRef.current = callAudioChunksRef.current.slice(-100);
            }
          }
        };
        rec.start(100);
        callMediaRecorderRef.current = rec;
      } catch (err) {
        console.warn('Call MediaRecorder start warning:', err);
      }

      accumulatedTranscriptRef.current = '';
      isSpeakingDetectedRef.current = false;
      speechStartTimeRef.current = 0;
      lastSoundTimeRef.current = 0;

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          if (recognitionRef.current) {
            try {
              recognitionRef.current.stop();
            } catch {}
          }
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

              // Silence detection on speech recognition
              if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = setTimeout(() => {
                const finalSpeech = (accumulatedTranscriptRef.current + interim).trim();
                triggerCallUserTurn(finalSpeech);
              }, 1200);
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

    // 1. Immediately initialize and unlock AudioContext during user click gesture
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!playbackCtxRef.current || playbackCtxRef.current.state === 'closed') {
        const pCtx = new AudioCtx({ sampleRate: 24000 });
        pCtx.resume().catch(() => {});
        playbackCtxRef.current = pCtx;
      } else if (playbackCtxRef.current.state === 'suspended') {
        playbackCtxRef.current.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('AudioContext init error:', e);
    }

    // 2. Pre-acquire microphone stream immediately while user gesture is active
    if (!mediaStreamRef.current) {
      navigator.mediaDevices
        ?.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        .then((stream) => {
          if (cancelled) return;
          mediaStreamRef.current = stream;
          if (isLiveWsActiveRef.current) {
            startLiveMicStreaming(stream);
          }
        })
        .catch((err) => {
          console.warn('Microphone pre-acquire warning:', err);
        });
    }

    const runTurnBasedPickup = async () => {
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
    };

    async function pickupLine() {
      const isWsSupported = typeof WebSocket !== 'undefined';
      if (isWsSupported) {
        try {
          const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = `${proto}//${window.location.host}/api/live-call`;
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          let wsHandshakeDone = false;

          ws.onopen = () => {
            const recentTranscript = messages
              .slice(-6)
              .map((m) => `${m.role === 'user' ? 'User' : workspace.companion_name}: ${m.content}`)
              .join('\n');

            ws.send(
              JSON.stringify({
                type: 'init',
                workspace,
                recentTranscript,
              })
            );
          };

          ws.onmessage = async (event) => {
            if (cancelled) return;
            try {
              const msg = JSON.parse(event.data);

              if (msg.type === 'ready') {
                wsHandshakeDone = true;
                isLiveWsActiveRef.current = true;
                setIsLiveNativeSession(true);
                setCallState('speaking');
                hasSpokenInCurrentTurnRef.current = false;
                stopRing();
                setStatusNotice(null);
                setLivePartnerGloss('');
                setLivePartnerCaption('');
                setLiveUserCaption('');

                // Start mic streaming immediately with ready stream or prompt
                if (mediaStreamRef.current) {
                  startLiveMicStreaming(mediaStreamRef.current);
                } else {
                  navigator.mediaDevices
                    ?.getUserMedia({
                      audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                      },
                    })
                    .then((stream) => {
                      mediaStreamRef.current = stream;
                      startLiveMicStreaming(stream);
                    })
                    .catch((err) => console.warn('mic acquire error:', err));
                }

                // Initial greeting nudge (ignoring past phone call records)
                const realLastAssistant = [...messages]
                  .reverse()
                  .find(
                    (m) =>
                      m.role === 'assistant' &&
                      !m.content.includes('Phone Call Ended') &&
                      !m.content.includes('Call Duration')
                  );
                const initialNudge = realLastAssistant
                  ? `Coucou ${workspace.companion_name} ! Pick up naturally from where we were: ${realLastAssistant.content.slice(0, 90)}`
                  : `Allô ${workspace.companion_name} ! I just picked up your call. Give me a warm, natural greeting!`;

                ws.send(
                  JSON.stringify({
                    type: 'text_nudge',
                    text: initialNudge,
                  })
                );
              } else if (msg.type === 'audio') {
                setCallState('speaking');
                playLivePcmChunk(msg.audio);
              } else if (msg.type === 'output_transcript') {
                livePartnerAccumRef.current += msg.text;
                setLivePartnerCaption(livePartnerAccumRef.current);
              } else if (msg.type === 'input_transcript') {
                liveUserAccumRef.current += msg.text;
                setLiveUserCaption(liveUserAccumRef.current);
              } else if (msg.type === 'interrupted') {
                stopLivePlayback();
                setCallState('listening');
                setStatusNotice('Listening to you...');
              } else if (msg.type === 'turn_complete') {
                const partnerTurn = livePartnerAccumRef.current.trim();
                const userTurn = liveUserAccumRef.current.trim();

                if (userTurn) {
                  onAppendCallTurn({
                    role: 'user',
                    content: userTurn,
                  });
                  callTurnCountRef.current += 1;
                  liveUserAccumRef.current = '';
                }

                if (partnerTurn) {
                  onAppendCallTurn({
                    role: 'assistant',
                    content: partnerTurn,
                  });
                  callPhrasesRef.current.add(partnerTurn.slice(0, 30));
                  livePartnerAccumRef.current = '';
                }

                hasSpokenInCurrentTurnRef.current = false;

                if (activeSourcesRef.current.length === 0) {
                  setCallState('listening');
                }
              }
            } catch (err) {
              console.error('WS message error:', err);
            }
          };

          ws.onerror = () => {
            if (!wsHandshakeDone && !cancelled) {
              console.warn('Live WebSocket error, falling back to turn-based');
              runTurnBasedPickup();
            }
          };

          ws.onclose = () => {
            if (!wsHandshakeDone && !cancelled) {
              console.warn('Live WebSocket closed before handshake, falling back to turn-based');
              runTurnBasedPickup();
            }
          };

          // Generous 12s timeout for WebSocket handshake
          setTimeout(() => {
            if (!wsHandshakeDone && !cancelled) {
              console.warn('Live WebSocket handshake timeout after 12s, running turn-based');
              runTurnBasedPickup();
            }
          }, 12000);

          return;
        } catch (e) {
          console.warn('WS startup exception:', e);
          runTurnBasedPickup();
          return;
        }
      }

      runTurnBasedPickup();
    }

    pickupLine();

    return () => {
      cancelled = true;
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
    <div className="fixed inset-0 z-50 bg-[#090807]/98 backdrop-blur-xl flex flex-col justify-between p-3 sm:p-6 text-[#F5F2EB] select-none h-[100dvh] max-h-[100dvh] overflow-y-auto no-scrollbar">
      {/* Top Status Header */}
      <div className="max-w-xl w-full mx-auto flex items-center justify-between gap-3 pt-1 sm:pt-2 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] sm:text-xs">
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
          <span className="text-[#A39C8E] hidden xs:inline">{workspace.city_line}</span>
          <span className="text-white/30 hidden xs:inline">·</span>
          <span className="text-emerald-400 font-medium">
            {isLiveNativeSession ? '⚡ Gemini Live Audio' : 'Live Call'}
          </span>
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
        <div className="relative mb-3 sm:mb-4 flex items-center justify-center">
          {/* Animated visualizer rings when companion speaks */}
          {callState === 'speaking' && (
            <div className="absolute w-36 h-36 sm:w-52 sm:h-52 rounded-full bg-emerald-500/20 animate-ping duration-1000" />
          )}

          {/* Real microphone reaction: Ring expands proportionally to your actual voice volume! */}
          {callState === 'listening' && micVolume > 15 && (
            <div
              className="absolute rounded-full bg-rose-500/25 transition-all duration-75"
              style={{
                width: `${120 + micVolume * 0.8}px`,
                height: `${120 + micVolume * 0.8}px`,
              }}
            />
          )}

          <div
            className={`relative z-10 w-24 h-24 sm:w-36 sm:h-36 rounded-full overflow-hidden border-2 transition-all duration-150 shadow-2xl ${
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
            {livePartnerCaption ||
              (callState === 'speaking'
                ? `${workspace.companion_name} is speaking...`
                : callState === 'listening'
                ? 'Listening... speak in English or French'
                : 'Connecting to ' + workspace.companion_name + '...')}
          </p>

          {/* Real-Time English Translation in Turn-Based Mode */}
          {!isLiveNativeSession && showEnglishSubtitle && livePartnerGloss && (
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

        {/* Real-time Voice Action: In Live Mode, hands-free indication with tap support */}
        {isLiveNativeSession ? (
          <div className="mt-2.5 w-full animate-in fade-in duration-150">
            <button
              type="button"
              onClick={() => {
                if (callState === 'speaking') {
                  stopLivePlayback();
                  setCallState('listening');
                } else if (callState === 'listening') {
                  triggerCallUserTurn();
                }
              }}
              className={`w-full py-2.5 px-4 rounded-xl font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-98 ${
                callState === 'speaking'
                  ? 'bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-500/30 text-emerald-300'
                  : micVolume > 15
                  ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse shadow-rose-900/40'
                  : 'bg-white/10 hover:bg-white/15 text-white/90 border border-white/10'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  callState === 'speaking'
                    ? 'bg-emerald-400 animate-ping'
                    : micVolume > 15
                    ? 'bg-white animate-ping'
                    : 'bg-emerald-400'
                }`}
              />
              <span>
                {callState === 'speaking'
                  ? `${workspace.companion_name} is speaking... (tap to interrupt)`
                  : micVolume > 15
                  ? 'Hearing your voice... (tap when done, or pause)'
                  : '🎙️ Hands-free: Speak naturally (or tap when done)'}
              </span>
            </button>
          </div>
        ) : (
          callState === 'listening' && (
            <div className="mt-2.5 w-full animate-in fade-in duration-150">
              <button
                type="button"
                onClick={() => triggerCallUserTurn()}
                className={`w-full py-2.5 px-4 rounded-xl font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-98 ${
                  micVolume > 15
                    ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse shadow-rose-900/40'
                    : 'bg-white/10 hover:bg-white/15 text-white/90 border border-white/10'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    micVolume > 15 ? 'bg-white animate-ping' : 'bg-emerald-400'
                  }`}
                />
                <span>
                  {micVolume > 15
                    ? 'Done Speaking (Send Voice)'
                    : 'Tap when done speaking (or pause 1s)'}
                </span>
              </button>
            </div>
          )
        )}
      </div>

      {/* Real Phone Call Bottom Dock */}
      <div className="max-w-md w-full mx-auto flex items-center justify-center gap-3 sm:gap-4 pb-2 pt-1 shrink-0">
        {/* Mute / Unmute Microphone */}
        <button
          type="button"
          onClick={() => setIsMicMuted((m) => !m)}
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex flex-col items-center justify-center gap-0.5 sm:gap-1 text-xs font-medium border transition-all cursor-pointer ${
            isMicMuted
              ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
              : 'bg-white/10 hover:bg-white/15 border-white/15 text-white'
          }`}
          title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {isMicMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />}
          <span className="text-[9px]">{isMicMuted ? 'Muted' : 'Mute'}</span>
        </button>

        {/* Slow Voice Toggle (0.85x) */}
        <button
          type="button"
          onClick={() => setSlowPlayback((s) => !s)}
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex flex-col items-center justify-center gap-0.5 sm:gap-1 text-xs font-medium border transition-all cursor-pointer ${
            slowPlayback
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
              : 'bg-white/10 hover:bg-white/15 border-white/15 text-white'
          }`}
          title="Slow down companion speech for clarity"
        >
          <Gauge className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />
          <span className="text-[9px]">{slowPlayback ? '0.85x' : 'Speed'}</span>
        </button>

        {/* Switch to Chat */}
        <button
          type="button"
          onClick={handleEndCall}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white flex flex-col items-center justify-center gap-0.5 sm:gap-1 text-xs font-medium transition-all cursor-pointer"
          title="Return to Chat"
        >
          <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-[9px]">Chat</span>
        </button>

        {/* Big Red End Call Hangup Button */}
        <button
          type="button"
          onClick={handleEndCall}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex flex-col items-center justify-center gap-0.5 sm:gap-1 shadow-xl shadow-rose-950/60 transition-all cursor-pointer active:scale-95"
          title="End Call and Save Progress"
        >
          <PhoneOff className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
          <span className="text-[9px] font-bold uppercase tracking-wider">End</span>
        </button>
      </div>
    </div>
  );
};
