import type { Bootstrap, ConversationDetail, SetupStatus, Viewer, AdminMetaApp } from "./types";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
export const authTokenKey = "whatflow_token";

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem(authTokenKey);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export const api = {
  fetchSetupStatus: () => request<SetupStatus>("/api/setup/status"),
  fetchMe: () => request<{ user: Viewer }>("/api/auth/me"),
  fetchBootstrap: () => request<Bootstrap>("/api/bootstrap"),
  fetchConversation: (id: string) =>
    request<ConversationDetail>(`/api/conversations/${id}`),

  login: (email: string, password: string, accountId: string) =>
    request<{ token: string; actor: Viewer }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, accountId }),
    }),

  bootstrapSystem: (name: string, email: string, password: string) =>
    request<{ token: string; actor: Viewer }>("/api/setup/bootstrap", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),

  saveAdminMeta: (data: AdminMetaApp) =>
    request("/api/admin/meta-app", { method: "PUT", body: JSON.stringify(data) }),

  createAccount: (name: string) =>
    request("/api/accounts", { method: "POST", body: JSON.stringify({ name }) }),

  createAgent: (accountId: string, form: { name: string; email: string; password: string; role: string }) =>
    request(`/api/accounts/${accountId}/agents`, {
      method: "POST",
      body: JSON.stringify(form),
    }),

  createManualInbox: (form: {
    accountId: string;
    name: string;
    phoneNumber: string;
    phoneNumberId: string;
    businessAccountId: string;
    accessToken: string;
    verifyToken: string;
  }) =>
    request("/api/inboxes", {
      method: "POST",
      body: JSON.stringify({ ...form, connectionType: "manual" }),
    }),

  finishEmbeddedSignup: (payload: {
    accountId: string;
    name: string;
    phoneNumber: string;
    phoneNumberId: string;
    wabaId: string;
    code: string;
    redirectUri: string;
  }) =>
    request("/api/inboxes/embedded/exchange", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  sendMessage: (conversationId: string, text: string) =>
    request(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
};
