import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { deleteUser, getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { deleteDoc, doc, getDoc, getFirestore, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { isDisplayNameAvailable } from "../../src/lib/profile.js";

const firebaseConfig = {
  apiKey: "AIzaSyAxsbMK288og-628QvE0VxG_pB882W2-6Q",
  authDomain: "vibe-login-3f072.firebaseapp.com",
  projectId: "vibe-login-3f072",
  storageBucket: "vibe-login-3f072.firebasestorage.app",
  messagingSenderId: "1081118559452",
  appId: "1:1081118559452:web:f4ff5b02ab13738b283819",
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
let currentUser = null;
let currentProfile = null;
let updatingName = false;
function setUpdatingName(val) {
  updatingName = val;
  const settingsSpinner = document.getElementById('nameSpinner');
  if (settingsSpinner) settingsSpinner.classList.toggle('hidden', !val);
  const settingsSaveBtn = document.getElementById('saveFirebaseDisplayName');
  if (settingsSaveBtn) settingsSaveBtn.disabled = val;
  const menuInput = document.getElementById('profileNameInput');
  const menuSaveBtn = document.getElementById('saveProfileNameBtn');
  const menuSaveLabel = document.getElementById('saveProfileNameLabel');
  const menuSaveSpinner = document.getElementById('saveProfileNameSpinner');
  if (menuInput) menuInput.disabled = val;
  if (menuSaveBtn) {
    menuSaveBtn.disabled = val;
    menuSaveBtn.setAttribute('aria-busy', String(val));
  }
  if (menuSaveLabel) menuSaveLabel.textContent = val ? 'Saving…' : 'Save name';
  if (menuSaveSpinner) menuSaveSpinner.classList.toggle('hidden', !val);
}
const normalize = (value) => value.trim().toLowerCase().replace(/\s+/g, " ");
const initials = (value) => value.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "VC";
const displayNameFor = (user, profile) => profile?.displayName || user.displayName || user.email?.split("@")[0] || "Vibecheck user";
function setProfileMenuOpen(open) {
  const dropdown = document.getElementById("logoDropdown");
  const trigger = document.getElementById("profileLogo");
  dropdown?.classList.toggle("hidden", !open);
  trigger?.setAttribute("aria-expanded", String(open));
}
function syncProfileMenu(user, profile) {
  const name = displayNameFor(user, profile);
  const avatar = document.getElementById("profileLogo");
  const menuInitials = document.getElementById("profileMenuInitials");
  const email = document.getElementById("profileMenuEmail");
  const input = document.getElementById("profileNameInput");
  const account = document.querySelector(".cinema-firebase-account");
  if (avatar) { avatar.textContent = initials(name); avatar.title = `Edit display name for ${name}`; }
  if (menuInitials) menuInitials.textContent = initials(name);
  if (email) email.textContent = user.email || "Signed-in user";
  if (input && document.activeElement !== input) input.value = name;
  if (account) account.textContent = name;
}
async function saveProfileNameFromMenu(user) {
  const input = document.getElementById("profileNameInput");
  const message = document.getElementById("profileNameMessage");
  if (!input || !message || updatingName) return;
  const cleanName = input.value.trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._'-]{2,23}$/.test(cleanName)) {
    message.textContent = "Choose 3–24 letters, numbers, spaces, dots, underscores, apostrophes, or hyphens.";
    message.className = "font-label-xs text-label-xs mt-2 text-error";
    return;
  }
  setUpdatingName(true);
  message.textContent = "Saving…";
  message.className = "font-label-xs text-label-xs mt-2 text-on-surface-variant";
  try {
    const available = await isDisplayNameAvailable(cleanName, user.uid);
    if (!available) throw new Error("NAME_TAKEN");
    const normalizedName = normalize(cleanName);
    const profileRef = doc(db, "profiles", user.uid);
    const usernameRef = doc(db, "usernames", normalizedName);
    await runTransaction(db, async (transaction) => {
      const [profileSnapshot, usernameSnapshot] = await Promise.all([transaction.get(profileRef), transaction.get(usernameRef)]);
      const existing = usernameSnapshot.exists() ? usernameSnapshot.data() : null;
      if (existing && existing.uid !== user.uid) throw new Error("NAME_TAKEN");
      const previous = profileSnapshot.exists() ? profileSnapshot.data() : null;
      if (previous?.normalizedName && previous.normalizedName !== normalizedName) transaction.delete(doc(db, "usernames", previous.normalizedName));
      transaction.set(usernameRef, { uid: user.uid, displayName: cleanName, updatedAt: serverTimestamp() });
      transaction.set(profileRef, { uid: user.uid, email: user.email || "", displayName: cleanName, normalizedName, updatedAt: serverTimestamp() }, { merge: true });
    });
    currentProfile = { ...(currentProfile || {}), displayName: cleanName };
    syncProfileMenu(user, currentProfile);
    const settingsTitle = document.querySelector("#view-settings h3");
    if (settingsTitle) settingsTitle.textContent = cleanName;
    message.textContent = "Display name updated.";
    message.className = "font-label-xs text-label-xs mt-2 text-neon-emerald";
  } catch (error) {
    message.textContent = error.message === "NAME_TAKEN" ? "That name is already in use. Choose another one." : error.message;
    message.className = "font-label-xs text-label-xs mt-2 text-error";
  } finally {
    setUpdatingName(false);
  }
}

async function deleteAccountAndData(user) {
  const button = document.getElementById("deleteAccountBtn");
  const message = document.getElementById("profileDeleteMessage");
  if (!button || !message || button.disabled) return;
  const confirmed = window.confirm("Delete your account permanently? This removes your Firebase login, profile, reserved name, local watchlist, and local history. This cannot be undone.");
  if (!confirmed) return;
  const typed = window.prompt("Type DELETE to confirm permanent account deletion.");
  if (typed !== "DELETE") {
    message.textContent = "Deletion cancelled.";
    message.className = "font-label-xs text-label-xs mt-2 text-on-surface-variant";
    return;
  }
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "Deleting…";
  message.textContent = "Removing your account data…";
  message.className = "font-label-xs text-label-xs mt-2 text-on-surface-variant";
  try {
    const profileRef = doc(db, "profiles", user.uid);
    const profileSnapshot = await getDoc(profileRef);
    const profile = profileSnapshot.exists() ? profileSnapshot.data() : null;
    const nameKey = profile?.normalizedName || (profile?.displayName ? normalize(profile.displayName) : "");
    if (nameKey) await deleteDoc(doc(db, "usernames", nameKey));
    await deleteDoc(profileRef);
    localStorage.removeItem("vibecheck_watchlist");
    localStorage.removeItem("vibecheck_history");
    await deleteUser(user);
    if (window.parent && window.parent !== window) window.parent.postMessage({ type: "CINEMA_AUTH_LOGOUT", reason: "account_deleted" }, "*");
    window.top.location.replace("/?account_deleted=1");
  } catch (error) {
    const code = error?.code || "";
    message.textContent = code === "auth/requires-recent-login" ? "For security, sign out and sign in again before deleting your account." : `Could not delete the account: ${error?.message || "Please try again."}`;
    message.className = "font-label-xs text-label-xs mt-2 text-error";
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = "Delete account";
  }
}

function showProfileEditor(user, profile) {
  const header = document.querySelector("#view-settings .glass-panel");
  if (!header || document.getElementById("firebaseProfileEditor")) return;
  const name = profile?.displayName || user.email?.split("@")[0] || "Vibecheck user";
  const avatar = header.querySelector(".w-24.h-24");
  const title = header.querySelector("h3");
  if (avatar) {
    avatar.textContent = initials(name);
    avatar.style.cursor = 'pointer';
    avatar.title = 'Click to edit display name';
    avatar.addEventListener('click', () => {
      const input = document.getElementById('firebaseDisplayName');
      if (input) input.focus();
    });
  }
  if (title) title.textContent = name;
  const editor = document.createElement("div");
  editor.id = "firebaseProfileEditor";
  editor.className = "mt-5 pt-5 border-t border-white/10 w-full";
  editor.innerHTML = `
    <div class="font-label-sm text-label-sm text-on-surface mb-2">Display name</div>
    <div class="flex flex-col sm:flex-row gap-2">
      <input id="firebaseDisplayName" class="w-full bg-surface-container border border-white/10 rounded-lg px-3 py-2 text-on-surface font-label-sm" maxlength="24" value="${name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;")}" aria-label="Display name"/>
      <button id="saveFirebaseDisplayName" class="primary-action px-4 py-2 rounded-lg text-[12px]" type="button">Save name</button>
      <span id="nameSpinner" class="hidden"><svg class="spinner" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none" /></svg></span>
    </div>
    <p id="firebaseDisplayNameMessage" class="font-label-xs text-label-xs mt-2"></p>`;
  header.querySelector(".flex-1")?.appendChild(editor);
  editor.querySelector("#saveFirebaseDisplayName").addEventListener("click", async () => {
    const input = editor.querySelector("#firebaseDisplayName");
    const message = editor.querySelector("#firebaseDisplayNameMessage");
    const saveButton = editor.querySelector("#saveFirebaseDisplayName");
    const cleanName = input.value.trim().replace(/\s+/g, " ");
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._'-]{2,23}$/.test(cleanName)) { message.textContent = "Choose 3–24 letters, numbers, spaces, dots, underscores, apostrophes, or hyphens."; message.className = "font-label-xs text-label-xs mt-2 text-error"; return; }
    setUpdatingName(true);
    const available = await isDisplayNameAvailable(cleanName, user.uid);
    if (!available) {
      message.textContent = "That name is already taken.";
      message.className = "font-label-xs text-label-xs mt-2 text-error";
      setUpdatingName(false);
      return;
    }
    message.textContent = "Saving…";
    message.className = "font-label-xs text-label-xs mt-2 text-on-surface-variant";
    try {
      const normalizedName = normalize(cleanName);
      const profileRef = doc(db, "profiles", user.uid);
      const usernameRef = doc(db, "usernames", normalizedName);
      await runTransaction(db, async (transaction) => {
        const profileSnapshot = await transaction.get(profileRef);
        const usernameSnapshot = await transaction.get(usernameRef);
        const existing = usernameSnapshot.exists() ? usernameSnapshot.data() : null;
        if (existing && existing.uid !== user.uid) throw new Error("NAME_TAKEN");
        const previous = profileSnapshot.exists() ? profileSnapshot.data() : null;
        if (previous?.normalizedName && previous.normalizedName !== normalizedName) transaction.delete(doc(db, "usernames", previous.normalizedName));
        transaction.set(usernameRef, { uid: user.uid, displayName: cleanName, updatedAt: serverTimestamp() });
        transaction.set(profileRef, { uid: user.uid, email: user.email || "", displayName: cleanName, normalizedName, updatedAt: serverTimestamp() }, { merge: true });
      });
      currentProfile = { ...currentProfile, displayName: cleanName };
      if (title) title.textContent = cleanName;
      if (avatar) avatar.textContent = initials(cleanName);
      input.value = cleanName;
const accountEl = document.querySelector('.cinema-firebase-account');
if (accountEl) accountEl.textContent = cleanName;
message.textContent = "Display name updated.";
message.className = "font-label-xs text-label-xs mt-2 text-neon-emerald";
    } catch (error) { message.textContent = error.message === "NAME_TAKEN" ? "That name is already in use. Choose another one." : error.message; message.className = "font-label-xs text-label-xs mt-2 text-error"; }
    finally { setUpdatingName(false); }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user || !user.emailVerified) {
    if (window.top === window) {
      window.location.replace("/");
    } else {
      // In an iframe - communicate with parent instead of recursively reloading "/"
      window.parent?.postMessage({ type: "CINEMA_AUTH_LOGOUT" }, "*");
    }
    return;
  }
  const profileSnapshot = await getDoc(doc(db, "profiles", user.uid)).catch(() => null);
  const profile = profileSnapshot?.exists() ? profileSnapshot.data() : null;
  currentProfile = profile || {};
  syncProfileMenu(user, currentProfile);
  const profileLogo = document.getElementById("profileLogo");
  const saveProfileNameBtn = document.getElementById("saveProfileNameBtn");
  const profileNameInput = document.getElementById("profileNameInput");
  const profileMenuSignOutBtn = document.getElementById("profileMenuSignOutBtn");
  const deleteAccountBtn = document.getElementById("deleteAccountBtn");
  if (profileLogo) {
    profileLogo.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = !document.getElementById("logoDropdown")?.classList.contains("hidden");
      setProfileMenuOpen(!isOpen);
      if (!isOpen) window.setTimeout(() => profileNameInput?.focus(), 0);
    });
  }
  saveProfileNameBtn?.addEventListener("click", () => saveProfileNameFromMenu(user));
  profileNameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); saveProfileNameFromMenu(user); }
    if (event.key === "Escape") setProfileMenuOpen(false);
  });
  profileMenuSignOutBtn?.addEventListener("click", handleSignOut);
  deleteAccountBtn?.addEventListener("click", () => deleteAccountAndData(user));
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Node && !document.getElementById("logoDropdown")?.contains(target) && target !== profileLogo) setProfileMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setProfileMenuOpen(false);
  });
  const originalSettings = document.querySelector("#view-settings");
  const observer = new MutationObserver(() => showProfileEditor(user, profile));
  if (originalSettings) observer.observe(originalSettings, { childList: true, subtree: true });
  showProfileEditor(user, profile);
});

async function handleSignOut() {
  try {
    await signOut(auth);
  } catch (e) {
    console.error("Signout error:", e);
  }
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "CINEMA_AUTH_LOGOUT" }, "*");
  }
  if (window.top) {
    window.top.location.replace("/?logout=1");
  } else {
    window.location.replace("/?logout=1");
  }
}

document.getElementById("cinemaSignOutBtn")?.addEventListener("click", handleSignOut);
document.getElementById("cinemaSidebarSignOutBtn")?.addEventListener("click", handleSignOut);
document.getElementById("cinemaMobileSignOutBtn")?.addEventListener("click", handleSignOut);

