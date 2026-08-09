import { keccak256, toBytes } from 'viem';

const xrplTxHash = "16B79DB44B8621C363D2516291BE63705E99BEFB1CED22429A1181B53928A9F7";

// What the buggy code computed (executor registration)
const buggyDepositId = keccak256(toBytes(xrplTxHash));

// What the correct code should compute
const correctDepositId = keccak256(`0x${xrplTxHash}`);

// What was actually used in the failed settlement call
const usedInSettlement = "0x79675cd62c6cc032d623bd5198d6bd0fe9018f2eaef74beca171f37e5d0dc6ae";

console.log("=".repeat(80));
console.log("XRPL TX Hash:", xrplTxHash);
console.log("=".repeat(80));
console.log("\nBuggy depositId (executor registration):");
console.log(buggyDepositId);
console.log("\nCorrect depositId (hex decode):");
console.log(correctDepositId);
console.log("\nUsed in failed settlement tx:");
console.log(usedInSettlement);
console.log("\n" + "=".repeat(80));
console.log("MATCHES:");
console.log("=".repeat(80));
console.log("Buggy == Used in settlement?", buggyDepositId === usedInSettlement);
console.log("Correct == Used in settlement?", correctDepositId === usedInSettlement);
console.log("Buggy == Correct?", buggyDepositId === correctDepositId);
