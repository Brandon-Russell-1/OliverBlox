import { speak, sfx, listVoices, getVoiceName, setVoiceName, stopSpeaking, ONLINE_VOICE, type VoiceStyle } from './audio';
import { getPlayerName } from './profile';

/** A character Oliver can talk to. The real personality lives on the server; these are the offline lines. */
export interface Persona {
  id: string;
  name: string;
  emoji: string;
  voice: VoiceStyle;
  hello: string;
  /** Spoken when the AI is not set up or cannot be reached. */
  lines: string[];
}

export const PERSONAS: Record<string, Persona> = {
  bolt: {
    id: 'bolt',
    name: 'Bolt',
    emoji: '🤖',
    voice: { pitch: 1.7, rate: 1.05 },
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
    voice: { pitch: 1.3, rate: 0.95 },
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
    voice: { pitch: 0.5, rate: 0.9 },
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
    voice: { pitch: 1.0, rate: 0.85 },
    hello: 'Welcome, friend. I am Fern.',
    lines: [
      'I saw a fox today. What sound does a fox make?',
      'Bunnies hop. Can you hop like a bunny?',
      'Trees drink water with their roots. What do you drink?',
    ],
  },
  nova: {
    id: 'nova',
    name: 'Nova',
    emoji: '🤖',
    voice: { pitch: 1.5, rate: 1 },
    hello: 'Hi! I am Nova, your computer friend. What shall we do?',
    lines: ['Ooh, I think I can see a star over there!', 'Let us look for stars together.', 'Magic starts with M. Mmm!'],
  },
  rex: {
    id: 'rex',
    name: 'Rex',
    emoji: '🤖',
    voice: { pitch: 0.7, rate: 0.95 },
    hello: 'Hello! I am Rex, your computer friend. I will keep you safe!',
    lines: ['Any skeletons about? I will bonk them!', 'Stay close and I will guard you.', 'I have bonked lots today. How many have you?'],
  },
  zip: {
    id: 'zip',
    name: 'Zip',
    emoji: '🤖',
    voice: { pitch: 1.25, rate: 1.1 },
    hello: 'Hey! I am Zip, your computer friend. Want to explore?',
    lines: ['I wonder what is over that hill.', 'Shall we go fishing?', 'I saw a fox! Did you see it?'],
  },
  luna: {
    id: 'luna',
    name: 'Luna',
    emoji: '🤖',
    voice: { pitch: 1.35, rate: 0.9 },
    hello: 'Hello. I am Luna, your computer friend. Shall we look for animals?',
    lines: ['The moon is so pretty tonight.', 'I saw a panda! What colours is a panda?', 'Shall we sit and fish for a while?'],
  },
  max: {
    id: 'max',
    name: 'Max',
    emoji: '🤖',
    voice: { pitch: 0.6, rate: 1 },
    hello: 'Ho ho! I am Max, your computer friend. Let us bonk some skeletons!',
    lines: ['One bonk, two bonks, three bonks!', 'One day I will fly a rocket to the moon.', 'Show me your biggest jump!'],
  },
  pip: {
    id: 'pip',
    name: 'Pip',
    emoji: '🤖',
    voice: { pitch: 1.7, rate: 1.15 },
    hello: 'Psst! I am Pip, your computer friend. I know where the stars hide.',
    lines: ['Star rhymes with car. And jar!', 'Shh. I think there is treasure near.', 'Catch me if you can!'],
  },
  guard: {
    id: 'guard',
    name: 'Gus',
    emoji: '🛡️',
    voice: { pitch: 0.8, rate: 0.95 },
    hello: 'Halt! Oh, it is you. Hello, hero!',
    lines: [
      'I keep the village safe. The fort has a giant skeleton!',
      'Left, right, left, right. Can you march with me?',
      'How many hearts do you have? Count them!',
    ],
  },
  ranger: {
    id: 'ranger',
    name: 'Robin',
    emoji: '🏹',
    voice: { pitch: 1.15, rate: 1 },
    hello: 'Hi there! I am Robin. I know these woods.',
    lines: [
      'Gold chests hide out in the wilds. Keep your eyes open!',
      'Look at your map. The little house shows the way home.',
      'Which is bigger, a deer or a bunny?',
    ],
  },
  tinker: {
    id: 'tinker',
    name: 'Tess',
    emoji: '🔧',
    voice: { pitch: 1.4, rate: 1.05 },
    hello: 'Oh, hello! I am Tess. I love building things.',
    lines: [
      'Try the puzzle button. You can tell Bolt what to build!',
      'Forward, block, forward, block. What shape does that make?',
      'What colour blocks do you like best?',
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
  /** Facts about the game sent with each message, so the character knows what Oliver is up to. */
  context: (personaId: string) => object = () => ({});
  /** An AI friend has chosen what to do next. */
  onAction: (personaId: string, action: string) => void = () => {};

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
        stopSpeaking();
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

  open(persona: Persona, hello?: string): void {
    this.persona = persona;
    this.panel.hidden = false;
    this.who.textContent = `${persona.emoji} ${persona.name}`;
    this.say(hello ?? persona.hello);
  }

  close(): void {
    this.persona = null;
    this.panel.hidden = true;
    this.inputEl.blur();
  }

  private say(reply: string): void {
    this.text.textContent = reply;
    if (this.persona?.id === 'bolt') sfx.chirp();
    speak(reply, this.persona?.voice);
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
    log(`${getPlayerName() || 'Player'} to ${persona.name}: ${message}`);

    const history = this.histories.get(persona.id) ?? [];
    history.push({ role: 'user', content: message.slice(0, 300) });
    let reply = '';
    const { url, code } = getAiSettings();
    if (url) {
      try {
        const res = await fetch(`${url}/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-family-code': code },
          body: JSON.stringify({ character: persona.id, messages: history.slice(-12), context: this.context(persona.id) }),
        });
        if (res.ok) {
          const data = (await res.json()) as { reply?: string; action?: string };
          reply = data.reply ?? '';
          if (data.action) this.onAction(persona.id, data.action);
        }
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
      // Without the AI, a friend still does what it is plainly asked to.
      const asked = /follow|come|with me/i.test(message) ? 'follow' : /star/i.test(message) ? 'stars' : /fight|skeleton|bonk/i.test(message) ? 'fight' : /fish/i.test(message) ? 'fish' : /explore|go away|look around/i.test(message) ? 'explore' : '';
      if (asked) this.onAction(persona.id, asked);
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
  const voice = $<HTMLSelectElement>('voice');
  voice.addEventListener('change', () => setVoiceName(voice.value));
  $('voice-test').addEventListener('click', () => {
    setVoiceName(voice.value);
    // The online voice needs the helper's address and code, so use whatever is typed in right now.
    setAiSettings({ url: url.value, code: code.value });
    speak(`Hi ${getPlayerName() || 'there'}! I found three stars. Can you find more?`);
  });
  $('parent-save').addEventListener('click', () => {
    setVoiceName(voice.value);
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
    // Voices differ on every device, so the list is read fresh each time. Best guesses come first.
    const voices = listVoices();
    // The online voice is for tablets that have none of their own. It works once the AI helper below is filled in.
    const online = new Option(voices.length === 0 ? 'Online voice (this device has none of its own)' : 'Online voice (uses the AI helper)', ONLINE_VOICE);
    voice.replaceChildren(...voices.map((v) => new Option(`${v.name} (${v.lang})`, v.name)), online);
    voice.value = getVoiceName() === ONLINE_VOICE || voices.length === 0 ? ONLINE_VOICE : voices.some((v) => v.name === getVoiceName()) ? getVoiceName() : voices[0].name;
    voice.disabled = false;
    panel.hidden = false;
  };
}
