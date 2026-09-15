import { getFirestore, doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { app } from "@/lib/firebase";

export const db = getFirestore(app);

export type Profile = {
  uid: string;
  email: string;
  displayName: string;
  normalizedName: string;
};

export function normalizeDisplayName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export async function getProfile(uid: string) {
  const snapshot = await getDoc(doc(db, "profiles", uid));
  return snapshot.exists() ? snapshot.data() as Profile : null;
}

export async function isDisplayNameAvailable(displayName: string, currentUid?: string): Promise<boolean> {
  const cleanName = displayName.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeDisplayName(cleanName);
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._'-]{2,23}$/.test(cleanName)) {
    return false;
  }
  const usernameRef = doc(db, "usernames", normalizedName);
  const snapshot = await getDoc(usernameRef);
  if (!snapshot.exists()) return true;
  const data = snapshot.data();
  return data?.uid === currentUid;
}

export async function saveUniqueDisplayName(uid: string, email: string, displayName: string) {
  const cleanName = displayName.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeDisplayName(cleanName);
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._'-]{2,23}$/.test(cleanName)) {
    throw new Error("Choose a name with 3–24 letters, numbers, spaces, dots, underscores, apostrophes, or hyphens.");
  }
  const profileRef = doc(db, "profiles", uid);
  const usernameRef = doc(db, "usernames", normalizedName);

  await runTransaction(db, async (transaction) => {
    const [profileSnapshot, usernameSnapshot] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(usernameRef),
    ]);
    const existing = usernameSnapshot.exists() ? usernameSnapshot.data() as { uid?: string } : null;
    if (existing && existing.uid !== uid) throw new Error("NAME_TAKEN");
    const previous = profileSnapshot.exists() ? profileSnapshot.data() as Partial<Profile> : null;
    if (previous?.normalizedName && previous.normalizedName !== normalizedName) {
      transaction.delete(doc(db, "usernames", previous.normalizedName));
    }
    transaction.set(usernameRef, { uid, displayName: cleanName, updatedAt: serverTimestamp() });
    transaction.set(profileRef, { uid, email, displayName: cleanName, normalizedName, updatedAt: serverTimestamp() }, { merge: true });
  });
  return cleanName;
}
