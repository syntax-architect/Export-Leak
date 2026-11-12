"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { PAGE_VARIANTS, useMotionEnabled } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const motionEnabled = useMotionEnabled();

  if (!motionEnabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn("w-full", className)}
    >
      {children}
    </motion.div>
  );
}
