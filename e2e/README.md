# End-to-end checks (Nimiq testnet)

These scripts run the deployed app against the real Nimiq testnet. They are not unit tests, and no data in them is mocked.

```bash
cd e2e && npm i @nimiq/core playwright-core
node keys.mjs            # creates two local testnet keys in .keys.json (git-ignored) and prints the addresses
curl -X POST https://faucet.pos.nimiq-testnet.com/tapit -d "address=<payer address>"
node hostsim.mjs         # full flow in two browser "devices"
```

- `hostsim.mjs`: the treasurer creates a group, the member cancels once (PERMISSION_DENIED), then pays. The payment is confirmed on-chain and the treasurer's register updates. Only Nimiq Pay's native bridge (`window.nimiq`) is replaced by Node: it signs with a local testnet key and broadcasts a real transaction through the public RPC. Everything else is the production app.
- `pay.mjs <tag> <luna>`: sends a real tagged payment, which is handy for testing part-payments.
- `ui.mjs <groupId>` / `ui2.mjs`: browser-mode checks for the register, the QR fallback, the treasurer recovery link, CSV export and edit.

`ui2.mjs` reads `group.json`, which holds the `POST /api/groups` response and the treasurer token. That file is git-ignored.
