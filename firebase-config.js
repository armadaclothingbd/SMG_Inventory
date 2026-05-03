import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  limit,
  startAfter,
  query,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  enableIndexedDbPersistence,
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

enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Firestore persistence failed: Multiple tabs open.");
  } else if (err.code === "unimplemented") {
    console.warn("Firestore persistence not supported by this browser.");
  }
});

const entriesCollection = collection(db, "purchaseEntries");

// গ্লোবাল ক্যাশ ভেরিয়েবল
let cachedEntries = [];
let isCacheFull = false;

export async function getPurchaseEntries(forceRefresh = false) {
  if (isCacheFull && !forceRefresh) return cachedEntries;

  try {
    const q = query(entriesCollection, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    cachedEntries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn("Order by error (maybe index missing):", error);
    const snapshot = await getDocs(entriesCollection);
    cachedEntries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    cachedEntries.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }
  isCacheFull = true;
  return cachedEntries;
}

export function subscribeToPurchaseEntries(callback) {
  return onSnapshot(entriesCollection, (snapshot) => {
    cachedEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cachedEntries.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    isCacheFull = true;
    callback(cachedEntries);
  }, (error) => {
    console.error("Firestore subscription error:", error);
  });
}

export async function getPurchaseEntriesPaged(pageSize = 20, lastVisible = null) {
  let q = query(entriesCollection, orderBy("createdAt", "desc"), limit(pageSize));
  
  if (lastVisible) {
    q = query(entriesCollection, orderBy("createdAt", "desc"), startAfter(lastVisible), limit(pageSize));
  }

  const snapshot = await getDocs(q);
  return {
    data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })),
    lastDoc: snapshot.docs[snapshot.docs.length - 1]
  };
}

export async function addPurchaseEntry(entry) {
  const docRef = await addDoc(entriesCollection, {
    ...entry,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  isCacheFull = false;
  return docRef.id;
}

export async function updatePurchaseEntry(id, entry) {
  await updateDoc(doc(db, "purchaseEntries", id), {
    ...entry,
    updatedAt: serverTimestamp(),
  });
  isCacheFull = false;
}

export async function deletePurchaseEntry(id) {
  await deleteDoc(doc(db, "purchaseEntries", id));
  isCacheFull = false;
}
