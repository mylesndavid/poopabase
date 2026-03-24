"use client";

import { SQLiteIcon } from "@/components/icons/outerbase-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CaretDown, UploadSimple } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import NavigationLayout from "../nav-layout";
import { ResourceItemList, ResourceItemProps } from "../resource-item-helper";
import { deleteLocalBaseDialog } from "./dialog-base-delete";
import { createLocalBoardDialog } from "./dialog-board-create";
import { deleteLocalBoardDialog } from "./dialog-board-delete";
import { createLocalConnection, useLocalConnectionList, useLocalDashboardList } from "./hooks";

export default function LocalConnectionPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const {
    data: localBases,
    isLoading,
    mutate: refreshBase,
  } = useLocalConnectionList();

  const handleUploadDb = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      setUploadError("");

      try {
        const dbName = file.name.replace(/\.(db|sqlite|sqlite3|poop\.db)$/i, "");
        const conn = await createLocalConnection({
          driver: "turso",
          name: dbName,
          url: "http://localhost:3141",
          token: "",
        });
        await refreshBase();
        router.push(`/client/s/turso?p=${conn.id}`);
      } catch {
        setUploadError("Failed to create connection. Make sure poop serve is running.");
      } finally {
        setUploading(false);
      }
    },
    [router, refreshBase]
  );

  const baseResources = useMemo(() => {
    return (localBases ?? []).map((conn) => {
      return {
        href:
          conn.content.driver === "sqlite-filehandler"
            ? `/playground/client?s=${conn.id}`
            : `/client/s/${conn.content.driver ?? "turso"}?p=${conn.id}`,
        name: conn.content.name,
        lastUsed: conn.updated_at,
        id: conn.id,
        type: conn.content.driver,
        status: "",
        color: conn.content.label || "default",
      } as ResourceItemProps;
    });
  }, [localBases]);

  // Getting the board from indexdb
  const { data: dashboardList, mutate: refreshDashboard } =
    useLocalDashboardList();
  const dashboardResources = useMemo(() => {
    return (
      (dashboardList ?? []).map((board) => {
        return {
          href: `/local/board/${board.id}`,
          name: board.content.name,
          lastUsed: board.content.updated_at,
          id: board.id,
          type: "board",
        } as ResourceItemProps;
      }) ?? []
    );
  }, [dashboardList]);

  const onBoardCreate = useCallback(() => {
    createLocalBoardDialog.show({}).then(() => {
      refreshDashboard();
    });
  }, [refreshDashboard]);

  const onBaseRemove = useCallback(
    (deletedResource: ResourceItemProps) => {
      deleteLocalBaseDialog
        .show({ baseId: deletedResource.id, baseName: deletedResource.name })
        .then(refreshBase)
        .catch();
    },
    [refreshBase]
  );

  const onBoardRemove = useCallback((deletedResource: ResourceItemProps) => {
    deleteLocalBoardDialog
      .show({ boardId: deletedResource.id, boardName: deletedResource.name })
      .then()
      .catch();
  }, []);

  return (
    <NavigationLayout>
      <div className="flex flex-1 flex-col content-start gap-4 overflow-x-hidden overflow-y-auto p-4">
        <div className="mb-4 flex flex-wrap gap-4">
          <Link
            href="/playground/client?template=empty"
            className="bg-background dark:bg-secondary flex cursor-pointer items-center gap-3 rounded-lg border border-green-800/30 p-4 transition-colors hover:border-green-600/50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-900/30 text-xl">
              💩
            </div>
            <div className="flex flex-col gap-1 text-left">
              <span className="text-base font-bold">New Database</span>
              <span className="text-sm opacity-60">
                Create an empty poopabase database
              </span>
            </div>
          </Link>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button className="bg-background dark:bg-secondary flex cursor-pointer items-center gap-2 rounded-lg border p-4">
                <SQLiteIcon className="h-10 w-10" />
                <div className="flex flex-col gap-1 text-left">
                  <span className="text-base font-bold">Templates</span>
                  <span className="text-sm opacity-60">
                    Start with sample data
                  </span>
                </div>
                <CaretDown className="ml-4 h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="flex w-[500px] flex-col gap-4 p-4"
              align="start"
            >
              <Link
                href="/playground/client"
                className="bg-secondary hover:bg-primary hover:text-primary-foreground flex cursor-pointer flex-col gap-2 rounded p-2 py-4 text-base font-bold"
              >
                Empty Database
              </Link>

              <div className="flex gap-4">
                <Link
                  href="/playground/client?template=northwind"
                  className="bg-secondary hover:bg-primary hover:text-primary-foreground flex cursor-pointer flex-col gap-2 rounded p-2 text-left text-base"
                >
                  <span className="font-bold">Northwind</span>
                  <span className="text-sm">
                    Sample business database for learning SQL.
                  </span>
                </Link>

                <Link
                  href="/playground/client?template=chinook"
                  className="bg-secondary hover:bg-primary hover:text-primary-foreground flex cursor-pointer flex-col gap-2 rounded p-2 text-left text-base"
                >
                  <span className="font-bold">Chinook</span>
                  <span className="text-sm">
                    Sample media store database for practicing SQL.
                  </span>
                </Link>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <Link
            href="/local/new-base/turso"
            className="bg-background dark:bg-secondary flex cursor-pointer items-center gap-2 rounded-lg border p-4"
          >
            <SQLiteIcon className="h-10 w-10" />
            <div className="flex flex-col gap-1 text-left">
              <span className="text-base font-bold">Connect Database</span>
              <span className="text-sm opacity-60">
                Connect to Turso, SQLite, or libSQL
              </span>
            </div>
          </Link>

          <button
            className="bg-background dark:bg-secondary flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-4 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <UploadSimple className="h-10 w-10 opacity-50" />
            <div className="flex flex-col gap-1 text-left">
              <span className="text-base font-bold">
                {uploading ? "Uploading..." : "Upload Database"}
              </span>
              <span className="text-sm opacity-60">
                Upload an existing .db or .sqlite file
              </span>
            </div>
          </button>
          {uploadError && (
            <div className="w-full rounded-lg border border-red-800/50 bg-red-900/20 p-3 text-sm text-red-400">
              {uploadError}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".db,.sqlite,.sqlite3,.poop.db"
            className="hidden"
            onChange={handleUploadDb}
          />
        </div>

        <ResourceItemList
          boards={dashboardResources}
          bases={baseResources ?? []}
          loading={isLoading}
          onBoardRemove={onBoardRemove}
          onBaseRemove={onBaseRemove}
          onBaseEdit={(resource) => {
            router.push(`/local/edit-base/${resource.id}`);
          }}
          onBoardCreate={onBoardCreate}
        />
      </div>
    </NavigationLayout>
  );
}
