// Keep this module free of SDK imports: reading does not need Firebase.
export const configuration = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
}

export function isFirebaseConfigured(): boolean {
  return Object.values(configuration).every(Boolean)
}
