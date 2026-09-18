import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import config from '../../firebase-applet-config.json';

const app = initializeApp(config);
export const auth = getAuth(app);
const databaseId = (config as any).firestoreDatabaseId || "ai-studio-624bea7c-68f3-4297-85df-707056c1d162";
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
  // Keep active Firestore data and pending writes in IndexedDB so attendance
  // remains usable when the daily Firestore quota is temporarily exhausted.
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
} as any, databaseId);

