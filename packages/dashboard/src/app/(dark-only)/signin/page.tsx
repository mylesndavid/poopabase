"use client";
import LabelInput from "@/components/label-input";
import { Button } from "@/components/orbit/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { LoginBaseSpaceship } from "./starbase-portal";

export default function SigninPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onLoginClicked = useCallback(() => {
    if (!email) {
      setError("Please enter your email address");
      return;
    }
    setLoading(true);
    setError("");

    // MVP: localStorage-based session
    const session = {
      email,
      loggedIn: true,
      name: email.split("@")[0],
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem("poopabase-session", JSON.stringify(session));

    router.push("/local");
  }, [email, router]);

  return (
    <>
      <div
        className="absolute left-[10%] z-2 flex w-[400px] flex-col gap-4 rounded-lg border-neutral-800 bg-neutral-900 p-8 md:m-0"
        style={{
          top: "50%",
          transform: "translateY(-50%)",
        }}
      >
        <div className="mb-8 flex flex-col items-center text-white">
          <span className="mb-2 text-5xl" role="img" aria-label="poopabase logo">
            💩
          </span>

          <h1 className="text-2xl font-bold">Sign in to poopabase</h1>
          <p className="text-neutral-400">Welcome back</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onLoginClicked();
          }}
          className="flex flex-col gap-4"
        >
          <LabelInput
            autoFocus
            label="Email"
            size="lg"
            value={email}
            placeholder="Enter your email address"
            onChange={(e) => setEmail(e.currentTarget.value)}
          />

          <LabelInput
            label="Password"
            size="lg"
            value={password}
            type="password"
            placeholder="Password"
            onChange={(e) => setPassword(e.currentTarget.value)}
          />

          {error && <div className="text-base text-red-400">{error}</div>}

          <Button
            loading={loading}
            type="submit"
            variant="primary"
            size="lg"
            className="justify-center bg-green-600 hover:bg-green-700"
          >
            Sign In
          </Button>
        </form>

        <div className="mt-2 text-center">
          <Link
            href="/local"
            className="text-sm text-neutral-400 transition delay-75 ease-in-out hover:text-neutral-200"
          >
            Continue as Guest →
          </Link>
        </div>

        <div className="mt-2 text-center text-sm text-neutral-400">
          {`Don't have an account?`}{" "}
          <Link
            className="text-neutral-300 transition delay-75 ease-in-out hover:text-neutral-100"
            href="/signup"
          >
            Sign Up
          </Link>
        </div>
      </div>

      <LoginBaseSpaceship />
    </>
  );
}
