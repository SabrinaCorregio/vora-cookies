// Conecta o app ao Firebase (login + banco de dados em tempo real).
// Recebe o SDK já carregado (fb) para poder ser testado sem internet.
export function createPlatform(fb, config) {
  const configured = !!(fb && config && config.apiKey && config.projectId && config.appId);
  const sdkFailed = !fb && !!(config && config.apiKey);
  let auth = null;
  let db = null;
  let currentUser = null;

  if (configured) {
    const app = fb.initializeApp(config);
    auth = fb.getAuth(app);
    try {
      // cache local: o app abre e registra vendas mesmo sem sinal; sincroniza quando voltar
      db = fb.initializeFirestore(app, {
        localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() })
      });
    } catch (e) {
      db = fb.getFirestore(app);
    }
  }

  const dbApi = {
    doc(path) {
      const ref = fb.doc(db, path);
      return {
        set: (data) => fb.setDoc(ref, data),
        delete: () => fb.deleteDoc(ref),
        onSnapshot: (next, err) =>
          fb.onSnapshot(
            ref,
            (s) => next({ exists: s.exists(), id: s.id, data: () => s.data(), fromCache: !!(s.metadata && s.metadata.fromCache) }),
            err
          )
      };
    },
    collection(name) {
      const ref = fb.collection(db, name);
      return {
        onSnapshot: (next, err) =>
          fb.onSnapshot(
            ref,
            (s) => next({ docs: s.docs.map((d) => ({ id: d.id, data: () => d.data() })), fromCache: !!(s.metadata && s.metadata.fromCache) }),
            err
          )
      };
    }
  };

  const who = (u) => (u ? { id: u.uid, email: u.email, name: u.displayName || u.email } : null);

  return {
    configured,
    sdkFailed,
    auth: {
      onChange(cb) {
        if (!configured) { cb(null); return () => {}; }
        return fb.onAuthStateChanged(auth, (u) => { currentUser = u; cb(who(u)); });
      },
      signIn: (email, pass) => fb.signInWithEmailAndPassword(auth, email, pass),
      reset: (email) => fb.sendPasswordResetEmail(auth, email),
      async signOut() {
        try { await fb.signOut(auth); } catch (e) { /* segue */ }
        // apaga o cache local de dados (aparelho compartilhado ou trocado)
        try { await fb.terminate(db); await fb.clearIndexedDbPersistence(db); } catch (e) { /* segue */ }
        if (typeof location !== 'undefined') location.reload();
      }
    },
    async use(name) {
      if (name === 'db') return configured && currentUser ? dbApi : null;
      if (name === 'user') {
        return currentUser ? { me: async () => who(currentUser), can: async () => true } : null;
      }
      return null; // 'sample' (leitura de prints por IA) não existe nesta versão
    }
  };
}
