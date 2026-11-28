// Narration language: 'ru' (default) or 'en'. Browser: ?lang=en; Node tools: CK_LANG=en.
const fromUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null;
const fromEnv = typeof process !== 'undefined' && process.env ? process.env.CK_LANG : null;
export const LANG = (fromUrl || fromEnv || 'ru') === 'en' ? 'en' : 'ru';
