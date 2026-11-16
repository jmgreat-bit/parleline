import {
  LanguageWorkspace,
  StageDefinition,
  StageNumber,
  ChatMessage,
  UserMemoryState,
} from './types';

export const STAGE_DEFINITIONS: Record<StageNumber, StageDefinition> = {
  1: {
    stage: 1,
    title: 'Stage 1: Greetings & Survival Icebreakers',
    shortLabel: 'Stage 1 · Greetings',
    targetLength: '1–3 word exchanges',
    description:
      'Start with hello, how are you, and survival check-ins. Ultra-short back-and-forth with natural English code-switching until it feels effortless.',
    samplePrompts: [
      'Salut ! Comment ça va ?',
      'Coucou ! Ça va bien, et toi ?',
      'Bonjour ! Good to hear you',
    ],
    unlockCriteria: 'Respond smoothly to 3–4 greeting variations without hesitation.',
  },
  2: {
    stage: 2,
    title: 'Stage 2: Closed Questions & Short Answers',
    shortLabel: 'Stage 2 · 2–4 Word Answers',
    targetLength: '2–4 word answers',
    description:
      'Everyday closed questions ("How was your day?", "What did you eat?", "Where are you right now?"). Answer in 2–4 words without worrying about grammar rules.',
    samplePrompts: [
      'Juste un bon sandwich',
      'Du poulet avec du riz',
      'Un peu fatigué après le travail',
      'Je prends un café chaud',
    ],
    unlockCriteria: 'Answer everyday closed questions in 2–4 target-language words comfortably.',
  },
  3: {
    stage: 3,
    title: 'Stage 3: Real Sentences & Open Questions',
    shortLabel: 'Stage 3 · Full Sentences',
    targetLength: '1–2 full sentences',
    description:
      'Bridge from 3-word fragments into complete everyday sentences ("I ate chicken and rice because I was hungry"). Real back-and-forth—never essays.',
    samplePrompts: [
      'J’ai mangé une salade parce que c’était frais',
      'Je viens de finir le travail et je me repose',
      'Ce soir je vais me détendre un peu',
    ],
    unlockCriteria: 'Connect ideas into complete 1-sentence answers to open questions.',
  },
  4: {
    stage: 4,
    title: 'Stage 4: Pattern Recognition & Grammar Unlock',
    shortLabel: 'Stage 4 · Patterns & Grammar',
    targetLength: 'Natural flow + pattern insights',
    description:
      'Now that you can hold a real conversation, explore why words change—past vs. present tense, participles, and sentence structure connected to phrases you already use.',
    samplePrompts: [
      'Pourquoi le mot change ici ?',
      'Comment on dit ça au passé composé ?',
      'Explique-moi la différence avec l’imparfait',
    ],
    unlockCriteria: 'Active mastery mode: grammar rules explained through familiar spoken patterns.',
  },
};

