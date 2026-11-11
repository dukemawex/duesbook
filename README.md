# DuesBook: group dues in NIM, with a register that keeps itself

**Live Mini App:** https://duesbook-app.vercel.app · **Category:** Pay · **License:** MIT

DuesBook is a [Nimiq Pay](https://nimiq.com/nimiq-pay/) Mini App for the treasurer of any group that collects **recurring dues**: estate and residents' associations (security and waste levies), alumni sets, cooperatives, church and mosque groups, age-grade and *ajo/esusu* meetings, and sports clubs.

Today this runs on bank transfers, WhatsApp screenshots and a hand-kept Excel sheet. DuesBook replaces that with:

1. **One link for the whole group.** The treasurer sets the amount, how often (monthly, weekly or one-off) and the member names.
2. **One-tap payment in Nimiq Pay.** Members pick their name once, and DuesBook lists every period they still owe.
3. **A register built from the blockchain.** Each payment carries a short public tag (`DB1:<group>:<period>:<member>`) in its transaction data. DuesBook reads the treasurer's address history from the Nimiq chain and builds the paid, part-paid and unpaid grid with arrears. Nobody has to send screenshots, and the records can't be edited.
4. **Treasurer tools.** Send unpaid members a reminder on WhatsApp, export a CSV with transaction hashes, see a live ₦ equivalent, and edit the member list.

DuesBook is **non-custodial**. Money goes straight from each member's wallet to the treasurer's address. DuesBook never holds funds or keys.

## How it uses Nimiq Pay

| Feature | Nimiq API |
| --- | --- |
| Wait for host, typed provider | `init()` from `@nimiq/mini-app-sdk` |
| Fill in the treasurer address | `listAccounts()` |
| Show payer balance before paying, block if insufficient | `getBalance()` |
| Pay dues with an on-chain tag | `sendBasicTransactionWithData({ recipient, value, data })` |
| Match network (mainnet/testnet) | `getHostNetwork()` |
| Friendly cancel/failure messages | `NimiqProviderError` (`PERMISSION_DENIED`, `INVALID_TRANSACTION`, …) |
| Confirm payment and rebuild the register | Nimiq JSON-RPC `getTransactionByHash`, `getTransactionsByAddress` (public Nimiq Watch RPC) |

The app doesn't treat a returned hash as proof of payment. It polls the chain until the transaction is in a block with `executionResult: true`, as the Nimiq docs recommend.

Outside Nimiq Pay, for example in a desktop browser, the register still works. The pay sheet shows a `nimiq:` payment QR code with the amount and tag filled in, so a member can pay from any Nimiq wallet and still be matched.

## For judges: test in 2 minutes

1. In **Nimiq Pay → Mini Apps**, open `https://duesbook-app.vercel.app`.
2. Tap **+ New group**, then **Use my Nimiq Pay address**. Set a small amount, for example `1` NIM, keep **Monthly**, add 2–3 names (one of them yours) and tap **Create group**.
3. Tap **Share invite**. This is the link your members would get.
4. Under **Which member are you?**, tap your name. Your outstanding period appears. Tap **Pay 1 NIM** and approve in Nimiq Pay.
5. Within a few seconds the sheet shows **✓ Paid and confirmed** with the block number and a Nimiq Watch link. The register marks you **✓ paid**, and the progress bar and totals update.
6. Try **Remind unpaid on WhatsApp** and **Export CSV**.

Testnet works too: switch Nimiq Pay to testnet (hold Settings for 10 s, then pick Testnet) and claim free NIM. Groups made on testnet are labelled and read from the testnet chain.

## Architecture

```
Nimiq Pay WebView ──► DuesBook (Vite + Vue 3 + TS, static on Vercel)
   │  @nimiq/mini-app-sdk: listAccounts / getBalance / sendBasicTransactionWithData
   │
   ├─► /api/groups        (Vercel Function) create a group → Upstash Redis
   ├─► /api/groups/:id    GET group · PUT edit (treasurer token, stored hashed)
   ├─► rpc.nimiqwatch.com getTransactionsByAddress / getTransactionByHash  (ledger)
   └─► CoinGecko simple/price (live NIM→NGN for display only)
```

- `src/lib/core.ts` holds the pure logic: address checksum, periods, tag encoding, ledger and CSV. It's covered by `src/lib/core.test.ts`.
- The server stores only the group name, member names, the treasurer address, the amount and the schedule. The treasurer's edit token is stored as a SHA-256 hash. The app tells users this before they create a group.
- The amount, schedule, network and treasurer address can't be changed after creation, so past records stay consistent.

## Tested

- **Unit:** `npm test` runs 16 vitest checks: address checksum against real chain addresses, periods, the tag codec (including a real testnet payload), ledger rules (duplicates, other groups, failed transactions, unknown members, part-payments) and CSV.
- **End-to-end on Nimiq testnet** (`e2e/`, against the production deployment):
  - The treasurer creates a group using `listAccounts`.
  - The member sees their balance (`getBalance`), cancels once and gets a friendly `PERMISSION_DENIED` message, then pays with `sendBasicTransactionWithData`.
  - The app confirms the payment on-chain in about 5 s, and the treasurer's register flips to **paid**.
  - Part-payments (1 + 1 of 2 NIM) show as part-paid, then paid. Untagged and other-group transactions are ignored.
  - The API rejects bad addresses, zero amounts and wrong treasurer tokens, and amounts can't be changed after creation.

## Run locally

```bash
npm install
npm test          # unit tests (vitest)
npm run build     # type-check + production build
vercel dev        # app + API; needs UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
```

To open it inside Nimiq Pay from your machine, run `npm run dev -- --host` and enter the LAN URL under Mini Apps → Custom URL.

## Environment

| Variable | Purpose |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint (group storage) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token (server only, never shipped to the browser) |

There are no other secrets, and no private keys anywhere.

## Built for

The Nimiq Mini Apps Competition, Cycle III (Pay category), by [Emmanuel Duke](https://github.com/dukemawex) / DUKERS LTD, Lagos.

## License

MIT, see [LICENSE](LICENSE).
