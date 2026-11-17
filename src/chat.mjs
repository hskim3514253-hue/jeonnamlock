import { priceAnswer, chatSystemPrompt } from './prices.mjs';

// Price chat. With ANTHROPIC_API_KEY set, Claude answers from the price data in prices.mjs;
// without it (or when the call fails) the same data is answered as a fixed sentence.
// The worker is a single bundler-free file, so the Messages API is called over plain fetch
// rather than through the SDK. Conversations are not stored or logged.
const CHAT_MODEL = 'claude-opus-5-5';
const CHAT_TURNS = 12, CHAT_CHARS = 500;

export function chatMessages(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > CHAT_TURNS) throw new Error('CHAT_INVALID');
  return value.map((message, index) => {
    const role = index % 2 === 0 ? 'user' : 'assistant';
    if (!message || message.role !== role || typeof message.content !== 'string') throw new Error('CHAT_INVALID');
    const content = message.content.trim();
    if (!content || content.length > (role === 'user' ? CHAT_CHARS : 2000) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(content)) throw new Error('CHAT_INVALID');
    if (index === value.length - 1 && role !== 'user') throw new Error('CHAT_INVALID');
    return { role, content };
  });
}

export async function chatReply(env, product, messages) {
  const fallback = () => ({ reply: priceAnswer(product), mode: 'table' });
  if (!env.ANTHROPIC_API_KEY) return fallback();
  try {
    const response = await (env.CHAT_FETCH || fetch)('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01'
      },
      body: JSON.stringify({
        model: env.CHAT_MODEL || CHAT_MODEL,
        max_tokens: 1024, // short chat answers; the prompt asks for 2-4 sentences
        output_config: { effort: 'low' },
        fallbacks: 'default',
        system: chatSystemPrompt(product),
        messages
      }),
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) { console.error('CHAT_UPSTREAM_FAILED', response.status); return fallback(); }
    const result = await response.json();
    if (result.stop_reason === 'refusal') return fallback();
    const reply = (result.content || []).filter(block => block.type === 'text').map(block => block.text).join('').trim();
    return reply ? { reply: reply.slice(0, 2000), mode: 'ai' } : fallback();
  } catch (error) {
    console.error('CHAT_UPSTREAM_FAILED', error?.name || 'Error');
    return fallback();
  }
}
