export type Vault = {
  id: string;
  name: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  createdAt?: string;
  updatedAt?: string;
};
