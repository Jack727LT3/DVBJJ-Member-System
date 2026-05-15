import StaffDashboardClient from "@/components/mvp/StaffDashboardClient";
import type { StaffDashboard } from "@/lib/staffDashboard";

type StaffDashboardViewProps = {
  data: StaffDashboard;
};

export default function StaffDashboardView({ data }: StaffDashboardViewProps) {
  return <StaffDashboardClient data={data} />;
}
