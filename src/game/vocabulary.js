import { VOCABULARY } from './levelData.js';

const STORAGE_KEY = 'operation-hebrew-vocabulary-v1';
const safeRead = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
};

export function getReviewedWords() {
  return new Set(Array.isArray(safeRead()) ? safeRead() : []);
}

export function markReviewed(id) {
  const words = getReviewedWords();
  words.add(id);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...words])); } catch { /* Private browsing may disable storage. */ }
}

export function speakHebrew(id) {
  const word = VOCABULARY.find((entry) => entry.id === id);
  if (!word || !('speechSynthesis' in window)) return false;
  const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.lang.toLowerCase().startsWith('he'));
  if (!voice) return false;
  const utterance = new SpeechSynthesisUtterance(word.hebrew);
  utterance.lang = 'he-IL';
  utterance.voice = voice;
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
  return true;
}
