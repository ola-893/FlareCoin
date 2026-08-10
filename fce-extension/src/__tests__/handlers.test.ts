/**
 * FlareYield FCE Extension Unit Tests
 * Tests handleCalculateOptimal and handleGetAPYs wire protocol logic.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import * as handlers from "../app/handlers.js";
import { encodeRebalanceRequest } from "../app/abi.js";
import {
  PARENT_VAULT_FXRP,
  FTSO_ADAPTER,
  SPARKDEX_ADAPTER,
} from "../app/config.js";

beforeEach(() => handlers.resetState());
afterEach(() => handlers.resetState());

describe("handleCalculateOptimal", () => {
  it("calculates optimal strategy and returns ABI-encoded payload", async () => {
    const requestHex = encodeRebalanceRequest({
      vaultAddress: PARENT_VAULT_FXRP,
      idleAssets: BigInt("10000000"), // 10 FXRP (6 decimals)
      approvedStrategies: [FTSO_ADAPTER, SPARKDEX_ADAPTER],
      liquidityBufferBps: 1000, // 10%
    });

    const result = await handlers.handleCalculateOptimal(requestHex);

    expect(result[1]).toBe(1); // status 1 = success
    expect(result[2]).toBeNull(); // no error
    expect(result[0]).toMatch(/^0x[a-fA-F0-9]+/); // raw ABI hex
  });

  it("rejects idle assets below minimum threshold", async () => {
    const requestHex = encodeRebalanceRequest({
      vaultAddress: PARENT_VAULT_FXRP,
      idleAssets: BigInt(500), // very small amount below 1 FXRP
      approvedStrategies: [FTSO_ADAPTER],
      liquidityBufferBps: 1000,
    });

    const result = await handlers.handleCalculateOptimal(requestHex);

    expect(result[0]).toBeNull();
    expect(result[1]).toBe(0); // failure status
    expect(result[2]).toContain("below minimum");
  });

  it("rejects request with zero approved strategies", async () => {
    const requestHex = encodeRebalanceRequest({
      vaultAddress: PARENT_VAULT_FXRP,
      idleAssets: BigInt("5000000"), // 5 FXRP (6 decimals)
      approvedStrategies: [],
      liquidityBufferBps: 1000,
    });

    const result = await handlers.handleCalculateOptimal(requestHex);

    expect(result[0]).toBeNull();
    expect(result[1]).toBe(0);
    expect(result[2]).toContain("no approved strategies");
  });
});

describe("handleGetAPYs", () => {
  it("returns encoded APYs for requested strategies", async () => {
    const msg = "0x" + Buffer.from(JSON.stringify([FTSO_ADAPTER, SPARKDEX_ADAPTER])).toString("hex");

    const result = await handlers.handleGetAPYs(msg);

    expect(result[1]).toBe(1);
    expect(result[2]).toBeNull();
    expect(result[0]).toMatch(/^0x/);
  });
});
