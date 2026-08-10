/** Server routing and wire format — docs/extension-contract.md §2, §4. */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VERSION } from "../app/config.js";
import * as handlers from "../app/handlers.js";
import { encodeRebalanceRequest } from "../app/abi.js";
import { bytesToHex, stringToBytes32Hex } from "../base/encoding.js";
import { Server } from "../base/server.js";
import {
  PARENT_VAULT_FXRP,
  FTSO_ADAPTER,
  SPARKDEX_ADAPTER,
  OP_TYPE_VAULT_REBALANCE,
  OP_COMMAND_CALCULATE_OPTIMAL,
} from "../app/config.js";

let srv: Server;

beforeEach(() => {
  handlers.resetState();
  srv = new Server(0, 0, "0.1.0", handlers.register, handlers.reportState);
});
afterEach(() => handlers.resetState());

/** Build a POST /action body in the exact shape tee-node sends. */
function buildAction(opts: {
  opType?: string;
  opCommand?: string;
  originalHex?: string;
  actionId?: string;
} = {}): string {
  const {
    opType = stringToBytes32Hex("VAULT_REBALANCE"),
    opCommand = stringToBytes32Hex("CALCULATE_OPTIMAL"),
    originalHex = encodeRebalanceRequest({
      vaultAddress: PARENT_VAULT_FXRP,
      idleAssets: BigInt("10000000"), // 10 FXRP (6 decimals)
      approvedStrategies: [FTSO_ADAPTER, SPARKDEX_ADAPTER],
      liquidityBufferBps: 1000,
    }),
    actionId = `0x${"11".repeat(32)}`,
  } = opts;

  const dataFixed = {
    instructionId: actionId,
    teeId: `0x${"22".repeat(20)}`,
    timestamp: 1700000000,
    rewardEpochId: 42,
    opType,
    opCommand,
    cosigners: [],
    cosignersThreshold: 0,
    originalMessage: originalHex,
    additionalFixedMessage: "0x",
  };

  const actionData = {
    id: actionId,
    type: "instruction",
    submissionTag: "submit",
    message: bytesToHex(Buffer.from(JSON.stringify(dataFixed), "utf-8")),
  };

  return JSON.stringify({
    data: actionData,
    additionalVariableMessages: [],
    timestamps: [],
    additionalActionData: "0x",
    signatures: [],
  });
}

describe("POST /action routing", () => {
  it("routes registered opType/opCommand to handler", async () => {
    const [status, body] = await srv.handleRequest("POST", "/action", buildAction());
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).status).toBe(1);
  });

  it("returns 501 for unregistered opType", async () => {
    const body = buildAction({ opType: stringToBytes32Hex("UNKNOWN") });
    const [status] = await srv.handleRequest("POST", "/action", body);
    expect(status).toBe(501);
  });

  it("returns 400 when message is not JSON", async () => {
    const body = JSON.stringify({
      data: {
        id: "0x1",
        type: "instruction",
        submissionTag: "submit",
        message: bytesToHex(Buffer.from("not json")),
      },
    });
    expect((await srv.handleRequest("POST", "/action", body))[0]).toBe(400);
  });
});

describe("ActionResult wire format", () => {
  it("returns the success shape", async () => {
    const [status, body] = await srv.handleRequest("POST", "/action", buildAction());
    const r = body as Record<string, unknown>;

    expect(status).toBe(200);
    expect(r.status).toBe(1);
    expect(r.log).toBe("ok");
    expect(r.opType).toBe(stringToBytes32Hex("VAULT_REBALANCE"));
    expect(r.opCommand).toBe(stringToBytes32Hex("CALCULATE_OPTIMAL"));
    expect(String(r.data).startsWith("0x")).toBe(true);
  });

  it("sends version as a plain string, not bytes32", async () => {
    const [, body] = await srv.handleRequest("POST", "/action", buildAction());
    const r = body as Record<string, unknown>;

    expect(r.version).toBe("0.1.0");
    expect(String(r.version).startsWith("0x")).toBe(false);
  });

  it("reports handler failure as HTTP 200 with status 0", async () => {
    const badOriginal = encodeRebalanceRequest({
      vaultAddress: PARENT_VAULT_FXRP,
      idleAssets: BigInt(10), // below minimum
      approvedStrategies: [FTSO_ADAPTER],
      liquidityBufferBps: 1000,
    });

    const [status, body] = await srv.handleRequest(
      "POST",
      "/action",
      buildAction({ originalHex: badOriginal })
    );
    const r = body as Record<string, unknown>;

    expect(status).toBe(200);
    expect(r.status).toBe(0);
    expect(String(r.log).startsWith("error: ")).toBe(true);
    expect(r.data).toBe("0x");
  });

  it("always emits every field", async () => {
    const [, body] = await srv.handleRequest("POST", "/action", buildAction());
    const r = body as Record<string, unknown>;

    expect(Object.keys(r).sort()).toEqual([
      "additionalResultStatus",
      "data",
      "id",
      "log",
      "opCommand",
      "opType",
      "status",
      "submissionTag",
      "version",
    ]);
    expect(r.additionalResultStatus).toBe("0x");
  });

  it("echoes id and submissionTag", async () => {
    const actionId = `0x${"ab".repeat(32)}`;
    const [, body] = await srv.handleRequest(
      "POST",
      "/action",
      buildAction({ actionId })
    );
    const r = body as Record<string, unknown>;

    expect(r.id).toBe(actionId);
    expect(r.submissionTag).toBe("submit");
  });
});

describe("state wire format", () => {
  it("sends stateVersion as bytes32", async () => {
    const [status, body] = await srv.handleRequest("GET", "/state", "");
    const r = body as Record<string, unknown>;

    expect(status).toBe(200);
    expect(r.stateVersion).toBe(stringToBytes32Hex("0.1.0"));
    expect(String(r.stateVersion).length).toBe(66);
  });

  it("reflects handler effects", async () => {
    await srv.handleRequest("POST", "/action", buildAction());
    const [, body] = await srv.handleRequest("GET", "/state", "");
    const state = (body as { state: Record<string, unknown> }).state;

    expect(state.totalRebalances).toBe(1);
    expect(state.lastOptimalStrategy).toBe(FTSO_ADAPTER);
  });
});

describe("serialization", () => {
  it("does not wedge the queue when a handler throws", async () => {
    const boom = new Server(
      0,
      0,
      VERSION,
      (f) => {
        f.handle(OP_TYPE_VAULT_REBALANCE, OP_COMMAND_CALCULATE_OPTIMAL, () => {
          throw new Error("boom");
        });
      },
      () => ({ ok: true })
    );

    await expect(
      boom.handleRequest("POST", "/action", buildAction())
    ).rejects.toThrow("boom");

    const [status] = await boom.handleRequest("GET", "/state", "");
    expect(status).toBe(200);
  });
});
