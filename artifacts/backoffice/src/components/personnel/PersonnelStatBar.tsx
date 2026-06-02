import {
  Users,
  Zap,
  CalendarCheck,
  ClockAlert,
  Award,
} from "lucide-react";
import type { PersonnelStats } from "@/app/actions/personnel";

interface StatCardProps {
  icon:  React.ReactNode;
  label: string;
  value: number;
  color: string;
  bg:    string;
}

function StatCard({ icon, label, value, color, bg }: StatCardProps) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3 flex-1 min-w-[140px]"
      style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E8F0" }}
    >
      <div
        className="flex-shrink-0 rounded-lg p-2"
        style={{ backgroundColor: bg }}
      >
        <div style={{ color }}>{icon}</div>
      </div>
      <div>
        <p className="text-2xl font-bold leading-none" style={{ color: "#081D3A" }}>
          {value}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
          {label}
        </p>
      </div>
    </div>
  );
}

export function PersonnelStatBar({ stats }: { stats: PersonnelStats }) {
  return (
    <div className="flex gap-3 mb-6 flex-wrap">
      <StatCard
        icon={<Users className="h-4 w-4" />}
        label="Actieve medewerkers"
        value={stats.active}
        color="#0A7E7A"
        bg="#E0FAFB"
      />
      <StatCard
        icon={<Zap className="h-4 w-4" />}
        label="Flexmedewerkers"
        value={stats.flexCount}
        color="#92400E"
        bg="#FEF3C7"
      />
      <StatCard
        icon={<CalendarCheck className="h-4 w-4" />}
        label="Beschikbaar vandaag"
        value={stats.availableToday}
        color="#065F46"
        bg="#D1FAE5"
      />
      <StatCard
        icon={<ClockAlert className="h-4 w-4" />}
        label="Open verlofaanvragen"
        value={stats.pendingLeave}
        color="#92400E"
        bg="#FEF3C7"
      />
      <StatCard
        icon={<Award className="h-4 w-4" />}
        label="Certificaten verlopen binnenkort"
        value={stats.expiringSoon}
        color={stats.expiringSoon > 0 ? "#991B1B" : "#3B5CE0"}
        bg={stats.expiringSoon > 0 ? "#FEE2E2" : "#F0F4FF"}
      />
    </div>
  );
}
