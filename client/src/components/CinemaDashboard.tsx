import type { User } from "firebase/auth";

/**
 * The post-login experience is the supplied Vibecheck Cinema page itself.
 * Firebase Auth remains owned by the parent app; the same-origin page bridge
 * reads the persisted Firebase session and provides the Firestore name editor.
 */
export default function CinemaDashboard({ user }: { user: User }) {
  return <main className="cinema-frame-shell" aria-label="Vibecheck Cinema">
    <iframe
      className="cinema-frame"
      src="/cinema/app.html"
      title={`Vibecheck Cinema for ${user.email || "authenticated user"}`}
      allow="autoplay; clipboard-write"
    />
  </main>;
}
