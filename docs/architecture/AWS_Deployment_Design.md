# AWS Deployment Design

> **Design only.** No AWS resources are provisioned in this phase (D12). All names are placeholders.

| Decisions | D06, D12, D13 (receipts in RDS, no S3), D31 (SES), D32 (Flyway) |
| --- | --- |
| Assumptions | DA-30 (single instance, in-memory sessions) |
| Diagram | [12_AWS_Deployment_Diagram](../uml/12_AWS_Deployment_Diagram.puml) |
| Related | [Security_Architecture](Security_Architecture.md) · [Flyway_Migration_Plan](../database/Flyway_Migration_Plan.md) |

## 1. Topology

| Element | Design |
| --- | --- |
| Region | One region (e.g., `us-east-2`). |
| VPC | `10.20.0.0/16` across 2 Availability Zones |
| Public subnets (2) | Application Load Balancer (ALB) and NAT gateway |
| Private app subnets (2) | EC2 application instance (one in the MVP). An Auto Scaling group of min = max = 1 gives self-healing. |
| Private DB subnets (2) | RDS subnet group. Single-AZ for course/demo; **Multi-AZ** recommended for production. |
| Load balancer | ALB, HTTPS listener :443 with an ACM certificate (TLS policy `ELBSecurityPolicy-TLS13-1-2-2021-06`). Listener :80 redirects to 443. Target group HTTP :8080 (inside the VPC). Health check `/actuator/health/liveness`. |
| Cost alternative | No ALB: an Elastic IP on the instance in a public subnet, with nginx terminating TLS (Let's Encrypt / certbot) → `localhost:8080`. The same app config applies (`forward-headers-strategy=native`). |
| DNS | Route 53 record `app.splitsmart.example` → ALB alias |
| EC2 | Amazon Linux 2023, `t3.small` (MVP), Amazon Corretto 21, the app as a systemd service (`splitsmart.service`) running `java -jar /opt/splitsmart/splitsmart.jar --spring.profiles.active=prod`. IMDSv2 required. No SSH; access via SSM Session Manager. EBS encrypted. |
| RDS | PostgreSQL 16, `db.t4g.small`, 20 GiB gp3 storage with autoscaling. Encryption at rest (KMS). Parameter group `rds.force_ssl=1`. Automated backups 7 days. Deletion protection on. Performance Insights optional. |
| SES | Verified domain identity `splitsmart.example` with DKIM (Easy DKIM), SPF, DMARC, and custom MAIL FROM. Production access requested (out of sandbox). Configuration set with bounce/complaint event publishing to SNS (monitoring only). |
| Secrets | Secrets Manager: `splitsmart/prod/db-app` (username, password, host, port, dbname). Optional SSM Parameter Store for non-secret config (`/splitsmart/prod/app/base-url`). |
| Logs and metrics | CloudWatch agent ships `journalctl` app logs. Alarms: ALB 5xx, target unhealthy, RDS CPU/storage, SES bounce rate. |

## 2. Security groups

| SG | Inbound | Outbound |
| --- | --- | --- |
| `sg-alb` | 443, 80 from `0.0.0.0/0` (and `::/0`) | 8080 to `sg-app` |
| `sg-app` | 8080 from `sg-alb` only | 5432 to `sg-db`; 443 to the internet via NAT (SES, Secrets Manager, SSM endpoints, or VPC endpoints) |
| `sg-db` | 5432 from `sg-app` only | none |

VPC interface endpoints for `secretsmanager`, `ssm`, `ssmmessages`, `ec2messages`, `logs`, and `email-smtp`/`email` are recommended to reduce NAT exposure.

## 3. IAM (least privilege)

EC2 instance role `splitsmart-app-role`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "ReadDbSecret", "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:splitsmart/prod/db-app-*" },
    { "Sid": "SendAuthEmailOnly", "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "arn:aws:ses:REGION:ACCOUNT:identity/splitsmart.example",
      "Condition": { "StringEquals": { "ses:FromAddress": "no-reply@splitsmart.example" } } },
    { "Sid": "Logs", "Effect": "Allow",
      "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:REGION:ACCOUNT:log-group:/splitsmart/prod/*" }
  ]
}
```

Plus the AWS-managed `AmazonSSMManagedInstanceCore` for Session Manager. Deployers use a separate CI/ops role. The app role has no `rds:*`, `s3:*`, or `iam:*` permissions.

## 4. Database roles

| Role | Privileges | Used by |
| --- | --- | --- |
| `splitsmart_owner` | Owns the schema; DDL | Flyway (migration step only) |
| `splitsmart_app` | `SELECT, INSERT, UPDATE` on mutable tables; **`SELECT, INSERT` only** on `payments`, `audit_events`, `expense_allocations`, `expense_version_receipts`, `receipts`, `receipt_contents`; no `DELETE` on any financial table; `UPDATE` on `expense_versions` limited by trigger to status/timestamp columns | Running application |

Flyway runs as `splitsmart_owner` at deployment, as a separate step (`flyway migrate` via the Maven plugin or the Flyway CLI in the release pipeline). The application starts with `spring.flyway.enabled=false` in prod and `ddl-auto=validate`, so a schema mismatch fails startup. Dev and test may run Flyway at startup. See the [Flyway_Migration_Plan](../database/Flyway_Migration_Plan.md).

## 5. Application configuration (prod profile)

| Property | Value / source |
| --- | --- |
| `spring.datasource.url` | `jdbc:postgresql://${DB_HOST}:5432/splitsmart?sslmode=verify-full&sslrootcert=/opt/splitsmart/rds-ca.pem` |
| `spring.datasource.username/password` | From the Secrets Manager import (`spring.config.import=aws-secretsmanager:splitsmart/prod/db-app`), or environment variables injected by the systemd unit from a root-only env file fetched at boot |
| `spring.jpa.hibernate.ddl-auto` | `validate` |
| `spring.jpa.open-in-view` | `false` |
| `spring.flyway.enabled` | `false` (prod; migrations are a separate step) |
| `server.forward-headers-strategy` | `native` |
| `server.servlet.session.cookie.secure/http-only/same-site` | `true` / `true` / `lax` |
| `server.servlet.session.timeout` | `30m` |
| `spring.servlet.multipart.max-file-size / max-request-size` | `10MB` / `105MB` |
| `splitsmart.email.provider` | `ses` (prod), `mock` (dev/test) |
| `splitsmart.email.from` | `no-reply@splitsmart.example` |
| `splitsmart.base-url` | `https://app.splitsmart.example` (used to build verification and reset links; never derived from the `Host` header) |
| `management.endpoints.web.exposure.include` | `health` only; `health` details hidden |

