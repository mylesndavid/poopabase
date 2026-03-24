"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import NavigationLayout from "./nav-layout";
import { ResourceItemList } from "./resource-item-helper";

export default function OuterbaseMainPage() {
  const router = useRouter();

  useEffect(() => {
    // poopabase: always go straight to local workspace
    router.replace("/local");
  }, [router]);

  return (
    <NavigationLayout>
      <div className="flex flex-1 flex-col content-start gap-4 overflow-x-hidden overflow-y-auto p-4">
        <ResourceItemList boards={[]} bases={[]} loading />
      </div>
    </NavigationLayout>
  );
}
