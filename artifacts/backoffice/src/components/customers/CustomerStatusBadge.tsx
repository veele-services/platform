import { CUSTOMER_STATUS_LABELS, CUSTOMER_STATUS_COLORS } from "@/types/customer-status";

interface Props {
  status: string;
  size?: "sm" | "md";
}

export function CustomerStatusBadge({ status, size = "sm" }: Props) {
  const colors = CUSTOMER_STATUS_COLORS[status] ?? CUSTOMER_STATUS_COLORS["inactive"];
  const label  = CUSTOMER_STATUS_LABELS[status]  ?? status;

  const px  = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";
  const txt = size === "sm" ? "text-xs"      : "text-sm";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${px} ${txt}`}
      style={{
        backgroundColor: colors.bg,
        color:           colors.text,
        border:          `1px solid ${colors.border}`,
      }}
    >
      {label}
    </span>
  );
}
