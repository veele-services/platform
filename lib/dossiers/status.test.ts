import { describe, expect, it } from "vitest";
import { billingStatus, commercialStatus, requestStatus, isClosedAction } from "./status";
describe("independent dossier states", () => {
 it("receipt, consent and execution are distinct", () => {
  expect(requestStatus("proposal")).toBe("In beoordeling");
  expect(commercialStatus("proposal", false)).toBe("Akkoord nodig");
  expect(commercialStatus("partial", true)).toBe("Goedgekeurd");
  expect(requestStatus("partial")).toBe("Verwerkt");
  expect(isClosedAction("partial")).toBe(false);
  expect(requestStatus("withdrawn")).toBe("Ingetrokken");
 });
 it("bills actual approved quantities, never an unreviewed request", () => {
  expect(billingStatus(0,true,true,0,1)).toBe("Niet factureerbaar");
  expect(billingStatus(1000,true,false,0,2)).toBe("Nog te controleren");
  expect(billingStatus(1000,true,true,0,2)).toBe("Gereed voor facturatie");
  expect(billingStatus(1000,true,true,1,2)).toBe("Deels gefactureerd");
  expect(billingStatus(1000,true,true,2,2)).toBe("Gefactureerd");
 });
});
