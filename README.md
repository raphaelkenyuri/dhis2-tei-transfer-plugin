# DHIS2 TEI Transfer Plugin

Capture app plugin that transfers a tracked entity instance (TEI) to a new org unit.

## Features
- Transfer ownership for a TEI and program to a destination org unit.
- Org unit tree selection with server-side search.
- Manual org unit UID entry fallback if the tree cannot render.
- Validation for missing TEI/program context and same-org-unit transfers.

## Requirements
- DHIS2 Capture app with plugin support.
- Tested with DHIS2 2.42.3.1.

## Usage
1. Open a TEI enrollment in Capture.
2. Click **TRANSFER CASE**.
3. Select a destination org unit (tree or search).
4. Click **Transfer**.

## Behavior Notes
- Ownership transfer uses the tracker endpoint:
  - `PUT /api/tracker/ownership/transfer?trackedEntity=<teiId>&program=<programId>&ou=<destOuId>`
  - If that fails due to an unknown parameter, it retries with:
    - `trackedEntityInstance=<teiId>`
- A transfer is blocked if the destination org unit matches the current org unit.

## Optional Enrollment Org Unit Update
There is a feature flag in `src/components/TransferModal.tsx`:

```ts
const UPDATE_ENROLLMENT_ORGUNIT = false
```

If set to `true`, the plugin will update the enrollment org unit after a successful ownership transfer.

## Development
Install dependencies and start the dev server:

```sh
yarn install
yarn start
```

## Build

```sh
yarn build
```

## Deploy

```sh
yarn deploy
```
