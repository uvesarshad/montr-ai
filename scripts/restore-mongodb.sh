#!/bin/bash
# MongoDB Restore Script from Google Drive Backup
# Lists available backups and restores selected backup

set -e  # Exit on error

# Configuration
BACKUP_DIR="/backups/mongodb"
RESTORE_DIR="/tmp/mongodb-restore"
MONGODB_URI="${MONGODB_URI:-mongodb://montrai_app:PASSWORD@localhost:27017/montrai?authSource=montrai}"
GDRIVE_REMOTE="gdrive:MontrAI-Backups/mongodb"
LOG_FILE="/var/log/mongodb-restore.log"

# Create directories
mkdir -p "$BACKUP_DIR"
mkdir -p "$RESTORE_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting MongoDB restore process"

# List available backups from Google Drive
echo "Fetching available backups from Google Drive..."
echo "================================================"
rclone ls "$GDRIVE_REMOTE" | grep "montrai_backup_.*\.tar\.gz" | sort -r

echo ""
echo "Available local backups:"
echo "================================================"
ls -lh "$BACKUP_DIR" | grep "montrai_backup_.*\.tar\.gz" || echo "No local backups found"

echo ""
read -p "Enter backup filename to restore (e.g., montrai_backup_20260122_120000.tar.gz): " BACKUP_FILE

if [ -z "$BACKUP_FILE" ]; then
    echo "ERROR: No backup file specified"
    exit 1
fi

# Check if backup exists locally
if [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
    log "Using local backup: $BACKUP_FILE"
    BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILE"
else
    # Download from Google Drive
    log "Downloading backup from Google Drive: $BACKUP_FILE"
    if rclone copy "$GDRIVE_REMOTE/$BACKUP_FILE" "$BACKUP_DIR" --progress; then
        log "Download completed successfully"
        BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILE"
    else
        log "ERROR: Failed to download backup from Google Drive"
        exit 1
    fi
fi

# Verify backup file exists
if [ ! -f "$BACKUP_PATH" ]; then
    log "ERROR: Backup file not found: $BACKUP_PATH"
    exit 1
fi

# Extract backup
log "Extracting backup..."
rm -rf "$RESTORE_DIR"/*
if tar -xzf "$BACKUP_PATH" -C "$RESTORE_DIR"; then
    log "Extraction completed successfully"
else
    log "ERROR: Failed to extract backup"
    exit 1
fi

# Find the backup directory
BACKUP_SUBDIR=$(find "$RESTORE_DIR" -maxdepth 1 -type d -name "montrai_backup_*" | head -n 1)

if [ -z "$BACKUP_SUBDIR" ]; then
    log "ERROR: Could not find backup directory in extracted files"
    exit 1
fi

log "Found backup directory: $BACKUP_SUBDIR"

# Confirm restoration
echo ""
echo "WARNING: This will replace all data in the MongoDB database!"
echo "Database: montrai"
echo "Backup: $BACKUP_FILE"
echo ""
read -p "Are you sure you want to proceed? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    log "Restore cancelled by user"
    exit 0
fi

# Restore MongoDB
log "Restoring MongoDB from backup..."
if mongorestore --uri="$MONGODB_URI" --drop "$BACKUP_SUBDIR" 2>&1 | tee -a "$LOG_FILE"; then
    log "MongoDB restore completed successfully"
else
    log "ERROR: MongoDB restore failed"
    exit 1
fi

# Verify restoration
log "Verifying restoration..."
MONGO_DB=$(echo "$MONGODB_URI" | sed 's/.*\/\([^?]*\).*/\1/')

# Count documents in key collections
echo ""
echo "Verification - Document counts:"
echo "================================"
mongosh "$MONGODB_URI" --quiet --eval "
    db.users.countDocuments().then(count => print('Users: ' + count));
    db.canvases.countDocuments().then(count => print('Canvases: ' + count));
    db.documents.countDocuments().then(count => print('Documents: ' + count));
" 2>&1 | tee -a "$LOG_FILE"

# Clean up
log "Cleaning up temporary files..."
rm -rf "$RESTORE_DIR"/*

log "Restore completed successfully!"
log "----------------------------------------"

echo ""
echo "✅ MongoDB has been restored from backup: $BACKUP_FILE"
echo "Please verify your application is working correctly."

exit 0
