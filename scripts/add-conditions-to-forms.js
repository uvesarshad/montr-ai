const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/forms/extensions.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace all instances of "required: { default: false }," with the version that includes conditions
// But only if "conditions:" doesn't already exist on the next line
const lines = content.split('\n');
const newLines = [];

for (let i = 0; i < lines.length; i++) {
    newLines.push(lines[i]);

    // Check if this line contains "required: { default: false },"
    if (lines[i].trim() === 'required: { default: false },') {
        // Check if the next line already has "conditions:"
        const nextLine = lines[i + 1] || '';
        if (!nextLine.includes('conditions:')) {
            // Add conditions line with same indentation
            const indent = lines[i].match(/^\s*/)[0];
            newLines.push(`${indent}conditions: { default: [] },`);
        }
    }
}

content = newLines.join('\n');
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Added conditions attribute to all form nodes');
