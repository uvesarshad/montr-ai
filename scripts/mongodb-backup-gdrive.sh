#!/bin/bash
# MongoDB Backup Script with Google Drive Upload
# Backs up MongoDB database and uploads to Google Drive using rclone

set -e  # Exit on error

# Configuration
BACKUP_DIR="/backups/mongodb"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="montrai_backup_$TIMESTAMP"
MONGODB_URI="${MONGODB_URI:-mongodb://montrai_app:PASSWORD@localhost:27017/montrai?authSource=montrai}"
GDRIVE_REMOTE="gdrive:MontrAI-Backups/mongodb"
LOG_FILE="/var/log/mongodb-backup.log"
RETENTION_DAYS_LOCAL=30
RETENTION_DAYS_GDRIVE=90

# Create backup directory
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting MongoDB backup: $BACKUP_NAME"

# Create MongoDB dump
log "Creating MongoDB dump..."
if mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/$BACKUP_NAME" 2>&1 | tee -a "$LOG_FILE"; then
    log "MongoDB dump completed successfully"
else
    log "ERROR: MongoDB dump failed"
    exit 1
fi

# Compress backup
log "Compressing backup..."
cd "$BACKUP_DIR"
if tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME" 2>&1 | tee -a "$LOG_FILE"; then
    log "Compression completed successfully"
    rm -rf "$BACKUP_NAME"  # Remove uncompressed directory
else
    log "ERROR: Compression failed"
    exit 1
fi

# Get backup size
BACKUP_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
log "Backup size: $BACKUP_SIZE"

# Upload to Google Drive
log "Uploading to Google Drive..."
if rclone copy "${BACKUP_NAME}.tar.gz" "$GDRIVE_REMOTE" --progress 2>&1 | tee -a "$LOG_FILE"; then
    log "Upload to Google Drive completed successfully"
else
    log "ERROR: Upload to Google Drive failed"
    exit 1
fi

# Verify upload
log "Verifying upload..."
if rclone ls "$GDRIVE_REMOTE/${BACKUP_NAME}.tar.gz" > /dev/null 2>&1; then
    log "Upload verified successfully"
else
    log "WARNING: Could not verify upload"
fi

# Clean up old local backups (keep last 30 days)
log "Cleaning up old local backups (keeping last $RETENTION_DAYS_LOCAL days)..."
find "$BACKUP_DIR" -name "montrai_backup_*.tar.gz" -type f -mtime +$RETENTION_DAYS_LOCAL -delete 2>&1 | tee -a "$LOG_FILE"

# Clean up old Google Drive backups (keep last 90 days)
log "Cleaning up old Google Drive backups (keeping last $RETENTION_DAYS_GDRIVE days)..."
rclone delete "$GDRIVE_REMOTE" --min-age "${RETENTION_DAYS_GDRIVE}d" 2>&1 | tee -a "$LOG_FILE"

# Calculate total backup count
LOCAL_COUNT=$(find "$BACKUP_DIR" -name "montrai_backup_*.tar.gz" -type f | wc -l)
log "Local backups retained: $LOCAL_COUNT"

log "Backup completed successfully: $BACKUP_NAME"
log "----------------------------------------"

# Send notification (optional - requires mail setup)
# echo "MongoDB backup completed: $BACKUP_NAME ($BACKUP_SIZE)" | mail -s "MontrAI Backup Success" your-email@example.com

exit 0
