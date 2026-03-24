"use client";
import { PropsWithChildren } from "react";

export default function AuthProvider({ children }: PropsWithChildren) {
  // Auth disabled for poopabase — local-first, no cloud account required
  return <>{children}</>;
}
