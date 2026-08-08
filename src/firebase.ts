import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAlTISpH6Zvw6-4Ik4V_nIIB9U3H-kUDWE",
  authDomain: "pvanalysis-68252.firebaseapp.com",
  projectId: "pvanalysis-68252",
  storageBucket: "pvanalysis-68252.firebasestorage.app",
  messagingSenderId: "21479047299",
  appId: "1:21479047299:web:b3fd07c9f656e78b939bb6",
  measurementId: "G-VMFKX7WQ0V",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("Firebase auth persistence could not be set.", error);
});
