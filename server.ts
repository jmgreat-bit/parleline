import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import {
  GoogleGenAI,
  Type,
  FunctionDeclaration,
  LiveServerMessage,
  Modality,
} from '@google/genai';
import { buildMasterSystemPrompt } from './src/prompts.ts';
import { LanguageWorkspace, StageNumber } from './src/types.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getAiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      apiVersion: 'v1alpha',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const updateWorkspaceStageTool: FunctionDeclaration = {
  name: 'update_workspace_stage',
  description:
    'Update the user progression stage (1 to 4) when they consistently handle the current stage comfortably or ask to advance.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      new_stage: {
        type: Type.INTEGER,
        description: 'The new stage number (1, 2, 3, or 4).',
      },
      reason: {
        type: Type.STRING,
        description: 'Brief note on why the user is ready for this stage.',
      },
    },
    required: ['new_stage', 'reason'],
  },
};

const recordMasteredPhrasesTool: FunctionDeclaration = {
  name: 'record_mastered_phrases',
  description:
    'Record target-language words or short phrases that the user just used naturally or practiced successfully in this turn.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      phrases: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of target-language phrases used or practiced.',
      },
    },
    required: ['phrases'],
  },
};

const PRIMARY_MODEL = 'gemini-2.5-flash-lite';
const FALLBACK_MODEL = 'gemini-flash-lite-latest';

async function safeGenerateContent(ai: GoogleGenAI, config: any) {
  try {
    return await ai.models.generateContent({
      ...config,
      model: config.model || PRIMARY_MODEL,
    });
  } catch (err: any) {
    console.warn(`Model ${config.model || PRIMARY_MODEL} warning:`, err?.message || err);
    try {
      return await ai.models.generateContent({
        ...config,
        model: FALLBACK_MODEL,
      });
    } catch (err2: any) {
      console.warn(`Fallback error:`, err2?.message || err2);
      throw err2;
    }
  }
}

async function generateWhisperSuggestions(
  ai: GoogleGenAI,
  workspace: LanguageWorkspace,
  assistantReply: string
): Promise<{ englishGloss: string; suggestedReplies: string[] }> {
  try {
    const res = await safeGenerateContent(ai, {
      model: PRIMARY_MODEL,
      contents: `Companion (${workspace.target_language} + English, Stage ${workspace.current_stage}) just said:
"${assistantReply}"

Return JSON with:
1. "englishGloss": A concise 1-line plain English translation of what the companion said.
2. "suggestedReplies": Exactly 3 natural ways the user can reply right now calibrated for Stage ${workspace.current_stage} (e.g., if Stage 1: 1-3 word greetings; if Stage 2: 2-4 word short answers mixing ${workspace.target_language} & English; if Stage 3+: a simple full sentence).`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            englishGloss: { type: Type.STRING },
            suggestedReplies: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['englishGloss', 'suggestedReplies'],
        },
      },
    });
    return JSON.parse((res.text ?? '{}').trim());
  } catch {
    return {
      englishGloss: '',
      suggestedReplies: [],
    };
  }
}

const TTS_MODELS = [
  'gemini-3.8-flash-lite-tts',
  'gemini-3.8-flash-tts',
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-flash-preview-tts',
];

async function synthesizeWavBase64(
  ai: GoogleGenAI,
  text: string,
  voiceName: string
): Promise<string | null> {
  const cleanText = text.replace(/[*_#`~]/g, '').trim();
  const selectedVoice = voiceName || 'Aoede';

  for (const model of TTS_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text: cleanText }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      });

      const audioData =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        return audioData;
      }
    } catch (err: any) {
      console.warn(`TTS model ${model} warning:`, err?.message || err);
    }
  }

  return null;
}

import {
  registerUser,
  loginUser,
  verifySessionToken,
  getUserById,
  getUserData,
  saveUserData,
  logCallRecord,
} from './src/serverDb.ts';

export const app = express();
const server = http.createServer(app);
app.use(express.json({ limit: '20mb' }));

