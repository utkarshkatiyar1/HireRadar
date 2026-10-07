// Feature flags for surfaces whose backend endpoints may not be deployed
// everywhere yet. Both are true by default since the backend
// (/applications/*, /profile/candidate) is fully built — flip to false via
// VITE_FEATURE_* env vars only if deploying the frontend ahead of a backend
// rollout.
export const FEATURES = {
  applications: import.meta.env.VITE_FEATURE_APPLICATIONS !== 'false',
  candidateProfile: import.meta.env.VITE_FEATURE_CANDIDATE_PROFILE !== 'false',
};
