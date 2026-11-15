import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { UserMemoryState, ChatMessage, LanguageWorkspace } from './types';
import { INITIAL_MEMORY_STATE, INITIAL_MESSAGES_BY_WORKSPACE } from './prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.VERCEL
  ? path.join('/tmp', 'parleline_data')
  : path.resolve(__dirname, '../data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');

export interface UserAccount {
  id: string;
  name: string;
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

export interface CallRecord {
  id: string;
  workspaceId: string;
  companionName: string;
  durationSeconds: number;
  stageAtCall: number;
  summary: string;
  phrasesMastered: string[];
  transcriptTurnsCount: number;
  timestamp: string;
}

export interface UserSavedData {
  userId: string;
  memoryState: UserMemoryState;
  messagesByWorkspace: Record<string, ChatMessage[]>;
  callLogs: CallRecord[];
  updatedAt: string;
}

function loadUsers(): UserAccount[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading users file:', err);
  }
  return [];
}

function saveUsers(users: UserAccount[]) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function registerUser(name: string, username: string, password: string): { user: UserAccount; token: string } {
  const users = loadUsers();
  const cleanUsername = username.trim().toLowerCase();

  if (users.some((u) => u.username === cleanUsername)) {
    throw new Error('Username already exists. Please choose another or log in.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const newUser: UserAccount = {
    id,
    name: name.trim() || 'Learner',
    username: cleanUsername,
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers(users);

  // Initialize fresh user data with default workspaces
  const initialData: UserSavedData = {
    userId: id,
    memoryState: {
      ...INITIAL_MEMORY_STATE,
      user_id: id,
    },
    messagesByWorkspace: INITIAL_MESSAGES_BY_WORKSPACE,
    callLogs: [],
    updatedAt: new Date().toISOString(),
  };

  saveUserData(id, initialData);

  const token = createSessionToken(id);
  return { user: newUser, token };
}

export function loginUser(username: string, password: string): { user: UserAccount; token: string } {
  const users = loadUsers();
  const cleanUsername = username.trim().toLowerCase();
  const user = users.find((u) => u.username === cleanUsername);

  if (!user) {
    throw new Error('Account not found with this username.');
  }

  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    throw new Error('Incorrect password. Please try again.');
  }

  const token = createSessionToken(user.id);
  return { user, token };
}

// In-memory session store
const SESSIONS: Map<string, { userId: string; expiresAt: number }> = new Map();

function createSessionToken(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  SESSIONS.set(token, { userId, expiresAt });
  return token;
}

export function verifySessionToken(token: string): string | null {
  if (!token) return null;
  const sess = SESSIONS.get(token);
  if (!sess) return null;
  if (Date.now() > sess.expiresAt) {
    SESSIONS.delete(token);
    return null;
  }
  return sess.userId;
}

export function getUserById(id: string): UserAccount | null {
  const users = loadUsers();
  return users.find((u) => u.id === id) || null;
}

function getUserDataFilePath(userId: string): string {
  return path.join(DATA_DIR, `data_${userId}.json`);
}

export function getUserData(userId: string): UserSavedData {
  const filePath = getUserDataFilePath(userId);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading user data file:', err);
  }

  // Fallback to initial state
  const fallbackData: UserSavedData = {
    userId,
    memoryState: {
      ...INITIAL_MEMORY_STATE,
      user_id: userId,
    },
    messagesByWorkspace: INITIAL_MESSAGES_BY_WORKSPACE,
    callLogs: [],
    updatedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(filePath, JSON.stringify(fallbackData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing fallback user data:', err);
  }
  return fallbackData;
}

export function saveUserData(userId: string, data: Partial<UserSavedData>) {
  const filePath = getUserDataFilePath(userId);
  let current: UserSavedData;
  try {
    if (fs.existsSync(filePath)) {
      current = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } else {
      current = {
        userId,
        memoryState: { ...INITIAL_MEMORY_STATE, user_id: userId },
        messagesByWorkspace: INITIAL_MESSAGES_BY_WORKSPACE,
        callLogs: [],
        updatedAt: new Date().toISOString(),
      };
    }
  } catch {
    current = {
      userId,
      memoryState: { ...INITIAL_MEMORY_STATE, user_id: userId },
      messagesByWorkspace: INITIAL_MESSAGES_BY_WORKSPACE,
      callLogs: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const updated: UserSavedData = {
    ...current,
    ...data,
    userId,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

export function logCallRecord(userId: string, record: Omit<CallRecord, 'id' | 'timestamp'>): CallRecord {
  const current = getUserData(userId);
  const newRecord: CallRecord = {
    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ...record,
    timestamp: new Date().toISOString(),
  };

  const updatedLogs = [newRecord, ...(current.callLogs || [])];

  // Also update last_session_summary on the active workspace so the companion picks up context
  const ws = current.memoryState.workspaces[record.workspaceId];
  if (ws) {
    const mins = Math.floor(record.durationSeconds / 60);
    const secs = record.durationSeconds % 60;
    const durationLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    ws.last_session_summary = `Completed a ${durationLabel} phone call. Practiced: ${record.summary}. Newly mastered phrases: ${record.phrasesMastered.join(', ') || 'greetings'}.`;
    ws.mastered_phrases = Array.from(new Set([...ws.mastered_phrases, ...record.phrasesMastered]));
  }

  saveUserData(userId, {
    ...current,
    callLogs: updatedLogs,
    memoryState: current.memoryState,
  });

  return newRecord;
}
