import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Staff Dashboard · DVBJJ",
  description: "Staff member directory, onboarding, and activity for DVBJJ.",
};

export default function StaffDashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
