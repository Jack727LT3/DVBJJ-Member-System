export type LiabilityWaiverRecord = {
  id: string;
  signedAt: string;
  dateOfBirth: string;
  participantSignature: string;
  parentName: string | null;
  parentSignature: string | null;
  parentConsentDate: string | null;
};

export type WaiverSubmitPayload = {
  dateOfBirth: string;
  participantSignature: string;
  parentName?: string | null;
  parentSignature?: string | null;
  parentConsentDate?: string | null;
};
