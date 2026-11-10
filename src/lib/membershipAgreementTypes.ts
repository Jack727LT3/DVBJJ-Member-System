import type { MembershipPlanId } from "@/lib/membershipAgreementCopy";

export type MembershipAgreementRecord = {
  id: string;
  signedAt: string;
  planId: MembershipPlanId | string;
  planLabel: string;
  participantName: string;
  participantSignature: string;
  financialResponsibleName: string | null;
  financialResponsibleSignature: string | null;
  agreementVersion: string;
};

export type MembershipAgreementSubmitPayload = {
  planId: MembershipPlanId;
  participantName: string;
  participantSignature: string;
  financialResponsibleName?: string | null;
  financialResponsibleSignature?: string | null;
};
