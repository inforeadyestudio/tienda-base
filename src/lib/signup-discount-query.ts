import { queryOptions } from "@tanstack/react-query";
import { getSignupSettings } from "./signup-discount.functions";
export const signupSettingsQuery = () => queryOptions({
  queryKey: ["app-settings", "signup_discount"],
  queryFn: () => getSignupSettings(),
  staleTime: 60_000,
  retry: 1,
});