import createClient from "openapi-fetch";
import type { paths } from "@reown/api-contract";

// Browser requests stay on the web origin. Only the server talks to NestJS.
export const apiClient = createClient<paths>({
  baseUrl: "",
  credentials: "same-origin",
  cache: "no-store",
  headers: { "X-ReOwn-Client": "web" },
});
