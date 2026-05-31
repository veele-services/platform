import { ClipboardCheck, Calendar, MapPin, Tag } from "lucide-react";
import { getOpenAssignments } from "@/actions/open-assignments";
import { ApplyButton } from "./ApplyButton";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

export default async function OpenstaandePage() {
  const assignments = await getOpenAssignments();

  const open    = assignments.filter((a) => !a.isAlreadyApplied);
  const applied = assignments.filter((a) => a.isAlreadyApplied);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>
          Openstaande opdrachten
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--color-secondary)" }}>
          Meld u aan als kandidaat — de planner bevestigt de definitieve inzet.
        </p>
      </div>

      {assignments.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <ClipboardCheck size={32} className="mx-auto mb-3" style={{ color: "var(--color-muted-fg)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            Geen openstaande opdrachten
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-secondary)" }}>
            Er zijn momenteel geen opdrachten beschikbaar waarvoor u in aanmerking komt.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <section>
          <h2
            className="mb-2 text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-secondary)" }}
          >
            Beschikbaar ({open.length})
          </h2>
          <div className="space-y-3">
            {open.map((a) => (
              <AssignmentCard key={a.id} assignment={a} />
            ))}
          </div>
        </section>
      )}

      {applied.length > 0 && (
        <section>
          <h2
            className="mb-2 text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-secondary)" }}
          >
            Al aangemeld ({applied.length})
          </h2>
          <div className="space-y-3">
            {applied.map((a) => (
              <AssignmentCard key={a.id} assignment={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AssignmentCard({
  assignment,
}: {
  assignment: Awaited<ReturnType<typeof getOpenAssignments>>[number];
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="font-semibold" style={{ color: "var(--color-primary)" }}>
        {assignment.title}
      </p>

      <div className="mt-2 space-y-1.5">
        {assignment.scheduledDate && (
          <div className="flex items-center gap-2">
            <Calendar size={13} style={{ color: "var(--color-accent)" }} />
            <span className="text-xs" style={{ color: "var(--color-secondary)" }}>
              {formatDate(assignment.scheduledDate)}
            </span>
          </div>
        )}
        {(assignment.objectAddress || assignment.objectCity) && (
          <div className="flex items-center gap-2">
            <MapPin size={13} style={{ color: "var(--color-accent)" }} />
            <span className="truncate text-xs" style={{ color: "var(--color-muted-fg)" }}>
              {[assignment.objectAddress, assignment.objectCity].filter(Boolean).join(", ")}
            </span>
          </div>
        )}
        {assignment.taskCodes.length > 0 && (
          <div className="flex items-start gap-2">
            <Tag size={13} className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
            <div className="flex flex-wrap gap-1">
              {assignment.taskCodes.map((code) => (
                <span
                  key={code}
                  className="rounded px-1.5 py-0.5 text-xs"
                  style={{ backgroundColor: "var(--color-muted)", color: "var(--color-secondary)" }}
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <ApplyButton
          assignmentId={assignment.id}
          title={assignment.title}
          isAlreadyApplied={assignment.isAlreadyApplied}
        />
      </div>
    </div>
  );
}
