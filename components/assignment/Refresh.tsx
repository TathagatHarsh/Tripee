"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function AssignmentRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