HikariCP: `maximum-pool-size=10`, `connection-timeout=5s`. PostgreSQL `lock_timeout=5s` and `statement_timeout=15s` are set per session (prevents unbounded waits on the group ledger lock).

## 6. Release process (documented, not automated here)

1. `mvn verify` (unit + Testcontainers integration tests) on CI.
2. Build the immutable JAR and upload it to the artifact store (CI artifact or a private bucket; receipts never go there).
3. Take a pre-migration RDS snapshot.
4. Run Flyway `migrate` as `splitsmart_owner`.
5. Deploy the JAR to EC2 (SSM Run Command), restart the systemd service, and wait for the ALB health check.
6. Smoke test: login page, health endpoint, a test-account login.
7. Rollback: redeploy the previous JAR (migrations are backward-compatible by policy). Restore the snapshot only if a migration corrupted data.

## 7. Receipts and database sizing

Receipts are stored as `BYTEA` in RDS (D13). Sizing: with 10 MiB/file and 10 files per version the theoretical maximum is large, so the design budgets ~2 MiB average × 1 receipt per expense × 10 000 expenses ≈ 20 GiB. Storage autoscaling is enabled. Backups include receipts automatically. The `receipt_contents` table is TOAST-compressed by PostgreSQL. It is excluded from routine `SELECT`s (separate table, lazy access).

## 8. Availability and recovery

| Concern | MVP design | Production recommendation |
| --- | --- | --- |
| App instance failure | ASG (1/1) replaces the instance. In-memory sessions are lost, so users sign in again. | 2+ instances with Spring Session JDBC (requires a new decision). |
| DB failure | Automated backups, PITR (RPO ≤ 5 min) | Multi-AZ (RTO ~1–2 min) |
| SES outage | Registration and reset still succeed; emails fail and are logged. Users can resend later. | SES configuration-set alarms |
