/**
 * Reservation form "Hardware Requirements" options. [OPEN] PLACEHOLDERS: replace with the tool's real list
 * (RULES open question 8). The form's note stays true either way: extra hardware is filed in ServiceNow.
 */
export const HARDWARE_OPTIONS = ['Projector', 'Speakerphone', 'Webcam', 'Extra monitor', 'Laptop', 'HDMI adapter'] as const;
export type HardwareOption = (typeof HARDWARE_OPTIONS)[number];
