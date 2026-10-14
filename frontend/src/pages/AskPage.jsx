import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircleQuestion, Send, User, Clock, Hash, FileText,
  Sparkles, HelpCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ConfidenceLevelBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState } from '../components/ui/States';
import * as api from '../lib/api';

const EXAMPLE_QUESTIONS = [
  'What was decided about the launch date?',
  'Who is responsible for the API spec?',
  'What are the current blockers?',
  'Has the storage decision changed?',
  'What happened with the legal review?',
];

export default function AskPage() {
  const [question, setQuestion] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversations]);

  const ask = useCallback(async (q) => {
    const text = (q || question).trim();
    if (!text) return;

    setError(null);
    setLoading(true);
    setQuestion('');
    setConversations(prev => [...prev, { type: 'question', text }]);

    try {
      const data = await api.askQuestion(text);
      setConversations(prev => [...prev, { type: 'answer', data }]);
    } catch (e) {
      setError(e);
      setConversations(prev => [...prev, { type: 'error', error: e }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [question]);

  const handleSubmit = (e) => {
    e.preventDefault();
    ask();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-indigo/20 to-accent-violet/20 border border-accent-indigo/10 mb-4">
              <MessageCircleQuestion size={28} className="text-accent-indigo" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary mb-1">Ask Your Meetings</h2>
            <p className="text-sm text-text-muted mb-6 text-center max-w-md">
              Ask questions about your analyzed meetings. The AI will search across all stored transcripts, decisions, and action items.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {EXAMPLE_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => { setQuestion(q); ask(q); }}
                  className="px-3 py-1.5 rounded-full text-xs bg-bg-tertiary border border-border-primary text-text-secondary hover:text-text-primary hover:border-accent-indigo/30 hover:bg-accent-indigo/5 transition-colors"
                >
                  <HelpCircle size={10} className="inline mr-1" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {conversations.map((msg, i) => {
              if (msg.type === 'question') {
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-accent-indigo text-white text-sm">
                      {msg.text}
                    </div>
                  </motion.div>
                );
              }
              if (msg.type === 'error') {
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="max-w-[85%] px-4 py-3 rounded-2xl rounded-bl-sm bg-accent-rose/10 border border-accent-rose/20 text-sm text-accent-rose">
                      <p className="font-medium">{msg.error.message}</p>
                      {msg.error.detail?.hint && (
                        <p className="text-xs opacity-75 mt-1">{msg.error.detail.hint}</p>
                      )}
                    </div>
                  </motion.div>
                );
              }
              if (msg.type === 'answer') {
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <AnswerCard data={msg.data} />
                  </motion.div>
                );
              }
              return null;
            })}
          </AnimatePresence>
        )}

        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-bg-card border border-border-primary">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Sparkles size={14} className="text-accent-indigo animate-pulse" />
                Searching across meetings…
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-4 border-t border-border-primary">
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Ask about your meetings..."
          className="flex-1 px-4 py-2.5 rounded-xl bg-bg-input border border-border-primary text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent-indigo focus:ring-1 focus:ring-accent-indigo/30 transition-colors outline-none"
          disabled={loading}
          aria-label="Question input"
        />
        <Button type="submit" disabled={!question.trim() || loading} loading={loading}>
          <Send size={16} />
        </Button>
      </form>
    </div>
  );
}

function AnswerCard({ data }) {
  return (
    <div className="max-w-[85%] space-y-3">
      <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-bg-card border border-border-primary">
        <div className="flex items-center gap-2 mb-2">
          <ConfidenceLevelBadge level={data.confidence} />
        </div>
        <p className="text-sm text-text-primary leading-relaxed">{data.answer}</p>
      </div>

      {data.citations?.length > 0 && (
        <div className="px-4 py-3 rounded-xl bg-bg-card border border-border-primary">
          <h4 className="text-xs font-medium text-text-muted mb-2 flex items-center gap-1.5">
            <FileText size={12} />
            Citations ({data.citations.length})
          </h4>
          <div className="space-y-2">
            {data.citations.map((c, i) => (
              <div key={i} className="p-2.5 rounded-lg bg-bg-primary/50 border border-border-primary text-xs">
                <div className="flex flex-wrap items-center gap-2 mb-1 text-text-muted">
                  <span className="flex items-center gap-1">
                    <User size={10} />
                    <span className="text-text-secondary font-medium">{c.speaker || 'Unknown'}</span>
                  </span>
                  {c.timestamp && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {c.timestamp}
                    </span>
                  )}
                  {c.passage_id && (
                    <span className="flex items-center gap-1">
                      <Hash size={10} />
                      {c.passage_id}
                    </span>
                  )}
                  {(c.meeting_title || c.meeting_id) && (
                    <span className="flex items-center gap-1">
                      <FileText size={10} />
                      {c.meeting_title || c.meeting_id}
                    </span>
                  )}
                </div>
                <p className="text-text-secondary leading-relaxed">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
