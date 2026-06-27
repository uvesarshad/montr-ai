#!/bin/bash
# Setup script for rclone with Google Drive
# Run this once to configure rclone for Google Drive backups

set -e

echo "MontrAI - Google Drive Backup Setup"
echo "===================================="
echo ""

# Check if rclone is installed
if ! command -v rclone &> /dev/null; then
    echo "Installing rclone..."
    curl https://rclone.org/install.sh | sudo bash
    echo "✅ rclone installed successfully"
else
    echo "✅ rclone is already installed"
    rclone version
fi

echo ""
echo "Configuring rclone for Google Drive..."
echo ""
echo "Follow these steps:"
echo "1. Choose 'n' for new remote"
echo "2. Enter name: gdrive"
echo "3. Choose storage type: Google Drive (usually option 15)"
echo "4. Leave client_id and client_secret blank (press Enter)"
echo "5. Choose scope: 1 (Full access)"
echo "6. Leave root_folder_id blank (press Enter)"
echo "7. Leave service_account_file blank (press Enter)"
echo "8. Choose 'n' for advanced config"
echo "9. Choose 'y' for auto config (this will open a browser)"
echo "10. Authenticate with your Google account"
echo "11. Choose 'y' to confirm"
echo "12. Choose 'q' to quit config"
echo ""

read -p "Press Enter to start rclone configuration..."

rclone config

echo ""
echo "Testing Google Drive connection..."
if rclone lsd gdrive: > /dev/null 2>&1; then
    echo "✅ Google Drive connection successful!"
else
    echo "❌ Google Drive connection failed. Please run 'rclone config' again."
    exit 1
fi

echo ""
echo "Creating backup directory on Google Drive..."
rclone mkdir gdrive:MontrAI-Backups
rclone mkdir gdrive:MontrAI-Backups/mongodb
rclone mkdir gdrive:MontrAI-Backups/app

echo ""
echo "✅ Google Drive backup setup completed!"
echo ""
echo "You can now run the backup scripts:"
echo "  - ./scripts/mongodb-backup-gdrive.sh"
echo "  - ./scripts/app-backup-gdrive.sh"
echo ""
echo "To view your backups on Google Drive:"
echo "  rclone ls gdrive:MontrAI-Backups/mongodb"
echo "  rclone ls gdrive:MontrAI-Backups/app"
