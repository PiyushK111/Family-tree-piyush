import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const env = import.meta.env

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

/** Which document under /trees this deployment shows. */
export const TREE_ID = env.VITE_TREE_ID || 'main'

/**
 * Whether a Firebase project is wired up. When false the app runs entirely in
 * the browser against localStorage, so it stays usable before setup and offline.
 */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId)

export interface FirebaseHandles {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

let handles: FirebaseHandles | null = null

/** Lazily initialised so an unconfigured build never throws at import time. */
export function getFirebase(): FirebaseHandles | null {
  if (!firebaseConfigured) return null
  if (!handles) {
    const app = initializeApp({
      apiKey: config.apiKey!,
      authDomain: config.authDomain,
      projectId: config.projectId!,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
    })
    handles = { app, auth: getAuth(app), db: getFirestore(app) }
  }
  return handles
}

export const googleProvider = new GoogleAuthProvider()
