"use client";
import { Button } from "@/components/orbit/button";
import { getDatabaseFriendlyName } from "@/components/resource-card/utils";
import { ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";

export function CloudDriverSupportOnly({ type }: { type: string }) {
  return (
    <div className="container">
      <div className="my-8 flex">
        <Button variant="secondary" size="lg" href="/local" as="link">
          <ArrowLeft />
          Back
        </Button>
      </div>

      <div className="mb-8 p-4 text-xl leading-8">
        Running {getDatabaseFriendlyName(type)} from a browser is not possible.
        <br /> Please use the desktop app instead.
      </div>

      <div className="mb-8 flex">
        <div className="flex w-1/2 flex-col gap-4 p-4">
          <div>
            <h1 className="text-2xl font-bold">Desktop App</h1>
          </div>

          <Link
            href="https://github.com/outerbase/studio-desktop/releases"
            className="relative w-full"
          >
            <img
              src="/outerbase-banner.jpg"
              alt=""
              className="w-full rounded-lg"
            />

            <div className="bg-opacity-50 absolute right-0 bottom-0 left-0 flex cursor-pointer flex-col gap-2 rounded-lg bg-black p-4 text-white">
              <div className="text-2xl font-bold">Download the desktop app</div>
              <p className="text-base">
                poopabase Desktop is a lightweight Electron wrapper for
                the poopabase web version. It enables support for drivers
                that aren&apos;t feasible in a browser environment, such as
                MySQL and PostgreSQL.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
