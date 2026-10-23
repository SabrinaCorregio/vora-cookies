import { platform } from './platform.js';

window.__voraPlatform = platform;
window.__VORA_LOGO = './icons/logo.png';

// o app só começa depois que a plataforma (login + banco) está pronta
import('./app.js');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
