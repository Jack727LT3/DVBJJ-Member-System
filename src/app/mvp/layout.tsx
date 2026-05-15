import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Activity (MVP) · DVBJJ",
  description: "Minimal check-in activity viewer for DVBJJ kiosk.",
};

export default function MvpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
