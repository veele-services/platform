import type { LucideIcon } from "lucide-react";

interface Props {
  icon:        LucideIcon;
  title:       string;
  description: string;
}

export function PlaceholderTab({ icon: Icon, title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="flex items-center justify-center rounded-2xl w-16 h-16 mb-4"
        style={{ backgroundColor: "#F1F5F9" }}
      >
        <Icon className="h-8 w-8" style={{ color: "#94A3B8" }} />
      </div>
      <h3 className="font-heading text-base font-semibold mb-1" style={{ color: "#081D3A" }}>
        {title}
      </h3>
      <p className="text-sm max-w-xs" style={{ color: "#94A3B8" }}>
        {description}
      </p>
    </div>
  );
}
