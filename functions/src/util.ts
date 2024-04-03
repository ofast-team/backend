import { getAuth, Auth } from 'firebase/auth'
import { getFirestore, Firestore } from 'firebase/firestore'
import { initializeApp } from 'firebase/app'

const firebaseConfig = {
  apiKey: 'AIzaSyD1yV--rl-qJiyvwju2K9jz_jkhvr8sTHw',
  authDomain: 'ofast-e6866.firebaseapp.com',
  projectId: 'ofast-e6866',
  storageBucket: 'ofast-e6866.appspot.com',
  messagingSenderId: '660869453090',
  appId: '1:660869453090:web:b919fe7e93c35a77a5417b',
  measurementId: 'G-3B0LRWZFH5',
}

const appInit = initializeApp(firebaseConfig)

export const auth: Auth = getAuth()
export const db: Firestore = getFirestore(appInit)

export const judge_url = 'http://174.138.86.255:2358'

export const MAX_CASES = 100
export const MAX_TIME_LIMIT = 10
export const DEFAULT_TIME_LIMIT = 1
