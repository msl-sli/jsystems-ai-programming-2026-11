import Image from "next/image";

export const PRODUCT_NAME = "Hardware Service Decision Copilot";

export function SiteHeader() {
  return (
    <header className="flex min-h-[97px] flex-col items-center justify-center gap-1 border-b border-border bg-background px-4 py-3 md:min-h-[121px]">
      <Image
        src="/logo.svg"
        alt="Logo firmy"
        width={96}
        height={34}
        priority
        className="h-auto w-24"
      />
      <p className="text-center text-sm text-foreground">{PRODUCT_NAME}</p>
    </header>
  );
}
