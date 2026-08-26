# 22. Disaster Recovery & Backup Plan

This document outlines backup automation, restoration runbooks, Recovery Point Objectives (RPO), and Recovery Time Objectives (RTO) for FormForge.

---

## 1. Recovery Metrics

| Service Component | Target RPO | Target RTO | Backup Frequency | Storage Location |
|-------------------|------------|------------|------------------|------------------|
| **MongoDB Dataset** | 24 Hours | 30 Minutes | Daily at 02:00 UTC | `formforge_backups` volume |
| **Uploaded Files & Plant Docs** | 24 Hours | 1 Hour | Daily snapshot | `formforge_backups` volume |
| **AI Vector Database** | 24 Hours | 15 Minutes | Re-index or Daily export | `formforge_vector_data` |
| **System Configuration (.env)** | 0 Hours | 10 Minutes | Version control / Vault | Secure Config Repository |

---

## 2. Backup Architecture

Backups are created automatically via `backend/backup.py` or manually via the Settings UI / CLI:

```bash
# Generate complete migration bundle (MongoDB + uploads + vector index)
python backend/backup.py backup
```

Produces an archive file containing:
- `mongo_dump/`: Complete BSON dump generated via `mongodump`.
- `uploads/`: All form attachments, plant documents, assets, and completed PDFs.
- `vector_db/`: Vector database index (`index.json`).
- `manifest.json`: Snapshot metadata and timestamp.

---

## 3. Restore Runbook

```bash
# Standard automated restoration from backup archive
python backend/backup.py restore ./uploads/backups/backup_2026-08-12.tar.gz
```

### Manual Restoration Steps

1. **Stop Application Containers**:
   ```bash
   docker compose stop backend frontend gateway
   ```
2. **Restore MongoDB Data**:
   ```bash
   mongorestore --drop --dir=./backup_extracted/mongo_dump
   ```
3. **Restore File Storage & AI Vector Database**:
   ```bash
   cp -r ./backup_extracted/uploads/* ./backend/uploads/local/
   cp -r ./backup_extracted/vector_db/* ./ai-service/data/vector_db/
   ```
4. **Restart Stack & Verify Health**:
   ```bash
   docker compose up -d
   curl -f http://localhost/api/health
   curl -f http://localhost:9000/health
   ```

---

## 4. Encrypted Archives

Production backups should be encrypted using AES-256:

```bash
# Encrypt backup archive
openssl enc -aes-256-cbc -salt -pbkdf2 -in backup.tar.gz -out backup.tar.gz.enc -pass pass:$BACKUP_ENCRYPTION_KEY
```