// Helper to extract authenticated user
  const getAuthUserId = (req: express.Request): string | null => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return verifySessionToken(authHeader.slice(7));
    }
    const token = req.body?.token || req.query?.token;
    if (token) {
      return verifySessionToken(String(token));
    }
    return null;
  };

  // Auth Routes
  app.post('/api/auth/register', (req, res) => {
    try {
      const { name, username, password } = req.body;
      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }
      const { user, token } = registerUser(name || username, username, password);
      const data = getUserData(user.id);
      res.json({ user: { id: user.id, name: user.name, username: user.username }, token, data });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Registration failed' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }
      const { user, token } = loginUser(username, password);
      const data = getUserData(user.id);
      res.json({ user: { id: user.id, name: user.name, username: user.username }, token, data });
    } catch (err: any) {
      res.status(401).json({ error: err?.message || 'Login failed' });
    }
  });

  app.get('/api/auth/me', (req, res) => {
    const userId = getAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const user = getUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const data = getUserData(userId);
    res.json({ user: { id: user.id, name: user.name, username: user.username }, data });
  });

  // User State Sync
  app.post('/api/user/state', (req, res) => {
    const userId = getAuthUserId(req) || 'default_user';
    const { memoryState, messagesByWorkspace } = req.body;
    const updated = saveUserData(userId, { memoryState, messagesByWorkspace });
    res.json({ status: 'ok', updatedAt: updated.updatedAt });
  });

  app.get('/api/user/state', (req, res) => {
    const userId = getAuthUserId(req) || 'default_user';
    const data = getUserData(userId);
    res.json(data);
  });

  // Call Session Logging
  app.post('/api/calls/log', (req, res) => {
    try {
      const userId = getAuthUserId(req) || 'default_user';
      const {
        workspaceId,
        companionName,
        durationSeconds,
        stageAtCall,
        summary,
        phrasesMastered = [],
        transcriptTurnsCount = 0,
      } = req.body;

      const record = logCallRecord(userId, {
        workspaceId,
        companionName,
        durationSeconds: Number(durationSeconds) || 0,
        stageAtCall: Number(stageAtCall) || 1,
        summary: summary || 'Practiced speaking.',
        phrasesMastered,
        transcriptTurnsCount: Number(transcriptTurnsCount) || 0,
      });

      const updatedData = getUserData(userId);
      res.json({ record, callLogs: updatedData.callLogs, memoryState: updatedData.memoryState });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to log call' });
    }
  });

  // 1. Bilingual Stage-Gated Chat & Voice Turn Endpoint
  app.post('/api/chat', async (req, res) => {
    try {
      const {
        workspace,
        messages,
        userMessage,
        includeAudio = false,
      }: {
        workspace: LanguageWorkspace;
        messages: Array<{ role: string; content: string }>;
        userMessage: string;
        includeAudio?: boolean;
      } = req.body;

      if (!workspace || !userMessage) {
        res.status(400).json({ error: 'Missing workspace or userMessage' });
        return;
      }

      const ai = getAiClient();
      const systemInstruction = buildMasterSystemPrompt(workspace);

      const historyContents = (messages || []).slice(-14).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const contents = [
        ...historyContents,
        { role: 'user', parts: [{ text: userMessage }] },
      ];

      const tools = [
        {
          functionDeclarations: [
            updateWorkspaceStageTool,
            recordMasteredPhrasesTool,
          ],
        },
      ];

      const response = await safeGenerateContent(ai, {
        model: PRIMARY_MODEL,
        contents,
        config: {
          systemInstruction,
          tools,
        },
      });

      let updatedStage: StageNumber | undefined;
      let stageChangeReason: string | undefined;
      let newlyMasteredPhrases: string[] = [];

      const functionCalls = response.functionCalls;
      let finalReplyText = response.text || '';

      if (functionCalls && functionCalls.length > 0) {
        const previousContent = response.candidates?.[0]?.content;
        const functionResponseParts: Array<{
          functionResponse: {
            id?: string;
            name: string;
            response: Record<string, unknown>;
          };
        }> = [];

        for (const call of functionCalls) {
          if (call.name === 'update_workspace_stage') {
            const rawStage = Number(call.args?.new_stage);
            if (rawStage >= 1 && rawStage <= 4) {
              updatedStage = rawStage as StageNumber;
              stageChangeReason = String(
                call.args?.reason || 'Progressed naturally'
              );
            }
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: { status: 'stage_updated', new_stage: updatedStage },
              },
            });
          } else if (call.name === 'record_mastered_phrases') {
            const arr = Array.isArray(call.args?.phrases)
              ? (call.args?.phrases as string[])
              : [];
            newlyMasteredPhrases.push(...arr);
            functionResponseParts.push({
              functionResponse: {
                id: call.id,
                name: call.name,
                response: { status: 'phrases_recorded', count: arr.length },
              },
            });
          }
        }

        if (
          !finalReplyText &&
          previousContent &&
          functionResponseParts.length > 0
        ) {
          const followUp = await safeGenerateContent(ai, {
            model: PRIMARY_MODEL,
            contents: [
              ...contents,
              previousContent,
              {
                role: 'user',
                parts: functionResponseParts,
              },
            ],
            config: {
              systemInstruction,
              tools,
            },
          });
          finalReplyText = followUp.text || '';
        }
      }

      const cleanReply =
        finalReplyText ||
        `Nice! Let's keep going in ${workspace.target_language}.`;

      // Run whisper suggestions & optional TTS audio in parallel for snappy phone call turns
      const [coachMeta, audioBase64] = await Promise.all([
        generateWhisperSuggestions(ai, workspace, cleanReply),
        includeAudio
          ? synthesizeWavBase64(ai, cleanReply, workspace.voice_name)
          : Promise.resolve(null),
      ]);

      res.json({
        reply: cleanReply,
        englishGloss: coachMeta.englishGloss,
        suggestedReplies: coachMeta.suggestedReplies,
        audioBase64,
        updatedStage,
        stageChangeReason,
        newlyMasteredPhrases,
      });
    } catch (error: any) {
      console.error('Error in /api/chat:', error);
      res.status(500).json({
        error: error?.message || 'Failed to generate bilingual response.',
      });
    }
  });

  // 1b. Phone Pickup Greeting Endpoint (so when the user dials, the companion immediately answers out loud)
  app.post('/api/call-pickup', async (req, res) => {
    try {
      const {
        workspace,
        recentMessages = [],
      }: {
        workspace: LanguageWorkspace;
        recentMessages: Array<{ role: string; content: string }>;
      } = req.body;

      const ai = getAiClient();
      const systemInstruction = buildMasterSystemPrompt(workspace);
      const lastTurnNote =
        recentMessages.length > 0
          ? `The last message in your thread was: "${
              recentMessages[recentMessages.length - 1].content
            }".`
          : '';

      const prompt = `You are ${workspace.companion_name} answering an incoming phone call in ${workspace.city_line}.
Answer the phone naturally in 1-2 short, warm sentences mixing ${workspace.target_language} and English.
CRITICAL: Never give teacher instructions, drills, or meta-comments like "give me a greeting back" or "looks like we are stuck in hello mode". Speak like a genuine friend picking up a phone call (e.g., "Allô ! Coucou ! Good to hear your voice! Comment ça va aujourd'hui ?").
${lastTurnNote}`;

      const response = await safeGenerateContent(ai, {
        model: PRIMARY_MODEL,
        contents: prompt,
        config: {
          systemInstruction,
        },
      });

      const greetingText =
        response.text ||
        `Allô ! Hey, it's ${workspace.companion_name}. Good to hear your voice!`;

      const [coachMeta, audioBase64] = await Promise.all([
        generateWhisperSuggestions(ai, workspace, greetingText),
        synthesizeWavBase64(ai, greetingText, workspace.voice_name),
      ]);

      res.json({
        reply: greetingText,
        englishGloss: coachMeta.englishGloss,
        suggestedReplies: coachMeta.suggestedReplies,
        audioBase64,
      });
    } catch (error: any) {
      console.error('Error in /api/call-pickup:', error);
      res.status(500).json({
        error: error?.message || 'Failed to connect phone pickup.',
      });
    }
  });

  // 2. "Why?" On-Demand Grammar & Pattern Side-Note Endpoint
  app.post('/api/explain-why', async (req, res) => {
    try {
      const {
        workspace,
        messageContent,
        userQuestion,
      }: {
        workspace: LanguageWorkspace;
        messageContent: string;
        userQuestion?: string;
      } = req.body;

      const ai = getAiClient();
      const prompt = `The user is learning ${workspace.target_language} (Stage ${workspace.current_stage}) with ${workspace.companion_name} and tapped "Why?" on this message:
"${messageContent}"
${userQuestion ? `Specific user curiosity: "${userQuestion}"` : ''}

Provide a warm, friendly margin note explaining why the ${workspace.target_language} phrase or verb works that way—without dry textbook jargon. Connect it directly to everyday speech.`;

      const response = await safeGenerateContent(ai, {
        model: PRIMARY_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              phrase: {
                type: Type.STRING,
                description:
                  'The key target-language phrase or words from the message.',
              },
              literalMeaning: {
                type: Type.STRING,
                description:
                  'Word-for-word literal meaning in English so the structure clicks.',
              },
              naturalExplanation: {
                type: Type.STRING,
                description:
                  'Plain-English explanation of why the words/tense/order work this way (2-3 sentences max).',
              },
              patternTip: {
                type: Type.STRING,
                description:
                  'A quick reusable rule of thumb or pattern the user can steal.',
              },
              examples: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '2 short bilingual examples using the same pattern.',
              },
            },
            required: [
              'phrase',
              'literalMeaning',
              'naturalExplanation',
              'patternTip',
              'examples',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error: any) {
      console.error('Error in /api/explain-why:', error);
      res.status(500).json({
        error: error?.message || 'Failed to generate grammar side-note.',
      });
    }
  });

  // 3. Pause / End Call 3-Second Session Summarizer Endpoint
  app.post('/api/summarize-session', async (req, res) => {
    try {
      const {
        workspace,
        messages,
      }: {
        workspace: LanguageWorkspace;
        messages: Array<{ role: string; content: string; mode?: string }>;
      } = req.body;

      const ai = getAiClient();
      const transcript = (messages || [])
        .slice(-16)
        .map(
          (m) => `${m.role.toUpperCase()} (${m.mode || 'chat'}): ${m.content}`
        )
        .join('\n');

      const prompt = `Analyze this recent ${workspace.target_language} + ${workspace.anchor_language} bilingual session with ${workspace.companion_name} for a learner currently at Stage ${workspace.current_stage}.
Existing summary: "${workspace.last_session_summary}"
Existing mastered phrases: ${JSON.stringify(workspace.mastered_phrases)}

Recent conversation transcript:
${transcript}

Generate an updated session memory summary (1-2 concise sentences noting what they practiced, how smoothly they answered, and what ${workspace.companion_name} should pick up with next time), any newly mastered ${workspace.target_language} phrases, updated active practice topics, and recommended stage (1 to 4).`;

      const response = await safeGenerateContent(ai, {
        model: PRIMARY_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              last_session_summary: {
                type: Type.STRING,
                description:
                  'Updated 1-2 sentence session summary for next resume.',
              },
              new_mastered_phrases: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  'Target language phrases the user used or practiced.',
              },
              active_practice_topics: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2-3 current everyday topics for this workspace.',
              },
              recommended_stage: {
                type: Type.INTEGER,
                description: 'Recommended stage (1, 2, 3, or 4).',
              },
            },
            required: [
              'last_session_summary',
              'new_mastered_phrases',
              'active_practice_topics',
              'recommended_stage',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (error: any) {
      console.error('Error in /api/summarize-session:', error);
      res.status(500).json({
        error: error?.message || 'Failed to summarize session.',
      });
    }
  });

  // 4. Text-to-Speech Endpoint (gemini-3.8-flash-lite-tts / Aoede)
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voiceName = 'Aoede' } = req.body;
      if (!text) {
        res.status(400).json({ error: 'Missing text' });
        return;
      }

      const ai = getAiClient();
      const base64Audio = await synthesizeWavBase64(ai, text, voiceName);
      if (!base64Audio) {
        res.status(500).json({ error: 'No audio returned from TTS model' });
        return;
      }

      res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
    } catch (error: any) {
      console.error('Error in /api/tts:', error);
      res.status(500).json({
        error: error?.message || 'Failed to synthesize speech.',
      });
    }
  });

  // 5. Audio Transcription Endpoint (multimodal audio models)
  app.post('/api/transcribe', async (req, res) => {
    try {
      const {
        audioBase64,
        mimeType = 'audio/webm',
        targetLanguage = 'French',
      } = req.body;
      if (!audioBase64) {
        res.status(400).json({ error: 'Missing audioBase64' });
        return;
      }

      const ai = getAiClient();
      let transcript = '';
      const transcribeModels = [
        'gemini-2.5-flash-lite',
        'gemini-flash-lite-latest',
        'gemini-3.5-flash-lite',
      ];

      for (const model of transcribeModels) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType.split(';')[0] || 'audio/webm',
                      data: audioBase64,
                    },
                  },
                  {
                    text: `Listen to this spoken audio. The speaker may speak English, ${targetLanguage}, or a mix of both.
Transcribe exactly what was said. Return ONLY the transcribed text. If the audio is silent or unintelligible, reply with empty string.`,
                  },
                ],
              },
            ],
          });
          const raw = (response.text || '').trim();
          if (raw && !raw.toLowerCase().includes('empty') && !raw.toLowerCase().includes('silence')) {
            transcript = raw;
            break;
          }
        } catch (err: any) {
          console.warn(`Transcribe model ${model} warning:`, err?.message || err);
        }
      }

      res.json({ transcript });
    } catch (error: any) {
      console.error('Error in /api/transcribe:', error);
      res.status(500).json({
        error: error?.message || 'Failed to transcribe audio.',
      });
    }
  });

  // 6. WebSocket Server for Real-Time Full-Duplex Phone Call (gemini-3.8-live)
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(
      request.url || '',
      `http://${request.headers.host}`
    ).pathname;
    if (pathname === '/api/live-call') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: any = null;
    let isClosing = false;

    clientWs.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'init' && msg.workspace) {
          const workspace: LanguageWorkspace = msg.workspace;
          const recentTranscript: string = msg.recentTranscript || '';
          const ai = getAiClient();

          const systemInstruction =
            buildMasterSystemPrompt(workspace) +
            (recentTranscript
              ? `\n\n### RECENT THREAD CONTEXT (Pick up seamlessly from here):\n${recentTranscript}`
              : '');

          liveSession = await ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-latest',
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: workspace.voice_name || 'Aoede',
                  },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction,
            },
            callbacks: {
              onmessage: (message: LiveServerMessage) => {
                if (clientWs.readyState !== WebSocket.OPEN) return;
                const content = message.serverContent;

                if (content?.inputTranscription?.text) {
                  clientWs.send(
                    JSON.stringify({
                      type: 'input_transcript',
                      text: content.inputTranscription.text,
                    })
                  );
                }

                if (content?.outputTranscription?.text) {
                  clientWs.send(
                    JSON.stringify({
                      type: 'output_transcript',
                      text: content.outputTranscription.text,
                    })
                  );
                }

                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    clientWs.send(
                      JSON.stringify({
                        type: 'audio',
                        audio: part.inlineData.data,
                      })
                    );
                  }
                }

                if (content?.turnComplete) {
                  clientWs.send(JSON.stringify({ type: 'turn_complete' }));
                }

                if (content?.interrupted) {
                  clientWs.send(JSON.stringify({ type: 'interrupted' }));
                }
              },
              onerror: (err: any) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(
                    JSON.stringify({
                      type: 'error',
                      message: err?.message || 'Live voice stream error',
                    })
                  );
                }
              },
              onclose: () => {
                if (!isClosing && clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: 'session_closed' }));
                }
              },
            },
          });

          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'ready' }));
          }
        } else if (msg.type === 'audio' && liveSession) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'audio_end' && liveSession) {
          liveSession.sendRealtimeInput({
            audioStreamEnd: true,
          });
        } else if (msg.type === 'text_nudge' && liveSession && msg.text) {
          liveSession.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [{ text: msg.text }],
              },
            ],
            turnComplete: true,
          });
        }
      } catch (err: any) {
        console.error('WebSocket message error:', err);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(
            JSON.stringify({
              type: 'error',
              message: err?.message || 'Failed to process live call data',
            })
          );
        }
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // ignore close errors
        }
      }
    });
  });

  async function startServer() {
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else if (!process.env.VERCEL) {
      const distPath = path.join(__dirname, 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    if (!process.env.VERCEL) {
      const PORT = 3000;
      server.listen(PORT, '0.0.0.0', () => {
        console.log(`ParleLine server listening on http://0.0.0.0:${PORT}`);
      });
    }
  }

  startServer();

  export default app;
