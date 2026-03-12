export { detectGaps } from './gap-detector.js';
export { analyzeFeedback, type FlaggedFAQ } from './feedback-analyzer.js';
export { detectStaleEntries, type StaleFAQ } from './stale-detector.js';
export { generateThresholdReport, type ThresholdReport, type ThresholdRecommendation } from './threshold-advisor.js';
export {
  getReviewQueue,
  approveGap,
  dismissGap,
  approveSuggestion,
  dismissSuggestion,
  saveGaps,
  type ReviewItem,
} from './review-queue.js';
