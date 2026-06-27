#!/bin/bash
# Application Files Backup Script with Google Drive Upload
# Backs up critical application files and configuration

set -e  # Exit on error

# Configuration
APP_DIR="/var/www/MontrAI"
BACKUP_DIR="/backups/app"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="montrai_app_backup_$TIMESTAMP"
GDRIVE_REMOTE="gdrive:MontrAI-Backups/app"
LOG_FILE="/var/log/app-backup.log"
RETENTION_DAYS_LOCAL=7

# Create backup directory
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting application backup: $BACKUP_NAME"

# Create temporary backup directory
TEMP_DIR="$BACKUP_DIR/$BACKUP_NAME"
mkdir -p "$TEMP_DIR"

# Backup environment files
log "Backing up environment files..."
if [ -f "$APP_DIR/.env.local" ]; then
    cp "$APP_DIR/.env.local" "$TEMP_DIR/.env.local"
    log "Copied .env.local"
fi

if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" "$TEMP_DIR/.env"
    log "Copied .env"
fi

# Backup PM2 ecosystem configuration
log "Backing up PM2 configuration..."
if [ -f "$APP_DIR/ecosystem.config.js" ]; then
    cp "$APP_DIR/ecosystem.config.js" "$TEMP_DIR/ecosystem.config.js"
    log "Copied ecosystem.config.js"
fi

# Backup any local uploads (if using local storage)
if [ -d "$APP_DIR/uploads" ]; then
    log "Backing up uploads directory..."
    cp -r "$APP_DIR/uploads" "$TEMP_DIR/uploads"
    log "Copied uploads directory"
fi

# Backup custom scripts
if [ -d "$APP_DIR/scripts" ]; then
    log "Backing up scripts directory..."
    cp -r "$APP_DIR/scripts" "$TEMP_DIR/scripts"
    log "Copied scripts directory"
fi

# Create backup info file
cat > "$TEMP_DIR/backup-info.txt" << EOF
Backup Date: $(date)
Hostname: $(hostname)
App Directory: $APP_DIR
Node Version: $(node --version)
NPM Version: $(npm --version)
PM2 Version: $(pm2 --version)
Git Commit: $(cd "$APP_DIR" && git rev-parse HEAD 2>/dev/null || echo "N/A")
Git Branch: $(cd "$APP_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "N/A")
EOF

log "Created backup info file"

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

# Clean up old local backups (keep last 7 days)
log "Cleaning up old local backups (keeping last $RETENTION_DAYS_LOCAL days)..."
find "$BACKUP_DIR" -name "montrai_app_backup_*.tar.gz" -type f -mtime +$RETENTION_DAYS_LOCAL -delete 2>&1 | tee -a "$LOG_FILE"

# Calculate total backup count
LOCAL_COUNT=$(find "$BACKUP_DIR" -name "montrai_app_backup_*.tar.gz" -type f | wc -l)
log "Local backups retained: $LOCAL_COUNT"

log "Application backup completed successfully: $BACKUP_NAME"
log "----------------------------------------"

exit 0
