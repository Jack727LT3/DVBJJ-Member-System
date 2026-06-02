"use client";

import type { StaffMemberParent } from "@/lib/staffDashboard";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";

type PersonParentsSectionProps = {
  parents: StaffMemberParent[];
};

export default function PersonParentsSection({ parents }: PersonParentsSectionProps) {
  const list = parents;

  return (
    <section className="mt-6 border-t border-black/[0.06] pt-5">
      <h3 className="text-sm font-semibold text-brand-ink">Parent / Guardian Contacts</h3>
      {list.length === 0 ? (
        <p className="mt-2 text-sm text-brand-muted">No parent contacts on file.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {list.map((parent, index) => (
            <li
              key={`${parent.name}-${parent.phone}-${index}`}
              className="rounded-lg border border-black/[0.06] bg-neutral-50/80 px-3 py-2.5"
            >
              <p className="text-sm font-medium text-brand-ink">{parent.name}</p>
              <a
                href={`tel:${normalizePhone(parent.phone)}`}
                className="text-sm font-medium text-brand-red hover:underline"
              >
                {formatPhoneDisplay(parent.phone)}
              </a>
              {parent.email ? (
                <p className="mt-0.5 text-sm text-brand-muted">{parent.email}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
