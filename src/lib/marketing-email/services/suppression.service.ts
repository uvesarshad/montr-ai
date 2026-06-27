
import { trackingService } from './tracking.service';

/**
 * Re-exporting suppression logic which resides in TrackingService 
 * to maintain clean imports for consumers.
 */
export const suppressionService = {
    addToSuppressionList: trackingService.addToSuppression.bind(trackingService),
    isEmailSuppressed: trackingService.isSuppressed.bind(trackingService),
};
