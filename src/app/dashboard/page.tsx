import StaffDashboardView from "@/components/mvp/StaffDashboardView";
import { getStaffDashboard } from "@/lib/staffDashboard";

export const dynamic = "force-dynamic";

export default async function StaffDashboardPage() {
  const data = await getStaffDashboard();
  return <StaffDashboardView data={data} />;
}
