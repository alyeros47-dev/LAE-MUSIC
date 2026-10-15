# Music Marketplace — foundation prototype

Independent Node.js/Express foundation for Music Marketplace. This is a **static prototype**, not a finished streaming or payment platform.

## Run locally

```bash
npm install
npm start
```

Visit http://localhost:3000. Health endpoint: `/health`.

## Render deployment

- Create a new GitHub repository (do not reuse Learn & Earn).
- Upload these files to the repository root.
- Render: New Web Service → connect repository.
- Runtime: Node; Build command: `npm install`; Start command: `npm start`.
- No database or payment secrets required for this prototype.

## Planned modules (not implemented)

- Creator/listener registration and permissions
- Memberships and referral relationships
- Music uploads, review, Cloudflare R2 integration
- Streaming player, genres, discovery, search
- Paid downloads, royalty ledger, payouts
- Likes, comments, follows, gifting and tokens
- Anti-fraud, moderation, rights declarations and admin dashboard

Do not accept real money or copyrighted uploads until rights, security, accounting, and payment flows are tested.
