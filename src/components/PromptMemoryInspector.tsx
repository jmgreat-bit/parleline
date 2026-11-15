import React, { useState } from 'react';
import { Copy, Check, X, Terminal, Database, Sparkles, BookOpen } from 'lucide-react';
import { LanguageWorkspace, UserMemoryState } from '../types';
import { buildMasterSystemPrompt } from '../prompts';

interface PromptMemoryInspectorProps {
  isOpen: boolean;
  memoryState: UserMemoryState;
  activeWorkspace: LanguageWorkspace;
  onUpdateWorkspace: (updated: Partial<LanguageWorkspace>) => void;
  onClose: () => void;
}

export const PromptMemoryInspector: React.FC<PromptMemoryInspectorProps> = ({
  isOpen,
  memoryState,
  activeWorkspace,
  onUpdateWorkspace,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'prompt' | 'memory'>('prompt');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(activeWorkspace.last_session_summary);
  const [newPhraseInput, setNewPhraseInput] = useState('');

  if (!isOpen) return null;

  const interpolatedPrompt = buildMasterSystemPrompt(activeWorkspace);
  const formattedJson = JSON.stringify(memoryState, null, 2);

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(interpolatedPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(formattedJson);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleSaveSummary = () => {
    onUpdateWorkspace({
      last_session_summary: summaryDraft,
      updated_at: new Date().toISOString(),
    });
  };

  const handleAddPhrase = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPhraseInput.trim();
    if (!trimmed) return;
    if (!activeWorkspace.mastered_phrases.includes(trimmed)) {
      onUpdateWorkspace({
        mastered_phrases: [...activeWorkspace.mastered_phrases, trimmed],
      });
    }
    setNewPhraseInput('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#181614] border border-white/15 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl text-[#EDE8DF]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base sm:text-lg font-serif font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>Bilingual Memory &amp; System Prompt Inspector</span>
            </h2>
            <p className="text-xs text-[#9E978C] mt-0.5">
              Live partitioned state for{' '}
              <span className="font-semibold text-emerald-400">
                {activeWorkspace.target_language} (Stage {activeWorkspace.current_stage})
              </span>{' '}
              · Memory never bleeds between languages
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setActiveTab('prompt')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'prompt'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-[#9E978C] hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                Master Prompt
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('memory')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'memory'
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'text-[#9E978C] hover:text-white'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                Workspace JSON
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#9E978C] hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab 1: Master System Prompt */}
        {activeTab === 'prompt' && (
          <div className="flex-1 overflow-hidden flex flex-col p-6">
            <div className="flex items-center justify-between pb-3 text-xs text-[#9E978C]">
              <span>Dynamically injected system prompt sent to Gemini on every turn:</span>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedPrompt ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy System Prompt
                  </>
                )}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-[#100F0E] p-4 rounded-xl border border-white/10 font-mono text-xs text-[#D1C9BA] leading-relaxed whitespace-pre-wrap select-text">
              {interpolatedPrompt}
            </div>
          </div>
        )}

        {/* Tab 2: Partitioned Memory JSON */}
        {activeTab === 'memory' && (
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/10">
            {/* Live Editor */}
            <div className="w-full md:w-80 p-5 overflow-y-auto space-y-4 text-xs shrink-0 bg-[#141210]">
              <h3 className="font-semibold text-white">Live Memory Controls</h3>

              <div>
                <label className="text-[11px] text-[#9E978C] block mb-1">
                  Active Stage (1 to 4)
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() =>
                        onUpdateWorkspace({
                          current_stage: num as any,
                          grammar_unlocked: num === 4,
                        })
                      }
                      className={`py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                        activeWorkspace.current_stage === num
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'bg-white/5 border-white/10 text-[#9E978C] hover:text-white'
                      }`}
                    >
                      S{num}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-[#9E978C] block mb-1">
                  Last Session Summary
                </label>
                <textarea
                  value={summaryDraft}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  rows={4}
                  className="w-full bg-[#1A1816] border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleSaveSummary}
                  className="mt-1.5 px-3 py-1 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-medium cursor-pointer"
                >
                  Save Summary
                </button>
              </div>

              <div>
                <label className="text-[11px] text-[#9E978C] block mb-1">
                  Mastered Phrases ({activeWorkspace.mastered_phrases.length})
                </label>
                <div className="flex flex-wrap gap-1 mb-2 max-h-32 overflow-y-auto">
                  {activeWorkspace.mastered_phrases.map((phrase, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 rounded-md text-[11px]"
                    >
                      {phrase}
                    </span>
                  ))}
                </div>
                <form onSubmit={handleAddPhrase} className="flex gap-1.5">
                  <input
                    type="text"
                    value={newPhraseInput}
                    onChange={(e) => setNewPhraseInput(e.target.value)}
                    placeholder="Add phrase..."
                    className="flex-1 bg-[#1A1816] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-500 cursor-pointer"
                  >
                    Add
                  </button>
                </form>
              </div>
            </div>

            {/* Raw JSON View */}
            <div className="flex-1 p-5 overflow-hidden flex flex-col bg-[#100F0E]">
              <div className="flex items-center justify-between pb-2 text-xs text-[#9E978C]">
                <span>State Tree (`localStorage` isolated by workspace ID):</span>
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedJson ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy JSON
                    </>
                  )}
                </button>
              </div>
              <pre className="flex-1 overflow-y-auto p-4 rounded-xl bg-[#0B0A09] border border-white/10 font-mono text-xs text-emerald-400 leading-relaxed select-text">
                {formattedJson}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
