import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore/lite';

/**
 * Babu's web app in the "pokecard-summoner" Firebase project.
 * These values are public by design; access is controlled by Firestore rules
 * (managed in the pos-sytem repo: anyone can read babu_titles, only the owner can write).
 */
export const firebaseApp = initializeApp({
  apiKey: 'AIzaSyCUkC5cJnjJ6VEJ4BVXg0WQh-ooOGgmVX4',
  authDomain: 'pokecard-summoner.firebaseapp.com',
  projectId: 'pokecard-summoner',
  storageBucket: 'pokecard-summoner.firebasestorage.app',
  messagingSenderId: '232653129225',
  appId: '1:232653129225:web:e2018b68d6887f8066dad8',
});

/** Firestore Lite: one-shot reads/writes, much smaller than the full SDK. */
export const db = getFirestore(firebaseApp);

/** The only account allowed to add movies (must match the Firestore rule). */
export const OWNER_EMAIL = 'kdkeann@gmail.com';
