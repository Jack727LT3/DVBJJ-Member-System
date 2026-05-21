import { redirect } from "next/navigation";

/** Legacy URL — staff dashboard moved to /dashboard */
export default function MvpRedirectPage() {
  redirect("/dashboard");
}
