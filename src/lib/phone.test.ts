import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, maskPhone, normalizePhone } from "./phone";

describe("phone utils", () => {
  it("normalizes phone to digits only", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
    expect(normalizePhone("555-123-0000 ext 12")).toBe("555123000012");
  });

  it("masks phone for kiosk display", () => {
    expect(maskPhone("5551234567")).toBe("***4567");
  });

  it("formats phone for display", () => {
    expect(formatPhoneDisplay("(555) 123-4567")).toBe("(555) 123-4567");
    expect(formatPhoneDisplay("15551234567")).toBe("(555) 123-4567");
    expect(formatPhoneDisplay("555123")).toBe("555123");
  });
});

