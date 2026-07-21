import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { AuthAction, Credentials } from "../queries/use-session";

export function CredentialsPage({
  title,
  description,
  error,
  onSubmit,
  oidcEnabled,
  registrationEnabled = true,
  onOidc,
}: {
  title: string;
  description: string;
  error?: string;
  onSubmit: (credentials: Credentials) => Promise<unknown>;
  oidcEnabled?: boolean;
  registrationEnabled?: boolean;
  onOidc?: () => void;
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
              placeholder="Email"
              aria-label="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              aria-label="Password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button type="submit" disabled={submitting}>
              Sign in
            </Button>
            {registrationEnabled && (
              <Button
                type="button"
                variant="secondary"
                disabled={submitting}
                onClick={() => void submit("register")}
              >
                Create account
              </Button>
            )}
            {oidcEnabled && (
              <>
                <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
                  <Separator className="flex-1" />
                  <span>or</span>
                  <Separator className="flex-1" />
                </div>
                <Button type="button" variant="outline" onClick={onOidc}>
                  Continue with SSO
                </Button>
              </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
