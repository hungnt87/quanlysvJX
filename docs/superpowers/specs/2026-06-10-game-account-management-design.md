# Game Account Management Design

## Context

The manager currently controls JX services, logs, and backups through a Fastify API and a React/Mantine UI. It does not yet expose game account operations.

The MSSQL container `jxmssql` hosts the `account_tong` database. The account tables relevant for this iteration are:

- `dbo.Account_Info`: primary account row, keyed by `cAccName`.
- `dbo.Account_Habitus`: account time/expiry row, keyed by `cAccName`.
- `dbo.Account_Info2`: legacy alternate account table that must be checked for duplicate account names.
- `dbo.Account_Ban`: ban records used for soft deletion.

Existing procedures such as `dbo.AddAccount` and `dbo.AddAccountJudg` are not suitable for the new manager flow because they hardcode password values and old expiry dates. The manager will implement account operations in API code with explicit validation and MSSQL transactions.

## Decisions

- Build account management as a new manager feature with both API and UI.
- Add a top-level UI tab named `Tài khoản game`.
- Use Mantine UI components and `@mantine/form` for create/edit modals.
- List accounts with search by account name and pagination. Default page size is `10`.
- Create account in a modal, not as an inline page form.
- Edit only password, secondary password, expiry date, and `iLeftSecond`.
- Do not allow editing `cAccName` in this iteration.
- Do not expose `nExtPoint...nExtPoint7`, OTP, or account profile fields in this iteration.
- Store passwords as uppercase MD5 strings to match the existing game database format.
- Do not return password hashes to the UI.
- Treat `DELETE` as soft deletion by banning the account. Do not physically delete rows from account tables.
- Keep banned accounts visible in the list with status `Đã ban`.
- Do not write `Account_sub_Info` in this iteration.

## Recommended Approach

Add a small account-management module to the existing app:

- Fastify remains the API framework.
- React, Mantine, TanStack Query, and notifications remain the UI stack.
- A new MSSQL repository encapsulates all knowledge of legacy tables.
- Service functions own validation-adjacent business rules such as hashing, duplicate checks, and soft-delete behavior.
- Database writes run in MSSQL transactions so `Account_Info` and `Account_Habitus` cannot diverge during create/update operations.

This keeps the legacy database surface isolated while giving the UI enough functionality for daily account administration.

## Backend Architecture

Add a feature folder under `apps/api/src/gameAccounts/`:

- `accountSchemas.ts`: zod schemas and exported request/response types.
- `passwordHash.ts`: converts plain text passwords to uppercase MD5 hashes.
- `gameAccountRepository.ts`: MSSQL data access for list, find, create, update, and soft-delete.
- `gameAccountService.ts`: orchestrates validation, duplicate checks, hashing, and transactions.

Add `apps/api/src/routes/gameAccountRoutes.ts` and register it from `apps/api/src/app.ts`.

Add MSSQL connection configuration to `ManagerConfig` using environment variables: `MSSQL_HOST`, `MSSQL_PORT`, `MSSQL_USER`, `MSSQL_PASSWORD`, `MSSQL_DATABASE`, `MSSQL_ENCRYPT`, and `MSSQL_TRUST_SERVER_CERTIFICATE`. The implementation must not hardcode the compose password in source code. Local Docker defaults may cover host, port, database, encryption, and certificate trust, but username and password must come from environment variables.

## API Design

All endpoints keep the existing envelope format `{ success, data, error }`.

### List accounts

`GET /api/game-accounts?search=&page=1&pageSize=10`

Returns accounts from `Account_Info`, left joined to `Account_Habitus`.

Response shape:

```ts
type GameAccountListResponse = {
  items: GameAccountView[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type GameAccountView = {
  accountName: string;
  expiresAt: string | null;
  leftSeconds: number | null;
  usedSeconds: number | null;
  status: 'active' | 'banned';
};
```

Search is case-insensitive where the database collation supports it. Page numbers are 1-based. `pageSize` defaults to `10` and is capped at `100` to prevent large scans.

### Create account

`POST /api/game-accounts`

Request shape:

```ts
type CreateGameAccountRequest = {
  accountName: string;
  password: string;
  secondaryPassword: string;
  expiresAt: string;
  leftSeconds: number;
};
```

Behavior:

1. Validate account name, passwords, expiry date, and `leftSeconds`.
2. Check duplicate `cAccName` in `Account_Info` and `Account_Info2`.
3. Hash `password` into `cPassWord` and `secondaryPassword` into `cSecPassWord`.
4. Insert `Account_Info` with default extension/service fields: `nExtPoint` through `nExtPoint7` set to `1`, `bParentalControl = 0`, `bIsBanned = 0`, `bIsUseOTP = 0`, `iOTPSessionLifeTime = 1`, and `iServiceFlag = 0`.
5. Insert `Account_Habitus` with `cAccName`, `iLeftSecond`, `dEndDate`, and `iUseSecond = 0`.
6. Commit only if both inserts succeed.

### Update account

`PATCH /api/game-accounts/:accountName`

Request shape:

