"use client";
import { Avatar } from "@/components/orbit/avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  CaretDown,
  Gear,
  SignIn,
  SignOut,
  ToggleLeft,
  ToggleRight,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { localSettingDialog } from "./local-setting-dialog";

interface PoopabaseSession {
  email: string;
  name: string;
  loggedIn: boolean;
}

export default function NavigationProfile() {
  const { resolvedTheme, forcedTheme, setTheme } = useTheme();
  const router = useRouter();
  const [session, setSession] = useState<PoopabaseSession | null>(null);

  const theme = forcedTheme ?? resolvedTheme;

  useEffect(() => {
    try {
      const raw = localStorage.getItem("poopabase-session");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.loggedIn) {
          setSession(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const onLogoutClicked = useCallback(() => {
    localStorage.removeItem("poopabase-session");
    router.push("/signin");
  }, [router]);

  const onThemeToggleClicked = useCallback(
    (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      setTheme(theme === "dark" ? "light" : "dark");

      // We don't want the dropdown to close
      e.stopPropagation();
      e.preventDefault();
    },
    [theme, setTheme]
  );

  const displayName = session?.name ?? "Guest";
  const displayEmail = session?.email;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger>
        <div
          className={cn(
            buttonVariants({
              size: "lg",
              variant: "ghost",
            }),
            "flex items-center justify-start gap-2 p-1"
          )}
        >
          <Avatar username={displayName} as="div" />
          <div className="flex-1 text-left text-sm">{displayName}</div>
          <div>
            <CaretDown weight="bold" className="h-3 w-3" />
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[250px]">
        <div className="flex gap-2 border-b p-2">
          <Avatar
            size="lg"
            username={displayName}
          />

          <div className="flex flex-col justify-center">
            <div className="text-sm font-semibold">{displayName}</div>
            {displayEmail && (
              <div className="text-sm text-neutral-500">{displayEmail}</div>
            )}
          </div>
        </div>

        <div className="p-2">
          <DropdownMenuItem
            className="justify-between"
            onClick={() => {
              localSettingDialog.show({}).then().catch();
            }}
          >
            Local Setting
            <Gear size={20} />
          </DropdownMenuItem>

          <DropdownMenuItem
            className="justify-between"
            onClick={onThemeToggleClicked}
          >
            Theme
            {theme === "dark" ? (
              <ToggleRight weight="fill" size={20} />
            ) : (
              <ToggleLeft size={20} />
            )}
          </DropdownMenuItem>

          {session ? (
            <DropdownMenuItem
              onClick={onLogoutClicked}
              className="justify-between"
            >
              Log out <SignOut size={20} />
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => router.push("/signin")}
              className="justify-between"
            >
              Sign in <SignIn size={20} />
            </DropdownMenuItem>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
