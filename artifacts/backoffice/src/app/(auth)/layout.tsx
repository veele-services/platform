export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center overflow-y-auto bg-background">
      {children}
    </div>
  );
}
