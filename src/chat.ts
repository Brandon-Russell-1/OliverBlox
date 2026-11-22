import { speak } from './audio';

/** A character Oliver can talk to. The real personality lives on the server; these are the offline lines. */
export interface Persona {
  id: string;
  name: string;
  emoji: string;
  hello: string;
  /** Spoken when the AI is not set up or cannot be reached. */
  lines: string[];
}

export const PERSONAS: Record<string, Persona> = {
  bolt: {
    id: 'bolt',
    name: 'Bolt',
    emoji: '🤖',
    hello: 'Beep boop! What shall we do?',
    lines: [
      'Let us find more stars! Look for the beams of light.',
      'Try the magic wand on a skeleton. Zap!',
      'Can you count the trees near us?',
      'I like flying. Press the hero button!',
    ],
  },
  mage: {
    id: 'mage',
    name: 'Mira',
    emoji: '🧙',
    hello: 'Hello, young wizard! I am Mira.',
    lines: [
      'A magic word starts with the letter M. Can you think of one?',
      'Stars begin with S. Sss! What else starts with S?',
      'My wand goes zap. What sound does yours make?',
    ],
  },
  barbarian: {
    id: 'barbarian',
    name: 'Bram',
    emoji: '💪',
    hello: 'Ho there, little hero! I am Bram.',
    lines: [
      'I can lift three rocks! Then two more. How many is that?',
      'Skeletons are silly. Bonk them with your sword!',
      'Count our houses with me. One, two, three!',
    ],
  },
  druid: {
    id: 'druid',
    name: 'Fern',
    emoji: '🌿',
    hello: 'Welcome, friend. I am Fern.',
    lines: [
      'I saw a fox today. What sound does a fox make?',
      'Bunnies hop. Can you hop like a bunny?',
      'Trees drink water with their roots. What do you drink?',
    ],
  },
};

const SETTINGS_KEY = 'oliverblox-ai';
const LOG_KEY = 'oliverblox-chatlog';
const MAX_LOG_LINES = 300;

export interface AiSettings {
  url: string;
  code: string;
}

export function getAiSettings(): AiSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<AiSettings>;
    return { url: s.url ?? '', code: s.code ?? '' };
  } catch {
    return { url: '', code: '' };
  }
}

export function setAiSettings(s: AiSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ url: s.url.trim().replace(/\/+$/, ''), code: s.code.trim() }));
}

/** Everything said in chats on this device, newest last, for a grown-up to read. */
export function chatLog(): string {
  return localStorage.getItem(LOG_KEY) ?? '';
}

function log(line: string): void {
  const stamp = new Date().toLocaleString();
  const lines = chatLog().split('\n').filter(Boolean);
  lines.push(`[${stamp}] ${line}`);
  try {
    localStorage.setItem(LOG_KEY, lines.slice(-MAX_LOG_LINES).join('\n'));
  } catch {
    // Storage full: the chat still works, it just is not logged.
  }
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

interface Recognizer {
  lang: string;
  onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
}

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** The talk panel: speak or type to a character and hear the answer. */
export class Chat {
  private persona: Persona | null = null;
  private histories = new Map<string, Turn[]>();
  private busy = false;
  private readonly panel = $('chat');
  private readonly who = $('chat-who');
  private readonly text = $('chat-text');
  private readonly inputEl = $<HTMLInputElement>('chat-input');
  private readonly mic = $('chat-mic');
  /** Extra facts about the game sent with each message, e.g. how many stars he has. */
  context: () => Record<string, number> = () => ({});

  constructor() {
    $('chat-close').addEventListener('click', () => this.close());
    $('chat-send').addEventListener('click', () => this.submit());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit();
    });

    const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
    const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Recognition) {
      this.mic.hidden = true;
    } else {
      this.mic.addEventListener('click', () => {
        if (this.busy) return;
        speechSynthesis?.cancel();
        const rec = new Recognition();
        rec.lang = 'en-US';
        this.mic.classList.add('on');
        const done = (): void => this.mic.classList.remove('on');
        rec.onend = done;
        rec.onerror = done;
        rec.onresult = (e) => void this.send(e.results[0][0].transcript);
        try {
          rec.start();
        } catch {
          done();
        }
      });
    }
  }

  get isOpen(): boolean {
    return this.persona !== null;
  }

  open(persona: Persona): void {
    this.persona = persona;
    this.panel.hidden = false;
    this.who.textContent = `${persona.emoji} ${persona.name}`;
    this.say(persona.hello);
  }

  close(): void {
    this.persona = null;
    this.panel.hidden = true;
    this.inputEl.blur();
  }

  private say(reply: string): void {
    this.text.textContent = reply;
    speak(reply);
  }

  private submit(): void {
    const message = this.inputEl.value.trim();
    this.inputEl.value = '';
    if (message) void this.send(message);
  }

  private async send(message: string): Promise<void> {
    const persona = this.persona;
    if (!persona || this.busy) return;
    this.busy = true;
    this.text.textContent = '💭';
    log(`Oliver to ${persona.name}: ${message}`);

    const history = this.histories.get(persona.id) ?? [];
    history.push({ role: 'user', content: message.slice(0, 300) });
    let reply = '';
    const { url, code } = getAiSettings();
    if (url) {
      try {
        const res = await fetch(`${url}/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-family-code': code },
          body: JSON.stringify({ character: persona.id, messages: history.slice(-12), context: this.context() }),
        });
        if (res.ok) reply = ((await res.json()) as { reply?: string }).reply ?? '';
        else log(`(AI error ${res.status} from ${persona.name})`);
      } catch {
        log(`(could not reach the AI for ${persona.name})`);
      }
    }
    if (reply) {
      history.push({ role: 'assistant', content: reply });
    } else {
      // No AI configured or it failed: fall back to a scripted line and forget the unanswered turn.
      history.pop();
      reply = persona.lines[Math.floor(Math.random() * persona.lines.length)];
    }
    this.histories.set(persona.id, history.slice(-12));
    log(`${persona.name}: ${reply}`);
    this.busy = false;
    if (this.persona === persona) this.say(reply);
  }
}

/** Wire up the grown-ups panel: AI connection, chat transcript and the erase button. */
export function setupParentPanel(onErase: () => void): () => void {
  const panel = $('parent');
  const url = $<HTMLInputElement>('ai-url');
  const code = $<HTMLInputElement>('ai-code');
  const transcript = $<HTMLTextAreaElement>('ai-log');
  $('parent-save').addEventListener('click', () => {
    setAiSettings({ url: url.value, code: code.value });
    panel.hidden = true;
  });
  $('parent-close').addEventListener('click', () => {
    panel.hidden = true;
  });
  $('parent-erase').addEventListener('click', () => {
    if (window.confirm('Start over? This erases the blocks built, the stars found and where you are.')) onErase();
  });
  return () => {
    const s = getAiSettings();
    url.value = s.url;
    code.value = s.code;
    transcript.value = chatLog() || 'No chats yet.';
    panel.hidden = false;
  };
}
