"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import NavigationLayout from "./nav-layout";
import { ResourceItemList } from "./resource-item-helper";

export default function OuterbaseMainPage() {
  const router = useRouter();

  useEffect(() => {
    // Check for poopabase localStorage session
    try {
      const raw = localStorage.getItem("poopabase-session");
      if (raw) {
        const session = JSON.parse(raw);
        if (session?.loggedIn) {
          router.replace("/local");
          return;
        }
      }
    } catch {
      // ignore parse errors
    }

    // Not logged in — redirect to sign-in
    router.replace("/signin");
  }, [router]);

  return (
    <NavigationLayout>
      <div className="flex flex-1 flex-col content-start gap-4 overflow-x-hidden overflow-y-auto p-4">
        <ResourceItemList boards={[]} bases={[]} loading />
      </div>
    </NavigationLayout>
  );
}
