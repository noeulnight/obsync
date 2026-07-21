import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AuthAction, Credentials } from "../queries/use-session";

export function CredentialsPage({
  title,
  description,
  error,
  onSubmit,
}: {
  title: string;
  description: string;
  error?: string;
  onSubmit: (credentials: Credentials) => Promise<unknown>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(action: AuthAction) {
    setSubmitting(true);
    try {
      await onSubmit({ email, password, action });
    } catch {
      // The mutation exposes the error next to the form.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void submit("login");
            }}
          >
            <Input
              type="email"
              autoComplete="email"
              placeholder="이메일"
              aria-label="이메일"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호"
              aria-label="비밀번호"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button type="submit" disabled={submitting}>
              로그인
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => void submit("register")}
            >
              계정 만들기
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
