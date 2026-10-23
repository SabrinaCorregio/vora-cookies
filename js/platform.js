import { firebaseConfig } from './firebase-config.js';
import { createPlatform } from './firebase-adapter.js';

const VERSAO = '10.12.2';
const BASE = `https://www.gstatic.com/firebasejs/${VERSAO}/`;

let fb = null;
if (firebaseConfig.apiKey) {
  try {
    const [app, auth, fs] = await Promise.all([
      import(BASE + 'firebase-app.js'),
      import(BASE + 'firebase-auth.js'),
      import(BASE + 'firebase-firestore.js')
    ]);
    fb = { ...app, ...auth, ...fs };
  } catch (e) {
    console.error('Não foi possível carregar o Firebase', e);
  }
}

export const platform = createPlatform(fb, firebaseConfig);
