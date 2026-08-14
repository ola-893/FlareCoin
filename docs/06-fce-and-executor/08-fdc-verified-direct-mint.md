# FDC-Verified FXRP Direct Mint

## Why the prior path was removed

The legacy `executor/` watcher observed an XRPL transaction and used an
operator-owned FXRP balance to call `processDirectMint`. Although it checked
the adapter's token balance delta, it was still an operational trust point and
did not submit an FDC proof to the real `AssetManagerFXRP` contract.

That design is not used for new Flux native-XRP deposits.

## Live-path design

```text
XRPL payment with Flux destination tag
  -> user requests XRPPayment attestation from FDC
  -> FDC voting round finalizes
  -> anyone relays the public Merkle proof to FdcDirectMintAdapter
  -> adapter calls AssetManagerFXRP.executeDirectMinting(proof)
  -> AssetManager verifies FDC proof and mints FXRP
  -> adapter forwards the protocol executor fee to relayer
  -> adapter deposits the verified net FXRP into ParentVault atomically
  -> ParentVault mints Flux shares to the tag owner
```

`FdcDirectMintAdapter` binds the FDC proof owner to itself. The proof cannot
be used by an arbitrary EOA and an arbitrary EOA cannot make the adapter mint:
the live FAssets AssetManager verifies the Merkle proof, payment success,
receiving address, destination tag, fees and one-time payment identifier.

## FCC and FDC have different security jobs

FCC remains the confidential off-chain computation layer for Flux strategy
selection and rebalance authorization. The FCC TEE signs result payloads that
the vault independently verifies on-chain.

For a native XRP payment, FDC—not a TEE—is the protocol-native trust anchor.
A TEE can retrieve or relay an FDC proof, but it must never be accepted as a
replacement for that proof. Making FCC the only source of truth for an XRPL
deposit would recreate the server-trust problem the design removes.

The public DApp now requests the FDC proof directly and anyone may relay it.
This gives judges an inspectable, permissionless path while keeping the same
FCC workflow for confidential rebalances.

## Fee and delay behavior

The UI obtains the FDC request fee from the live Coston2 fee configuration.
Before sending XRP, users must account for the FAssets minimum minting fee and
executor fee. The amount that becomes vault assets is:

```text
received XRP - minting fee - executor fee
```

If FAssets rate-limits a payment, `executeDirectMinting` emits a delay instead
of minting. `FdcDirectMintAdapter` emits `FdcDirectMintDeferred` and keeps the
payment unprocessed so the exact same FDC proof can be relayed again when
execution becomes allowed.

## Deployment migration

`script/DeployFdcDirectMintAdapter.s.sol` deployed the adapter and called
`ParentVault.setFAssetAdapter` in one Coston2 broadcast on 2026-08-12.

| Component | Coston2 address |
| --- | --- |
| `FdcDirectMintAdapter` | `0xDd305DEe5a175575C74c62FC74065efb57e06ace` |
| `ParentVault_FXRP` | `0x01f64160E4928Eba5607aE294F9B66090Dc323B3` |

The public frontend is published at `https://yield-flux.netlify.app` with:

```text
VITE_FASSET_ADAPTER_ADDRESS=0xDd305DEe5a175575C74c62FC74065efb57e06ace
```

Existing tags remain tied to the old adapter; reserve a fresh tag through the
new UI for the FDC-native route. The old executor should be retired after all
old tags and pending balances have been reconciled. In particular, the earlier
0.12 TestXRP payment cannot be used in this route: Coston2 currently requires
0.1 TestXRP minimum minting fee plus 0.1 TestXRP executor fee. Use at least
0.3 TestXRP for a judge demonstration.