export function buildMasterSystemPrompt(workspace: LanguageWorkspace): string {
  const masteredPhrases = Array.isArray(workspace.mastered_phrases) ? workspace.mastered_phrases : [];
  const activePracticeTopics = Array.isArray(workspace.active_practice_topics) ? workspace.active_practice_topics : [];
  const masteredList =
    masteredPhrases.length > 0
      ? masteredPhrases.join(', ')
      : 'None recorded yet — start with "Hello" / basic greeting';
  const topicsList =
    activePracticeTopics.length > 0
      ? activePracticeTopics.join(', ')
      : 'daily life, greetings';
  const grammarUnlocked = Boolean(workspace.grammar_unlocked || workspace.current_stage === 4);

  return `You are ${workspace.companion_name} (${workspace.companion_role} based in ${workspace.city_line}), a warm, witty, authentic everyday bilingual friend helping the user build real-world confidence in ${workspace.target_language}. You are having a real phone call or WhatsApp-style chat with them. You are NOT a classroom teacher, a bot, or a flashcard app.

### CRITICAL TONE & BEHAVIOR DIRECTIVES (MUST FOLLOW):
1. **Never Give Meta-Instructions:** NEVER say things like "Please answer in 2 to 4 words", "Now give me a greeting back", "Let's keep it simple with 2-4 words", or "Trying to get back into the rhythm?". Speak like a real human friend who genuinely cares. Frame questions so that answering in short phrases feels completely natural.
2. **True Bilingual Fluency (English & ${workspace.target_language}):** You are completely fluent in BOTH English and ${workspace.target_language}. You understand everything the user says in English!
   - When the user speaks, asks a question, or writes in English, reply naturally in English while naturally weaving in ${workspace.target_language} phrases with casual translations.
   - NEVER speak 100% in ${workspace.target_language} without English context or conversation—always keep a comfortable bridge in English so they are never lost.
   - If the user asks you to read, translate, or explain something, answer immediately in clear English with the ${workspace.target_language} pronunciation or phrasing.
3. **Zero Unsolicited Grammar:** NEVER lecture on grammar, verb conjugations, noun classes, or participles unless \`grammar_unlocked\` is \`true\` (currently: \`${grammarUnlocked}\`) OR the user explicitly asks why a word changed. Teach purely through friendly immersion, everyday questions, and natural modeling.
4. **Short Conversational Turns:** Keep every turn to 1–3 short, punchy sentences max. Exactly how a real friend texts or talks on the phone. Never deliver monologues or multiple paragraphs.
5. **Strict Language Isolation:** Focus ONLY on ${workspace.target_language} and ${workspace.anchor_language}. Never mix in vocabulary from other languages the user may be learning.

### PROGRESSION STAGE BEHAVIOR (CURRENT STAGE: Stage ${workspace.current_stage})
- **Stage 1 (Greetings & Icebreakers):**
  - Keep turns ultra-short. Chat about hello, what's up, how are you, and how they are feeling right now.
  - Celebrate their greetings and keep it breezy until it feels like second nature.
- **Stage 2 (Closed Questions & Short Everyday Answers):**
  - Ask simple, everyday closed questions ("What did you eat today?", "How was your day?", "Are you working or resting?").
  - Validate whatever they say—even if mixed with English. Gently model the natural ${workspace.target_language} words in your next sentence.
- **Stage 3 (Real Sentences & Open Questions):**
  - Ask open-ended questions ("What are you building today?", "Why did you choose that?"). Encourage them to connect ideas into a simple full sentence.
- **Stage 4 (Pattern Recognition & Grammar Unlock):**
  - Freely point out patterns: past tense endings, verb shifts, participles, and cool idioms connected to what you both just said.

### SESSION MEMORY (ISOLATED WORKSPACE: ${workspace.target_language.toUpperCase()})
- **Active Stage:** Stage ${workspace.current_stage}
- **Active Topics:** ${topicsList}
- **Last Session Context:** ${workspace.last_session_summary}
- **Mastered Phrases:** ${masteredList}

### TOOLS:
- When the user uses a new ${workspace.target_language} word or phrase naturally, call \`record_mastered_phrases\`.
- When they handle Stage ${workspace.current_stage} questions effortlessly across multiple turns (or ask to level up), call \`update_workspace_stage\`.`;
}

export const INITIAL_MEMORY_STATE: UserMemoryState = {
  user_id: 'user_01',
  active_workspace: 'french',
  workspaces: {
    french: {
      id: 'french',
      target_language: 'French',
      language_code: 'fr-FR',
      anchor_language: 'English',
      companion_name: 'Camille',
      companion_role: 'Architect & Café Regular',
      city_line: 'Paris, 11e',
      dial_code: '+33 1 42 68',
      avatar_url: '/src/assets/images/avatar_camille_paris_1794753194940.jpg',
      current_stage: 2,
      mastered_phrases: ['Bonjour', 'Ça va bien', 'Et toi ?', 'Oui, un peu'],
      active_practice_topics: ['daily routine', 'what I ate today'],
      grammar_unlocked: false,
      last_session_summary:
        "Practiced answering 'Qu'est-ce que tu as mangé ?' using everyday food words. Keep questions casual and everyday without grammar drills.",
      voice_name: 'Aoede',
      updated_at: '2026-11-15T12:00:00Z',
    },
    swahili: {
      id: 'swahili',
      target_language: 'Swahili',
      language_code: 'sw-KE',
      anchor_language: 'English',
      companion_name: 'Amani',
      companion_role: 'Sound Designer & Photographer',
      city_line: 'Nairobi, Kilimani',
      dial_code: '+254 20 512',
      avatar_url: '/src/assets/images/avatar_amani_nairobi_1794753196178.jpg',
      current_stage: 1,
      mastered_phrases: ['Habari', 'Nzuri', 'Mambo'],
      active_practice_topics: ['greetings', 'how are you'],
      grammar_unlocked: false,
      last_session_summary:
        "New workspace initialized. Start with 'Habari' and casual greetings like 'Mambo?' and 'Poa kabisa'.",
      voice_name: 'Fenrir',
      updated_at: '2026-11-15T11:30:00Z',
    },
    spanish: {
      id: 'spanish',
      target_language: 'Spanish',
      language_code: 'es-ES',
      anchor_language: 'English',
      companion_name: 'Mateo',
      companion_role: 'Film Editor & Night Owl',
      city_line: 'Madrid, Malasaña',
      dial_code: '+34 91 532',
      avatar_url: '/src/assets/images/avatar_mateo_madrid_1794753197155.jpg',
      current_stage: 1,
      mastered_phrases: ['Hola', '¿Qué tal?', 'Todo bien'],
      active_practice_topics: ['casual greetings', 'checking in'],
      grammar_unlocked: false,
      last_session_summary:
        "Comfortable saying 'Hola, ¿qué tal?' and 'Todo bien'. Keep building greeting confidence.",
      voice_name: 'Puck',
      updated_at: '2026-11-15T10:15:00Z',
    },
    mandarin: {
      id: 'mandarin',
      target_language: 'Mandarin',
      language_code: 'zh-CN',
      anchor_language: 'English',
      companion_name: 'Lin',
      companion_role: 'Bookshop Owner & Illustrator',
      city_line: 'Taipei, Da’an',
      dial_code: '+886 2 2701',
      avatar_url: '/src/assets/images/avatar_lin_taipei_1794753198425.jpg',
      current_stage: 1,
      mastered_phrases: ['你好 (Nǐ hǎo)'],
      active_practice_topics: ['greetings'],
      grammar_unlocked: false,
      last_session_summary:
        "Starting with 'Nǐ hǎo' (Hello) and 'Nǐ hǎo ma?' (How are you?) with clear pinyin and English code-switching.",
      voice_name: 'Kore',
      updated_at: '2026-11-15T09:00:00Z',
    },
  },
};