```ts
type UpdateGameAccountRequest = {
  password?: string;
  secondaryPassword?: string;
  expiresAt: string;
  leftSeconds: number;
};
```

Behavior:

- `accountName` is path-only and cannot be changed.
- Empty password fields from the UI should be omitted before sending. Omitted password fields are not changed.
- If a password field is present, hash it before updating the database.
- Update `Account_Info` for password fields and `Account_Habitus` for expiry/time fields in one transaction.
- Return `404` if the account does not exist in `Account_Info`.

### Soft delete account

`DELETE /api/game-accounts/:accountName`

This endpoint bans the account instead of deleting rows.

Behavior:

1. Return `404` if the account does not exist.
2. Set `Account_Info.bIsBanned = 1`.
3. If no `Account_Ban` row exists, insert one with:
   - `cAccName`: account name
   - `dStartDate`: current server time
   - `dEndDate`: `2050-10-10 10:10:10`
   - `iEndTime`: `0`
   - `cReason`: `Deleted from manager`
   - `cOperator`: `manager`
   - `bIsBannedForever`: `1`
4. If the account is already banned, return success and keep the existing ban row.

## UI Design

Add `apps/ui/src/features/gameAccounts/` with focused components:

- `GameAccountPanel`: owns search, pagination, query state, and modal state.
- `GameAccountTable`: renders account rows and actions.
- `CreateGameAccountModal`: Mantine modal with `@mantine/form`.
- `EditGameAccountModal`: Mantine modal with `@mantine/form`.
- `SoftDeleteAccountModal`: confirmation modal that explains the account will be banned, not physically deleted.

Add a top-level tab to `App.tsx`:

- `Bảng điều khiển & Logs`
- `Sao lưu`
- `Tài khoản game`

The account page contains:

- Search input by account name.
- `Thêm tài khoản` button that opens the create modal.
- Account table with columns: `Tài khoản`, `Ngày hết hạn`, `iLeftSecond`, `Trạng thái`, `Thao tác`.
- Pagination shown when total rows exceed `10`.
- Status badge: `Hoạt động` for active accounts and `Đã ban` for banned accounts.

The page should stay operational and compact, matching the current manager UI style. It should not use a marketing layout or decorative cards.

## Mantine Form Design

Use `@mantine/form` instead of manually coordinating many `useState` fields.

Create modal form:

- `accountName`: required, max 32 chars, allowed characters are letters, numbers, `_`, and `-`.
- `password`: required.
- `confirmPassword`: must match `password`.
- `secondaryPassword`: required.
- `confirmSecondaryPassword`: must match `secondaryPassword`.
- `expiresAt`: required, defaults to one year after the current date.
- `leftSeconds`: integer, min `0`, defaults to `0`.

Edit modal form:

- `accountName`: display-only.
- `password`: optional. Empty means do not change the current password.
- `confirmPassword`: required only when `password` is provided and must match.
- `secondaryPassword`: optional. Empty means do not change the current secondary password.
- `confirmSecondaryPassword`: required only when `secondaryPassword` is provided and must match.
- `expiresAt`: required.
- `leftSeconds`: integer, min `0`.

The forms should use `form.getInputProps(...)` and `form.onSubmit(...)`. Because these modals are small, controlled mode is acceptable.

## Data Flow

1. `GameAccountPanel` calls `GET /api/game-accounts` with current `search`, `page`, and `pageSize`.
2. Search changes reset the page to `1`.
3. Create, update, and soft-delete use TanStack Query mutations.
4. Successful mutations close the modal, show a success notification, and invalidate the account list query.
5. Failed mutations show the API error message through existing notification patterns.
6. The API never sends password hashes back to the UI.

## Error Handling

- Invalid account name or password input returns `400`.
- Duplicate account name in `Account_Info` or `Account_Info2` returns `400` with a clear message.
- Missing account on update/delete returns `404`.
- MSSQL errors are logged server-side with context and returned as safe API errors.
- Create/update transaction failure rolls back all partial writes.
- Soft delete is idempotent for already banned accounts.

## Testing

Backend tests:

- Password hashing produces uppercase MD5 and does not return raw passwords.
- List validates pagination defaults and search behavior.
- Create rejects duplicate accounts from both `Account_Info` and `Account_Info2`.
- Create inserts `Account_Info` and `Account_Habitus` in one transaction.
- Create rolls back when the second insert fails.
- Update changes only provided password fields and account time fields.
- Soft delete sets `bIsBanned` and inserts `Account_Ban` only when needed.

Frontend tests:

- Account page renders search, table, pagination, and `Thêm tài khoản`.
- Search updates the query and resets to page `1`.
- Create modal validates required fields and matching passwords.
- Edit modal allows blank password fields without sending password updates.
- Delete modal labels the action as banning the account.
- Successful mutations close modals and refresh the list.

## Out of Scope

- Physical deletion of account rows.
- Editing account names.
- Editing `nExtPoint...nExtPoint7`.
- OTP management.
- `Account_sub_Info` profile data.
- Character management in game shard databases.
- Authentication for the manager itself.
- Bulk import or batch account creation.
