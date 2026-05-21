const STORAGE_KEY = "dvbjj_staff_authenticated";

export const STAFF_USERNAME = "dvbjj90";
export const STAFF_PASSWORD = "dvbjj1of1";

export function isStaffAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(STORAGE_KEY) === "1";
}

export function setStaffAuthenticated(): void {
  sessionStorage.setItem(STORAGE_KEY, "1");
}

export function clearStaffAuthentication(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function validateStaffCredentials(username: string, password: string): boolean {
  return username.trim() === STAFF_USERNAME && password === STAFF_PASSWORD;
}