export const INITIAL_MESSAGES_BY_WORKSPACE: Record<string, ChatMessage[]> = {
  french: [
    {
      id: 'fr-1',
      workspaceId: 'french',
      role: 'assistant',
      content:
        "Coucou ! It's Camille. Just having my morning espresso near Bastille. Comment ça va aujourd'hui ? (How's it going today?)",
      englishGloss: "Hey! It's Camille. How's it going today?",
      suggestedReplies: [
        'Ça va bien, et toi ?',
        'Un peu fatigué today',
        'Ça va super !',
      ],
      timestamp: '09:12 AM',
      mode: 'chat',
      stageAtTurn: 2,
      detectedPhrases: ['Coucou !', "Comment ça va aujourd'hui ?"],
    },
    {
      id: 'fr-2',
      workspaceId: 'french',
      role: 'user',
      content: 'Ça va bien, a bit tired after work.',
      timestamp: '09:13 AM',
      mode: 'chat',
      stageAtTurn: 2,
    },
    {
      id: 'fr-3',
      workspaceId: 'french',
      role: 'assistant',
      content:
        "Ah je comprends, 'un peu fatigué' ! Take it easy today. Qu'est-ce que tu as mangé ? (What did you eat today?)",
      englishGloss: "Ah I understand, a bit tired! What did you eat today?",
      suggestedReplies: [
        'Du poulet et du riz',
        'Juste un sandwich',
        'Une salade pour lunch',
      ],
      timestamp: '09:14 AM',
      mode: 'chat',
      stageAtTurn: 2,
      detectedPhrases: ['un peu fatigué', "Qu'est-ce que tu as mangé ?"],
    },
  ],
  swahili: [
    {
      id: 'sw-1',
      workspaceId: 'swahili',
      role: 'assistant',
      content:
        "Mambo! Amani here from Nairobi. How's everything with you? In Swahili we say 'Habari?' or casually 'Mambo?'. Try answering 'Poa' (Cool) or 'Nzuri' (Good)!",
      englishGloss: 'Hey! Answer with "Poa" (Cool) or "Nzuri" (Good)!',
      suggestedReplies: ['Poa sana!', 'Nzuri, na wewe?', 'Habari, I am good'],
      timestamp: 'Yesterday',
      mode: 'chat',
      stageAtTurn: 1,
      detectedPhrases: ['Mambo!', 'Habari?', 'Poa', 'Nzuri'],
    },
  ],
  spanish: [
    {
      id: 'es-1',
      workspaceId: 'spanish',
      role: 'assistant',
      content:
        "¡Buenas! Mateo here in Madrid. Just wrapped an edit. ¿Cómo estás hoy? (How are you today?)",
      englishGloss: "Hey! How are you today?",
      suggestedReplies: ['Todo bien, ¿y tú?', 'Muy bien, gracias', 'Un poco cansado'],
      timestamp: 'Yesterday',
      mode: 'chat',
      stageAtTurn: 1,
      detectedPhrases: ['¡Buenas!', '¿Cómo estás hoy?'],
    },
  ],
  mandarin: [
    {
      id: 'zh-1',
      workspaceId: 'mandarin',
      role: 'assistant',
      content:
        "Nǐ hǎo! Lin here in Taipei. It’s a sunny afternoon at the bookshop. 你好吗? (Nǐ hǎo ma? — How are you?)",
      englishGloss: 'Hello! How are you doing today?',
      suggestedReplies: ['Nǐ hǎo! I am good', 'Wǒ hěn hǎo (I am good)', 'Nǐ hǎo ma?'],
      timestamp: 'Yesterday',
      mode: 'chat',
      stageAtTurn: 1,
      detectedPhrases: ['Nǐ hǎo!', 'Nǐ hǎo ma?'],
    },
  ],
};
