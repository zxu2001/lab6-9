# Receipt Storage Design

| Decisions | D13, D27, D10 |
| --- | --- |
| Requirements | FR-009, FR-039, NFR-014 |
| Rules | BR-RCP-01–06 |
| Assumptions | DA-10, DA-24 |
| UML | [34_Sequence_Upload_Receipt](../uml/34_Sequence_Upload_Receipt.puml) |
| Tests | UT-RCP-01–05, IT-DB-10, IT-MVC-08, SEC-15–SEC-17, AT-D13, AT-D27 |

## 1. Storage model

- `receipts`: metadata (`content_type`, `size_bytes`, `sha256`, sanitized `original_filename`, uploader, time, `expense_id`, `group_id`).
- `receipt_contents`: `BYTEA` bytes in a separate table, so listing and version queries never load content. JPA maps it as a separate infrastructure entity, loaded only by `ReceiptService.download`.
- `expense_version_receipts`: version ↔ receipt links with `display_order` 1–10. Each version's receipt set is immutable. Unchanged receipts are re-linked by reference in new versions.
- No S3 and no filesystem storage (D13).

## 2. Interface

```
ReceiptService
  ValidatedReceipt validate(ReceiptUpload upload)                          // pure; no DB
  List<Long> storeForVersion(Expense e, ExpenseVersion v,
                             List<ValidatedReceipt> newOnes, List<Long> retainedIds, long actor, Instant now)
                                                                           // called inside the create/edit TX
  ReceiptDownload download(long actor, long groupId, long receiptId)       // TX(RO)
  List<ReceiptMetadataView> listForVersion(long actor, long expenseId, int versionNumber)   // TX(RO)
ReceiptContentInspector (application.integration; impl infrastructure.receipt.MagicByteReceiptInspector)
  DetectedType detect(byte[] bytes)          // JPEG | PNG | PDF | UNKNOWN
  boolean imageDecodes(byte[] bytes)         // ImageIO.read(...) != null, with a 40-megapixel dimension cap
ReceiptDownload(String contentType, String safeFilename, long size, byte[] content)
```

## 3. Validation (BR-RCP-01/02)

| Check | Rule | Error code |
| --- | --- | --- |
| Count | ≤ 10 receipts in the resulting version (retained + new) | `RECEIPT_LIMIT` |
| Size | 1 byte ≤ size ≤ 10 MiB. Also enforced by `spring.servlet.multipart.max-file-size=10MB`. | `RECEIPT_TOO_LARGE`, `RECEIPT_EMPTY` |
| Type by content | Magic bytes: JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; PDF `25 50 44 46 2D` (`%PDF-`). The declared `Content-Type` and the extension are **ignored** for decisions. | `RECEIPT_TYPE_NOT_ALLOWED` |
| Image integrity | JPEG/PNG must decode with `ImageIO`. Dimensions ≤ 40 MP (decompression-bomb guard). | `RECEIPT_CORRUPT` |
| PDF sanity | Header `%PDF-`, `%%EOF` within the last 1 KiB. No rendering is done server-side. | `RECEIPT_CORRUPT` |
| Filename | Strip path components and control characters; keep `[A-Za-z0-9._ -]`; max 255; empty → `receipt-<n>.<ext>`. The extension is replaced by the detected type's canonical extension. | n/a |
| Ownership of retained IDs | Each retained receipt belongs to the same expense and is linked to its current version | `RECEIPT_NOT_IN_EXPENSE` |

`sha256` is computed for integrity and audit. It is not used for deduplication.

## 4. Upload flow

Uploads are part of the multipart **create/edit expense form**. There is no separate upload endpoint, so a receipt can never exist detached from a version.

1. The controller receives `MultipartFile[]` and converts them to `ReceiptUpload` (bytes read in memory; ≤ 10 × 10 MiB).
2. `ExpenseService` validates them (step 2 of creation/edit) before any insert.
3. In the same transaction: insert `receipts` and `receipt_contents`, then the links. Any failure rolls back all of them along with the expense or version.
4. Audit: receipt IDs and hashes in `EXPENSE_CREATED` / `EXPENSE_VERSION_CREATED` details.

Any receipt change (add, remove, replace) is an edit: a new version with restarted approval (D27). Replacing a receipt = removing it from the retained set + adding the new file.

## 5. Download (DA-10)

1. Load `receipts` by ID **and** `group_id` (from the URL). Mismatch → 404.
2. `authz.requireExpenseReadAccess(actor, expense)`. This includes involvement-only access for inactive members, and read access for archived groups.
3. Load `receipt_contents`.
4. Response headers: `Content-Type: <stored type>`, `Content-Disposition: attachment; filename*=UTF-8''<safe>`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, CSP `default-src 'none'`.
5. Images may be shown as thumbnails in the expense page through the same authorized endpoint with `?inline=true`, allowed **only** for `image/jpeg` and `image/png` (`Content-Disposition: inline`). PDFs are always downloaded as attachments.

## 6. Historical integrity

Receipt rows and links are immutable and never deleted (trigger `trg_immutable_row`, no grants). Each version's receipt set is permanently reproducible.
