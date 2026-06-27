/**
 * Batch update script to standardize handle styling across all canvas nodes
 * Run this script to update all remaining nodes with centralized handle styles
 */

const fs = require('fs');
const path = require('path');

const NODES_DIR = path.join(__dirname, '../src/components/nodes');

// Files already updated manually
const UPDATED_FILES = [
    'publish-node.tsx',
    'triggers/manual-trigger-node.tsx',
    'website-node.tsx',
];

// Handle style replacements
const REPLACEMENTS = [
    // Trigger nodes - orange handles
    {
        pattern: /className="!w-3 !h-3 !bg-orange-500 !border-2 !border-white"/g,
        replacement: 'className={`${HANDLE_STYLES.TRIGGER_SOURCE} ${HANDLE_POSITIONS.CENTER}`}',
        nodeTypes: ['trigger'],
    },

    // Small default handles (w-2.5 h-2.5)
    {
        pattern: /className="w-2\.5 h-2\.5"/g,
        replacement: 'className={`${HANDLE_STYLES.DEFAULT_SOURCE} ${HANDLE_POSITIONS.CENTER}`}',
        nodeTypes: ['all'],
    },

    // Medium default handles (w-3 h-3)
    {
        pattern: /className="w-3 h-3"/g,
        replacement: 'className={`${HANDLE_STYLES.DEFAULT_SOURCE} ${HANDLE_POSITIONS.CENTER}`}',
        nodeTypes: ['all'],
    },
];

// Import statement to add
const IMPORT_STATEMENT = "import { HANDLE_STYLES, HANDLE_POSITIONS } from './node-handle-styles';";
const TRIGGER_IMPORT_STATEMENT = "import { HANDLE_STYLES, HANDLE_POSITIONS } from '../node-handle-styles';";

function updateNodeFile(filePath) {
    const relativePath = path.relative(NODES_DIR, filePath);

    // Skip already updated files
    if (UPDATED_FILES.includes(relativePath.replace(/\\/g, '/'))) {
        console.log(`Skipping ${relativePath} (already updated)`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Check if file has Handle components
    if (!content.includes('<Handle')) {
        return;
    }

    console.log(`Processing ${relativePath}...`);

    // Add import if not present
    const isTriggerNode = filePath.includes('triggers/');
    const importToAdd = isTriggerNode ? TRIGGER_IMPORT_STATEMENT : IMPORT_STATEMENT;

    if (!content.includes('HANDLE_STYLES')) {
        // Find the last import statement
        const importRegex = /import .+ from .+;/g;
        const imports = content.match(importRegex);
        if (imports && imports.length > 0) {
            const lastImport = imports[imports.length - 1];
            content = content.replace(lastImport, `${lastImport}\n${importToAdd}`);
            modified = true;
        }
    }

    // Apply replacements
    for (const { pattern, replacement, nodeTypes } of REPLACEMENTS) {
        if (nodeTypes.includes('all') || (nodeTypes.includes('trigger') && isTriggerNode)) {
            if (pattern.test(content)) {
                content = content.replace(pattern, replacement);
                modified = true;
            }
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✓ Updated ${relativePath}`);
    }
}

function walkDirectory(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            walkDirectory(filePath);
        } else if (file.endsWith('.tsx') && file.includes('node')) {
            updateNodeFile(filePath);
        }
    }
}

console.log('Starting batch update of node handles...\n');
walkDirectory(NODES_DIR);
console.log('\n✓ Batch update complete!');
