import { notFound } from "next/navigation";
import { DesignShowcase } from "@/components/design/design-showcase";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Design System (Dev)",
};

export default function DesignPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DESIGN_SYSTEM !== "true") {
    notFound();
  }

  return <DesignShowcase />;
}
