import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/lib/error";

interface MutationMeta extends Record<string, unknown> {
  successMessage?: string;
  toast?: boolean;
}

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: MutationMeta;
  }
}

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.toast !== false) toast.error(errorMessage(error));
    },
    onSuccess: (_data, _variables, _context, mutation) => {
      if (mutation.meta?.successMessage) toast.success(mutation.meta.successMessage);
    },
  }),
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});
