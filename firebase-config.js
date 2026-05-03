import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  enableIndexedDbPersistence,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBwyt3VyiTCkrnIefoGr90BSZH5ZDBc0Oo",
  authDomain: "smg-inventory.firebaseapp.com",
  projectId: "smg-inventory",
  storageBucket: "smg-inventory.firebasestorage.app",
  messagingSenderId: "800395356558",
  appId: "1:800395356558:web:0eaed2cac02e33569c9cdf",
  measurementId: "G-QYPQSJ73DX",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Enable offline caching (makes reload instant)
enableIndexedDbPersistence(db).catch((err) => {
  console.warn("Could not enable persistence:", err);
});

const entriesCollection = collection(db, "purchaseEntries");

export async function getPurchaseEntries() {
  const snapshot = await getDocs(query(entriesCollection, orderBy("createdAt", "desc")));

  return snapshot.docs.map((entryDoc) => ({
    id: entryDoc.id,
    ...entryDoc.data(),
  }));
}

export function onPurchaseEntriesSnapshot(callback) {
  const q = query(entriesCollection, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map((entryDoc) => ({
      id: entryDoc.id,
      ...entryDoc.data(),
    }));
    callback(data);
  }, (error) => {
    console.error("Firestore snapshot error:", error);
    callback(null, error);
  });
}

export async function addPurchaseEntry(entry) {
  const docRef = await addDoc(entriesCollection, {
    ...entry,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

export async function updatePurchaseEntry(id, entry) {
  await updateDoc(doc(db, "purchaseEntries", id), {
    ...entry,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePurchaseEntry(id) {
  await deleteDoc(doc(db, "purchaseEntries", id));
}
